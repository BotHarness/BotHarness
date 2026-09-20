---
Status: Accepted
Date: 2026-09-20
---

# Messaging facts share one BotHarness-owned SQLite transaction

BotHarness owns one authoritative SQLite operational database per DSH profile, behind one Host-lifetime database owner (ADR-0041). Its Messaging tables record every inbound fact once as an immutable **Source Event** with trusted provenance and, when replyable, a non-secret **Reply Route**. The same transaction may add an optional Channel placement, zero or more per-PersonaBot **Inbox Admissions**, and durable delivery-outbox work. A direct Bridge message, webhook, Session event, or system event therefore needs no synthetic Channel, while a Channel message keeps exactly the same source-event identity as the event admitted to Bot Inboxes.

The same database also owns versioned **Messaging Policies** whose exact revisions participate in those decisions: PersonaBot Inbox Triggers, Wake Policy selection, non-secret provider account references, and Service Grants. A command records the policy versions it evaluated, so an event cannot commit under one Trigger or Grant state while its Admission or Outbox row reflects another. Other BotHarness operational modules may own tables in the same physical database without entering this transaction or becoming part of the Messaging interface.

The store is owned directly by BotHarness through Node's SQLite API rather than split across DSH storage domains. Current DSH domains serialize individual record operations but expose no cross-table transaction spanning the canonical event, Channel placement, Inbox fan-out, and outbox. Runtime notifications are emitted only after commit and are recoverable from committed outbox rows. External ingress is at-least-once and de-duplicated by a stable provider/ingress key; external replies cannot join the local transaction and therefore use an idempotent transactional outbox.

Source content is never copied into Inbox Admissions. A Reply Route contains service and external-address references only; credentials remain in the DSH credentials service. PersonaBot Soul and Memory remain user-owned files, roster and Session ownership are separate modules within the operational database, and DSH Session logs remain execution history rather than conversation history.

Source Events are immutable across provider edits and retractions. When an adapter observes either change, it appends a causally linked Source Revision or tombstone in the same store, preserving the original routing and audit facts. Original ingress is de-duplicated by provider message id; revisions additionally require a provider version/update timestamp or deterministic revision hash. A provider read API may reconcile current content when separately authorized, but is not assumed merely because the provider can deliver new-message events.

Attachment bytes live outside SQLite in a profile-scoped content-addressed file store; Source Events reference their hash and metadata. Provider URLs are not durable authority, and SQLite BLOBs are avoided. Ingress stages and hashes a file before committing its Source Event reference; unreferenced staged files are safe to garbage-collect. A Bot-owned Workspace or Memory copy exists only after an explicit preserve action.

If the database cannot open, migrate, or commit safely, the core plugin remains mounted in an explicit Messaging recovery mode so PersonaBot files and diagnostics remain reachable. All Messaging reads and writes fail closed with a stable error; there is no in-memory or NDJSON fallback and no second authority created during recovery.

An external retraction appends a semantic tombstone and immediately hides the earlier body from normal current-state presentation; it does not by itself physically erase local audit facts. Retention policy governs how long hidden content remains. An explicit destructive Content Purge may remove bodies and unshared attachment blobs after reference checks while preserving the minimum event identity, causal links, purge actor/time/reason, and tombstone. No implicit content purge is introduced in v1.

The v1 retention default is therefore operator-controlled: hidden retracted bodies remain until an explicit Content Purge. There is no age-based purge scheduler. A future profile- or source-scoped retention feature must use the same audited purge boundary rather than deleting rows or blobs directly.

Content Purge affects Messaging authority only. Before committing, BotHarness produces a dependency report for managed Memory references, Workspace copies, and exports; it does not silently rewrite those user-owned derivatives. A separately confirmed Purge Everywhere operation may remove selected managed derivatives together with Messaging content. Human copies and exports outside BotHarness control can be disclosed but cannot be recalled or claimed deleted.

Every Content Purge also appends to a monotonic Purge Ledger governed outside restorable database snapshots. Profile Backups carry a ledger checkpoint and Managed Restore applies the union of the package and destination ledgers before Messaging mounts. A managed backup catalog can expire generations that still contain purged bodies and therefore guarantee that its older managed snapshots do not resurrect content. A standalone offline backup can enforce only the checkpoint it contains and remains a Human-controlled artifact outside that stronger guarantee (ADR-0042).

