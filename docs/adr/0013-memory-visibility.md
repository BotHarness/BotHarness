# Memory is one brain with per-entry visibility

A Bot keeps one memory across every chat, but each entry carries `visibility`: `shared` by default, or `private` when written from a DM. Private entries record their author (`owner`); group turns filter them from both tree injection and search, and they are injectable only in that owner's DMs. The Bot therefore keeps one identity and one store, while disclosure follows where a fact was confided.

## Considered Options

- **No filtering (source tags only)** — rejected: a DM remark could resurface in a group.
- **Separate memory per user or conversation** — rejected: breaks "Bot as a Person"; the Bot would stop being one person.
- **Forced confirmation for DM-sourced writes** — rejected: friction exactly where remembering is most useful.
- **Private visible in any DM** — rejected: leaks one user's confidence to another.

## Consequences

- Injection and search are context-aware: group turns drop `private`; a DM turn filters to `shared` plus entries owned by that sender.
- The front-matter schema (ADR-0012) carries `visibility` and `sources`; the memory editor shows both.
- Outside its owner's DM the Bot genuinely does not know a private entry — intentional, but it must be stated in persona/tool descriptions so the model does not promise recall it cannot use.
