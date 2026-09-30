# #78 Lark work-group provider qualification

Run: **2026-10-01, Asia/Tokyo**. This is real-platform E2E evidence for the **public dshIm provider contract**. The test group contained only the Human and the test Bot. This research does not claim PersonaBot Inbox/Orchestrator or BotHarness Outbox integration.

## Result and evidence

| Check                                                             | Result                     | Evidence                                                                                                                |
| ----------------------------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| User @Bot in ordinary work group → checked quoted reply           | PASS                       | Source 1 and its platform receipt; ACK visible in Lark                                                                  |
| User @Bot inside an existing topic → reply in the same topic      | PASS                       | Source 2 has thread/root/parent; receipt has matching chat/thread; ACK visible in Lark topic                            |
| Substituted group/topic rejected before an external effect        | PASS                       | `staleGroupRefused`, `staleTopicRefused`; no fallback send                                                              |
| Same account consumer mode survives cold Host restart             | PASS                       | Previous two sources preserved, no automatic resend; source 3 is a new user @message accepted and replied after restart |
| Real provider redelivery, crash during send, offline gap recovery | UNVERIFIED                 | Repeat-delivery and uncertain-attempt safety are fixture tests; no such live failure was induced                        |
| Feishu tenant, other-Bot delivery, recall/edit/attachments/cards  | UNVERIFIED                 | Official capabilities recorded separately; this sandbox uses Lark user text                                             |
| PersonaBot Source Event/Inbox/Orchestrator/Outbox integration     | NOT IMPLEMENTED by this PR | Subsequent #12 tracer bullet                                                                                            |

- [Recorded provider results](public-result.json), [independent platform receipt comparisons](platform-verification.json), [qualification summary](qualification.json).
- [Browser report](report.html) renders these recorded results. [Screenshot](e2e-report.jpg) was captured from the actual browser report using computer-use tooling; it is not a mockup or a screenshot of a PersonaBot product feature.
- Raw native IDs, account identities, credentials, cookies, login/invite URLs and unrelated Lark chats remain local. Public booleans compare exact IDs before redaction.
- Two transient `acquire/unknown-bot` observations occurred while provider Registration initialized during the cold restarts. They remain in the evidence. Exclusive acquisition subsequently recovered and a fresh post-restart message was received/replied; these observations are not hidden as zero errors.
- The probe is a task-owned test Plugin, absent from the production Bundle. Its atomic file is qualification evidence, not the BotHarness Messaging database. `committedBeforeAcceptance` means that file was flushed before the consumer Promise resolved, not that an Inbox Admission committed.
- Platform success means **accepted**. Independent GET and desktop observation verified these particular ACK messages exist; no delivered/read-status guarantee is asserted.

