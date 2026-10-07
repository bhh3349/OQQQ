/* ============================================================
   Mock 种子数据
   场景取自设计文档 §05 群聊示例：「桌面工具重构」项目群。
   用户 Bo 为群主，PM 为管理员，Coder / Reviewer 为业务 Agent，
   总结为系统机器人（文档 §18：总结机器人是系统成员，不算业务 Agent）。
   ============================================================ */
import type {
  AgentContact, AgentEngineDescriptor, Announcement, Capability,
  Conversation, Message, WorkspaceNode,
} from '../../types/model';

const now = Date.now();
const min = 60_000;
const hr = 60 * min;

export const SELF_ID = 'bo';

export const seedConversations: Conversation[] = [
  {
    id: 'grp_desktop',
    kind: 'group',
    title: '桌面工具重构',
    avatar: { kind: 'initials', value: '桌', tint: '#0099FF' },
    unreadCount: 0,
    pinned: true,
    memberIds: [SELF_ID, 'pm', 'coder_a', 'reviewer_1', 'bot_summary'],
    workspacePath: '~/workspace/oqqq-desktop',
    project: { phase: 'working' },
    lastMessage: { text: '阶段总结 #03 已生成', at: now - 12 * min, kind: 'summary' },
  },
  {
    id: 'dm_pm',
    kind: 'direct',
    title: 'PM 单聊',
    avatar: { kind: 'initials', value: 'P', tint: '#17A53A' },
    unreadCount: 2,
    pinned: true,
    memberIds: [SELF_ID, 'pm'],
    workspacePath: '~/workspace/pm-dm',
    lastMessage: { text: '需求文档已生成，请确认。', at: now - 42 * min, kind: 'agent' },
  },
  {
    id: 'dm_hermes',
    kind: 'direct',
    title: 'Hermes 助手',
    avatar: { kind: 'initials', value: 'H', tint: '#7C3AED' },
    unreadCount: 0,
    pinned: false,
    memberIds: [SELF_ID, 'hermes'],
    workspacePath: '~/workspace/hermes-dm',
    lastMessage: { text: '可以。当前会话已获得只读工作区权限。', at: now - 3 * hr, kind: 'agent' },
  },
  {
    id: 'dm_coder',
    kind: 'direct',
    title: 'Coder-A',
    avatar: { kind: 'initials', value: 'C', tint: '#0EA5E9' },
    unreadCount: 0,
    pinned: false,
    memberIds: [SELF_ID, 'coder_a'],
    workspacePath: '~/workspace/coder-a',
    readOnly: true,
    lastMessage: { text: '测试已通过', at: now - 26 * hr, kind: 'agent' },
  },
];

export const seedContacts: AgentContact[] = [
  {
    id: 'pm', displayName: 'PM', engineId: 'openai', status: 'online',
    model: 'DeepSeek-V3.2', capabilityIds: ['skill_deep_research'],
    avatar: { kind: 'initials', value: 'P', tint: '#17A53A' },
    role: 'admin', onboarding: 'ready',
  },
  {
    id: 'coder_a', displayName: 'Coder-A', engineId: 'codex', status: 'online',
    model: 'gpt-5-codex', capabilityIds: ['skill_code_review', 'conn_git'],
    avatar: { kind: 'initials', value: 'C', tint: '#0EA5E9' },
    role: 'member', onboarding: 'ready',
  },
  {
    id: 'reviewer_1', displayName: 'Reviewer', engineId: 'claude-code', status: 'busy',
    model: 'Claude Sonnet', capabilityIds: ['skill_code_review'],
    avatar: { kind: 'initials', value: 'R', tint: '#D97706' },
    role: 'member', onboarding: 'ready',
  },
  {
    id: 'bot_summary', displayName: '总结', engineId: 'echo', status: 'online',
    capabilityIds: [], avatar: { kind: 'initials', value: '总', tint: '#898A8B' },
    role: 'member', onboarding: 'ready',
  },
  {
    id: 'hermes', displayName: 'Hermes 助手', engineId: 'hermes', status: 'online',
    model: 'DeepSeek-V3.2', capabilityIds: ['skill_scheduled', 'conn_fs'],
    avatar: { kind: 'initials', value: 'H', tint: '#7C3AED' },
  },
  {
    id: 'dsh_bot', displayName: 'DeepSeek Harness', engineId: 'dsh', status: 'error',
    model: 'DeepSeek-V3.2', capabilityIds: ['skill_deep_research'],
    avatar: { kind: 'initials', value: 'D', tint: '#0099FF' },
  },
];

