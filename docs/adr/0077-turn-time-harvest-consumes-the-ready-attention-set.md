---
Status: Accepted
Date: 2026-09-27
---

# Turn-time harvest consumes the ready attention set

The Orchestrator is woken once per ready set, not once per event. While a turn runs, newly admitted items mark the ready set dirty instead of queueing their own turns; when the running turn ends — or when the Bot is idle — one harvest turn consumes every ready item at once. The ready set is every unhandled immediate item (mentions, DMs, invitations, join decisions, Assignment Reports), every digest batch that reached its count or interval, and passive notices; it excludes below-threshold digest items, `silent` attention, and rejected events. A direct address with steer delivery is the only bypass: it injects into the running turn at DSH's next safe step (ADR-0025's delivery rules still apply), and if no turn is active it simply joins the next harvest. There is at most one pending harvest turn per PersonaBot.

One harvest turn is one consumption unit. Before the turn crosses into DSH, every included admission is marked side-effect-started; if the turn fails, all included items become needs-repair rather than silently replaying, and if it succeeds all become handled. Items that were not ready stay pending for the next harvest. The turn's message orders actionable items first (waiting Assignment answers and direct addresses ahead of ordinary traffic), then digest batches, then passive notices, and tells the Orchestrator that it may work items in parallel and delegate long-running ones to Assignment Sessions.

## Why

One turn per event makes a busy Bot's queue grow without bound, and each queued turn pays full context cost for a single item. A person holds many contexts and works them together; the Orchestrator orchestrates, and its Assignment Sessions carry the parallel long-running work. ADR-0025 already intended "one bounded digest per class"; the harvest makes that binding for turns instead of events. Keeping one consumption unit per turn preserves the claim and side-effect contract that already governs reports riding a turn (ADR-0036, ADR-0037) without inventing per-item retries.

## Considered options

- **One turn per admitted event** — rejected: unbounded queue growth and one full turn per item.
- **One queue entry per event, merged only when convenient** — rejected: the queue still grows, and consumption semantics would depend on timing accidents.
- **Per-item retry inside a failed harvest turn** — rejected: a turn's side effects are not attributable per item; the existing all-marked conservative contract is safer.
- **Merging below-threshold digest items** — rejected: the count and interval contract is what digest means.
- **Harvesting `silent` attention** — rejected: silent means recorded without surfacing; only an explicit read brings it back.

## Consequences

- The per-Bot serial queue becomes a dirty ready set plus at most one pending harvest wake; digest timers become idle harvest triggers.
- Steer delivery is unchanged; a steered item belongs to the running turn and never appears in the next harvest.
- The unified turn-message render (the memory-delivery track, #350–#353) is this harvest's message assembly; notices ride harvest turns without waking one alone.
- A failed harvest shows all its items as needs-repair, and the Human or Bot explicitly re-runs them.
