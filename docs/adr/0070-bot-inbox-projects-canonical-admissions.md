---
Status: Accepted
Date: 2026-09-26
---

# Bot Inbox read models project canonical Admissions

The Human-visible Bot Inbox entry and the Bot-scoped Attention query read inbox_admissions, source_events, and channel_placements from the operational database. They do not own a separate inbox item or message body. A query page is scoped to one stable PersonaBot ID and ordered by Source Event creation time and ID; its cursor may not be reused for another Bot. Each item carries a stable Source Event reference and, when still available, the Channel and placed message ID for navigation.

The projection maps pending, running, retryable, needs-repair, and handled Admission attempts to the UI states pending, deferred, needs-repair, and handled, using an explicit observed timestamp when present. A pending digest Group Admission is deferred until its threshold; a silent ordinary Group Admission stays pending without automatic wake. Explicit `channel_read` of returned Group messages records observation for that Bot only, without marking the admission handled, and excludes those admissions from later digest delivery, including after restart. This is a read projection, not a new Attention Decision authority. Assignment reports also create a canonical Admission in the Source Event transaction. Each report carries its typed state and Assignment Session reference; an Orchestrator turn observes it when the report block enters context and handles it when the turn completes, regardless of whether it sends a Channel reply. Boot resumes unobserved due reports once; an interrupted observed report is shown as needs-repair instead of being silently dropped or woken twice. The query keeps facts visible when a Channel or Assignment source is unavailable but disables navigation to that source.

## Why

A separate Inbox item table or copied body would compete with the canonical Source Event and could diverge after restart. The projection makes the first DM sidebar entry usable while the broader Attention Decision model in #47 grows. It preserves the relationship between one Source Event and multiple independently admitted Bots.

## Consequences

The current slices do not yet expose an ignored decision or all typed recovery and waiting-human causes; those require the durable facts owned by #47 before #152 and #126 can display them. A completed Orchestrator turn means the admission was handled, not that the Bot replied. Reading this UI is a Human observation and does not change the Bot's Attention state. The Group sidebar does not show this PersonaBot entry.
