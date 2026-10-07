# OQQQ 后端 API / WebSocket 契约

> 给前端开发者：照这份文档写，写完直接能对上。后端已实现并真机验证。
> 后端默认地址：`http://127.0.0.1:18791`（`PORT` 环境变量可改）。

---

## 1. WebSocket（消息主通道）

```
ws://127.0.0.1:18791/ws?session=<sessionId>
```

### 服务端 → 客户端

**hello**（连接建立后第一帧）
```json
{ "type": "hello", "session": "<sessionId>", "recent": [Message, ...] }
```
`recent` 是该会话最近的消息（含历史），前端直接渲染。

**message**（新消息，含他人/Agent 发的）
```json
{ "type": "message", "message": { ...Message } }
```

**delta**（Agent 回复的流式增量）
```json
{ "type": "delta", "id": "<replyId>", "delta": "增量文本" }
```
前端按 `id` 把 delta 拼到同一条气泡里；`message` 事件到达时视为该条完成。

### 客户端 → 服务端

```json
{ "type": "send", "from": "bo", "text": "@PM 你好" }
```
- `text` 最长 4000 字符，超长后端截断。
- `@名字` 提及某成员（`@PM`、`@前端`）；无提及时群聊默认派给 PM，单聊不自动派单。

### Message 结构

```ts
interface Message {
  id: string;
  sessionId: string;
  kind: "text" | "tool_call" | "file" | "summary" | "system";
  from: string;          // 成员 id（"bo" / "pm" / agent id）
  ts: number;            // ms 时间戳
  payload: TextPayload | ToolCallPayload | FilePayload | SummaryPayload | SystemPayload;
}
interface TextPayload    { text: string; mentions: string[] }
interface ToolCallPayload{ tool: string; args: string; result?: string; open?: boolean }
interface FilePayload    { name: string; url: string; size: number }
interface SummaryPayload { period: string; decisions: string[]; progress: string[]; blockers: string[] }
interface SystemPayload  { html: string }
```

渲染建议：
- `text`：普通气泡；`from` 是自己右对齐，否则左对齐 + 头像。
- `tool_call`：折叠卡片（`open` 控制展开），标题 `🔧 tool`，展开显示 args/result。
- `summary`：居中系统样式卡片，展示 decisions/progress/blockers。
- `system`：灰色居中小字（`html` 可直接渲染）。

---

## 2. REST 接口

### 会话

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/sessions` | 会话列表（含成员、role、workspace） |
| GET | `/api/sessions/:id/messages` | 最近 100 条消息 |
| POST | `/api/sessions` | 建会话。body `{kind:"group"\|"dm", name?, peerId?}`；group 自动配 PM（admin）；dm 的 `peerId` 是对方 agent id（可选，不填则空聊） |

`Member` 结构：
```ts
interface Member {
  id: string; name: string; avatar: string;   // avatar 是 emoji 或 url
  role: "owner" | "admin" | "member";
  kind: "user" | "agent";
  engine?: string;        // agent 背后引擎：hermes / claude-code / codex / dsh / openai / echo
  systemPrompt?: string;  // agent 的 system prompt（可展示/编辑）
  online: boolean;
}
```

### 引擎（联系人 → 添加 agent）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/engines` | 引擎列表（**实时探测**：跑 `<command> --version`，非 hardcode） |
| POST | `/api/engines/:id/install` | 真安装（`npm install -g`）；原生引擎返回 `{ok:false, code:"MANUAL_INSTALL", error:"官网链接"}` → 前端展示"去官网安装" |
| POST | `/api/engines/:id/update` | 更新到最新版 → 返回刷新后的引擎列表 |
| POST | `/api/engines/:id/uninstall` | 卸载 → 返回刷新后的引擎列表 |

```ts
interface Engine { id: string; name: string; avatar: string; version: string; status: "installed" | "not_installed" }
```

支持的引擎（`src/engines/registry.ts`）：hermes、claude-code（`@anthropic-ai/claude-code`）、codex（`@openai/codex`）、opencode（`opencode-ai`）、grok（`@xai-official/grok`）、dsh、openai（API，无需安装）、echo（内置）。

### 技能 / 连接器

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/skills` | `{id, name, desc, installed}` 数组 |
| GET | `/api/connectors` | `{id, name, desc, connected}` 数组 |

### 插件广场（第三方，dsh-1024store）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/plugins/search?q=&page=&limit=` | 搜索 → `{ok, total, results:[{id,name,owner,url,category,description,install,target,stars,installCount}]}` |
| GET | `/api/plugins/permissions?target=github:owner/repo` | 权限声明 → `{ok, target, permissions:[...], repo}` |
| POST | `/api/plugins/install` | body `{target, confirmed: string[]}`；`confirmed` 必须与 permissions 接口返回的列表**完全一致**，否则 拒绝安装 |

**安装流程（必须照做，不能做假按钮）**：
1. 搜索 → 展示插件卡片 → 用户点"安装"
2. 调 `permissions` 取权限列表 → 弹窗展示 → 用户勾选"我已阅读并同意"
3. 调 `install`（带上确认的权限列表）→ 真实执行 `dsh plugin add`
4. 失败时展示 `error`（如配额用尽、权限不一致）

### PM 工作流（项目群核心流程）

```
用户和 PM 访谈 → 前端调 /pm/confirm → 调 /pm/propose-team 拿规格 →
用户确认规格 → 调 /pm/form-team 建成员 → Agent 开工
```

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/sessions/:id/pm` | `{phase:"interview"\|"spec_ready"\|"team_formed"\|"working"\|"done", spec:[]}` |
| POST | `/api/sessions/:id/pm/confirm` | 用户确认需求文档 → phase 切 `spec_ready` |
| POST | `/api/sessions/:id/pm/propose-team` | LLM 按访谈记录生成团队规格 → `{ok, spec:[{name,avatar,role,systemPrompt,engine,skills,connectors}]}` |
| POST | `/api/sessions/:id/pm/form-team` | 创建 agent 成员并注入 systemPrompt → `{ok, members:[ids]}` |
| POST | `/api/sessions/:id/archive` | 导出项目档案 JSON → `{ok, archive}` |

注意：
- `propose-team` 失败时返回 `{ok:false, error}`（LLM 输出不规范），前端展示错误 + 重试按钮。
- 单聊（dm）没有 PM，调 PM 接口返回 `{ok:false, error:"no PM in this session"}`。
- `phase` 流转由后端维护，前端只读 + 调 confirm。

---

## 3. 错误格式

所有 REST 失败统一：
```json
{ "ok": false, "error": "人类可读的错误信息（已截断）" }
```
WS 不会推 error 帧；畸形客户端帧被静默忽略。

---

## 4. 环境变量（部署相关，前端不用管）

| 变量 | 说明 |
|---|---|
| `PORT` | 监听端口，默认 18791 |
| `OQQQ_API_KEY` | OpenAI 兼容供应商 key；有则启用 openai 引擎 |
| `OQQQ_BASE_URL` | 供应商地址，默认 `https://api.deepseek.com` |
| `OQQQ_MODEL` | 模型名，默认 `deepseek-chat` |
| `OQQQ_SUMMARY_EVERY` | 总结触发条数，默认 30 |
| `DSH_DIR` / `DSH_BIN` | dsh 源码目录 / CLI 路径 |
