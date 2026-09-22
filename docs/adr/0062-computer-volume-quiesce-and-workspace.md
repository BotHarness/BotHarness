---
Status: Accepted
Date: 2026-09-22
---

# Computer exports quiesce the browser, and durable work lives in ~/workspace

ADR-0052 packs the whole named volume into one archive, but two details of _what the volume holds and when the tar reads it_ needed a decision before export/import could be accepted (#154): a Chromium profile torn by `docker stop`'s kill window, and no agreed home for Human- and bot-produced files.

## Decision

- **Export quiesces the browser before stopping the container.** The provider first SIGTERMs Chromium (and Chrome, if present) inside the running container and waits up to ~10 seconds for the processes to exit, so cookies, history, and open tabs are flushed before the tar. A timeout or a failed `docker exec` falls through to the plain `docker stop` of ADR-0052; the managed `RestoreOnStartup` policy still recovers the session after a torn write. The quiesce is best-effort and runs only on export — ordinary stop/start keeps the crash-restore semantics Humans accepted in TB1.
- **Durable work lives in `~/workspace`.** The webtop image's HOME is `/config`, the named volume's mount, so `~/workspace` (`/config/workspace`) sits on the volume and travels through export → import. Every start seeds the directory (best effort, `abc:abc`). Browser state stays where the browser puts it (`~/.config/chromium`); keeping the two apart means a future per-Bot split (`shared/` + `bots/<id>/`) can land under `~/workspace` without renaming anything.

## Considered Options

- **Hot export without stopping** — rejected for v1 by ADR-0052 (SQLite file copies are only safe with no transaction in progress); quiesce makes the stopped snapshot consistent without reopening that question.
- **A longer `docker stop` timeout instead of an explicit quiesce** — rejected: the stop signal goes to PID 1, which does not reliably forward it to Chromium; an explicit `docker exec` targets the browser directly and can time-bound the wait.
- **`/workspace` at the container root** — rejected: it would live on the container's writable layer unless separately mounted, so it would vanish on recreate and never appear in the archive (export tars the volume only).
- **Quiescing inside ordinary `stop()`** — rejected: stop/start already ships crash-restore semantics as accepted behavior; only the snapshot path needs the stronger guarantee.

## Consequences

- Export takes up to ~10 seconds longer when a browser is open; the settings rows and the sidebar card show the stopping stage and elapsed time while it runs.
- `~/workspace` reappears (empty) if a Human deletes it, on the next start — intentional: it is a convention, not a store of state.
- The migration guide documents both halves: `~/workspace` as where files live, and the quiesce as why a moved profile opens cleanly.
