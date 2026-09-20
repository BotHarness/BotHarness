---
Status: Accepted
Date: 2026-09-20
---

# Profile Backup coordinates BotHarness state and optional DSH Sessions

A **Profile Backup** is one user-visible, self-contained, compressed `.botharness-backup` file created only when a Human chooses **Export Profile**. Its indivisible BotHarness core contains a consistent, complete `botharness.db` snapshot, every Persona/Soul/Memory file in the profile, every content-addressed Attachment reachable from the database or Soul files, a format/schema manifest, a non-secret Runtime Dependency Manifest, cryptographic content hashes, and a Purge Ledger checkpoint. It offers no per-PersonaBot or per-table selection; partial transfer belongs to PersonaBot Export. It is the single file selected by **Import Profile** for identity-preserving Managed Restore, not a PersonaBot clone, directory tree, multipart set, or raw copy of live database, WAL, CAS, or DSH files.

The envelope may also contain a DSH Session facet produced and consumed through an adapter at the DSH SessionPersistence interface. When that adapter supports a portable event stream, Profile Backup selects by default every DSH Session referenced by BotHarness Session Ownership and shows the count, estimated size, and privacy warning; a Human may deselect the facet. BotHarness never writes Session event logs into `botharness.db`, never copies a provider's private backend layout, and never claims Session authority. If the active DSH persistence implementation cannot export and import a compatible portable event stream, the backup manifest records the Session facet as omitted or unsupported; the user sees that omission before relying on the backup.

A running Host creates a point-in-time backup through a short **Backup Barrier**, not by archiving PersonaBots or stopping the Host. The barrier pauses new BotHarness mutations, drains current database transactions, flushes each selected DSH Session and records its durable cursor, fixes the Soul/Memory versions and reachable CAS set, and begins the consistent SQLite snapshot. It then reopens mutations immediately; active turns may continue, but events after their recorded cursors belong to the next backup generation. Immutable CAS bytes may be copied after the barrier, and every mutable file is verified against the fixed hash/version before the package is accepted.

Managed Restore is staged and all-or-nothing for every selected facet. It restores into an isolated staging profile, validates cryptographic content hashes, Schema Generation compatibility, the Purge Ledger, Soul/Memory, CAS closure, database integrity, and selected DSH Session streams, and only then atomically activates the staged profile. Hash validation proves package-internal consistency against the supplied manifest and detects accidental corruption; v1 has no signature or authenticated root and therefore makes no source-authenticity or adversarial-tamper claim when an attacker can replace both content and manifest. Package signing may be added later without changing backup authority. A selected facet that cannot be restored aborts activation and leaves the current profile untouched; no background “eventual completion” may expose a half-restored identity. Missing target-local runtime dependencies are not damaged facets: after successful data activation, ADR-0044 keeps only their dependent capabilities unavailable and reports Activation Readiness.

The destination is either a new profile or an explicit whole-profile replacement. Import always validates and constructs the replacement in isolated staging, so failure leaves the current profile untouched. Replace Existing Profile requires an explicit destructive confirmation and recommends exporting the current profile first, but v1 does not create a backup automatically or retain an automatic rollback point. After validation it atomically swaps in the staged profile; record-level merging is forbidden. Combining selected PersonaBots from two profiles uses PersonaBot Export/Import and its fresh identities instead.

When the Session facet was deliberately omitted or unsupported, Managed Restore retains each Session Ownership and audit record as an **Unavailable Session Reference**. It cannot resume and the UI must disclose that its DSH content was not migrated. Bot state and historical attribution remain explainable; only an explicit repair or relink may reconnect it to subsequently recovered DSH Session content.

Credentials and secret values never enter Profile Backup. Non-secret provider account descriptors and credential references may help produce a reauthorization checklist, but restore cannot activate them without local credential resolution and explicit authorization.

Every backup carries the Purge Ledger checkpoint known when it was created. Restore into an existing profile first merges the package ledger with the destination's monotonic ledger and applies the union before Messaging mounts. Restore into a new, empty device can guarantee only the purges present in that package: no offline artifact can know about a purge performed after it was created. Every v1 backup file is a standalone Human-controlled artifact, so an older retained file remains outside later purge control and must display that narrower guarantee.

Every `.botharness-backup` is independently restorable and materializes the complete database, required files, ledger checkpoint, and selected Session facet into one package. Portable restore never depends on locating a base backup or replaying an incremental chain.

v1 has no automatic backup of any kind: no periodic scheduler, migration/replace hook, managed catalog, retention policy, automatic pruning, or incremental storage. Export Profile is one explicit action that produces one compressed file at a Human-selected destination. Import Profile consumes one such file. BotHarness never silently creates or deletes retained backup files.

The simple single-file interaction hides crash-safety details. Export performs a disk-space preflight, writes an uncommitted staging file beside the chosen destination, and validates the manifest and cryptographic content hashes, SQLite integrity, Soul/CAS dependency closure, and the selected Session adapter's structural compatibility before atomic publication. It never deletes or overwrites a previous verified file to make the new export succeed; abandoned staging files are safe to clean on the next startup. Insufficient space or failed verification simply fails the export and leaves existing files untouched. v1 has no fixed default byte budget and performs no automatic deletion; storage management remains explicit.

