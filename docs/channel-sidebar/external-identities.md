# External identities

Open **Bot DM → Channel sidebar → External identities**. It lists the external apps bound to this Bot (Lark / Feishu, Slack, Discord, WeChat and so on). An app belongs to exactly one Bot; other Bots cannot borrow it.

**Binding an app is enough.** Once bound, DMs to the app and @mentions of it in groups it belongs to go straight to this Bot’s Inbox, and the Bot replies in the same conversation. You don’t need a saved delivery target, a conversation authorization or a reception switch. Who can reach the app is decided by each platform's settings, such as Lark's availability scope, group membership and app permissions, or Discord's channel permissions.

The same goes for Slack and Discord: DM the app or @mention it in a channel it belongs to. Personal WeChat only receives DMs from the person who scanned it; other contacts and WeChat groups stay out of the Inbox.

![The External identities entry with one row per bound app](/guides/channel-sidebar/18-external-identities-zh.webp)

## Read the rows

| Row                                     | What it shows and does                                                                                                                                               |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One row per bound app                   | Local display name, a status chip (**Available**, **Paused**, **Unavailable** or **Rebind required**) and “platform · N conversation(s)”. The Switch pauses the app. |
| **+ Bind app**                          | Bind a connected app to this Bot.                                                                                                                                    |
| **Connect Lark / Feishu** (Setup guide) | Opens the step-by-step Lark / Feishu setup guide. Its **Locate** buttons highlight the matching sidebar row, expanding **External connectors** when needed.          |
| **IM administrator pairing**            | Shows “N pending” and “N paired”. Opens the pairing review dialog; see [Connect a Bot to Lark / Feishu](/docs/lark-connection).                                      |
| **Lark approval notifications**         | Shows the destination, or **Automatic notifications off**. Opens the approval notification dialog.                                                                   |

## Bind an app

1. First connect the app under **Settings → IM Bots**, following the guide for your platform.
2. Click **+ Bind app**.
3. Choose the connected app under **App**. The dropdown is searchable: type to filter.
4. Click **Bind app**. The dialog then shows the real receiving state:
   - **Ready**: DMs and @mentions to the app now reach this Bot’s Inbox.
   - **Connecting**: the app is still opening its receiver. Wait a moment.
   - **Can’t receive messages right now**: check the app’s connection under **Settings → IM Bots**.
5. DM the app, or @mention it in a group. The message appears in the Bot Inbox and the Bot replies in place (in the same topic for a group). Group messages that don’t @mention the app stay out of the Inbox.

A `/pair` command doesn’t enter the Inbox. [IM administrator pairing](/docs/lark-connection) still handles it.

![Ready state after binding an app](/guides/channel-sidebar/18b-bind-app-ready-en.webp)

## See the conversations

The first DM or @mention that reaches the Inbox records its conversation. Click the app row and look under **Conversations** in the **Edit identity** dialog: each conversation shows its name (the person’s name for a DM, the group ID for a group), DM or Group, and the last message time. The list is read-only for now; mute, reception rules and block come in a later release.

![The app’s conversation list](/guides/channel-sidebar/19b-app-conversations-en.webp)

## Edit, reconnect or unbind

Click an app row to open **Edit identity**.

1. Change the **Local display name** or the identity’s default behavior after binding: inherit the global default, or choose a custom value.
2. Click **Save identity**.
3. **Reconnect** revalidates the same app and its existing conversations. A changed app requires unbinding and binding again.
4. **Unbind** (red) asks for confirmation and lists the conversations it invalidates. After unbinding, the app stops delivering to this Bot and old conversations can no longer be replied to. Accepted messages and source history are retained; the shared app and its credentials are not removed.
5. Pausing the app with the Switch stops new messages from reaching the Inbox right away. Turning it back on resumes them.

![Editing an external identity](/guides/channel-sidebar/19-external-identity-dialog-zh.webp)

Platform setup: [Lark / Feishu](/docs/lark-connection), [Slack](/docs/slack-connection), [personal WeChat](/docs/wechat-connection). [All sidebar features](/docs/channel-sidebar).
