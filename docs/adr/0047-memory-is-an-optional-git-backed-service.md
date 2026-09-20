# Memory is an optional Git-backed Cordis Service

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
