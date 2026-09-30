# Browser Access work continuity (#591)

The baseline is main `478adf53b6b068ae68203a420de2d168cf162085` (including #590). Both captures use the same isolated DSH Profile, Bots, local page fixture, dark theme, Chinese shell, and viewports: Client 1440 × 960; managed Chrome page 1200 × 736 at scale 1. The real model DM is repeated after the Host restart, so transcript snippets, activity/Inbox counts, and process-local target IDs differ; those are setup/history differences.

- `before-sidebar.png`: native Access off/on cycle leaves the still-open work tabs absent from the expanded Browser entry.
- `before-window.png`: clicking Human Open creates a new blank target.
- `after-sidebar.png`: the same Access cycle preserves both owned work tabs and the Bot current pointer.
- `after-window.png`: Human Open reuses the current page and a scoped Browser click completes its work.
- `after-completed-sidebar.png`: the native observation preview displays the completed action.
- `before-results.json`, `after-results.json`, and `validation.json`: bounded public-safe assertions, including foreign ownership exclusion and recovery when the current work page is Human-closed.

Run from a built worktree with a verified isolated Host. Add the opt-in `scripts/fixtures/browser-queue-qa.mjs` Plugin via the Profile Patch's `insert` row and set the Browser Plugin `autoAllowActions: true`. This QA Plugin is not composed by the product Bundle. The script uses a real DeepSeek turn to create the owned Orchestrator Agent, then that Agent's native scoped Tools Service for controlled checks. Access off/on is clicked through the real Client switch and confirmed against Host records; no HTTP-only assumption is made for native RPC (which may use WebSocket).

```sh
BH_E2E_ORIGIN=http://127.0.0.1:<port> \
BH_E2E_HOME=<isolated-home> \
node scripts/e2e-browser-access-tabs.mjs
```

Use `--before` only with the base revision's Host build. The fixture listens on loopback port 32001; use a free port before running. Authentication remains in the launcher's private cookie jar and is never written into committed evidence. The normal suite's one skipped test is the existing opt-in Browser E2E; this script is the completed real-Host verification.
