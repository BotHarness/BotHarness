---
title: PersonaBot 导航与 Assignment 术语
date: 2026-09-20T12:00:00+09:00
tags: [product, ui, architecture, terminology]
---

- 更新 ADR-0029：PersonaBot DM 拥有右侧上下文导航。Chat 与 Memory 是主要入口，其下直接平铺该 PersonaBot 的事项列表。group Channel 不显示此导航，Orchestrator Session 也绝不显示为事项。
- 保留 personal bot 交互模型：Human 只需要在 DM 中对话；Orchestrator 可自主创建、复用、协调和停止多个 Assignment Session，不要求 Human 另开执行 Conversation。
- 术语收敛为：**Assignment（事项）**表示 Human 能理解的一条持续工作线，**Assignment Session**表示承载它的独立 DSH root Session，**Assignment Agent**表示该 Session 内实际执行的 DSH Agent。Work 与 Worker 因语音和输入时容易混淆、且会模糊 DSH Subagent 边界而退役。
- 保留 ADR-0017 的 no-Task 决策。Assignment 没有单独的持久 identity 或 lifecycle；承载它的 Assignment Session 的 DSH Session id 是 canonical identity。Assignment Directory 只是 explicit Session ownership、DSH facts 与 semantic reports 之上的 read model。
- 首个 UI tracer bullet 确定为 Chat + files-first Memory：选择 PersonaBot DM，浏览并读取 Memory 文件，编辑保存，再查看 Git history 与 diff。事项列表随后消费 runtime read model；Graph 等派生 Memory 视图继续 defer。
- DSH sidebar 折叠后，Bot-mode Roster 变为可滚动 icon rail，显示所有可见 PersonaBot 与 Channel；点击只切换 DM 或 group Channel，不会自动展开 sidebar。
- Connections 预留为未来的 PersonaBot navigation 入口，用于 Bot-scoped MCP-like capability、外部 binding、webhook ingress 与 trigger configuration；行为尚未设计完成前不显示无效占位。
