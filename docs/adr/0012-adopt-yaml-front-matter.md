# Adopt YAML front-matter for memory files

The memory tree must be injected every turn with a one-line summary per file, and deriving those summaries from file bodies or from a hand-maintained MEMORY.md drifts. Memory topic files therefore carry YAML front-matter — required `summary`, `updated_at`, `sources`, optional `tags` — maintained by the memory tools; missing or invalid front-matter degrades gracefully (first non-empty line as summary, mtime as `updated_at`, warning, repaired on next write).

## Considered Options

- **First non-empty line as summary** — rejected: puts presentation in the first line and leaves nowhere for `updated_at`/`sources`.
- **Parse a hand-maintained MEMORY.md index** — rejected: drift between index and files.
- **No summaries at all** — rejected: finding anything would require full-text reads.

## Consequences

- Reverses the PRD v0.6 decision "PoC 不引入 front-matter"; PRD §5.5 rule M1 and the changelog must be updated.
- Humans editing files must keep YAML valid; invalid YAML is tolerated, never fatal.
- The field list originally carried `visibility`; it was removed when memory dropped entry-level visibility (ADR-0021).
