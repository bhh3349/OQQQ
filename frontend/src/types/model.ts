/* ============================================================
   OQQQ — 前端数据模型
   依据：设计文档 §15（UI 规范模型）+ API-CONTRACT.md（传输模型）
   原则：可扩展联合类型，组件不对引擎写死分支。
   ============================================================ */

/* ---------- 资源引用 ----------
   文档 §15：组件不得拼接本地绝对路径，由容器/资源协议转安全 URL */
export type AssetRef =
  | { kind: 'emoji'; value: string }
  | { kind: 'url'; value: string }
  | { kind: 'initials'; value: string; tint?: string };

export type RunState = 'queued' | 'running' | 'streaming' | 'completed' | 'failed';
export type HealthState = 'healthy' | 'degraded' | 'down' | 'unknown';
export type InstallState =
  | { status: 'not_installed' }
  | { status: 'installing'; progress: number; stage: string }
  | { status: 'installed'; version?: string; updateAvailable?: string }
  | { status: 'failed'; stage: string; error: string };

/* ---------- 会话（文档 §15） ---------- */
export type Conversation = {
  id: string;
  kind: 'direct' | 'group';
  title: string;
  avatar?: AssetRef;
  unreadCount: number;
  pinned: boolean;
  muted?: boolean;
  lastMessage?: MessagePreview;
  project?: ProjectState;
  draft?: string;
  workspacePath?: string;
  memberIds: string[];
  /** 引擎离线 / 后端断开时置灰，保留历史只禁用发送（文档 §06 失败降级） */
  readOnly?: boolean;
};

export type MessagePreview = {
  text: string;
  at: number;
  kind: MessageKind;
};

/* ---------- 联系人（文档 §15） ---------- */
export type AgentContact = {
  id: string;
  displayName: string;
  engineId: string;
  groupId?: string;
  status: 'online' | 'busy' | 'offline' | 'error';
  model?: string;
  capabilityIds: string[];
  avatar?: AssetRef;
  role?: 'owner' | 'admin' | 'member';
  /** PM 创建但未完成 Onboarding —— 显示「准备中」，不能接单（文档 §09） */
  onboarding?: 'pending' | 'ready';
};

export type ContactGroup = {
  id: string;
  name: string;
  order: number;
  collapsed: boolean;
};

/* ---------- 消息（文档 §15 + §08） ----------
   7 类。只有 human/agent 计入发言阈值，其余不进入「每 N 条」计数 */
export type MessageKind =
  | 'human'
  | 'agent'
  | 'summary'
  | 'system'
  | 'tool_event'
  | 'task_event'
  | 'file_event';

export const COUNTED_KINDS: ReadonlySet<MessageKind> = new Set(['human', 'agent']);

export type SenderRef = {
  id: string;
  name: string;
  avatar?: AssetRef;
  kind: 'user' | 'agent' | 'system';
  engineId?: string;
};

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'code'; lang?: string; text: string }
  | { type: 'file'; name: string; size: number; url?: string }
  | { type: 'mention'; targetId: string; label: string };

export type ToolEventPayload = {
  tool: string;
  action: string;
  resultSummary?: string;
  /** 审计详情走受控详情页，原始参数不进公开聊天（文档 §08 明确排除） */
  hasAuditDetail?: boolean;
  approval?: 'not_required' | 'pending' | 'approved' | 'denied';
};

export type TaskEventPayload = {
  taskId: string;
  title: string;
  assigneeId?: string;
  assigneeName?: string;
  state: 'open' | 'blocked' | 'in_progress' | 'done';
  linkedMessageId?: string;
};

export type SummaryPayload = {
  index: number;
  period: string;
  decisions: string[];
  progress: string[];
  blockers: string[];
  coversFrom?: string;
  coversTo?: string;
};

export type FileEventPayload = {
  op: 'created' | 'modified' | 'deleted';
  name: string;
  path: string;
  initiatorName: string;
  size?: number;
};

