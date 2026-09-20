# Bot mode is chat-first; PersonaBot navigation keeps Assignment subordinate

In bot mode the Human talks to PersonaBots the way they talk to people: the Roster lists PersonaBots and Channels, and selecting a PersonaBot opens its DM Chat rather than a DSH Session conversation. The DM is the single Human-facing entry to the PersonaBot: messages become Source Events, enter its Bot Inbox, and are handled by its Orchestrator. The Human does not create or choose another Conversation before the PersonaBot can carry out several lines of work.

A PersonaBot DM alone shows **PersonaBot navigation** in the right-side shell area. Chat is always present and renders the DM history and composer. Memory appears only when an optional Memory Provider is attached and replaces the center body with that repository surface. Owned Assignments appear directly below those destinations as a subordinate list, not behind a top-level Assignments destination. The list projects purpose, state, recent activity, and latest report from Assignment Sessions; it never shows the Orchestrator Session. Selecting an Assignment opens a read-only Assignment detail surface, with raw DSH Session content available only through an explicit secondary action. A group Channel has no PersonaBot navigation because it has no single owning PersonaBot.

When Memory is attached, its DM destination is the ordinary Human entry for browsing, editing, and inspecting Git history. Settings retains provider administration, diagnostics, and links into that surface rather than a second full editor. The first tracer bullet is deliberately Memory-free: create a name-only PersonaBot, send a DM, let its Orchestrator create an Assignment Session, receive an Assignment Report, reply in the same DM, and expose that Assignment in the subordinate list. Memory follows as a separate tracer bullet; Graph, activity heatmaps, Shared Memory, and other derived views remain deferred.

When the DSH left sidebar collapses, the existing Bot-mode Roster becomes a vertically scrollable icon rail: visible PersonaBots use their avatars, group Channels use their glyphs until custom Channel icons exist, and hover or keyboard focus reveals the name. Selection changes the active DM or group Channel without expanding the sidebar. Section collapse still controls member visibility; section headings do not become fake avatars.

Connections remains a future PersonaBot-navigation destination for Bot-scoped MCP-like capabilities, external adapters, Bridge bindings, webhook ingress, and related Trigger configuration. Those concepts do not yet become one backend domain merely because one screen may aggregate them, and no dead Connections or Schedules entry is shown before its behavior is designed and usable. Credentials and global plugin installation remain in DSH-owned settings.

This decision replaces this ADR's earlier read-only right-side Session inspector, including its visible “main session” Orchestrator row. Assignment Session remains the runtime identity for autonomous parallel Assignment; it is deliberately not the Human-facing information architecture. The Letta interaction that informed the reassessment also uses multiple Conversations for parallel work with shared Agent Memory; BotHarness differs by letting the Orchestrator create and manage Assignment without requiring the Human to open those Conversations manually.

## Considered Options

- **Workspace-first Roster** — rejected: PersonaBots work across Workspaces, so grouping identity by directory misstates the model.
- **Session-first PersonaBot selection** — rejected: raw DSH Session UIs expose execution detail; the DM is the PersonaBot's social surface.
- **A right-side Session inspector with the Orchestrator labelled “main session”** — superseded: it makes implementation detail primary and duplicates the DM's role.
- **Assignment as a top-level destination** — rejected: Assignment should remain visible at a glance below Chat and Memory without making the Human enter a separate index before choosing a line of work.
- **Human-managed Conversations, as the only way to obtain parallelism** — rejected: a personal PersonaBot should accept one DM request and autonomously maintain several lines of Assignment.
- **Work Session, Worker Session, or Executor Session** — rejected terminology: Work and Worker are easy to confuse in speech and typing; an Assignment Session is an independent root rather than a DSH child worker, while the Assignment Agent inside it is the executor.
- **Show the Orchestrator in the Assignment list** — rejected: Chat is its Human-facing surface, and the Orchestrator is the control plane rather than another line of Assignment.
- **Show future destinations as disabled placeholders** — rejected: navigation exposes usable capability, not roadmap inventory.
- **A permanent Builder PersonaBot** — rejected: it should exist only while useful; first-use creation plus a recall entry keeps the Roster clean.
- **A footer mode toggle** — superseded: the Bot-mode entry stays under New Session, and one entry replaces the earlier panellist-plus-footer pair.

## Consequences

- `Assignment` is the Human-facing concept; `Assignment Session` is its independent DSH execution identity. There is no Task entity, Worker Session, or separate Assignment id.
- The Orchestrator remains at most one active Session per PersonaBot and may autonomously create, address, and stop Assignment Sessions within Host-enforced authorization and capacity.
- The PersonaBot navigation is DM-only. Group Channels retain their chat body without a single-Bot Memory or Assignment projection.
- Memory is an optional PersonaBot capability. Its navigation destination exists only while a Provider is attached; Settings remains the provider-administration and diagnostic entry.
- The first UI tracer bullet delivers the real Chat → Orchestrator → Assignment → report → DM-reply loop plus the smallest Assignment list/detail projection. Optional Memory follows without blocking that slice.
- Channel history remains its own authority (ADR-0030); DSH Session logs remain execution traces rather than the DM transcript.
- A user-facing concepts guide must distinguish PersonaBot navigation, Chat, Memory, Assignment, Assignment Session, Channel, Bot Inbox, and Bridge.

References for the comparison: [Letta Code conversations](https://docs.letta.com/guides/ade/desktop/) and [Letta concurrent conversation guidance](https://docs.letta.com/api/typescript/resources/agents/subresources/messages/methods/create).
