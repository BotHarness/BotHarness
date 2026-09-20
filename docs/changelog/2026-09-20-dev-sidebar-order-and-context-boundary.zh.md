---
title: 开发文档导航以架构决策历史收尾
date: 2026-09-20
tags: [docs, architecture]
---

开发文档侧栏现在按照 Design → Guides → Reference → Architecture decisions 的阅读顺序排列，把历史 ADR 放在底部。BotHarness 产品术语也移除了 `dsh-plugin-dev`、`dsh-skill` 等文档分发机制；这些内容继续由 DSH 文档与仓库指令维护，不再作为产品领域术语出现。ADR-0033 保留原始发布决策，并新增了 Skill 收缩为稳定基础层后的 scope update。
