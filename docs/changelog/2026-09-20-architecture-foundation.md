---
title: Architecture foundation after the DSH design review (ADRs 0035–0045; spec v1.12)
date: 2026-09-20T06:30:00+09:00
tags: [architecture, spec, adr, messaging, orchestration]
---

- Closed the 131-question architecture grill in #71 and incorporated the DSH research into the platform contract. Normal runtime now uses explicit durable Session ownership rather than `cwd` inference; DSH remains authoritative for execution, SessionPersistence, Subagents, credentials, and profile settings.
- Reframed messaging around one immutable Source Event authority. Channel placement and PersonaBot Inbox Admission are references in the same SQLite transaction, with revision chains for edit/recall, trusted Reply Routes, separate Provider Capability and Human Service Grant checks, and an idempotent Outbox that exposes `unknown-outcome` instead of claiming exactly-once delivery.
- Defined the BotWork control plane: one active Orchestrator per PersonaBot, independent Work roots keyed by DSH `sessionId`, a durable Work Directory, five Orchestrator tools, Work-only `report_to_orchestrator`, no direct Work-to-Work messaging, and a Human-owned global active-Work limit of 3 by default with immediate structured failure and no queue.
- Replaced the old split operational stores and Channel NDJSON authority with one profile-scoped `botharness.db`, while preserving deep-module table/interface ownership. Persona/Memory files, CAS bytes, DSH Session data, credentials, and DSH settings keep their own authorities.
- Kept portability simple: PersonaBot Export can select dependency-closed facets; Profile Backup is manual only and produces one self-contained `.botharness-backup`. Restore validates in staging and reactivates nothing until dependencies and provider authorities are explicitly rebound and a Human activates the result.
- Rewrote the living architecture diagrams and aligned platform spec v1.12 and app PRD v1.5. Follow-up work is split into #74–#82 with native GitHub blockers; #55 remains parallel to the new Inbox/Work UI design.
- Refactored the installable DSH skill around a canonical Context and Decision Tree before Host/Client/Slots details, and added a Bot runtime reference that keeps product IM, Work ownership, and DSH Subagent delegation distinct.
