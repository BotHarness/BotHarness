Closes #863

[Spec #629](https://github.com/BotHarness/BotHarness/issues/629) | [Provider PR](https://github.com/DoodleBears/dsh-im/pull/5) | [E2E proof](https://github.com/BotHarness/BotHarness/blob/codex/863-slack-report/docs/assets/pr/863-slack-report/README.md)

## Why the change

A PersonaBot can publish a Slack report without mirroring it into local chat, inspect its saved content and native receipt, and answer an eligible Human follow-up in the report's original Slack topic.

## Special things to note

- Merge risk: **two-way door** — revert the consumer capability and restore the prior Provider pin; **medium blast radius** — optional checked Slack report sends and shared Provider cancellation. Review focus: own identity/Grant, public membership and lease fences, exact receipt association, request-ID deduplication and unknown outcomes; already sent external messages remain external.
- Root plain-text reports in joined public Slack channels only, existing scopes and canonical Outbox; no scheduler, new database, self Inbox admission, echo enrichment or automatic retry. Report publication does not auto-follow a topic. Fixed fork `a0300e97` is independently qualified; upstream merge is not assumed.
- Latest main `4321fdb8`; real Slack → Provider → canonical Inbox → model → same-topic reply passed, including cold restart. Core **2,477 passed / 9 skipped**, Provider **3,561 passed**, post-merge Slack/delivery **91 passed**; final pin regression **8 passed**. Lint/format/typecheck/build/package/docs checks passed. QA remains available with Inbox-only mention reception; this test's shared Channel connector is paused.

## Change outline

```text
Bot bridge_targets → bridge_post(own Grant + stable request ID)
  → checked Provider identity/lease/public-channel preflight
  → one Slack chat.postMessage(channel, text, retry:false)
  → canonical Outbox(text + channel/ts receipt), no local report placement
Human @ reply under that report
  → canonical Source Event + one Bot Inbox Admission
  → related report via same account/fingerprint/channel/root ID
  → model bridge_read / bridge_outbox → bridge_reply(original thread)
```

```diff
- Optional proactive receipt exposed only for Lark
+ Expose it for qualified Slack accounts through the existing versioned contract
+ Native Slack channel/ts/thread_ts mapping; no fabricated Lark parentId
+ Pin exact Provider source and runtime bytes; preserve existing unknown/dedup semantics
```

### Existing Outbox entry point — Chinese, dark, 1230 × 820

Client components and copy are unchanged; these matching captures show the existing entry point before the first Slack report and after the real operation.

**Before** — prior accepted replies, no report from this test.

![Before report operation](https://raw.githubusercontent.com/BotHarness/BotHarness/codex/863-slack-report/docs/assets/pr/863-slack-report/before-outbox.jpg)

**After** — one report and its two same-topic answers, with the Human replies in Bot Inbox.

![After report operation](https://raw.githubusercontent.com/BotHarness/BotHarness/codex/863-slack-report/docs/assets/pr/863-slack-report/after-outbox.jpg)

**Restart** — the saved report and original native receipt remain available.

![Report receipt after restart](https://raw.githubusercontent.com/BotHarness/BotHarness/codex/863-slack-report/docs/assets/pr/863-slack-report/restart-receipt.jpg)

**Follow-up** — the external source Modal associates the fresh Human reply with the original report.

![Source and associated original report](https://raw.githubusercontent.com/BotHarness/BotHarness/codex/863-slack-report/docs/assets/pr/863-slack-report/restart-source.jpg)

**Native Slack** — the sole report root and same-topic replies, including `BH863-FINAL-OK` after the final fixed Provider restart.

![Native Slack round trip](https://raw.githubusercontent.com/BotHarness/BotHarness/codex/863-slack-report/docs/assets/pr/863-slack-report/native-final.jpg)

Issue: #863
Agent-Task: codex/local/01a0f14c-5338-7020-853b-0fe54b87aa95
Agent-Claim: https://github.com/BotHarness/BotHarness/issues/863#issuecomment-5992078103
