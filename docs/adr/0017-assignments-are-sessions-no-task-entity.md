# Assignments are represented by Sessions; there is no Task entity

An **Assignment** is a Human-meaningful continuing line of activity that a PersonaBot's Orchestrator chooses to advance independently. It has no separate durable identity or lifecycle. Its canonical runtime identity is the DSH Session id of the **Assignment Session** that executes it.

An Assignment Session is an independent PersonaBot-owned root Session. DSH already owns its execution history, progress facts, output, and Workspace attachment. BotHarness adds explicit Session Ownership, the Assignment Directory read model, addressed Assignment Requests, and semantic Assignment Reports; it does not add a parallel Task ledger or an `assignmentId` that would duplicate the Session lifecycle.

A DSH Subagent remains internal delegation beneath its parent Assignment Session and never becomes an Assignment row.

## Considered Options

- **Persisted Task entity** — rejected: it duplicates DSH Session state and creates a second lifecycle that can disagree with execution facts.
- **Separate canonical Assignment id mapped to a Session id** — rejected: there is no independent entity whose lifetime requires that extra identity or repair boundary.
- **Infer Assignments from cwd, title, recency, or live AgentHandles** — rejected: those are neither durable ownership nor unambiguous identity.
- **No durable index at all** — superseded: the Assignment Directory is now required for ownership-scoped discovery, reports, recovery, and UI projection, but remains a read model over Session ownership and DSH facts rather than a Task ledger.

## Consequences

- “What is this PersonaBot doing?” is answered by its Assignment Directory and the underlying Assignment Sessions, not by a separate task list.
- The UI may present an `Assignments` list and Human-readable purpose, state, and recent activity without inventing another runtime identity.
- Pending input is represented by Inbox Admissions, Assignment Requests, and minimal Assignment Delivery Intents, not a Task queue.
- The canonical vocabulary is Assignment, Assignment Session, Assignment Agent, Assignment Directory, and Assignment Runtime. Work, Work Session, Worker Session, and Executor Session are retired for this domain.
