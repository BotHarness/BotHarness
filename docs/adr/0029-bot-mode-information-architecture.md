# Bot mode is chat-first; sessions and workspaces stay out of the sidebar

In bot mode the human talks to PersonaBots the way they talk to people: the sidebar is a flat list of PersonaBots (each row opening its DM chat) and Channels, optionally organized into user-created **Channel sections**; clicking a Bot opens an IM-style chat view, never the DSH session conversation. Sessions are execution detail — they surface in a right-side panel (read-only list with open/switch, the Orchestrator Session labelled "main session") and in the Chat itself only through what the Bot chooses to say. Workspaces are de-emphasized the same way: a Bot may work across the machine, its Session rows name the workspace they run in, and folder access goes through DSH approval. The mode entry sits under the shell's New Session row (`sidebar.panellist`); entering bot mode is a panel selection, and clicking New Session returns to DSH mode. Onboarding is on-demand: the first-use empty state creates a **Builder** PersonaBot (an ordinary bot with a standard persona, deletable; recalled from the "+" menu, which also offers the form wizard) that helps the human create further bots by conversation, and any bot may create bots when its tool allow-list grants `bot_create`.

## Considered Options

- **Workspace-first sidebar** — rejected: bots work across workspaces, so grouping by folder adds mental load and misstates the model.
- **Session-first click (open the Bot's session)** — rejected: DSH session UIs expose thinking/tool noise; an IM chat is the right surface, and the session stays available behind it.
- **A permanent Builder bot** — rejected: it should exist only while useful; first-use creation plus a recall entry keeps the roster clean.
- **A footer mode toggle** — superseded: the entry moves under New Session, and one entry replaces an earlier panellist+footer pair.

## Consequences

- Spec §5/§6 and PRD US-1/US-2 update; `CONTEXT.md` gains Channel section / Bridge / Bot Inbox / Human Inbox / Channel membership and retires "Board"/"Boardroom" as product terms.
- Channel history is its own store (ADR-0030); session logs are execution traces, not the DM transcript.
- M3 becomes the information architecture plus the chat shell and local message store; delegation via Bot Inbox, the Orchestrator, and channel tools move to v1.1.
- A user-facing concepts guide is required (follow-up issue): channels, sections, bots, inboxes, bridges, sessions.
