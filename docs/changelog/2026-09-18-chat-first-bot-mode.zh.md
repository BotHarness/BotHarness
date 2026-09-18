---
title: Bot 模式以聊天为先（ADR-0029/0030；spec v1.9）
date: 2026-09-18T23:55:00+08:00
tags: [spec, prd, adr, client]
---

- **ADR-0029 — Bot 模式信息架构**：bot 模式以聊天为先。sidebar 用一条平铺列表呈现 PersonaBot（点击即 DM 聊天）与 Channel，用户可自建可折叠的 **Channel section**；Session 移到右侧面板（只读列表，Orchestrator 标注「主会话」）；Workspace 弱化（BOT 可在整机工作，目录访问走 DSH approval）。模式入口移到「新会话」下方，footer 入口移除。Onboarding 按需创建可删除的 **Builder** PersonaBot，并从「+」菜单（Builder / 表单向导）再次唤出；`bot_create` 是受 `capabilities.tools.allow` 控制的工具。
- **ADR-0030 — Channel 历史 = 每 Channel 一个 append-only NDJSON**；SQLite 只做索引、不拥有消息。Session 日志是执行轨迹，不是 DM 记录。
- **ADR-0026 增补**：Channel 类型为 `dm` / `group chat`；**Bridge** 是配置关系（外部来源 ↔ Channel 或 Bot Inbox），负责入站投递与出站回复路由。出站聊天回复默认免审批；防环规则明确（不含发送者、回显按外部 id 去重）。
- Inbox 术语：**Bot Inbox**（每个 BOT）与 **Human Inbox**（Dashboard 聚合）；Channel membership 通知策略 `muted` / `mentions` / `all`，默认 `all`。Channel 工具 `inbox_list` / `channel_read` / `channel_history` / `channel_send` 默认仅 Orchestrator Session 可用。
- 范围：M3 收敛为 IA + 聊天外壳 + 本地消息存储；Bot Inbox 委派、Orchestrator、Channel 工具与 Bridge 全部落 v1.1（#30）；#42 移入 v1.1。
- 规格 v1.9、PRD v1.3；用户指南"概念"章节单独开票跟进。
