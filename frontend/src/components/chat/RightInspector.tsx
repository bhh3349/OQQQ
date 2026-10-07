/* ============================================================
   群侧栏（文档 §05 第 4 区）：公告 / 成员 / 文件 三 Tab
   单聊时由 Agent 资料抽屉替代（见 InspectorFor 分支）。
   ============================================================ */
import { useEffect, useMemo, useState } from 'react';
import type { AgentContact, Conversation } from '../../types/model';
import { Icon } from '../icons/Icons';
import { Avatar, Pill } from '../ui/Primitives';
import { useClient, useSnapshot } from '../../store/useOqqq';

export type InspectorTab = 'announce' | 'members' | 'files';

export function RightInspector({
  conversation, tab, onTab, onJumpMessage,
}: {
  conversation: Conversation;
  tab: InspectorTab; onTab: (t: InspectorTab) => void;
  onJumpMessage?: (id: string) => void;
}) {
  return (
    <aside className="inspector" aria-label="群信息">
      <div className="inspector__tabs" role="tablist">
        {([
          ['announce', '群公告'], ['members', `群成员`], ['files', '群文件'],
        ] as [InspectorTab, string][]).map(([id, label]) => (
          <button
            key={id} role="tab" className="inspector__tab"
            aria-selected={tab === id} onClick={() => onTab(id)}
          >{label}</button>
        ))}
      </div>
      <div className="inspector__body" role="tabpanel">
        {tab === 'announce' && <AnnouncePane conversation={conversation} />}
        {tab === 'members' && <MembersPane conversation={conversation} />}
        {tab === 'files' && <FilesPane conversation={conversation} onJumpMessage={onJumpMessage} />}
      </div>
    </aside>
  );
}

