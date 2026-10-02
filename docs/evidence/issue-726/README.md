# Container Browser tracer — #726

Verified with pinned DSH 0.2.0 RC1 and the fixed official LinuxServer Chrome image on macOS Docker Desktop. Target, upload and Human control guards were verified at `f613f14e`. The core real-model interaction was repeated at `414280be` after integrating main `12ff478a`; `human-qa-ready.png` shows that final live viewer. Computer Access stayed off and Computer Target stayed Local throughout Container Browser QA.

## Observed results

- Real PersonaBot: native first-call approval → open/observe → type `Aurora container QA` → click Search → observe/click the first result → screenshot. Independent fixture read-back: exactly one search and one first-result open. `model-interaction.json` contains safe tool names/outcomes and those counters; `model-screenshot.jpg` is the native model attachment, not a mockup.
- An explicitly uploaded synthetic Host file with mode `0600` was read by Chrome's FileReader. Independent `/upload-state` read-back contained exactly `CONTAINER-UPLOAD-READABLE`.
- Human Open displayed the actual Container Chrome stream with interaction off. Explicit Human interaction paused the Bot before input; `human-paused-input.png` and `human-paused-results.png` show an actual synthetic search. Disabling interaction kept Pause. A real Bot screenshot was refused by Browser Pause.
- Access off collapsed and locked Browser; re-enable restored the entry. Switching to Local removed the Container process and preserved its owned volume, cleared old tab ownership and required fresh native approval. A real Local open/observe succeeded. A later pending Container approval was cancelled when Target changed. After starting Container again, its Chrome History retained six synthetic fixture URL entries.
- HTTP viewer without DSH authentication returned 401. The authenticated viewer used the real WebSocket stream. Docker inspection found only the owned `/config` volume and loopback port 3000; CDP was not published.
- Full regression: 2,031 tests passed, 3 existing tests skipped. Lint, format, typecheck and build passed. Independent Standards and Spec review findings were corrected and re-reviewed.

## Images

All Human captures use 1280 × 720, English native shell, light theme and synthetic QA data. The settings pair shows the bottom of the same native settings pane in the same in-app Browser environment. `settings-before.png` captures the prior Bot settings entry point with no Browser Target row; `settings-after.png` adds the independent Local/Docker Browser choice. The Container viewer is a new interaction with no prior Container screen; its before state is the same prior settings entry point. The isolated profiles have different synthetic Bot rosters, which are outside this settings change.

`native-approval.png`, `container-readonly.png`, `human-paused-input.png`, `human-paused-results.png`, `access-off.png`, `local-reauthorization.png` and `target-cancelled.png` capture each key interaction. These screenshots contain task-owned temporary paths and synthetic messages only.

## Human QA

The task-owned Profile is `/private/tmp/bh726-qa`, served on `http://127.0.0.1:3139/`. Its authenticated in-app tab remains open. Select the latest Container Browser QA DM; Bot settings → Browser Target is Docker Browser. Browser entry → Open Bot Browser shows the live Chrome Modal. It starts read-only; enabling Human interaction changes Pause Bot to Resume. Close or disable interaction keeps Pause. Explicit Resume lets the Bot act again; Stop releases this runtime and keeps its profile volume. Use only the synthetic fixture at `http://127.0.0.1:32019/page` inside Container Chrome.

For a fresh isolated Profile, build and launch with `scripts/dev-instance.mjs` as described by `docs/client-bridge.md` §7. Select Docker Browser in native Bot settings and open it once to start the runtime. Identify only this Profile's ownership-labelled Browser container. Set:

```sh
export BH_E2E_ORIGIN=http://127.0.0.1:3139
export BH_E2E_HOME=/private/tmp/bh726-qa
export BH_E2E_STATE=/private/tmp/bh726-fresh-state.json
export BH_E2E_CONTAINER=botharness-browser-<this-profile-identity>
node scripts/e2e-browser-container.mjs fixture
node scripts/e2e-browser-container.mjs prepare
```

`fixture` installs the committed synthetic server only inside the named task-owned container; run it once after a fresh Container start. `prepare` creates a dedicated QA Bot and requests native Browser approval. Approve its synthetic page call in the Client, then run:

```sh
node scripts/e2e-browser-container.mjs observed
node scripts/e2e-browser-container.mjs act
node scripts/e2e-browser-container.mjs verify
```

The helper reads native SessionEvent results and independently checks fixture counters. It does not auto-approve. The isolated launcher maintains the private local authentication cookie; neither cookies nor credentials are included in evidence. Stopping or switching the Container removes the temporary fixture, so start it again for subsequent QA. Named Browser profiles use independent volumes; Bots assigned the same profile still share that profile's Chrome, as on Local.
