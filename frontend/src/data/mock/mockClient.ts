/* ============================================================
   MockClient — 本地完整闭环（设计文档 §17 阶段 1「先用 Mock 跑通」）
   实现与 LiveClient 相同的抽象，因此页面代码不需要区分两种模式。
   ============================================================ */
import type {
  AgentContact, Announcement, Capability, ConnectionState, EngineAction,
  Conversation, Message, MessageKind, ProjectPhase, RunState, SenderRef,
  TeamSpecEntry, WorkspaceNode,
} from '../../types/model';
import { COUNTED_KINDS } from '../../types/model';
import type {
  ArchiveOutcome, CreateGroupInput, MarketSort, OqqqSettings, OqqqSnapshot,
} from '../client';
import { OqqqClient } from '../client';
import * as seed from './seed';

const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
let seq = 1000;
const nid = (p: string) => `${p}${++seq}`;

/** 各 Agent 的回复语料：体现角色差异，不写通用废话 */
const REPLIES: Record<string, (ask: string) => string> = {
  pm: ask => ask.includes('确认')
    ? '收到。需求文档已冻结，我开始拆解团队规格。'
    : '已记录。我把这条并进需求文档 v3，改动会在群里同步。',
  coder_a: () => '收到，我先看现有实现再动手，改完把 diff 摘要贴回来。',
  reviewer_1: () => '我在评审队列里排到了，先看边界与失败路径，再给结论。',
  hermes: () => '明白。当前会话是只读工作区权限，需要写入我会先申请审批。',
  bot_summary: () => '已按阈值生成阶段总结，覆盖范围见卡片。',
  echo: () => 'echo：收到，未配置模型 Key，当前为回声模式。',
};

export class MockClient extends OqqqClient {
  private state: OqqqSnapshot;
  private snap: OqqqSnapshot;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private streaming = new Map<string, ReturnType<typeof setTimeout>>();
  private visibleCount: Record<string, number> = {};

  constructor() {
    super();
    this.state = {
      connection: 'connecting',
      conversations: seed.seedConversations.map(c => ({ ...c })),
      messages: structuredClone(seed.seedMessages),
      loadingMessages: {},
      contacts: seed.seedContacts.map(c => ({ ...c })),
      engines: seed.seedEngines.map(e => ({ ...e })),
      skills: seed.seedSkills.map(s => ({ ...s })),
      connectors: seed.seedConnectors.map(c => ({ ...c })),
      plugins: seed.seedMarketPlugins.map(p => ({ ...p })),
      workspace: structuredClone(seed.seedWorkspace),
      announcements: structuredClone(seed.seedAnnouncements),
      settings: {
        theme: 'light', defaultModel: 'DeepSeek-V3.2', apiKeyMasked: 'sk-••••••••••••',
        summaryEvery: 50, requireApproval: true, syncAnnouncementAsCharter: true, fontScale: 1,
      },
      marketQuery: '', marketSort: 'installs', marketLoading: false, marketCooldownUntil: 0,
    };
    for (const [cid, list] of Object.entries(this.state.messages)) {
      this.visibleCount[cid] = list.filter(m => COUNTED_KINDS.has(m.kind)).length;
    }
    this.snap = { ...this.state };
  }

  snapshot(): OqqqSnapshot { return this.snap; }
  private commit(): void {
    this.snap = { ...this.state };
    this.raiseChange();
  }
  private after(ms: number, fn: () => void): void {
    const t = setTimeout(() => { this.timers = this.timers.filter(x => x !== t); fn(); }, ms);
    this.timers.push(t);
  }
  destroy(): void {
    this.timers.forEach(clearTimeout);
    this.streaming.forEach(clearTimeout);
    this.timers = []; this.streaming.clear();
  }

  /* ---------------- 连接 ---------------- */
  async connect(): Promise<void> {
    this.state.connection = 'connecting'; this.commit();
    this.emit({ type: 'connection.state_changed', state: 'connecting' });
    await wait(420);
    this.state.connection = 'online'; this.commit();
    this.emit({ type: 'connection.state_changed', state: 'online' });
  }
  disconnect(): void { this.setState('offline'); }
  async reconnect(): Promise<void> {
    this.setState('reconnecting');
    await wait(700);
    this.setState('online');
    this.emit({ type: 'toast', tone: 'success', text: '已重新连接后端' });
  }
  /** 供调试台手动注入故障 */
  simulateFailure(next: ConnectionState, detail?: string): void {
    this.state.connection = next; this.state.connectionDetail = detail;
    if (next === 'backend_down') {
      for (const c of this.state.conversations) c.readOnly = true;
    } else if (next === 'online') {
      for (const c of this.state.conversations) {
        if (c.id !== 'dm_coder') c.readOnly = false;
      }
      this.state.connectionDetail = undefined;
    }
    this.commit();
    this.emit({ type: 'connection.state_changed', state: next, detail });
  }
  private setState(s: ConnectionState): void {
    this.state.connection = s; this.commit();
    this.emit({ type: 'connection.state_changed', state: s });
  }

