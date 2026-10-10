---
Status: Accepted
Date: 2026-10-11
Issues: [#1363](https://github.com/BotHarness/DeepSeekBot/issues/1363)
---

# Online CLI management keeps explicit Host authority

The offline-first creation CLI cannot complete create/configure/reply tests while the Host holds its Profile writer lease. Explicit `--host` or `DEEPSEEKBOT_HOST` now selects the existing authenticated Host owners for supported management commands; no target keeps offline maintenance, and Host failures never trigger local database fallback. This preserves one durable authority and deterministic script targets rather than introducing local discovery, a second writer or ambiguous retry after a lost response.

Zip/directory inputs upload caller-local bytes to the existing exact Bot Zip import route; Git import executes in the Host environment. Creation and Model Preset application remain distinct owner operations: known partial success keeps its identity and stages, unknown outcomes are reported without automatic resubmission, and a real exact-request DM reply proves model usability. Offline support remains compatible with [ADR-0156](0156-programmatic-bot-creation-is-a-machine-first-cli-over-registry-creation.md); the authenticated carrier remains [ADR-0159](0159-live-cli-verbs-ride-the-dsh-http-carrier.md).

The pinned API Gateway does not globally serialize async RPCs. The Profile lease prevents a second process writer; per-owner revision/HEAD guards, receipts and idempotency define each command's concurrency and recovery guarantee. CLI diagnostics read existing Source Event/Admission and Session/activity projections without another store or lifecycle.