const emptyCfg = { type: 'object' as const, properties: {} };

export const seedEngines: AgentEngineDescriptor[] = [
  {
    id: 'hermes', name: 'Hermes', icon: { kind: 'initials', value: 'H', tint: '#7C3AED' },
    version: '0.21.5', installState: { status: 'installed', version: '0.21.5', updateAvailable: '0.22.1' },
    health: 'healthy', configSchema: emptyCfg,
    features: ['记忆增强', '定时任务', '只读工作区'],
    actions: ['chat', 'update', 'configure', 'diagnose', 'uninstall'],
  },
  {
    id: 'claude-code', name: 'Claude Code', icon: { kind: 'initials', value: 'C', tint: '#D97706' },
    version: '2.1.289', installState: { status: 'installed', version: '2.1.289' },
    health: 'healthy', configSchema: emptyCfg,
    features: ['网页抓取', '工具调用'],
    actions: ['chat', 'update', 'configure', 'uninstall'],
  },
  {
    id: 'codex', name: 'Codex', icon: { kind: 'initials', value: 'C', tint: '#0EA5E9' },
    version: '0.160.0', installState: { status: 'installed', version: '0.160.0' },
    health: 'degraded', configSchema: emptyCfg,
    features: ['沙箱执行', '补丁应用'],
    actions: ['chat', 'update', 'diagnose', 'uninstall'],
  },
  {
    id: 'opencode', name: 'OpenCode', icon: { kind: 'initials', value: 'O', tint: '#6366F1' },
    installState: { status: 'not_installed' }, health: 'unknown',
    configSchema: emptyCfg, features: ['多模型'], actions: ['install'],
  },
  {
    id: 'grok', name: 'Grok CLI', icon: { kind: 'initials', value: 'G', tint: '#14213D' },
    installState: { status: 'not_installed' }, health: 'unknown',
    configSchema: emptyCfg, features: ['长上下文'], actions: ['install'],
  },
  {
    id: 'dsh', name: 'DeepSeek Harness', icon: { kind: 'initials', value: 'D', tint: '#0099FF' },
    version: '0.2.0-rc.2', installState: { status: 'installed', version: '0.2.0-rc.2' },
    health: 'down', configSchema: emptyCfg,
    features: ['插件运行', 'Skill', 'MCP 连接器', '审批'],
    actions: ['chat', 'update', 'diagnose'],
  },
  {
    id: 'openai', name: 'OpenAI 兼容', icon: { kind: 'initials', value: 'A', tint: '#17A53A' },
    installState: { status: 'installed', version: 'api' }, health: 'healthy',
    configSchema: {
      type: 'object',
      properties: {
        apiKey: { type: 'string', title: 'API Key', secret: true, description: '只进入安全配置流，不写入日志与档案' },
        baseUrl: { type: 'string', title: '供应商地址', default: 'https://api.deepseek.com' },
        model: { type: 'string', title: '模型名', default: 'deepseek-chat' },
      },
      required: ['apiKey'],
    },
    features: ['无需安装', 'PM 默认引擎'], actions: ['configure', 'chat'],
  },
  {
    id: 'echo', name: 'Echo（内置）', icon: { kind: 'initials', value: 'E', tint: '#898A8B' },
    installState: { status: 'installed', version: 'builtin' }, health: 'healthy',
    configSchema: emptyCfg, features: ['回声测试', '无 Key 回退'], actions: ['chat'],
  },
];

