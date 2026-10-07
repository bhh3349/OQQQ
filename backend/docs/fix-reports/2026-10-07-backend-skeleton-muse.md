# 后端骨架搭建 — muse

日期：2026-10-07

## 做了什么

搭建 `backend/` Node.js + TypeScript + Fastify 骨架（P0）：

- `src/types.ts` — 核心领域类型（Session/Member/Message/Engine/Skill/Connector/PluginItem），与前端设计文档数据模型对应
- `src/bus/index.ts` — 内存消息总线（发布/订阅/历史，接口预留以后换 SQLite）
- `src/router/index.ts` — `@` 解析与路由（@名字 → member id，未知名字原样保留）
- `src/session/index.ts` — 会话管理（建群/单聊、成员、群主/管理员/成员角色、独立工作区、群公告）
- `src/adapters/types.ts` — AgentAdapter 统一接口（checkInstalled/chat/install/update/uninstall）
- `src/adapters/echo.ts` — Echo 测试适配器（无 key 可跑通全链路）
- `src/adapters/dsh.ts` — DeepSeek Harness 适配器（调 `dsh --profile headless --json`，NDJSON 逐行流式解析，--session-id 续会话）
- `src/server.ts` — Fastify + WebSocket 服务（/ws 消息双向流、/api/sessions、/api/sessions/:id/messages）

## 验证

- `npx tsc --noEmit` 通过
- 服务启动于 127.0.0.1:18791
- WebSocket 端到端验证通过：发送 `@PM 你好` → 路由命中 PM → EchoAdapter 流式返回 `echo: @PM 你好`

## 待办

- dsh build 完成后用真 key 跑通 DshAdapter（需 Bo 提供 DEEPSEEK_API_KEY）
- Hermes / Claude Code / Codex 适配器（P1）
- PM 动态组队、30 条总结、项目档案导出（P2+）
