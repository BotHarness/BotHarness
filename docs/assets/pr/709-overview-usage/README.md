# Overview token usage — #709

## Real runtime evidence

All captures come from an isolated DSH Profile using the production BotHarness Host and Client,
the native API Gateway and two real PersonaBots: Budget Writer QA and Budget Reviewer QA.
The model produced actual DM replies; usage was not inserted into the database or mocked.

- `before-light.png` / `before-dark.png`: main at `24af579d`, same isolated Profile.
- `after-light.png` / `after-dark.png`: new seven-day Overview, matched desktop size and theme.
- `bot-detail-light.png` / `bot-detail-dark.png`: seven-day chart and both Bot totals after subsequent usage and restart.
- `narrow-light.png` / `narrow-dark.png`: 420px viewport; no document horizontal overflow.
- `bot-profile.png`: the Overview arrow opened Budget Writer QA's actual Profile.
- `later-usage.png` / `restarted.png`: a later real reply increased the total from 106,317 to 142,268; restarting the Host retained 142,268.

Today and seven-day totals were compared with both Bots' canonical Profile queries. The two-Bot
sum matched the global total. All recorded usage happened today, so the previous six daily
buckets correctly show zero. Calendar boundary, multiple roles/routes, unknown usage and more
than twenty Bots are covered by automated tests rather than synthetic screenshot data.

## Human QA

1. Open Activity Center → Overview, then expand Statistics.
2. Switch Today / Last 7 days; inspect the chart, date labels and Daily exact values.
3. Compare each Bot row with the corresponding Profile using its arrow.
4. Return to Overview and refresh. Range switching and usage refresh do not mark messages read.
5. Create a real DM reply, let the Bot settle, then refresh to see the additional usage.
6. Leave Overview and return; its read-only polling is disposed when the usage view unmounts.

The script `scripts/e2e-overview-usage.mjs` provides `prepare`, `check` and `resume` modes.
Use a private isolated Profile and set `BH_OVERVIEW_USAGE_QA_HOME` and
`BH_OVERVIEW_USAGE_QA_PORT`; launch it with `scripts/dev-instance.mjs` first. `resume`
checks retained usage against the earlier run, without generating extra model replies.
Launch logs and authentication URLs stay private.

Provider buckets remain nullable; unknown is displayed as unknown. Retained statistics for a
Bot absent from Registry are labeled with its stable slug and have no invented Profile link.
The selected date range is defined by the Host's local calendar, displayed with its timezone.
