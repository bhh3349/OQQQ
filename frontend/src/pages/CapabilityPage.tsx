/* ============================================================
   能力页：技能 / 连接器（设计文档 §11）
   两个一级入口各自独立，kind 决定取数、文案与凭据授权流。
   状态先行：安装中 / 失败 / 未安装都先于理想路径定稿。
   ============================================================ */
import { useState } from 'react';
import type { AgentContact, Capability, InstallState, PermissionSummary } from '../types/model';
import { useClient, useSnapshot } from '../store/useOqqq';
import { Avatar, EmptyState, Modal, Pill, StatusDot } from '../components/ui/Primitives';
import { Icon } from '../components/icons/Icons';

type Tone = 'info' | 'ok' | 'warn' | 'bad' | 'muted';

const RISK_TONE: Record<PermissionSummary['risk'], Tone> = {
  high: 'bad', medium: 'warn', low: 'muted',
};

const COPY = {
  skill: {
    title: '技能',
    hint: '安装后可在 Agent 详情绑定，PM 创建 Agent 时也可直接挑选。',
  },
  connector: {
    title: '连接器',
    hint: '凭据只进入安全配置流，默认遮罩，不写入日志、消息与项目档案。',
  },
} as const;

const STATUS_RANK: Record<InstallState['status'], number> = {
  installing: 0, failed: 1, installed: 2, not_installed: 3,
};

function statusMeta(st: InstallState): { tone: Tone; label: string } {
  switch (st.status) {
    case 'installed':
      return { tone: 'ok', label: st.updateAvailable ? `已安装 · 可更新 ${st.updateAvailable}` : '已安装' };
    case 'installing': return { tone: 'info', label: '安装中' };
    case 'failed': return { tone: 'bad', label: '安装失败' };
    case 'not_installed': return { tone: 'muted', label: '未安装' };
  }
}

function contactDotTone(c: AgentContact): 'ok' | 'warn' | 'bad' | 'idle' {
  if (c.status === 'online') return 'ok';
  if (c.status === 'busy') return 'warn';
  if (c.status === 'error') return 'bad';
  return 'idle';
}

