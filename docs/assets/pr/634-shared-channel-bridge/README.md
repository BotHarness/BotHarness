# Shared Channel bridge — #634 E2E

Verified on 2026-10-02 with DSH `0.2.0-rc.1`, the qualified dsh-im Provider source `ee9d3c7a6fc9f15b13f8d895cd1ccb5183b7cd37`, a real Lark QA group and two actual PersonaBots. Setup used the public Host commands and the target was selected in the native Client. Incoming stimuli and replies used real Lark identities. No direct database setup, synthetic Provider event or mocked model was used for this E2E.

## Human review path

1. Open the task's running isolated DSH instance using its locally printed login URL. Open **IM Artifact QA**, its Profile details, then **IM connection**. **Local receive target** selects **Lark Shared Channel QA #634**; the source/account remains **MUFENG YANG的Lark CLI · BotHarness IM QA #78**. The default for other grants remains **This Bot Inbox only**. Changing the target alone does not start reception or send a message.
2. Open **Lark Shared Channel QA #634**. The retained `[BH634 SHARED]` and `[BH634 TOPIC]` messages have external author, original time/body and expandable Lark group/message/source/sender references. The topic retains its verified `threadId`. The two initial stimuli plus the fresh integrated stimulus are three placements of three canonical Source Events, not copied per-member messages or local Human messages.
3. In Lark **BotHarness IM QA #78**, find the matching Human mentions, **BH634-SHARED-OK** reply and **BH634-TOPIC-OK** topic reply. These are visible remote receipts, separately from the checked Provider acceptance. Lark read circles are not asserted as Bot read receipts.
4. Open **IM Shared Reader QA**'s DM. Its **BH634-READER-OK** response reports the same message/source IDs after its actual `channel_read`. It has no external binding; the external message itself did not wake it. A separate explicit Human DM requested this read. It posted only to its local DM.
5. To repeat, send a new actual @ to the bound Bot in the QA group, requesting one explicit `bridge_reply` to the original message. Observe one new shared message and the bound Bot's existing attention/Orchestrator. A plain message without @ stays outside this slice: `[BH634 NOAT]` produced no source, placement, wake or reply.
6. The existing **Stop group @ reception** and **Revoke binding and authorization** controls stop future reception/effects. Selecting **This Bot Inbox only** changes future new messages; prior shared history stays retained. Leaving/removing the receiving Bot closes its current access and applicable intake/unstarted effects. These last boundary checks are covered through assembled Core tests; do not revoke the live QA binding unless deliberately testing that action.

## Observed results

- Final runtime code commit `89272bf1` was built on main `5de4da44`. A fresh `[BH634 INTEGRATED]` Human mention again ran actual `channel_read` and `bridge_reply`, committed one new shared source/placement/admission and received **BH634-INTEGRATED-OK** in the actual Lark QA client. `channel-integrated.jpg` shows this integrated native UI; the previous two source identities remained unchanged.

- `verification.json` contains only selected QA tool calls/results and canonical counts: both actual Orchestrators read the same source, three checked replies were accepted, each source has one placement and only the bound Bot's handled admission, the second Bot has zero bindings, and no Assignment was created.
- The final build restarted the same isolated Profile. Both messages remained visible, both Bots returned idle, and the counts/reply intents remained unchanged. Restart/replay/membership/revocation and forbidden identity borrowing also have automated regressions.
- Sender display uses a Provider-provided name when present, otherwise its stable sender ID. This live Provider supplied the ID; this PR does not request broader directory access or fabricate a local Human identity.
- One target per grant and one placement per Source Event are intentional first-slice limits. Ordinary collection, multiple destinations, thread following and cross-Bot takeover are subsequent #629 tracers.

## Captures

The paired Chrome captures use the same normal **496 × 819** viewport, Chinese locale and light theme. The baseline is main `3f38f0190419bb8456679d80cac1d33ec62e9845`; the new Group has no shared external entry in that absence state. `channel-restart.jpg` records the final rebuild/restart in the browser's later normal **882 × 771** viewport and is a separate verification capture, not a before/after comparison. Lark captures show only the independent QA group window.

| Capture                                        | Evidence                                                                    |
| ---------------------------------------------- | --------------------------------------------------------------------------- |
| `im-target-before.jpg` / `im-target-after.jpg` | Existing Inbox-only entry point versus explicit saved Group target          |
| `channel-before.jpg` / `channel-after.jpg`     | Shared external message absent versus real incoming placement               |
| `channel-origin.jpg`                           | Exact message/source/sender references and verified topic ID; long IDs wrap |
| `reader-after.jpg`                             | Unbound second Bot's real authorized read and local response                |
| `lark-after.jpg` / `lark-topic.jpg`            | Actual Lark receipt of root reply and same-topic reply                      |
| `channel-integrated.jpg`                       | Latest-main integration, new actual mention and expanded exact origin       |
| `channel-restart.jpg`                          | Retained two messages and idle members after final rebuild/restart          |

## Validation

- Full workspace suite: **1820 passed, 2 skipped** across 225 files. Skips are not passes.
- Final focused suite after latest-main integration and the unavailable-target status fix: **121 passed** across Messaging inbound, harvest, group digest, Client Messaging Profile and Client bridge tests.
- `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm build`, `pnpm changelog:check` and `pnpm diagrams` passed. Existing lint warnings remain; no lint error was suppressed.
- The first integrated full-suite run overlapped the last status edit and mixed old implementation/new assertion (`connecting` versus `unavailable`); that failed run is retained locally. The fixed-code full-suite result above and final focused result are the release evidence.
- No production deployment. Human QA is required before merge; the goal pauses after the PR is created.
