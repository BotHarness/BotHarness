# DeepSeekBot

把 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）接入飞书 / Lark 的 DSH 插件 PoC。

一个 DSH Host 可同时运行多个飞书 Bot，每个 Bot 拥有独立工作区、模型与会话绑定；Bot 知道自己被拉进了哪些群，在群里被 @ 时干活，并维护跨群、跨线程、跨会话的 Bot 级记忆。

- **状态**：M0（仓库与 PRD），未开始编码
- **文档**：[PRD](./PRD.md)
- **基座**：[dsh-im](https://github.com/xmanrui/dsh-im)（PoC 在其之上扩展，后期 PR 回上游共建）
- **上游**：DeepSeek Harness（开发者预览，需 pin 版本）

## 已锁定决策（详见 PRD）

| 决策 | 结论 |
|---|---|
| 存储 | **只用 SQLite**（不用 celld / CF / Postgres）；实现参考 [openai/codex `codex-rs/state`](https://github.com/openai/codex) 的最佳实践 |
| Bot 记忆 | **自研**（社区插件作用域是 project/session，不满足 Bot 级跨会话） |
| 配置 UI | DSH 插件设置页：插件设置 / 接入向导 / Bot 管理 / 记忆管理；**无需公网**（长连接为出站） |
| 多工作站 | **暂缓**（单 Host 形态；Tunnel/Tailscale 记录为附录备选） |
| 共建 | PoC 基于 dsh-im 扩展，能力做成可上游 PR 的独立模块 |

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
| M1 | 基于 dsh-im：多 Bot + 插件/Bot 管理 UI |
| M2 | 群感知与回复位置（`feishu_reply_scope`） |
| M3 | Bot 级记忆 MVP（SQLite + turn 注入 + 管理页） |
| M4 | 记忆增强（FTS5、导出/删除、索引重建） |
| M5 | 代码执行沙箱接入（`sbx`） |
| M6 | 上游共建：向 dsh-im 提交 PR |