Pins: DSH `0.2.0-rc.1`, Node `v24.21.0`, installed SDK `1.73.0`, BotHarness base `a3d88bbab25d2479ae435c9a8c1441c747cea20e`, inbound provider fork [`19d88f14bf85d74d4abf035a0c749d0b4a640257`](https://github.com/DoodleBears/dsh-im/tree/19d88f14bf85d74d4abf035a0c749d0b4a640257). `public-result.json` records the exact probe SHA-256 loaded by the recorded E2E Host, before the later asynchronous cleanup correction. The recorded JSON and screenshot remain unchanged; two regression tests separately verify that disposal during account lookup or lease acquisition prevents retained ownership. This correction does not claim a new real-platform run. The fork is not an accepted/released upstream capability.

## Repeat in a fresh isolated Profile

1. Check out the provider fork at the full pinned SHA above; install its frozen dependencies, build and verify its package. Use the repository's [DSH dev loop](../../../client-bridge.md) and worktree-pinned CLI. Create a **fresh** DSH_HOME; do not reuse another task's Profile or migrate its database.
2. Install the provider in that Profile with dependency `@xmanrui/dsh-im: link:<absolute checked-out provider directory>` and its Bundle. Configure the same test app through dsh-im's settings with credentials stored by DSH. Enable Bot capability, subscribe to `im.message.receive_v1`, and grant the current brand's group-mention, message-read and Bot-send permissions. If an app requires additional scopes, prepare them with the Human; this run did not expand the app's permissions.
3. Stop only the exact task-owned Host using this same app before another Host acquires its SDK connection. Leave unrelated Profiles alone. Do not start an independent CLI event listener: provider events are clustered across connections rather than broadcast.
4. Create a private group containing only the testing Human and this Bot. Obtain that Human's app-scoped open ID, this group ID and the provider's opaque `botId` through its public setup surfaces. Keep them local in a task-owned configuration (replace placeholders, never commit):

   ```json
   {
     "providerBotId": "opaque-provider-bot-reference",
     "groupId": "private-test-group-id",
     "allowedActorId": "testing-human-app-scoped-open-id",
     "reportPath": "/tmp/your-private-qa/private-result.json",
     "publicReportPath": "/tmp/your-private-qa/public-result.json"
   }
   ```

   Use a private directory and `umask 077`. Block standalone execution until the exclusive consumer owns the test account. Keep unrelated apps in their existing mode.

5. Add this opt-in Host Plugin to the isolated Profile's `cordis.patch.yml` and restart through the helper:

   ```yaml
   - insert:
       - id: botharness-lark-provider-contract-e2e
         name: <absolute BotHarness checkout>/scripts/e2e-lark-provider-contract.mjs
         config:
           testConfigPath: /tmp/your-private-qa/probe-config.json
   ```

   Wait until the public report shows `authenticatedAccount:true` and `publicExclusiveConsumer:true` for the current runtime. Capability failure, mismatched fingerprint and corrupt saved evidence fail closed; never use a legacy consumer silently. The probe intentionally performs bounded stale-route refusal probes in this isolated group before a real checked reply.

6. In the Lark client, select this Bot from the real `@` picker and send `[BH78 ROOT] provider contract qualification` in the group main stream. Expect one `[BH78 ROOT] ACK` reply. Verify `threadPresent:false` for the ordinary source and `provider-accepted` with a receipt.
7. Create an actual topic from that root using the explicit test setup below (or the client topic control); a flat reply's “reply detail” view is not enough. Use the **same explicit CLI app Profile**; concurrent sessions can change the CLI default app, which is not account evidence:

   ```bash
   lark-cli --profile <test-app-profile> im +messages-reply \
     --as bot --message-id <verified-root-message-id> \
     --text '[BH78 SETUP] existing topic anchor' --reply-in-thread \
     --idempotency-key <one-stable-task-owned-key>
   ```

   This requests topic creation, independently of the provider's flat-root reply policy. Preserve unknown setup results without blindly creating a new key. Open the **topic**, select the real Bot mention and send `[BH78 TOPIC] existing-topic contract qualification`. Expect one topic ACK and matching thread/root/parent evidence, plus stale-topic refusal.

8. Cold-restart only this task's Host using the helper, retaining its Profile and evidence. Check the current consumer reacquires and previous source/receipt records remain unchanged. Send a **new** root message `[BH78 ROOT] after cold restart`; its accepted-in-current-run flag must be true. This proves new receive after restart, not provider replay of an older event.
9. Read the exact returned ACK IDs with `lark-cli --profile <test-app-profile> im +messages-mget --as bot --message-ids <receipt-IDs> --no-reactions`. Compare each receipt's message ID, chat/thread, application sender, non-deleted state and marker with the private source evidence **before** reducing them to public booleans. Check the Lark UI shows ROOT and TOPIC ACKs in their proper locations.
10. Run `pnpm exec vitest run scripts/test/e2e-lark-provider-contract.test.mjs`, required repository checks, and inspect the public report for secrets or native IDs before publishing. Capture a clearly labelled real-result screenshot; keep native screenshots containing unrelated chats private. Remove the probe Patch and stop the exact test Host when the Human finishes QA; external-consumer mode must not silently fall back to standalone execution.

The fixture tests cover the probe's commit-before-acceptance barrier, message identity deduplication, scope refusals, exact topic route, disposal, unknown no-retry, persisted attempt recovery and corrupt-record refusal. They do not replace the real platform steps above.

## Human QA for this PR

Open **BotHarness IM QA #78** in Lark. Check the root ACK and the topic ACK. With the retained isolated Host running, select the real test Bot mention and send a new `[BH78 ROOT]` message or a `[BH78 TOPIC]` message inside the prepared topic; each should receive exactly one matching ACK in place. Ordinary unmarked messages intentionally do not run a PersonaBot. This is the #78 provider qualification gate; #12's PersonaBot behavior comes after approval.
