# Fix Report — backend 批量补记 (4f41f50 / 37706a2 / 48f4c79 / 5fdc13a / b2547a8)

- 日期：2026-10-08（补记，实际变更 2026-10-07）
- AI：muse
- 说明：此前几次提交未同步写 fix-report，违反硬规则，现补记。

## 4f41f50 — Claude Code / Codex 适配器

- 文件：`backend/src/adapters/cli.ts`
- `ClaudeCodeAdapter` / `CodexAdapter`：headless CLI 骨架，
  `checkInstalled()` 跑 `--version` 探测。
- 未实测：当时 Bo 本机未装这两个引擎，参数未逐一校正。

## 37706a2 — 总结触发器 + 项目档案

- 文件：`backend/src/summary/index.ts`、`backend/src/archive/index.ts`
- `SummaryManager`：统计有效消息（text/tool_call/file），排除 thinking/原始工具调用/
  大段日志/闲聊；达阈值（默认 30，可配）触发，发布 `summary` 消息。
- `ArchiveManager`：项目完结导出 JSON，含 agent 规格、system prompt、总结链、
  公告、约束、文件清单、完成内容、遗留问题、用户偏好。

## 48f4c79 — PM 动态组队

- 文件：`backend/src/pm/index.ts`
- `PmAgent`：需求访谈 → 需求文档 → 用户确认后动态创建 agent（职责/prompt/
  技能/连接器）→ 拉群。用户默认群主、PM 默认管理员。

## 5fdc13a — Hermes 适配器

- 文件：`backend/src/adapters/hermes.ts`
- `HermesAdapter`：`hermes chat -q` 调用骨架。
- **已知问题**：用了 `--yolo`，与"危险操作必须审批"冲突，待改。
- Hermes 与 dsh 是独立项目，OQQQ 分别写适配器，组合关系是 OQQQ 自己的设计。

## b2547a8 — 注册全部适配器

- 文件：`backend/src/server.ts`
- adapters Map 注册：echo、dsh、claude-code、codex、hermes。
- 后续 `adf1d3a` 又加了 openai（`OQQQ_API_KEY` 存在时注册）。

## 待办（跨提交）

1. Hermes 去掉 `--yolo`，接入审批。
2. DshAdapter 的 `checkInstalled()` 用 `DSH_DIR` 但 `chat()` 切 cwd 后 `pnpm dsh`
   可能找不到 script，需修正并实测。
3. Claude Code / Codex / Hermes 逐一真机 `--help` 校正参数。
4. adapter 错误/退出码/stderr/超时结构化事件。