/* ---------------- 公告：长期记忆 + 版本记录（文档 §12） ---------------- */
function AnnouncePane({ conversation }: { conversation: Conversation }) {
  const s = useSnapshot();
  const client = useClient();
  const a = s.announcements[conversation.id];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(a?.text ?? '');
  const [showHist, setShowHist] = useState(false);

  useEffect(() => { setDraft(a?.text ?? ''); }, [a?.text]);

  if (!a && !editing) {
    return (
      <div className="inspector__sec">
        <p className="empty__hint" style={{ textAlign: 'left' }}>还没有群公告。公告承载记忆、约束与开发守则，新成员入群会先读它。</p>
        <button className="btn btn--sm" onClick={() => setEditing(true)}>撰写公告</button>
      </div>
    );
  }

  return (
    <div className="inspector__sec">
      <h4>
        技术约束与开发公约
        <span className="spacer" />
        {!editing && (
          <button className="iconbtn" aria-label="编辑公告" title="编辑公告（群主与 PM 可编辑）" onClick={() => setEditing(true)}>
            <Icon name="edit" size={13} />
          </button>
        )}
      </h4>
      {editing ? (
        <>
          <textarea className="input textarea" value={draft} onChange={e => setDraft(e.target.value)} aria-label="公告内容" />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <span style={{ flex: 1 }} />
            <button className="btn btn--sm" onClick={() => { setEditing(false); setDraft(a?.text ?? ''); }}>放弃</button>
            <button
              className="btn btn--sm btn--primary"
              onClick={() => { void client.updateAnnouncement(conversation.id, draft); setEditing(false); }}
            >保存新版本</button>
          </div>
        </>
      ) : (
        <>
          <div className="announce">
            {a.text}
            <div className="announce__foot">
              <span>第 {a.versions[0]?.rev ?? 1} 版 · {a.updatedBy} 更新</span>
              <span className="spacer" style={{ flex: 1 }} />
              {a.versions.length > 1 && (
                <button className="btn btn--ghost btn--sm" aria-expanded={showHist} onClick={() => setShowHist(v => !v)}>
                  {showHist ? '收起历史' : `历史 ${a.versions.length} 版`}
                </button>
              )}
            </div>
            {showHist && a.versions.slice(1).map(v => (
              <div key={v.rev} className="announce__foot" style={{ display: 'block' }}>
                第 {v.rev} 版 · {v.editor} · {new Date(v.editedAt).toLocaleDateString('zh-CN')}
                <div style={{ color: 'var(--text-tertiary)', whiteSpace: 'pre-wrap', marginTop: 2 }}>{v.text}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------- 成员：角色 / 状态 / 准备中（文档 §09） ---------------- */
const ROLE_TEXT = { owner: '群主', admin: '管理员', member: '成员' } as const;

function MembersPane({ conversation, compact }: { conversation: Conversation; compact?: boolean }) {
  const s = useSnapshot();
  const members = conversation.memberIds.map(id => {
    if (id === 'bo') {
      return {
        id, displayName: 'Bo（你）', status: 'online' as const, engineId: '',
        avatar: { kind: 'initials' as const, value: 'Bo', tint: '#E39B12' },
        role: conversation.kind === 'group' ? 'owner' as const : undefined,
        onboarding: 'ready' as const, capabilityIds: [],
      } satisfies AgentContact & { role?: 'owner' };
    }
    const c = s.contacts.find(x => x.id === id);
    return c ?? null;
  }).filter(Boolean) as (AgentContact & { role?: 'owner' | 'admin' | 'member' })[];

  return (
    <div className="inspector__sec">
      <h4>群成员 {members.length}</h4>
      {members.map(m => (
        <div className="member" key={m.id}>
          <Avatar ref={m.avatar} size={compact ? 28 : 34} />
          <span style={{ minWidth: 0 }}>
            <span className="member__name">
              {m.displayName}
              {m.onboarding === 'pending' && <Pill tone="warn">准备中</Pill>}
            </span>
            {!compact && (
              <span className="member__sub mono">
                {m.engineId ? `${m.engineId}${m.model ? ` · ${m.model}` : ''}` : '用户'}
              </span>
            )}
          </span>
          <span className="member__role">
            {m.role && <Pill tone={m.role === 'owner' ? 'info' : m.role === 'admin' ? 'ok' : 'muted'}>{ROLE_TEXT[m.role]}</Pill>}
          </span>
          <StatusMark status={m.status} />
        </div>
      ))}
      <p className="field__hint" style={{ marginTop: 6 }}>
        总结是系统机器人，不算业务 Agent；外部授权与高风险能力启用需你确认。
      </p>
    </div>
  );
}

function StatusMark({ status }: { status: AgentContact['status'] }) {
  const map = {
    online: { tone: 'ok', text: '在线' }, busy: { tone: 'warn', text: '忙碌' },
    offline: { tone: 'idle', text: '离线' }, error: { tone: 'bad', text: '异常' },
  } as const;
  const m = map[status];
  return <Pill tone={m.tone === 'idle' ? 'muted' : m.tone}>{m.text}</Pill>;
}

/* ---------------- 文件：从消息流 file_event 聚合，可跳回关联消息 ---------------- */
function FilesPane({
  conversation, onJumpMessage,
}: { conversation: Conversation; onJumpMessage?: (id: string) => void }) {
  const s = useSnapshot();
  const files = useMemo(() => {
    const out: { name: string; path: string; op: string; at: number; msgId: string; size?: number }[] = [];
    for (const m of s.messages[conversation.id] ?? []) {
      if (m.kind === 'file_event' && m.fileEvent) {
        out.push({
          name: m.fileEvent.name, path: m.fileEvent.path, op: m.fileEvent.op,
          at: m.createdAt, msgId: m.id, size: m.fileEvent.size,
        });
      }
    }
    return out.reverse();
  }, [s.messages, conversation.id]);

  return (
    <div className="inspector__sec">
      <h4>群文件 {files.length}</h4>
      {files.length === 0 && (
        <p className="empty__hint" style={{ textAlign: 'left' }}>
          还没有文件事件。Agent 写入或修改文件时会出现在这里，并可跳回关联消息。
        </p>
      )}
      {files.map(f => (
        <button
          key={f.msgId} className="gfile"
          onClick={() => onJumpMessage?.(f.msgId)}
          title={`跳回关联消息 · ${f.path}`}
        >
          <Icon name={f.op === 'deleted' ? 'trash' : 'file'} size={14} />
          <span style={{ minWidth: 0 }}>
            <span className="gfile__name" style={{ display: 'block' }}>{f.name}</span>
            <span className="gfile__path">{f.path}</span>
          </span>
          <span className="gfile__meta tnum">
            {f.op === 'created' ? '新建' : f.op === 'modified' ? '修改' : '删除'}
          </span>
        </button>
      ))}
      {conversation.workspacePath && (
        <p className="field__hint" style={{ marginTop: 6 }}>
          工作区 <span className="mono">{conversation.workspacePath}</span>；
          完整目录请打开「工作区」页。
        </p>
      )}
    </div>
  );
}

/* ---------------- 单聊：Agent 资料抽屉（文档 §06） ---------------- */
export function AgentDrawer({ conversation }: { conversation: Conversation }) {
  const s = useSnapshot();
  const peerId = conversation.memberIds.find(id => id !== 'bo');
  const contact = s.contacts.find(c => c.id === peerId);
  const engine = s.engines.find(e => e.id === contact?.engineId);
  const caps = (contact?.capabilityIds ?? [])
    .map(id => [...s.skills, ...s.connectors].find(c => c.id === id))
    .filter(Boolean);

  if (!contact) return null;
  return (
    <aside className="inspector" aria-label="Agent 资料">
      <div className="inspector__body">
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Avatar ref={contact.avatar} size={52} />
          <div>
            <p style={{ fontWeight: 600, fontSize: 'var(--fs-15)' }}>{contact.displayName}</p>
            <p className="member__sub mono">{engine?.name ?? contact.engineId} · v{engine?.version ?? '—'}</p>
          </div>
        </div>
        <div>
          <div className="kv"><span className="kv__k">运行状态</span><span className="kv__v"><StatusMark status={contact.status} /></span></div>
          <div className="kv"><span className="kv__k">当前模型</span><span className="kv__v">{contact.model ?? '未配置'}</span></div>
          <div className="kv"><span className="kv__k">工作目录</span><span className="kv__v mono">{conversation.workspacePath ?? '—'}</span></div>
          <div className="kv"><span className="kv__k">权限</span><span className="kv__v">只读工作区；写入需审批</span></div>
        </div>
        <div className="inspector__sec">
          <h4>能力</h4>
          {caps.length === 0 && <p className="empty__hint" style={{ textAlign: 'left' }}>未绑定技能或连接器</p>}
          {caps.map(c => c && (
            <div className="member" key={c.id}>
              <span className="msg-file__ic" style={{ width: 26, height: 26 }}>
                <Icon name={c.kind === 'skill' ? 'skills' : 'connectors'} size={13} />
              </span>
              <span style={{ minWidth: 0 }}>
                <span className="member__name">{c.name}</span>
                <span className="member__sub mono">v{c.version}</span>
              </span>
              <span className="member__role"><Pill tone={c.installState.status === 'installed' ? 'ok' : 'muted'}>
                {c.installState.status === 'installed' ? '已绑定' : '未安装'}
              </Pill></span>
            </div>
          ))}
        </div>
        <p className="field__hint">会话重置将清空本单聊上下文，历史消息保留在本地。</p>
      </div>
    </aside>
  );
}
