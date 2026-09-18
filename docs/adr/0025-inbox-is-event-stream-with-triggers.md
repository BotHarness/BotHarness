# The Inbox is an event-stream projection, and its triggers are configurable

Each PersonaBot has one Inbox: a derived view over the events of every surface it is bound to (Channels, Chats, DMs, other Sessions, later webhooks), not a durable mailbox or queue. Admission means "the event exists and is unread", not "the model processed it"; ignoring an item is allowed and silent, and nothing promises exactly-once processing. The Host groups events into three classes — immediate (direct mentions, DMs, blocked/approval, direct agent messages), digest (ordinary unread; default 30 seconds or 5 events), and silent (recorded, never wakes) — and wakes the Orchestrator with one bounded digest per class. Triggers (source switches, window, threshold, priority) are durable Host-enforced configuration, user-editable in the Settings UI; the Orchestrator may decide per-batch handling and record preferences in Memory, but it cannot change its own triggers. Proactive work is event-driven only: there is no scheduler or heartbeat in the model, because DSH `dsh-schedule` is session-local, requires at least 300 seconds, and only fires when the Agent is fully idle.

## Considered Options

- **Durable mailbox entity** — rejected: a second authority next to the events themselves; a projection already answers "what is pending".
- **Wake per message** — rejected: token cost and interruptions scale with chatter, not with work.
- **Model-owned trigger policy** — rejected: nondeterministic and hard to observe; triggers must be inspectable configuration.
- **`dsh-schedule` as the general trigger** — rejected: its minimum interval and idle-only delivery do not fit mentions and approvals.

## Consequences

- DSH delivery primitives map to the classes: `inject` (silent), `followup` (digest and immediate), `steer` (immediate into a running Session).
- The Settings UI needs a notification-policy surface; defaults are 30 seconds / 5 events until measured.
- Webhooks become an Inbox source only through the same trigger policy; there is no per-source bypass.
