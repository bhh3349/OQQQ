/* ============================================================
   LiveClient — 真实后端实现（WebSocket + REST）
   对照 docs/API-CONTRACT.md。所有 mock 逻辑已删除。
   ============================================================ */
import type {
  AgentContact, AgentEngineDescriptor, Announcement, Capability, ConnectionState,
  Conversation, Message, ProjectPhase, TeamSpecEntry, WorkspaceNode, AssetRef,
  MessageKind, SenderRef, ContentBlock, InstallState,
} from '../types/model';
import { OqqqClient, type OqqqSnapshot, type OqqqSettings, type MarketSort, type CreateGroupInput, type ArchiveOutcome } from '../client';
import type { WireKind } from '../wire';

const BASE = (typeof localStorage !== 'undefined' && localStorage.getItem('oqqq.baseUrl')) || 'http://127.0.0.1:18791';
const WS_BASE = BASE.replace(/^http/, 'ws');

type WireMessage = {
  id: string; sessionId: string; kind: WireKind; from: string; ts: number;
  payload: any;
};
type WireMember = {
  id: string; name: string; avatar: string; role: 'owner' | 'admin' | 'member';
  kind: 'user' | 'agent'; engine?: string; systemPrompt?: string; online: boolean;
};
type WireSession = {
  id: string; kind: 'group' | 'dm'; name: string; members: WireMember[]; workspace?: string;
};

const emojiAvatar = (e: string): AssetRef =>
  e ? { kind: 'emoji', value: e } : { kind: 'initials', value: '?' };

function toSender(m: WireMember | undefined, fromId: string): SenderRef {
  if (!m) return { id: fromId, name: fromId, kind: fromId === 'bo' ? 'user' : 'system' };
  return {
    id: m.id, name: m.name, avatar: emojiAvatar(m.avatar),
    kind: m.kind === 'agent' ? 'agent' : 'user',
    engineId: m.engine,
  };
}

function toMessage(w: WireMessage, members: WireMember[]): Message {
  const sender = toSender(members.find((m) => m.id === w.from), w.from);
  const kind: MessageKind =
    w.kind === 'text' ? (sender.kind === 'agent' ? 'agent' : 'human')
    : w.kind === 'tool_call' ? 'tool_event'
    : w.kind === 'summary' ? 'summary'
    : w.kind === 'file' ? 'file_event' : 'system';
  const content: ContentBlock[] = [];
  if (w.kind === 'text') content.push({ type: 'text', text: w.payload?.text ?? '' });
  return {
    id: w.id, conversationId: w.sessionId, sender, kind, content,
    mentions: w.payload?.mentions ?? [], createdAt: w.ts,
    ...(w.kind === 'tool_call' ? {
      toolEvent: {
        tool: w.payload?.tool ?? '', action: w.payload?.tool ?? '',
        resultSummary: (w.payload?.result ?? '').slice(0, 200),
      },
    } : {}),
    ...(w.kind === 'summary' ? {
      summary: {
        period: w.payload?.period ?? '',
        decisions: w.payload?.decisions ?? [],
        progress: w.payload?.progress ?? [],
        blockers: w.payload?.blockers ?? [],
      },
    } : {}),
  };
}

function toConversation(s: WireSession): Conversation {
  return {
    id: s.id, kind: s.kind === 'dm' ? 'direct' : 'group', title: s.name,
    avatar: { kind: 'initials', value: s.name.slice(0, 1) },
    unreadCount: 0, pinned: false,
    memberIds: s.members.map((m) => m.id),
    workspacePath: s.workspace,
    project: s.kind === 'group' ? { phase: 'interview' as ProjectPhase } : undefined,
  };
}

export class LiveClient extends OqqqClient {
  private snap: OqqqSnapshot;
  private ws: WebSocket | null = null;
  private wsSession: string | null = null;
  private membersBySession: Record<string, WireMember[]> = {};
  private streaming: Record<string, Message> = {};
  private pmPhase: Record<string, ProjectPhase> = {};

  constructor() {
    super();
    this.snap = {
      connection: 'offline', conversations: [], messages: {}, loadingMessages: {},
      contacts: [], engines: [], skills: [], connectors: [], plugins: [],
      workspace: [], announcements: {}, marketQuery: '', marketSort: 'stars',
      marketLoading: false, marketCooldownUntil: 0,
      settings: {
        theme: 'light', defaultModel: 'deepseek-chat', apiKeyMasked: '',
        summaryEvery: 30, requireApproval: false,
        syncAnnouncementAsCharter: false, fontScale: 1,
      },
    };
  }

