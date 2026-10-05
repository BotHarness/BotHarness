# Slack native topic follow / exit — #854

## Revision and boundary

- Latest-main comparison: `2c767e30dcfbccc5ec78c3939b66327ed477e401`.
- Integrated implementation: `49872217` (includes feature `ea5b12fa`). Final evidence/font commit adds no runtime behavior.
- Provider: fixed DoodleBears/dsh-im `48e7a35792af5222cd40cfe1ba2607ac55a59df2`; DSH `0.2.0-rc.1`.
- Authorized public Slack QA channel only, existing own Bot identity and credentials. No new permissions, app, credential, migration, store or receiver.
- Slack keeps message `ts` distinct from native `thread_ts`; root equals thread and there is no fabricated parent ID. Lark keeps its own native thread/root/parent contract.

## Real end-to-end qualification

1. A Human @ source reaches the checked exclusive Provider, canonical Source Event, shared Channel placement and own Bot Inbox. Real model replies to the original native thread. Reply alone does not follow.
2. A real unmentioned child establishes current-lease delivery proof without admitting the message under mention-only collection. A root or another thread cannot provide that proof.
3. Real model explicitly follows with 2-message / 60-second digest. Two ordinary replies enter the existing canonical shared Channel and Inbox admission snapshots, then one digest turn replies in the same native topic.
4. Cold restart retains the durable policy. The current lease requalifies ordinary child delivery; one sparse child wakes after the 60-second interval and gets a native reply.
5. Human uses the Profile Modal to exclude. Ordinary text is rejected; the real model's follow attempt returns `human-thread-override`. The @ source still allows an explicit original-thread acknowledgement.
6. Human restores inheritance; the real model follows and then explicitly exits. The next ordinary child is excluded by the original mention-only group rule.
7. Integrating latest main preserves the new Inbox layout. A fresh @ source is read by the real model, policy list confirms inheritance, and `BH854-INTEGRATED-OK` returns in the exact original thread. A fresh unmentioned child requalifies the final receiver lease without Inbox admission.

[e2e-proof.json](e2e-proof.json) contains only public-safe synthetic QA evidence: 8 handled sources, 7 exclusion probes with zero canonical sources, 5 immutable policy revisions and 7 independently checked own-Bot/native-thread receipts. Exact matching tool-call/result excerpts demonstrate the Human override refusal. Initial qualification used main `751d8887`; final integrated check and before/after screenshots use main `2c767e30`. Supplementary digest/exclude screenshots retain the initial qualification state.

## Screenshot provenance

- `before-latest-main.jpg`: actual Chrome capture of exact latest main; managed connector Grant hides the thread controls.
- `after-latest-main.jpg`: actual integrated feature capture, same 1230 × 820 viewport, Chinese locale, dark theme and authorization section position.
- `source-details-latest-main.jpg`: final canonical source Modal, preserving native message timestamp, topic timestamp, sender ID and Source Event ID.
- `after-modal-latest-main.jpg`: final integrated topic Modal, inheritance restored and ordinary delivery requalified.
- `after-follow-modal.jpg` / `human-exclude.jpg`: actual working policy and Human override during initial real E2E.
- `slack-native-exit.jpg` / `slack-native-integrated.jpg`: native Slack thread exit / final integrated reply.

## Automated validation

- Integrated latest-main regression: 128 PASS across Slack topic, Slack intake, general intake, Profile, activity, Inbox layout and avatar tests.
- Prior consolidated focused regression: 122 PASS, including the harvest / Human DM files below, without changing assertions or timeout settings.
- First full-suite run: 2466 PASS, 9 SKIP, 5 FAIL due to existing 15-second timeouts (four harvest cases and one Human DM case) under high concurrent machine load. The unchanged affected files subsequently passed all 17 tests in isolation and in the 122-test consolidated run. This is not a full-suite green claim.
- Lint, formatting, typecheck, changelog checks, Host/Client build: PASS.
- Latest-main OG font regeneration and bilingual docs build: PASS (322 pages).

## Human QA

The retained isolated app at port 32604 is on the integrated feature. Open Slack Intake QA #802 → detailed Profile → channel connector authorization → topic management. The Slack source topic is in the authorized `botharness-im-qa-802` channel. Its current policy is inherit, Bot-edited revision 5; the connector remains mention-only. Follow or exclude through the Modal, or @ the Bot to explicitly select/leave this topic, then send ordinary text and inspect canonical activity.

Proactive Slack post and private channel/DM, edit/delete, ordinary file, global search or gap-backfill qualifications remain outside this ticket. Each future slice requires its own real verification.