  /* ---------------- 消息 ---------------- */
  async loadMessages(cid: string): Promise<void> {
    if (this.state.messages[cid]) return;
    this.state.loadingMessages = { ...this.state.loadingMessages, [cid]: true };
    this.commit();
    await wait(340);
    this.state.messages = { ...this.state.messages, [cid]: [] };
    this.state.loadingMessages = { ...this.state.loadingMessages, [cid]: false };
    this.commit();
  }

  private push(cid: string, msg: Message): void {
    const list = this.state.messages[cid] ?? [];
    this.state.messages = { ...this.state.messages, [cid]: [...list, msg] };
    const conv = this.state.conversations.find(c => c.id === cid);
    if (conv) {
      conv.lastMessage = {
        text: previewOf(msg), at: msg.createdAt, kind: msg.kind,
      };
      this.state.conversations = [...this.state.conversations];
    }
    if (COUNTED_KINDS.has(msg.kind)) {
      this.visibleCount[cid] = (this.visibleCount[cid] ?? 0) + 1;
    }
    this.commit();
    this.emit({ type: 'message.appended', message: msg });
  }

  async send(cid: string, text: string, mentions: string[] = []): Promise<void> {
    const conv = this.state.conversations.find(c => c.id === cid);
    if (!conv || conv.readOnly) return;
    const mine: SenderRef = {
      id: seed.SELF_ID, name: 'Bo', kind: 'user',
      avatar: { kind: 'initials', value: 'Bo', tint: '#E39B12' },
    };
    this.push(cid, {
      id: nid('m'), conversationId: cid, sender: mine,
      kind: 'human', content: [{ type: 'text', text }],
      mentions, createdAt: Date.now(),
    });
    conv.draft = '';
    this.commit();
    if (conv.kind === 'group' ? !mentions.length && !conv.memberIds.includes('pm') : false) return;
    this.dispatchTo(cid, text, mentions);
    this.maybeSummarize(cid);
  }

  /** 群：@ 决定执行目标，无 @ 派给 PM（文档 §08）；单聊：自动路由给当前 Agent */
  private dispatchTo(cid: string, ask: string, mentions: string[]): void {
    const conv = this.state.conversations.find(c => c.id === cid);
    if (!conv) return;
    let targets: string[];
    if (conv.kind === 'direct') {
      targets = conv.memberIds.filter(id => id !== seed.SELF_ID);
    } else if (mentions.length) {
      targets = mentions.filter(id => id !== seed.SELF_ID && conv.memberIds.includes(id));
    } else {
      targets = ['pm'];
    }
    for (const t of targets) void this.runAgent(cid, t, ask);
  }

  private async runAgent(cid: string, agentId: string, ask: string): Promise<void> {
    const contact = this.state.contacts.find(c => c.id === agentId);
    if (!contact) return;
    if (contact.status === 'offline' || contact.status === 'error') {
      this.emit({ type: 'toast', tone: 'warning', text: `${contact.displayName} 当前${contact.status === 'error' ? '异常' : '离线'}，消息已保存但未派发` });
      return;
    }
    if (contact.onboarding === 'pending') {
      this.emit({ type: 'toast', tone: 'info', text: `${contact.displayName} 准备中，完成 Onboarding 后才能接单` });
      return;
    }
    const msgId = nid('m');
    const runId = nid('run');
    const msg: Message = {
      id: msgId, conversationId: cid,
      sender: {
        id: contact.id, name: contact.displayName, kind: 'agent', engineId: contact.engineId,
        avatar: contact.avatar,
      },
      kind: 'agent', content: [{ type: 'text', text: '' }], mentions: [],
      createdAt: Date.now(), run: { id: runId, state: 'queued' },
    };
    this.push(cid, msg);
    const setRun = (state: RunState) => {
      const m = this.find(cid, msgId); if (!m?.run) return;
      m.run = { ...m.run, state }; this.commit();
      this.emit({ type: 'run.state_changed', conversationId: cid, runId, messageId: msgId, state });
    };
    setRun('running');
    await wait(520);
    setRun('streaming');
    const body = (REPLIES[contact.engineId] ?? REPLIES.pm)(ask);
    await this.streamText(cid, msgId, body);
    setRun('completed');
  }

