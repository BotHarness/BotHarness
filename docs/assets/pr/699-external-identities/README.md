# External identity lifecycle QA — #699

Baseline: latest main `259023324e37df966bb28a622020f2b39b53f8d7`. After: the #699 branch integrated on that baseline. Both use the pinned DSH runtime and native UI primitives. Screenshots were captured through Chrome at 882 × 827 in light/dark themes. Baseline is an isolated offline profile copied from the same QA data, without provider credentials or another receiver; its model catalog therefore differs. No 390-pixel mobile qualification is claimed.

## Real verification

One existing authenticated Lark application Bot, the existing BotHarness IM QA group and its existing topic were used. No new account, app permissions, or credential store was created.

1. Edit the identity display name in the PersonaBot Profile. A real mentioned message entered canonical Source Events and Bot Inbox; the model used `bridge_reply`, producing platform-accepted `BH699-BEFORE-OK`.
2. Pause the identity. A send was refused as `identity-paused`; the designated mentioned message produced no Source Event and no reply. Its grant and historical messages remained intact.
3. Restart the isolated Host: the name and paused preference persisted. Try a stale Modal edit: the saved revision is rejected, the typed value stays visible, and closing restores focus.
4. Resume through the native Switch after current account/scope validation. The real model returned `BH699-RESUMED-OK` in the original Lark topic; independently observed in the Lark client.
5. Review the unbind impact Modal and unbind. The old grant is revoked, 63 Source Events and previous accepted replies remain, and the dsh-im account stays configured. Bind the same authenticated account through the Modal: identity count becomes one, active grants remain zero, and no receiver is authorized automatically.
6. Explicitly restore the same QA group authorization and mentioned-message receiving. A real model response `BH699-REBOUND-OK` is platform-accepted and visible in the Profile. The old revoked grant stays revoked; the replacement uses the same target and Inbox-only placement.

`real-rebound-outbox.jpg` shows the three actual model sends; this is platform acceptance, not a claim about Lark read receipts. The independent Lark-client check covers the resumed response. A separate CLI shortcut readback for the rebound response was not completed because its name-enrichment path requested an additional contact scope; no permission was expanded.

## Automated checks

Latest-main complete suite: **1958 passed / 2 skipped**. Identity/RPC/inbound focused coverage: **62 passed**. Final identity UI coverage: **5 passed**. Lint (existing warnings), source policy, formatting, typecheck, build, both release ledgers and ADR numbering passed. Skipped tests remain skipped.

## Human path

Open the running QA page on port 32602, choose IM Artifact QA → PersonaBot Profile → External identities. Exercise Edit, Switch, Reconnect, Bind and Unbind. The real provider and the original QA group are restored. Bind is account-only; target authorization and intake remain explicit under Channel Bridge. A Group Profile has no identity table. Avoid unbinding the shared receiver unless intentionally repeating the test.

## Recovery

Schema generation 49 adds lifecycle columns to the existing bindings authority. Restore a pre-migration database snapshot with its matching binary, or forward-fix; reverting code alone against generation 49 is not a supported rollback. Task-private pre-migration and pre-unbind backups were retained locally, outside Git. Screenshots contain test UI only; login URLs, cookies, credentials and private chat history are excluded.
