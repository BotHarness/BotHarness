# One Orchestrator Session per PersonaBot; work Sessions are independent

A PersonaBot is a person with several concurrent lines of work: one Orchestrator Session owns its Inbox and dispatches work, while every work item runs in an independent root Session that can live in its own Workspace. We rejected modeling work Sessions as DSH continuable subagents of the Orchestrator: `childSessionMeta` hard-copies the parent's cwd and preset (a child cannot take a different Workspace), subagent-owned identities are fenced from generic resume and prompt by the session controller, the default activation budget is 8 live children per tree with no queueing, tool delegation depth defaults to 1, and a parent session-id change (fork/rollover) orphans children with no reparenting. Independent root Sessions keep first-class roster visibility and Workspace freedom. Cross-Session messaging is therefore BotHarness-owned: `plugin`-kind relay messages (`relay` / `notice` / `snapshot` forms), request/reply correlation, and bounded waiting. Work roots do not message one another directly in v1; they report or request through the Orchestrator, which performs any explicit forwarding. Cross-PersonaBot traffic also goes through the receiving Orchestrator. The Orchestrator Session keeps a stable session id (no rollover), wakes on Inbox batches instead of running resident, and manages context with the shipped `compaction-basic` policy.

ADR-0045 deepens that control plane: the Orchestrator manages owned Work roots through a durable Work Session Directory and exact addressed Work Requests rather than relying on what its current context remembers. DSH `ctx.agents.create()`, `resume()`, `followup()`, `steer()`, `inject()`, and live AgentHandles remain implementation details behind the Host-lifetime BotWork Runtime.

## Considered Options

- **Continuable subagents (native parent/child)** — rejected: the Workspace hard-copy alone is fatal; the UI/resume fence, per-tree activation budget, depth default, and orphan-on-rollover make it worse.
- **Host policy only, no model orchestrator** — rejected: the PersonaBot must answer cross-project questions and choose dispatch like a person; policy alone cannot read a Session's state and answer for it.
- **Fan the Inbox out to every running Session** — rejected: token cost and interruptions scale with chatter, not with work.

## Consequences

- We own relay durability, de-dup, request/reply correlation, timeouts, and completion notices. DSH provides the primitives (`agent.followup/steer/inject`, `agent/status`, `session/event`, `sessionQuery`, `tokenMeter`) but no adjacency guarantees between peer Sessions.
- The Orchestrator is at most one active Session at a time per PersonaBot; its id must stay stable so routing survives context compaction. Zero or more Work Sessions remain independent roots.
- A Host-lifetime runtime owner, not the Orchestrator's scoped Agent context, owns the live `AgentHandle`s for Work Sessions. A Work Session therefore survives Orchestrator teardown and is reconstructed from durable Session ownership after Host restart (ADR-0035).
- Work inventory, addressed messaging, explicit continuity, autonomous dispatch, and durable Work Reports follow ADR-0045.
- v1 has no peer Work-to-Work relay. The Orchestrator is the sole manager and forwarding point for independent Work roots.
- Do not invent a novel message source kind: the v2→v3 Session migration validates a closed source set. Use `plugin` with `relay`, `notice`, or `snapshot`.
- Facts verified against `deepseek-harness` `ddefc45` (2026-09-17): `packages/subagent/subagent/src/child-agent.ts` (cwd/preset copy), `packages/api/session-controller/src/agent.ts` (subagent fence), `packages/subagent/subagent/README.md` (activation budget, depth), `packages/subagent/subagent/src/continuation-activation.ts` (lineage, orphan behavior).