  private streamText(cid: string, msgId: string, body: string): Promise<void> {
    return new Promise(resolve => {
      let i = 0;
      const step = () => {
        const chunk = body.slice(i, i + 3 + Math.floor(Math.random() * 5));
        i += chunk.length;
        const m = this.find(cid, msgId);
        if (!m) { resolve(); return; }
        m.content = [{ type: 'text', text: body.slice(0, i) }];
        this.commit();
        this.emit({ type: 'message.delta', conversationId: cid, messageId: msgId, delta: chunk });
        if (i < body.length) {
          this.streaming.set(msgId, setTimeout(step, 26 + Math.random() * 46));
        } else {
          this.streaming.delete(msgId);
          resolve();
        }
      };
      step();
    });
  }

  async stop(cid: string): Promise<void> {
    for (const m of this.state.messages[cid] ?? []) {
      if (m.run && (m.run.state === 'running' || m.run.state === 'streaming')) {
        const t = this.streaming.get(m.id);
        if (t) { clearTimeout(t); this.streaming.delete(m.id); }
        m.run = { ...m.run, state: 'failed' };
        m.partialText = m.content.find(b => b.type === 'text')?.text ?? '';
      }
    }
    this.commit();
    this.emit({ type: 'toast', tone: 'info', text: '已停止生成，保留已输出内容' });
  }

  async retry(msgId: string): Promise<void> {
    const { cid, m } = this.locate(msgId);
    if (!m?.run) return;
    m.run = { ...m.run, state: 'queued' };
    m.content = [{ type: 'text', text: '' }];
    m.partialText = undefined;
    this.commit();
    this.emit({ type: 'run.state_changed', conversationId: cid, runId: m.run.id, messageId: msgId, state: 'queued' });
    await wait(320);
    m.run = { ...m.run, state: 'streaming' }; this.commit();
    this.emit({ type: 'run.state_changed', conversationId: cid, runId: m.run.id, messageId: msgId, state: 'streaming' });
    const ask = [...(this.state.messages[cid] ?? [])]
      .filter(x => x.kind === 'human' && x.createdAt <= m.createdAt)
      .pop()?.content.find(b => b.type === 'text')?.text ?? '';
    await this.runAgentText(cid, msgId, ask);
  }

  private async runAgentText(cid: string, msgId: string, ask: string): Promise<void> {
    const m = this.find(cid, msgId); if (!m?.run) return;
    m.run = { ...m.run, state: 'streaming' }; this.commit();
    const body = (REPLIES[m.sender.engineId ?? 'pm'] ?? REPLIES.pm)(ask);
    await this.streamText(cid, msgId, body);
    m.run = { ...m.run, state: 'completed' }; this.commit();
    this.emit({ type: 'run.state_changed', conversationId: cid, runId: m.run.id, messageId: msgId, state: 'completed' });
  }

  async editResend(msgId: string, text: string): Promise<void> {
    const { cid, m } = this.locate(msgId);
    if (!m) return;
    m.content = [{ type: 'text', text }];
    m.createdAt = Date.now();
    this.commit();
    this.emit({ type: 'message.appended', message: m });
    this.dispatchTo(cid, text, m.mentions);
  }

  saveDraft(cid: string, text: string): void {
    const c = this.state.conversations.find(x => x.id === cid);
    if (!c) return;
    c.draft = text; this.commit();
  }

  /** 审批：拒绝后停住，不自动重复请求（文档 §16 权限被拒） */
  async resolveApproval(msgId: string, approved: boolean): Promise<void> {
    const { m } = this.locate(msgId);
    if (!m?.toolEvent || m.toolEvent.approval !== 'pending') return;
    m.toolEvent = { ...m.toolEvent, approval: approved ? 'approved' : 'denied' };
    if (approved && !m.toolEvent.resultSummary) {
      m.toolEvent.resultSummary = '已按批准范围执行：' + m.toolEvent.action;
    }
    this.commit();
    this.emit({ type: 'tool.completed', messageId: msgId, resultSummary: m.toolEvent.resultSummary });
    this.emit({
      type: 'toast', tone: approved ? 'success' : 'warning',
      text: approved ? '已批准，操作继续执行' : '已拒绝，该操作不会重复请求',
    });
  }

