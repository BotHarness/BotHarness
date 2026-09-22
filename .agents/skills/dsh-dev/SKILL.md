---
name: dsh-dev
description: Use when developing, running, or debugging BotHarness against a local DeepSeek Harness instance — the dev loop (profile install, build, restart, HMR), DSH_HOME/profile management, the web `/api` transport contract, plugin endpoint wiring, and diagnosing 404/connection/白屏 failures ("works in tests, broken in DSH"). Trigger on dsh profile, web-dev, dev server, bridge RPC, /api 404, plugin not loading, HMR, settings/模型/插件页报错.
---

# DSH development & debugging

BotHarness is a plugin layer inside DSH: unit tests do not cover the real boot. Every trap in this skill was invisible to `pnpm test` and only appeared in a running `dsh --profile web-dev`. **Validate against the running shell, not the test suite.**

## Prime directive: `/api` belongs to the API gateway

The web client calls `/api/<endpoint>` over plain HTTP (`fetch` + auth cookie). The route and its **single interceptor** are owned by `@deepseek-ai/dsh-api-gateway`, which claims endpoints from the **typert registry** (all native controllers register there).

- **Never** call `connection.rpc.intercept('/api', …)` from a plugin. The slot is taken; a second interceptor shadows every native API (`settings/describe`, `llm/listProviders`, plugins, `directoryPicker/list` …) with a plain-text `404 not found` while your own endpoints keep working.
- Expose plugin endpoints through the gateway/typert claim path: a `TypertRemoteService` subclass with a `typertRemote` binding and remote-method markers (SRC, no codegen). `botharness/*` migrated this way in #50 (`packages/core/src/bridge/rpc.ts`); native `@deepseek-ai/dsh-api-*` controllers are the reference.
- Wire contract: `POST /api/<namespace>/<method>` with `{ type: "client-request", rpcId, method, payload: { args: {…named args} } }`; `undefined` fields are rejected by the decoder. Failures come back as a `server-response` envelope (`ok:false`), not HTTP errors.

## Dev loop (WSL, fnm node)

```bash
export DSH_HOME="$HOME/.dsh-m35"
corepack pnpm --dir "$DSH_HOME/profiles/web-dev" add "link:$PWD/packages/core" "link:$PWD/packages/client"
dsh plugin --profile web-dev add ./packages/deepseekbot
pnpm build                                    # client: dsh-client-hmr pushes the new revision; host: rides Cordis HMR
setsid nohup dsh --profile web-dev --no-open > /tmp/dsh-web.log 2>&1 &
```

- The boot prints a **one-shot token URL** — it rotates on every restart; reopen the URL after restarting.
- Start with `setsid nohup … &`; a plain `&` dies with the wrapper shell.
- After a restart, **verify the boot before trusting it**: `references/debugging-playbook.md` §1 (cookie + API probe). A half-booted instance serves the UI but 404s every API.
- Link `@botharness/core` and `@botharness/client` as ordinary profile dependencies, then add only the `deepseekbot` umbrella through `dsh plugin`. Before boot, verify `dsh.profile.bundles` contains `deepseekbot` but not either member package.
- Bundle **member** changes need a restart; host code is HMR-live; client code needs `pnpm build`.
- **Agent one-shot instance**: `node scripts/dev-instance.mjs --home ~/.dsh-<name> --port <port> [--worktree <path>] [--build] [--json]` does the whole ritual (profile from the web template, bundle links to that worktree, install, machine-local `DEEPSEEK_API_KEY`, detached launch, token URL, `/api` probe). Secret resolution: `$DEEPSEEK_API_KEY` > `~/.config/botharness/dev.env` > Keychain `botharness-deepseek`; check with `node scripts/dev-secret.mjs check`. Never write the key into the repo.

## Profile model

- Isolated `DSH_HOME` (ours: `~/.dsh-m35`); profiles live in `$DSH_HOME/profiles/<name>`: `package.json` (`dsh.profile.bundles`), `cordis.yml`, user patch layer `cordis.patch.yml`, `node_modules` (our bundles via `link:`).
- `dsh web …` initializes the **`web` template** (`dsh-base` + `dsh-web-app`); a bare `dsh --profile <new>` initializes the minimal template (`dsh-base` only). Our `web-dev` = web template + `deepseekbot`.
- **Always pass `DSH_HOME`** — without it commands silently target `~/.dsh` and initialize profiles there.
- `cordis.patch.yml` is the bisect tool: disable a plugin (`- id: botharness-core` / `disabled: true`) or override config, no reinstall needed.

## Pitfall log

When a DSH-side bug or trap is diagnosed, **record it here (or in the playbook) in the same change**. Entries:

