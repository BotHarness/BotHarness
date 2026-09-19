---
Status: Accepted
Date: 2026-09-19
---

# Session ownership is explicit, exclusive, and Registry-owned

A Bot-mode Session belongs to at most one PersonaBot through an explicit, durable Session ownership record managed by the PersonaBot registry. Ordinary DSH Sessions may remain unowned. The record lives in the Session Ownership tables of the BotHarness operational database, keyed by Session id with the owning bot slug, root role (`orchestrator` or `work`), and provenance; it never lives in `SessionHeader`, a Soul file, Channel history, browser state, or cwd inference. DSH's fixed Session metadata cannot hold plugin fields, its lineage fields do not express PersonaBot role, and live `AgentHandle` ownership disappears on Host restart.

Each PersonaBot has at most one active Orchestrator root and zero or more independent Work roots. A Host-lifetime runtime owner holds Work `AgentHandle`s rather than an Orchestrator Agent's scoped context. A normal fork inherits the same PersonaBot but defaults to Work, while a DSH Subagent inherits through its parent lineage without becoming an independent Work Session. A running Session is never transferred across PersonaBots; cross-bot collaboration sends a message or creates new Work under the receiving bot. Ownership may change only through an explicit, auditable repair operation.

There are no existing production Sessions to migrate during local development. If a future import exposes legacy Sessions, a one-time migration may record `migrated-from-cwd` only when cwd identifies exactly one PersonaBot; missing or ambiguous matches stay unowned, and normal runtime resolution never falls back to cwd. Archiving a PersonaBot first atomically closes new Inbox Admission, wake, Session-create/resume, and external-action gates, then requests graceful stop for its active Orchestrator root, every independent Work root, and every owned DSH Subagent or descendant resolved through lineage. After a bounded deadline, any remaining owned execution is cancelled through DSH; the Host process is never killed. Archive completes only after the owned tree is quiescent. Ownership, Session history, cost, and audit attribution remain. A provider call already in flight cannot be unsent and records its eventual outcome. Permanent purge is a separate destructive operation.

Reactivating an Archived PersonaBot only reopens its runtime gates and leaves the Orchestrator cold. No Orchestrator, Work Session, or Subagent resumes automatically. A Human may explicitly resume selected Work Sessions after current permissions and environment are revalidated; old Subagents never auto-resume.

## Considered Options

- **Derive the owner from cwd** — rejected: several PersonaBots may share a Workspace, an Orchestrator may have no cwd, and list order would silently choose the wrong memory.
- **Add PersonaBot metadata to DSH SessionHeader** — rejected: `CreateSessionOptions.meta` is a closed DSH contract and creation reconstructs the header from a fixed field allowlist.
- **Use DSH `parentSession` or `origin` as ownership** — rejected: those fields express durable lineage/presentation, not PersonaBot identity or Orchestrator/Work role; a resumed fork can still be a runtime root.
- **Write Session ids into Soul files or Channel history** — rejected: Host execution relationships are not Soul identity or conversation truth and must not leak into exports.
- **Allow multiple owners or live transfer** — rejected: memory, state, cost, and authorization would become ambiguous.

## Consequences

- Memory injection, PersonaBot state projection, Session read models, and Work runtime recovery resolve through one ownership interface; unknown ownership fails closed and never contaminates a PersonaBot.
- The core plugin does not require a DSH storage-domain provider for ownership. If the operational database is unavailable or unsafe to migrate, creation or resume of a Bot Session fails closed under BotHarness recovery mode.
- The current delete-style registry operation becomes archive by default. A separate purge command must be explicit about destructive historical loss.
- Archive traversal is ownership- and lineage-based, not cwd-based: stopping the Orchestrator alone is insufficient because Work roots and Subagents have independent runtime lifetimes.
- Archive is a durable operation with a visible stopping phase, not a UI flag followed by best-effort background cancellation.
- Reactivation is not rollback: it never recreates the pre-archive live execution graph.
- Tests must cover shared Workspaces, a no-cwd Orchestrator, unknown and ambiguous ownership, fork/Subagent inheritance, Host restart recovery, and archive attribution.