  private find(cid: string, msgId: string): Message | undefined {
    return (this.state.messages[cid] ?? []).find(m => m.id === msgId);
  }
  private locate(msgId: string): { cid: string; m?: Message } {
    for (const [cid, list] of Object.entries(this.state.messages)) {
      const m = list.find(x => x.id === msgId);
      if (m) return { cid, m };
    }
    return { cid: '' };
  }

  /* ---------------- 总结触发（文档 §12：每 N 条可见发言） ---------------- */
  private maybeSummarize(cid: string): void {
    const n = this.visibleCount[cid] ?? 0;
    if (n > 0 && n % this.state.settings.summaryEvery === 0) void this.requestSummary(cid);
  }

  async requestSummary(cid: string): Promise<void> {
    const idx = (this.state.messages[cid] ?? [])
      .filter(m => m.kind === 'summary').length + 1;
    await wait(600);
    const m: Message = {
      id: nid('m'), conversationId: cid,
      sender: { id: 'bot_summary', name: '总结', kind: 'system', engineId: 'echo',
                avatar: { kind: 'initials', value: '总', tint: '#898A8B' } },
      kind: 'summary', content: [], mentions: [], createdAt: Date.now(),
      summary: {
        index: idx, period: `阶段总结 #${String(idx).padStart(2, '0')}`,
        decisions: ['沿用本轮已确认的技术约束，无新增变更。'],
        progress: ['会话列表与消息流保持可用。'],
        blockers: ['插件监听协议仍未定，继续用轮询。'],
      },
    };
    this.push(cid, m);
  }

  /* ---------------- 会话 ---------------- */
  async createDirect(peerContactId: string): Promise<Conversation> {
    const c = this.state.contacts.find(x => x.id === peerContactId);
    const conv: Conversation = {
      id: nid('dm'), kind: 'direct', title: c?.displayName ?? '新会话',
      avatar: c?.avatar, unreadCount: 0, pinned: false,
      memberIds: [seed.SELF_ID, peerContactId],
      workspacePath: `~/workspace/${(c?.displayName ?? 'chat').toLowerCase()}`,
    };
    this.state.conversations = [conv, ...this.state.conversations];
    this.state.messages = { ...this.state.messages, [conv.id]: [] };
    this.commit();
    this.emit({ type: 'conversation.created', conversation: conv });
    return conv;
  }

  /** 建群：用户为群主，PM 自动为管理员并从需求访谈开始（文档 §07） */
  async createGroup(input: CreateGroupInput): Promise<Conversation> {
    const members = [seed.SELF_ID, 'pm', ...input.memberIds.filter(id => id !== 'pm')];
    const conv: Conversation = {
      id: nid('grp'), kind: 'group', title: input.name,
      avatar: { kind: 'initials', value: input.name.slice(0, 1), tint: '#0099FF' },
      unreadCount: 0, pinned: false, memberIds: members,
      workspacePath: input.workspacePath, project: { phase: 'interview' },
    };
    this.state.conversations = [conv, ...this.state.conversations];
    this.state.messages = { ...this.state.messages, [conv.id]: [] };
    this.state.announcements[conv.id] = {
      text: '需求访谈阶段：PM 负责输出需求文档，用户确认后才开工。',
      updatedAt: Date.now(), updatedBy: 'Bo',
      versions: [{ rev: 1, text: '需求访谈阶段：PM 负责输出需求文档，用户确认后才开工。', editedAt: Date.now(), editor: 'Bo' }],
    };
    this.commit();
    this.emit({ type: 'conversation.created', conversation: conv });
    this.push(conv.id, sysMsg(conv.id, `你创建了群聊「${input.name}」，PM 已作为管理员加入。`));
    this.push(conv.id, {
      id: nid('m'), conversationId: conv.id,
      sender: { id: 'pm', name: 'PM', kind: 'agent', engineId: 'openai',
                avatar: { kind: 'initials', value: 'P', tint: '#17A53A' } },
      kind: 'agent', mentions: [], createdAt: Date.now(),
      content: [{ type: 'text', text: '开始需求访谈。先确认三件事：目标、范围与约束、验收标准。' }],
    });
    return conv;
  }

  setPinned(cid: string, pinned: boolean): void {
    const c = this.state.conversations.find(x => x.id === cid); if (!c) return;
    c.pinned = pinned;
    this.state.conversations = sortConversations(this.state.conversations);
    this.commit();
    this.emit({ type: 'conversation.updated', conversation: c });
  }
  setMuted(cid: string, muted: boolean): void {
    const c = this.state.conversations.find(x => x.id === cid); if (!c) return;
    c.muted = muted; this.commit();
    this.emit({ type: 'conversation.updated', conversation: c });
  }
  async setWorkspacePath(cid: string, path: string): Promise<void> {
    const c = this.state.conversations.find(x => x.id === cid); if (!c) return;
    c.workspacePath = path; this.commit();
    this.emit({ type: 'conversation.updated', conversation: c });
    this.emit({ type: 'toast', tone: 'success', text: '工作区路径已更新' });
  }

