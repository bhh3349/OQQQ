# Fix Report — DshAdapter 改走 SDK client (dsh sdk client)

- 日期：2026-10-08
- AI：muse
- 文件：`backend/src/adapters/dsh.ts`（重写）

## 背景

dsh SDK stdio 冒烟测试通过（`dsh --profile sdk` + 官方 TS client）：
launch、initialize 握手、建会话、prompt、通知流（session.event/status）、
完整 turn 生命周期、干净关闭——全通。结论：生产用 SDK，不用 headless CLI。

## 变更

`DshAdapter` 从"每 turn 起 CLI 进程解析 NDJSON"改为官方 SDK client：

- 常驻进程：第一次 `chat()` 时 `import` SDK client 并 `start()`，
  一个 `dsh --profile sdk` 子进程服务所有会话。
- 会话映射：dsh 侧 session id = `oqqq-<OQQQ sessionId>`（从 history 取），
  SDK 懒创建/复用。
- 流式：`session.run(prompt, {onNotification})` 监听 `assistant/message`
  事件，按消息级 yield 文本（非 token 级；dsh 引擎是次选路径，可接受）。
  去重逻辑：事件可能重复全量 message，只 yield 未见过的 suffix。
- `provider` 固定 `deepseek-official`（SDK server 只认这个，传别的直接
  报 `no adapter registered`）。
- 新增 `dispose()`：关闭常驻子进程。
- `checkInstalled()` 改为检查 SDK client 文件存在。

## 验证

- `npx tsc --noEmit` 通过。
- 真机（无 key）：`installed: true`；`chat()` 建连→握手→turn→关闭全正常，
  0 文本块（符合预期，有 key 时才有 assistant 文本）。

## 已知限制

- 流式是消息级不是 token 级。
- 多 workspace 共用一个 harness（cwd 取首次启动的 workspace）；多会话
  不同 workspace 需要按 workspace 拆 harness 实例（P2）。
- `harness` 类型为 `any`（SDK 类型导出不全），可接受。
