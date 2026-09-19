---
Status: Superseded by ADR-0037
---

# Channel history is an append-only file log; SQLite is only an optional index

Every Channel (Bot DM or group chat) stores its conversation locally as one append-only NDJSON file: each line is one message with its kind, source (`user` | `bot` | `bridged`), external ids (when a Bridge is involved), and time. That file is the system of record. SQLite — through DSH's storage domain, or Node's built-in sqlite — may index and search those messages later, but it never owns them; losing or rebuilding the index loses nothing. This mirrors DSH's own session storage (JSONL logs) and keeps the repo's file-first stance (ADR-0002) applied to conversations: portable, greppable, backup-friendly. Session logs stay execution traces and are never the DM transcript.

## Considered Options

- **SQLite as the message authority** — rejected for now: opaque artifacts, harder backup/export, and no query need that outweighs it; revisit if search volume demands it.
- **One global message log** — rejected: per-Channel files keep locality, simpler locking, and per-Channel export.
- **Reuse session logs as the chat history** — rejected: the human wants an IM transcript, not thinking/tool traces (ADR-0029).

## Consequences

- Layout: `$DSH_HOME/botharness/channels/<channel-id>/messages.ndjson` (+ optional attachments directory); a small index file may hold last-read cursors, but the log remains authoritative.
- Bridge echo de-duplication keys on external message ids recorded in the log (ADR-0026 update).
- Message retention/GC is an open item; nothing is deleted implicitly.
- ADR-0005's "SQLite is an optional index" now explicitly covers messages.

## Superseded (2026-09-20)

Channels are no longer the only durable source of Bot attention: direct Bridge messages, webhooks, Session events, and system events may enter a Bot Inbox without belonging to a Channel. ADR-0037 therefore replaces per-Channel NDJSON authority with one transactional Messaging store. Per-Channel NDJSON remains a possible export, never a write-through mirror or authority.
