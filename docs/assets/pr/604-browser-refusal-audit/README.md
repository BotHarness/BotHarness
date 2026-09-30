# Browser refusal audit E2E — issue #604

Real isolated DSH `0.2.0-rc.1` Host and managed Chrome, with a real DeepSeek DM turn opening and observing the local fixture. The opt-in QA adapter invokes the registered Session tools after native Client Pause/Resume actions; the refusal/recovery calls are deterministic native-tool calls, not claims about autonomous model decision-making.

## Before and after

Base: `603e760369a53e2a1723b74ba65f5451bf1e3adf` (merged #601). Six new regression cases failed against that revision because immediate refusals produced zero audit rows. Existing queue-time audit assertions passed.

1. Native Client **Pause Bot**; invoke click and type. Both refuse, page confirmations stay zero.
2. Human controls change the item to **Updated by Human**; native Client **Resume**; old click refuses until fresh observation. Page confirmations stay zero.
3. Fresh `browser_observe`, then click its returned ref. The actual page confirms **Updated by Human (1)**, preserving the focused Bot Tab.

The baseline has zero Browser action audit rows for the three refused attempts (`before-paused-results.json`, `before-resumed-results.json`). The fixed run has exactly two Pause errors and one Resume error, with trusted Bot/Session/Orchestrator attribution and `profile-shared` ownership (`after-paused-results.json`, `after-resumed-results.json`). The type attempt records `chars=23`; its private marker never appears. `after-completed-results.json` retains exactly three errors and records one successful click plus the successful observations. Every JSON file contains only synthetic QA results, without authentication or machine-local paths.

## Screenshots and capture exception

- `before-audit-report.jpg` / `after-audit-report.jpg`: matched 1280 × 720, light English reports generated from checked actual Host results, showing missing versus three recorded refusals.
- `after-completed-client.jpg`: actual DSH Client Browser preview after the successful recovery, with the Human-modified page confirmed once.

The existing shared operational logs API can be read by the native verification script, but direct browser navigation to its JSON response was blocked by the browser client. The report screenshots explicitly identify themselves as test evidence, not a product log viewer. No new product log store, reader or UI was added.

## Reproduce

Build the worktree and launch an isolated profile with `scripts/dev-instance.mjs`; enable the Browser plugin with `autoAllowActions: true` only in this disposable QA profile and insert `scripts/fixtures/browser-queue-qa.mjs` as an opt-in plugin. Run the fixture with `node scripts/e2e-browser-refusal-audit.mjs --serve` (loopback port 32004).

Set `BH_E2E_ORIGIN` to the isolated Host, `BH_E2E_HOME` to that profile, and `BH_E2E_STATE` to a private temporary file. Run `--prepare`, operate native Pause, run `--paused`, change the fixture via `/controls`, operate native Resume, run `--resumed`, then `--complete`. Optional `BH_E2E_RESULT` saves checked JSON; `BH_E2E_REPORT` saves the labeled report and lets the fixture serve it at `/evidence`. Use `--before` with refusal phases against the base build. Upload redaction and authorization/Access refusals have focused automated coverage; they were not executed in the real-browser sequence.
