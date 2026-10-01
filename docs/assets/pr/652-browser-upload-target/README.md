# Browser upload target E2E — issue #652

The before/after pair uses the real Bot Browser runtime and registered Browser Tools on the same isolated DSH Host and two-input fixture.

- Before: main `7fe56622d6bb599e9f2f3ca30af83604cdd88761`, captured before editing the runtime. The extra QA adapter only calls native Tools; it does not choose or populate DOM nodes itself.
- After: this PR's runtime, revalidated after integrating main `31cf8f85926c2d490593029bf441d0223a625208`. The Browser tree on that main revision is identical to the captured baseline. A fresh file-input ref resolves to its exact CDP node and `DOM.setFileInputFiles` populates that node without clicking or opening a chooser.
- Matched page frames: 2400 × 1472, light theme, English fixture and the same native browser locale, data and requested first input. Client completion: 1280 × 720.
- `before-page.jpg` and `after-page.jpg` show the state after uploading but before submitting. `completed-page.jpg` and `completed-client.png` show the one successful form submission.
- JPEGs are unedited production observation frames; the PNG is an unedited in-app browser screenshot.

| Observable result                         | Before             | After              |
| ----------------------------------------- | ------------------ | ------------------ |
| Explicitly referenced Target document     | Empty              | qa-target.txt      |
| Other attachment                          | qa-target.txt      | Empty              |
| Intended form submission count            | 0                  | 1                  |
| Server verifies file name and payload     | No submission      | Yes                |
| Stale ref refused before upload           | Yes                | Yes                |
| Current target retained / owned tabs      | Yes / 1            | Yes / 1            |
| Attributed upload Audit attempts          | 1 error, 1 success | 1 error, 1 success |
| Absolute Host file path kept out of Audit | Yes                | Yes                |

The real model opened and observed the fixture and replied with its title in the DM. The deterministic probe then calls native Browser Tools through the live Agent's scoped `ctx.tools.execute` adapter. This proves registered Tool/runtime behavior, not autonomous model planning of the upload sequence. The fixture observes the real `FileList` and submits actual `FormData`; the server checks the intended part, empty other part, expected filename and file contents before counting a receipt. The fixture never assigns file inputs itself.

## Reproduce

Use a disposable DSH Profile launched with `scripts/dev-instance.mjs`, the pinned CLI, a usable machine-local DeepSeek key and the built Bundle. Insert `scripts/fixtures/browser-queue-qa.mjs` as a native Patch row named `browser-queue-qa`. Set `botharness-browser.autoAllowActions` only in that disposable QA Profile. Keep the launcher's authentication cookie and the helper's checkpoint outside Git.

1. Start `node scripts/e2e-browser-upload-target.mjs --serve` on its dedicated loopback port 32011.
2. Set `BH_E2E_ORIGIN`, `BH_E2E_HOME` and `BH_E2E_STATE`, then run `node scripts/e2e-browser-upload-target.mjs --prepare`. It creates a harmless QA file under the isolated home, resets the disposable fixture and verifies a real model open/observe turn.
3. Set `BH_E2E_RESULTS`, optionally `BH_E2E_SCREENSHOT` and `BH_E2E_COMPLETED_SCREENSHOT`, then run `node scripts/e2e-browser-upload-target.mjs --probe`. Add `--before` only when probing the verified baseline build.
4. Open Upload QA's DM and expand Browser. The final page reports `Target: qa-target.txt; Other: none; Completed: 1`. A completed probe refuses reuse before sending input; start a fresh disposable prepare for another run.

The first development run exposed a probe-only error: Audit failures have `-> error: <reason>`, not `-> error (...)`. The assertion was corrected to the existing format and both revisions were then checked with fresh state; exactly two attempts, one refusal and one success remain required. Public JSON reports omit private paths, Bot/Session identity, cookies and credentials.

## Scope and validation

This slice selects an explicit file-input ref accurately. Upload-control refs and omitted refs retain the existing last-input fallback; arbitrary chooser-control associations, disabled-field policy, iframe/shadow-root upload, and multi-file APIs are separate work. The model-facing description states that fallback and recommends the explicit observed input through its parameter description. There is no change to Browser Access, Authorization, Pause, queueing, ownership, Client layout or persistence.

The concrete mechanism is verified against the [official CDP DOM definition](https://github.com/ChromeDevTools/devtools-protocol/blob/master/json/browser_protocol.json): `DOM.querySelector` returns the matched node ID, and `DOM.setFileInputFiles` accepts that exact node ID.

Focused Browser validation: **147 passed, 1 existing opt-in skip**; all seven new runtime cases pass, including the previously failing target/refusal cases. Existing button-control and omitted-ref regressions remain green. Full suite: **1680 passed, 1 existing opt-in skip**. Lint, formatting, typecheck, build and bilingual release ledgers passed.
