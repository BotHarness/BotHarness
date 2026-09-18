---
title: Orchestrator Session, Inbox triggers, and platform-native Channels
date: 2026-09-18T22:00:00+08:00
tags: [spec, adr, architecture]
---

## Spec v1.6 — the multi-Session direction

- The platform spec now records the target topology: one **Orchestrator Session** per PersonaBot owns its Inbox and dispatches work; work runs in independent Sessions that can live in different Workspaces (**ADR-0024**). DSH continuable subagents were rejected for work Sessions: a child hard-copies the parent's cwd/preset, subagent identities are fenced from generic resume/prompt, the activation budget is 8 per tree without queueing, and a parent id change orphans children.
- **Inbox** is a derived event-stream projection, not a queue: immediate / digest / silent classes, configurable triggers owned by the Host and editable in the Settings UI (defaults 30 s / 5 events), ignoring is allowed, no exactly-once promise (**ADR-0025**).
- **Channel** is a first-class platform space that can bridge external Chats; `Channel binding` becomes **Binding**; Thread is generalized to a Chat or Channel sub-conversation (**ADR-0026**). `CONTEXT.md` updated.
- §5 gained the orchestration model (Inbox and entry, Orchestrator, work Sessions, cross-Session bus, status awareness, decision surfacing); §4 gained **M12** — persona stays in the prompt prefix while the memory tree moves to a per-turn injected message with replace-and-dedupe semantics, for KV-cache stability; the tool line now names `capabilities.tools.allow` with activation-time `ctx.tools.restrict` and unknown-name filtering.
- Landing order: M3 keeps roster + delegation + the workstation session (the first slice of the model); Inbox, Orchestrator, and the cross-Session bus land after M4; Channels bridge to Lark at M5.

## ADRs

- ADR-0024 — One Orchestrator Session per PersonaBot; work Sessions are independent roots.
- ADR-0025 — The Inbox is an event-stream projection with configurable triggers.
- ADR-0026 — Channels are platform-native; Binding connects surfaces.

## Research

- `docs/research/2026-09-18-dsh-agent-team-vs-botharness.md` (reference plugin comparison) plus DSH capability checks against `deepseek-harness@ddefc45` (subagent, session controller, compaction, schedule, webhook) informed the choices.