  /* ---------------- 引擎生命周期（文档 §07 / §10） ---------------- */
  private async driveInstall(engineId: string, stages: [string, number][]): Promise<boolean> {
    const e = this.state.engines.find(x => x.id === engineId); if (!e) return false;
    for (const [stage, pct] of stages) {
      e.installState = { status: 'installing', progress: pct, stage };
      this.commit();
      this.emit({ type: 'engine.install_progress', engineId, progress: pct, stage });
      await wait(520);
    }
    return true;
  }

  async installEngine(engineId: string): Promise<void> {
    const e = this.state.engines.find(x => x.id === engineId); if (!e) return;
    if (e.manualInstallUrl) {
      this.emit({ type: 'toast', tone: 'warning', text: '该引擎需官网手动安装' });
      return;
    }
    const ok = await this.driveInstall(engineId, [
      ['解析包', 18], ['下载', 52], ['链接可执行文件', 84], ['探测版本', 96],
    ]);
    if (!ok) return;
    /* 演示失败态：opencode 首次安装必失败（文档 §16「安装失败展示阶段与可复制错误摘要」） */
    if (engineId === 'opencode') {
      e.installState = {
        status: 'failed', stage: '链接可执行文件',
        error: 'EACCES: permission denied, symlink /usr/local/bin/opencode\nexit status 1',
      };
      this.commit();
      this.emit({ type: 'engine.list_changed', engines: this.state.engines });
      this.emit({ type: 'toast', tone: 'error', text: `${e.name} 安装失败：权限不足` });
      return;
    }
    e.installState = { status: 'installed', version: e.version ?? '1.0.0' };
    e.health = 'healthy';
    const nextActions: EngineAction[] = e.actions.filter(a => a !== 'install');
    for (const a of ['chat', 'update', 'uninstall'] as const) {
      if (!nextActions.includes(a)) nextActions.push(a);
    }
    e.actions = nextActions;
    this.commit();
    this.emit({ type: 'engine.list_changed', engines: this.state.engines });
    this.emit({ type: 'toast', tone: 'success', text: `${e.name} 已安装` });
  }

  async updateEngine(engineId: string): Promise<void> {
    const e = this.state.engines.find(x => x.id === engineId); if (!e) return;
    await this.driveInstall(engineId, [['下载更新', 40], ['应用更新', 80]]);
    const next = (e.installState as { updateAvailable?: string }).updateAvailable ?? e.version;
    e.installState = { status: 'installed', version: next };
    e.version = next;
    this.commit();
    this.emit({ type: 'engine.list_changed', engines: this.state.engines });
    this.emit({ type: 'toast', tone: 'success', text: `${e.name} 已更新到 ${next}` });
  }

  async uninstallEngine(engineId: string): Promise<void> {
    const e = this.state.engines.find(x => x.id === engineId); if (!e) return;
    /* 卸载前检查占用（MVP 验收：Agent 详情） */
    const inUse = this.state.contacts.filter(c => c.engineId === engineId);
    if (inUse.length) {
      this.emit({ type: 'toast', tone: 'warning',
        text: `${e.name} 仍被 ${inUse.map(c => c.displayName).join('、')} 使用，请先移除这些 Agent` });
      return;
    }
    await this.driveInstall(engineId, [['移除链接', 60]]);
    e.installState = { status: 'not_installed' };
    e.health = 'unknown';
    e.actions = ['install'];
    this.commit();
    this.emit({ type: 'engine.list_changed', engines: this.state.engines });
    this.emit({ type: 'toast', tone: 'success', text: `${e.name} 已卸载` });
  }

  /** 安装完成即成为好友（文档 §18 默认假设） */
  async addContactFromEngine(engineId: string): Promise<AgentContact> {
    const e = this.state.engines.find(x => x.id === engineId);
    const existing = this.state.contacts.find(c => c.engineId === engineId);
    if (existing) return existing;
    const contact: AgentContact = {
      id: nid('ag'), displayName: e?.name ?? engineId, engineId,
      status: 'online', capabilityIds: [], avatar: e?.icon, onboarding: 'ready',
    };
    this.state.contacts = [...this.state.contacts, contact];
    this.commit();
    this.emit({ type: 'agent.status_changed', contact });
    return contact;
  }

