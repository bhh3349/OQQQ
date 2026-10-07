# Fix Report — 自主模式：去掉审批，静默安全栏 (autonomous mode)

- 日期：2026-10-08
- AI：muse
- 文件：`backend/src/adapters/openai.ts`、`backend/src/adapters/hermes.ts`

## 决策

Bo 明确需求：**agent 自己完成开发，不要任何审批打断**。
OQQQ 后端改为默认全自主模式（autonomous mode），审批机制直接拿掉，不做开关。

## 变更

### `src/adapters/openai.ts`

- `exec` 工具：无审批直接执行。加了一条静默 denylist（`DANGEROUS_RE`），只拦
  灾难性命令：`rm -rf /`、`rm -rf /*`、`mkfs`、`dd of=/dev/`、fork bomb、
  `shutdown/reboot/poweroff`。命中时返回 `error: command blocked by safety denylist`，
  不弹任何 UI。
- 保留的隐形护栏（都不打扰用户）：
  - 路径沙箱：`safePath()` 约束在 workspace 内
  - `exec` 120s 超时、输出截断 8KB
  - agent 循环最多 10 轮

### `src/adapters/hermes.ts`

- `--yolo` 从"已知问题"改为"有意设计"：注释更新，自主模式下 Hermes 全速运行。
- 之前 fix-report 里记的"Hermes 去 --yolo 接审批"待办项关闭。

## 影响

- PM 派单后，agent 从读需求、写代码、跑测试到修错全程无人值守。
- 风险面：workspace 沙箱是主要边界；`exec` 可跑任意非 denylist 命令。
  这是 Bo 明确接受的 trade-off。
