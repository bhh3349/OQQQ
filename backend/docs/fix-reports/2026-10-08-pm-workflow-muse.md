# Fix Report — PM 工作流接入主流程 (pm workflow wiring)

- 日期：2026-10-08
- AI：muse
- 文件：`backend/src/adapters/types.ts`、`backend/src/types.ts`、
  `backend/src/adapters/openai.ts`、`backend/src/pm/index.ts`、
  `backend/src/server.ts`

## 背景

PM 模块（访谈 → 确认 → 组队）之前是孤岛：`PmAgent` 写了但没接进 server，
PM 成员用的还是 echo 引擎，interview prompt 没地方注入。

## 变更

### 1. per-agent system prompt（`adapters/types.ts`、`types.ts`）

- 新增 `ChatOpts { systemPrompt?: string }`，`AgentAdapter.chat()` 第三个可选参数。
  兼容：旧适配器不用改（可选参数）。
- `Member` 加 `systemPrompt?: string` 字段。

### 2. OpenAIAdapter（`adapters/openai.ts`）

- `chat(history, workspace, opts?)` 透传 `opts.systemPrompt`，
  覆盖默认的 coding-agent prompt。

### 3. PmAgent.proposeTeam（`pm/index.ts`）

- 用户确认需求后，拿最近 40 条访谈记录调 LLM（OpenAIAdapter），
  要求只输出 JSON 数组：`[{name, avatar, role, systemPrompt, engine, skills, connectors}]`。
- 解析 `[...]` 包裹的 JSON，失败抛错。`engine` 固定 `openai`。

### 4. Server 接入（`server.ts`）

- demo 群的 PM：有 `OQQQ_API_KEY` 时引擎切 `openai`（否则 echo），
  `systemPrompt = PmAgent.interviewPrompt()`。
- WS dispatch 时透传 `target.systemPrompt`。
- PM workflow REST：
  - `GET /api/sessions/:id/pm` → `{phase, spec}`
  - `POST /api/sessions/:id/pm/confirm` → interview → spec_ready
  - `POST /api/sessions/:id/pm/propose-team` → LLM 生成团队规格
  - `POST /api/sessions/:id/pm/form-team` → 创建 agent 成员并注入各自 systemPrompt
- `POST /api/sessions/:id/archive` → `ArchiveManager.build()` 导出项目档案 JSON
  （修正：之前误调不存在的 `exportProject`，实为 `build`）。

## 验证

- `npx tsc --noEmit` 通过。
- 真机 REST：`/pm` → `{"phase":"interview"}`；`/pm/confirm` →
  `{"phase":"spec_ready"}`；`/archive` → 完整档案 JSON。
- `proposeTeam` 未真机跑（需 key），逻辑与 mock 测试过的 chat 链路一致。

## 已知限制

- `proposeTeam` 的 JSON 解析较脆弱（靠 `[`/`]` 截取），LLM 输出不规范会抛错，
  前端应展示 error 给用户重试。
- 多群时 `pmAgent` 是单例，phase/spec 按 demo 群写死；多会话 PM 需要按 session
  拆实例（P1）。