## Considered Options

- **Per-Channel NDJSON plus a separate durable ingress envelope** — rejected: it preserves file readability, but Channel placement, direct external events, multi-Bot Inbox fan-out, de-duplication, and delivery recovery would cross several logs and require a reconciliation protocol instead of one commit.
- **Move only Channel history to SQLite** — rejected: Inbox Admissions in another domain would retain the same atomicity gap, even when both providers happen to use SQLite.
- **Keep Triggers, Wake Policies, account references, or Service Grants in unrelated stores** — rejected: an Admission or Outbox Intent could commit against a policy revision that changed outside its transaction.
- **Expose one generic database interface because operational tables are co-located** — rejected: physical co-location does not erase deep-module ownership or authorize callers to compose arbitrary cross-module writes.
- **Copy full messages into a durable mailbox** — rejected: Channel or external-source content and Inbox content would become competing authorities.
- **Write-through SQLite plus authoritative NDJSON** — rejected: dual writes cannot share an atomic boundary and would make recovery choose between two purported truths.
- **SQLite BLOB attachments** — rejected: large media would inflate the transactional database and its backups; content-addressed files preserve de-duplication and streaming access.
- **Provider URLs as attachment authority** — rejected: they may expire, require temporary credentials, or change independently of the committed Source Event.
- **Fail the whole plugin mount when Messaging storage is unavailable** — rejected: identity files and diagnostics are still useful for repair. Recovery mode preserves access while blocking every Messaging operation.
- **Fallback to NDJSON or memory** — rejected: accepting writes into a temporary authority would split history and make later reconciliation ambiguous.
- **Physically delete on every provider recall** — rejected: a Bot may already have acted on the event, so causality and the fact of retraction must remain locally explainable.
- **Retain every body forever with no purge path** — rejected: privacy, storage, and operator-governance requirements need an explicit destructive boundary.
- **Automatically cascade Content Purge into Memory and Workspaces** — rejected: it would silently rewrite PersonaBot knowledge and user-owned working files.
- **Refuse to purge whenever a derivative exists** — rejected: the authority can still be removed while dependencies are reported and governed separately.
- **Let an old managed backup resurrect purged content** — rejected: a destructive privacy boundary must survive supported recovery operations.
- **Delete every backup immediately after each purge** — rejected: a monotonic ledger plus backup retention preserves recoverability without exposing restored content.

## Consequences

- The Messaging schema has one canonical source-event row, optional Channel placement, per-Bot Inbox Admission facts, ingress uniqueness, trusted causal provenance, Reply Route references, and transactional outbox work. Exact table layout remains an implementation detail.
- Channel and Inbox presentation derive the current head of a Source Revision chain without erasing its earlier facts. Whether a revision creates or coalesces an Inbox Admission is decided by Inbox Trigger and Wake Policy, not by the provider adapter.
- Unobserved revisions coalesce into one Attention Unit; post-observation revisions become new attention. A semantic tombstone hides current content, while Content Purge is the only operation that destroys retained content.
- Unresolved Revisions remain durable and non-waking until their target and ordering are sufficiently resolved for normal admission policy; tombstones take conservative precedence over a late original. Revision Conflict blocks current-content-dependent external actions until resolved.
- All browser RPC, model tools, Channel operations, Bridges, and webhooks enter through the Messaging command boundary; none writes the database or an Inbox directly.
- Per-Channel NDJSON is an explicit derived export. Backup uses SQLite-aware snapshots and versioned migrations, not a second continuously written message log.
- The database and managed backups rely on operating-system and `$DSH_HOME` access controls in v1; BotHarness does not add custom field- or database-level encryption at rest. Credentials remain outside the store, and a later managed-backup layer may add encryption without changing Messaging authority.
- Inbox pending/read/defer/ignore/handled views are derived from stable Admissions plus auditable Attention Decision facts, never from a copied Agent-delivery state machine.
- A committed event cannot be visible in a Channel while missing its required Inbox Admissions or delivery work. Post-commit process failure may delay delivery but cannot lose the durable intent.
- ADR-0030 is superseded. ADR-0041 broadens SQLite's physical role without changing this ADR's Messaging transaction invariants.
