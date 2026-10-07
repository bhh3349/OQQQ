# Fix Report — 多会话 PM + 建会话 API + 单测 (multi-session)

- 日期：2026-10-08
- AI：muse
- 文件：`backend/src/server.ts`、`backend/src/summary/index.ts`、
  `backend/src/core.test.ts`（新增）

## 变更

### 1. PM 按会话实例化（`server.ts`）

- 干掉单例 `pmAgent`，改成 `pmAgents: Map<sessionId, PmAgent>`。
- `makePmMember()` 工厂：每个新项目群自动配 PM（owner=Bo、admin=PM，
  引擎有 key 时 openai、无 key 时 echo）。
- PM workflow 的 4 个 REST 接口全部改走 `needPm(id)` 按会话取实例，
  无 PM 的会话（如单聊）返回 `ok:false`。

### 2. 建会话 API（`server.ts`）

- `POST /api/sessions`：`{kind:"group"|"dm", name?}`。
  - group：自动建 workspace、拉 PM、注册 PmAgent。
  - dm：只建会话，不配 PM（单聊走 @ 指定 agent）。
- 真机验证：新建群 → `/pm` 返回 `{"phase":"interview"}`；会话列表 2 个。

### 3. SummaryManager 自动重置（`summary/index.ts`）

- `count()` 触发阈值时自动清零。之前触发后每次都返回 true，
  server 侧要手动 `reset()` 容易漏。

### 4. 单测（`core.test.ts`，`npm test`）

- router：@ 解析、broadcast、未知名保留、去重（4）
- session：owner/admin、owner 不可删、重复成员拒绝（3）
- summary：阈值触发+自动重置、publishSummary 发消息（2）
- archive：档案结构完整（1）
- bus：recent 取 N 条、订阅/退订隔离（2）
- 结果：12/12 通过。

## 验证

- `npx tsc --noEmit` 通过；`npm test` 12 pass 0 fail。
- 真机：建群、查 PM 阶段、会话列表均正常。
