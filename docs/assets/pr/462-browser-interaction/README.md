# Browser interaction acceptance (#462)

This closes the original interaction acceptance checkpoint through an isolated pinned
DSH `0.2.0-rc.1` Host, real DeepSeek model, native tool registration, managed Chrome,
and the existing authenticated Browser frame route. Computer Access was off.
All fixture data and the search query are synthetic.

## Actual results

- A real DM searched for `aurora`, submitted through native Enter, observed the results,
  and clicked the first result. The fixture server verified one new search submission
  and one first-result opening **during that DM task**. The model used all five tools:
  `browser_type`, `browser_press_key`, `browser_click`, `browser_wait`, `browser_scroll`.
- A ref from the prior search page was rejected as stale; it never edited the new page.
  Every interaction had a Bot/Session-attributed Browser Audit entry. Typed text was
  represented as `chars=6`, with neither the query nor rejected text in those Audit rows.
- On base `caa9ec3f`, the never-completing image fixture returned click success after
  15146ms. The actual model reported the success, while noting that loading was unfinished.
- On the final runtime, that native click returned the readable `15000ms` readiness error.
  The measured **whole tool round trip** was 15164ms, including transport and registration.
  The real model also received the error after one click, observed the partial page,
  explained that the click might already have happened, and did not click again.
- The original owned target remained current after the timeout. Read-only observation
  remained available. Recovery opened the first result on the same current target,
  followed by a real model observation, screenshot, and committed DM reply.

`results.json` contains final assertions. The before/after timeout JSON files retain
both actual native outcomes and actual model replies. `completed.jpg` and
`unsettled-after.jpg` are actual managed Browser frames, not reconstructed images.

The synthetic server retains previous runs. Counts in the report are deltas for the
verified DM task; later recovery navigation is separate from the original search.
Host restarts recreate process-local Bot tab state, so the fresh task establishes its
current target before checking retention; this does not claim tab persistence across restart.

## Regressions and validation

Four tests failed on the base because readiness exhaustion returned success. A first
correction also exposed an old-document readiness race; its failing deterministic
case and real-model tool result were retained before requiring two complete samples
one polling interval apart. A final search regression failed when a background click
did not open the first result; native mouse/key input now prepares focus in the owning
CDP Session, using the existing emulation mechanism without foreground activation.
The final complete model task passed on a freshly restarted Browser before its first
scroll or model screenshot.

Runtime tests cover reused/new navigation, key/type actions, delayed navigation,
transient execution context loss, recovery, and background input without activating a
Human target. Focused runtime/tool tests: 130 passed. Full local suite: 1744 passed,
2 explicit opt-in skips; lint, format, typecheck and build passed. Exact PR-head CI is
linked from the PR description.

The readiness check uses a 15-second polling deadline and two complete readings
200ms apart; this adds at least one polling interval to healthy actions. It does not
undo an already issued input. `browser_wait` remains the existing bounded-duration
sleep (up to 10 seconds), not a new condition or network-idle API.

## Capture limitation

The Client screenshot pair could not be completed: CUA's IAB DOM/screenshot/navigation
commands timed out, including in a fresh tab, and native Chrome capture failed with
macOS ScreenCaptureKit error `-3811`. The Host frame route and real model remained
functional. The PR therefore embeds actual managed Browser page captures, retains
before/after tool and model results, and supplies the following runnable Client QA path.
The page images show functional states, not a Client layout diff; no Client source changed.

## Human QA and reproduction

Preserved Host: `http://127.0.0.1:3128/` → Bot mode → **Interaction QA** → Browser.
Fixture: `http://127.0.0.1:32018/page`. The final page shows Aurora field notes.
Review the DM's actual search and timeout replies; ask the Bot to search again and open
its first result. For timeout QA, ask it to open the fixture, observe, then click
**Never settle** once and report the actual result without retrying. The page should
remain inspectable after the error. Do not treat this fixture as a live external search site.

To reproduce on a fresh isolated Profile:

1. Build and launch using `scripts/dev-instance.mjs`. Keep its login URL, cookie jar and
   credential files private. Insert `scripts/fixtures/browser-queue-qa.mjs` through that
   Profile's Patch, then restart. This existing QA adapter is not shipped in the Bundle.
2. Start `node scripts/e2e-browser-interaction.mjs --serve`, optionally setting
   `BH_E2E_FIXTURE_PORT`. Set `BH_E2E_HOME`, `BH_E2E_ORIGIN` and a private `BH_E2E_STATE` path.
3. Run `--prepare`; approve only the fixture Browser opening using the existing one-time
   approval control. Run `--ready`, then `--search`. The latter checks actual fixture
   counters, all five model tools, stale-ref refusal and redacted Audit.
4. Set `BH_E2E_RESULTS` and run `--probe` for the registered native timeout and Audit check.
   Run `--timeout-model` for the real model's one-click error and reply. The `--before`
   variant records the corresponding expected base success.
5. Set public-safe `BH_E2E_RESULTS` and `BH_E2E_SCREENSHOT` paths, then run `--complete`
   for recovery and the actual Browser JPEG. Reopened final builds use `--reopen` before
   repeating `--search`; approve the precise opening again if a Host restart requires it.
6. Run `pnpm exec vitest run packages/browser/test/runtime.test.ts packages/browser/test/browser-tools.test.ts`.

The delivered Profile and fixture remain running for Human QA. No secrets, private
paths, session IDs or raw private logs are included in these public files.