/* ---------------- 卡片 ---------------- */
function CapabilityCard({
  cap, contacts, onToggle, onOpenBind, onOpenAuthFlow,
}: {
  cap: Capability;
  contacts: AgentContact[];
  onToggle: (cap: Capability, on: boolean) => void;
  onOpenBind: (id: string) => void;
  onOpenAuthFlow: (id: string) => void;
}) {
  const meta = statusMeta(cap.installState);
  const inst = cap.installState;
  const installed = inst.status === 'installed';
  const installing = inst.status === 'installing';
  const failed = inst.status === 'failed';
  const cardClass = installed || installing || failed ? 'cap-card' : 'cap-card cap-card--off';

  const bound = (cap.boundAgentIds ?? [])
    .map(id => contacts.find(c => c.id === id))
    .filter((c): c is AgentContact => Boolean(c));

  return (
    <article className={cardClass} aria-label={`${cap.name} ${meta.label}`}>
      <div className="cap-card__head">
        <h3 className="cap-card__name">{cap.name}</h3>
        {cap.version && <span className="cap-card__ver mono tnum">v{cap.version}</span>}
        <span className="cap-card__state"><Pill tone={meta.tone}>{meta.label}</Pill></span>
      </div>

      {cap.description && <p className="cap-card__desc">{cap.description}</p>}

      <div className="cap-meta">
        <span className="cap-meta__source mono">{cap.source}</span>
        <span className="cap-meta__sep" aria-hidden>·</span>
        <span>兼容 {cap.compatibleEngineIds?.length ? cap.compatibleEngineIds.join('、') : '全部引擎'}</span>
      </div>

      <div className="cap-perms">
        {cap.permissions.length === 0
          ? <span className="cap-perms__none">不申请任何权限</span>
          : cap.permissions.map(p => (
            <span key={p.id} className="cap-perms__item">
              <Pill tone={RISK_TONE[p.risk]}>{p.label}</Pill>
              {cap.kind === 'connector' && p.id.startsWith('credential.') && !installed && (
                <button type="button" className="cap-auth" onClick={() => onOpenAuthFlow(cap.id)}>
                  <Icon name="key" size={11} /> 需授权
                </button>
              )}
            </span>
          ))}
      </div>

      <div className="cap-bind">
        <span className="cap-bind__label">绑定 Agent</span>
        {installed ? (
          <>
            {bound.length === 0 && <span className="cap-bind__none">尚未绑定</span>}
            {bound.map(c => (
              <span key={c.id} className="cap-agent">
                <Avatar ref={c.avatar} size={18} radius="field" />
                {c.displayName}
              </span>
            ))}
            <button type="button" className="btn btn--sm cap-bind__edit" onClick={() => onOpenBind(cap.id)}>
              {bound.length ? '编辑绑定' : '绑定 Agent'}
            </button>
          </>
        ) : (
          <span className="cap-bind__none">安装后才能绑定 Agent</span>
        )}
      </div>

      <div className="cap-foot">
        {installing ? (
          <>
            <button type="button" className="btn" disabled>
              安装中 · {inst.stage}
            </button>
            <span className="cap-foot__pct tnum">{inst.progress}%</span>
          </>
        ) : failed ? (
          <>
            <button type="button" className="btn btn--danger" onClick={() => onToggle(cap, true)}>重试安装</button>
            <span className="cap-foot__note">{inst.stage}失败：{inst.error}</span>
          </>
        ) : installed ? (
          <>
            <button type="button" className="btn" onClick={() => onToggle(cap, false)}>卸载</button>
            <span className="cap-foot__note">卸载会同时解除全部 Agent 绑定</span>
          </>
        ) : (
          <>
            <button type="button" className="btn btn--primary" onClick={() => onToggle(cap, true)}>安装</button>
            <span className="cap-foot__note">安装完成后再绑定到 Agent</span>
          </>
        )}
      </div>

      {installing && (
        <div className="cap-prog" role="progressbar" aria-valuenow={inst.progress} aria-valuemin={0} aria-valuemax={100} aria-label="安装进度">
          <span className="cap-prog__fill" style={{ width: `${inst.progress}%` }} />
        </div>
      )}
    </article>
  );
}

