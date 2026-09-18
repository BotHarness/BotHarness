---
title: Bot mode is chat-first (ADRs 0029/0030; spec v1.9)
date: 2026-09-18T23:55:00+08:00
tags: [spec, prd, adr, client]
---

- **ADR-0029 — Bot mode information architecture**: bot mode is chat-first. The sidebar lists PersonaBots (click = DM chat) and Channels in one flat list, with optional user-created **Channel sections**; sessions move to a right-side panel (read-only list, Orchestrator labelled "main session"); workspaces are de-emphasized (a Bot works across the machine, folder access goes through DSH approval). The mode entry moves under the shell's New Session row and the footer entry goes away. Onboarding is on-demand: the first-use state creates a deletable **Builder** PersonaBot, recalled from the "+" menu (Builder or form wizard); `bot_create` is a tool gated by `capabilities.tools.allow`.
- **ADR-0030 — Channel history is an append-only NDJSON log** per Channel; SQLite may index but never owns messages. Session logs are execution traces, not the DM transcript.
- **ADR-0026 update**: Channel types are `dm` / `group chat`; a **Bridge** is a configured connection (external source ↔ Channel or Bot Inbox) with inbound delivery and outbound reply routing. Outbound chat replies are allowed without approval; loop-back rules (sender excluded, echo de-dup by external id) are explicit.
- Inbox vocabulary: **Bot Inbox** (per Bot) and **Human Inbox** (dashboard aggregate); notification policy per Channel membership is `muted` / `mentions` / `all`, default `all`. Channel tools `inbox_list` / `channel_read` / `channel_history` / `channel_send` are Orchestrator-only by default.
- Scope: M3 becomes IA + chat shell + local message store; delegation via Bot Inbox, Orchestrator, channel tools and Bridges all land in v1.1 (#30); #42 moves to v1.1.
- Spec v1.9, PRD v1.3; a user-facing concepts guide is filed as a follow-up.
