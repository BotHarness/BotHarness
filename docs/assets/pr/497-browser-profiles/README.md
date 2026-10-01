# Original #497 profile acceptance

This checkpoint exercises the named browser profiles already delivered by #516 and subsequent
Human-approved refinements. It adds repeatable acceptance coverage and real runtime evidence;
the application implementation is unchanged from main at `5de4da44132bb5771666d876b4b8ab587deba7f1`.

## Verification path

Use an isolated instance with the pinned DSH `0.2.0-rc.1` launcher. The fixture and runner require
Node 22+ and a POSIX process inventory (`ps`). The browser instances use the discovered system
Chrome; the fallback download directory remains shared across profiles. A short idle interval is
configured only in this disposable DSH Profile, with Browser Authorization left enabled:

```yaml
- id: botharness-browser
  config:
    enabled: true
    browserPath: ''
    headless: false
    idleStopMinutes: 1
    autoAllowActions: false
```

```sh
node scripts/e2e-browser-profiles.mjs --serve
node scripts/dev-instance.mjs --home <isolated-home> --port <free-port> --json
export BH_E2E_HOME=<isolated-home>
export BH_E2E_ORIGIN=http://127.0.0.1:<free-port>
export BH_E2E_STATE=<private-state-path>
node scripts/e2e-browser-profiles.mjs --prepare
```

In the real Client, enable Browser for the three generated Bots. On Profile Work QA, type `work`,
press Escape and confirm the value remains `default`; type it again and explicitly choose
`Create “work”`. On Profile Shared QA, search and select the existing `work`, then return it to
`default`. Leave Profile Default QA without a profile assignment. Assignment alone launches no
browser instance. Capture these Client states and record the corresponding UI checks only after
observing them.

Run `--login-default`, `--shared`, then `--login-work`. Each first synthetic local opening requests
one native tool approval in the Bot's DM. Allow that one call, retaining the usual authorization
policy. The real DeepSeek model types and clicks a synthetic login in default, the second default
Bot reads the shared login without typing or clicking, and work starts unauthenticated before
signing in independently. Only two persistent synthetic login cookies are created.

Run `--parallel`. The runner sends the two DMs concurrently. Each model opens its own task page,
observes the account, types its own token, clicks the submit button and observes completion.
The fixture holds each response until both profile-specific submissions arrive. Each page then
shows `Completed: 1`, while the server records two distinct receipts. This checks concurrent
work through real native Browser tools, not sequential replay or a mocked browser.

Keep Profile Default QA's Browser entry expanded, leave Work QA unviewed, then run `--idle`.
The runner checks process identity without polling work's observation route (viewing would keep
it active). Work stops through the real idle sweep; the same default process and current tab stay
live. Select Work QA to capture its stopped entry, then run `--resume`: the model opens the account
page on demand and observes the persisted work login without signing in again.

Verify light and dark readability, save the UI check map, then finish with:

```sh
export BH_E2E_UI_RESULTS=<private-client-checks-json>
export BH_E2E_RESULTS=<output-report-json>
node scripts/e2e-browser-profiles.mjs --complete
```

The completion step refuses missing or false UI/Host/model checks. The committed report contains
only synthetic results; cookies, login URLs, session histories, process command lines and local
credentials stay private.

## Evidence interpretation

Captures are unedited 1280 × 720 screenshots of the real Client with managed native Chrome
frames. Before/after assignment states intentionally use the same application revision: this PR
completes acceptance of an existing feature rather than changing its visual design.

The initial process assertion counted Chrome child processes as separate browser instances.
The runner now excludes `--type=` child processes; `--verify-default` rechecked the original
successful model observations and the single login receipt without repeating the login.

One model initially interpreted the task result as a shared aggregate that should reach two.
The fixture actually has one completion per page and two server receipts. `--confirm-parallel`
re-observed the existing completed page after clarifying that distinction. No second submission
was made, no browser assertion was weakened, and no runtime bug fix is inferred from that reply.
