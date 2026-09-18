# The client bridge is read-model RPC, not Cordis injection

The Web Client is a separate browser Cordis application assembled independently from the Host; `ctx.provide('botharness', core)` is visible only to Host-side plugins, so the roster cannot inject the core service. Core therefore exposes its read model as explicit unary RPC methods on the generic Connection RPC channel: the client calls `ctx.connection.rpc.call('/api', 'botharness/<method>', payload, signal)`; the Host registers endpoints with `ctx.connection.rpc.intercept('/api', …)` or precise routes via `ctx.connection.fetch.register(...)`. Responses use one envelope, `{ ok: true, value }` or `{ ok: false, error }`, plus a change cursor carried by list/get. Status push is not direct `states.on` in the browser: the upstream remote event whitelist (`API_REMOTE_FORWARDED_EVENTS`) is a first-party static list that third-party packages cannot append to, so M3 refreshes after user actions and low-frequency polls, and may later add a private SSE route. The client ships as an independent `@botharness/client` package (`dsh.client.platform: 'web'`, `./client` export) with a hand-built lazy-CJS bundle; the shell module baseline stays external and everything else is inlined. Typert `@Remote` remains a later candidate once its build-time generator is shown to be reproducible outside the DSH workspace.

## Considered Options

- **Typert `@Remote` first** — deferred: it needs build-time codegen plus first-party `api-remotes` assembly; reproducibility outside the DSH workspace is unverified and the read model is still moving.
- **Expose the core service via `inject` to the client half** — impossible: the browser half is a separate Cordis app; there is no cross-process service injection, and `dsh.client.inject` is informational only.
- **Direct `states.on` push to the browser** — impossible today: forwarded events are a static first-party whitelist; a third party cannot register its own.
- **Direct SSE now** — deferred: M3 needs refresh-on-action, not real-time; a private route on `fetch.register` (`requestBody: 'streaming'`) can be added behind the same method surface once six-state liveness is proven necessary.
- **Fold the client into `@botharness/core` (DSH's default two-halves-per-package)** — rejected for now: the halves have different build targets and dependency laws, and the independent package keeps the Host half free of React; the cost is a deliberate deviation from the DSH packaging convention, recorded in the client spec.

## Consequences

- Core must own a wire contract — method names, payloads, envelope, cursor/version — with exact names draft until M3 lands; `docs/client-bridge.md` holds the surface.
- M3 client is refresh/polling only, no live push; "six-state realtime" may need a private stream later.
- Architecture docs are corrected: no `provide('botharness') → client` arrow; the communication table splits Host-internal Cordis / browser-internal Cordis / cross-process RPC.
- `@botharness/client` needs its own Loader entry and `dsh.client` manifest; DSH's shared client build preset is unpublished, so the lazy-CJS bundle (`window.__ModuleLoader__.load`) is hand-rolled — the M3 top engineering risk.
- The browser half treats every RPC result as a plain value and renders loading/error states; no Host object graph leaks into React props.
- Evidence: `docs/research/2026-09-18-dsh-client-ui-and-docs-ia.md` (§1.4, §1.5, §2).