  /* ---------------- 能力（文档 §11） ---------------- */
  async loadCapabilities(kind: Capability['kind']): Promise<void> {
    await wait(200);
    const items = kind === 'skill' ? this.state.skills : kind === 'connector' ? this.state.connectors : this.state.plugins;
    this.emit({ type: 'capability.catalog_loaded', kind, items });
  }
  async toggleCapability(id: string, on: boolean): Promise<void> {
    const list = allCapabilities(this.state);
    const cap = list.find(c => c.id === id); if (!cap) return;
    if (on && cap.installState.status === 'not_installed') {
      for (const pct of [35, 70, 100]) {
        cap.installState = { status: 'installing', progress: pct, stage: pct < 100 ? '安装' : '校验' };
        this.commit();
        this.emit({ type: 'capability.install_progress', capabilityId: id, progress: pct, stage: '安装' });
        await wait(260);
      }
      cap.installState = { status: 'installed', version: cap.version };
    } else if (!on) {
      cap.installState = { status: 'not_installed' };
      cap.boundAgentIds = [];
    }
    this.commit();
    this.emit({ type: 'toast', tone: 'success', text: on ? `${cap.name} 已安装` : `${cap.name} 已卸载` });
  }
  async bindCapability(id: string, agentIds: string[]): Promise<void> {
    const cap = allCapabilities(this.state).find(c => c.id === id); if (!cap) return;
    cap.boundAgentIds = agentIds; this.commit();
    this.emit({ type: 'toast', tone: 'success', text: agentIds.length ? `已绑定 ${agentIds.length} 个 Agent` : '已解绑全部 Agent' });
  }

  /* ---------------- 插件广场三步（文档 §11 MUST，不可省） ---------------- */
  async searchMarket(query: string, sort: MarketSort): Promise<void> {
    if (Date.now() < this.state.marketCooldownUntil) {
      const secs = Math.ceil((this.state.marketCooldownUntil - Date.now()) / 1000);
      this.state.marketError = `匿名额度用尽，${secs} 秒后可重试`;
      this.commit();
      return;
    }
    this.state.marketQuery = query;
    this.state.marketSort = sort;
    this.state.marketLoading = true;
    this.state.marketError = undefined;
    this.commit();
    await wait(320);
    /* 演示 429 冷却：连续第 4 次搜索触发（文档：读取 Retry-After，不自动重试） */
    this.searchHits = (this.searchHits ?? 0) + 1;
    if (this.searchHits % 4 === 0) {
      this.state.marketCooldownUntil = Date.now() + 20_000;
      this.state.marketLoading = false;
      this.state.marketError = '收到 429，已按 Retry-After 冷却 20 秒，不会自动重试';
      this.commit();
      return;
    }
    this.state.marketLoading = false;
    this.commit();
  }
  private searchHits = 0;

  async getPluginPermissions(target: string): Promise<string[]> {
    await wait(240);
    const cap = this.state.plugins.find(p => p.marketplace?.installSpec === target);
    return (cap?.permissions ?? []).map(p => p.id);
  }

  async installPlugin(target: string, confirmed: string[]): Promise<{ ok: boolean; error?: string }> {
    const cap = this.state.plugins.find(p => p.marketplace?.installSpec === target);
    if (!cap) return { ok: false, error: '找不到该安装规格' };
    const declared = cap.permissions.map(p => p.id).sort();
    /* 契约：confirmed 必须与 permissions 返回完全一致，否则拒绝安装 */
    if (JSON.stringify([...confirmed].sort()) !== JSON.stringify(declared)) {
      this.emit({ type: 'toast', tone: 'error', text: '权限确认与声明不一致，已拒绝安装' });
      return { ok: false, error: '权限确认与声明不一致' };
    }
    for (const pct of [30, 65, 100]) {
      cap.installState = { status: 'installing', progress: pct, stage: pct < 100 ? '调用 dsh plugin add' : '写入本地清单' };
      this.commit();
      this.emit({ type: 'capability.install_progress', capabilityId: cap.id, progress: pct, stage: '安装' });
      await wait(340);
    }
    cap.installState = { status: 'installed', version: cap.version };
    this.commit();
    this.emit({ type: 'toast', tone: 'success', text: `${cap.name} 已安装，进入本地能力清单` });
    return { ok: true };
  }

