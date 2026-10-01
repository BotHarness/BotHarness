# Original Browser Access slice acceptance — #460

The original runtime and installed-browser fallback shipped in #471/#474. This checkpoint exercises the read-only vertical slice through the current native DSH Host and fixes the missing active-call revocation identified by its acceptance run.

## Runtime path

A fresh Access QA PersonaBot starts with Browser Access off and Computer Access off. A real DeepSeek DM establishes its Orchestrator Agent Scope; authenticated native `tools.schemas(agent)` has no Browser tools. Enabling Computer Access alone still leaves Browser Access off. Enabling Browser Access registers open/observe only in the Bot's scope. The full curated catalog includes later implemented slices.

The real model opens a local orchard bulletin and waits on its first native Human approval card while the browser is still stopped. **Allow once** releases that call. It reads the real semantic snapshot and commits a DM summary with Thursday, 37 boxes, and 14:00–16:00. Exactly one Browser approval card covers the open and observe calls in that live session.

An isolated QA adapter then dispatches native tools through the same live Agent. It checks navigation makes the old opaque ref invalid, a fresh observe reads the next page, a typed marker is absent from Audit, Stop gives a readable tool error, and reopening recovers. Access revocation removes registrations and cancels a running ten-second wait promptly. A second real-model DM tests pending first approval: turning its actual Client Access switch off cancels that call, expires approval and produces a truthful model refusal without opening any tab. The same Host is restarted to verify the saved Access preference and independent Computer preference.

The later review turn runs against the final Host build and again verifies actual open/observe and a committed reply.

The adapter is inserted only in the disposable QA Profile; it is not shipped in any Bundle. It has a bounded allowlist and uses `ctx.tools.execute`, not direct Browser Provider calls. Page markers are synthetic test data. The screenshot endpoint captures native page pixels; it does not fake model tools or a Session.

## Cancellation boundary

Each Agent Scope registration owns a cancellation controller. Its signal joins the caller's signal for the Browser operation and first native approval. Revocation cancels this registration permanently, so re-enabling Access cannot revive old queued calls. Timers cancel promptly. Already-dispatched CDP operations are awaited until they settle and then report cancellation; they are not abandoned or claimed to undo effects already sent to the browser. Saved screenshots check cancellation before writing. The Human's browser and owned tabs remain available.

Focused regressions cover active waits, caller cancellation, queued work across an off/on cycle, and an in-flight observation that cannot satisfy the fresh-read gate. Existing queued action coverage now requires both the active and queued revoked calls to fail. Provider disposal awaits owned work after stopping runtimes.

## Reproduction

Use the worktree-pinned DSH 0.2.0-rc.1 and `scripts/dev-instance.mjs` with a fresh isolated home and unused Host port. Build first. Keep launch output, cookie jar, and checkpoint files private; never publish their token or absolute paths. Keep the default Browser `autoAllowActions: false`. Insert `scripts/fixtures/browser-access-qa.mjs` only in that QA Profile and restart its exact Host PID.

Run `node scripts/e2e-browser-access.mjs --serve` with an unused `BH_E2E_FIXTURE_PORT` (default 32016), bound to loopback. Set `BH_E2E_ORIGIN`, `BH_E2E_HOME`, and a private `BH_E2E_STATE` for subsequent phases:

1. `--prepare`: default-off and independent Computer Access.
2. `--start`: wait at the live first Browser approval card; capture the input/action area, excluding the local working-directory path.
3. In the Bot DM click **Allow once**.
4. `--finish`: verify the real model tools and actual page facts. Optional `BH_E2E_SCREENSHOT` saves native page pixels.
5. `--guards`: navigation, stop/recover, active wait cancellation, pending approval cancellation and redacted Audit. This step uses native deterministic tool probes for the operation guards and a real-model turn for pending approval cancellation. Set `BH_E2E_MANUAL_REVOKE=1` to stop at that card and operate the Client switch.
6. Restart this exact isolated Host with the same saved Profile.
7. `--restart` with `BH_E2E_RESULTS` writes public-safe assertion results.
8. Optional `--review` reopens the page through another real-model DM after restart; approve its first action in this new Host process to leave a runnable Human QA view. Browser Authorization grants and tab ownership remain process-local; this checkpoint verifies durable Access, not cross-process Authorization retention.

The separate opt-in fallback acceptance executes the production runtime with empty system discovery and the real pinned installer/Chrome process/CDP: `BROWSER_FALLBACK_E2E=1 pnpm exec vitest run packages/browser/test/fallback-acceptance.e2e.test.ts`. `BROWSER_FALLBACK_CACHE` optionally reuses a disposable cache. It reads a real loopback page, stops, and relaunches the pinned build. The ordinary suite skips this network-dependent test explicitly.

## Evidence and limits

- `revoke-before.png` and `revoke-after.png`: cropped native Client screenshots, matching 490 × 237 light-theme viewport area, before revocation and after cancellation, anchored on the same input area. The crop excludes the private working-directory row. The after view reopens this DM to fetch the expired native card; the existing Client card does not proactively replace its buttons while mounted, although Host approval status expires immediately and Human Inbox clears the action.
- `model-summary.png`: full 1280 × 720 Client screenshot with the committed real-model summary, independent Access switches and Browser preview.
- `browser-page.jpg`: unchanged native Browser frame containing the actual bulletin read by the model.
- `results.json`: public-safe assertion results. Runtime launch credentials, full Session events and raw logs stay local.
- The first baseline run failed because active `browser_wait` returned success after revocation; this is the runtime defect fixed here. Initial probe assertions were corrected for default-off fields represented by omission and current opaque refs with HTML tag names; these were probe assumptions, not runtime failures. The initial pending-approval probe ran outside an open Turn and was refused by DSH (verified in pinned `dsh-user-approval` source); it was replaced with a real-model turn. Audit attribution selects Browser action rows for this Bot, excluding independent lifecycle rows and other Bots.

No external account sign-in or private website is exercised. Anonymous pages are readable without signing in; authenticated target sites display their own login page. A same-Profile restart with an intentionally missing configured browser verifies real Host boot, a readable open failure, and a subsequent healthy API read. The separate live fallback verifies an actual pinned install and cached relaunch. Installer network-failure behavior has existing focused runtime regressions. The PersonaBot record serialization/reload regression verifies the Access field; the public PersonaBot export/import flow is not exercised here and is part of the separate Portability delivery; this PR does not add browser-profile backup/export, Container Browser, or other later phases.
