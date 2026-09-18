# Model selection is local; the SoulSnapshot stays model-agnostic

A PersonaBot's model choice is deployment-local: a global default with an optional per-PersonaBot override, resolved at activation. It is not part of the persona or memory, and it never travels in a SoulSnapshot (ADR-0020): an imported bot runs on the importer's own model, provider, and credentials. Model selection must not ride along with a shared bot because recipients have different providers, budgets, and availability, and because a frozen model string would rot faster than the identity it rides on.

## Considered Options

- **Bundle the model (and provider) in the snapshot** — rejected: it turns a portable identity into a stale, provider-locked one.
- **Bundle an allowed model range** — rejected: adds policy language to the manifest for no proven need; the importer's global default is the right answer.
- **Per-PersonaBot only, no global default** — rejected: manual repetition for every new bot.

## Consequences

- `bot.json` keeps the per-bot override for local use; exports drop it.
- Snapshot manifests must not grow model or credential fields; import prompts the importer to pick a model (default: the global setting).
- Memory stays per-PersonaBot (ADR-0002/0013); a user-level shared memory layer (Grok-Bot style) remains an open question, not part of this decision.
