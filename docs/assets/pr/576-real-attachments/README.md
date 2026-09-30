# Real message attachment verification (#576)

The published screenshots use synthetic Human-only Channels and files. Login URLs, profile paths, credentials, raw logs and private fixtures are not published.

## Revisions and surfaces

- Baseline: merged #575, `f1c1214340b200727460be085201833ab043f649`.
- Current implementation: #576 branch, integrated with main `bf0fdfc8`; the PR head identifies the exact evidence bundle and final source.
- Real pinned DSH `0.2.0-rc.1`, Chromium, Chinese locale; message views are 1440 × 960 in light/dark themes. Image pairs crop the same 1160 × 960 Channel area to omit unrelated roster fixtures.
- Native TextEdit captures are 1312 × 844. Before/after show the same real transferred destination; saving used the native editor UI, not the verification script.

## Observed outcomes

| Check                                                                         | Result | Evidence                                                                                                                |
| ----------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------- |
| Actual composer picker sends a Unicode/spaced filename                        | PASS   | `before-dark.png`, `after-dark.png`; corresponding light pair                                                           |
| File click/context/More menu, current native application choices              | PASS   | `before-context-dark.png`, `after-menu-dark.png`                                                                        |
| Copy resolves the message-owned Host path                                     | PASS   | Browser clipboard equality check                                                                                        |
| Browser menu download preserves transferred bytes and filename                | PASS   | Browser download file equality check                                                                                    |
| TextEdit opens and saves the actual destination                               | PASS   | `editor-before.png`, `editor-after.png`; native accessibility path matched the validated destination                    |
| Original message reads/downloads saved bytes and current MIME/size            | PASS   | 55-byte original becomes 76 bytes; `saved-current-message.png`; authenticated current download uses `no-store`          |
| Independent equal upload and original upload source remain unchanged          | PASS   | Both remain the original 55 bytes after the other destination is edited                                                 |
| Explicit reference reuse reads the same saved file                            | PASS   | Original and shared messages read the same 76 bytes                                                                     |
| Stable upload key retry preserves one independent identity                    | PASS   | Equal transfer receipts; regression additionally verifies retry never overwrites external edits                         |
| Wrong message/Channel owner refuses target/download                           | PASS   | RPC refusal and HTTP 404                                                                                                |
| External save adds no durable attention or message facts                      | PASS   | Full table counts, Source Event envelopes and Inbox Admissions compared immediately before/after native save; unchanged |
| Real image upload keeps PNG MIME, exact bytes, inline display and preview     | PASS   | `before-image-dark.png`, `after-image-dark.png`; actual picker and browser preview                                      |
| Image context/More action menu preserves left-click preview                   | PASS   | `before-image-menu-dark.png`, `after-image-menu-dark.png`                                                               |
| Host restart retains original/shared/independent identities and current bytes | PASS   | Restart phase against the same Profile                                                                                  |
| Missing destination is unavailable and never recreated                        | PASS   | Temporary removal yields HTTP 404 with no replacement; restored solely by the verification script                       |
| Finder reveal selects that same destination                                   | PASS   | Native accessibility selected-file URL matched; screenshot omitted because Finder's personal Favorites would be visible |

The no-attention runtime fixture uses a Human-only Group and paused fixture Bots. It proves no save-triggered database/admission/scheduling changes, not a live provider inference or an external IM delivery. Trusted Bot membership/image/forwarding and bounded full/compact reads are covered at their production-seam regression boundaries. Legacy hash objects remain readable and cannot be opened for in-place editing; migration belongs to #577. Remote Tailscale/Cloudflare transport and Windows native applications are not exercised on this macOS fixture.

## Runnable path

Use the private output from `scripts/dev-instance.mjs` as `BH_E2E_INSTANCE`, a private writable JSON path as `BH_E2E_FIXTURE`, and run `scripts/e2e-real-attachment-files.mjs` in these phases:

1. `prepare`: real composer send, menus, copy/download, independence/retry and TextEdit handoff.
2. Save the transferred document in the actual external editor. The expected synthetic edit is stated in the driver.
3. `verify`: original/shared reads, independence, current metadata, ownership refusal and unchanged authority.
4. Restart that exact isolated Profile through the launcher, then `restart`.
5. `image`: actual image picker, byte-preserving preview and context/More menus. `reveal` optionally hands off to Finder for native selection inspection.

Automated checks and their final results are recorded in the PR. The first integrated full test run had one pre-existing Memory large-file test time out at 15 seconds (1484 passed, 1 failed, 1 pre-existing opt-in skipped). The same test passed separately; a complete follow-up at four workers passed 1485 tests with the same one pre-existing opt-in skip. This is retained as an intermittent failure, without changing its assertion or timeout.

Final integration with main `bf0fdfc8`: 187 test files and 1496 tests passed at four workers, with one pre-existing opt-in file/test skipped; build, lint/release ledgers, format, typecheck and the 260-page bilingual docs build passed. The final integrated Host repeated the real native editor open/save and current-file/ownership/no-attention verification.
