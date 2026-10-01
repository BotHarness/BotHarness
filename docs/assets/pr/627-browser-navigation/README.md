# Navigation failures and completed retry — #627

Baseline: `c64aeb016b556c8c24b906fc9e88890c8d3a97e4` (merged #626).
The final fixed run is integrated with main `137cdc4c` and uses this PR's runtime
change, DSH 0.2.0-rc.1, native Client and
managed Chrome in an isolated Profile. Both use the same named Browser profile,
loopback fixture and confirmation count 0 before completion.

## Captures

All images are unmodified real browser screenshots, captured with the UI driver.
The before/after report pair is 1280 × 720, English, light theme. The report is
explicitly labeled test evidence generated from checked native Session Tool
responses and the existing operational Audit API; it is not a product log viewer.
There is no new product log store or reader.

- `before-report.jpg`: both failed navigations are reported/audited as success;
  failed new-tab navigation replaces current work and leaves two owned live tabs.
- `after-report.jpg`: both attempts return/audit errors; current remains original
  and there is one owned live tab.
- `before-client.jpg` / `after-client.jpg`: same 1280 × 720 Client, light theme,
  English shell and 320 px Channel sidebar; failed new-tab navigation switches the
  preview to Chrome's error page before, and retains the original page after.
  DM setup history differs because each real-model run has its own turn.
- `completed-client.jpg`: the real Client previews “Navigation retry confirmed (1)”
  on the same original target. The sidebar is expanded to its native 357 px limit
  for this standalone completion capture.

The public JSON records preserve target identities and checked outcomes, excluding
cookies, DSH Session IDs, debugger endpoints and private request details. The final
probe verifies Chrome's actual page-target inventory through its **read-only**
loopback `/json/list` endpoint, in addition to the Host's owned-tab observation:
there are two targets (launch blank plus original) before and after the failed
new-tab attempt. No unowned failed candidate is left behind. The baseline capture
predates this additional inventory assertion; its result omits that count.

## Reproduce

1. Install frozen dependencies and build the base or PR revision. Launch through
   `scripts/dev-instance.mjs` with an isolated home and free port, preserving private
   login/cookie material locally. Use only the task-owned Host PID for restart.
2. In that isolated Profile only, opt into Browser `autoAllowActions` for this
   disposable fixture and insert `scripts/fixtures/browser-queue-qa.mjs`, the existing
   adapter that invokes native Session Tools through the owning Provider. It is not
   part of the production Bundle.
3. Set a private `BH_E2E_REPORT` path and run
   `node scripts/e2e-browser-navigation.mjs --serve`. The fixture listens at port
   32007; `/fail` deliberately closes its response connection, producing Chrome's
   `net::ERR_EMPTY_RESPONSE`; `/page` contains the confirmation button.
4. Set `BH_E2E_ORIGIN`, `BH_E2E_HOME` and private `BH_E2E_STATE`. Run `--prepare`:
   a real DM/model turn opens and observes the original fixture without clicking.
5. Run `--probe` (`--probe --before` on the base), with `BH_E2E_RESULT` and the same
   `BH_E2E_REPORT`. It checks a failed reused-target navigation, successful retry to
   the live URL on that target, failed new-tab navigation, exact attributed Audit
   outcomes and retained work. The fixed driver also verifies no extra native target.
6. Open the real Navigation QA DM/Browser and capture the Client. Open the fixture's
   `/evidence` in the UI driver to capture the labeled report.
7. Run `--complete` only after a successful fixed probe. Fresh native Session Tools
   observe, click and observe the original target; the counter must become exactly
   1 and that target must remain current. Capture the actual Client preview.

The model verifies setup. Failed navigation and retry/confirmation are deterministic
native Session Tool calls, not a claim that an autonomous model recovered the task.
Repeated completion was refused before mutation and the counter stayed 1. Reset the
isolated Host/Profile between comparable captures to avoid previous setup targets.

## Checks and limits

- Six runtime failure regressions fail on the base; all 25 runtime and 56 Provider
  tests pass on the change, including successful same-document navigation and
  Provider ownership/error Audit preservation.
- Final integrated full suite: 195 files / 1596 tests pass; one existing opt-in Browser controls
  Chrome E2E is skipped. This PR's real Client/Host/Chrome E2E is separately verified.
- Lint (existing warnings), format, typecheck, bilingual ledgers and build pass.
- Cleanup is best effort with a 2-second wait bound: rejection, refusal or stall
  logs a bounded lifecycle diagnostic and preserves the original navigation error;
  Chrome unavailability can still leave an unowned target. These failure branches
  have focused automated coverage, not an injected live-Chrome outage claim.
- A failed reused navigation can show Chrome's error document; the fix preserves
  its target for retry and does not restore the previous document. HTTP error pages remain observable; validation checks CDP
  navigation `errorText` only.
