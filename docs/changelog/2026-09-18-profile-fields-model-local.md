---
title: PersonaBot profile fields; model selection stays local
date: 2026-09-18T21:30:00+08:00
tags: [spec, prd, adr]
---

- A PersonaBot's minimal profile is `displayName`, a single **tag** ("job title"), and a one-line **description**; more fields wait for a scenario that needs them. `CONTEXT.md` gained the tag/description terms.
- **ADR-0027**: model selection is a global default plus an optional per-PersonaBot override, resolved locally — it never travels in a SoulSnapshot, so importers run a shared bot on their own model. `bot.json` keeps the override for local use only.
- Memory stays per-PersonaBot (ADR-0002/0013); a user-level shared memory layer (Grok-Bot style) is recorded as an open question, not adopted.
- lobehub adoption pass (from `docs/research/2026-09-18-lobehub-agent-profiles.md`): accepted — plugin tri-state binding, MCP scope resolution, per-bot IM bindings, default-deny tools, memory-injection layout, snapshot manifest; rejected — user-level-only memory, share-as-access.
- Spec v1.7; PRD v1.2 (the create wizard gains tag/description).
