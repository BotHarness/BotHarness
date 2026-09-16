# DeepSeekBot

把 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）接入飞书 / Lark 的 DSH 插件 PoC。

一个 DSH Host 可同时运行多个飞书 Bot——**每个 Bot 是群里的一位"同事"**：独立人格、独立记忆、独立上下文。Session / 线程只是交互通道，Bot 的连续性来自它的记忆文件。

- **状态**：M0（仓库与 PRD），未开始编码
- **文档**：[PRD](./PRD.md)
- **基座**：[dsh-im](https://github.com/xmanrui/dsh-im)（PoC 在其之上扩展，M1 验证 Lark 国际版支持；后期 PR 回上游共建）

## 已锁定决策（详见 PRD）

| 决策 | 结论 |
|---|---|
| 核心理念 | **Bot 即人**：独立人格 / 记忆 / 上下文，不绑定 Session；**记忆即文件** |
| 记忆 | 每 Bot 一个文件夹：`MEMORY.md` 索引 + 主题文件（客户档案等）；Agent 直接读写文件，检索用 ripgrep；原子写 + 可选 git 版本化 |
| SQLite | **降级为可选**：仅注册表/去重/出站队列；不存记忆、不存凭据 |
| 凭据 | **DSH credentials 服务**（沿用基座做法），不进配置与仓库 |
| 配置 UI | DSH 插件设置页：插件设置 / 接入向导 / Bot 管理 / 记忆编辑器；**无需公网**（长连接为出站） |
| 多工作站 | **暂缓**（单 Host 形态） |
| 基座 | dsh-im（多 Bot + UI + MIT）；dsh-lark-link 的可靠性、dsh-lark-bridge 的群/线程路由作设计参考；dsh-lark-bot 因 AGPL 排除 |
| 共建 | 新增能力做成可上游 PR 的独立模块 |

## 典型场景（北极星）

销售 / 客户跟进：团队在群里讨论某个客户 → Bot 记住客户档案（联系人、需求、承诺、进展）→ 下次跟进直接问 Bot「这个客户上次聊到哪了」。

## 快速开始

待 M1 完成后补充：

```bash
dsh plugin --profile <profile> add -w deepseekbot
dsh --profile <profile>          # 启动插件（飞书长连接，无需公网）
```

## 仓库结构

```text
.
├── PRD.md          # 产品需求文档
└── docs/           # 后续设计文档 / 接入指南
```

## 规划

| 里程碑 | 内容 |
|---|---|
| M0 | 仓库 + PRD |
| M1 | 基座验证（多 Bot + Lark）+ 插件/Bot 管理 UI |
| M2 | 群感知与回复位置（`feishu_reply_scope`） |
| M3 | Bot 记忆 MVP（文件方案 + 注入 + 工具） |
| M4 | 记忆增强（检索、编辑器、版本化/备份） |
| M5 | 代码执行沙箱接入（`sbx`） |
| M6 | 上游共建：提交 PR |