  snapshot(): OqqqSnapshot { return this.snap; }
  private commit() { this.raiseChange(); }
  private setConn(c: ConnectionState, detail?: string) {
    this.snap = { ...this.snap, connection: c, connectionDetail: detail };
    this.commit();
  }

  destroy(): void { this.disconnect(); }

  async connect(): Promise<void> {
    this.setConn('connecting');
    try {
      const sessions: WireSession[] = await (await fetch(`${BASE}/api/sessions`)).json();
      const conversations = sessions.map(toConversation);
      sessions.forEach((s) => { this.membersBySession[s.id] = s.members; });
      // contacts: aggregate agent members across sessions
      const contacts: AgentContact[] = [];
      const seen = new Set<string>();
      sessions.forEach((s) => s.members.forEach((m) => {
        if (m.kind === 'agent' && !seen.has(m.id)) {
          seen.add(m.id);
          contacts.push({
            id: m.id, displayName: m.name, engineId: m.engine ?? 'echo',
            status: m.online ? 'online' : 'offline', capabilityIds: [],
            avatar: emojiAvatar(m.avatar), role: m.role,
          });
        }
      }));
      this.snap = { ...this.snap, conversations, contacts };
      // engines / skills / connectors
      await Promise.all([this.refreshEngines(), this.loadCapabilities('skill'), this.loadCapabilities('connector')]);
      // PM phases
      for (const s of sessions.filter((x) => x.kind === 'group')) {
        try {
          const pm = await (await fetch(`${BASE}/api/sessions/${s.id}/pm`)).json();
          if (pm.phase) this.pmPhase[s.id] = pm.phase;
        } catch { /* no PM */ }
      }
      this.setConn('online');
      // open WS on first conversation
      if (conversations[0]) this.openWs(conversations[0].id);
    } catch (e) {
      this.setConn('offline', `后端连接失败：${String(e).slice(0, 120)}（${BASE}）`);
    }
    this.commit();
  }

  disconnect(): void {
    this.ws?.close(); this.ws = null; this.wsSession = null;
    this.setConn('offline');
  }

  async reconnect(): Promise<void> { this.disconnect(); await this.connect(); }

