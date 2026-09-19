# Memory has no visibility

Memory entries carry no `visibility` and no `owner`: the store is a plain Markdown tree, and a PersonaBot reads its whole memory in every context it runs in (IM group, DM, sidebar, live). Whether a fact may leave the bot is not a property of the entry but a decision made at **export** time (M6): the human chooses which files — and which point in time (git ref) — go into the required SoulSnapshot inside a PersonaBot Export. Selecting operational Export Facets never widens that Memory selection. The runtime `MemoryScope` (group/DM + owner), the `visibility`/`owner` front-matter fields, and every scope filter or guard are removed.

## Considered Options

- **Per-entry `shared`/`private` with a runtime group/DM scope (ADR-0013)** — rejected: the store cannot know chat shapes or who a `private` fact belongs to; a bot that runs in many surfaces would need the surrounding adapter to define what "DM" even means.
- **Keep `public`/`private` as an entry-level disclosure flag, enforced at export** — rejected for now: choosing files at export already expresses that boundary; a second per-entry mechanism would be redundant until a real consumer appears.
- **Separate memory per user or conversation** — rejected: breaks "Bot as a Person"; the Bot would stop being one person.

## Consequences

- Supersedes ADR-0013; the `visibility` field disappears from the front-matter schema (ADR-0012) and M11 is rewritten as "sharing is decided at export time".
- `read` / `tree` / `search` take no scope; `write` takes no visibility/owner and always succeeds; the generated `MEMORY.md` lists every topic file.
- The `memory_*` tool descriptions no longer promise context-dependent recall: the Bot may use anything it knows in any chat.
- M6 (SoulSnapshot) owns the Memory sharing boundary: export selects files and a git ref, so "which files, from which point in time" is the privacy control even when the outer PersonaBot Export contains other selected facets.
