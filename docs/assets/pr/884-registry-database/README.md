# Registry database cutover evidence

Issue #884, Schema Generation 55. The existing Registry command/query and Host API interfaces now use the owning Profile database. This is not Profile Backup delivery; roster #885 and complete portability #886 remain outstanding.

## Real DSH functional path

The isolated DSH 0.2.0-rc.1 Profile first ran the previous generation-54 bundle. Production API calls created two PersonaBots with saved appearance and independently applied model plans. One Bot was paused and retained enabled Computer/Browser access and a Browser profile; no Computer/Browser operation was performed.

The upgraded Host atomically imported their legacy records, then production APIs changed the active Bot's name, roles, appearance and Assignment model allowlist. A subsequent reusable-template edit did not change the two applied plans. A newly created Bot wrote only to SQLite. Both original legacy files remained byte-identical until the QA fixture intentionally damaged them after cutover; production migration did not modify them.

A cold restart with those damaged source files preserved the active Bot's edited record and plan revision 2, the paused Bot's original record/plan revision 1, and both PERSONA.md hashes. Actual model acknowledgements appeared in the canonical DM before and after restart:

- `REGISTRY_DATABASE_MIGRATION_OK`
- `REGISTRY_DATABASE_RESTART_OK`

`prepare.json`, `migration.json` and `restart.json` hold bounded production API/database evidence, including the identity, record and Soul hashes. They explicitly record `browserInteractionVerified: false`. No browser capture or simulated screenshot is supplied.

## Human review and visual evidence

Use the private local QA login instructions to open the isolated Profile. Inspect **SQLite Registry QA**: Database QA role, saved large-eye appearance, updated description and independent Assignment model plan. Inspect **Paused Registry QA**: same original identity/appearance, paused state and saved access switches. Open the active Bot's DM and confirm the two real acknowledgements. Capture genuine Profile and reply screenshots, then attach them to the PR before Human QA/merge. No new UI controls or layout changes are introduced.

The browser tool denied the local QA URL and explicitly prohibited alternate capture paths. Backend verification is not a claim that the browser interaction was accepted. The screenshot exception approved for #883 does not apply to this issue.

## Import, recovery and compatibility

- The owning Registry uses the existing Profile Writer Lease. All valid legacy records and an import marker, including an empty import, commit in one transaction. Invalid JSON, invalid identity/flags/plan or interrupted commit cannot create a silently empty or partially imported registry. Core aborts import startup and releases the lease. Diagnostics report only a stable phase/count/duration; no private record or path is logged.
- Existing avatar validation still retains safe future appearance recipes and their paired PNGs, while dropping unsafe or mismatched appearance metadata without losing an otherwise valid Bot. Unknown top-level/model-route fields are not copied into database records.
- Retain Soul and legacy source, repair invalid input before retry, and keep a compatible generation-55 build after successful cutover. An older schema plan refuses the database; no downgrade or automatic retained backup is added. An operator-controlled pre-upgrade image may be used if one exists.
- After cutover, old records are not read, written, or used to resurrect removed Bots. The public `createPersonaBotRegistry` factory now requires the existing Profile owner as `database`; commands/queries retain their interfaces.
- Normal removal preserves Soul. The existing authorized Purge callback, file scope and usage-retirement flow remain unchanged; Registry deletion follows successful completion of that flow. This does not introduce cross-file/SQLite purge atomicity or settle #138's destructive/Purge contract.