  private openWs(sessionId: string) {
    if (this.wsSession === sessionId && this.ws?.readyState === WebSocket.OPEN) return;
    this.ws?.close();
    this.wsSession = sessionId;
    const ws = new WebSocket(`${WS_BASE}/ws?session=${sessionId}`);
    this.ws = ws;
    ws.onopen = () => this.setConn('online');
    ws.onclose = () => { if (this.ws === ws) this.setConn('offline', '连接断开'); };
    ws.onerror = () => { if (this.ws === ws) this.setConn('offline', '连接错误'); };
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'hello') {
          const members = this.membersBySession[sessionId] ?? [];
          const messages = (msg.recent ?? []).map((w: WireMessage) => toMessage(w, members));
          this.snap = {
            ...this.snap,
            messages: { ...this.snap.messages, [sessionId]: messages },
            loadingMessages: { ...this.snap.loadingMessages, [sessionId]: false },
          };
          this.commit();
        } else if (msg.type === 'delta') {
          const key = `${sessionId}:${msg.id}`;
          let m = this.streaming[key];
          if (!m) {
            m = {
              id: msg.id, conversationId: sessionId,
              sender: { id: '?', name: '', kind: 'agent' },
              kind: 'agent', content: [{ type: 'text', text: '' }],
              mentions: [], createdAt: Date.now(),
              run: { id: msg.id, state: 'streaming' },
            };
            this.streaming[key] = m;
            const list = [...(this.snap.messages[sessionId] ?? []), m];
            this.snap = { ...this.snap, messages: { ...this.snap.messages, [sessionId]: list } };
          }
          const block = m.content[0];
          if (block.type === 'text') block.text += msg.delta;
          this.commit();
        } else if (msg.type === 'message') {
          const w: WireMessage = msg.message;
          // remove streaming placeholder with same id
          const key = `${sessionId}:${w.id}`;
          delete this.streaming[key];
          const members = this.membersBySession[sessionId] ?? [];
          const m = toMessage(w, members);
          const list = (this.snap.messages[sessionId] ?? []).filter((x) => x.id !== w.id);
          list.push(m);
          this.snap = {
            ...this.snap,
            messages: { ...this.snap.messages, [sessionId]: list },
            conversations: this.snap.conversations.map((c) =>
              c.id === sessionId ? { ...c, lastMessage: { text: w.payload?.text?.slice(0, 60) ?? '', at: w.ts, kind: m.kind } } : c),
          };
          this.commit();
        }
      } catch { /* ignore malformed frames */ }
    };
  }

  /* ---------- 消息 ---------- */
  async loadMessages(cid: string): Promise<void> {
    this.openWs(cid);
    this.snap = { ...this.snap, loadingMessages: { ...this.snap.loadingMessages, [cid]: true } };
    this.commit();
    try {
      const arr: WireMessage[] = await (await fetch(`${BASE}/api/sessions/${cid}/messages`)).json();
      const members = this.membersBySession[cid] ?? [];
      this.snap = {
        ...this.snap,
        messages: { ...this.snap.messages, [cid]: arr.map((w) => toMessage(w, members)) },
        loadingMessages: { ...this.snap.loadingMessages, [cid]: false },
      };
    } catch {
      this.snap = { ...this.snap, loadingMessages: { ...this.snap.loadingMessages, [cid]: false } };
    }
    this.commit();
  }

  async send(cid: string, text: string, mentions: string[] = []): Promise<void> {
    this.openWs(cid);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'send', from: 'bo', text, mentions }));
    } else {
      throw new Error('未连接到后端');
    }
  }

  async stop(_cid: string): Promise<void> { /* 后端暂不支持中断 */ }
  async retry(_msgId: string): Promise<void> { /* TODO */ }
  async editResend(_msgId: string, _text: string): Promise<void> { /* TODO */ }
  saveDraft(cid: string, text: string): void {
    this.snap = {
      ...this.snap,
      conversations: this.snap.conversations.map((c) => c.id === cid ? { ...c, draft: text } : c),
    };
    this.commit();
  }
  async resolveApproval(_msgId: string, _approved: boolean): Promise<void> {
    /* 自主模式：无审批 */ 
  }

  /* ---------- 会话 ---------- */
  async createDirect(peerContactId: string): Promise<Conversation> {
    const peer = this.snap.contacts.find((c) => c.id === peerContactId);
    const r = await (await fetch(`${BASE}/api/sessions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'dm', name: peer?.displayName ?? '新的聊天', peerId: peerContactId }),
    })).json();
    const c = toConversation(r.session);
    this.snap = { ...this.snap, conversations: [c, ...this.snap.conversations] };
    this.commit();
    return c;
  }

  async createGroup(input: CreateGroupInput): Promise<Conversation> {
    const r = await (await fetch(`${BASE}/api/sessions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'group', name: input.name }),
    })).json();
    const s: WireSession = r.session;
    this.membersBySession[s.id] = s.members;
    this.pmPhase[s.id] = 'interview';
    const c = toConversation(s);
    this.snap = { ...this.snap, conversations: [c, ...this.snap.conversations] };
    this.commit();
    return c;
  }

  setPinned(cid: string, pinned: boolean): void {
    this.snap = {
      ...this.snap,
      conversations: this.snap.conversations.map((c) => c.id === cid ? { ...c, pinned } : c),
    };
    this.commit();
  }
  setMuted(cid: string, muted: boolean): void {
    this.snap = {
      ...this.snap,
      conversations: this.snap.conversations.map((c) => c.id === cid ? { ...c, muted } : c),
    };
    this.commit();
  }
  async setWorkspacePath(_cid: string, _path: string): Promise<void> { /* 后端 workspace 创建时固定 */ }

  /* ---------- 引擎 ---------- */
  private async refreshEngines(): Promise<void> {
    try {
      const list: { id: string; name: string; avatar: string; version: string; status: 'installed' | 'not_installed' }[] =
        await (await fetch(`${BASE}/api/engines`)).json();
      const engines: AgentEngineDescriptor[] = list.map((e) => ({
        id: e.id, name: e.name, icon: emojiAvatar(e.avatar), version: e.version || undefined,
        installState: e.status === 'installed'
          ? { status: 'installed' as const, version: e.version || undefined }
          : { status: 'not_installed' as const },
        health: e.status === 'installed' ? 'healthy' : 'unknown',
        configSchema: { type: 'object', properties: {} },
        features: [], actions: ['install', 'update', 'uninstall', 'chat'] as AgentEngineDescriptor['actions'],
      }));
      this.snap = { ...this.snap, engines };
      this.commit();
    } catch { /* keep old */ }
  }

  async installEngine(engineId: string): Promise<void> {
    const r = await (await fetch(`${BASE}/api/engines/${engineId}/install`, { method: 'POST' })).json();
    if (!r.ok && r.code !== 'MANUAL_INSTALL') throw new Error(r.error ?? '安装失败');
    if (r.code === 'MANUAL_INSTALL') throw Object.assign(new Error(r.error), { code: 'MANUAL_INSTALL' });
    await this.refreshEngines();
  }
  async updateEngine(engineId: string): Promise<void> {
    const r = await (await fetch(`${BASE}/api/engines/${engineId}/update`, { method: 'POST' })).json();
    if (!r.ok) throw new Error(r.error ?? '更新失败');
    await this.refreshEngines();
  }
  async uninstallEngine(engineId: string): Promise<void> {
    const r = await (await fetch(`${BASE}/api/engines/${engineId}/uninstall`, { method: 'POST' })).json();
    if (!r.ok) throw new Error(r.error ?? '卸载失败');
    await this.refreshEngines();
  }
  async addContactFromEngine(engineId: string): Promise<AgentContact> {
    const e = this.snap.engines.find((x) => x.id === engineId);
    if (!e) throw new Error('未知引擎');
    const contact: AgentContact = {
      id: `agent-${engineId}-${Date.now()}`, displayName: e.name, engineId,
      status: 'online', capabilityIds: [], avatar: e.icon,
    };
    this.snap = { ...this.snap, contacts: [...this.snap.contacts, contact] };
    this.commit();
    return contact;
  }

  /* ---------- 能力 ---------- */
  async loadCapabilities(kind: Capability['kind']): Promise<void> {
    if (kind === 'plugin') return;
    try {
      const path = kind === 'skill' ? 'skills' : 'connectors';
      const list: { id: string; name: string; desc: string; installed?: boolean; connected?: boolean }[] =
        await (await fetch(`${BASE}/api/${path}`)).json();
      const caps: Capability[] = list.map((c) => ({
        id: c.id, kind, name: c.name, version: '', source: 'builtin',
        description: c.desc, permissions: [],
        installState: (c.installed ?? c.connected)
          ? { status: 'installed' as const } : { status: 'not_installed' as const },
      }));
      this.snap = {
        ...this.snap,
        skills: kind === 'skill' ? caps : this.snap.skills,
        connectors: kind === 'connector' ? caps : this.snap.connectors,
      };
      this.commit();
    } catch { /* keep old */ }
  }
  async toggleCapability(_id: string, _on: boolean): Promise<void> { /* 后端暂无开关接口 */ }
  async bindCapability(_id: string, _agentIds: string[]): Promise<void> { /* 后端暂无绑定接口 */ }

  async searchMarket(query: string, sort: MarketSort): Promise<void> {
    this.snap = { ...this.snap, marketQuery: query, marketLoading: true, marketError: undefined };
    this.commit();
    try {
      const r = await (await fetch(`${BASE}/api/plugins/search?q=${encodeURIComponent(query)}&limit=20`)).json();
      if (!r.ok) throw new Error(r.error ?? '搜索失败');
      const plugins: Capability[] = (r.results ?? []).map((p: any, i: number) => ({
        id: p.id, kind: 'plugin' as const, name: p.name, version: '', source: 'dsh-1024store',
        description: p.description, permissions: [],
        installState: { status: 'not_installed' as const },
        marketplace: {
          provider: 'dsh-1024store' as const, installSpec: p.target,
          rank: i + 1, stars: p.stars, installs: p.installCount,
          owner: p.owner, url: p.url, category: p.category,
        },
      }));
      this.snap = { ...this.snap, plugins, marketLoading: false };
    } catch (e) {
      this.snap = { ...this.snap, marketLoading: false, marketError: String(e).slice(0, 200) };
    }
    this.commit();
  }

  async getPluginPermissions(target: string): Promise<string[]> {
    const r = await (await fetch(`${BASE}/api/plugins/permissions?target=${encodeURIComponent(target)}`)).json();
    if (!r.ok) throw new Error(r.error ?? '读取权限失败');
    return r.permissions as string[];
  }

  async installPlugin(target: string, confirmed: string[]): Promise<{ ok: boolean; error?: string }> {
    try {
      const r = await (await fetch(`${BASE}/api/plugins/install`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target, confirmed }),
      })).json();
      return r.ok ? { ok: true } : { ok: false, error: r.error };
    } catch (e) {
      return { ok: false, error: String(e).slice(0, 300) };
    }
  }

  /* ---------- 工作区 / 公告 ---------- */
  async loadWorkspace(): Promise<void> { /* 后端暂无文件 API */ }
  async refreshWorkspaceNode(_nodeId: string): Promise<void> { /* TODO */ }
  async updateAnnouncement(_cid: string, _text: string): Promise<void> { /* 后端暂无公告 API */ }

  /* ---------- PM 流程 ---------- */
  phaseOf(cid: string): ProjectPhase { return this.pmPhase[cid] ?? 'interview'; }

  async pmConfirm(cid: string): Promise<void> {
    const r = await (await fetch(`${BASE}/api/sessions/${cid}/pm/confirm`, { method: 'POST' })).json();
    if (r.phase) {
      this.pmPhase[cid] = r.phase;
      this.syncProjectPhase(cid);
    }
  }

  async pmProposeTeam(cid: string): Promise<TeamSpecEntry[]> {
    const r = await (await fetch(`${BASE}/api/sessions/${cid}/pm/propose-team`, { method: 'POST' })).json();
    if (!r.ok) throw new Error(r.error ?? '生成团队规格失败');
    const spec: TeamSpecEntry[] = (r.spec ?? []).map((s: any) => ({
      name: s.name, role: s.role, engineId: s.engine ?? 'openai',
      avatar: s.avatar ? emojiAvatar(s.avatar) : undefined,
      systemPrompt: s.systemPrompt, skills: s.skills, connectors: s.connectors,
    }));
    this.snap = {
      ...this.snap,
      conversations: this.snap.conversations.map((c) =>
        c.id === cid ? { ...c, project: { ...(c.project as any), teamSpec: spec } } : c),
    };
    this.commit();
    return spec;
  }

  async pmFormTeam(cid: string, _spec: TeamSpecEntry[]): Promise<void> {
    const r = await (await fetch(`${BASE}/api/sessions/${cid}/pm/form-team`, { method: 'POST' })).json();
    if (!r.ok) throw new Error(r.error ?? '组队失败');
    this.pmPhase[cid] = 'team_formed';
    this.syncProjectPhase(cid);
    // refresh members
    const sessions: WireSession[] = await (await fetch(`${BASE}/api/sessions`)).json();
    const s = sessions.find((x) => x.id === cid);
    if (s) {
      this.membersBySession[cid] = s.members;
      const c = toConversation(s);
      this.snap = {
        ...this.snap,
        conversations: this.snap.conversations.map((x) => x.id === cid ? { ...c, project: x.project } : x),
      };
      this.commit();
    }
  }

  private syncProjectPhase(cid: string) {
    const phase = this.pmPhase[cid];
    if (!phase) return;
    this.snap = {
      ...this.snap,
      conversations: this.snap.conversations.map((c) =>
        c.id === cid ? { ...c, project: { phase, teamSpec: c.project?.teamSpec } } : c),
    };
    this.commit();
  }

  async requestSummary(_cid: string): Promise<void> {
    /* 后端每 N 条自动触发，无需手动 */
  }

  /* ---------- 项目完结 ---------- */
  async archiveProject(cid: string, _copyWorkspace: boolean): Promise<ArchiveOutcome> {
    try {
      const r = await (await fetch(`${BASE}/api/sessions/${cid}/archive`, { method: 'POST' })).json();
      if (!r.ok) return { ok: false, error: r.error };
      // 下载档案 JSON
      const blob = new Blob([JSON.stringify(r.archive, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `oqqq-archive-${cid}.json`; a.click();
      URL.revokeObjectURL(url);
      return { ok: true, archivePath: a.download };
    } catch (e) {
      return { ok: false, error: String(e).slice(0, 300) };
    }
  }
  async restoreArchive(_archivePath: string): Promise<void> { /* TODO */ }

  /* ---------- 设置 ---------- */
  updateSettings(patch: Partial<OqqqSettings>): void {
    if (patch.summaryEvery !== undefined) {
      // 后端通过环境变量配置，前端仅本地记录
    }
    this.snap = { ...this.snap, settings: { ...this.snap.settings, ...patch } };
    this.commit();
  }
}