export const seedSkills: Capability[] = [
  {
    id: 'skill_deep_research', kind: 'skill', name: '深度研究', version: '1.4.0',
    source: 'builtin', description: '多轮检索与来源归并，输出带引用的结论。',
    permissions: [{ id: 'net.read', label: '读取网络内容', risk: 'medium' }],
    installState: { status: 'installed', version: '1.4.0' }, boundAgentIds: ['pm', 'dsh_bot'],
  },
  {
    id: 'skill_code_review', kind: 'skill', name: '增量代码评审', version: '0.9.2',
    source: 'dsh-1024store', description: '对 diff 输出问题清单与修复建议。',
    permissions: [{ id: 'fs.read', label: '读取工作区', risk: 'low' }],
    installState: { status: 'installed', version: '0.9.2' }, boundAgentIds: ['coder_a', 'reviewer_1'],
  },
  {
    id: 'skill_scheduled', kind: 'skill', name: '定时任务', version: '2.0.1',
    source: 'builtin', description: '按 cron 表达式唤醒 Agent 执行既定任务。',
    permissions: [], installState: { status: 'installed', version: '2.0.1' }, boundAgentIds: ['hermes'],
  },
  {
    id: 'skill_pdf', kind: 'skill', name: 'PDF 解析', version: '0.3.0',
    source: 'dsh-1024store', description: '解析 PDF 为结构化文本，保留表格边界。',
    permissions: [{ id: 'fs.read', label: '读取工作区', risk: 'low' }],
    installState: { status: 'not_installed' }, compatibleEngineIds: ['dsh', 'hermes'],
  },
];

export const seedConnectors: Capability[] = [
  {
    id: 'conn_fs', kind: 'connector', name: '本地文件系统', version: '1.0.0',
    source: 'builtin', description: '沙箱内读写本机文件，高风险写入需审批。',
    permissions: [{ id: 'fs.write', label: '写入工作区文件', risk: 'high' }],
    installState: { status: 'installed', version: '1.0.0' }, boundAgentIds: ['hermes'],
  },
  {
    id: 'conn_git', kind: 'connector', name: 'GitHub', version: '1.2.3',
    source: 'mcp', description: '读写仓库、提 PR、查 CI。',
    permissions: [{ id: 'net.read', label: '读取仓库', risk: 'medium' },
                  { id: 'net.write', label: '推送与提 PR', risk: 'high' }],
    installState: { status: 'installed', version: '1.2.3' }, boundAgentIds: ['coder_a'],
  },
  {
    id: 'conn_mail', kind: 'connector', name: 'Gmail', version: '0.7.0',
    source: 'mcp', description: '检索与读取邮件，默认只读不删。',
    permissions: [{ id: 'credential.gmail', label: '账号授权', risk: 'high' }],
    installState: { status: 'not_installed' },
  },
];

