# Fix Report — 引擎注册表 + 真实安装（ekko-style engine registry）

- 日期：2026-10-08
- AI：muse
- 文件：`backend/src/engines/registry.ts`（新增）、`backend/src/adapters/cli.ts`（重写）、
  `backend/src/adapters/hermes.ts`、`backend/src/server.ts`、`backend/docs/API-CONTRACT.md`

## 背景

参考 ekko-studio（11k star）的 Agent Manager：定义注册表 + `npm install -g`
真安装 + `--version` 真实探测。OQQQ 之前的问题：
- `install()` 基本全是 `throw "managed externally"`（假按钮）。
- `/api/engines` 的 installed 状态是 hardcode 的，经真机验证是假数据
  （本机实际只有 codex、dsh 装了，hermes/claude-code 都没装）。

## 变更

### 1. 引擎注册表（`src/engines/registry.ts`，新增）

`ENGINE_DEFINITIONS`：id、name、avatar、command、packageName、docsUrl。
8 个引擎：hermes、claude-code（`@anthropic-ai/claude-code`）、codex
（`@openai/codex`）、opencode（`opencode-ai`）、grok（`@xai-official/grok`）、
dsh、openai（API 免安装）、echo（内置）。

配套函数：`npmInstall`（10min 超时）、`npmUpdate`、`npmUninstall`、
`probeVersion`（`<command> --version` 解析版本号）。
无 packageName 的引擎抛 `code: "MANUAL_INSTALL"` + docsUrl。

### 2. CLI 适配器重构（`src/adapters/cli.ts`）

- 通用 `CliAdapter` 基类：全部走注册表（check/install/update/uninstall）。
- 新增 `OpenCodeAdapter`（`opencode run`）、`GrokAdapter`。
- 保留 `ClaudeCodeAdapter`（`claude -p --output-format text`）、
  `CodexAdapter`（`codex exec --skip-git-repo-check`）为具名子类。

### 3. Server（`src/server.ts`）

- `/api/engines` 改为实时探测（每个引擎跑 `checkInstalled()`），不再 hardcode。
- 新增 `POST /api/engines/:id/update`、`POST /api/engines/:id/uninstall`，
  成功后返回刷新后的引擎列表。
- `install` 失败时透出 `code: "MANUAL_INSTALL"`，前端展示"去官网安装"。
- Hermes 的 install 错误加上 `code: "MANUAL_INSTALL"`。

### 4. 契约文档（`docs/API-CONTRACT.md`）

- 更新引擎接口：实时探测说明、MANUAL_INSTALL 流程、8 引擎清单。

## 验证

- `npx tsc --noEmit` 通过。
- 真机 `/api/engines`：8 引擎，codex `installed v0.149.0`、dsh `installed`、
  其余 `not_installed`——与本机 `which` 结果一致。
- `POST /engines/hermes/install` → `{ok:false, code:"MANUAL_INSTALL",
  error:"install hermes via the official installer: https://github.com/NousResearch/Hermes"}`。

## 已知限制

- 真 `npm install -g` 未跑（耗时长，留给 Bo 在本机验证）。
- `npmUpdate` 实际是重装最新版（ekko-studio 同策略）。
