# PR #835 integrated acceptance — 2026-10-05

Runtime code: `654966115533b7089081976a8a56759d3ab12933`, integrating main `ba19dd80259833ba28b5a074e6050ddbcbcbfe0c`. Pinned DSH 0.2.0-rc.1, real DeepSeek model calls, authenticated production commands and native Session events; no injected Inbox data. This follow-up changes evidence only after the integration commit.

| Boundary                                          | Fresh proof                           | Result                                                                                             |
| ------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Completed Report, native timer awaiting approval  | [01](01-reported-proof.json)          | Bot Report handled; no native completion yet; two Orchestrator Turns                               |
| One harmless timer approved, native Turn succeeds | [02](02-completed-proof.json)         | Independent system notice pending, linked to exact Report and Turn; no additional wake             |
| Real UI navigation from both source cards         | [05](05-source-navigation-proof.json) | Both open the actual Assignment; source states/timestamps and two-Turn count remain unchanged      |
| Cold restart of the same isolated Profile         | [03](03-restart-proof.json)           | Same notice identity/link remains pending; same Report timestamps; still two Turns                 |
| Next actual Human Channel message                 | [04](04-review-proof.json)            | Exactly one new Turn; exactly one notice exposure; Report reference retained; both sources handled |

The fixture reports its verified result before requesting one `sleep 1` native Shell call. The Human approves that call once; the fixture then ends. Two earlier fixture attempts included the optional `sandbox_permissions` argument and were rejected by the existing Grant guard, including when the value was `use_default`. They are failed fixtures, not successful timer runs. The passing fixture omits both `sandbox_permissions` and `justification`, preserving normal Grant checks and one-time approval. The canonical driver used a one-second Node timer; this macOS rerun used an equivalent one-second sleep. No production permission policy was relaxed.

Actual pre-restart UI captures at 1500 × 1000 (light):

![Integrated Host completion remains pending](completed.jpg)

![Opening a source reaches the real completed Assignment](native-source.jpg)

For the original matched baseline/after and complete light/dark series, see [the parent evidence set](../README.md). The integration does not alter the feature's visible UI contracts. After cold restart, the in-app browser connection timed out while loading the new preview. A newly rendered restart/handled screenshot could not be captured in this rerun; these boundaries are supported by fresh real Host/native/model assertions above, while their earlier screenshots remain pinned to their original revision. Do not treat the loading or stale page as current acceptance evidence.

Local validation: lint, format, typecheck, build and 90 focused compatibility tests across nine files pass. Independent Spec and Standards reviews of main `ba19dd80` to runtime code `65496611` pass with no actionable findings. [Integration CI](https://github.com/BotHarness/BotHarness/actions/runs/37264916467) passes at `65496611`.

Human QA uses a separate freshly completed Bot whose Host notice is still pending. In Bot mode, select **Human QA 835 1791178007551**, open its Bot Inbox and expand the Assignment group and handled history. Verify the Bot Report and separate pending system notice. Opening either source must not consume the notice. Send `REVIEW_NATIVE_COMPLETION` in that Bot's DM; the reply should be `NATIVE_COMPLETION_REVIEWED`, and the system notice should become handled. Authentication URLs, launch records, cookies, grants, private driver/state and full native logs remain local.

#194 stays open for strong-cause escalation, failure/interruption and active/observed execution crash repair. This successful terminal pair slice is paused for Human QA; no merge is inferred.
