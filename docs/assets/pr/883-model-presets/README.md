# Model Preset database cutover evidence

Issue #883. This is reusable-template persistence, not Profile Backup delivery. Schema Generation 54 adds the owning template table and one-time import marker; PersonaBot Registry and roster cutover remain #884/#885.

The task-owned DSH 0.2.0-rc.1 Profile was first booted on the previous build (generation 53). Production Host API created a legacy JSON template and applied it independently to two Bots. The upgraded Host imported it once, edited the reusable template to revision 2, retained both original Bot plans at revision 1, and a third Bot applying the edited template produced a real model reply. The old JSON was then intentionally damaged only in this isolated QA Profile. A second cold restart retained the database template and both original independent plans and produced another real model reply.

- `prepare.json`: real old Host/JSON baseline and both applied plan hashes.
- `migration.json`: upgraded database authority, retained identity/revisions and actual model reply.
- `restart.json`: cold restart despite damaged legacy source, unchanged plan hashes and actual model reply.

These are bounded backend/API evidence. They do not prove browser interaction or visual acceptance; each proof says `browserInteractionVerified: false`. No simulated screenshot is supplied. Real UI screenshot/recording and Human QA remain required before merge.

The source file is retained untouched by production migration. The intentionally damaged file and the saved original bytes belong only to the temporary QA fixture. No credentials, cookies, authenticated URLs, raw private logs or other Profile data are committed here.

## Human UI checks

1. Open the isolated QA Profile using its private local login instructions. In Bot mode, inspect **First migration QA** and **Second migration QA**: their independent applied plans still use the original preset snapshot at revision 1.
2. Inspect reusable presets in Profile: **SQLite migration QA** is revision 2. It is a reusable template, not an automatic update to either original Bot.
3. Open **Migrated preset reply QA**: see the requested migration and restart acknowledgement replies from the real DSH model.
4. Capture the Profile template/plan display and the restart reply; attach genuine evidence to the PR and confirm the visual checks. The implementation adds no UI controls or layout changes.

## Recovery and compatibility

- Old template source is validated before a single transaction installs records and the marker. Empty successful import is also marked. An invalid source aborts Core startup, releases the owner lease and remains available to inspect/repair before retry. Diagnostics use `model-presets-import` with a bounded phase/count/duration; no file content is logged.
- Once the marker is committed, modifying/removing the old file cannot change the active template store. It is not a live fallback, runtime write target or automatic backup.
- Diagnostics observer failure does not turn a committed import into a failed operation. Owner-level failed commit rolls back records/marker; retry after recovery imports the same IDs.
- Generation 54 is a forward migration. An older schema plan refuses the database; do not downgrade or manually edit the generation. Keep a compatible upgraded build or use an operator-controlled pre-upgrade recovery image when available. No automatic retained backup/rollback file or portable restore capability is added by this PR.
