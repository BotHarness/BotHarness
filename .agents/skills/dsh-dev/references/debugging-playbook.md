# DSH debugging playbook

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
