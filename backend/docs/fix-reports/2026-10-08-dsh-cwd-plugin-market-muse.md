# Fix Report — DshAdapter cwd 修复 + 插件广场 API (dsh cwd + plugin market)

- 日期：2026-10-08
- AI：muse
- 文件：`backend/src/adapters/dsh.ts`（重写）、`backend/src/plugins/index.ts`（新增）、
  `backend/src/server.ts`

## 1. DshAdapter cwd 修复

**问题**：`checkInstalled()` 在 `DSH_DIR` 下跑 `pnpm dsh`，但 `chat()` 把 cwd
切到会话 workspace 后同样跑 `pnpm dsh`——workspace 里没有 dsh script，会失败。

**调查**：
- dsh headless 没有 `--cwd` 参数，session 的 cwd = 进程 cwd。
- `pnpm --dir DSH_DIR dsh` 能跑，但 cwd 被钉在 DSH_DIR，不是会话 workspace。
- `pnpm run build` 产物 `apps/cli/lib/bin.js` 可直接 `node` 运行。

**修复**：`node <DSH_DIR>/apps/cli/lib/bin.js --profile headless --json`，
`cwd` = 会话 workspace。`DSH_BIN` 环境变量可覆盖绝对路径。
`checkInstalled()` 改为 `existsSync(DSH_BIN)` + 跑 `--help` 探测。

**验证**：`checkInstalled()` → true；`/tmp/dsh-ws-test` 下跑 session，
`session.cwd` 正确为 workspace。

## 2. 插件广场 API（dsh-1024store）

**数据源**：`https://api.deepseek1024.com`（免费，匿名 50/天）。
实测 `GET /v1/plugins/search?q=timer` 返回 15 条。

**接口**：
- `GET /api/plugins/search?q=&page=&limit=` — 代理搜索，429 时报配额用尽。
- `GET /api/plugins/permissions?target=github:owner/repo` — 读插件
  `package.json` 的 `dsh.permissions` 声明，供前端做权限确认。
- `POST /api/plugins/install` `{target, confirmed[]}` — 真安装
  （`dsh plugin --profile web add <target>`），`confirmed` 必须与
  `permissions()` 返回的列表完全一致，否则拒绝。前端跳过确认页就装不上。

**坑**：`raw.githubusercontent.com` 在 Node fetch 下被代理卡死（curl 正常）。
改走 GitHub contents API（base64 解码），2s 返回。search 也加了 20s 超时。

**验证**：search 真机通；permissions 真机通（示例插件未声明权限，
返回 "(manifest declares no permissions — review repo before installing)"，
前端必须展示此警告）。

## 已知限制

- `install` 未真机跑（会实际装插件，留给 Bo 在本机验证）。
- 匿名配额 50/天；高频用需接 GitHub 登录的 API key（P2）。
