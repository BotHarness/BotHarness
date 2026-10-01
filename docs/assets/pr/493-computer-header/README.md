# Original Computer header acceptance — #493

Implementation landed in #511 (`59ad4848d5e3823fb37e6e041171dfb6ea9f18bf`). This checkpoint verifies the existing behavior through the real DSH Client, API Gateway, BotHarness Host and isolated Docker Computer; it adds no application behavior or new design. Final Client/Host captures use implementation revision `2ce730e9f0426a59ad6b3dd2b9aa5b2101f4c454`, which contains #685.

## Verified behavior

| Original criterion                                                                                             | Evidence                                                                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Access switch lives in the header and remains visible while collapsed; off locks the chevron; enabling expands | `off-*`, `on-*`, `collapsed-*`; actual DOM disabled/expanded state; Host reads confirm access writes                                                                                                      |
| Existing setup/authorization/running body stays separate from the switch                                       | `authorize-*`; Start → authorization → Cancel; running iframe and Stop render once; body contains no Access switch                                                                                        |
| Computer entry tests cover the header location                                                                 | Existing `packages/computer/test/client-entry.test.ts` covers registration, successful/rejected writes, busy state, no-Bot state and body containment; shared expansion tests verify the disabled chevron |

Images are unedited 1280 × 720 captures in English with the same synthetic Bot, Client layout and light/dark themes. This evidence-only PR does not change a rendered UI; the off/on pairs show interaction states of the merged implementation, not a newly introduced UI delta.

`running-connecting-light.jpg` records an actual running container and mounted viewer. **Desktop frames remain UNVERIFIED:** the viewer stayed at Connecting. This checkpoint verifies the running body and header relationship, not successful desktop streaming, input or a model-driven Computer task. No stream assertion is replaced with a successful component assertion.

## Reproduce

Use a new isolated DSH home and unused ports. Initialize its Web Profile before writing `cordis.patch.yml`; DSH refuses an already-existing uninitialized Profile directory. Configure `botharness-computer` with a unique container name, volume name and loopback host port. Keep `autoAllowActions: false`. Launch through `scripts/dev-instance.mjs` with this worktree's pinned DSH `0.2.0-rc.1` and open its private local login URL; do not publish that URL or cookie jar.

```bash
pnpm install --frozen-lockfile
pnpm build
export BH_E2E_HOME=/tmp/computer-header-qa
export BH_E2E_ORIGIN=http://127.0.0.1:3133
export BH_E2E_STATE=/tmp/computer-header-state.json
node scripts/e2e-computer-header.mjs --prepare
```

1. Open Bot mode → Computer header QA. Confirm Computer is collapsed and its chevron disabled, while Computer Access remains visible. Save the off screenshot.
2. Enable Access in the Client. Confirm immediate expansion and the existing shared-Computer note and Start button. Run `--verify-on` **before creating the container**; it checks the persisted Host write, available Docker provider and initial `absent` state.
3. Collapse Computer. Confirm Access remains visible and checked. Expand again; Start opens the original authorization steps. Cancel returns to Start without launching anything.
4. Authorize and start this isolated test container. Confirm `/api/computer/status` reports running; one viewer iframe and Stop render, with no Access switch in the body. Check the frame connection separately; Connecting does not prove a live desktop. Stop only this QA container and wait for stopped.
5. Disable Access. Confirm automatic collapse and locked chevron; run `--verify-off`. Reload the Client and confirm the switch is still off and expansion still locked.
6. Repeat the off/on, collapsed and authorization states in dark theme. Leave Access off and restore the initial theme.
7. Record only actual Client checks in a private JSON file: `offHeaderLocked`, `enableExpands`, `collapsedSwitchVisible`, `authorizeAndCancel`, `runningBodyMounted`, `disableCollapses`, `reloadKeepsOff`, `lightAndDark`. Set a check true only after observing it.

```bash
export BH_E2E_UI_RESULTS=/tmp/computer-header-ui-results.json
export BH_E2E_REPORT=/tmp/computer-header-complete.json
node scripts/e2e-computer-header.mjs --complete
pnpm exec vitest run packages/computer/test/client-entry.test.ts packages/client/test/channel-sidebar-expandable.test.ts
```

The completion gate also reads the real Host access state. Missing `runningBodyMounted` or a false `reloadKeepsOff` was rejected in separate negative fixtures without producing a report. The script does not drive or mock the Client: a Human or browser-use agent performs the UI checks.

## Verification notes

The initial auxiliary checks incorrectly expected a new Bot's optional `computerAccess` field to be explicitly false and a never-created container to be stopped. They were corrected to the actual defaults: absent access means off, and a fresh isolated container is `absent`. Existing application assertions and runtime code were not changed.

A first full-suite run crossed a main fast-forward: the run began before the update, then the updated Bot panel DOM test failed with `document is not defined`. This run cannot prove a fixed revision; after the update settled, that file and the two #493 suites passed together (35 tests). That run is retained as a failed, non-fixed-revision check; final verification uses an unchanged revision and its exact-head CI. It is not described as a flaky application fix.

Final fixed-revision verification: `pnpm lint`, `pnpm format:check`, `pnpm typecheck` and `pnpm build` passed; full tests: **1828 passed, 2 optional native tests skipped** (223 passed test files, 2 skipped). The 2 skips are not passes.
