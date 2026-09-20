---
title: DSH 设计复核后的架构基础（ADR-0035–0045；spec v1.12）
date: 2026-09-20T06:30:00+09:00
tags: [architecture, spec, adr, messaging, orchestration]
---

- 完成 #71 的 131 个架构 grill 问题，把 DSH 调研纳入平台契约。正常运行改用 explicit durable Session ownership，不再用 `cwd` 猜测；DSH 继续拥有 execution、SessionPersistence、Subagent、credentials 与 profile settings 权威。
- Messaging 改为一个 immutable Source Event 内容权威。Channel placement 与 PersonaBot Inbox Admission 在同一个 SQLite transaction 中只保存引用；edit/recall 使用 revision chain；Reply Route 可信；Provider Capability 与 Human Service Grant 分离；Outbox 以幂等和 `unknown-outcome` 表达真实边界，不宣称 exactly-once。
- 明确 Assignment control plane：每 PersonaBot 一个 active Orchestrator；independent Assignment Session 以 DSH `sessionId` 寻址；durable Assignment Directory；五个 Orchestrator tools；Assignment-only `report_to_orchestrator`；无 Assignment-to-Assignment 直连；全局 active Assignments 上限默认 3，由 Human 设置，超限立即结构化失败且不排队。
- 用一个 profile-scoped `botharness.db` 取代分散的 operational stores 与 Channel NDJSON authority，同时保持 deep module 的 table/interface ownership。Persona/Memory files、CAS bytes、DSH Session data、credentials 与 DSH settings 仍各守自己的权威。
- 可移植性保持简单：PersonaBot Export 可选 dependency-closed facets；Profile Backup 只允许手动操作，产出一个 self-contained `.botharness-backup`。Restore 在 staging 中验证；依赖和 provider authority 重新绑定并由 Human 明确激活前，不自动恢复执行。
- 重写 living architecture 图，对齐 platform spec v1.12 与 app PRD v1.5。后续拆为 #74–#82 并设置 GitHub 原生 blockers；#55 仍可与新的 Inbox/Assignment UI design 并行。
- 重构可安装的 DSH skill：先进入规范 Context 与 Decision Tree，再按需下钻 Host/Client/Slots；新增 Bot runtime 参考，明确区分产品 IM、Assignment ownership 与 DSH Subagent delegation。
