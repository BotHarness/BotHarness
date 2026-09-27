---
Status: Accepted
Date: 2026-09-27
---

# Inbox handling classifies by Source class, not platform

Orchestrator wake handling and naming follow the Source class, never the platform. External systems (Feishu, Slack, webhooks) normalize at the Bridge boundary into one canonical Source Event with trusted provenance; Inbox Triggers decide admission and Wake Policy per source fact (ADR-0025, ADR-0026). The runtime branches only on Source class and admission reason; no per-platform path, adapter, or factory exists inside BotRuntime — a new provider ships as a Bridge plus Inbox Triggers and never adds a wake path. The Channel source classes are a Group direct message (mention), Group ordinary messages (Wake Policy digest), a Human–PersonaBot DM message, a Bot-to-Bot DM message, and Group membership events (invitation, join request, join decision); an Assignment Report is a separate non-Channel class. Each class carries its own wake outcome and rendering; several reasons may share one implementation runner, but runner names and admission vocabulary follow the class.

## Why

Platform-dependent runtime paths would spread provider quirks through the wake core and make every provider a core change. One normalized Source Event keeps admission, idempotency, hop limits, and Wake Policy uniform (ADR-0036, ADR-0037), while the source class keeps the Orchestrator's input honest about what actually happened.

## Considered options

- **Per-platform runtime branches** — rejected: provider quirks land in the core, and every provider adds a wake path to keep consistent.
- **A Channel-type adapter or factory inside BotRuntime** — rejected: the Bridge already owns transport normalization; a second seam inside the runtime would duplicate it and split authority.
- **Treat every Channel event as one class** — rejected: mentions, ordinary chatter, and membership events have different wake outcomes and renderings; the class distinction is what keeps Wake Policy and naming honest.

## Consequences

- External provider work (#48) lands as Bridges plus Inbox Triggers, not as runtime branches.
- Wake-path names and tests follow the Source classes; the shared Channel-event runner is split or renamed per class in a follow-up slice (#358).
- Provider names never appear in runtime concepts; CONTEXT keeps Channel, DM, and Group as the classification surface.
