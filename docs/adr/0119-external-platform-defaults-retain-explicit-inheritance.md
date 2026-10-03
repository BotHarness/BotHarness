---
Status: Accepted
Date: 2026-10-03
---

# External platform defaults retain explicit inheritance

Human confirmed global defaults with per-Profile overrides in #701, refining #693 and #629. Messaging owns a bounded Lark preference revision under the existing operational database authority. The authenticated Typert/API Gateway exposes the same effective values to Bot settings, PersonaBot identity and Channel Bridge views, and Bot tooling. The first qualified event type is incoming group text; this does not claim Slack, Discord, QQ or webhook qualification.

## Decisions

Global defaults separate collection, ordinary-message wake/harvest, and identity enabled preference. They cannot bind an account, create or expand a Grant, select a destination, follow a Thread, or compel a reply. Actual Provider qualification and the existing account/target/dispatch checks remain mandatory.

A new qualified identity or managed Bridge explicitly inherits. Generation 51 marks legacy identity and reception settings custom, preserving their previous behavior. An explicit Profile change stores a scoped override; restoring inheritance resolves the current global revision, rather than copying its values into an unmarked override. Global and scoped saves compare the displayed revision, refusing stale commands. Settings draft refresh does not silently discard an unsaved edit.

Collection resolves explicit Thread rules first, then the Bridge/source override, then platform defaults. A shared Channel's ordinary external wake resolves the member's explicit Channel policy, then its explicit PersonaBot ordinary-source rule, then the platform preference. Local Channel messages retain their existing defaults. A followed Thread keeps its explicitly scoped wake rule. The canonical message is shared, while Inbox Admissions remain per member; no shared Inbox store is introduced.

Each new external Source Event retains the effective platform, reception and Bridge revisions; each ordinary admission retains its own thresholds and global revision. Digest partitions include the saved revision so a new threshold cannot consume an older pending bucket. Updating defaults never rewrites previously accepted content or admission decisions.

Identity preference is resolved through the existing identity owner. A global pause increments inherited identity revisions, reconciles their Consumer leases and refuses not-yet-started effects at the existing dispatch gate. A resume revalidates the existing account and authorized target and records a receive-after boundary on inherited Grants, preventing late pre-resume events from being admitted. It does not request backfill. Started outcomes remain truthful in the existing Outbox. This boundary depends on qualified Provider timestamps and an aligned clock.

## Consequences

An inherited all-message preference is visible even before ordinary delivery is verified, but the view clearly states that actual delivery is unverified. A preference is not evidence of permission or capability. Explicit custom all-message selection retains the existing qualification gate. Restart retains defaults, inheritance markers, old admissions and receive-after boundaries. Live views refresh through the existing roster event without introducing browser persistence or another scheduler.

Validation covers migration, precedence, stale commands and drafts, restart, immutable thresholds, capability refusals, identity pause during asynchronous inspection, and the production-shaped qualified Lark path. Per-issue Human QA and independent merge authorization remain required.
