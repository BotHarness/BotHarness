# SQLite is an optional index, never a system of record

SQLite is demoted to a small optional index the Host uses only where the base plugin does not already cover it — bot registry, chat→session bindings, event dedup, outbound queue. Memory and credentials never live in SQLite: files and the DSH credentials service already cover those, and "add no entity without need" keeps the PoC small.

## Consequences

If SQLite is introduced, it follows strict migration/backup discipline (versioned migrations, integrity checks, `VACUUM INTO` backups) borrowed from Codex's local-state practice (PRD §5.5).