export type Message = {
  id: string;
  conversationId: string;
  sender: SenderRef;
  kind: MessageKind;
  content: ContentBlock[];
  mentions: string[];
  replyTo?: { id: string; senderName: string; preview: string };
  createdAt: number;
  run?: { id: string; state: RunState };
  /** 流式中断时保留已生成文本并可重试（文档 §16） */
  partialText?: string;
  toolEvent?: ToolEventPayload;
  taskEvent?: TaskEventPayload;
  summary?: SummaryPayload;
  fileEvent?: FileEventPayload;
};

/* ---------- 引擎描述符（文档 §15，全部由注册表返回） ---------- */
export type EngineAction =
  | 'install' | 'update' | 'uninstall' | 'configure' | 'diagnose' | 'chat';

export type AgentEngineDescriptor = {
  id: string;
  name: string;
  icon: AssetRef;
  version?: string;
  installState: InstallState;
  health: HealthState;
  /** 配置表单由 schema 驱动，不在界面写死字段（文档 §17 阶段 3） */
  configSchema: JsonSchema;
  features: string[];
  actions: EngineAction[];
  /** 原生引擎无法 npm 安装时后端返回 MANUAL_INSTALL + 官网链接 */
  manualInstallUrl?: string;
};

export type JsonSchema = {
  type: 'object';
  properties: Record<string, JsonSchemaField>;
  required?: string[];
};

export type JsonSchemaField = {
  type: 'string' | 'number' | 'boolean' | 'select';
  title: string;
  description?: string;
  enum?: string[];
  default?: string | number | boolean;
  secret?: boolean;
  min?: number;
  max?: number;
};

/* ---------- 能力（文档 §15） ---------- */
export type Capability = {
  id: string;
  kind: 'plugin' | 'skill' | 'connector';
  name: string;
  version: string;
  source: string;
  description?: string;
  permissions: PermissionSummary[];
  installState: InstallState;
  compatibleEngineIds?: string[];
  boundAgentIds?: string[];
  marketplace?: {
    provider: 'dsh-1024store';
    installSpec?: string;
    rank?: number;
    stars?: number;
    installs?: number;
    owner?: string;
    url?: string;
    category?: string;
  };
};

export type PermissionSummary = { id: string; label: string; risk: 'low' | 'medium' | 'high' };

/* ---------- 工作区（文档 §12） ---------- */
export type WorkspaceNode = {
  id: string;
  name: string;
  type: 'file' | 'dir';
  conversationId: string;
  conversationTitle: string;
  path: string;
  size?: number;
  children?: WorkspaceNode[];
  change?: 'created' | 'modified' | 'deleted';
};

/* ---------- 项目生命周期（文档 §13） ---------- */
export type ProjectPhase =
  | 'interview'      // 需求访谈
  | 'spec_ready'     // 需求文档待确认
  | 'team_formed'    // 已组队
  | 'working'        // 开工
  | 'done'           // 已完结（只读）
  | 'archived';

export type ProjectState = {
  phase: ProjectPhase;
  /** PM 提议的团队规格，用户确认后才建成员（文档 §09 强确认） */
  teamSpec?: TeamSpecEntry[];
  archiveProgress?: number;
};

export type TeamSpecEntry = {
  name: string;
  role: string;
  engineId: string;
  avatar?: AssetRef;
  systemPrompt?: string;
  skills?: string[];
  connectors?: string[];
};

export type ArchiveChecklistItem = {
  id: string;
  label: string;
  state: 'pending' | 'running' | 'done' | 'failed';
  detail?: string;
};

/* ---------- 群侧栏（文档 §05 / §12） ----------
   公告承载长期记忆、项目约束与开发公约；群主与 PM 按权限编辑，保留版本记录 */
export type Announcement = {
  text: string;
  versions: { rev: number; text: string; editedAt: number; editor: string }[];
  updatedAt: number;
  updatedBy: string;
};

export type GroupFileEntry = {
  id: string;
  name: string;
  kind: 'file' | 'dir';
  size?: number;
  linkedMessageId?: string;
  path: string;
};

/* ---------- 连接状态（文档 §16 关键失败态） ---------- */
export type ConnectionState =
  | 'connecting'
  | 'online'
  | 'reconnecting'
  | 'offline'
  | 'backend_down';
