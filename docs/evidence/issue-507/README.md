# #507 — Filtered retained model usage

Captured from a new isolated DSH 0.2.0-rc.1 Web Profile, through the shipped BotHarness UI and public API Gateway. No usage data was inserted or edited.

The fixture `Execution usage QA 1790831359441` completed real Orchestrator, Assignment and native DSH Subagent calls on DeepSeek Flash and V4 Pro. The provider omitted some V4 Pro usage fields; those counts remain unknown. Flash is fully reported: **68,166 tokens**, including **7,834** native Subagent tokens.

| Evidence                                        | Observable behavior                                                                                 |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| [Seven-day overview](week-all-models.png)       | Default last 7 days, model-only compact rows, details collapsed; incomplete Pro counts are unknown. |
| [Model filter](filtered-model.png)              | Select Flash: period and retained all-time totals are both 68,166.                                  |
| [Empty period](empty-period-retained-total.png) | Select the prior day: no calls and period zero, while filtered all-time remains 68,166.             |
| [Provider + role](provider-subagent-filter.png) | Select the actual provider, expand details and choose DSH Subagent: 7,834 tokens in both totals.    |
| [Dark overview](week-dark.png)                  | The same real data and controls in the native dark theme.                                           |

[results.json](results.json) records public query packets and measured shell geometry (834px usage content in an 864px card, 15px insets). The public filtered query was compared against independently requested unfiltered Profile day rows; the fixture is fresh, so its all-time baseline equals today's real calls. An older-than-182-days scenario, cross-Bot isolation, query limits and failed/missing reconciliation are covered through the Host query tests; ordinary Session source-loss/restart evidence is in [#502](../issue-502/README.md).

Reproduce by launching a fresh isolated Profile with `scripts/dev-instance.mjs`, completing a real multi-role fixture (the public `scripts/e2e-execution-usage.mjs` scenario), then running `scripts/e2e-filtered-usage.mjs` with `BH_E2E_ORIGIN`, `BH_E2E_HOME`, `BH_E2E_BOT_SLUG` and `BH_E2E_EVIDENCE`. The filter script accepts genuinely unknown provider usage; the older execution fixture checker requires all buckets complete and may reject such a fixture even after its model calls settle. Auth cookies remain private to the local dev helper and never enter the evidence.
