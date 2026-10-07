/* ============================================================
   总工作区视图（设计文档 §12）
   语义：聚合所有群聊与单聊的独立工作区。文件写入、覆盖与删除的
   审计（发起者 / 目标路径 / 审批状态）在节点详情侧栏核对；
   聊天中的 file_event 只是通知，不等于文件操作本身。
   注：useClient 未暴露工作区方法，按 store 层承诺直接取单例
   （切换真实后端只改 store/instance.ts，页面零改动）。
   ============================================================ */
import {
  useEffect, useMemo, useRef, useState,
  type CSSProperties, type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { client } from '../store/instance';
import { useSnapshot } from '../store/useOqqq';
import { Avatar, EmptyState, Pill, formatBytes, formatTime } from '../components/ui/Primitives';
import { Icon } from '../components/icons/Icons';
import type { Conversation, FileEventPayload, WorkspaceNode } from '../types/model';

type ChangeKind = NonNullable<WorkspaceNode['change']>;
type ApprovalState = NonNullable<FileEventPayload['op']> extends never ? never :
  'not_required' | 'pending' | 'approved' | 'denied';

const CHANGE_META: Record<ChangeKind, { label: string; tone: 'ok' | 'warn' | 'bad' }> = {
  created: { label: '新增', tone: 'ok' },
  modified: { label: '已修改', tone: 'warn' },
  deleted: { label: '已删除', tone: 'bad' },
};

const APPROVAL_META: Record<ApprovalState, string> = {
  not_required: '无需审批',
  pending: '待审批',
  approved: '已批准',
  denied: '已拒绝',
};

const APPROVAL_TONE: Record<ApprovalState, 'ok' | 'warn' | 'bad' | 'muted'> = {
  not_required: 'muted',
  pending: 'warn',
  approved: 'ok',
  denied: 'bad',
};

const OP_VERB: Record<FileEventPayload['op'], string> = {
  created: '创建',
  modified: '覆盖写入',
  deleted: '删除',
};

type FlatRow = { node: WorkspaceNode; depth: number; parentId: string | null; hint?: 'loading' | 'empty' };

/* 命中节点保留祖先链；q 为空时原样返回 */
function filterTree(nodes: WorkspaceNode[], q: string): WorkspaceNode[] {
  if (!q) return nodes;
  const lower = q.toLowerCase();
  const walk = (list: WorkspaceNode[]): WorkspaceNode[] => {
    const out: WorkspaceNode[] = [];
    for (const n of list) {
      const kids = n.children ? walk(n.children) : undefined;
      const selfMatch = n.name.toLowerCase().includes(lower) || n.path.toLowerCase().includes(lower);
      if (selfMatch || (kids && kids.length > 0)) {
        out.push(kids ? { ...n, children: kids } : n);
      }
    }
    return out;
  };
  return walk(nodes);
}

/* 平铺可见行；搜索时全部展开；展开且无 children 的目录追加懒加载提示行 */
function flatten(root: WorkspaceNode, expanded: Set<string>, forceOpen: boolean,
  dirHint: (id: string) => 'loading' | 'empty' | null): FlatRow[] {
  const rows: FlatRow[] = [];
  const walk = (node: WorkspaceNode, depth: number, parentId: string | null) => {
    rows.push({ node, depth, parentId });
    if (node.type !== 'dir') return;
    if (!(forceOpen || expanded.has(node.id))) return;
    if (!node.children) {
      const hint = dirHint(node.id);
      if (hint) rows.push({ node, depth: depth + 1, parentId: node.id, hint });
      return;
    }
    for (const c of node.children) walk(c, depth + 1, node.id);
  };
  walk(root, 0, null);
  return rows;
}

function countFiles(node: WorkspaceNode): number {
  if (node.type === 'file') return 1;
  return (node.children ?? []).reduce((acc, c) => acc + countFiles(c), 0);
}

function countChanges(node: WorkspaceNode): number {
  let n = node.change ? 1 : 0;
  for (const c of node.children ?? []) n += countChanges(c);
  return n;
}

function ChangeMark({ change }: { change: ChangeKind }) {
  const meta = CHANGE_META[change];
  return (
    <span className={`ws-mark ws-mark--${meta.tone}`}>
      <span className="ws-mark__dot" aria-hidden />
      {meta.label}
    </span>
  );
}

function TreeRow({ row, activeId, selectedId, expanded, q, firstFocusableId,
  onRowClick, onChevron, onKeyDown, registerRow }: {
    row: FlatRow;
    activeId: string | null;
    selectedId: string | null;
    expanded: Set<string>;
    q: string;
    firstFocusableId: string | null;
    onRowClick: (row: FlatRow) => void;
    onChevron: (e: ReactMouseEvent, node: WorkspaceNode) => void;
    onKeyDown: (e: ReactKeyboardEvent<HTMLDivElement>, row: FlatRow) => void;
    registerRow: (id: string, el: HTMLDivElement | null) => void;
  }) {
  const { node, depth, hint } = row;
  if (hint) {
    return (
      <div
        role="treeitem" aria-disabled={true} aria-selected={false}
        className="ws-row ws-row--hint"
        style={{ paddingLeft: depth * 16 + 8 } as CSSProperties}
      >
        <span className="ws-row__tw" aria-hidden />
        <span>{hint === 'loading' ? '加载中…' : '空目录'}</span>
      </div>
    );
  }
  const isDir = node.type === 'dir';
  const open = q.trim() !== '' || expanded.has(node.id);
  return (
    <div
      ref={el => { registerRow(node.id, el); }}
      role="treeitem"
      aria-level={depth + 1}
      aria-selected={selectedId === node.id}
      aria-expanded={isDir ? open : undefined}
      tabIndex={(activeId ?? firstFocusableId) === node.id ? 0 : -1}
      className={`ws-row${selectedId === node.id ? ' ws-row--selected' : ''}`}
      style={{ paddingLeft: depth * 16 + 8 } as CSSProperties}
      onClick={() => onRowClick(row)}
      onKeyDown={e => onKeyDown(e, row)}
    >
      {isDir ? (
        <button type="button" className="ws-tw" tabIndex={-1} aria-hidden={true}
          onClick={e => onChevron(e, node)}>
          <Icon name={open ? 'chevronDown' : 'chevronRight'} size={14} />
        </button>
      ) : (
        <span className="ws-row__tw" aria-hidden />
      )}
      <Icon name={isDir ? 'folder' : 'file'} size={15} className="ws-row__glyph" />
      <span className="ws-row__name">{node.name}</span>
      {node.change && <ChangeMark change={node.change} />}
      <span className="ws-row__conv">{node.conversationTitle}</span>
      {node.type === 'file' && (
        <span className="ws-row__size tnum">{formatBytes(node.size ?? 0)}</span>
      )}
    </div>
  );
}

function WorkspaceGroup({ root, conv, rows, q, expanded, activeId, selectedId,
  firstFocusableId, onRowClick, onChevron, onKeyDown, registerRow }: {
    root: WorkspaceNode;
    conv?: Conversation;
    rows: FlatRow[];
    q: string;
    expanded: Set<string>;
    activeId: string | null;
    selectedId: string | null;
    firstFocusableId: string | null;
    onRowClick: (row: FlatRow) => void;
    onChevron: (e: ReactMouseEvent, node: WorkspaceNode) => void;
    onKeyDown: (e: ReactKeyboardEvent<HTMLDivElement>, row: FlatRow) => void;
    registerRow: (id: string, el: HTMLDivElement | null) => void;
  }) {
  const title = conv?.title ?? root.conversationTitle;
  const avatar = conv?.avatar;
  const tint = avatar?.kind === 'initials' ? avatar.tint : undefined;
  const changed = countChanges(root);
  return (
    <section className="ws-group">
      <div className="ws-group__head">
        <span className="ws-group__bar" style={{ background: tint ?? 'var(--blue-500)' } as CSSProperties} aria-hidden />
        <Avatar ref={avatar} size={28} />
        <div className="ws-group__meta">
          <span className="ws-group__name">{title}</span>
          <span className="ws-group__path mono">{root.path}</span>
        </div>
        <span className="ws-group__count tnum">
          {countFiles(root)} 个文件{changed > 0 ? ` · ${changed} 处变更` : ''}
        </span>
      </div>
      <div className="ws-tree" role="tree" aria-label={`${title} 的工作区文件`}>
        {rows.map(row => (
          <TreeRow
            key={`${row.node.id}:${row.hint ?? 'self'}`}
            row={row} q={q} expanded={expanded} activeId={activeId} selectedId={selectedId}
            firstFocusableId={firstFocusableId}
            onRowClick={onRowClick} onChevron={onChevron} onKeyDown={onKeyDown} registerRow={registerRow}
          />
        ))}
      </div>
    </section>
  );
}

export function WorkspacePage() {
  const snapshot = useSnapshot();
  const { workspace, conversations, messages, settings } = snapshot;

  const [scope, setScope] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [loadingDirs, setLoadingDirs] = useState<Set<string>>(() => new Set());
  const [emptyDirs, setEmptyDirs] = useState<Set<string>>(() => new Set());
  const [refreshing, setRefreshing] = useState(false);

  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const registerRow = (id: string, el: HTMLDivElement | null) => {
    if (el) rowRefs.current.set(id, el);
    else rowRefs.current.delete(id);
  };

  useEffect(() => { void client.loadWorkspace(); }, []);

  const q = query.trim();
  const scopedRoots = useMemo(
    () => workspace.filter(n => scope === 'all' || n.conversationId === scope),
    [workspace, scope],
  );
  const convById = useMemo(() => new Map(conversations.map(c => [c.id, c])), [conversations]);

  const filteredRoots = useMemo(
    () => filterTree(scopedRoots, q.toLowerCase()),
    [scopedRoots, q],
  );

  const flatRows = useMemo(() => {
    const all: FlatRow[] = [];
    const dirHint = (id: string) =>
      loadingDirs.has(id) ? 'loading' as const : emptyDirs.has(id) ? 'empty' as const : null;
    for (const root of filteredRoots) {
      all.push(...flatten(root, expanded, q !== '', dirHint));
    }
    return all;
  }, [filteredRoots, expanded, q, loadingDirs, emptyDirs]);

  const focusableRows = useMemo(() => flatRows.filter(r => !r.hint), [flatRows]);
  const firstFocusableId = focusableRows[0]?.node.id ?? null;
  const focusableById = useMemo(
    () => new Map(focusableRows.map(r => [r.node.id, r])),
    [focusableRows],
  );

  const focusRow = (id: string) => {
    setActiveId(id);
    rowRefs.current.get(id)?.focus();
  };

  const select = (node: WorkspaceNode) => {
    setActiveId(node.id);
    setSelectedId(node.id);
  };

  /* 展开无 children 数据的目录：本地模拟懒加载视觉，不调不存在的 API */
  const toggleDir = (node: WorkspaceNode) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(node.id)) next.delete(node.id);
      else next.add(node.id);
      return next;
    });
    if (node.type !== 'dir' || node.children) return;
    setLoadingDirs(prev => {
      if (prev.has(node.id)) return prev;
      const next = new Set(prev);
      next.add(node.id);
      return next;
    });
    window.setTimeout(() => {
      setLoadingDirs(prev => {
        const next = new Set(prev);
        next.delete(node.id);
        return next;
      });
      setEmptyDirs(prev => {
        const next = new Set(prev);
        next.add(node.id);
        return next;
      });
    }, 450);
  };

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>, row: FlatRow) => {
    const idx = focusableRows.findIndex(r => r.node.id === row.node.id);
    const move = (target?: FlatRow) => { if (target) focusRow(target.node.id); };
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        move(focusableRows[idx + 1]);
        break;
      case 'ArrowUp':
        e.preventDefault();
        move(focusableRows[idx - 1]);
        break;
      case 'ArrowRight': {
        e.preventDefault();
        if (row.node.type !== 'dir') break;
        const open = q !== '' || expanded.has(row.node.id);
        if (!open) toggleDir(row.node);
        else move(focusableRows.find(r => r.parentId === row.node.id));
        break;
      }
      case 'ArrowLeft': {
        e.preventDefault();
        if (row.node.type === 'dir' && q === '' && expanded.has(row.node.id)) {
          setExpanded(prev => {
            const next = new Set(prev);
            next.delete(row.node.id);
            return next;
          });
        } else if (row.parentId) {
          move(focusableById.get(row.parentId));
        }
        break;
      }
      case 'Enter':
      case ' ':
        e.preventDefault();
        select(row.node);
        break;
      case 'Home':
        e.preventDefault();
        move(focusableRows[0]);
        break;
      case 'End':
        e.preventDefault();
        move(focusableRows[focusableRows.length - 1]);
        break;
    }
  };

  const onChevron = (e: ReactMouseEvent, node: WorkspaceNode) => {
    e.stopPropagation();
    setActiveId(node.id);
    toggleDir(node);
  };

  /* 审计来源：同会话 file_event 消息按精确路径匹配最新一条 */
  const selectedNode = useMemo(() => {
    if (!selectedId) return undefined;
    const find = (list: WorkspaceNode[]): WorkspaceNode | undefined => {
      for (const n of list) {
        if (n.id === selectedId) return n;
        const hit = n.children ? find(n.children) : undefined;
        if (hit) return hit;
      }
      return undefined;
    };
    return find(workspace);
  }, [workspace, selectedId]);

  const lastFileEvent = useMemo(() => {
    if (!selectedNode) return undefined;
    const list = messages[selectedNode.conversationId] ?? [];
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i];
      if (m.kind === 'file_event' && m.fileEvent && m.fileEvent.path === selectedNode.path) {
        return { at: m.createdAt, ...m.fileEvent };
      }
    }
    return undefined;
  }, [messages, selectedNode]);

  /* 无会话记录时按当前审批策略推导，显示时标注来源 */
  const approval: { state: ApprovalState; derived: boolean } = lastFileEvent
    ? { state: settings.requireApproval ? 'pending' : 'not_required', derived: true }
    : { state: settings.requireApproval ? 'pending' : 'not_required', derived: true };

  const refreshSelected = async () => {
    if (!selectedNode || refreshing) return;
    setRefreshing(true);
    try {
      await client.refreshWorkspaceNode(selectedNode.id);
    } finally {
      setRefreshing(false);
    }
  };

  const scopeScopeAll = scope === 'all';
  const selectedConv = selectedNode ? convById.get(selectedNode.conversationId) : undefined;

  return (
    <div className="ws-page">
      <header className="ws-head">
        <div>
          <h2 className="ws-title">工作区</h2>
          <p className="ws-sub">
            聚合全部会话的独立工作区。文件写入、覆盖与删除在此核对发起者、目标路径与审批状态；
            聊天里的文件通知只是消息，不是文件操作本身。
          </p>
        </div>
      </header>

      <div className="ws-toolbar">
        <div className="ws-chips" role="radiogroup" aria-label="会话范围">
          <button type="button" role="radio" aria-checked={scopeScopeAll}
            className={`ws-chip${scopeScopeAll ? ' ws-chip--on' : ''}`}
            onClick={() => setScope('all')}>
            全部会话
          </button>
          {conversations.map(c => (
            <button key={c.id} type="button" role="radio" aria-checked={scope === c.id}
              className={`ws-chip${scope === c.id ? ' ws-chip--on' : ''}`}
              onClick={() => setScope(c.id)}>
              {c.title}
            </button>
          ))}
        </div>
        <div className="ws-search">
          <Icon name="search" size={15} />
          <input
            className="ws-search__input" placeholder="按名称或路径过滤"
            value={query} onChange={e => setQuery(e.target.value)}
            aria-label="按名称或路径过滤文件"
          />
        </div>
      </div>

      <div className="ws-main">
        <div className="ws-treecol">
          {filteredRoots.length === 0 ? (
            scopeScopeAll ? (
              <EmptyState
                icon="folder" title="还没有任何工作区"
                hint="为会话指定工作区路径后，成员产出的文件会出现在这里。"
              />
            ) : q !== '' ? (
              <EmptyState
                icon="search" title="没有匹配的文件"
                hint="换个关键词，或清除过滤重新浏览。"
                action={{ label: '清除过滤', onClick: () => setQuery('') }}
              />
            ) : (
              <EmptyState
                icon="folder" title="该会话还没有工作区"
                hint="在会话设置中指定工作区路径；指定后成员产出的文件会出现在这里。"
              />
            )
          ) : (
            filteredRoots.map(root => (
              <WorkspaceGroup
                key={root.id}
                root={root} conv={convById.get(root.conversationId)} rows={flatRows.filter(r => r.node.id === root.id || r.parentId === root.id)}
                q={q} expanded={expanded} activeId={activeId} selectedId={selectedId}
                firstFocusableId={firstFocusableId}
                onRowClick={row => select(row.node)}
                onChevron={onChevron}
                onKeyDown={handleKeyDown}
                registerRow={registerRow}
              />
            ))
          )}
        </div>

        <aside className="ws-inspector" aria-label="节点详情">
          {selectedNode ? (
            <>
              <div className="ws-insp__head">
                <Icon name={selectedNode.type === 'dir' ? 'folder' : 'file'} size={18} />
                <h3 className="ws-insp__name">{selectedNode.name}</h3>
                <Pill tone="muted">{selectedNode.type === 'dir' ? '目录' : '文件'}</Pill>
              </div>

              <section className="ws-insp__sec">
                <h4 className="ws-insp__label">最近文件操作</h4>
                {lastFileEvent ? (
                  <>
                    <div className="kv">
                      <span className="kv__k">发起者</span>
                      <span className="kv__v">{lastFileEvent.initiatorName}</span>
                    </div>
                    <div className="kv">
                      <span className="kv__k">操作</span>
                      <span className="kv__v">{OP_VERB[lastFileEvent.op]}</span>
                    </div>
                    <div className="kv">
                      <span className="kv__k">目标路径</span>
                      <span className="kv__v mono">{lastFileEvent.path}</span>
                    </div>
                    <div className="kv">
                      <span className="kv__k">审批状态</span>
                      <span className="kv__v">
                        <Pill tone={APPROVAL_TONE[approval.state]}>{APPROVAL_META[approval.state]}</Pill>
                        {approval.derived && <span className="ws-insp__note">按当前策略推导</span>}
                      </span>
                    </div>
                    <div className="kv">
                      <span className="kv__k">发生时间</span>
                      <span className="kv__v tnum">{formatTime(lastFileEvent.at)}</span>
                    </div>
                  </>
                ) : (
                  <p className="ws-insp__empty">
                    该节点暂无写入记录。聊天里的文件通知只是消息，不是文件操作本身；
                    实际写入以这里记录的发起者、目标路径与审批状态为准。
                  </p>
                )}
              </section>

              <section className="ws-insp__sec">
                <h4 className="ws-insp__label">节点信息</h4>
                <div className="kv">
                  <span className="kv__k">所属会话</span>
                  <span className="kv__v">{selectedConv?.title ?? selectedNode.conversationTitle}</span>
                </div>
                <div className="kv">
                  <span className="kv__k">完整路径</span>
                  <span className="kv__v mono">{selectedNode.path}</span>
                </div>
                {selectedNode.type === 'file' && (
                  <div className="kv">
                    <span className="kv__k">大小</span>
                    <span className="kv__v tnum">{formatBytes(selectedNode.size ?? 0)}</span>
                  </div>
                )}
                {selectedNode.change && (
                  <div className="kv">
                    <span className="kv__k">变更标记</span>
                    <span className="kv__v"><ChangeMark change={selectedNode.change} /></span>
                  </div>
                )}
              </section>

              <div className="ws-insp__actions">
                <button type="button" className="btn" onClick={refreshSelected} disabled={refreshing}>
                  <Icon name="refresh" size={15} />
                  {refreshing ? '刷新中…' : '刷新该节点'}
                </button>
              </div>
            </>
          ) : (
            <EmptyState
              icon="info" title="选择一个节点查看审计"
              hint="点击左侧文件或目录，核对最近文件操作的发起者、目标路径与审批状态。"
            />
          )}
        </aside>
      </div>
    </div>
  );
}