  /* ---------------- 工作区 ---------------- */
  async loadWorkspace(): Promise<void> { await wait(180); this.commit(); }
  async refreshWorkspaceNode(nodeId: string): Promise<void> {
    const hit = (nodes: WorkspaceNode[]): WorkspaceNode | undefined => {
      for (const n of nodes) {
        if (n.id === nodeId) return n;
        const c = n.children ? hit(n.children) : undefined;
        if (c) return c;
      }
      return undefined;
    };
    const node = hit(this.state.workspace);
    if (node) {
      node.change = 'modified';
      this.state.workspace = [...this.state.workspace];
      this.commit();
      this.emit({ type: 'workspace.changed', conversationId: node.conversationId, node });
    }
  }

  /* ---------------- 公告 ---------------- */
  async updateAnnouncement(cid: string, text: string): Promise<void> {
    const a: Announcement = this.state.announcements[cid] ?? {
      text: '', versions: [], updatedAt: Date.now(), updatedBy: '',
    };
    const rev = (a.versions[0]?.rev ?? 0) + 1;
    a.versions = [{ rev, text, editedAt: Date.now(), editor: 'Bo' }, ...a.versions];
    a.text = text; a.updatedAt = Date.now(); a.updatedBy = 'Bo';
    this.state.announcements = { ...this.state.announcements, [cid]: a };
    this.commit();
    this.emit({ type: 'toast', tone: 'success', text: `公告已保存为第 ${rev} 版` });
  }

  /* ---------------- PM 流程（文档 §09 强确认） ---------------- */
  phaseOf(cid: string): ProjectPhase {
    return this.state.conversations.find(c => c.id === cid)?.project?.phase ?? 'interview';
  }
  private setPhase(cid: string, phase: ProjectPhase): void {
    const c = this.state.conversations.find(x => x.id === cid); if (!c) return;
    c.project = { ...(c.project ?? {}), phase };
    this.commit();
    this.emit({ type: 'project.phase_changed', conversationId: cid, phase });
  }

  async pmConfirm(cid: string): Promise<void> {
    if (!this.state.conversations.find(c => c.id === cid)) return;
    this.setPhase(cid, 'spec_ready');
    this.push(cid, sysMsg(cid, 'Bo 已确认需求文档，PM 可以开始团队规格分析。'));
  }

  async pmProposeTeam(cid: string): Promise<TeamSpecEntry[]> {
    const c = this.state.conversations.find(x => x.id === cid);
    if (!c) return [];
    this.push(cid, {
      id: nid('m'), conversationId: cid,
      sender: { id: 'pm', name: 'PM', kind: 'agent', engineId: 'openai',
                avatar: { kind: 'initials', value: 'P', tint: '#17A53A' } },
      kind: 'agent', mentions: [], createdAt: Date.now(),
      content: [{ type: 'text', text: '正在按需求拆解角色、能力与并行关系…' }],
    });
    await wait(900);
    const spec: TeamSpecEntry[] = [
      { name: 'Frontend-1', role: '界面与交互', engineId: 'claude-code',
        avatar: { kind: 'initials', value: 'F', tint: '#D97706' },
        systemPrompt: '负责组件与状态流，遵守群公告中的开发公约。', skills: ['skill_code_review'] },
      { name: 'Backend-1', role: '会话总线与路由', engineId: 'codex',
        avatar: { kind: 'initials', value: 'B', tint: '#0EA5E9' },
        systemPrompt: '负责消息总线、@ 路由与持久化，写操作前先申请审批。', skills: ['skill_code_review'], connectors: ['conn_git'] },
      { name: 'QA-1', role: '端到端与回归', engineId: 'hermes',
        avatar: { kind: 'initials', value: 'Q', tint: '#7C3AED' },
        systemPrompt: '负责验收清单与故障注入测试。' },
    ];
    c.project = { phase: c.project?.phase ?? 'interview', teamSpec: spec };
    this.commit();
    return spec;
  }

