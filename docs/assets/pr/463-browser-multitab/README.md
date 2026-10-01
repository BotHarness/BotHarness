# Original Browser slice #463: multi-tab acceptance

Final runtime, rebuilt after merging main at `4e0b69e9` (tested implementation `fa3e2436`): isolated DSH 0.2.0-rc.1 Host, two real DeepSeek PersonaBots, a shared installed Chrome profile, production Browser Provider and registered tools. The unshipped `browser-queue-qa` fixture is inserted only into the isolated Profile for deterministic concurrency calls; it delegates to registered native tools and does not replace Browser authority, authorization or persistence. No raw CDP test controller is used.

The current accepted model is ADR-0095: owned background Bot Tabs in one shared Browser window, with explicit Human reveal. The original dedicated-window wording is superseded.

## Functional results

- Real models created 3 A / 2 B owned tabs and selected the work pages.
- Two concurrent registered cold consumers produced exactly one shared-profile launch and one ready event.
- Two registered Bot requests reached a server rendezvous before either response; same-Bot second navigation began only after the first response finished. A foreign target select was refused.
- Overlapping real model DMs each observed, typed its token and clicked Complete task. Server receipts confirmed exactly one task per Bot, with BOT-A / BOT-B.
- Human explicitly revealed A home and typed in Chrome's native UI. After both background tasks, a key appended to the same focused input without a new click; the native accessibility tree still selected Human workbench A and left Bot work tabs unselected. `foreground-after.txt` and `human-page-after.jpg` record this state.
- Human closed A's current background work tab through Chrome's native Close button. The next registered observe returned the actual readable recovery message in `e2e-results.json`; a real model opened a new owned page, typed RECOVERED-A and submitted the second A task.
- With only the isolated QA Profile set to one-minute idle timeout, A's three tabs closed after 75.954 seconds while B was polled every five seconds and retained its two tabs, current work page and frame. The shared Browser did not restart. Production's default timeout is unchanged.
- A real model opened a fresh page after idle, observed and took a model screenshot without submitting again. After another normal idle expiry during evidence preparation, a registered tool reopened the same read-only recovery page for the final Client capture and Human QA, without another task submission. Registered `browser_tabs` open/close/list/select then left one A tab; both Bot audits were attributed to their trusted Session ownership.

`client-a.png` and `client-b.png` are actual 1280 × 720 Client screenshots, visually inspected. `bot-a-recovered.jpg` and `bot-b-active.jpg` are actual Host Browser frames. They show the server-confirmed completion count and current Browser entry, not a mock screen.

## Baseline failures and capture limitation

`before-closed-tab.json` preserves the base revision's actual next-observe error after native Human closure: `Session with given id not found.` without recovery instructions. `before-cold-start.json` preserves the real simultaneous-model startup failure: repeated shared-profile launches and `The Bot Browser exited during startup (code 0)`. The focused regression suite reproduced the duplicate spawn before the fix; after the fix 134 focused tests passed.

A matching native Chrome before/after image could not be published: the native screenshot API returned the initial cached frame even after native accessibility state and input changed. Those stale images were excluded. Native accessibility evidence and fresh Host frames provide the actual Human focus proof; IAB Client screenshots were fresh and inspected. These changes affect Host startup and model tool errors; no Client layout or controls were changed.

Preparation-only failures were kept separate: an initial model selected home instead of work; the strict harness rejected it. A stopped synthetic fixture server caused a setup turn to fail; the server was restored and a new model turn passed. One-minute QA idle expiry during preparation also cleared B before the timed active-peer test; registered tools restored it before that test. None of these failures was counted as a runtime fix or a passing acceptance run.

## Runnable path

Use `scripts/dev-instance.mjs` with a dedicated DSH home and the pinned CLI, enable Browser, set its idle timeout to 1 minute for this test, and insert `scripts/fixtures/browser-queue-qa.mjs` only into that Profile. Start `node scripts/e2e-browser-multitab.mjs --serve` in a live process session. Set `BH_E2E_HOME`, `BH_E2E_ORIGIN`, `BH_E2E_STATE` (private file) and optionally `BH_E2E_FIXTURE_PORT`.

1. `--prepare`: create the two Bots; approve each precise localhost opening once through native approval UI, then `--ready`.
2. `--cold-start`; then `--restore` and wait for the model turn to finish before `--ready`.
3. `--concurrency`; explicitly reveal A home with the Browser entry and type a Human note while model current stays A work.
4. `--tasks`; append a key without clicking the input again, verify native selected tab/focus, then record `humanFocusRetained: true` in the private state only after that observation.
5. Close the current A work tab through Chrome's native UI; `--closed`.
6. `--idle`: keep B active, never poll A during the timer. Start with three A tabs and two B tabs; a preparation keepalive must be stopped before Human closure and idle.
7. `--complete` with `BH_E2E_RESULTS`, `BH_E2E_SCREENSHOT_A` and `BH_E2E_SCREENSHOT_B` output paths.

Format the generated result JSON with the repository formatter before committing evidence. The CLI phases fail on unmet preconditions and actual tool/model failures. Keep API cookies, Session identifiers, prompts and raw logs private. Human QA can open the isolated Client at port 3129, choose Tabs QA A or Tabs QA B, and expand Browser.

## Automated validation

134 focused tests passed. Full suite: 1762 passed, 2 explicit skips. Lint, source policy, formatting, TypeScript, build, and both release ledger checks passed.

The first remote CI run stopped on result JSON formatting; that file was formatted before the latest-main verification. Its run is preserved at https://github.com/BotHarness/BotHarness/actions/runs/36885225864; it is not counted as a passing CI run.
