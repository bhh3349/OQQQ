/* ============================================================
   消息页（文档 §05）：会话列表 | 聊天主区 | 侧栏
   群聊侧栏：公告 / 成员 / 文件；单聊侧栏：Agent 资料抽屉。
   完结项目入口只在群聊出现（§13）。PM 流程由系统消息在
   会话内推进（mockClient 已实现），页面不重复造状态机。
   ============================================================ */
import { useEffect, useState } from 'react';
import { ConversationList } from '../components/chat/ConversationList';
import { MessageTimeline } from '../components/chat/MessageTimeline';
import { Composer, type ComposerState } from '../components/chat/Composer';
import { RightInspector, AgentDrawer, type InspectorTab } from '../components/chat/RightInspector';
import { ProjectArchiveDialog } from '../components/archive/ProjectArchiveDialog';
import { Icon } from '../components/icons/Icons';
import { Avatar, Modal, Pill } from '../components/ui/Primitives';
import { useClient, useSnapshot } from '../store/useOqqq';

export function MessagesPage({ focusConversationId }: { focusConversationId?: string }) {
  const s = useSnapshot();
  const client = useClient();
  const [activeId, setActiveId] = useState('');
  const [state, setState] = useState<ComposerState>({});
  const [inspector, setInspector] = useState(true);
  const [tab, setTab] = useState<InspectorTab>('announce');
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createMode, setCreateMode] = useState<'direct' | 'group'>('direct');
  const [jumpTarget, setJumpTarget] = useState<{ msgId: string; seq: number } | null>(null);

  const conversation = s.conversations.find(c => c.id === activeId) ?? s.conversations[0];
  const isGroup = conversation?.kind === 'group';

  /* 外部跳转意图（联系人页「打开聊天」） */
  useEffect(() => {
    if (focusConversationId) setActiveId(focusConversationId);
  }, [focusConversationId]);

  /* 切会话：加载消息 + 清引用态，避免草稿/回复串台 */
  useEffect(() => {
    if (conversation) void client.loadMessages(conversation.id);
  }, [conversation?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setState({}); }, [activeId]);

  const jumpTo = (msgId: string) => {
    setJumpTarget(prev => ({ msgId, seq: (prev?.seq ?? 0) + 1 }));
  };

  if (!conversation) {
    return (
      <div className="pagehost msgspage">
        <p className="empty__hint" style={{ margin: 'auto' }}>还没有会话。点左下「+」发起会话或创建群聊。</p>
      </div>
    );
  }

  const archived = !!conversation.readOnly;
  const onlineCount = conversation.memberIds.filter(id =>
    id === 'bo' || s.contacts.find(c => c.id === id)?.status === 'online',
  ).length;
  const installed = s.engines.filter(e => e.installState.status === 'installed').length;

  return (
    <div className="pagehost msgspage">
      <ConversationList
        activeId={conversation.id} onSelect={setActiveId}
        onCreate={(kind) => { setCreateMode(kind); setCreateOpen(true); }}
      />

      <section className="chat" aria-label={conversation.title}>
        <header className="chat__head">
          <div style={{ minWidth: 0 }}>
            <h2 className="chat__title">
              {conversation.title}
              {isGroup
                ? <Pill tone="muted">{conversation.memberIds.length} 人</Pill>
                : <Pill tone="ok">Agent</Pill>}
              {archived && <Pill tone="warn">已归档</Pill>}
            </h2>
            <p className="chat__meta">
              {isGroup ? `${onlineCount} 人在线 · ` : ''}
              {conversation.workspacePath ? <>工作区 <span className="mono">{conversation.workspacePath}</span></> : '未挂载工作区'}
              {installed < s.engines.length ? <> · {installed}/{s.engines.length} 引擎在线</> : ''}
            </p>
          </div>
          <div className="chat__tools">
            {isGroup && (
              <button className="btn btn--sm" onClick={() => setArchiveOpen(true)} disabled={archived}>
                <Icon name="archive" size={13} />完结项目
              </button>
            )}
            <button className="iconbtn" title="搜索消息" aria-label="搜索消息"><Icon name="search" size={16} /></button>
            <button className="iconbtn" title={inspector ? '收起侧栏' : '展开侧栏'} aria-label="侧栏开关"
              aria-pressed={inspector} onClick={() => setInspector(v => !v)}>
              <Icon name="panel" size={16} />
            </button>
            <button className="iconbtn" title="更多" aria-label="更多操作"><Icon name="more" size={16} /></button>
          </div>
        </header>

        {archived && (
          <div className="chat__readonly">
            项目已归档：消息与文件只读；如需继续，可在归档弹窗「基于档案恢复」。
          </div>
        )}

        <MessageTimeline
          conversationId={conversation.id} jumpTo={jumpTarget}
          actions={{
            onReply: m => setState({ replyTo: m }),
            onRetry: m => void client.retry(m.id),
            onEdit: m => setState({ editing: m }),
            onApprove: (m, ok) => void client.resolveApproval(m.id, ok),
            onOpenFiles: () => { setInspector(true); setTab('files'); },
          }}
        />

        <Composer conversation={conversation} state={state} onConsumed={() => setState({})} />
      </section>

      {inspector && (isGroup
        ? <RightInspector conversation={conversation} tab={tab} onTab={setTab} onJumpMessage={jumpTo} />
        : <AgentDrawer conversation={conversation} />)}

      {archiveOpen && <ProjectArchiveDialog conversation={conversation} onClose={() => setArchiveOpen(false)} />}
      {createOpen && <CreateDialog mode={createMode} onClose={() => setCreateOpen(false)} />}
    </div>
  );
}

