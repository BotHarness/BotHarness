# Original upload slice acceptance — #491

Completes the original upload slice implemented in #514, with the exact-file-input fix from #654 retained. The baseline is main `6fc00b7f191a563ca0ac92c09dffd20b28350926`. This is original-slice delivery, not a new followup issue.

## Verified results

| Path                    | Result                                                                                                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Picker button           | Real model observed Attach document, passed its ref to `browser_upload`, observed Target: qa-upload.txt and Other: none, then submitted once in a separately authorized turn.               |
| No ref                  | Real model omitted ref, attached to the first file field while the second stayed empty, then submitted once in a separately authorized turn.                                                |
| Actual bytes            | Loopback server received two multipart submissions, one per path; each contains the 34-byte synthetic file with SHA-256 `13496d14e8a00916410ac3cbb871468ef677baeec38a3349bffdf9798cfc985c`. |
| Missing file / no input | Registered native tools returned readable failures; Browser ownership and observation remained usable.                                                                                      |
| Audit                   | Four upload records: two successes and two readable failures. Successes include basename and size; no supplied absolute Host path or file content occurs in any of these records.           |
| Picker suppression      | A non-headless, managed Chrome session delivered the chooser event under interception and attached via its actual backend node; the model then observed and submitted normally.             |

The fixture invokes a real native chooser through `input.click()` and never assigns file inputs itself. Model turns perform both successful uploads and submissions. Only setup, observation checkpoints and explicit failure probes use the task-local registered Tool adapter. Its Plugin is inserted into a disposable Profile Patch, never the shipped Bundle. Native approval is granted once through the real DM before probing; automatic approval remains disabled.

The [official CDP contract](https://github.com/ChromeDevTools/devtools-protocol/blob/master/json/browser_protocol.json) specifies that interception suppresses the native chooser and emits `Page.fileChooserOpened` with the input's backend node. The implementation enables Page events before intercepting, subscribes before clicking, and disables interception / removes the listener on every exit. The protocol result is the proof of chooser suppression here. The desktop UI adapter selected an older Chrome process instead of this isolated instance, so no OS-level screenshot is claimed; all page screenshots below come from the actual owning Host's authenticated observation route.

## Before / after screenshots

Each unedited JPEG is 2400 × 1472 (CSS viewport 1200 × 736), the same light theme, English fixture, Chinese Chrome file-input labels and synthetic data.

- `before-chooser.jpg` / `after-chooser-attached.jpg`: button ref previously filled the unrelated last field; now the hidden field that opened the chooser receives the file.
- `before-direct.jpg` / `after-direct-attached.jpg`: omitted ref previously filled the last field; now it fills the first.
- `after-chooser-submitted.jpg` / `after-direct-submitted.jpg`: real model clicked Submit once; Completed: 1 reflects actual server acceptance.

`baseline.json` preserves the original wrong-field and path-leak findings without publishing the leaked path. `complete.json` contains only synthetic filenames, byte counts, digests and assertion results. Authentication, Bot/Session identities, local checkpoints and raw events remain outside Git.

## Reproduce / Human QA

Build the Bundle and launch a fresh isolated Profile with `scripts/dev-instance.mjs` and the pinned DSH `0.2.0-rc.1` CLI. Enable the Browser Plugin, keep automatic approval disabled, and insert `scripts/fixtures/browser-queue-qa.mjs` only into this task-local Patch. Use a shared machine-local DeepSeek key; never put credentials or login URLs in Git.

```sh
node scripts/e2e-browser-upload.mjs --serve
```

Set `BH_E2E_ORIGIN`, `BH_E2E_HOME`, `BH_E2E_STATE` and `BH_E2E_ASSETS` to this isolated instance, private checkpoint and output folder. The helper reads the launcher's private authentication cookie. Default fixture port is 32020; change `BH_E2E_FIXTURE_PORT` consistently in both terminals if occupied.

```sh
set -e
node scripts/e2e-browser-upload.mjs --prepare
# Open Upload acceptance QA's DM and Allow once for this synthetic Browser opening.
node scripts/e2e-browser-upload.mjs --ready
node scripts/e2e-browser-upload.mjs --complete
```

A completed checkpoint cannot submit again. Use a fresh Profile and fixture server for another full run. `--baseline` runs only on the original main revision and asserts its failures. `--restore` restores the same Bot's read-only Browser permission after a Bundle restart, using another real model turn and single-call DM approval.

The retained Human QA instance opens Upload acceptance QA's DM with Browser expanded and the chooser page ready. Ask the Bot to attach the same `qa-upload.txt` using Attach document, confirm the Target filename and empty Other field, and explicitly authorize one local Submit. The synthetic fixture never reaches an external site or personal account.

## First failures

Baseline native uploads filled the wrong last field in both cases, and the missing-file audit exposed the supplied Host path. Seven focused regression assertions failed before the runtime change and passed after it. The first event-based real-model run timed out because Page events were not enabled; adding `Page.enable` fixed that concrete integration gap. The successful final run preserves strict field, byte/digest, exact-submission and audit-count assertions. An initial audit probe filtered a nonexistent structured tool field; the helper now filters the stable Browser Audit detail text.

Validation: full suite 1770 passed / 2 optional E2E skipped; final focused Browser suite 138 passed; explicit real-Chrome controls E2E 1 passed; lint, formatting, typecheck, build and bilingual release-ledger checks pass. Human QA remains pending.
