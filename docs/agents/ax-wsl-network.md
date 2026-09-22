# AX: WSL outbound-network bridge for local Agent development

Use this runbook when a task-local DSH Host in WSL cannot reach an external model endpoint but the Windows host can. The 2026-09-22 PersonaBot tracer bullet exposed this split: Channel delivery worked, while WSL HTTPS timed out; a restricted Windows CONNECT relay let a real LLM complete the Orchestrator → Assignment → Channel reply path.

## Standing authorization and boundary

The Human has given standing authorization to use this **task-scoped, restricted relay** for recurring WSL egress failures; no per-session reauthorization is needed within these bounds. It may stay running across probes or tasks while useful for development or Human QA. This is not permission to change global Windows/WSL networking, disable a firewall, expose a general proxy, widen filesystem access, or restart other DSH profiles. If those changes become necessary, ask first.

One relay instance binds only to the Windows WSL virtual-adapter IPv4, accepts only the current WSL guest IPv4, and permits only `CONNECT <one-explicit-host>:443`. TLS stays end-to-end between the DSH process and that host; the relay does not inspect or log request bodies, headers, credentials, or model output. Use [the checked-in helper](../../scripts/dev-wsl-connect-relay.cjs); do not recreate an unrestricted proxy.

## Diagnose before bridging

1. Confirm the intended DSH profile, `DSH_HOME`, process, and port. Do not conflate a healthy HTML page with a healthy authenticated `/api` endpoint (see the `dsh-dev` debugging playbook).
2. Test the same provider host from WSL and Windows. A prompt `401` without credentials proves network reachability; a timeout before HTTP does not. Check a second ordinary host from WSL if the provider itself might be down.
3. Keep a red-capable application probe. For a PersonaBot DM, the Human message committing is only the first leg; `node scripts/e2e-personabot-first-dm.mjs --expect-reply` also requires a committed Bot reply containing a fresh nonce and visible in the UI.

## Start and verify the restricted bridge

1. Read the WSL default route's gateway IPv4 and the guest's `eth0` IPv4 (`ip route show default`; `ip -4 -o addr show eth0`). Verify the gateway is the Windows WSL virtual adapter. Pick an unused task-specific high port.
2. From Windows PowerShell, start `node scripts/dev-wsl-connect-relay.cjs <gateway-ip> <guest-ip> <provider-host> <port>` with `Start-Process -WindowStyle Hidden -PassThru`. Record its PID in the task notes; check its listener binds to the gateway IP, not `0.0.0.0`.
3. From WSL, test `curl -I --proxy http://<gateway-ip>:<port> https://<provider-host>` and a Node `fetch` with `NODE_USE_ENV_PROXY=1` and `HTTPS_PROXY` set to that proxy. A provider HTTP response confirms the tunnel; no API key is needed for this connectivity check.
4. Relaunch **only the task-local DSH process** with its existing `DSH_HOME` and profile plus process-local `NODE_USE_ENV_PROXY=1`, `HTTPS_PROXY=http://<gateway-ip>:<port>`, `https_proxy` with the same value, and `NO_PROXY=127.0.0.1,localhost`. Do not set global shell/profile proxy variables. DSH web tokens rotate on restart: read them only inside the probe, redact logs, and verify an authenticated native API before trusting the boot.
5. Run the real application E2E. Confirm the Host's durable Channel message, the real Bot reply, and any Assignment/Source Event state relevant to the task. A stream preview or optimistic bubble alone is not success.

## Keep, stop, and disclose

The relay may remain active for ongoing QA; inspect the recorded PID and exact listener before reusing or stopping it, and recheck both IPs after WSL networking changes. Stop the exact relay process and relaunch the task-local DSH Host without proxy settings when it is no longer needed or the Human asks. Never use `wsl --shutdown` to reset networking while other task profiles may be running.

Keep local tokens, raw logs, network addresses, and credential details out of GitHub issues and PRs. Publish only the non-sensitive behavioral result (for example, real LLM E2E PASS/FAIL and whether a reply committed). If the restricted path still fails, report the remaining environmental blocker rather than treating an in-Channel Human echo as an LLM success.
