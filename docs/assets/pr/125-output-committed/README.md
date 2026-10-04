# #125 — committed PersonaBot output evidence

These screenshots and records come from a real isolated DSH 0.2.0-rc.1 Host, with DeepSeek Flash / low and BotHarness's authenticated API Gateway. The application UI is unchanged by this Host extension event.

## Observed behavior

- [Actual DM](actual-dm.png): a real Orchestrator Session publishes `DM output verified` through `channel_send`.
- [Actual group](actual-group-dark.png): the same owned Session publishes `Group output verified` to its joined group.
- [Before restart](before-restart-proof.json): four unique output events; each consumer reads the already committed message, resolves its owned Session, and receives a frozen payload. Four throwing listeners and four rejecting listeners leave the successful consumer and messages intact. The filtered DM consumer sees two matching messages, disposes its Fiber, and receives nothing thereafter.
- [After restart DM](after-restart-dm.png) and [after restart proof](after-restart-proof.json): all earlier messages remain queryable, zero old notifications replay, and the next real reply produces exactly one new notification.

The public records contain only QA identities, already public message text, event references, and verification results. They exclude credentials, raw Session snapshots, tool arguments, machine paths, and Host logs.

## Reproduce

1. Build this branch and boot `scripts/dev-instance.mjs` with a fresh isolated home and a free loopback port.
2. Add `scripts/fixtures/output-committed-consumers.mjs` as a QA-only Plugin in that isolated Profile's Patch; configure `proofPath` to a private task-local JSON file. This consumer is not installed by the production Profile.
3. Set `BH_E2E_ORIGIN`, `BH_E2E_HOME`, and `BH_E2E_EVIDENCE` to that instance, its home, and a private task evidence directory. Run `node scripts/e2e-output-committed.mjs send`.
4. Stop and restart the same isolated Host with its original home. Run `node scripts/e2e-output-committed.mjs restart`.
5. `capture` recaptures the existing actual DM and group without making model requests.

The initial `send` run completed its Host assertions, then hit a native client-entry timing race while capturing. The bounded entry retry was corrected; `capture` subsequently succeeded. The complete `restart` run, including its screenshot, passed.

## Automated boundaries

`packages/core/test/personabot-output.test.ts` covers the SQLite commit/rollback path, idempotent writes, immutable allowlist, consumer failure isolation, Cordis Fiber cleanup, restart/no replay, SSE metadata exclusion, and the trusted runtime's DM/group send path. No test introduces another store or a mock extension event bus.
