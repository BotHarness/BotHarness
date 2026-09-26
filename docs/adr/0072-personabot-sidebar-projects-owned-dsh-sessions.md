---
Status: Accepted
Date: 2026-09-26
---

# PersonaBot sidebar projects owned DSH Sessions

The right pane of a Human–PersonaBot DM presents **Sessions / 会话**, not a separate Assignment task list. It is a read model over independent DSH root Sessions. BotHarness Session Ownership determines which Session IDs belong to the PersonaBot and whether each root is Orchestrator or Assignment. DSH's Client Session catalog supplies the display title, workspace cwd, update time, and live running state. Clicking a row uses native `UiWorkspace.openSession` for that exact ID. DSH Subagent children are excluded. A cwd match never establishes Bot ownership. The native Session header and left-sidebar Session menu contribute return actions through DSH's `conversation.session.header.actions` and `sidebar.workspaces.session.menu.item` slots: a Host reverse lookup resolves the root Session owner, and only an existing owned Orchestrator or Assignment offers a return action to its Human DM. The header uses that PersonaBot avatar; the menu uses the Bot glyph. Subagents and unrelated native Sessions have no return action.

The Assignment Directory remains the application authority for Workspace Grant, Continuity Key, report, stop, and concurrency admission. Its activity and stop facts may annotate an Assignment row, but the directory does not replace DSH's execution history or live state. The default flat Current view keeps the latest Orchestrator visible even when idle and prioritizes active or attention-needing Assignments; All includes older and stopped roots. A later slice adds per-Bot browser-local Current/All, Flat/By workspace, and collapse preferences without creating another Session authority.

## Why

The old right-sidebar “事项” projection mixed application coordination facts with a second title and status view of DSH execution. Humans needed a direct route to the native Session, and a Bot may own several workspace roots. Explicit ownership prevents unrelated Sessions in the same folder from appearing. Keeping the Directory preserves admission and audit behavior while removing redundant Client bridge/store presentation code.

## Consequences

A missing DSH Client record can remain visible as unavailable from explicit ownership, but cannot be opened until the native record loads. A Host restart reconciles a persisted working Assignment whose process ended before enforcing the next concurrency admission; this reservation is never treated as the UI's live running truth. The PersonaBot activity indicator remains a separate, reconstructible projection for Channel feedback. This decision supersedes only the Assignment list/detail interaction described in #75 and the initial #81 tracer; it does not change their runtime contracts.
