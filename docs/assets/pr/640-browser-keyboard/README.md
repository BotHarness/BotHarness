# Native Browser keyboard evidence — #640

The existing Browser Tool Consumer calls the application-defined Browser Provider and managed Chrome runtime. These runs use native Agent-scoped Session Tools, the real Host queue/authorization/Audit path and real Chrome. No input is injected through a separate debug connection.

## Observed behavior

Both runs use the same disposable form at `http://127.0.0.1:32008/page`, Browser profile `keyboard`, English light-theme shell and test data. The form uses ordinary HTML GET submission: it has no JavaScript submission or keyboard-default handler. JavaScript only displays the focus, edited value and `KeyboardEvent.isTrusted`.

| Check                            | Before — main `0e439bd4`                     | After — this PR                                     |
| -------------------------------- | -------------------------------------------- | --------------------------------------------------- |
| Unsupported `Control+Enter`      | Tool success; Audit ok                       | Tool error; Audit error; current target retained    |
| Tab → ArrowRight → Backspace → z | Focus stays Task; Edit stays `ab`; untrusted | Focus moves to Edit; value becomes `az`; trusted    |
| Enter on the focused field       | Form remains open; zero submissions          | Native form submits once with exact expected values |
| Target ownership                 | Original current target, one owned tab       | Original current target, one owned tab              |
| Six attributed key attempts      | Six ok, zero error                           | Five ok, one error                                  |

The baseline was captured before changing the production runtime. Each model setup is verified through durable Tool results and a completed Turn; the Client also shows its committed DM reply. The deterministic keyboard probe then executes the real native Tools. This does not claim autonomous model planning of the keyboard sequence.

## Images and results

- `before-page.jpg` / `after-page.jpg`: original 2400 × 1472 Chrome JPEG frames returned by the production observation endpoint, without edits. They show the form remaining unchanged versus its real submission receipt.
- `before-client.jpg` / `after-client.jpg`: actual 1280 × 720 Client screenshots, with the Browser profile and preview visible. The Channel sidebar is 320 px in both. DM setup history differs because the same isolated Profile is reused across real-model setup runs.
- `before-results.json` / `after-results.json`: public-safe results checked against native Tool replies, fresh observations, fixture state and operational Audit rows. They omit authentication, DSH Session identities and raw logs.

## Reproduction

Use a dedicated checkout, isolated DSH home and free local ports. This QA fixture contains only disposable test data. Start the fixture with `node scripts/e2e-browser-keyboard.mjs --serve` (port 32008), and build the desired revision with `pnpm build`.

Launch the checkout's pinned DSH through `node scripts/dev-instance.mjs --home <isolated-home> --port <free-port> --json`. Keep the login and cookie output private. In that home’s `profiles/web-dev/cordis.patch.yml`, enable Browser auto-allow for this disposable QA only and insert `scripts/fixtures/browser-queue-qa.mjs` from the same checkout. Stop the exact launcher PID and restart that same isolated home so the Patch and Host build take effect. Do not change another instance.

The Patch rows are:

```yaml
- id: botharness-browser
  config:
    autoAllowActions: true
- insert:
    - id: browser-queue-qa
      name: <absolute-checkout>/scripts/fixtures/browser-queue-qa.mjs
```

Set `BH_E2E_ORIGIN`, `BH_E2E_HOME` and `BH_E2E_STATE` to the isolated origin, home and private state path. Run `node scripts/e2e-browser-keyboard.mjs --prepare`; it creates Keyboard QA, enables Browser Access, assigns `keyboard`, and sends a real model turn that opens/observes the fixture without clicking.

Set `BH_E2E_RESULTS` to a result file, optionally `BH_E2E_SCREENSHOT` to a JPEG file, and run `node scripts/e2e-browser-keyboard.mjs --probe`. Use `--probe --before` only for the baseline revision. The probe types `native-keys` into Task, attempts the unsupported chord, presses Tab/ArrowRight/Backspace/z, freshly observes the editing result, presses Enter and verifies submission plus all six attributed Audit outcomes. It checks current/owned targets before and after. A completed probe is refused before further input; verified repeat refusal keeps the submission count at one.

For Human review, open the launcher's login URL, enter Bot mode, choose Keyboard QA and expand Browser. The completed page reads **Native Enter submitted the form (1)** with Task `native-keys` and edited value `az`.

## Verification and limits

- Sixteen new runtime regression cases fail on the base and pass on the change; focused runtime/Provider coverage totals 98 passing tests. Transport rejection preserves the original error and attempts key release; unsupported keys are rejected before CDP input.
- Static checks, bilingual Release Ledger and build pass. The first local full-suite run also exposed an unrelated 15-second timeout in the unchanged Memory binary-stream test; the identical file passed in focused runs on both base and head. Its first failure is retained locally, and no assertion or timeout was weakened. Final full-suite and exact-head CI results are recorded in the PR.
- Supported named individual keys and printable US ASCII use the Chrome input protocol. Use `Space` for a space and `browser_type` for arbitrary text. Modifier chords, held keys, IME and platform shortcut semantics are outside this slice.
- Native defaults can now navigate or edit the page. Re-observe after navigation and honor the existing Human action-approval rules. `isTrusted` demonstrates Chrome-generated input; it is not proof of hardware input or universal website compatibility.
