---
title: PersonaBot profile 字段；模型选择留在本地
date: 2026-09-18T21:30:00+08:00
tags: [spec, prd, adr]
---

- PersonaBot 的最小 profile 为 `displayName`、单一 **tag**（"岗位"）与一行 **description**；更多字段等真实场景出现再加。`CONTEXT.md` 新增 tag / description 词条。
- **ADR-0027**：模型选择 = 全局默认 + per-PersonaBot 覆盖，在本地解析——**不随 SoulSnapshot 发布**，导入方用自己的模型运行共享 Bot。`bot.json` 的覆盖字段仅供本地使用。
- 记忆保持 per-PersonaBot（ADR-0002/0013）；user 级共享记忆（Grok Bot 形态）记为开放项，暂不引入。
- lobehub 采纳结果（来自 `docs/research/2026-09-18-lobehub-agent-profiles.md`）：采纳——插件三态绑定、MCP 作用域解析、每 Bot IM 绑定、工具默认拒绝、记忆注入排版、快照清单；拒绝——user-level-only 记忆、分享=访问权。
- 规格 v1.7；PRD v1.2（新建向导增加 tag / description）。
