# Browser profile reserved-name QA — issue #611

Base: `662b76a9` (includes merged PR #608). English Client, light theme, 1280 × 720. Before/after use a 320 px Channel sidebar; the error detail scrolls that sidebar, and the completion view expands it to 560 px for readability. Screenshots come from the real DSH Client and Chrome preview, with no DOM or image edits.

## Observed behavior

- `before.jpg` / `before-results.json`: real model opened and observed the fixture in `work.v2`. Native Pause Bot, then submitting `..` in Profile on the base build saved the reserved name, cleared the Bot's owned tabs/current selection and Pause, and left “No frame yet”. The unsafe runtime directory was not launched in this UI reproduction.
- `after.jpg` / `after-results.json`: the same native submission on the fixed build rejects the name; `work.v2`, the original target, preview and Pause remain. `error.jpg` shows the existing error surface with the rejection message. Native submission of `.` also preserves that state (`after-dot-results.json`).
- `completed.jpg` / `completed-results.json`: native Resume, followed by fresh `browser_observe` and `browser_click` through the existing QA adapter's real Session tools, confirms the fixture once in the same original tab. The model performs setup; recovery uses deterministic Session tool calls, rather than claiming a fully autonomous model recovery.
- Baseline regression tests: 8 failed, 50 passed. Fixed focused tests: 58 passed. The runtime tests verify that reserved stored names reuse the existing default runtime and never select a parent directory. Valid dotted names and default aliases remain supported.
- Full suite: 189 test files passed, 1 skipped; 1,535 tests passed, 1 skipped. The configured skip is not a pass.

## Reproduce

Build this worktree, launch an isolated DSH instance with `scripts/dev-instance.mjs`, and insert `scripts/fixtures/browser-queue-qa.mjs` into that instance's patch (see the existing Browser QA examples). Enable local automatic Browser actions for this disposable QA profile. The fixture is local-only on port 32005.

```sh
node scripts/e2e-browser-profile-names.mjs --serve
export BH_E2E_ORIGIN=http://127.0.0.1:3110
export BH_E2E_HOME=<isolated-home>
export BH_E2E_STATE=<private-state-file>
node scripts/e2e-browser-profile-names.mjs --prepare
```

Open the Profile Name QA DM. In its Browser entry, click Pause Bot, enter `..` into Profile and press Enter. Check the error, retained `work.v2`, tab and Resume button, then run:

```sh
node scripts/e2e-browser-profile-names.mjs --rejected
```

Repeat with `.` if desired. Click native Resume, then run:

```sh
node scripts/e2e-browser-profile-names.mjs --complete
```

The completion mode requires the rejection checkpoint and a zero confirmation count before calling any Browser tool, and refuses a repeated completion. The optional `BH_E2E_RESULT` saves a public-safe result JSON; keep the state file and authentication cookie private. For a base build reproduction use `--rejected --before`; that run ends after proving the lost-state regression.
