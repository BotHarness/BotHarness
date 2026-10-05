# Roster arrangement database verification (#885)

These records come from a real pinned DSH `0.2.0-rc.1` Host using the same isolated Profile before upgrade, after upgrade and after cold restart. They are production API/SSE and read-only database evidence, **not browser interaction evidence or screenshots**.

## Observed path

1. Generation 55: existing production roster commands create two sections and arrange five real Group Channels, with pins, hidden entries, root ordering and retained Channel messages. The existing DSH Storage Domain owns the baseline.
2. Generation 56: its validated state imports once into `roster_arrangement`, with an atomic `roster_arrangement_import` marker. Section IDs, names, membership, order, pins, hidden entries and root ordering match the baseline.
3. Production RPC exercises section create/rename/remove, indexed Channel assignment, section/root reorder, pins/hidden setters and bounded pin/unpin/hide/move batches. The source file remains byte-identical. A second independent authenticated HTTP connection receives `roster/changed` through the actual SSE endpoint, then reads the committed arrangement.
4. Only this disposable QA Profile's retained legacy source is deliberately damaged after cutover. A cold restart uses the same SQLite arrangement, and all five Channels and original messages remain. No normal runtime fallback or source rewrite occurs.

[Baseline](prepare.json), [upgrade and commands](migration.json), [cold restart](restart.json).

The reproducible backend probe is `scripts/e2e-roster-database.mjs` with `prepare`, `migration` and `restart` phases. The baseline requires a generation-55 Bundle, then the same Profile is upgraded to this revision. Its private scene and authenticated launch/cookie files remain machine-local; public evidence contains controlled test names and IDs only.

## Pending Human UI review

The browser tool denied the local QA URL and explicitly prohibited alternative capture paths. No alternate browser, local screenshot tool, Playwright, CDP or proxy is used to bypass that restriction. Every phase records `browserInteractionVerified:false` and `actualSecondBrowserClientVerified:false`.

The isolated Host stays available through private local review instructions. In Bot mode, verify:

- `工作` precedes `SQLite Research QA`, with `Research A` loose between them; the existing root order and membership rules apply.
- `Pinned QA` and `Loose QA` are pinned; `Hidden history QA` and `Research B` remain hidden and can be inspected/restored through the existing hidden Channels manager. Their messages remain intact.
- Make a small section/placement change using the actual UI and verify another Client receives it, then reopen and cold-restart the same Profile.
- Capture genuine screenshots/recording of these states and operations. Match locale, theme, viewport and controlled data for any before/after pair; keep authentication data private.

These UI interactions, a genuine second browser Client and screenshot/recording acceptance remain incomplete. Earlier Human-approved exceptions for other tickets do not apply to #885.

## Ownership and recovery

Sorting stays in native DSH Settings; collapse stays per-Client. Hiding and arranging never delete Channels or their history. The old domain spec remains exported only for one-time import and recovery, and its source is retained.

`createRosterStore` and `RosterStore` now require the Profile `OperationalDatabaseOwner` as `database`. Already imported Profiles can query/edit without opening the legacy facility. A missing marker refuses reads/writes until import succeeds; unreadable/invalid source and an unexpectedly populated target refuse import without silently creating an editable empty arrangement. Repair the retained source through its original DSH storage tooling, or investigate the unmarked target before retrying; do not delete an import marker or copy old source over an authoritative imported target. Unknown newer schema generations require a compatible upgraded build; no down migration is added.

The import records/marker and each complete roster command commit atomically through the existing owner and writer lease. A queued command either publishes after commit or reports failure. This delivers arrangement ownership, **not Profile Backup** (#886).
