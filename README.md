# OQQQ

QQ 式群聊多 Agent 开发工作台：**一个客户端，对接所有 agent**。

## 产品一句话

用户先和 PM Agent 聊需求 → PM 输出需求文档（用户确认后才开工）→ PM 按需创建 Agent 拉进项目群 → 群内 `@Agent` 派单协作 → 自动写代码、执行、修错、评审、交付。

## QQ 隐喻

| QQ 概念 | OQQQ 对应 |
|---|---|
| 群成员 | 各类 Agent |
| `@谁` | 路由 / 派单给谁 |
| 群聊天记录 | 共享上下文 |
| 群文件 | 项目工作区和产物 |
| 群公告 | 记忆、约束、守则、开发公约 |
| 好友 / 单聊 | 与某个 Agent 一对一交互 |
| 添加好友 | 安装 agent 引擎，即加为好友 |

## 仓库结构

```
OQQQ/
├── frontend/          # QQ 式 UI（React + Vite，待开发）
├── backend/           # 消息总线、@路由、Agent 适配器（待开发）
├── docs/              # 设计文档、开发文档、开发手册
│   └── fix-reports/   # 每次代码修改的修复报告（硬规则）
└── README.md
```

## 文档

- `docs/OQQQ-前端设计文档.pdf` — 给前端看的对接文档
- `docs/OQQQ-后端开发文档.pdf` — 后端架构与 API 契约
- `docs/OQQQ-开发手册.pdf` — 环境搭建、代码规范、Git 流程

## 技术分层

```
OQQQ 前端（QQ 式群聊 / 单聊 UI）
OQQQ 后端（消息总线、@路由、PM 动态组队、总结、项目档案）
DeepSeek Harness（插件运行时、工具执行、skills、MCP 连接器）
```

## License

MIT
