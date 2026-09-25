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

Use the worktree's local `@deepseek-ai/dsh@0.1.7-rc.2`, not a global `dsh` binary. The launcher checks the installed version, creates an isolated Web Profile, links all Bundle members as dependencies, enables only the `deepseekbot` umbrella, and probes the authenticated API.

```bash
corepack pnpm build
node scripts/dev-instance.mjs --home /tmp/bh-rc2-web --port 31967 --json
corepack pnpm dev:client
```

The launch summary includes the Host PID and local login URL. For Client edits, open the local Web tab: tsdown rebuilds the linked Client bundle, and the local development listener refreshes the page when RC2 publishes a rebuilt frame. The native RC2 Client HMR stream reaches the browser, but the active BotHarness shadow slot currently stays mounted without this fallback. For Host edits, build, stop that exact PID, then start the helper again with the same home and port; RC2 Host hot replacement is disabled. Follow `docs/client-bridge.md` §7 for the complete steps and measured timings.

The helper injects a shared machine-local DeepSeek key when available; `node scripts/dev-secret.mjs check` reports its source without a value. Existing Profile credentials are another DSH source. Confirm model access with a real DM reply. `node scripts/dev-secret.mjs adopt-profile --home <existing-DSH_HOME>` copies only the DeepSeek reference into a private local file for later isolated Profiles.

## Profile model

- Isolated `DSH_HOME` (one directory per worktree/port); profiles live in `$DSH_HOME/profiles/<name>`: `package.json` (`dsh.profile.bundles`), `cordis.yml`, user patch layer `cordis.patch.yml`, `node_modules` (our bundles via `link:`).
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
| 14 | `ctx.uiWorkspace.pickDirectory()` throws on a deployment without a picker | `TypeError: Cannot read properties of undefined (reading 'pick')` at call time, although `ctx.inject(['uiWorkspace'])` succeeded and the workspace service answers | The `ui-workspace` client service is provided even when no directory-picker pair is mounted (the web-app bundle's `-auto` chooser mounts one asynchronously; a profile can also end up with none). Treat the picker as optional: probe it, catch the failure, and offer a manual path fallback instead of a dead button. Diagnosed in #168. |

| 13 | One-shot login token needs two visits | hand-rolled `curl`/`fetch` against `/api` gets `401`, then `404 not found`, although the server is healthy | The first visit arms the login, the second returns the session cookie. The launch token remains valid for that Host process; the helper also saves a private cookie jar for automated probes. Use the login URL in a browser or the jar for authenticated API calls. |
| 14 | Driving the bridge by hand | plugin endpoints look absent (`404 not found`) while native `/api/settings/describe` answers `200` | The bridge namespace is `botharness` (the short `n` in an early comment is stale): POST `/api/botharness/<method>` with `method: "botharness/<method>"`. Probe native and plugin endpoints separately before blaming the plugin layer. |
| 15 | `setsid` on macOS | a manual restart script dies with `command not found: setsid` | This checkout also runs on darwin. Use `scripts/dev-instance.mjs` (detached spawn) or a `( nohup … & )` subshell; never a bare `&`. |
| 16 | Streaming Fetch route also registered for GET | POST file upload commits, but an authenticated GET for the file returns an empty HTTP 400 | In pinned DSH `connection`'s HTTP bridge, `requestBody: 'streaming'` constructs a Fetch `Request` with a body for every method; Fetch rejects a GET body before the handler runs. Register distinct exact paths: a streaming POST upload route and a buffered GET download route. Rebuild and restart the Host after changing route registration, then verify both methods in a real browser (#146). |
| 17 | No process-injected dev key is mistaken for no model access | `dev-instance.mjs` reported “model calls will fail,” yet a PersonaBot DM received a real streamed DeepSeek reply | `dsh-credentials-local` resolves inherited environment before `$DSH_HOME/.credentials.yaml`, then project/home `.env`. The AX helper now distinguishes a shared injected key from a profile credential. Confirm the profile source without printing values, then prove usability with a real DM → model → committed Channel reply. |
| 18 | Runtime skill without explicit `source` lists but never loads | Skill appears in `<available_skills>`; every model `skill({name})` fails `Error: loaded skill "…" source must be a string` | Pinned `dsh-skill` `register()` defaults `provider` (→ `"runtime"`) but not `source`, while `validateDefinition` on the `get()` path requires both as strings. Always pass explicit `source` (e.g. `'runtime'`) and `provider` in `ctx.skills.register()`. Diagnosed live from an exported session zip (`session.v3.jsonl` tool/result) in #248. |

| 19 | Global DSH CLI shadows the worktree's RC2 dependency | The Profile serves 0.1.5 Web assets while the plugin was built against 0.1.7; Bot mode crashes with React's invalid element error because runtime icon exports differ | Launch through `scripts/dev-instance.mjs`, which runs and version-checks the target worktree's local CLI. Verify the browser's served Web asset and Profile before diagnosing UI data. |
| 20 | RC2 Client rebuilt frame does not remount the active BotHarness shadow slot | `pnpm dev:client` rebuilds in ~0.1 s and `/plugins/events` broadcasts the new revision, but the open Bot mode still shows the old tree | Open the local Web tab. BotHarness's development listener performs a full page refresh on its own rebuilt frame; reopen Bot mode after refresh. |
| 21 | Windows staged SQLite migration enters recovery | A fresh official Desktop profile can show `Operational database is in recovery mode: migration-failed` while adding a Workspace/Session; the same fresh owner test fails on Windows | Node on Windows returns `EPERM` for `fsyncSync` on a file opened `'r'` and for directory `fsync`. The owner now opens the staged database `'r+'` before syncing and skips unsupported directory sync on `win32`. Reproduce with the fresh `mountOperationalDatabase` test plus a real Desktop session. |
| 22 | RC2 Desktop Client HMR leaves an active Bot shadow stale and can poison Web boot | A linked `@botharness/client` `rebuilt` frame arrives, but the current DM keeps old text; an immediate or later `dsh-app://app` page reload can fail `@botharness/client: import failed`, with `duplicate factory registration` in the renderer console. A cold Desktop restart loads the same rebuilt bundle | Use the isolated Web Profile plus `dev:client` for continuous UI iteration. For an official Desktop checkpoint, stop the watcher, build, then restart app and Host. Read `%APPDATA%\@deepseek-ai\dsh-desktop\logs\crash-*-web-boot.log` before changing profile state; keep third-party bundles enabled. The [RC2 Desktop development guide](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.2/apps/desktop/README.md#develop) says reload/restart do not build source. |

## Reference

- **DSH source checkout**: `reference/deepseek-harness` (gitignored, in this worktree) pinned to the installed tag — currently `dsh-v0.1.7-rc.2`. Read the TypeScript source (`packages/typert`, `packages/*connection*`, `packages/*gateway*`, `apps/cli/reference/README.md`) when the how/why matters; the installed `lib/*.js` is bundled output. Re-pin when DSH is bumped: `git fetch --depth 1 origin tag <tag> && git checkout <tag>`.
- `references/debugging-playbook.md` — boot verification, status-code semantics, WS mux probe, bisect recipes, headless puppeteer probe.
- `references/probe-web.mjs` — headless browser probe (console errors, failed requests, WS, internal fetch); run from the repo.
- `dsh-ui` skill — in-harness UI rules; `docs/client-bridge.md` §7 — dev loop; ADR-0023 / #50 — bridge transport contract.
