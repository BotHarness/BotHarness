# Work is represented by sessions; there is no Task entity

Delegated and background work is represented by DSH sessions and their subagent children: a session already carries progress, output, and a working directory. A Task ledger would duplicate that state and add a second lifecycle to keep in sync, and routing is natural because work happens in the session it belongs to.

## Considered Options

- **Persisted Task entity** — rejected: duplicates session state; no consumer that sessions don't already serve.
- **Thin assignment index** (sessionId ↔ source/report target) — rejected for the PoC: IM routing lives in the IM adapter's conversation→session bindings, and the roster shows the session itself.

## Consequences

- "What is this PersonaBot doing" is answered by its sessions' state, not a task list.
- If unattended scheduled work arrives, the first addition is a queue of pending prompts, not a Task model.
