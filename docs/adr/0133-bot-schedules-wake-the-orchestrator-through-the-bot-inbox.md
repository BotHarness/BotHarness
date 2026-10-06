---
Status: Proposed
Date: 2026-10-06
---

# Bot Schedules wake the Orchestrator through the Bot Inbox

A PersonaBot can own **Bot Schedules**: durable, Host-owned rules that produce a `schedule` Source Event at a planned time and admit it into that PersonaBot's Bot Inbox. The Human manages them from a **定时任务 / Schedules** section in the PersonaBot DM's Channel Sidebar, and the PersonaBot manages them through its own tools. A firing never runs work directly: it is one more admitted event, so the Orchestrator decides whether to reply, act, or dispatch an Assignment, exactly as it does for a DM or mention. This amends [ADR-0025](0025-inbox-is-event-stream-with-triggers.md), whose "no scheduler or heartbeat" rule rested on DSH facts that no longer hold, and fills the Schedules destination [ADR-0029](0029-bot-mode-information-architecture.md) deferred until its behavior was designed.

## Why not DSH Schedule directly

DSH `dsh-schedule` 0.2.0-rc.1, the version BotHarness pins, already supports one-shot (`after_seconds`, `at`), fixed-rate `every_seconds` (minimum 60 seconds), daily, weekly and five-field cron triggers with an explicit IANA time zone. A firing calls `agent.followup` on the one Session it is bound to, which wakes an idle Session and queues behind a running turn; ADR-0025's "at least 300 seconds" and "only fires when the Agent is fully idle" are no longer true. It is still the wrong authority for PersonaBot work:

- A DSH Schedule belongs to one `sessionId`, but the Orchestrator Session is replaceable (Managed Restore activation, reactivation after archive). A Schedule bound to it would silently orphan.
- Its delivery bypasses Inbox Admission, Wake Policy, Delivery Policy and Turn harvest, so a firing would be a second, unaudited way into the Orchestrator and would race the Host's own harvest follow-ups.

BotHarness therefore owns the schedule and its firing, and reuses DSH Schedule's exported occurrence functions (`resolveCronOccurrence`, `resolveDailyOccurrence`, `resolveWeeklyOccurrence`, `resolveEveryOccurrence`, `parseCronInput`) so trigger semantics, DST handling and validation match the native Automation page.

## Decision

- **Authority.** Bot Schedules live in the BotHarness operational database, keyed by PersonaBot, not by Session. Each records title, prompt, trigger (every N minutes or hours, daily, weekly, one-shot `at`, or cron), IANA time zone, enabled flag, creator (`human` or `personabot`), locked flag, and next target in UTC.
- **Firing.** At a target the Host creates one `schedule` Source Event carrying the schedule identity, title, prompt, planned time and creator, and admits it into the owner's Bot Inbox. The schedule source defaults to an immediate wake that never steers: if the Orchestrator is running, the item joins the next Turn harvest. The Orchestrator may use the schedule identity as an Assignment Continuity Key; no extra field is needed.
- **Coalescing and restarts.** A schedule has at most one unobserved firing. A new target while the previous firing is still pending refreshes that Attention Unit instead of stacking another. After a Host restart only the latest missed occurrence fires. Archiving a PersonaBot pauses its schedules; reactivation resumes future targets without backfilling.
- **Manual run.** "Run now" admits a firing marked `manual` and leaves the next planned target unchanged.
- **Who manages.** The Human creates, edits, pauses, deletes and locks schedules in the sidebar. The PersonaBot gets `bot_schedule_*` tools to list, create, update and delete; it may change any unlocked schedule, Human-created ones included, and can only read a locked one. This matches the Inbox Trigger rule that the PersonaBot shapes its own rules while the Human can inspect, override or freeze them. DSH's native `schedule_*` tools are hidden from the Orchestrator Session so a PersonaBot has one schedule system.
- **Limits.** The minimum interval is one minute, as in DSH; the editor warns about model cost below 15 minutes. A PersonaBot has at most 20 enabled schedules; exceeding the cap returns an explicit tool or UI error.
- **Sidebar.** A `personabot`-scope Channel Sidebar entry after Bot Inbox lists each schedule with an icon, title, cadence chip (for example "每小时", "每天 09:00"), next run, last-result badge, creator badge, lock state and an enable switch. One dialog creates and edits: title, prompt, cadence (every N minutes/hours, daily, weekly, once, advanced cron) and time zone, defaulting to the browser zone but stored explicitly. Opening a schedule shows its last 20 firings with their Attention Decision state (pending, observed, handled, coalesced) and links to the Orchestrator Session that took them.

## Considered Options

- **Bind DSH Schedules to the Orchestrator Session** — rejected: Session-scoped identity orphans on Orchestrator replacement, and delivery bypasses Inbox, Wake Policy and harvest.
- **Each firing starts a fresh Assignment Session** — rejected: it bypasses the Orchestrator's dispatch judgment and Assignment concurrency admission; the Orchestrator can still choose to dispatch.
- **Human-only management** — rejected: a PersonaBot that agrees to "check this every morning" should be able to keep that promise itself; locking gives the Human the final say.
- **PersonaBot may edit only its own schedules** — rejected in favor of locking, which is explicit per schedule and matches Inbox Trigger freezing.
- **Stack every missed or overlapping firing** — rejected: a slow turn or a restart would turn into a wake storm.

## Consequences

- ADR-0025's scheduler exclusion is amended: proactive work may now also be time-driven, but only through Inbox admission.
- A new `schedule` source joins the source-policy defaults and the Messaging transaction; firings appear in the Bot Inbox section like other sources.
- BotHarness depends on `@deepseek-ai/dsh-schedule`'s exported occurrence functions; a DSH upgrade that changes them is caught by schedule tests.
- Delivery is sliced: (1) Human sidebar CRUD for interval and daily schedules with firing history, end to end through the Inbox; (2) PersonaBot tools, hiding native `schedule_*`, locking and the cap; (3) weekly, one-shot, cron, Run now and user docs.
