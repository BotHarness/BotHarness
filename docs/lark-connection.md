# Connect a Bot to Lark / Feishu

Install the plugin first using the [illustrated installation guide](/docs/installation), then return here after a local Bot DM works.

Connect a PersonaBot to a work group: connect the application bot, bind its identity and authorize a group, then choose whether incoming messages belong in the Bot Inbox or a local Channel.

This guide starts with **Lark international, an application bot, a test group and mentions-only intake**. Feishu uses the same sequence, with a Feishu application and the Feishu platform selected.

## Understand the three settings

| Setting                   | Location                    | Purpose                                                     |
| ------------------------- | --------------------------- | ----------------------------------------------------------- |
| IM application connection | Settings → IM Bots → Feishu | Connect this Host to a Lark / Feishu application bot        |
| External identity         | PersonaBot detailed Profile | Choose who this Bot speaks as externally                    |
| Channel connector         | Channel detailed Profile    | Choose which external group and messages enter this Channel |

**Binding an identity still requires explicit group authorization.** It does not receive every group automatically, and a connector does not lend that identity to other Bots.

This guide combines actual setup controls with a Profile that completed real Lark connection. Configured captures come from the #823 qualified product (`0.0.0-test.823.6` / Provider `4.32.0-botharness.2`), using the dedicated “BotHarness IM QA #78” group. Empty forms show where to enter values; they are not proof of connection. No App Secret appears in the media. Use the browser image menu to view the original size.

## 1. Prepare your environment

You need:

- Membership in a Lark / Feishu organization and permission to create and publish a company-built application, or an administrator who can help.
- A test group and a Human account that can send messages in it.
- A running BotHarness, a working model and a PersonaBot. Confirm the Bot can answer a local DM first.
- A BotHarness product containing the qualified IM Provider. The product installs Core, Client and Provider together; **do not separately install a Lark SDK, Human lark-cli or an arbitrary dsh-im version**.

**The public npm product has not been published.** The reproducible path currently builds local product packages; these test versions are not npm installation commands. If you already have the #823 qualified artifacts, start the same Profile and continue to the next section.

<details>
<summary>Current source preview: build the qualified single-install product</summary>

Use Node ≥22 and pnpm 12.4.2. Pin the qualified revision in a new checkout rather than switching a running checkout:

```bash
git clone https://github.com/BotHarness/BotHarness.git botharness-lark
cd botharness-lark
git checkout c2a1f7cba13d1ba82e1b9e9b3b923babe428c0e7
git clone https://github.com/DoodleBears/dsh-im.git /tmp/bh-lark-provider
git -C /tmp/bh-lark-provider checkout 48e7a35792af5222cd40cfe1ba2607ac55a59df2
npm ci --prefix /tmp/bh-lark-provider --ignore-scripts --no-audit --no-fund
pnpm install --frozen-lockfile
pnpm build
node scripts/product-artifacts.mjs \
  --provider-source /tmp/bh-lark-provider \
  --output /tmp/bh-lark-product \
  --version 0.0.0-test.lark-guide
node scripts/dev-instance.mjs \
  --home "$HOME/.local/share/botharness-lark" \
  --port 32620 --product-artifacts /tmp/bh-lark-product
```

</details>

Open the launcher's private login URL locally; never include it in screenshots or video. Reuse the same `--home` to retain accounts, authorization and message records. Only one Host should receive events for an application. See the [product installation notes](https://github.com/BotHarness/BotHarness/blob/c2a1f7cba13d1ba82e1b9e9b3b923babe428c0e7/docs/product-im-installation.md) for packaging details.

## Video: connect, authorize and verify a message

This is a **step-by-step edit of actual UI screenshots**, not an uninterrupted recording or simulated connection success. Pause, seek or enable English/Chinese captions. The video downloads only when requested.

<video controls preload="none" playsInline poster="/guides/lark/06-connected.webp" style={{width: '100%', maxHeight: '640px'}}>
<source src="/guides/lark/lark-setup-walkthrough.mp4" type="video/mp4" />
  <track kind="captions" src="/guides/lark/lark-setup.en.vtt" srcLang="en" label="English" default />
  <track kind="captions" src="/guides/lark/lark-setup.zh.vtt" srcLang="zh" label="中文" />
