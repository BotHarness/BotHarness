# DeepSeekBot

把 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）接入飞书 / Lark 的 DSH 插件 PoC。

一个 DSH Host 可同时运行多个飞书 Bot——**每个 Bot 是群里的一位"同事"**：独立人格、独立记忆、独立上下文。Session / 线程只是交互通道，Bot 的连续性来自它的记忆文件。

- **状态**：M1 进行中（[#1](https://github.com/Teamemos/DeepSeekBot/issues/1) 基座验证 + 集成地基），M0 已完成
- **文档**：[PRD](./PRD.md)
- **基座**：[dsh-im](https://github.com/xmanrui/dsh-im)（**独立插件叠加，不 fork**，ADR-0011；M1 只验证 Lark 国际版，六条 gate 见 `docs/m1-gate-checklist.md`）

## 已锁定决策（详见 PRD）

| 决策     | 结论                                                                                                                                                                                                                                   |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 核心理念 | **Bot 即人**：独立人格 / 记忆 / 上下文，不绑定 Session；**记忆即文件**                                                                                                                                                                 |
| 记忆     | 每 Bot 一个文件夹：`PERSONA.md`（人属）+ 生成的 `MEMORY.md` + 主题文件；front-matter（summary/updated_at/sources/visibility）；**工具写**、turn 注入**目录树**、ripgrep 按需检索、原子写、可见性过滤；M4 起 git（每 turn 一个 commit） |
| 入站文件 | 群内上传的图片/文件归档到 Bot 工作区；**被记忆引用时提升**为 `attachments/` 稳定路径；Agent 可读、可引用、可写入记忆                                                                                                                   |
| SQLite   | **降级为可选**：仅注册表/去重/出站队列；不存记忆、不存凭据                                                                                                                                                                             |
| 凭据     | **DSH credentials 服务**（沿用基座做法），不进配置与仓库                                                                                                                                                                               |
| 配置 UI  | DSH 插件设置页：插件设置 / 接入向导 / Bot 管理 / 记忆编辑器；**无需公网**（长连接为出站）                                                                                                                                              |
| 多工作站 | **暂缓**（单 Host 形态）                                                                                                                                                                                                               |
| 基座     | dsh-im（多 Bot + UI + MIT）；dsh-lark-link 的可靠性、dsh-lark-bridge 的群/线程路由作设计参考；dsh-lark-bot 因 AGPL 排除                                                                                                                |
| 共建     | 新增能力做成可上游 PR 的独立模块                                                                                                                                                                                                       |

## 典型场景（北极星）

销售 / 客户跟进：团队在群里讨论某个客户 → Bot 记住客户档案（联系人、需求、承诺、进展、相关文件）→ 下次跟进直接问 Bot「这个客户上次聊到哪了」。

## 快速开始

待 M1 完成后补充：

```bash
dsh plugin --profile <profile> add -w deepseekbot
dsh --profile <profile>          # 启动插件（飞书长连接，无需公网）
```

## 开发

工具链复用 GEO-SNS：pnpm 12.4.2 · TypeScript 7 · oxlint · oxfmt；另加 vitest（测试）与 tsdown（构建，DSH 插件生态惯例）。不使用 Vite/React/Cloudflare 工具链——插件在 Node 侧运行，设置 UI 走 DSH 插件契约。

```bash
pnpm install
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test
pnpm build
```

## 仓库结构

```text
.
├── PRD.md          # 产品需求文档
└── docs/           # 后续设计文档 / 接入指南
```

## 规划

| 里程碑 | 内容                                                                 |
| ------ | -------------------------------------------------------------------- |
| M0     | 仓库 + PRD                                                           |
| M1     | 基座验证（Lark 国际版）+ 集成地基（独立插件、session→bot、设置分区） |
| M2     | 群感知与附件管线（附件引用即提升；DM 一等）                          |
| M3     | Bot 记忆 MVP（目录树注入 + 工具写 + 原子写）                         |
| M4     | 记忆增强（检索、编辑器、git 版本化、备份）                           |
| M5     | 沙箱执行（DSH 内建优先；`sbx` 升级项）                               |
| M6     | 延后评估：`feishu_reply_scope` / 上游边界                            |
