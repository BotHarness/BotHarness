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

## Human QA amendment: Profile combobox

- `ui-before.jpg` / `ui-after.jpg`: same English light-theme 1280 × 720 viewport and 320 px sidebar, on the completed fixture. The former is the first PR revision; the latter replaces the input/datalist with a combobox, removes the Pause help/status copy and duplicate preview title, and exposes the destructive error without scrolling.
- `ui-create.jpg`: entering the absent name `qa.next` offers an explicit Create option; this candidate was cancelled. The actually created name is `qa.new`: native selection of its Create option persisted the assignment, and a real model opened and observed the fixture in that profile (`ui-created-running.jpg`, `created-results.json`). Chrome created its own `browser-profiles/qa.new/Local State`; typing, Escape and blur did not change the assignment.
- `ui-existing.jpg`: after restarting the isolated Host, the unassigned but stored `qa.new` is still an existing option, with no Create action. Native selection succeeds. Native exact-name input and Enter also select the existing `work.v2`.
- `ui-final-error.jpg` / `ui-final-rejected-results.json` / `ui-final-dot-results.json`: on the final build, native submissions of `..` and `.` keep `work.v2`, the same original target and Pause. The fixture remains at zero confirmations.
- `ui-dark-error.jpg` / `ui-dark-options.jpg`: the real native Dark theme shows the same error and combobox. Computed error colour uses the DSH semantic error token: light `rgb(236, 19, 19)`, dark `rgb(242, 90, 90)`. System appearance was restored after verification.
- `ui-completed.jpg` / `ui-completed-results.json`: native Resume, fresh observation and a real Session Browser click complete the fixture exactly once on the original target. This screenshot uses a 376 px sidebar. The real model performs setup; continuation is deterministic through the existing QA adapter.
- Final full regression: **190 files passed, 1 skipped; 1,540 tests passed, 1 skipped**. Browser plus Core bridge coverage: **145 passed, 1 skipped**. Four interaction tests cover selection, explicit creation, cancellation, keyboard navigation and IME; a filesystem test covers discovery and symlink exclusion.
- The first full amendment run had three 15-second test timeouts in unchanged Human DM steering, source-policy diagnostics and memory file actions tests. Their unchanged focused rerun passed all 17 tests; the final full rerun passed as above. No root cause or fix for those first-run timeouts is claimed.

To verify native creation without the setup helper assigning a profile, select/Create it in the Client first, then set `BH_E2E_PROFILE` to that name before `--prepare`. This mode asserts the existing assignment before invoking the real model. For the reserved-name recovery path, leave that variable unset and follow the original reproduction above. Known names come from Core Bot assignments and a read-only listing of valid Chrome profile directories through the existing Browser observation endpoint; no second catalog is written.
