# Fix Report — backend: OpenAI 工具循环 + REST 接口 + 总结接入 (adf1d3a)

- 日期：2026-10-08
- AI：muse
- 提交：`adf1d3a`（`b2547a8..adf1d3a`）
- 文件：`backend/src/adapters/openai.ts`、`backend/src/server.ts`、`backend/src/summary/index.ts`

## 背景

Bo 确认常用供应商是 OpenAI 兼容协议。dsh 自带的 deepseek provider 只讲 Anthropic
Messages 协议，没有 OpenAI 兼容 provider。决策：OQQQ adapter 层直调 OpenAI 兼容
API（Chat Completions + SSE），dsh 只当插件/工具底座，不走它的 LLM。

## 变更

### 1. OpenAIAdapter 工具调用循环（`src/adapters/openai.ts` 重写）

- 三个内置工具（OpenAI function calling 格式）：
  - `read_file(path)` — 读工作区文件
  - `write_file(path, content)` — 写工作区文件（自动建目录）
  - `exec(command)` — 工作区内跑 shell，120s 超时，输出截断 8KB
- agent 循环：最多 10 轮（`maxIterations` 可配），流式收 `delta.content` +
  拼接分片的 `tool_calls`，执行工具后把结果以 `tool` 消息回填，继续下一轮；
  无工具调用即结束。
- 路径沙箱：`safePath()` 把相对路径约束在 workspace 内，逃逸抛错。
- `onTool` 回调：每次工具执行后触发，供 server 发布 `tool_call` 消息（前端折叠卡）。
- `toolPayload()`：把工具事件转成 `ToolCallPayload`（args/result 截断）。

### 2. Server 接入（`src/server.ts`）

- OpenAIAdapter 的工具事件 → `bus.publish` 为 `tool_call` 消息，WS 实时推送。
- SummaryManager 接入消息流：每 30 条有效消息（`OQQQ_SUMMARY_EVERY` 可配）
  触发一次，发布 `summary` 消息。
- 新增 REST 接口（供前端 联系人/技能/连接器 页面）：
  - `GET /api/engines` — 引擎列表（安装状态）
  - `POST /api/engines/:id/install` — 安装引擎
  - `GET /api/skills` — 技能列表
  - `GET /api/connectors` — 连接器列表
- OpenAI 引擎的安装状态由 `OQQQ_API_KEY` 是否存在决定。

### 3. SummaryManager（`src/summary/index.ts`）

- 加 `every` getter，替代 server 侧的私有字段 hack。

## 验证

- `npx tsc --noEmit` 通过。
- 工具循环 mock 测试：第一轮返回 `write_file` tool_call → 文件落盘
  → 第二轮纯文本回复 → 循环结束。`TEXT: "done, file written"`，
  `FILE: "hi from agent"`。
- WS 端到端：`@PM 你好` → 路由命中 PM → echo 回复。
- REST：`/api/engines`、`/api/skills`、`/api/connectors` 均返回 JSON。
- Windows 侧 `git push` 成功（`b2547a8..adf1d3a`）。

## 已知限制

- 工具执行无二次审批：`exec` 直接跑。Hermes 适配器的 `--yolo` 问题同理，
  危险操作审批机制尚未实现（P1）。
- 总结内容目前是占位结构（decisions/progress/blockers 为空），真正的内容生成
  需要 PM agent（LLM）接入后填充。
- `write_file` 覆盖不提示，`exec` 无 allowlist。
