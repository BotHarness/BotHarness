# Existing-message attachment migration verification (#577)

All screenshots use synthetic files and Human-only Channels. The isolated Profile, login URLs, credentials, raw logs and private fixtures remain outside Git.

## Revisions and capture

- Before: merged #575, `f1c1214340b200727460be085201833ab043f649`, creates actual legacy attachments through the composer picker.
- After: #577 on merged #576, `97b312ea5bdb2f22c41254de13d136b41af6c583`; the PR head identifies the final source and evidence bundle.
- Pinned DSH `0.2.0-rc.1`, Chromium, Chinese locale, 1440 × 960 light/dark message views. The same selected legacy Channel, filenames and messages are retained across a private SQLite backup into a new isolated Profile. A separate Memory regression fixture appears in the migrated Profile's sidebar.
- Native TextEdit: 1312 × 844, the same transferred destination before/after a real editor save. Native accessibility matched its URL to the validated message target. Editing used the native UI, not the verification driver.

## Observed outcomes

| Check                                                                                            | Result | Evidence                                                                                    |
| ------------------------------------------------------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------- |
| Two old picker uploads with equal content migrate to independent fileIds                         | PASS   | `before-dark.png`, `after-dark.png`; corresponding light pair                               |
| Original message menu gains current Host applications, reveal, copy and download                 | PASS   | `before-menu-dark.png`, `after-menu-dark.png`                                               |
| Native editor opens and saves the migrated destination                                           | PASS   | `editor-before.png`, `editor-after.png`                                                     |
| Original canonical and owner-qualified old-hash reads return saved current bytes                 | PASS   | Authenticated current downloads, `no-store`, current size/MIME; `saved-current-message.png` |
| Actual original-message menu download preserves current bytes and Unicode/spaced filename        | PASS   | Browser download file equality                                                              |
| Equal independent upload and upload source remain unchanged                                      | PASS   | Both retain the original text after the first destination is saved                          |
| Explicit canonical identity reuse follows the same current file                                  | PASS   | A subsequent message reuses the migrated fileId and reads saved bytes                       |
| Migration preserves Source Events, text, placements and Inbox Admissions                         | PASS   | Exact before/after durable fact rows                                                        |
| External save writes no database or scheduling state                                             | PASS   | All database table rows match immediately before/after native save                          |
| Old PNG keeps exact bytes, MIME, inline dimensions and left-click preview                        | PASS   | `before-image-dark.png`, `after-image-dark.png`; actual browser preview                     |
| Migrated PNG context and More menus expose native file actions                                   | PASS   | `before-image-menu-dark.png`, `after-image-menu-dark.png`                                   |
| Restart retains identities, saved bytes and independent destinations                             | PASS   | Same isolated Profile restart                                                               |
| Missing migrated target refuses canonical and owner-qualified old-hash reads                     | PASS   | HTTP 404; no CAS substitution or destination reconstruction                                 |
| Interruption, concurrent startup, source/destination corruption and mixed cleanup                | PASS   | Nine migration regression tests at production ownership seams                               |
| Model cached legacy/canonical image references read current bounded bytes with membership checks | PASS   | Integrated runtime regression; full/compact reads expose canonical refs without Host paths  |

A Human-only fixture establishes absence of save-triggered durable attention, not live provider inference. Windows native applications and remote Tailscale/Cloudflare Tunnel access are not exercised on this macOS fixture. Backup/Export/Purge products are not implemented or claimed verified here; their integration requirements are documented under the owning architecture.

The first seed/open driver attempts missed ready composer/Channel elements. Waiting for those existing elements fixed the verification driver; the production assertions were retained and subsequent runs passed. No product failure was masked or test timeout increased.

## Runnable path

Use private launcher JSON for `BH_E2E_INSTANCE` and a private `BH_E2E_FIXTURE` path with `scripts/e2e-legacy-attachment-migration.mjs`:

1. On a pre-migration Host, run `seed` with `BH_E2E_NEW_HOME` set to a new isolated destination. It sends two actual picker uploads and uses SQLite backup to copy message facts plus attachment/Bot files, without credentials or a writer lease.
2. Optionally run `image` against an existing old synthetic PNG message to capture the baseline.
3. Start the migrated Host on that new Profile, then `open-editor`. It validates preserved facts and independent identities and dispatches the original message menu to TextEdit.
4. Save the expected synthetic text through the actual native editor; run `verify` and `download`.
5. Restart that exact isolated Host/Profile, then run `restart` and `image`.

Unit coverage verifies restart from pending transfer, idempotency, no overwrite of edited ready/pending destinations, ambiguous old hashes, preserved immutable facts, obsolete-send rejection, current full/compact/model-image reads and reference-aware CAS release. The local full suite passed 1520 tests with one pre-existing opt-in test/file skipped; the subsequently added integrated model-image test passed in the nine-test migration suite. Final PR-head CI provides the complete final-revision result.

Human-QA merge preparation verified and fixed two automatic review findings: pending duplicate occurrences of one CAS object remain readable until conversion separates their destinations, and Client download URLs require the owning Channel/message for both identity forms. The focused migration/Client regression suite passed 93 tests; final integrated CI covers current main.
