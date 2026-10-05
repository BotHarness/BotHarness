# #824: real Lark onboarding evidence

## Revisions and installation

- Current-main visual baseline: `2c767e30dcfbccc5ec78c3939b66327ed477e401`.
- Initial implementation/application run: `fd78c98119d00d58524609a09b5a23a9ac7bfc68`, qualified packed product `0.0.0-test.824.6`.
- Final runtime code: `c2a1f7cb` (plus the test request-ID length correction; no runtime difference), qualified packed product `0.0.0-test.824.7`.
- Provider: `4.32.0-botharness.2`, source `48e7a35792af5222cd40cfe1ba2607ac55a59df2`; DSH `0.2.0-rc.1`.
- Product installed Core, Client and Provider together. No separate SDK receiver, Human CLI identity or successful state injection.

## Real application sequence

The fresh company-built application **BotHarness Onboarding QA #824** was created in the real Lark console. Bot capability and only the three initial Tenant scopes were enabled: `im:message.group_at_msg:readonly`, `im:message:send_as_bot`, `im:message:readonly`. An active local connection preceded saving persistent connection and `im.message.receive_v1`. Version 1.0.0 was released/approved, limited to the operator, then added only to **BotHarness IM QA #78**.

Actual native settings were used for credentials, target Test/Save, PersonaBot Binding and explicit group authorization. Initial conversation discovery did not immediately supply a target and used the Provider's standalone Session before Binding; this is not canonical acceptance evidence. The already verified native group Chat ID was used only as manual target input. The guide documents this limitation.

The default remained Inbox-only and mentions-only, with global v0 policy inherited. No Human DM transcript placement was configured. The existing Channel connector projection of Inbox-only reception is not a DM placement.

The sequence is illustrated by `apps/docs/public/guides/lark/18-new-app-minimum-scopes.webp` through `26-new-app-cleaned.webp`. Images 23–26 were refreshed from the final packed run. They are real captures; the topic image is cropped to exclude unrelated conversations. App Secrets and login URLs are absent. Earlier #823 video remains explicitly labelled reference material.

## Final source/reply proof

- Source: `im-bb3646b07c5532f8a2bfdc1c631fdb0d6143fe08589ee47aa5ad408bf708a3f1`.
- Provider account: `bot_b840d575f47c49788da36eb631837f0a`.
- Receiving PersonaBot: `bot-586eee355bc444eebe16a2f055cb022e`; Inbox reason `group-mention`, state `handled`.
- Grant: `d6b89228-7c30-4730-ac1e-5452e5c2c34e`; saved target `tgt_4a460c2b7e1a6b19`.
- Source topic: `omt_19a6ee732e4f1947`.
- Outbox: `cdb22648-0174-4ebc-84a5-f8359bc383d2`, `provider-accepted`.
- Reply: `om_x100b6302afbebca4eecba99df1ed4d8`, actual `LARK-SETUP-OK` under the application identity in the same native topic.
- Both designated unmentioned markers (`BH824 NOAT ROOT`, `BH824 FINAL NOAT`) have zero canonical source rows.

No own echo was observed; Provider acceptance and the separate visible topic check are recorded without claiming an echo or external read receipt. Green/grey Lark circles are not receipt evidence.

## Recovery and cleanup

Close/reopen retained selection and current configuration. Same-home Host restart retained canonical history and configuration after refreshing/selecting the account. Identity disable reverted identity/grant/verification; enable restored it. Revocation reverted grant/verification. Unbind reverted identity/grant/verification. Final run without a selected target did not mark target/grant/verification successful, and the new Grant could not reuse the revoked Grant's earlier success. Selecting the exact target and receiving its new correlated reply confirmed it.

After each run, exact-group authorization was revoked, the identity unbound and native **Remove integration** confirmed. The UI explicitly reported no connected application bots; that operation stops the receiver and removes local configuration and credentials. The external application remains. Resetting its external credential is a Human administrator action and was not performed.

## Visual comparison and review path

`before-dark.webp` / `after-dark.webp`: 1230×820, Chinese, dark theme, same actual QA Profile/Bot/source records, no bound identity after cleanup. Before has no setup entry; After adds the entry above External identity. The same existing identity row is aligned by scrolling into view. Main baseline and PR code ran serially against this same cleaned Profile, never as simultaneous receivers.

Earlier checkpoint runtime checks verified English/Chinese, light/dark, actual 520×827 shell, reduced-motion tour behavior, Escape and focus restoration. Final packed runtime verified the explicit group selector, real Modal navigation, exact target and completion/reopen behavior. A final narrow recheck could not be captured: Chrome viewport override did not change this tab (observed width remained 1230), and a fresh IAB localhost preview was blocked by the browser. No alternate access workaround was used. Human QA should repeat 520×827 and light/English views for the added target selector; this limitation is not represented as a passed current narrow check.

Human review: open a PersonaBot detailed Profile → Setup guide. Select Lark/Feishu, a connected account and a saved group. Locate each operative control; dismiss/reopen using keyboard. With two saved groups, a success in A must not confirm B. Send the exact displayed test in a native topic and a separate unmentioned message. Verify canonical Inbox, own-identity topic reply, then disable/unbind/revoke/remove to see relevant steps become pending.

## Automated verification

On main integration plus the final runtime/test fixes: lint (existing warnings), format, typecheck, 306 passing files / 5 skipped, **2480 passing tests / 9 skipped**, build and both bilingual release-ledger checks passed. Focused target/receipt regression: **96 tests passed**. Bilingual website build: **322 pages**. Checks do not replace Human visual acceptance. No merge, public npm publication or deployment is authorized by this PR.
