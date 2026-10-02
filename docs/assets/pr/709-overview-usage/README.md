# Overview token usage — #709

## Real runtime evidence

All captures come from an isolated DSH Profile using the production BotHarness Host and Client,
the native API Gateway and two real PersonaBots: Budget Writer QA and Budget Reviewer QA.
The model produced actual DM replies; usage was not inserted into the database or mocked.

- `before-light.png` / `before-dark.png`: main at `24af579d`, same isolated Profile.
- `after-light.png` / `after-dark.png`: updated compact seven-day Overview on 2026-10-03, using the same retained real-model usage.
- `bot-detail-light.png` / `bot-detail-dark.png`: seven-day chart and both Bot totals after subsequent usage and restart.
- `narrow-light.png` / `narrow-dark.png`: 420px viewport; no document horizontal overflow.
- `bot-profile.png`: the Overview arrow opened Budget Writer QA's actual Profile.
- `later-usage.png` / `restarted.png`: a later real reply increased the total from 106,317 to 142,268; restarting the Host retained 142,268.

Today and seven-day totals were compared with both Bots' canonical Profile queries. The two-Bot
sum matched the global total. The initial 2026-10-02 captures had all calls on that date, with the earlier six daily buckets at zero. The compact follow-up was captured on 2026-10-03: Today is empty while Last 7 days retains the earlier calls. Calendar boundary, multiple roles/routes, unknown usage and more
than twenty Bots are covered by automated tests rather than synthetic screenshot data.

## Human QA

1. Open Activity Center → Overview, then expand Statistics.
2. Switch Today / Last 7 days; inspect the chart and date labels, then expand Details for exact daily values and provider buckets.
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

## Human QA follow-up: match PersonaBot Channel Profile

`compact-before-light.png` / `compact-before-dark.png` show the previous Overview layout;
`bot-detail-light.png` / `bot-detail-dark.png` show the aligned Profile card. Both compare the
same two Bots and seven-day usage (142,268) after the local date rolled to 2026-10-03.
The current Today range has no calls and correctly shows zero; an idle Bot with reported usage
remains in the seven-day breakdown. The breakdown is not a Registry roster of unused Bots.

The view directly reuses the existing Profile card/header/total, segmented grouping controls,
24px icon actions, daily and horizontal stacked charts, and collapsed detail table styles.
The browser measured both Profile and Overview: **15px total font, 12px 14px card padding and
128px daily chart height**. Main measures use the existing chart tooltip; exact input, output,
cache-read and cache-write buckets remain available in Details (`exact-details.png`).
No new usage store or changes to the read-only query, pagination, Profile navigation or unread
behavior were introduced by this UI follow-up.

## Publish capture files

The script writes private capture names, not these published names. `before` and `check` both
produce `overview-light.png` / `overview-dark.png`, so publishing them under the same names would
overwrite the comparison. `resume` adds `-restart` to page screenshots; section screenshots have
no suffix. Use a separate capture directory for each phase (`BH_OVERVIEW_USAGE_QA_OUT`), then copy
the successful run's PNGs into this directory using the mapping below. The shorter public names
remain stable across PR updates. Do not publish launch logs, tokens or diagnostic-error captures.

| Capture phase               | Script output                                                            | Published filename                                     |
| --------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------ |
| Initial main `before`       | `overview-light.png` / `overview-dark.png`                               | `before-light.png` / `before-dark.png`                 |
| Previous Overview `resume`  | `usage-bot-detail-light.png` / `usage-bot-detail-dark.png`               | `compact-before-light.png` / `compact-before-dark.png` |
| Current compact `resume`    | `overview-light-restart.png` / `overview-dark-restart.png`               | `after-light.png` / `after-dark.png`                   |
| Current compact `resume`    | `overview-narrow-light-restart.png` / `overview-narrow-dark-restart.png` | `narrow-light.png` / `narrow-dark.png`                 |
| Current compact `resume`    | `usage-bot-detail-light.png` / `usage-bot-detail-dark.png`               | `bot-detail-light.png` / `bot-detail-dark.png`         |
| Current compact `resume`    | `bot-profile-restart.png`                                                | `bot-profile.png`                                      |
| Current compact `resume`    | `usage-exact-details.png`                                                | `exact-details.png`                                    |
| Initial 2026-10-02 `check`  | `overview-later-usage.png`                                               | `later-usage.png`                                      |
| Initial 2026-10-02 `resume` | `overview-restarted.png`                                                 | `restarted.png`                                        |

For a fresh `check` run instead of `resume`, the page captures have no `-restart` suffix;
use their plain names for the same public targets. Keep the earlier growth/restart captures
as dated evidence, rather than replacing them with an empty Today interval after rollover.