</video>

[Download video](/guides/lark/lark-setup-walkthrough.mp4) · [English captions](/guides/lark/lark-setup.en.vtt) · [中文字幕](/guides/lark/lark-setup.zh.vtt)

Chapters: 0:00 App credentials and permissions → 0:32 Local connection → 0:48 Events and publishing → 1:12 Delivery target → 1:20 Identity and group authorization → 1:36 Message source. The executable steps remain below.

## 2. Prepare an application bot

For Lark, open the [Lark developer console](https://open.larksuite.com/app); for Feishu, open the [Feishu developer console](https://open.feishu.cn/app). The account, organization and application must belong to the same platform.

1. Create a **company-built application** with a recognizable name, such as “Team assistant.” A custom group Webhook bot is a notification mechanism, not the two-way application bot used here.
2. Add the **Bot capability** and find the App ID and App Secret under the application's credentials.
3. Configure message permissions for the **application identity**. Human QR-login permissions cannot replace them.
4. Use a **long connection** for events and subscribe to `im.message.receive_v1`. If the console requires an active connection first, complete the next section, then return to save the subscription.
5. Publish an application version, complete any administrator approval and availability configuration, and add the application bot to the test group.

Enable permissions by purpose:

- `im:message.group_at_msg:readonly`: receive group messages mentioning the bot; needed for the initial intake test.
- `im:message:send_as_bot`: send and reply as the application bot; needed for the initial reply test.
- `im:message:readonly`: read messages and message resources; needed for original-message and attachment reading.
- `im:message.group_msg`: obtain all group messages; needed for ordinary-message intake, group history and topic following. Request this sensitive permission when needed.
- `im:resource`: upload images and files; needed when sending attachments.

Your organization determines availability and approval requirements. Even with all-group-message permission, BotHarness only processes explicitly authorized groups and configured intake conditions. See the official [message receive event](https://open.larksuite.com/document/server-docs/im-v1/message/events/receive) and [message history API](https://open.larksuite.com/document/server-docs/im-v1/message/get-2).

### Compare the actual console configuration

![Fresh onboarding application with only the three initial application scopes added](/guides/lark/18-new-app-minimum-scopes.webp)

_This fresh application was created through the Lark console for the #824 onboarding test. All three scopes use Tenant token, with status Added. The top banner still says Pending release: adding scopes alone does not make them effective. Establish the local connection, save the message event subscription and publish the version before testing group intake. All-group-message access is not enabled in this example._

The following older captures are read-only references from an already published test application. A new app still needs its own capability, scope requests, publication and administrator approval. Do not copy all of this test application's scopes or events.

![Actual credential settings with the App Secret hidden](/guides/lark/09-credentials.webp)

_Open Credentials & Basic Info. Copy the secret privately into local settings; keep it hidden in screenshots._

![Application with the Bot capability added](/guides/lark/10-bot-capability.webp)

_Add Bot under Add Features; the Bot settings entry appears in the sidebar afterwards._

![Application-identity message scopes filtered by Tenant token](/guides/lark/11-message-permissions.webp)

_In Permissions & Scopes, search a scope name and select Tenant token scopes under Type. `im:message.group_msg` is sensitive; request it for ordinary intake, group history or topic following when needed. Pin and reaction scopes shown here are not requirements of this guide._

![Application-identity send permission](/guides/lark/12-send-permission.webp)

_Search `im:message:send_as_bot`; check Tenant token and Added, then publish the change for it to take effect._

![Actual event settings using persistent connection](/guides/lark/13-long-connection.webp)

_Open Events & Callbacks → Event Configuration and choose persistent connection for Subscription mode. The product's Provider owns this connection; a separate SDK receiver process is unnecessary._

![The message receive event is subscribed](/guides/lark/14-message-event.webp)

_Check `im.message.receive_v1` and Tenant token under Events added. Read receipts, reactions and meeting events shown here are not required or used by this guide._

![Published application version](/guides/lark/15-published.webp)

_Create and release a version under Version Management & Release, completing organization approval. Released and the published banner show this example's completed state._

## 3. Connect the application locally

1. Open **Settings → IM Bots → Feishu** at the lower left.
2. Open **Manual setup** and select **Lark (international)**. Select Feishu for Feishu credentials; do not mix platforms.
3. Enter the App ID and App Secret privately, then click **Bind and connect** (绑定并连接 in Chinese).
4. Confirm the account is connected. If you just changed subscriptions or permissions, publish them in the console before checking again.

![Lark manual connection form in IM Bot settings, with empty credentials](/guides/lark/01-provider.webp)

_Figure 1: Select international Lark for a Lark application. Enter secrets only in local settings, never in chat, Git or public screenshots. Feishu QR onboarding and Lark CLI Human login are separate flows; this guide uses application credentials._

![Actual test application connected to the Provider](/guides/lark/06-connected.webp)

_Figure 1b: A green online status (运行正常 in Chinese) proves transport connectivity. Identity binding, group authorization and correlated message/reply verification are separate checks._

Next, configure a **delivery target** for this account:

1. Open the connected bot's settings, then **Delivery targets → New target**.
2. Choose the test group from **Choose from conversations you have chatted in**, checking its name and Chat ID; alternatively, enter its native platform group ID (`oc_…`) manually. A group name or message ID is not a Chat ID.
3. Set a call alias such as `lark-test-group`, click **Test**, confirm the test message in Lark, then **Save target**.

A fresh application may have no conversation suggestions. In the #824 test, a preliminary @mention did not immediately populate this list and used the Provider’s standalone Session before PersonaBot binding. Enter a verified native group Chat ID manually, then Test and Save; ask your group administrator for the ID if needed. A standalone reply or discovery message is not canonical BotHarness receipt.

![Actual saved group delivery target](/guides/lark/16-delivery-target.webp)

_Account settings → Delivery settings → Delivery targets. Testing and saving a target checks the sending destination; PersonaBot identity binding and authorization come next._

## 4. Bind a PersonaBot identity and authorize the group

In **Bot mode**, open the intended Bot DM, click its name at the top, then **View details** to open the detailed Profile. Open **Setup guide**, select the application platform, IM account and saved group target. Each group is verified separately; another group’s successful reply cannot verify this group. Locate controls opens or highlights actual settings; committed configuration and correlated receipt/reply determine completion.

![Annotated identity and group setup: bind identity, authorize the specific group, then optionally add a Channel connector](/guides/lark/05-identity-routing-annotated.webp)

_Walkthrough: 1 Bind identity → 2 Authorize the specific group → 3 Optionally connect a Channel. This is an AI-assisted annotated composite of the screenshots, showing an unconnected demonstration account; the original UI screenshots remain below for comparison._

1. Under **External identities → Bind identity**, select the connected application in **IM account** and save.
2. Expand **Channel connectors and authorization**, selecting that IM account and the saved **send target**.
3. Click **Bind and authorize this target**. Check the group, account and local intake destination.
4. For the first test, retain **This Bot's Inbox only** and **mentions only**. This needs no additional local group and does not add messages to the Bot DM history.

![PersonaBot identity binding dialog before an IM account is configured](/guides/lark/02-identity.webp)

_Figure 2: The identity belongs to the PersonaBot. If the selector is empty, check the application connection, Provider version and saved target. Human QR login is not Bot identity binding._

![PersonaBot Profile before external identity and group authorization are configured](/guides/lark/03-authorize.webp)

_Figure 3: Bind the identity, then authorize a specific group under Channel connectors and authorization. The demonstration has no account yet, so authorization controls are unavailable._

![Actual bound Lark identity and authorized group, using Inbox-only and mention-only collection](/guides/lark/07-granted.webp)

_Figure 3b: The real test group is authorized and reception is connected. Ordinary-message collection remains disabled; policy inheritance and collection scope are separate fields._

Each Bot can bind multiple platforms, with one identity per platform. It uses its own identity across local Channels. Other Bots in a shared Channel need their own identity and target authorization to reply externally.

## 5. Optional: display messages in a local Channel

Skip this section if you want Lark conversations to enter only the Bot Inbox. For a local team timeline, open an existing Group Channel's detailed Profile and add the receiving Bot as a member first. You can also route the source into a Bot DM's message history.

Under **Channel connectors → Add channel connector**:

1. Select the **authorized Lark group**. This does not create an account or grant new group access; return to the preceding section if the list is empty.
2. Check the **delivery destination**: shared Channel, DM message history or Bot Inbox only. Choices depend on the current Channel.
3. Enter a recognizable **connector name**, such as “Lark team group.”
4. Retain **Inherit global defaults**, or explicitly choose **mentions of the receiving identity only**, enable intake and save.

![Channel connector dialog with source, destination, name and intake condition](/guides/lark/04-connector.webp)

_Figure 4: Source, destination and intake condition are separate choices. Saving is unavailable in the demonstration until a real group is authorized._

A Channel can receive several sources, and a source can route to several destinations. **Connectors decide what is received; each member Bot's Attention / wake policy decides when it is processed.** External messages show the source name above the bubble; clicking it opens details. Ordinary local replies are not automatically broadcast to Lark.

Adjust advanced behavior after the first successful test:

- Manage global defaults in **Settings → Bot settings**. Profiles can inherit or override them; changes affect future messages and do not import past history.
- For ordinary messages without mentions, publish the required application permission and subscription, send an unmentioned message in the authorized test group, and refresh the verification result. All-message intake stays unavailable until genuine ordinary-message delivery is verified.
- Choose count/time harvest or per-message wake in group intake and wake settings. Inbox admission does not require an immediate reply; the Bot can decide whether to participate.
- Receiving unmentioned replies in a topic requires explicitly following that topic; replying once does not automatically follow it. The platform must actually deliver those events to the application.
- A connector's Switch pauses intake while preserving configuration and history. Deleting it does not remove received messages. Unbinding an identity is separate and affects that Bot's external behavior using it.

## 6. Verify the complete path

Start with a small test: **mention the application bot** in the authorized Lark group and send “Please reply here with LARK-OK.” Avoid testing several Bots or routes at once.

Confirm each result:

1. The message appears in the Bot DM's right-hand **Bot Inbox**, with the correct Lark group source, original sender and content.
2. Source details show the external message ID, Source Event ID and topic information when present.
3. Lark receives `LARK-OK` from this Bot's own application identity in the original conversation. A topic test should reply in the same topic.
4. With default mentions-only intake, send an ordinary unmentioned message and confirm it does not create ordinary intake for this Bot. Explicitly followed topics use their topic policy.

**Lark's green or gray read circle does not establish whether a Bot received a message.** Use the local Inbox source record and actual external reply.

![Real source details, native message ID and Source Event ID](/guides/lark/08-source.webp)

_In the Bot DM sidebar, expand Bot Inbox → group; if the message is already handled, expand the processed/ignored section too. Click the message to open its Modal, then expand Source details and Message details. This example retains real topic and message identifiers; a platform ID appears if the sender name cannot be resolved._

## 7. Request reviewed IM authority in a Lark DM

For this preview, use the `codex/1027-lark-pairing` revision from [#1027](https://github.com/BotHarness/BotHarness/issues/1027), build it and launch an isolated Profile with `scripts/dev-instance.mjs --im-provider`. The older #823 pinned example above does not contain pairing. Never connect the same application on both a production Host and this preview.

This source-preview slice adds **pairing**, the prerequisite for IM management. Sending approval decisions or answers to native questions from Lark is delivered separately; the capability checkboxes here record which operations the reviewed person may perform once those controls are available. Pairing does not change ordinary chat intake.

1. Connect and bind the intended Bot's Lark identity. For private messages, enable `im:message.p2p_msg:readonly`, subscribe to `im.message.receive_v1` and publish the application version. `im:message:readonly` alone does not enable private-message events. Retain `im:message:send_as_bot` for the acknowledgment.
2. Open **Bot mode → Bot name → View details → IM administrator pairing**. Confirm **Pairing receiver ready**. An online application account alone is insufficient. Run only one receiving Host for this application.
3. In the application bot's **private conversation**, send the plain text `/pair`. No API token or copied user ID is required. The request records the sender supplied by Lark; a group command cannot grant management authority.
4. In the authenticated Web page, click **Refresh requests**. Check the receiving account, applicant and request reference. Expand the abbreviated applicant identifier to inspect the full platform ID if needed. If Lark supplies no display name, the page says so; it does not invent one.
5. Within 10 minutes, explicitly select capabilities and click **Approve selected capabilities**, or **Reject request**. Nothing is selected by default. The first applicant receives no automatic privilege. The reference identifies a request; it cannot be redeemed as a credential.
6. Use **Revoke authority** to remove the grant. Revocation takes effect immediately; restarting does not restore it. A later `/pair` creates a fresh request requiring review. Pausing the identity or Bot makes its grants unusable while paused; an existing grant can still be revoked from Web.

An approved grant survives a Host restart and covers **this Bot only**. It grants no other-Bot, approver-management, VPS, DSH API or workspace access. The 10-minute timer applies to pending requests, not approved grants. Ordinary chatting and management authority are separate settings.

If a review or refresh fails, the pairing section shows an error beside its controls. Refresh and recheck the current request before trying again; an error never grants authority.

### Real pairing walkthrough: #1027

These captures come from a real Lark private message and the authenticated Web controls on the source preview, using DSH `0.2.0-rc.1` and the qualified Provider. The shared production application was exclusively received by the isolated test Host during an authorized service outage; the production Host and both IM connections were restored afterward. Full applicant IDs remain collapsed.

**Refresh the incoming request.** The first genuine request has no selected capabilities, and **Approve selected capabilities** is disabled. The receiving account is ready; Lark did not supply an applicant display name, so the page states that explicitly.

![Real Lark request awaiting Web review, with no default capabilities](/guides/lark/pairing/after-pending-light.jpg)

**Select only the capability you intend to grant.** This example selected **Answer formal questions**. After Web approval, the record shows **Authorized** with that one capability and a **Revoke authority** control. Selecting a capability records authority; this pairing preview does not yet provide an IM question-answer control.

![Actual Web approval of only the answer capability](/guides/lark/pairing/after-approved-light.jpg)

[View the same approved record in dark mode](/guides/lark/pairing/after-approved-dark.jpg).

**Restart the same Host to check persistence.** A cold restart retained the approved record and exactly the `answer` capability. The receiver automatically returned to ready. This check did not recreate or approve the request.

![Approved authority retained after a real Host restart](/guides/lark/pairing/after-restart-approved-dark.jpg)

**Revoke before requesting access again.** Clicking **Revoke authority** changed the real record to **Revoked**, cleared its capabilities and removed the revoke control.

![Real authority revoked through authenticated Web controls](/guides/lark/pairing/after-revoked-dark.jpg)

**Send a new `/pair` from the same Lark private conversation.** The new request has a different reference, no capabilities and a disabled approve button; the old request remains revoked. Review it explicitly if access is needed again. In this walkthrough it was left unapproved. The Operational Database recorded no ordinary IM Source Event or Inbox Admission for these pairing commands.

![Fresh real request after revocation, with no inherited authority](/guides/lark/pairing/after-repair-dark.jpg)

[View the light-mode restoration capture](/guides/lark/pairing/after-repair-light.jpg): after the automatic test window ended, the local Web page showed a disconnected-state notice and its last observed request. That capture does not prove the receiver remains online.

**Reject the remaining test request after verification.** Production reception was restored while the local receiver stayed disabled. In authenticated Web, **Reject request** changed the fresh record to **Rejected**. The earlier grant stayed revoked; all test records have empty capabilities, with no approved or pending records left.

![Remaining real test request rejected from Web with local reception disabled](/guides/lark/pairing/after-rejected-dark.jpg)

**If the review window expires**, approval controls disappear. This earlier real request expired without approval; its receiver was deliberately offline while production received the shared application.

![Real expired Lark pairing request in the authenticated Web Profile](/guides/lark/pairing/after-expired-light.jpg)

[View the same expired state in dark mode](/guides/lark/pairing/after-expired-dark.jpg).

If no request appears, check the private-message scope, publication, subscription, identity and receiver status. Reconnecting the identity retries receiver setup. With the qualified Provider used here, disconnecting an application is temporary because its supervisor can reconnect it. For exclusive QA, use a dedicated test application or an explicitly authorized service outage, then restore the production Host. Never leave two Hosts competing for one application.

### Recover a failed pairing refresh

These additional captures use the integrated source preview in a fresh isolated Profile with no external IM application connected. Stopping only that local Host produces a real transport failure: **Refresh requests** shows its error beside the pairing controls while the Channel Bridge card stays collapsed. Restarting the same local Host and refreshing clears the error. This tests Web failure/recovery; it is separate from the genuine Lark request walkthrough above.

![Pairing refresh failure shown beside its controls, light](/guides/lark/pairing/integrated-failed-refresh-light.jpg)

[Dark failure capture](/guides/lark/pairing/integrated-failed-refresh-dark.jpg).

![Pairing refresh recovered after the isolated Host restarted, light](/guides/lark/pairing/integrated-recovered-light.jpg)

[Dark recovery capture](/guides/lark/pairing/integrated-recovered-dark.jpg).

## Troubleshooting

| Symptom                                              | Check first                                                                                                                                                                        |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Application missing or connection fails              | Lark / Feishu selection, organization, App ID / Secret and running Host                                                                                                            |
| Connected but no selectable IM account               | Qualified Provider, online account, tested and saved target; refresh Profile                                                                                                       |
| Group missing from authorized list                   | Bound Bot identity, saved delivery target, explicit authorization in that Bot's Profile and membership in the shared Channel                                                       |
| Mention does not enter Inbox                         | Application bot in the group; application permissions, long-connection `im.message.receive_v1` subscription, published version and approval; local authorization and intake Switch |
| Ordinary or unmentioned topic messages do not arrive | `im:message.group_msg`, genuine event delivery verification, group intake condition and explicit topic following                                                                   |
| History read returns 230027                          | Effective published application group-message permission; Human login permission cannot substitute for it                                                                          |
| Received but no reply                                | Working model, Inbox / wake state, this Bot's enabled identity and send authorization for the target                                                                               |
| No message in local DM                               | Check for Inbox-only routing; it is a valid separate destination, not a lost message                                                                                               |

When requesting help, include the platform, reproduction steps, a public-safe error code and checks already performed. Do not include App Secrets, access tokens or unrelated group messages.

## Fresh application walkthrough: #824

These compressed captures show the actual new application. Version 1.0.0 was released and added only to the designated QA group; account connection, target Test/Save, PersonaBot Binding and exact-group authorization were operated through the UI. The initial single-install product was `0.0.0-test.824.6`; final revalidation with explicit group selection used `0.0.0-test.824.7` (Provider `4.32.0-botharness.2`), with no separate receiver. Earlier #823 images/video remain reference material and do not substitute for this fresh application test.

![New application connected](/guides/lark/19-new-app-connected.webp)

_Online status confirms transport, before canonical Inbox receipt._

![New application event subscription saved](/guides/lark/20-new-app-events.webp)

_Connect locally before saving persistent connection and im.message.receive_v1 if validation fails._

![New application version released](/guides/lark/21-new-app-released.webp)

_Release, approval and availability are separate from local connection._

![New application target tested and saved](/guides/lark/22-new-app-target.webp)

_Confirm the test message in the designated group, then save the target._

![Account, target, identity and authorization confirmed](/guides/lark/23-new-app-guide.webp)

_The first four steps derive from real configuration; tour clicks cannot mark them complete._

![Native topic mention and own-identity reply](/guides/lark/24-new-app-topic-reply.webp)

_The unmentioned root was not admitted; both designated mentions reached this Bot Inbox and LARK-SETUP-OK appeared under the new identity in the same topic. Unrelated conversations were cropped; external read circles are not canonical receipt evidence._

![Source-bound receipt and reply in the actual guide](/guides/lark/25-new-app-receipt.webp)

_The exact [BH-LARK-SETUP] source ends in f708a3f1; its Inbox admission was handled and its correlated reply was provider-accepted. No own echo was observed, so the guide asks the Human to inspect the original topic._

![Temporary connection and local credentials removed](/guides/lark/26-new-app-cleaned.webp)

_Close/reopen and same-Profile restart retained configuration/history; select the persisted account after reload. Disable, grant revocation, unbind and account removal returned relevant steps to pending. Native Remove integration then stopped reception and deleted local configuration/credentials. The external application remains; external credential reset is an administrator action._

## Handle tool approvals in a management DM

This slice supports Lark private **Allow once** and **Reject** cards through a qualified Provider. Native question forms use the separate Answer capability described below. Group approvals, saved automatic rules and non-blocking native waits are separate slices. The released dsh-im package number alone does not imply card capability; an unavailable Provider remains unavailable.

1. Enable the app's **Events & callbacks → Callback configuration → Long connection** and add `card.action.trigger`, then publish the version. Retain the existing message read/send scopes and add `im:chat:read` so the sender can verify a private conversation. A maintainer must authorize these app changes.
2. Send `/pair` in the Bot's Lark DM. In the authenticated Web Profile, inspect the real applicant/account and explicitly grant **Approve** and/or **Reject**. Pairing does not create ordinary DM intake or grant VPS/API access.
3. In **Lark management notifications**, choose that person's name and receiving account, then **Save destination**. Select **Send test card**; it has no approval buttons and grants nothing.
4. A subsequent native tool approval sends its complete operation to that management DM, with **Allow once** and **Reject**. Check the proposed operation before deciding. A truncated card asks you to inspect the complete operation in Web. The card's acknowledgement only confirms receipt of your click; the final native decision and result are separate.
5. Refresh notifications in the Profile and use **Open native session and complete operation** to inspect the actual native result. **Decision accepted** is not proof that a tool ran. Rejected, revoked, expired, duplicate or mismatched actions cannot approve a new call.

![The actual isolated Profile before a management DM is paired](/guides/lark/approvals/settings-empty-dark.jpg)

This screenshot shows the running private-route entry point with no paired destination; it is not a real Lark delivery or execution result. Real platform qualification for this slice is recorded with the issue's evidence and Human QA.

If delivery is **Unknown outcome**, check the DM before creating any new request: the sender does not automatically resend. Known-unsent failures can retry at most three times. Card updates may also remain unconfirmed; use Web for the canonical result. Revoking a pairing or changing the destination invalidates old controls. A Host restart expires old pending cards rather than replaying a paused tool. The current native approval still waits; the later Inbox continuation slice owns non-blocking behavior.

Computer and Browser first-use authorization covers a native Session, so its notification has no approval buttons and requires Web review; it cannot be granted by an IM Allow once.

![A reviewed test DM receives a native approval notification](/guides/lark/approvals/route-sent-dark.jpg)

In the earlier isolated 2026-10-07 test, the actual Lark platform accepted both the test card and a native tool approval card. This historical screenshot records **delivery accepted / decision pending**; it does not show an IM decision or tool execution. A later authorized native Windows window qualified BotHarness source `8936777b` with checked Provider source `1422b07f`: the Human's Lark **Allow once** click produced exactly one successful native Node print, and a distinct **Reject** click produced the native rejection error without a replacement call. The Human confirmed the final cards showed **Executed** and **Rejected**. The route was disabled, QA pairing revoked, identity unbound and local receiver stopped before restoring production within the ten-minute limit. The Human then confirmed normal production replies in both Lark and Discord. See [#1029](https://github.com/BotHarness/BotHarness/issues/1029) for the source-specific evidence and recovery checks; this qualification does not update the published Provider pin or deploy the feature.

![Actual recovery: notifications off and the old request expired](/guides/lark/approvals/recovery-dark.jpg)

[Light theme recovery screenshot](/guides/lark/approvals/recovery-light.jpg). After the test authority was revoked and the local Host restarted with its IM Provider disabled, the destination is **Off**, the old request is **Expired**, and the local identity is unavailable. This screen does not prove production availability; production Discord/Lark connections were verified separately after restoration. Do not use the old card for a new test.

## Answer native questions in the management DM

The #1031 candidate adds a separate checked question-card contract. A Provider qualified for approval cards alone cannot claim question support. This candidate does not change the published Provider pin or enable a second receiver.

1. Send `/pair` in the Bot's Lark DM and explicitly grant **Answer** in authenticated Web. Approve/Reject and Answer are independent. Select this pairing in **Lark management notifications**; ordinary DM reception remains separately configured.
2. When this Bot's original Orchestrator asks a native Human question, its committed request appears in Web and in the configured private DM. Choose an offered option or enter a custom answer for every question, then select **Submit answers**. Each Lark form input supports up to 1000 characters. For a single-choice question, clear the choice before submitting a custom answer. A multi-select question may include choices and a custom answer together.
3. A single question can also receive a plain-text reply to its original card, or `/answer <12-character reference> <answer>`. Without an exact reference or original-card reply, ordinary clarification stays ordinary conversation. Several open questions, a multi-question request, malformed commands or a reference that contradicts the quoted card require explicit selection; the system does not guess.
4. The click acknowledgement means queued, not answered. The original native owner rechecks the actual actor, Answer capability, current account/route, original receipt, offered values and live Session at commit. Web and Lark can accept only one canonical answer. Answer text never creates tool approval or an automatic rule.
5. In **Lark question notifications**, inspect native status separately from delivery and answer submission. **Check original question** reconciles an uncertain submission against the same live native owner and existing canonical answer; it never replays the submitted text. A failed attempt leaves the original question available in Web. Uncertain card sends are not resent. Known-unsent notification or update failures can be repaired explicitly, with at most three sends.

Cancelling the native question updates its original card when the checked route remains available. Restart expires a pending native owner and refuses old controls rather than restoring a Promise from a notification row. Card update failure does not change the canonical answer; inspect Web and the native Session. This slice continues to use a native wait and does not claim non-blocking Inbox continuation.

Qualification is source-specific: focused native-owner/checked-Provider tests and a native Windows Web/model run are local evidence. The Lark form, actual SDK callback and final card state still require a new authorized, exclusive receiver window and Human operation. The completed #1029 approval window does not qualify #1031 questions. Production Lark and Discord remain on their restored receiver until that window is approved.

The first authorized #1031 platform window verified a fresh pairing and **Answer only**, then Lark rejected the form before card creation with error `11310`: the original 2000-character input setting exceeded its 1000-character maximum. No answer was accepted; the unknown delivery was not replayed. QA authority was revoked, its identity unbound and receiver stopped before restoring production within ten minutes. The candidate now renders and validates form inputs at 1000 characters; real form submission and final card qualification still await a new window.

![The candidate's real native Profile shows separate question notifications, with reception disabled](/guides/lark/questions/after-light.png)

[Dark theme](/guides/lark/questions/after-dark.png). The matched [light baseline](/guides/lark/questions/before-light.png) and [dark baseline](/guides/lark/questions/before-dark.png) use the merged #1029 source, the same QA Bot name, locale and 1440 × 960 viewport. Both Profiles have no management route or IM binding; older QA entries in the candidate's sidebar are incidental history. These are local setup screenshots, not Lark delivery evidence.

![The original native question owner accepts an option and custom text in the Windows Web run](/guides/lark/questions/native-question-answered-light.png)

[Pending native question](/guides/lark/questions/native-question-pending-light.png) · [Answered in dark theme](/guides/lark/questions/native-question-answered-dark.png). One canonical answer resolved the original native tool, and that Session continued to a completed turn. The native Web form is the pre-existing answer surface; these screenshots do not claim real Lark form qualification.

## Images in Channel history

In the image-capable #1021 candidate, an authorized Lark image or supported image-bearing post appears inside its original Channel bubble. The source name above it still opens source details. Images load when visible; select an image to enlarge it, and use **Retry** after a failed load. Text and multiple images stay in their native order in one message.

This requires a Channel Bridge with a history destination. Inbox-only reception does not place images in Channel history. Keep the application's existing message permissions: a mentions-only group source still requires a real Bot mention in a supported native post. This feature does not enable ordinary group-message access.

Stopping the Bridge keeps already acquired images readable but stops new image acquisition. Unbinding its identity or revoking source authorization makes that path unavailable, including cached images. A separately valid source path remains independent. Refresh and restart retain authorized acquired images; purged or missing originals are not downloaded again. Previews support PNG, JPEG, GIF and WebP up to 25 MiB. An unsupported format or oversized image shows an explicit state.

Human image viewing does not make the Bot understand images or change its attention, model context or permissions. Real platform acceptance and screenshots for this candidate are tracked in [#1021](https://github.com/BotHarness/BotHarness/issues/1021); they are not implied by the older onboarding evidence above.
