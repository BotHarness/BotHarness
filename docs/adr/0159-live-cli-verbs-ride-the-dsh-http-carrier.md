---
Status: Accepted
Date: 2026-10-10
Issues: [#1315](https://github.com/BotHarness/DeepSeekBot/issues/1315)
---

# Live CLI verbs ride the DSH HTTP unary carrier, never the database

Offline CLI verbs stop at the profile writer lease: while the Host runs, every direct store access fails coded (`lease-unavailable`, proven live). Live verbs (send, approvals, IM authorization) therefore need a way to talk to the running Host. We decided that **live verbs use the DSH HTTP unary carrier — `POST /api/<endpoint>` with the bridge method name — with a token-to-cookie login per invocation, and never touch the operational database directly.**

## Decision

- **Carrier: plain HTTPS fetch against `/api/<endpoint>`.** The envelope observed live and documented upstream is `{type: 'client-request', rpcId, method: 'botharness/<verb>', payload: {args}}`; the endpoint must equal the method. No new local socket, no DSH client library vendored: Node fetch plus JSON is the whole client.
- **Coverage comes free.** The bridge already exposes the full surface as remote methods (send, approvals, questions, messaging authorize/revoke, grant create, deletion confirm, schedules, release), so P2/P3 add verbs, not transport.
- **Auth per invocation, token never in argv.** Each Host process mints a random launch token (logs/journal only, rotates on restart); `GET /?token=` exchanges it for an authority-bound signed cookie, and the HTTP carrier accepts no other credential form. The CLI takes the base URL from `--host` and the token from an environment variable or `--token-file`, logs in fresh on every call, and treats 401 as coded `host-unauthorized` (operator refreshes the token). The token is never logged, echoed, or persisted by the CLI.
- **Trust boundary unchanged.** Loopback or tailnet TLS only; the CLI sends no `Origin` and adds none. Payloads never carry secret values — the machine contract's secret rules apply on the wire exactly as on argv/stdout.
- **Concurrency by statelessness.** The Host serializes RPC; the writer lease stays Host-held; the CLI keeps no session, so concurrent callers are independent invocations. Transport failures (refused/timeout) surface as coded `host-unreachable`, distinct from bridge and `gateway/*` codes, which pass through with their prefixes intact.

## Considered Options

- **New local socket for CLI↔Host:** rejected. A second listener is a second attack surface duplicating a documented, E2E-proven carrier.
- **Direct database side-channel while the Host runs:** rejected. Proven to fail (`lease-unavailable`); bypassing the lease would corrupt the Host's writer guarantees.
- **Vendoring the DSH gateway client:** rejected. The unary envelope is stable JSON over fetch; a library buys nothing until streaming verbs are needed.
- **Persisting the cookie/token in a CLI config file:** rejected. Tokens rotate per process and live in logs already; a cache adds stale-credential failure modes for zero gain since login is one cheap request.

## Consequences

- P2/P3 verbs are thin RPC wrappers plus the existing machine contract; their tests run against a live isolated Host like the E2E probes that proved this path.
- If DSH ever ships a stable token file or CLI credential helper, only token acquisition changes; envelopes, codes, and the secret rules survive.
- Streaming verbs (live reply tails, event follows) stay out until needed; when they arrive they ride the gateway mux, still not a new socket.
