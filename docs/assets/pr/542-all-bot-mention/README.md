# Human all-Bot Group mentions — actual DSH QA

Issue: #542; related Human Inbox: #126; design: ADR-0099.
Baseline: main `a12a67ae0634074ed09cf968f2ad1d05af002900`.
Runtime: DSH 0.2.0-rc.1, isolated local Profile, 1440×900 and 520×860.

## Scenario and results

The Release review Group contains Ada QA, Bea QA and Paused QA. Outsider QA is not a member. Ada and Bea use the `silent` ordinary Group-message policy.

1. The Group mention picker offers `@所有 Bot` with **2** recipients. Selecting it produces one compact counted chip. Paused and outside Bots are excluded.
2. A Human sends one message. The Host commits ordinary Ada/Bea mentions in one message. Both real models reply `ALL_BOTS_ACK` from their separate Admissions despite the ordinary-message silent policy.
3. The models initially requested native read-only Memory directory listings. These exact isolated-profile commands were approved once through existing tool approval; no approval was globally bypassed.
4. Selecting two recipients and pausing Bea before sending rejects the stale send. The draft is retained with the updated **1** count and a confirmation notice. The marker `STALE_PREVIEW_DO_NOT_SEND` never appears in committed history.
5. A Bot DM offers no all-Bot shortcut.
6. After restarting the final build, the ordinary mentions and both replies remain. `restarted.png` records the reopened Group.

`result.json` records the real-runtime assertions. Focused Host tests additionally cover zero recipients, forged targets, a Bot-authored attempt with no Source Event/Placement/Admission writes, changes during queued commit, same-count roster changes and same-ID replay after membership changes.

## Reproduce

Use a disposable DSH Profile configured with a working model route. Launch with the repository dev-instance workflow, then set `BH_ALL_BOT_QA_HOME` and `BH_ALL_BOT_QA_PORT` to that Profile. The runner reads the local dev-instance log and never writes its authentication URL into these assets.

```sh
node scripts/e2e-all-bot-mention.mjs before # baseline build; creates the scene
node scripts/e2e-all-bot-mention.mjs check  # implemented build; real models
node scripts/e2e-all-bot-mention.mjs finish # continue after answering legitimate model approvals
node scripts/e2e-all-bot-mention.mjs resume # after restarting the Host
```

Scene state is private under `.humanlayer/tasks/all-bot-mention`. If a model requests a native tool approval, review it in the real DSH interface before continuing; `finish` does not submit another Human message. Models need not request the same tools on another run.

Screenshots cover the baseline picker, light/dark picker and replies, narrow counted draft, stale recovery and final-build restart. They are actual browser captures, not mocked UI.
