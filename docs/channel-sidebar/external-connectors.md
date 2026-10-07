# External connectors

Open **Bot DM → Channel sidebar → External connectors**. It lists the external conversations synced into this Bot’s Channels and keeps one advanced action. You don’t need it to receive or reply: [binding an app](/docs/channel-sidebar/external-identities) is enough, and its conversations are managed there. Later, one-way input streams such as webhooks will also live here.

![The External connectors entry with a synced conversation and the advanced send target row](/guides/channel-sidebar/20b-external-connectors-en.webp)

## Read the rows

| Row                               | What it shows and does                                                                                                                                                                                                                   |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One row per sync                  | Sync name, a state chip (**Receiving**, **Connecting**, **Paused** or **Unavailable**; plus **Bot Inbox only** when it does not add DM history) and “platform · external conversation · condition”. The Switch pauses or resumes intake. |
| **Save a send target (advanced)** | Only for apps that can’t list or address conversations: save one target the Bot can post to proactively. Receiving and replying don’t need it.                                                                                           |

When nothing is synced, the entry says **No external sources connected**. Adding a sync here, from any connected app whether or not a Bot has it bound, is being redesigned.

**Syncs decide what is received; the Bot’s [Wake policy](/docs/channel-sidebar/wake-policy) decides when it is processed.**

## Edit, pause or remove a sync

Click a row to open **Edit connector**. Change the name, the condition (inherit, mentions of the receiving identity only, or all ordinary text messages) or the enable switch, then click **Save connector**. **Delete** asks for confirmation. Pausing keeps the configuration and history; deleting does not remove messages already received.

![Editing an external connector](/guides/channel-sidebar/21-external-connector-dialog-zh.webp)

## Advanced: save a send target

Lark, Slack and Discord apps post to conversations directly, so they never need this. For an app whose Provider can’t list or address conversations:

1. Save a **Destination** in the account’s delivery settings under **Settings → IM Bots**.
2. Click **Save a send target (advanced)**, choose the bound **IM account** and the saved **Destination**, and confirm.
3. In the same dialog you can send a message to the target and inspect **Recent sends**. **Revoke this target authorization** removes it.

![The send target dialog](/guides/channel-sidebar/22-conversation-authorization-zh.webp)

A local Group still manages its connectors in the group’s detailed Profile. Platform setup: [Lark / Feishu](/docs/lark-connection), [Slack](/docs/slack-connection), [personal WeChat](/docs/wechat-connection). [All sidebar features](/docs/channel-sidebar).
