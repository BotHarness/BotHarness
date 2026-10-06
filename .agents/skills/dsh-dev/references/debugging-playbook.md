# DSH debugging playbook

## Packaged-artifact qualification

Pinned DSH `0.2.0-rc.1` resolves Bundle packages from the running CLI installation
before trying the Profile. A CLI inside the monorepo can therefore load linked
development packages despite a successful tarball install and API probe. Use an
independently installed official CLI, then verify the actual Client version and
component inventory as well as installed artifact integrity. Changing only cwd
does not change the CLI installation anchor. In pnpm 12, local artifact overrides
belong in `pnpm-workspace.yaml`, not `package.json.pnpm.overrides`; preserve existing
settings and reviewed build decisions. The product qualification helper exercises
this path in [#823](https://github.com/BotHarness/BotHarness/issues/823).

Symptoms → checks → conclusions, in the cheapest-first order. All commands assume WSL with the fnm node on PATH; `DSH_HOME=$HOME/.dsh-m35`; repo root.

## 1. Boot verification (always after restarting the dev server)

```bash
cd <repo> && DSH_HOME=$HOME/.dsh-m35 setsid nohup dsh --profile web-dev --no-open > /tmp/dsh-web.log 2>&1 &
sleep 12
cat /tmp/dsh-web.log                     # → dsh web: http://127.0.0.1:3080/?token=…
pgrep -af "node .*installation/bin/dsh" | grep -v bash   # server alive?
```

Then validate the plugin layer actually mounted, not just the HTML shell:

```bash
TOKEN=<token from the log>
curl -s -c /tmp/dsh-cj -o /dev/null "http://127.0.0.1:3080/?token=$TOKEN"
curl -s -o /dev/null -w "%{http_code}\n" -b /tmp/dsh-cj \
  -X POST -H 'content-type: application/json' \
  -d '{"type":"client-request","rpcId":"probe","method":"settings/describe","payload":{"args":{}}}' \
  http://127.0.0.1:3080/api/settings/describe
```

Status semantics:

| Status | Meaning |
| ------ | ------- |
| `401` | no/expired cookie (login step failed or cookie authority mismatch) |
| `404` + plain `not found` | shared `/api` handler found **no matching interceptor claim** — plugin layer broken or wrong interceptor occupying the slot |
| `200` + `server-response` envelope | healthy; bad envelope fields come back as `gateway/bad-request`, not 404 |
| connection refused | server not booted / wrong port / killed by wrapper exit (use `setsid`) |

No-cookie probes: `/` → 401 means the HTTP shell is up; `/api/*` → 404 without a cookie proves only that the route dispatcher ran — **always probe with a cookie**.

## 2. Is the WebSocket stream mux up? (remote events / streaming)

```bash
curl -s -i -N --max-time 5 \
  -H "Connection: Upgrade" -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" -H "Sec-WebSocket-Version: 13" \
  -H "Origin: http://127.0.0.1:3080" -b /tmp/dsh-cj \
  http://127.0.0.1:3080/api/remote.mux | head -5
```

`101 Switching Protocols` = api-gateway host half is alive (registered by `@deepseek-ai/dsh-api-gateway`). This does **not** imply the HTTP `/api` claims work.

## 3. Headless browser probe (console + network + WS)

```bash
cd apps/docs
node ../../.agents/skills/dsh-dev/references/probe-web.mjs http://127.0.0.1:3080 <token>
```

Prints origin/service-worker state, in-page fetches, console errors, failed requests, and WS creations. Use it before blaming the user's browser cache; it reproduces server-side breakage deterministically (headless Chrome, fresh profile).

## 4. Bisect the plugin layer

Two levers, both applied at boot (restart needed, no reinstall):

```
# a) remove a bundle from $DSH_HOME/profiles/web-dev/package.json → dsh.profile.bundles
# b) disable one plugin by id via the user patch layer $DSH_HOME/profiles/web-dev/cordis.patch.yml:
- id: botharness-core
  disabled: true
```

Example that localized the `/api` interceptor conflict: with `deepseekbot` present → native APIs 404; disabled → 200; then binary-search inside the bundle (`botharness-core` vs `botharness-client`).

Clean-room control (is it the profile or DSH itself?):

```bash
DSH_HOME=/tmp/dsh-clean setsid nohup dsh web --no-open --port 3096 > /tmp/dsh-clean.log 2>&1 &
# fresh DSH_HOME: profile "web" boots from the shipped template (dsh-base + dsh-web-app)
```

If the clean profile works and ours does not, the deviation is in our profile/bundles — not DSH.

## 5. Where the contracts live (read the installed code first)

Read the **TS source first**: `reference/deepseek-harness` in this worktree (pinned to the installed tag, see SKILL.md).

Installed packages under `~/.dsh-m35/profiles/node_modules/@deepseek-ai/` are **symlinks to the global dsh install** (`…/fnm/…/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/…`) — when you must read the shipped build, grep with `find -L` or grep `"$dir"/*/lib/*.js`; plain `grep -r` skips symlinked dirs.

- HTTP transport + auth fence: `dsh-client-connection/lib/index.js` (`createSharedFetchHandler`, `registerInterceptor` — single slot per channel, `register` for prefix routes).
- Endpoint claiming: `dsh-api-gateway/lib/index.js` (`intercept('/api', claimsEndpoint, dispatchRpc)`; WS mux at `/api/remote.mux`).
- Browser transport: `dsh-client-connection/lib/client.js` (`createWebConnectionRpc`, `INTERNAL_BASE`, error text `transport failure for <channel>/<endpoint>: HTTP <status>`).
- Boot globals injected into index.html: `__DSH_BOOT__`, `__DSH_CONNECTION_RECOVERY__`, `__DSH_BOOT_READY__` (`dsh-client-connection` host `webserver/index-inject`). `__DSH_TRANSPORT__` is optional; absent = plain HTTP to `location.origin`.

## 6. Preserve the receiver of native Client service callbacks

A class service method such as `uiWorkspace.pickDirectory()` uses its receiver. Passing
`workspace.pickDirectory` as a detached callback loses `this.directoryPicker` and can make a
working native picker appear unavailable. Wrap the call (`() => workspace.pickDirectory()`) or
bind it to the service before injecting it into a UI face. Verify the registration with a
receiver-dependent service fixture and the real Client, rather than an arrow-only mock (#166).

On pinned DSH `0.2.0-rc.1`, the browse backend's directory flow is rendered through workspace
Slots; it does not make `uiWorkspace.pickDirectory()` an in-app dialog. A Consumer using that
native command should keep a manual path fallback when the Host has no native chooser. Do not
replace the gateway, borrow another entry's child Slot, or expose the Host to force a different
picker. For an unbindable macOS system dialog, record native selection as Human QA pending;
opening its process alone is not evidence that a directory was selected.

## Local Computer target verification (DSH 0.2.0 RC1)

Native settings expose only volatile fields. Volatile references have `get()` rather than a subscription; the pinned Loader commits them before emitting the Fiber-filtered `loader/volatile-update` event with changed paths. A resource-owning consumer must react to that event, dispose the old target and invalidate cached tools/session grants instead of capturing the initial target. Patch config replaces the whole object, so the Computer Bundle declares the fresh local default while the schema keeps the legacy container fallback. Verify a real native Settings selection plus Host read-back and restart persistence.

Pinned cua-driver 0.28.0 `doctor --json` checks installation, not TCC grants. Use `mcp --direct --embedded` for the Host-owned stdio runtime and read `check_permissions({prompt:false})`; the ordinary macOS proxy path belongs to the standalone driver identity. Embedded mode does not raise permission prompts. Granted OS booleans do not prove direct ScreenCaptureKit capture: preserve a real first-observation failure and report it separately from installation/permissions. Do not silently retry a native permission refusal. See the [upstream embedding contract](https://github.com/trycua/cua/blob/cua-driver-rs-v0.28.0/libs/cua-driver/rust/Skills/cua-driver/EMBEDDING.md).

For a mode that categorically refuses an upload, register its route as buffered under the native request-body cap instead of streaming. The pinned HTTP bridge destroys unread streaming requests after writing the response; a short early refusal can reach Undici as a socket-close error. Computer re-registers the upload route when its target changes: local is buffered and refused; container keeps the existing streaming TAR path. Verify the refusal over real HTTP, not only with a constructed Request.

Pinned DSH MCP `createMcpToolDefinition` retains `structuredContent` in the canonical result value, but its Native model text projection reads only `content`. A driver that emits a count-only text block can therefore hide window IDs and snapshot element tokens from the model. Computer mirrors the same structured payload into a JSON text block before the Native adapter, keeping image blocks and the original structured value intact; it never mirrors this observation data into Computer Audit. Validate with a real model Turn rather than only asserting the raw driver return.


### Checked external replies with reception disabled

A connected third-party IM account can still refuse a checked reply if its runtime remains in a standalone consumer mode. Verify the pinned Provider contract and the actual responder account: mocked reply qualification alone does not exercise exclusive consumer acquisition. Keep reply connection ownership separate from receive scope; use the existing consumer fanout and lifecycle cancellation without enabling Inbox admission or a standalone Session runner merely to make the reply succeed. #637 validates this boundary with an independent responder identity.

## Native `read_image` and scoped filesystem injection (DSH 0.2.0-rc.1)

A successful external image download and a model route declaring image input do not prove the native image Tool can read it. In an Orchestrator with an isolated filesystem Provider, the pinned `@deepseek-ai/dsh-tool-fs` attachment subplugin declares only `attachments`; its later `ctx.fs` access fails with `cannot get property "fs" without inject`. Reproduce through the real Cordis Tool Registry using `packages/core/test/orchestrator-file-tools.test.ts`, not a mocked Tool implementation.

The task-qualified package patch declares both `attachments` and `fs` for that subplugin. It reuses the existing Provider, native image-capability checks, canonical Attachment service and per-call Grant gate; it adds no authority or parallel image Tool. The regression must return an ImageBlock on an authorized path, refuse after Grant revocation without another filesystem read, and remove the registration on awaited disposal. Build and reinstall the packaged product, restart the exact isolated Host, then require fresh native `read_image` and model visual evidence; a Client preview or a green unit test alone is insufficient ([#904](https://github.com/BotHarness/BotHarness/issues/904)).