Every backup must pass those structural and integrity checks, but v1 does not perform a complete isolated Restore rehearsal for every creation. A later manual or periodic deep-verification feature may exercise full restore without changing the package contract.

## Considered Options

- **Exclude DSH Sessions from the one-file migration experience** — rejected as the only path: it preserves ownership but makes full device migration fragmented. An optional SessionPersistence adapter preserves both usability and authority.
- **Copy the active DSH Session backend's files** — rejected: it binds the format to one backend and can capture inconsistent live state.
- **Store Session logs in `botharness.db` for backup convenience** — rejected: backup convenience does not justify a second Session authority.
- **Export credential values with the profile** — rejected: Profile Backup has no custom secret-encryption design in v1 and possession must not grant provider access.
- **Claim an offline old backup knows future purges** — rejected: a local artifact cannot enforce facts created after its checkpoint.
- **Require an online ledger to restore anything** — rejected: it would break local-first offline recovery. The UI must disclose the narrower guarantee instead.
- **Require Host shutdown or archive every PersonaBot for backup** — rejected: a bounded mutation barrier and durable Session cursors provide a useful point-in-time snapshot without disrupting active turns.
- **Copy database, Soul files, and Sessions concurrently without a barrier** — rejected: their references could describe different points in time.
- **Activate a profile after only its database restores** — rejected: missing selected Soul, CAS, or Session facts would expose a half-restored identity.
- **Delete ownership records for omitted Sessions** — rejected: omission of content must not erase historical attribution.
- **Allow a partial BotHarness core selection** — rejected: subset selection would require merge/remap semantics and can violate database-to-Soul/CAS invariants; PersonaBot Export owns that use case.
- **Merge a Profile Backup record-by-record into a non-empty profile** — rejected: identity, Outbox, policy, and purge histories cannot be safely reconciled as generic rows.
- **Make portable backups depend on a base plus increment chain** — rejected: a one-file migration artifact must remain restorable wherever the Human keeps it.
- **Treat content hashes as proof of who created a backup** — rejected: without a signature or authenticated root, an attacker could replace both payload and manifest. v1 claims integrity consistency, not provenance authenticity.
- **Run a periodic default-on backup catalog in v1** — deferred: scheduling, retention buckets, catalog lifecycle, purge invalidation, and capacity policy add machinery that is not required for explicit local backup and migration safety.
- **Create a retained Recovery Backup automatically before migration or replacement** — deferred: it reintroduces destination, lifecycle, retention, cleanup, and failure decisions that v1 intentionally leaves behind one explicit Export Profile action.
- **Require a directory, multipart set, or incremental chain** — rejected: one compressed file is easier to understand, move, and import.
- **Delete an older verified backup before publishing its replacement** — rejected: a crash or validation failure could leave no usable copy.
- **Apply a fixed default byte cap with automatic pruning** — rejected for v1: backup files are explicitly Human-managed, while disk-space preflight prevents an individual operation from exhausting the volume.
- **Fully restore every backup as part of creation** — rejected for v1: structural validation catches incomplete packages without requiring nearly another profile's time and space on every manual operation.

## Consequences

- One-file cross-device migration is possible while DSH remains the Session-log authority.
- The BotHarness core is always complete: full database, all Soul/Memory files, and the transitive reachable CAS set. Per-Bot selection belongs to PersonaBot Export.
- The backup manifest distinguishes required, included, omitted, and unsupported facets and records the producing implementation/version.
- Supported DSH Sessions are included by default with a size/privacy preview and may be explicitly deselected.
- Backup Barrier defines a durable cutoff without cancelling active turns; the manifest records every selected Session cursor and fixed file/CAS version.
- Restore validates in staging and activates only after all selected facets succeed.
- Runtime dependency availability is evaluated separately from data integrity. Missing target-local code, models, credentials, or Workspace mappings do not discard restored history, but their dependent execution paths remain unavailable under ADR-0044.
- Restore targets a new profile or replaces a stopped profile after explicit destructive confirmation; it never merges operational rows. Staging protects against failed import, but successful replacement has no automatic rollback file.
- Omitted or unsupported Session content produces Unavailable Session References, never resumable empty Sessions or lost ownership.
- v1 exposes only Export Profile to one compressed file and Import Profile from one file. There is no automatic or operation-coupled backup, scheduler, managed catalog, retention, automatic pruning, directory/multipart format, or incremental chain.
- Package hashes validate internal consistency but do not authenticate the producing Host; package signing remains a later extension.
- Every manual export is staged, structurally verified, and atomically published without deleting a previous verified file first.
- Disk-space preflight protects each creation, but files have no fixed default byte cap and are never pruned automatically.
- Each file carries only its creation-time Purge Ledger checkpoint; retained older files remain the Human's responsibility and outside later purge erasure.
- Full isolated Restore rehearsal is not required for every backup creation; it remains a later deep-verification feature.
