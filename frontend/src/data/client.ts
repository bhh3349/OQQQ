/* ============================================================
   单一 Data Client（设计文档 §03）
   组件不得直接调用传输层；HTTP / WS / IPC 的差异全部封在这里。
   ============================================================ */
import type {
  AgentContact, AgentEngineDescriptor, Announcement, Capability, ConnectionState,
  Conversation, Message, ProjectPhase, TeamSpecEntry, WorkspaceNode,
} from '../types/model';
import { EventBus } from './events';
import type { Listener, OqqqEvent } from './events';

export type OqqqSnapshot = {
  connection: ConnectionState;
  connectionDetail?: string;
  conversations: Conversation[];
  messages: Record<string, Message[]>;
  loadingMessages: Record<string, boolean>;
  contacts: AgentContact[];
  engines: AgentEngineDescriptor[];
  skills: Capability[];
  connectors: Capability[];
  plugins: Capability[];
  workspace: WorkspaceNode[];
  announcements: Record<string, Announcement>;
  settings: OqqqSettings;
  marketQuery: string;
  marketSort: MarketSort;
  marketLoading: boolean;
  marketCooldownUntil: number;
  marketError?: string;
};

export type MarketSort = 'stars' | 'installs' | 'updated';

export type OqqqSettings = {
  theme: 'light' | 'dark';
  defaultModel: string;
  apiKeyMasked: string;
  summaryEvery: number;
  requireApproval: boolean;
  syncAnnouncementAsCharter: boolean;
  fontScale: number;
};

export type CreateGroupInput = {
  name: string;
  memberIds: string[];
  workspacePath: string;
};

export type ArchiveOutcome = {
  ok: boolean;
  archivePath?: string;
  /** 档案不得含密钥，只记录「需要哪类凭据」（文档 §13 安全） */
  credentialSlots?: string[];
  error?: string;
};

export abstract class OqqqClient {
  protected bus = new EventBus();
  private changeListeners = new Set<() => void>();
  abstract snapshot(): OqqqSnapshot;

  subscribe(fn: Listener): () => void { return this.bus.subscribe(fn); }
  protected emit(e: OqqqEvent): void { this.bus.emit(e); }

  /** React 绑定用：状态快照变化时触发（与业务事件分离） */
  subscribeChanges(fn: () => void): () => void {
    this.changeListeners.add(fn);
    return () => { this.changeListeners.delete(fn); };
  }
  protected raiseChange(): void {
    for (const fn of this.changeListeners) fn();
  }

  abstract connect(): Promise<void>;
  abstract disconnect(): void;
  abstract reconnect(): Promise<void>;

  /* 消息 */
  abstract loadMessages(conversationId: string): Promise<void>;
  abstract send(conversationId: string, text: string, mentions?: string[]): Promise<void>;
  abstract stop(conversationId: string): Promise<void>;
  abstract retry(messageId: string): Promise<void>;
  abstract editResend(messageId: string, text: string): Promise<void>;
  abstract saveDraft(conversationId: string, text: string): void;
  /** 工具审批：拒绝后停住，不自动重复请求（文档 §16） */
  abstract resolveApproval(messageId: string, approved: boolean): Promise<void>;

  /* 会话 */
  abstract createDirect(peerContactId: string): Promise<Conversation>;
  abstract createGroup(input: CreateGroupInput): Promise<Conversation>;
  abstract setPinned(conversationId: string, pinned: boolean): void;
  abstract setMuted(conversationId: string, muted: boolean): void;
  abstract setWorkspacePath(conversationId: string, path: string): Promise<void>;

  /* 联系人与引擎 */
  abstract installEngine(engineId: string): Promise<void>;
  abstract updateEngine(engineId: string): Promise<void>;
  abstract uninstallEngine(engineId: string): Promise<void>;
  abstract addContactFromEngine(engineId: string): Promise<AgentContact>;

  /* 能力 */
  abstract loadCapabilities(kind: Capability['kind']): Promise<void>;
  abstract toggleCapability(capabilityId: string, on: boolean): Promise<void>;
  abstract bindCapability(capabilityId: string, agentIds: string[]): Promise<void>;
  abstract searchMarket(query: string, sort: MarketSort): Promise<void>;
  abstract getPluginPermissions(target: string): Promise<string[]>;
  abstract installPlugin(target: string, confirmed: string[]): Promise<{ ok: boolean; error?: string }>;

  /* 工作区 */
  abstract loadWorkspace(): Promise<void>;
  abstract refreshWorkspaceNode(nodeId: string): Promise<void>;

  /* 公告 */
  abstract updateAnnouncement(conversationId: string, text: string): Promise<void>;

  /* PM 流程 */
  abstract phaseOf(conversationId: string): ProjectPhase;
  abstract pmConfirm(conversationId: string): Promise<void>;
  abstract pmProposeTeam(conversationId: string): Promise<TeamSpecEntry[]>;
  abstract pmFormTeam(conversationId: string, spec: TeamSpecEntry[]): Promise<void>;
  abstract requestSummary(conversationId: string): Promise<void>;

  /* 项目完结 */
  abstract archiveProject(conversationId: string, copyWorkspace: boolean): Promise<ArchiveOutcome>;
  abstract restoreArchive(archivePath: string): Promise<void>;

  /* 设置 */
  abstract updateSettings(patch: Partial<OqqqSettings>): void;
}

export type { Announcement };
export type { AgentEngineDescriptor, Capability, Conversation, Message };
