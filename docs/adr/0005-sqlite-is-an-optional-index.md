---
Status: Superseded by ADR-0037 and ADR-0041
---

# SQLite is an optional index, never a system of record

SQLite is demoted to a small optional index the Host uses only where the base plugin does not already cover it — bot registry, chat→session bindings, event dedup, outbound queue. Memory and credentials never live in SQLite: files and the DSH credentials service already cover those, and "add no entity without need" keeps the PoC small.

## Consequences

If SQLite is introduced, it follows strict migration/backup discipline (versioned migrations, integrity checks, `VACUUM INTO` backups) borrowed from Codex's local-state practice (PRD §5.5).

## Update (2026-09-20)

ADR-0037 first made Messaging authoritative in SQLite. ADR-0041 completes the simplification: one BotHarness-owned SQLite database now stores all BotHarness operational state, including registry, roster, Session ownership references, Messaging, policy, Outbox, and audit records. Soul/Memory files, attachment content, DSH Session logs, credentials, and intentionally DSH-native settings remain outside it.
