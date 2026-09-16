# DeepSeekBot

把 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）接入飞书 / Lark 的 DSH 插件 PoC。

一个 DSH Host 可同时运行多个飞书 Bot，每个 Bot 拥有独立工作区、模型与会话绑定；Bot 知道自己被拉进了哪些群，在群里被 @ 时干活，并维护跨群、跨线程、跨会话的 Bot 级记忆。

- **状态**：M0（仓库与 PRD），PoC 规划中
- **文档**：[PRD](./PRD.md)
- **上游**：DeepSeek Harness（开发者预览，需 pin 版本）
- **先例参考**：[dsh-im](https://github.com/xmanrui/dsh-im) · [dsh-lark-bridge](https://github.com/imetn/dsh-lark-bridge)（均 MIT）

## 快速开始

待 M1 完成后补充：

```bash
# 规划中的形态（PoC 目标）
dsh plugin --profile <profile> add -w deepseekbot
dsh --profile <profile>          # 启动插件（飞书长连接，无需公网）
```

## 仓库结构

```text
.
├── PRD.md          # 产品需求文档（当前唯一交付物）
└── docs/           # 后续设计文档 / 接入指南
```

## 规划

| 里程碑 | 内容 |
|---|---|
| M0 | 仓库 + PRD |
| M1 | 单 Bot 群聊 @ 闭环（长连接 + 流式卡片） |
| M2 | 多 Bot 接入（独立工作区 / 模型 / 会话） |
| M3 | Bot 级记忆（跨群、跨线程、跨会话） |
| M4 | 回复位置工具（模型自选 root reply / thread） |
| M5 | 代码执行沙箱接入 |
| M6 | 分布式工作站（本地 DSH + Cloudflare Tunnel / Tailscale，stretch） |
