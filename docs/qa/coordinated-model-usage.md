# Coordinated PersonaBot model usage QA

Issue: [#592](https://github.com/BotHarness/BotHarness/issues/592). Human prioritized this presentation after approving #503 / PR #598. It uses the existing bounded 26-week public Profile usage query; retained history, expanded Host filters and all-time totals remain #502 / #507.

## Real DSH evidence

Verified against the pinned DSH 0.2.0-rc.1 in a new isolated Profile. **Execution usage QA 1790799014941** made real Orchestrator (Flash/low), Assignment (V4 Pro/off) and DSH Subagent (Flash/low) requests. The real child reply reached the Assignment report and the parent DM. Public daily aggregates independently match all owned native settlement reports on **2026-10-01**:

| Execution    | Actual model (deepseek-official) |  Input | Output | Cache read | Cache write |  Total |
| ------------ | -------------------------------- | -----: | -----: | ---------: | ----------: | -----: |
| Orchestrator | deepseek-flash                   | 14,299 |    857 |     72,960 |           0 | 88,116 |
| Assignment   | deepseek-v4-pro                  |  7,298 |    324 |     17,792 |           0 | 25,414 |
| DSH Subagent | deepseek-flash                   |  6,675 |      7 |      1,152 |           0 |  7,834 |

Default model totals merge execution roles: **Flash 95,950**, **V4 Pro 25,414**, overall **121,364 tokens**. The two TanStack Charts use the same selected range, defaulting to the most recent 7 calendar days including today. Execution labels are absent from the default view; native Details is closed. Keyboard Enter opens it and exposes all three execution rows plus daily bucket data.

The real script verified Today keeps the same fixture total, a custom unused day clears both charts and displays the empty state, and restoring 26 weeks returns the model rows. Refresh preserves the public aggregates. The full Profile measures 900px wide with 18px normal inset at a 1500px viewport; the 1040px viewport has no usage-section horizontal overflow. Both themes were inspected, including proportional model bars aligned to their labels. Narrow labels prioritize model names, with provider beneath and full titles available.

![Default overview, light theme](coordinated-model-usage.png)

![Default overview, dark theme](coordinated-model-usage-dark.png)

![Expanded execution and daily details](coordinated-model-usage-details.png)

![Narrow overview](coordinated-model-usage-narrow.png)

![Custom range without calls](coordinated-model-usage-empty.png)

## Reproduce and Human QA

Launch an isolated Host with `scripts/dev-instance.mjs`. Set `BH_E2E_ORIGIN`, `BH_E2E_HOME`, `BH_E2E_SCREENSHOT`, and `BH_E2E_EXPECT_COORDINATED=1`, then run `node scripts/e2e-execution-usage.mjs`. An optional `BH_E2E_BOT_SLUG` rechecks an existing fixture without extra provider calls. The script waits for the Bot's public aggregate state to become idle, compares reported settlements within the same date window, and captures the default, expanded, empty and narrow presentations.

1. Open Bot mode, select the fixture above, and open its complete Profile.
2. Default Token usage should show Last 7 days, daily usage and two model totals, with Details collapsed.
3. Select Today: both charts and the overall total describe that range. Choose Custom and set both dates to an unused day: no stale bars remain. Try Last 26 weeks, then return to Last 7 days.
4. Focus Details and press Enter. Orchestrator, Assignment and DSH Subagent appear with input/output/cache buckets and reported totals. Close it to return to the model overview.

Focused public Host-query and Client tests verify exact provider/model distinction, combined execution roles, range synchronization, known totals with missing buckets, unknown totals, invalid ranges and unavailable versus empty results. No Client reads private Session logs and no second statistics store is introduced.
