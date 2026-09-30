# Browser Human window E2E — #584

The screenshots are real DSH 0.2.0-rc.1 Client and managed headed Chrome captures; the page is a local fixture, not a mocked Client.

- Baseline: `ca3162e96aca4347b9e26937dcc8e69f62c55f93`; real Human **Open Bot Browser** adds an unowned blank target even while the entry previews a work tab.
- Fixed: selecting a preview and opening it reveals that owned target without another target, restores its minimized window, and preserves the Bot current pointer. A native CDP session checks `document.visibilityState` after restoration; focus emulation is explicitly disabled for the final probe. The Human completes an actual page action.
- Follow Bot opens its current tab. Concurrent repeated opens keep the target count unchanged. Closing the current tab reuses the remaining owned tab. A fresh Bot creates and adopts one blank tab. Foreign requested targets are ignored; concurrent replacement of a closed final tab creates one owned replacement. Another Bot's targets remain outside that ownership.
- Chinese dark Client: 1440 × 960. Native page: 1200 × 736, scale 1. The paired page screenshots show the changed window behavior; sidebar captures show the matching preview/control. Setup DM history accumulates in repeated QA runs. The light capture uses DSH's native Appearance control.
- `validation.json` preserves the first unrelated Human DM timeout plus the isolated and full retest outcomes; no test assertions or timeout values changed.

## Run

Build and boot an isolated Profile using `scripts/dev-instance.mjs`. Enable `autoAllowActions` for this **QA-only Profile**, and insert the existing `scripts/fixtures/browser-queue-qa.mjs` Plugin by its absolute checkout path in that Profile's `cordis.patch.yml`. Restart the helper's exact Host PID after changing the Patch. This opt-in Plugin invokes the native scoped executor with a real owned Agent and allows a bounded Browser tool set; the application Bundle does not compose it.

```sh
pnpm build
node scripts/dev-instance.mjs --home "$QA_HOME" --port "$QA_PORT" --json
BH_E2E_ORIGIN="http://127.0.0.1:$QA_PORT" \
BH_E2E_HOME="$QA_HOME" \
node scripts/e2e-browser-human-window.mjs
```

The launcher saves a private authenticated cookie jar and injects the shared local DeepSeek key. The driver uses a real DeepSeek DM to open and observe the fixture, then controlled native scoped Browser tools to arrange two owned tabs. It clicks the actual Client Open button and checks the managed Chrome targets through an independent connection. Port 31999 must be free for the local fixture.

For the baseline, use the baseline production bundles and the same driver with `--before`; it asserts the incorrect extra blank target and captures it. The final driver also creates the cold Bot before mounting the Client and waits for the current tab projection before clicking a row, so reruns cannot select an old same-named tab. Cold Bot Browser Access is prepared through the authenticated Host interface; this issue tests the Open button, not the Access toggle.

The E2E driver closes its headless observer and HTTP fixture, disconnects its independent CDP connection, and leaves the managed Chrome owned by the Host. For Human QA, serve the same local fixture and open the Bot DM in the isolated Client; choose a tab, toggle Follow Bot, minimize the native window, and press Open repeatedly. The driver waits up to five seconds for native page visibility after restoration.
