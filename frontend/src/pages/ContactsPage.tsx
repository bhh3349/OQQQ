/* ============================================================
   联系人页（文档 §06/§07）：好友 | 群聊 分栏
   Agent 安装/更新/卸载/设置只在这里（硬规则）。
   搜索 → 安装状态分组（可折叠）→ 右侧详情。
   ============================================================ */
import { useMemo, useState } from 'react';
import type { AgentContact, AgentEngineDescriptor } from '../types/model';
import { Icon } from '../components/icons/Icons';
import { Avatar, Pill, StatusDot } from '../components/ui/Primitives';
import { useClient, useSnapshot } from '../store/useOqqq';
import { navigate } from '../store/nav';

const STATUS_TONE = {
  online: { tone: 'ok', label: '在线' }, busy: { tone: 'warn', label: '忙碌' },
  offline: { tone: 'idle', label: '离线' }, error: { tone: 'bad', label: '异常' },
} as const;

function StatusMark({ status }: { status: AgentContact['status'] }) {
  const m = STATUS_TONE[status];
  return <StatusDot tone={m.tone} label={m.label} />;
}

export function ContactsPage() {
  const s = useSnapshot();
  const [tab, setTab] = useState<'friends' | 'groups'>('friends');
  const [kw, setKw] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const installedIds = useMemo(
    () => new Set(s.engines.filter(e => e.installState.status === 'installed').map(e => e.id)),
    [s.engines],
  );

  const hits = useMemo(() => {
    const k = kw.trim().toLowerCase();
    return s.contacts.filter(c =>
      c.id !== 'bo' && (!k || c.displayName.toLowerCase().includes(k) || c.engineId.toLowerCase().includes(k)));
  }, [s.contacts, kw]);

  const installedAgents = hits.filter(c => installedIds.has(c.engineId));
  const missingAgents = hits.filter(c => !installedIds.has(c.engineId));
  const groups = s.conversations.filter(c => c.kind === 'group');

  const detail = selected ? s.contacts.find(c => c.id === selected) : null;
  const detailEngine = detail ? s.engines.find(e => e.id === detail.engineId) : null;
  const detailConv = detail
    ? s.conversations.find(c => c.kind === 'direct' && c.memberIds.includes(detail.id))
    : undefined;

  return (
    <div className="pagehost contactspage">
      <aside className="contacts" aria-label="联系人">
        <div className="contacts__bar">
          <label className="input input--search">
            <Icon name="search" size={14} />
            <input value={kw} onChange={e => setKw(e.target.value)} placeholder="搜索 Agent / 引擎" aria-label="搜索联系人" />
          </label>
          <button className="iconbtn" title="添加 Agent" aria-label="添加 Agent（从引擎目录）"
            onClick={() => { setSelected(null); setTab('friends'); }}>
            <Icon name="plus" size={16} />
          </button>
        </div>

        <div className="seg" role="radiogroup" aria-label="联系人类型">
          <button role="radio" aria-checked={tab === 'friends'} className="seg__btn" data-active={tab === 'friends'} onClick={() => setTab('friends')}>
            好友 {s.contacts.filter(c => c.id !== 'bo').length}
          </button>
          <button role="radio" aria-checked={tab === 'groups'} className="seg__btn" data-active={tab === 'groups'} onClick={() => setTab('groups')}>
            群聊 {groups.length}
          </button>
        </div>

        {tab === 'friends' && (
          <div className="contacts__list" role="list">
            <GroupHead
              label="已安装" count={installedAgents.length} open={!collapsed.installed}
              onToggle={() => setCollapsed(p => ({ ...p, installed: !p.installed }))}
            />
            {!collapsed.installed && installedAgents.map(c =>
              <AgentRow key={c.id} contact={c} active={selected === c.id} onSelect={setSelected} />)}
            <GroupHead
              label="未安装" count={missingAgents.length} open={!collapsed.missing}
              onToggle={() => setCollapsed(p => ({ ...p, missing: !p.missing }))}
            />
            {!collapsed.missing && missingAgents.map(c =>
              <AgentRow key={c.id} contact={c} active={selected === c.id} onSelect={setSelected} />)}
            {hits.length === 0 && <p className="empty__hint">没有匹配的 Agent</p>}
          </div>
        )}

        {tab === 'groups' && (
          <div className="contacts__list" role="list">
            {groups.length === 0 && <p className="empty__hint">还没有群聊，去消息页创建。</p>}
            {groups.map(c => (
              <button key={c.id} className="contacts__row" data-active={selected === c.id}
                role="listitem" onClick={() => setSelected(c.id)}>
                <Avatar ref={c.avatar} size={32} radius="card" />
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span className="contacts__name" style={{ display: 'block' }}>{c.title}</span>
                  <span className="contacts__sub">{c.memberIds.length} 人{c.readOnly ? ' · 已归档' : ''}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </aside>

      <section className="contactdetail" aria-label="详情">
        {!detail && tab === 'friends' && <EngineCatalog />}
        {!detail && tab === 'groups' && (
          <p className="empty__hint" style={{ margin: 'auto' }}>选择左侧群聊查看详情。</p>
        )}
        {detail && detailEngine && tab === 'friends' && (
          <AgentDetail contact={detail} engine={detailEngine} convId={detailConv?.id} />
        )}
        {detail && tab === 'groups' && <GroupDetail groupId={selected!} />}
      </section>
    </div>
  );
}

function GroupHead({ label, count, open, onToggle }: {
  label: string; count: number; open: boolean; onToggle: () => void;
}) {
  return (
    <button className="contacts__grouphead" aria-expanded={open} onClick={onToggle}>
      <Icon name={open ? 'chevronDown' : 'chevronRight'} size={13} />
      <span className="spacer">{label}</span>
      <span className="tnum">{count}</span>
    </button>
  );
}

function AgentRow({ contact, active, onSelect }: {
  contact: AgentContact; active: boolean; onSelect: (id: string) => void;
}) {
  return (
    <button className="contacts__row" data-active={active} role="listitem" onClick={() => onSelect(contact.id)}>
      <Avatar ref={contact.avatar} size={32} />
      <span style={{ minWidth: 0, flex: 1 }}>
        <span className="contacts__name" style={{ display: 'block' }}>
          {contact.displayName}
          {contact.onboarding === 'pending' && <Pill tone="warn">准备中</Pill>}
        </span>
        <span className="contacts__sub mono">{contact.engineId}{contact.model ? ` · ${contact.model}` : ''}</span>
      </span>
      <StatusMark status={contact.status} />
    </button>
  );
}

/* ---------- 未选中时的引擎目录：安装/更新入口（文档 §07 只在此页） ---------- */
function EngineCatalog() {
  const s = useSnapshot();
  const client = useClient();
  return (
    <div className="agentdetail">
      <h3 style={{ marginBottom: 4 }}>引擎目录</h3>
      <p className="field__hint" style={{ marginBottom: 12 }}>
        选择左侧 Agent 看详情；或在这里安装引擎。安装完成会自动生成对应好友。
      </p>
      {s.engines.map(e => {
        const st = e.installState;
        return (
          <div className="member" key={e.id}>
            <span className="msg-file__ic" style={{ width: 30, height: 30 }}><Icon name="engine" size={15} /></span>
            <span style={{ minWidth: 0, flex: 1 }}>
              <span className="member__name">{e.name}{e.version && <span className="mono" style={{ fontWeight: 400, color: 'var(--text-tertiary)' }}> v{e.version}</span>}</span>
              <span className="member__sub">{e.features.join(' · ') || '本地引擎'}</span>
            </span>
            <span className="member__role">
              {st.status === 'not_installed' && (
                <button className="btn btn--sm btn--primary" onClick={() => void client.installEngine(e.id)}>安装</button>
              )}
              {st.status === 'installing' && <Pill tone="info">{st.progress ?? 0}% {st.stage}</Pill>}
              {st.status === 'failed' && (
                <button className="btn btn--sm btn--danger" title={st.error} onClick={() => void client.installEngine(e.id)}>
                  失败 · 重试
                </button>
              )}
              {st.status === 'installed' && (
                st.updateAvailable
                  ? <button className="btn btn--sm" onClick={() => void client.updateEngine(e.id)}>更新 v{st.updateAvailable}</button>
                  : <Pill tone="ok">已安装</Pill>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Agent 详情：设置/更新/诊断/卸载 只在这里 ---------- */
function AgentDetail({
  contact, engine, convId,
}: { contact: AgentContact; engine: AgentEngineDescriptor; convId?: string }) {
  const s = useSnapshot();
  const client = useClient();
  const st = engine.installState;
  const inUse = s.conversations.some(c => c.memberIds.includes(contact.id) && !c.readOnly);

  return (
    <div className="agentdetail">
      <div className="agentdetail__head">
        <Avatar ref={contact.avatar} size={56} />
        <div>
          <h3>{contact.displayName}</h3>
          <p className="contacts__sub mono">{engine.name}{engine.version && ` · v${engine.version}`}</p>
        </div>
        <span className="spacer" />
        <Pill tone={st.status === 'installed' ? 'ok' : st.status === 'installing' ? 'info' : st.status === 'failed' ? 'bad' : 'muted'}>
          {st.status === 'installed' ? '已安装' : st.status === 'installing' ? `安装中 ${st.progress ?? 0}%`
            : st.status === 'failed' ? '安装失败' : '未安装'}
        </Pill>
      </div>

      {st.status === 'installing' && (
        <div className="arch-prog" role="progressbar" aria-valuenow={st.progress ?? 0} aria-valuemin={0} aria-valuemax={100}>
          <div className="arch-prog__bar" style={{ width: `${st.progress ?? 0}%` }} />
        </div>
      )}
      {st.status === 'failed' && (
        <div className="mkt-alert" role="alert">
          <b>安装失败：</b>{st.error}
          <button className="btn btn--sm" style={{ marginLeft: 8 }} onClick={() => void client.installEngine(engine.id)}>重试</button>
        </div>
      )}

      <div className="kv">
        <span className="kv__k">运行状态</span><span className="kv__v"><StatusMark status={contact.status} /></span>
        <span className="kv__k">当前模型</span><span className="kv__v">{contact.model ?? '未配置'}</span>
        <span className="kv__k">绑定能力</span><span className="kv__v">{contact.capabilityIds.length ? `${contact.capabilityIds.length} 项` : '无'}</span>
        <span className="kv__k">会话</span><span className="kv__v">{convId ? '已有单聊' : '未发起'}</span>
      </div>

      <div className="agentdetail__actions">
        <button className="btn btn--sm btn--primary" disabled={!convId}
          onClick={() => convId && navigate({ page: 'messages', conversationId: convId })}>
          打开聊天
        </button>
        <button className="btn btn--sm" disabled={st.status !== 'installed'} onClick={() => void client.updateEngine(engine.id)}>检查更新</button>
        <button
          className="btn btn--sm btn--danger"
          disabled={st.status !== 'installed' || inUse}
          title={inUse ? '该 Agent 正在被会话使用，先归档或移出' : undefined}
          onClick={() => void client.uninstallEngine(engine.id)}
        >卸载</button>
      </div>
      {inUse && <p className="field__hint">Agent 正在被进行中的会话使用，卸载被阻止（文档 §07）。</p>}
    </div>
  );
}

/* ---------- 群聊详情 ---------- */
function GroupDetail({ groupId }: { groupId: string }) {
  const s = useSnapshot();
  const c = s.conversations.find(x => x.id === groupId);
  if (!c) return null;
  const announce = s.announcements[groupId];
  return (
    <div className="agentdetail">
      <div className="agentdetail__head">
        <Avatar ref={c.avatar} size={56} radius="card" />
        <div>
          <h3>{c.title}</h3>
          <p className="contacts__sub">
            {c.memberIds.length} 人 · {c.workspacePath ? <>工作区 <span className="mono">{c.workspacePath}</span></> : '未挂载工作区'}
          </p>
        </div>
        <span className="spacer" />
        {c.readOnly && <Pill tone="warn">已归档</Pill>}
      </div>
      <div className="kv">
        <span className="kv__k">公告版本</span><span className="kv__v tnum">第 {announce?.versions[0]?.rev ?? 1} 版</span>
        <span className="kv__k">消息</span><span className="kv__v tnum">{(s.messages[groupId] ?? []).length} 条</span>
        <span className="kv__k">权限</span><span className="kv__v">成员写入需审批（文档 §16）</span>
      </div>
      <div className="agentdetail__actions">
        <button className="btn btn--sm btn--primary" onClick={() => navigate({ page: 'messages', conversationId: c.id })}>
          进入群聊
        </button>
      </div>
    </div>
  );
}