/* ---------- 新建会话（文档 §08）：PM 由 client.createGroup 自动指派 ---------- */
function CreateDialog({ mode: initial, onClose }: { mode: 'direct' | 'group'; onClose: () => void }) {
  const s = useSnapshot();
  const client = useClient();
  const [mode, setMode] = useState<'direct' | 'group'>(initial);
  const [peer, setPeer] = useState('');
  const [name, setName] = useState('新项目群聊');

  const installedAgents = s.contacts.filter(c =>
    c.id !== 'bo' && s.engines.find(e => e.id === c.engineId)?.installState.status === 'installed',
  );

  return (
    <Modal
      title={mode === 'direct' ? '发起会话' : '创建群聊'}
      description={mode === 'direct'
        ? '选择一个已安装引擎的 Agent；未安装的先到「联系人」页安装。'
        : '群聊自动由 PM 引擎接单，群里用 @ 指派具体 Agent。'}
      onClose={onClose} width={480}
      footer={
        <>
          <span className="spacer" />
          <button className="btn" onClick={onClose}>取消</button>
          <button
            className="btn btn--primary" disabled={mode === 'direct' ? !peer : !peer}
            onClick={() => {
              if (mode === 'direct') void client.createDirect(peer);
              else void client.createGroup({
                name, memberIds: [peer], workspacePath: '~/WorkSpace/new-project',
              });
              onClose();
            }}
          >{mode === 'direct' ? '发起会话' : '创建群聊'}</button>
        </>
      }
    >
      <div className="seg" role="radiogroup" aria-label="会话类型">
        <button role="radio" aria-checked={mode === 'direct'} className="seg__btn" onClick={() => setMode('direct')}>直接聊天</button>
        <button role="radio" aria-checked={mode === 'group'} className="seg__btn" onClick={() => setMode('group')}>群聊</button>
      </div>

      <label className="field">
        <span className="field__label">{mode === 'group' ? '群聊名称' : '选择 Agent'}</span>
        {mode === 'group' ? (
          <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="如：桌面工具重构" />
        ) : null}
      </label>

      <div className="create__list" role="listbox" aria-label={mode === 'group' ? '选择初始成员' : '选择 Agent'}>
        {installedAgents.length === 0 && <p className="empty__hint">没有已安装引擎的 Agent</p>}
        {installedAgents.map(c => (
          <button key={c.id} role="option" aria-selected={peer === c.id} data-active={peer === c.id}
            className="create__row" onClick={() => setPeer(c.id)}>
            <Avatar ref={c.avatar} size={28} />
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block' }}>{c.displayName}</span>
              <span className="member__sub mono">{c.engineId}{c.model ? ` · ${c.model}` : ''}</span>
            </span>
            {mode === 'group' && <Pill tone="muted">初始成员</Pill>}
          </button>
        ))}
      </div>
      <p className="field__hint">
        {mode === 'group'
          ? '创建后 PM 自动入群并开始确认需求；工作区路径可在会话设置里修改。'
          : '工作目录与权限在会话设置里配置；Agent 只读工作区，写入需审批。'}
      </p>
    </Modal>
  );
}
