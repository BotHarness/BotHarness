# Connect a Bot to Lark / Feishu

Connect a PersonaBot to a work group: connect the application bot, bind its identity and authorize a group, then choose whether incoming messages belong in the Bot Inbox or a local Channel.

This guide starts with **Lark international, an application bot, a test group and mentions-only intake**. Feishu uses the same sequence, with a Feishu application and the Feishu platform selected.

## Understand the three settings

| Setting                   | Location                    | Purpose                                                     |
| ------------------------- | --------------------------- | ----------------------------------------------------------- |
| IM application connection | Settings → IM Bots → Feishu | Connect this Host to a Lark / Feishu application bot        |
| External identity         | PersonaBot detailed Profile | Choose who this Bot speaks as externally                    |
| Channel connector         | Channel detailed Profile    | Choose which external group and messages enter this Channel |

**Binding an identity still requires explicit group authorization.** It does not receive every group automatically, and a connector does not lend that identity to other Bots.

Screenshots show the actual BotHarness main UI in Chinese, using an isolated demonstration Profile without external accounts. Empty account/group selectors illustrate the setup entry points; completing each preceding step populates them with your own accounts and authorized groups. No application secrets or real group messages appear in the images. Use the browser image menu (right-click, or long-press on mobile) to view a full-size image.

## 1. Prepare your environment

You need:

- Membership in a Lark / Feishu organization and permission to create and publish a company-built application, or an administrator who can help.
- A test group and a Human account that can send messages in it.
- A running BotHarness, a working model and a PersonaBot. Confirm the Bot can answer a local DM first.
- A compatible dsh-im Provider. This complete flow uses the fixed, qualified fork installed by the repository development launcher; an arbitrary official dsh-im version may lack the required interfaces.

For a repository checkout with the basic development environment ready, run:

```bash
pnpm install --frozen-lockfile
pnpm build
node scripts/dev-instance.mjs --home "$HOME/.local/share/botharness-lark" --port 32620 --im-provider
```

Open the login URL printed by the launcher and keep the Host running. Reuse the same `--home` to retain connection settings; avoid two Hosts receiving events for the same application. See [Quick start](/docs/quickstart) and the [Client Bridge development guide](/dev/guides/client-bridge) for the base environment.

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

## 3. Connect the application locally

1. Open **Settings → IM Bots → Feishu** at the lower left.
2. Open **Manual setup** and select **Lark (international)**. Select Feishu for Feishu credentials; do not mix platforms.
3. Enter the App ID and App Secret privately, then click **Bind and connect**.
4. Confirm the account is connected. If you just changed subscriptions or permissions, publish them in the console before checking again.

![Lark manual connection form in IM Bot settings, with empty credentials](/guides/lark/01-provider.webp)

_Figure 1: Select international Lark for a Lark application. Enter secrets only in local settings, never in chat, Git or public screenshots. Feishu QR onboarding and Lark CLI Human login are separate flows; this guide uses application credentials._

Next, configure a **delivery target** for this account:

1. Open the connected bot's settings, then **Delivery targets → New target**.
2. Choose the test group from **Choose from conversations you have chatted in**, checking its name and Chat ID; alternatively, enter its native platform group ID (`oc_…`) manually. A group name or message ID is not a Chat ID.
3. Set a call alias such as `lark-test-group`, click **Test**, confirm the test message in Lark, then **Save target**.

If the test group is not listed yet, mention the application bot in that group with “connection test,” then refresh the conversation list. This lets dsh-im discover the destination before PersonaBot binding; avoid business requests at this stage. A reply from dsh-im's own Session does not prove BotHarness intake.

## 4. Bind a PersonaBot identity and authorize the group

In **Bot mode**, open the intended Bot DM, click its name at the top, then **View details** to open the detailed Profile.

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

1. The message appears in the Bot's **Activity center / Bot Inbox**, with the correct Lark group source, original sender and content.
2. Source details show the external message ID, Source Event ID and topic information when present.
3. Lark receives `LARK-OK` from this Bot's own application identity in the original conversation. A topic test should reply in the same topic.
4. With default mentions-only intake, send an ordinary unmentioned message and confirm it does not create ordinary intake for this Bot. Explicitly followed topics use their topic policy.

**Lark's green or gray read circle does not establish whether a Bot received a message.** Use the local Inbox source record and actual external reply.

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