/** 插件广场：结构与 dsh-1024store 返回一致 */
export const seedMarketPlugins: Capability[] = [
  {
    id: 'mp_memory_bank', kind: 'plugin', name: 'memory-bank', version: '3.1.0',
    source: 'github:imsai-sh/memory-bank',
    description: '跨会话持久记忆，自动归档决策与偏好。',
    permissions: [{ id: 'fs.write', label: '写入记忆目录', risk: 'high' },
                  { id: 'net.read', label: '读取远端配置', risk: 'medium' }],
    installState: { status: 'installed', version: '3.1.0' },
    compatibleEngineIds: ['dsh', 'hermes'],
    marketplace: { provider: 'dsh-1024store', installSpec: 'github:imsai-sh/memory-bank',
                   stars: 1284, installs: 12000, owner: 'imsai-sh', category: 'memory',
                   url: 'https://github.com/imsai-sh/memory-bank' },
  },
  {
    id: 'mp_git_helper', kind: 'plugin', name: 'git-helper', version: '1.8.2',
    source: 'github:navoki/git-helper',
    description: '提交信息生成、PR 描述草稿与冲突归因。',
    permissions: [{ id: 'exec.shell', label: '执行 git 命令', risk: 'high' }],
    installState: { status: 'not_installed' }, compatibleEngineIds: ['dsh'],
    marketplace: { provider: 'dsh-1024store', installSpec: 'github:navoki/git-helper',
                   stars: 2103, installs: 9700, owner: 'navoki', category: 'dev-programming',
                   url: 'https://github.com/navoki/git-helper' },
  },
  {
    id: 'mp_scheduler', kind: 'plugin', name: 'scheduler', version: '0.6.4',
    source: 'github:luma/scheduler',
    description: '进程内定时唤醒，支持 cron 与一次性计划。',
    permissions: [{ id: 'exec.shell', label: '执行计划任务', risk: 'high' }],
    installState: { status: 'not_installed' }, compatibleEngineIds: ['dsh', 'hermes'],
    marketplace: { provider: 'dsh-1024store', installSpec: 'github:luma/scheduler',
                   stars: 866, installs: 6100, owner: 'luma', category: 'automation',
                   url: 'https://github.com/luma/scheduler' },
  },
  {
    id: 'mp_scraper', kind: 'plugin', name: 'web-scraper-pro', version: '2.2.0',
    source: 'github:kite/web-scraper-pro',
    description: '支持 JS 渲染页面的抓取与正文抽取。',
    permissions: [{ id: 'net.read', label: '抓取任意 URL', risk: 'medium' }],
    installState: { status: 'not_installed' }, compatibleEngineIds: ['dsh'],
    marketplace: { provider: 'dsh-1024store', installSpec: 'github:kite/web-scraper-pro',
                   stars: 742, installs: 8300, owner: 'kite', category: 'web-tools',
                   url: 'https://github.com/kite/web-scraper-pro' },
  },
];

export const seedAnnouncements: Record<string, Announcement> = {
  grp_desktop: {
    text: '技术约束与开发公约\n1. 桌面端优先，基准 1440×900，最小宽 1024。\n2. 组件只经 Data Client 取数，不直连传输层。\n3. 思考过程、内部 prompt、工具原始参数不进群聊。\n4. 任何写文件 / 执行命令都要显式发起者与目标路径。',
    updatedAt: now - 5 * hr,
    updatedBy: 'PM',
    versions: [
      { rev: 3, text: '技术约束与开发公约\n1. 桌面端优先，基准 1440×900，最小宽 1024。\n2. 组件只经 Data Client 取数，不直连传输层。\n3. 思考过程、内部 prompt、工具原始参数不进群聊。\n4. 任何写文件 / 执行命令都要显式发起者与目标路径。', editedAt: now - 5 * hr, editor: 'PM' },
      { rev: 2, text: '1. 桌面端优先。\n2. 组件不直连传输层。', editedAt: now - 2 * 24 * hr, editor: 'Bo' },
    ],
  },
};

export const seedWorkspace: WorkspaceNode[] = [
  {
    id: 'ws_grp', name: 'oqqq-desktop', type: 'dir', conversationId: 'grp_desktop',
    conversationTitle: '桌面工具重构', path: '~/workspace/oqqq-desktop',
    children: [
      { id: 'ws_grp_src', name: 'src', type: 'dir', conversationId: 'grp_desktop',
        conversationTitle: '桌面工具重构', path: '~/workspace/oqqq-desktop/src',
        children: [
          { id: 'ws_grp_bus', name: 'bus.py', type: 'file', size: 4182,
            conversationId: 'grp_desktop', conversationTitle: '桌面工具重构',
            path: '~/workspace/oqqq-desktop/src/bus.py', change: 'modified' },
          { id: 'ws_grp_router', name: 'router.py', type: 'file', size: 2610,
            conversationId: 'grp_desktop', conversationTitle: '桌面工具重构',
            path: '~/workspace/oqqq-desktop/src/router.py' },
        ] },
      { id: 'ws_grp_req', name: 'requirements.md', type: 'file', size: 8121,
        conversationId: 'grp_desktop', conversationTitle: '桌面工具重构',
        path: '~/workspace/oqqq-desktop/requirements.md' },
    ],
  },
  {
    id: 'ws_hermes', name: 'hermes-dm', type: 'dir', conversationId: 'dm_hermes',
    conversationTitle: 'Hermes 助手', path: '~/workspace/hermes-dm',
    children: [
      { id: 'ws_h_notes', name: 'notes.md', type: 'file', size: 940,
        conversationId: 'dm_hermes', conversationTitle: 'Hermes 助手',
        path: '~/workspace/hermes-dm/notes.md' },
    ],
  },
];

