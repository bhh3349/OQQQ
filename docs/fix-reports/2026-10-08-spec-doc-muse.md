# Fix Report — 需求文档生成功能

**日期**: 2026-10-08
**作者**: Muse
**提交**: 25d98dde (GitHub)

## 背景

Bo 要求"先把需求文档的功能实现"。经检查发现：

- 后端 `POST /pm/confirm` 只是 `phase = "spec_ready"`，**根本没有需求文档**
- 前端项目 Tab 的"确认需求文档"按钮点了就直接切换 phase，用户没看过任何文档

## 实现

### 后端

**`backend/src/pm/index.ts`**：
- 新增 `specDoc: string | null` 字段存储需求文档
- 新增 `async generateSpecDoc(history, workspace)`：
  - 有 OpenAI 兼容 key 时：调用 LLM 基于访谈历史生成结构化 markdown 文档（含项目概述、功能清单、验收标准、技术约束、待澄清问题）
  - 无 key（echo 模式）时：基于真实访谈消息拼基础文档（非虚构，标注"未接 LLM"）
- 新增 `getSpecDoc()` 返回文档

**`backend/src/server.ts`**：
- 新增 `POST /api/sessions/:id/pm/spec-doc`：生成需求文档
- `GET /api/sessions/:id/pm` 返回加上 `specDoc` 字段

### 前端

**`frontend/src/data/live/liveClient.ts`**：
- 新增 `pmSpecDoc` 缓存字段
- 新增 `pmGenerateSpecDoc(cid)`：调 `/pm/spec-doc`，缓存并 commit
- 新增 `specDocOf(cid)`：读缓存
- 初始化时从 `GET /pm` 加载已有 specDoc

**`frontend/src/store/useOqqq.ts`**：暴露 `pmGenerateSpecDoc`、`specDocOf`

**`frontend/src/components/chat/RightInspector.tsx`**（ProjectPane）：
- interview 阶段改为两步：
  1. 无文档时：显示"生成需求文档"按钮 + 说明文字
  2. 有文档时：展示文档（`.pm-doc` 卡片，含标题栏+重新生成按钮）+ "确认需求文档"按钮
- 确认后进入 spec_ready（原有流程不变）

**`frontend/src/styles/chat.css`**：新增 `.pm-doc`、`.pm-doc__head`、`.pm-doc__body` 样式

## 验证

- 后端 `npx tsc --noEmit`：0 错误（本地 + Windows）
- 前端 `npx tsc --noEmit`：0 错误
- 本地后端联调：
  - `POST /pm/spec-doc` → 返回文档 ✅
  - `GET /pm` → 含 specDoc ✅
  - `POST /pm/confirm` → phase 变为 spec_ready ✅
  - WS 发消息后生成文档，访谈记录摘要含真实用户消息 ✅

## 待办

- ⚠️ Windows 后端需重启以加载新代码（MCP 通道中断，待恢复后操作）
- ⚠️ Windows 前端联调测试（项目 Tab 生成/展示/确认流程）待 MCP 恢复后执行
- Windows 本地 `afe7a1d` commit 待 `git pull --rebase` 同步
