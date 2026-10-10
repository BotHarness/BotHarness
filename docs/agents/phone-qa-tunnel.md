# Phone QA over a Cloudflare quick tunnel

Let a phone test in-harness UI served by a DSH Host that stays loopback-bound. This is the
runnable form of the [mobile remote-access strategy](../research/2026-09-23-mobile-remote-access-strategy.md)
(Phase 1: tunnel plus the phone browser, no custom code). Use it when the phone cannot join
Tailscale, or when a disposable public URL is simply faster.

## Recipe

1. Boot an isolated instance and keep it alive for the whole session:
   `node scripts/dev-instance.mjs --home <isolated-DSH_HOME> --port <n>`.
   The browser under test is a child of this Host: every restart kills Chromium, so reopen
   tabs and reload test pages after each reboot.
2. Publish it: `cloudflared tunnel --url http://127.0.0.1:<n>` and note the printed
   `https://<random>.trycloudflare.com` URL. The URL is ephemeral: it dies with the tunnel
   process, and a new run mints a new hostname.
3. Trust the hostname, then restart the Host with it:
   stop the exact listener PID (`lsof -ti:<n> -sTCP:LISTEN`, never anything else —
   parallel sessions own their own ports), and relaunch the same profile with
   `--trusted-host <tunnel-host>`. Without this step the page shell loads but every
   `/api` call answers `forbidden`.
4. Open `https://<tunnel>/?token=<boot-token>` on the phone. The token rotates on every
   restart; session cookies outlive it, so an old tab can look logged-in while running a
   stale app shell (see below).

## Gotchas that cost real sessions

- **Stale shell, fresh iframe.** Token rotation does not reload the SPA, so an old tab keeps
  old JS while viewer iframes remount fresh on every mount. Any feature that needs both
  sides current (for example a postMessage bridge) silently does nothing. Remedy: kill the
  phone tab (swipe away, not refresh) and reopen; force an iframe remount with Stop then
  Open. Verify the served layers independently with curl before blaming the feature.
- **One listener per port.** Before relaunching, kill the exact PID from step 3. Never kill
  processes owned by other sessions; check the command line first.
- **Restart resets the world.** Chromium, open tabs, and in-memory handoff state die with
  the Host. Re-establish them and hand the human a fresh token URL every time.
- **Treat the URL as public.** Anyone holding the tunnel URL plus a valid token or cookie
  reaches the Host. Revoke by killing the tunnel and restarting the instance. Tokens,
  cookies, tunnel hostnames, and tailnet addresses never enter the repo.

## Cleanup

Kill the tunnel process, stop the exact Host PID, and confirm the port is free. Leave
long-lived dev profiles (VPS `deepseekbot` service, other sessions' instances) alone.
