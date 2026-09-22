---
Status: Accepted
Date: 2026-09-21
---

# Memory is a default Git-backed Service with file-first Agent access

> Superseded in part by ADR-0060: pinned bodies, the pin budget, and any generated index are gone; Persona is delivered to a Session's system prompt from a per-Session snapshot, and the Agent explores the repository with ordinary file tools.

## Original decision (superseded in part by the update below)

A PersonaBot needs only its Host-owned identity, the system-defined base runtime prompt, a Bot Inbox, an Orchestrator Session, and optional Assignment Sessions to chat and work. Persona and Memory are optional: their Provider may be absent without disabling the DM → Orchestrator → Assignment path. Memory is exposed through an application-defined Cordis Service Definition whose Git-backed Provider can live in a separate package and can be consumed by BotHarness or other trusted Plugins.

## Decisions

- A Memory Repository is generic and independently durable. It has its own identity and lifecycle; attachment, detachment, archive, and deletion are distinct. V1 binds at most one private repository to a PersonaBot, but the Service Definition does not encode `botSlug` as repository identity.
- All Memory documents are ordinary Markdown. There is no generated or privileged `MEMORY.md`. Persona is optional ordinary Memory content; when supplied during creation it becomes a conventional `persona.md` document pinned by default, but authorized Agents and Humans may edit, unpin, rename, or delete it.
- Pin state is versioned Markdown frontmatter. Pinned bodies enter future system prompts within a Human-configurable, repository-level UTF-8 byte budget and the active model's final token preflight. A pin or pinned-file mutation that exceeds either limit fails with machine-readable fields and an LLM-readable remedy; content is never silently truncated.
- Every mutation goes through the Memory Service, uses optimistic concurrency, and produces one semantic Git commit with actor and cause. `memory_pin` and `memory_unpin` are explicit operations so raw file writes cannot bypass budget checks.
- Every Memory Service operation is wrapped by application-defined Cordis Events. `memory/before-operation` is a waterfall hook that may enrich, rewrite, or reject; `memory/after-operation` is emitted for success or failure, after the durable commit when one exists. Event payloads contain metadata rather than file bodies; Git history remains the durable authority.
- V1 trusts internal Plugins that can resolve the Service and requires repository id, actor, and cause on mutations; it does not add a general ACL system. Orchestrators receive read-write tools when a repository is attached. Assignment Sessions receive no Memory access by default and may receive explicit `read` or full `read-write` access; their Subagents do not inherit it automatically.
- Without a Memory Provider, Persona input and the Memory navigation destination are absent. Supplying Persona through an API without that capability fails as `memory-unavailable`; Core never creates a second pending-Persona store.

## Consequences

This supersedes ADR-0003, ADR-0004, and ADR-0014. It refines ADR-0002 from a per-Bot directory into an attachable repository and removes the generated-`MEMORY.md` consequence from ADR-0021. The first V1 tracer bullet deliberately proves a name-only PersonaBot can complete DM → Orchestrator → Assignment → report → DM reply before the optional Memory package is expanded.

## Update (2026-09-21) — default repository, file-first access, and accepted commits

The original optional-capability decision is superseded in four places: a usable PersonaBot no longer exists without Memory; PersonaBot creation now initializes a real Git Memory Repository; v1 Agents do not receive model-visible `memory_read`, `memory_write`, `memory_pin`, or `memory_unpin` Tools; and Cordis Events do not wrap every filesystem operation or watch `.git`. The `Consumer → Service Definition → Provider` seam remains, but the Git-backed Provider is a required profile capability and PersonaBot creation fails closed when it cannot initialize or reconcile the repository.

Every PersonaBot owns one Memory Repository in v1. The Orchestrator Session always uses that repository root as its `cwd`, so the Agent reads, searches, edits, and versions Memory through ordinary filesystem, Shell, `grep`, and `git` capabilities. This deliberately keeps Memory file-first: the model does not need a parallel CRUD vocabulary, and repository contents remain understandable with normal developer tools. Persona remains conventional optional content within this always-present repository; no generated or privileged `MEMORY.md` is introduced.

The application-defined Memory Service owns repository lifecycle, validation, pin-budget enforcement, reconciliation, accepted commit creation, history, and queries for Human UI and trusted Plugin Consumers. Direct working-tree changes are provisional. A raw Git commit becomes an effective **Memory Commit** only after Memory reconciliation validates repository invariants, actor/cause attribution, and the resulting pinned-context budget. Rejected or uncommitted state does not enter pinned context or accepted history projections. This makes the accepted Memory Commit, rather than a file save or filesystem notification, the durable product boundary.

Application-defined Cordis Events report reconciliation and accepted or rejected Memory Commits after the relevant durable boundary. They carry metadata and commit identity, not file bodies, and are rebuildable from Git history plus reconciliation state. The Provider never interprets `.git` filesystem events as authoritative Memory events; missed live notifications are recovered by query/reconciliation instead of a watcher-derived second truth.

## Consequences of the update

- The DM → Orchestrator path now depends on successful Memory Repository creation and reconciliation; the earlier name-only/no-Memory tracer-bullet claim is retired.
- The Memory entry is always present in a PersonaBot's Channel sidebar. Provider-unavailable becomes a fail-closed creation/runtime recovery condition rather than a supported capability-absent mode.
- Existing `memory_*` Tools are legacy implementation surface and are not part of the v1 model-facing contract. Human UI and trusted Plugins continue to cross the Host boundary through Memory Service commands and queries.
- Pin metadata may be edited as an ordinary file, but it affects future prompt assembly only after an accepted Memory Commit passes the configured byte budget and model-aware preflight.
- ADR-0002's file-first direction is restored and deepened. ADR-0003 and ADR-0004 remain historical decisions superseded by this ADR; ADR-0014 remains superseded with Persona treated as conventional editable Memory content.
- Workspace authorization and Assignment `cwd` rules are separate from Memory and are recorded in ADR-0048.

## Update (2026-09-22) — no pinned bodies, no generated index, persona is a Session snapshot

ADR-0060 supersedes the pin mechanism above. The system prompt prefix is append-only and carries no derived Memory state: the Memory Tree section and the generated `MEMORY.md` index are removed, pin frontmatter is no longer consumed by prompt assembly, and there is no pin budget or full-body injection. The Agent reads, searches, and versions repository files with ordinary filesystem, Shell, `grep`, and `git` capabilities.

Persona remains conventional content but is delivered differently: each owned Session freezes the `PERSONA.md` body at its first prompt assembly, and that Session's system prompt keeps those bytes for its whole life, including across a Host restart. A Human edit reaches Sessions that have not snapshotted yet. The repository lifecycle, file-first access, accepted-commit boundary, and Memory Service ownership above are unchanged.
