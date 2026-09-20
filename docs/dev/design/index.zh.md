# Design

Design 只保留整合后的架构与规范产品语言。Platform Spec、App PRD 等容易变化的规划快照不再作为并列权威发布；长期决策由 [Architecture Decisions](/zh/dev/adr) 留痕，living architecture 整合它们当前有效的结果。

- [Living architecture](/zh/dev/design/architecture)：系统上下文、deep modules、authority、持久化与数据流。
- [BotHarness 产品术语](/zh/dev/design/context)：PersonaBot、Channel、Source Event、Bot Inbox、Orchestrator Session、Assignment Session 等 BotHarness 产品词汇的唯一权威，与 DSH、Cordis 术语明确分开。
- [Bot runtime 架构](/zh/dev/design/bot-runtime)：BotHarness 产品对象与 DSH execution 之间的聚焦关系。

这些页面是规范性设计来源。要确认当前代码已经实现的表面，请查看 [Reference](/zh/dev/reference)。
