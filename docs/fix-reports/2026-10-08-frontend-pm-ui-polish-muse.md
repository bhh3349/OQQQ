# Fix Report — 前端 PM 流程 UI + 视觉 Polish

**日期**: 2026-10-08
**作者**: Muse
**提交**: 626228d (GitHub), afe7a1d (Windows 本地)

## 背景

Bo 反馈前端"好像做的也不咋样"。经审查发现两个层面问题：
1. **功能缺失**：PM 流程（访谈→确认→组队）后端已实现，前端零 UI
2. **视觉细节**：版本号裸 "v"、标题栏过饱和等

## 改动

### 1. PM 流程 UI（核心功能补齐）

**问题**：`pmConfirm`/`pmProposeTeam`/`pmFormTeam` 在 LiveClient 已实现、store 已暴露，但 pages/components 零调用。OQQQ 核心的"AI 项目经理"流程在前端不可见、不可操作。

**改动**：
- `src/components/chat/RightInspector.tsx`：新增第 4 个 Tab「项目」，内含 `ProjectPane` 组件
  - 阶段步骤条：需求访谈 → 需求确认 → 团队组建 → 开发中 → 已完结（当前高亮、已完成打勾）
  - `interview`：显示"确认需求文档"按钮 → `client.pmConfirm`
  - `spec_ready`：显示"生成团队方案"按钮 → `client.pmProposeTeam`
  - 方案生成后：展示团队成员列表（头像/姓名/角色/引擎）+ "确认组队"/"重新生成" → `client.pmFormTeam`
  - `team_formed`/`working`：展示团队成员
  - `done`/`archived`：展示完结状态
- `src/store/useOqqq.ts`：补暴露 `phaseOf`（此前 ProjectPane 调用时 undefined 导致白屏，已修）

### 2. 视觉 Polish

- **版本号裸 "v"**：`ContactsPage.tsx`（2 处）、`CapabilityPage.tsx`（1 处）的 `v{version}` 在 version 为空时显示裸 "v"，改为仅当 version 非空时渲染
- **标题栏**：`tokens.css` 的 `--titlebar-grad` 从 `#2DA2F0→#0099FF`（过饱和刺眼）改为 `#2B8FD9→#147BC5`（沉稳深蓝）

### 3. 样式

- `src/styles/chat.css`：新增 `.pm-steps`、`.pm-step`、`.pm-action`、`.pm-team` 样式

## 验证

- `npx tsc --noEmit`：0 错误（本地 + Windows）
- Playwright 7 页回归截图：0 console 错误
- PM Tab 交互测试：Tab 出现、阶段步骤条渲染、"确认需求文档"按钮正常显示
- 曾出现白屏：`useClient` 未暴露 `phaseOf`，已补

## 同步状态

- ✅ GitHub `main`：626228d（经 github skill push_files）
- ⚠️ Windows 本地：afe7a1d（`git push` 被系统代理拦，待 Bo 本机网络恢复后 `git pull --rebase` 或 `git reset --hard origin/main`）