  /** 建成员 → 准备中 → Onboarding → 可接单（文档 §09） */
  async pmFormTeam(cid: string, spec: TeamSpecEntry[]): Promise<void> {
    const c = this.state.conversations.find(x => x.id === cid); if (!c) return;
    this.setPhase(cid, 'team_formed');
    for (const entry of spec) {
      const contact: AgentContact = {
        id: nid('ag'), displayName: entry.name, engineId: entry.engineId,
        status: 'online', capabilityIds: entry.skills ?? [], avatar: entry.avatar,
        role: 'member', onboarding: 'pending',
      };
      this.state.contacts = [...this.state.contacts, contact];
      c.memberIds = [...c.memberIds, contact.id];
      this.commit();
      this.emit({ type: 'agent.status_changed', contact });
      this.push(cid, sysMsg(cid, `PM 创建了 ${entry.name}（${entry.role}），已拉入群聊。`));
      this.after(1200 + Math.random() * 900, () => {
        contact.onboarding = 'ready';
        this.commit();
        this.emit({ type: 'agent.status_changed', contact });
        this.push(cid, {
          id: nid('m'), conversationId: cid,
          sender: { id: contact.id, name: contact.displayName, kind: 'agent',
                    engineId: contact.engineId, avatar: contact.avatar },
          kind: 'agent', mentions: [], createdAt: Date.now(),
          content: [{ type: 'text',
            text: `我是 ${contact.displayName}，负责${entry.role}。已读完群公告与最新阶段总结，可以接单。` }],
        });
      });
    }
    this.setPhase(cid, 'working');
  }

  /* ---------------- 项目完结与恢复（文档 §13） ---------------- */
  async archiveProject(cid: string, copyWorkspace: boolean): Promise<ArchiveOutcome> {
    const c = this.state.conversations.find(x => x.id === cid);
    if (!c) return { ok: false, error: '会话不存在' };
    const stages: [string, number][] = [
      ['导出群详情', 12], ['生成文件清单', 34], ['保存总结链', 56],
      [copyWorkspace ? '复制工作区' : '冻结 Agent 任务', 78], ['写入档案', 94],
    ];
    for (const [stage, pct] of stages) {
      c.project = { phase: c.project?.phase ?? 'working', archiveProgress: pct };
      this.commit();
      this.emit({ type: 'project.archive_progress', conversationId: cid, progress: pct, stage });
      await wait(760);
    }
    c.project = { phase: 'done' };
    c.readOnly = true;
    this.commit();
    this.emit({ type: 'project.archived', conversationId: cid, archivePath: `~/archives/${c.title}.oqqqproj` });
    this.push(cid, sysMsg(cid, `项目「${c.title}」已完结并归档，本群转为只读，仍可在消息页搜索。`));
    return {
      ok: true,
      archivePath: `~/archives/${c.title}.oqqqproj`,
      credentialSlots: ['openai.apiKey', 'connector.github.token'],
    };
  }

  async restoreArchive(archivePath: string): Promise<void> {
    this.emit({ type: 'toast', tone: 'info', text: 'PM 正在解析档案并生成恢复计划…' });
    await wait(900);
    const conv = await this.createGroup({
      name: '恢复：桌面工具重构', memberIds: [], workspacePath: '~/workspace/oqqq-desktop-restored',
    });
    this.push(conv.id, sysMsg(conv.id, `PM 已从 ${archivePath} 恢复 3 名成员、2 条未完成任务与公告第 3 版。`));
    this.setPhase(conv.id, 'working');
    this.emit({ type: 'toast', tone: 'success', text: '恢复完成报告已发布到群内' });
  }

  /* ---------------- 设置 ---------------- */
  updateSettings(patch: Partial<OqqqSettings>): void {
    this.state.settings = { ...this.state.settings, ...patch };
    this.commit();
    if (patch.theme) {
      document.documentElement.dataset.theme = patch.theme;
    }
  }
}

/* ---------------- 辅助 ---------------- */
function previewOf(m: Message): string {
  switch (m.kind) {
    case 'summary': return m.summary?.period ?? '阶段总结';
    case 'tool_event': return `工具：${m.toolEvent?.tool ?? ''} ${m.toolEvent?.action ?? ''}`;
    case 'task_event': return `任务：${m.taskEvent?.title ?? ''}`;
    case 'file_event': return `文件 ${m.fileEvent?.op === 'deleted' ? '删除' : '更新'}：${m.fileEvent?.name ?? ''}`;
    case 'system': return m.content.find(b => b.type === 'text')?.text ?? '系统事件';
    default: return m.content.find(b => b.type === 'text')?.text ?? '';
  }
}

function sysMsg(cid: string, text: string): Message {
  return {
    id: nid('m'), conversationId: cid,
    sender: { id: 'system', name: '系统', kind: 'system' },
    kind: 'system', content: [{ type: 'text', text }], mentions: [], createdAt: Date.now(),
  };
}

function sortConversations(list: Conversation[]): Conversation[] {
  return [...list].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return (b.lastMessage?.at ?? 0) - (a.lastMessage?.at ?? 0);
  });
}

function allCapabilities(s: OqqqSnapshot): Capability[] {
  return [...s.skills, ...s.connectors, ...s.plugins];
}

export type { MessageKind };