/* ---------- 历史消息 ----------
   覆盖文档 §08 全部 7 种类型 */
export const seedMessages: Record<string, Message[]> = {
  grp_desktop: [
    {
      id: 'm001', conversationId: 'grp_desktop',
      sender: { id: 'system', name: '系统', kind: 'system' },
      kind: 'system', content: [{ type: 'text', text: 'Coder-A、Reviewer 已加入群聊。' }],
      mentions: [], createdAt: now - 6 * hr,
    },
    {
      id: 'm002', conversationId: 'grp_desktop',
      sender: { id: SELF_ID, name: 'Bo', kind: 'user', avatar: { kind: 'initials', value: 'Bo', tint: '#E39B12' } },
      kind: 'human',
      content: [{ type: 'text', text: '@PM 请根据需求建立项目组。' }],
      mentions: ['pm'], createdAt: now - 6 * hr + 2 * min,
    },
    {
      id: 'm003', conversationId: 'grp_desktop',
      sender: { id: 'pm', name: 'PM', kind: 'agent', engineId: 'openai',
                avatar: { kind: 'initials', value: 'P', tint: '#17A53A' } },
      kind: 'agent',
      content: [{ type: 'text', text: '@Bo 需求已确认，我建了 Coder 与 Reviewer 两个成员，角色与能力见群文件 requirements.md。' }],
      mentions: ['bo'], createdAt: now - 6 * hr + 4 * min,
      replyTo: { id: 'm002', senderName: 'Bo', preview: '@PM 请根据需求建立项目组。' },
    },
    {
      id: 'm004', conversationId: 'grp_desktop',
      sender: { id: 'pm', name: 'PM', kind: 'agent', engineId: 'openai',
                avatar: { kind: 'initials', value: 'P', tint: '#17A53A' } },
      kind: 'file_event', content: [],
      fileEvent: { op: 'created', name: 'requirements.md', path: '~/workspace/oqqq-desktop/requirements.md',
                   initiatorName: 'PM', size: 8121 },
      mentions: [], createdAt: now - 6 * hr + 5 * min,
    },
    {
      id: 'm005', conversationId: 'grp_desktop',
      sender: { id: 'coder_a', name: 'Coder-A', kind: 'agent', engineId: 'codex',
                avatar: { kind: 'initials', value: 'C', tint: '#0EA5E9' } },
      kind: 'task_event', content: [],
      taskEvent: { taskId: 'T-11', title: '实现会话总线与 @ 路由', assigneeId: 'coder_a',
                   assigneeName: 'Coder-A', state: 'in_progress', linkedMessageId: 'm003' },
      mentions: [], createdAt: now - 5 * hr,
    },
    {
      id: 'm006', conversationId: 'grp_desktop',
      sender: { id: 'coder_a', name: 'Coder-A', kind: 'agent', engineId: 'codex',
                avatar: { kind: 'initials', value: 'C', tint: '#0EA5E9' } },
      kind: 'tool_event', content: [],
      toolEvent: { tool: 'write_file', action: 'src/bus.py', resultSummary: '+142 行，MessageBus.publish / route',
                   hasAuditDetail: true, approval: 'approved' },
      mentions: [], createdAt: now - 4 * hr,
    },
    {
      id: 'm007', conversationId: 'grp_desktop',
      sender: { id: SELF_ID, name: 'Bo', kind: 'user', avatar: { kind: 'initials', value: 'Bo', tint: '#E39B12' } },
      kind: 'human', content: [{ type: 'text', text: '@Coder-A 测试覆盖到了吗？把结果贴群里。' }],
      mentions: ['coder_a'], createdAt: now - 2 * hr,
    },
    {
      id: 'm008', conversationId: 'grp_desktop',
      sender: { id: 'coder_a', name: 'Coder-A', kind: 'agent', engineId: 'codex',
                avatar: { kind: 'initials', value: 'C', tint: '#0EA5E9' } },
      kind: 'agent', content: [{ type: 'text', text: '测试已通过：路由、未读计数、草稿保存三条链路各 4 例，全绿。' }],
      mentions: [], createdAt: now - 118 * min,
      replyTo: { id: 'm007', senderName: 'Bo', preview: '@Coder-A 测试覆盖到了吗？把结果贴群里。' },
    },
    {
      id: 'm009', conversationId: 'grp_desktop',
      sender: { id: 'reviewer_1', name: 'Reviewer', kind: 'agent', engineId: 'claude-code',
                avatar: { kind: 'initials', value: 'R', tint: '#D97706' } },
      kind: 'tool_event', content: [],
      toolEvent: { tool: 'request_approval', action: '写入 src/router.py（覆盖已有文件）',
                   hasAuditDetail: true, approval: 'pending' },
      mentions: [], createdAt: now - 60 * min,
    },
    {
      id: 'm010', conversationId: 'grp_desktop',
      sender: { id: 'bot_summary', name: '总结', kind: 'system', engineId: 'echo',
                avatar: { kind: 'initials', value: '总', tint: '#898A8B' } },
      kind: 'summary', content: [],
      summary: {
        index: 3, period: '阶段总结 #03',
        decisions: ['确认桌面端优先，基准 1440×900。'],
        progress: ['完成会话列表与消息流。', '@ 路由与未读计数已联通。'],
        blockers: ['插件监听协议未定，暂用轮询。'],
        coversFrom: 'm001', coversTo: 'm009',
      },
      mentions: [], createdAt: now - 12 * min,
    },
  ],
  dm_pm: [
    {
      id: 'p001', conversationId: 'dm_pm',
      sender: { id: 'pm', name: 'PM', kind: 'agent', engineId: 'openai',
                avatar: { kind: 'initials', value: 'P', tint: '#17A53A' } },
      kind: 'agent', content: [{ type: 'text', text: '需求文档已生成，请确认。确认后我再创建业务成员。' }],
      mentions: [], createdAt: now - 42 * min,
    },
  ],
  dm_hermes: [
    {
      id: 'h001', conversationId: 'dm_hermes',
      sender: { id: SELF_ID, name: 'Bo', kind: 'user', avatar: { kind: 'initials', value: 'Bo', tint: '#E39B12' } },
      kind: 'human', content: [{ type: 'text', text: '帮我分析这个目录的结构。' }],
      mentions: [], createdAt: now - 3 * hr - 4 * min,
    },
    {
      id: 'h002', conversationId: 'dm_hermes',
      sender: { id: 'hermes', name: 'Hermes 助手', kind: 'agent', engineId: 'hermes',
                avatar: { kind: 'initials', value: 'H', tint: '#7C3AED' } },
      kind: 'agent',
      content: [{ type: 'text', text: '可以。当前会话已获得只读工作区权限。' },
                { type: 'code', lang: 'text', text: 'oqqq-desktop/\n├─ src/        运行时代码\n├─ docs/       需求与公约\n└─ tests/      端到端用例' }],
      mentions: [], createdAt: now - 3 * hr,
    },
  ],
  dm_coder: [
    {
      id: 'c001', conversationId: 'dm_coder',
      sender: { id: 'coder_a', name: 'Coder-A', kind: 'agent', engineId: 'codex',
                avatar: { kind: 'initials', value: 'C', tint: '#0EA5E9' } },
      kind: 'agent', content: [{ type: 'text', text: '测试已通过。' }],
      mentions: [], createdAt: now - 26 * hr,
    },
  ],
};