| # | Trap | Symptom | Cause / fix |
| - | ---- | ------- | ----------- |
| 1 | `/api` single interceptor | Native APIs 404 `not found`; custom plugin endpoint works | **Resolved in #50**: api-gateway owns the slot and claims endpoints from the typert registry; `botharness/*` now registers a `TypertRemoteService` (SRC markers). Do not reintroduce `connection.rpc.intercept('/api', …)`. |
| 2 | Half-booted instance | UI loads, every API 404 | restart raced/lost plugin layer; restart again and verify with the cookie probe (playbook §1) |
| 3 | `pkill -f "<pattern>"` self-match | command dies with no output | the wrapper's own cmdline contains the pattern; use `[x]` trick (`pkill -f "[n]o-open"`) |
| 4 | Shell variables eaten in nested wrappers | `$VAR`/`$(…)` come out empty | write a script file for anything with variables; avoid inline `$` in loop commands |
| 5 | `DSH_HOME` omitted | profiles/installs land in `~/.dsh` | always set `DSH_HOME` for every `dsh` command |
| 6 | Standard decorators not emittable | vitest `SyntaxError` on raw `@Remote`; tsdown passes decorators through untouched | this toolchain (oxc/tsdown) can't compile TC39 decorators — write the `@deepseek-ai/dsh-typert-protocol/remote-methods` descriptor manually (`version: 1`, `invocation: { kind: "direct" }`) and lock its shape with a test (#50) |
| 7b | Agent created without an agent preset gets an **empty tool layer** | A BotHarness Orchestrator/Assignment Agent can only call the tools its own setup registered (e.g. `channel_send`, `report_to_orchestrator`) — no file/bash/shell tools, so the model reports "no tools" | `dsh-agent-presets`: every session must join a preset (`CreateAgentOptions.meta.agentPreset`); an agent published without one "resolves against the empty global layer". Pass the bot's preset or a shipped default (`standard`) when creating agents |
| 7 | `sidebar.panellist` row has no toggle or geometry seam | Clicking the active entry re-runs `selectPanel(id)` (a no-op), so the mode never exits; the shell row spans the full content box, 2px wider per side than the 新会话 row | Own the row from inside the glyph: render a wrapper span, target the shell button with `button:has(.bh-panel-glyph)` (`width: auto; margin-inline: 2px` = native `.newSession` insets), and while active render an `inset: 0` hit layer whose `onClickCapture` stops React propagation and calls `ctx.layout.selectPanel(null)` (`layout` must be declared in the plugin's `inject`) |
| 8 | `Menu` `autoFocus` + `portal` drops the initial focus | The menu renders but no row is focused (arrow keys dead, submenu closed) | The primitive's autoFocus effect runs before its placement re-render clears the list's `visibility: hidden`, so `.focus()` on the hidden row is ignored. Re-focus the placed list in a `setTimeout(0)` after mount (see `ChannelMoveMenu`) |
| 9 | Layout shift inside `dragstart` kills the native drag | `dragstart` fires, then a bare `dragend` with no drop; puppeteer's `mouse.drag()` hangs waiting for `dragIntercepted` | Chromium aborts the gesture when the `dragstart` dispatch synchronously moves the source row (e.g. revealing a `display: none` drop zone via React's discrete-event flush). Arm layout-taking drop surfaces one task later (`setTimeout(0)`); absolutely-positioned markers are safe synchronously. Diagnosed on the empty-section drop zone (#56 follow-up) |
| 10 | Bundle member promoted to a top-level bundle | Boot fails with `duplicate loader entry id: botharness-core` | The `deepseekbot` umbrella patch already inserts core and client. Link all three packages into the profile, but keep only `deepseekbot` under `dsh.profile.bundles`; do not pass core/client through `dsh plugin add`. |
| 11 | `dsh.client.inject` is bundle grouping, not service ordering | Client bundle fails to import: `bundle … loaded without registering "<pkg>" via __ModuleLoader__.load`, often preceded by `duplicate factory registration` for a native module | Listing another plugin's package in `dsh.client.inject` makes the client-modules loader bundle that package **again** in your entry's group; a module that already registered cannot register twice. Keep `inject: []` for cross-package service dependencies and express them only with `ctx.inject(['<service>'])` at runtime. Diagnosed in #164. |
| 12 | Typert descriptor survives Host HMR | A client using a newly added RPC field gets `args fields do not match the descriptor: unexpected "<field>"`, although the linked Host build contains that field | Remote method descriptors are registered at boot and are not replaced by Host HMR. After changing a `TypertRemoteService` method's parameter shape, build and restart DSH, then verify the endpoint with a no-write API probe. |
| 13 | Connection Fetch route registered without its /api prefix | An authenticated GET to the stream returns generic `not found` even though the plugin loads and unary RPC works | `connection.fetch.register({ path })` matches the full pathname. Register `/api/botharness/stream`, not `/botharness/stream`; verify the exact route in a running Host. This is distinct from and does not replace the API gateway's RPC interceptor (#141). |

## Reference

- **DSH source checkout**: `reference/deepseek-harness` (gitignored, in this worktree) pinned to the installed tag — currently `dsh-v0.1.5-rc.2`. Read the TypeScript source (`packages/typert`, `packages/*connection*`, `packages/*gateway*`, `apps/cli/reference/README.md`) when the how/why matters; the installed `lib/*.js` is bundled output. Re-pin when DSH is bumped: `git fetch --depth 1 origin tag <tag> && git checkout <tag>`.
- `references/debugging-playbook.md` — boot verification, status-code semantics, WS mux probe, bisect recipes, headless puppeteer probe.
- `references/probe-web.mjs` — headless browser probe (console errors, failed requests, WS, internal fetch); run from the repo.
- `dsh-ui` skill — in-harness UI rules; `docs/client-bridge.md` §7 — dev loop; ADR-0023 / #50 — bridge transport contract.
