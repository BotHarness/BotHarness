# PersonaBots are first-class entities; sessions are their execution

A PersonaBot is owned by the BotHarness registry and carries its identity, persona, memory, state, and channel bindings. DSH sessions and agents are executions of that entity, and a workspace is where a session works — never the PersonaBot's identity. State is two-level: sessions carry the real progress, and the PersonaBot aggregates it.

## Considered Options

- **Bot derived from workspace (PRD v0.9)** — rejected: a PersonaBot's continuity must survive project changes; a workspace is a place of work, not a person.
- **Shared cloud memory without an entity** — rejected: no home for persona, bindings, state, or ownership.

## Consequences

- The M1 resolver (workspace → bot) is demoted to an IM adapter binding helper; session↔PersonaBot ownership moves to the registry.
- A PersonaBot may hold several sessions and several workspaces; each workspace is a single directory (ADR-0018) and work is represented by sessions (ADR-0017).
- Six canonical values (`idle`, `thinking`, `working`, `waiting`, `blocked`, `done`) come from Grok Bot's proven vocabulary; `done` stays a session event.
- `PERSONA.md` and `memory/` move with the user-configurable memory directory; machine metadata stays in the BotHarness home.