/* ---------------- 绑定弹窗 ---------------- */
function BindDialog({
  cap, contacts, onClose, onSave,
}: {
  cap: Capability;
  contacts: AgentContact[];
  onClose: () => void;
  onSave: (agentIds: string[]) => void;
}) {
  const [picked, setPicked] = useState<string[]>(cap.boundAgentIds ?? []);

  const flip = (id: string, on: boolean) =>
    setPicked(prev => (on ? [...prev, id] : prev.filter(x => x !== id)));

  return (
    <Modal
      title={`绑定 Agent · ${cap.name}`}
      description="勾选后这些 Agent 可在会话中调用此能力；取消勾选即解除绑定。"
      onClose={onClose}
      width={480}
      footer={<>
        <span className="cap-dialog__count tnum">已选 {picked.length} / {contacts.length}</span>
        <button type="button" className="btn" onClick={onClose}>取消</button>
        <button type="button" className="btn btn--primary" onClick={() => onSave(picked)}>保存绑定</button>
      </>}
    >
      {contacts.length === 0 ? (
        <EmptyState icon="contacts" title="还没有 Agent 联系人" hint="先在联系人页添加 Agent，再回来绑定能力。" />
      ) : (
        <ul className="cap-pick">
          {contacts.map(c => (
            <li key={c.id}>
              <label className={`cap-pick__row${picked.includes(c.id) ? ' cap-pick__row--on' : ''}`}>
                <input
                  type="checkbox"
                  className="cap-check"
                  checked={picked.includes(c.id)}
                  onChange={e => flip(c.id, e.target.checked)}
                />
                <Avatar ref={c.avatar} size={26} radius="field" />
                <span className="cap-pick__name">{c.displayName}</span>
                <span className="cap-pick__engine mono">{c.engineId}</span>
                <StatusDot tone={contactDotTone(c)} label={c.status} />
              </label>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

/* ---------------- 凭据授权说明弹窗（只说明流程，无输入字段） ---------------- */
function AuthFlowDialog({ cap, onClose }: { cap: Capability; onClose: () => void }) {
  const creds = cap.permissions.filter(p => p.id.startsWith('credential.'));
  return (
    <Modal
      title="凭据将进入安全配置流"
      description={`${cap.name} 需要 ${creds.map(p => p.label).join('、')}，以下是授权的完整流程。`}
      onClose={onClose}
      badge={{ tone: 'info', text: '只读说明' }}
      footer={<button type="button" className="btn btn--primary" onClick={onClose}>我了解了</button>}
    >
      <ul className="cap-flow">
        <li><Icon name="shield" size={13} /> 凭据只写入系统的加密配置存储，界面上始终遮罩显示，点击才临时可见。</li>
        <li><Icon name="eyeOff" size={13} /> 密钥不进聊天消息、不进群公告、不进项目档案，也不写入任何日志。</li>
        <li><Icon name="terminal" size={13} /> 本页不采集任何 key：安装后到连接器配置流里完成授权，完成后连接状态会更新。</li>
        <li><Icon name="refresh" size={13} /> 可随时在配置流中撤销授权，或在能力页卸载连接器。</li>
      </ul>
    </Modal>
  );
}

/* ---------------- 页面 ---------------- */
export function CapabilityPage({ kind }: { kind: 'skill' | 'connector' }) {
  const s = useSnapshot();
  const client = useClient();
  const [bindId, setBindId] = useState<string | null>(null);
  const [authId, setAuthId] = useState<string | null>(null);

  const copy = COPY[kind];
  const list = kind === 'skill' ? s.skills : s.connectors;
  const contacts = s.contacts;

  const ordered = [...list].sort((a, b) => STATUS_RANK[a.installState.status] - STATUS_RANK[b.installState.status]);
  const installedCount = list.filter(c => c.installState.status === 'installed').length;

  const bindCap = bindId ? list.find(c => c.id === bindId) : undefined;
  const authCap = authId ? list.find(c => c.id === authId) : undefined;

  const toggle = (cap: Capability, on: boolean) => { void client.toggleCapability(cap.id, on); };
  const saveBind = (capId: string, agentIds: string[]) => {
    setBindId(null);
    void client.bindCapability(capId, agentIds);
  };

  return (
    <div className="cap-page">
      <div className="cap-scroll">
        <header className="cap-head">
          <div className="cap-head__text">
            <h1 className="cap-head__title">{copy.title}</h1>
            <p className="cap-head__hint">{copy.hint}</p>
          </div>
          <span className="cap-head__stat tnum">已装 {installedCount} / {list.length}</span>
        </header>

        <div className="cap-body">
          {list.length === 0 ? (
            <EmptyState
              icon={kind === 'skill' ? 'skills' : 'connectors'}
              title={`还没有可用的${copy.title}`}
              hint="后端返回能力目录后，这里会列出每一项的权限与绑定关系。"
            />
          ) : (
            <div className="cap-grid">
              {ordered.map(cap => (
                <CapabilityCard
                  key={cap.id}
                  cap={cap}
                  contacts={contacts}
                  onToggle={toggle}
                  onOpenBind={setBindId}
                  onOpenAuthFlow={setAuthId}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {bindCap && (
        <BindDialog
          cap={bindCap}
          contacts={contacts}
          onClose={() => setBindId(null)}
          onSave={ids => saveBind(bindCap.id, ids)}
        />
      )}
      {authCap && <AuthFlowDialog cap={authCap} onClose={() => setAuthId(null)} />}
    </div>
  );
}
