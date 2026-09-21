---
Status: Accepted
Date: 2026-09-21
---

# Computer storage stays on a named volume; portability is an explicit profile-level export

A Computer's persistent volume holds a live Chrome profile — SQLite databases (`Cookies`, `History`), LevelDB/IndexedDB, caches, and downloads. Humans want to choose where that data lives and to carry it to another machine. BotHarness keeps the live store on a Docker **named volume** and makes portability an explicit export action rather than a host-path bind mount.

## Decision

- The live Computer store is always a Docker named volume. BotHarness does **not** bind-mount the live Chrome profile, because bind mounts on Docker Desktop and Colima/Lima pass through a FUSE-backed host↔VM file server where POSIX locking and WAL are not reliable: Docker's own open bug `docker/for-mac#7004` shows two processes acquiring the same exclusive `flock` through the `fakeowner` layer while the same test behaves correctly on a named volume; SQLite documents that WAL does not work over a network/virtual filesystem and that buggy advisory locking corrupts databases; Chrome's `SingletonLock` and cache assumptions also break on shared filesystems.
- "Choose where the disk lives" is satisfied in two places instead:
  - the **Docker storage root** — Docker Desktop's disk image location, WSL2's data directory, or `COLIMA_HOME`/OrbStack's volume directory — which BotHarness documents but never edits;
  - an explicit **Computer Export** to a Human-chosen directory.
- **Computer Export** is one archive of the volume: the container is stopped, the volume is tarred (uid/gid preserved), and the container is restarted. **Import** creates the volume and unpacks the archive on the target Host. One file out, one file in; the format is an implementation detail, and the archive works across macOS, Linux, and Windows Docker engines.
- Computer data is **profile-scoped** (ADR-0051), so the export is a facet of **Profile Backup / Profile Transfer**, never of a PersonaBot export; exporting one PersonaBot must not leak the logins and files every PersonaBot of the profile shares.
- A **Linux-only opt-in bind mount** is allowed behind explicit configuration for professional deployments such as VPS hosts, documented with the SQLite/Chrome caveats; it is never the default and is not offered on Docker Desktop for macOS or Windows.
- Changing the storage binding after the container exists is an explicit migrate/recreate action; it never happens silently on start.

## Considered Options

- **Bind-mount the live profile on every platform** — rejected: correctness first. The locking/WAL failure modes corrupt the profile; performance on Desktop is also worse for database workloads.
- **Per-volume host path for named volumes** — rejected: Docker does not offer it; only the whole storage root is movable.
- **Depend on Docker Desktop's volume export UI** — rejected: equivalent semantics (it also stops the container) but ties portability to one vendor's desktop app; our own stop→tar→start keeps the same guarantee everywhere.
- **Per-PersonaBot Computer export** — rejected: contradicts the shared-Computer decision; the facet belongs to the profile.
- **Hot backup while Chrome runs** — deferred: SQLite file copies are only safe with no transaction in progress, so v1 stops the container; a later slice may use `VACUUM INTO`-style snapshots for hot export.

## Consequences

- Restore and activation readiness treat the Computer facet as a dependency: the target needs a container runtime plus the pinned image before the Computer is usable; a missing runtime degrades that facet without failing the profile restore.
- Exports are large (gigabytes). Profile Backup needs an explicit size/redaction policy for the facet rather than including it by default.
- The panel's export/import actions live behind the same explicit authorization as start, and the export directory is configuration, not a per-request path.
- Memory stays separate: a PersonaBot that wants a file from the Computer must export/import it explicitly; no implicit filesystem bridge is added.
