# External connectors

Open **Bot DM → Channel sidebar → External connectors**. An external connector decides which messages from an authorized external conversation enter this Bot: either this DM’s history or **Bot Inbox only**. It is managed separately from the identity the Bot speaks as; bind that first under [External identities](/docs/channel-sidebar/external-identities).

![The External connectors entry with connector rows and the authorization row](/guides/channel-sidebar/20-external-connectors-zh.webp)

## Read the rows

| Row                          | What it shows and does                                                                                                                                                                                                                        |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One row per connector        | Connector name, a state chip (**Receiving**, **Connecting**, **Paused** or **Unavailable**; plus **Bot Inbox only** when it does not add DM history) and “platform · external conversation · condition”. The Switch pauses or resumes intake. |
| **+ Add connector**          | Route an already authorized conversation into this DM or Bot Inbox only.                                                                                                                                                                      |
| **Authorize a conversation** | Opens **Conversation authorization**. Once a target is authorized, the row shows its name, status chip and “platform · account”.                                                                                                              |

**Connectors decide what is received; the Bot’s [Wake policy](/docs/channel-sidebar/wake-policy) decides when it is processed.**

## Authorize a conversation

1. Click **Authorize a conversation**.
2. Choose the bound **IM account** and the saved **Destination**, then click **Bind and authorize destination**. Check the group, account and local receive target.
3. In the same dialog you can set the **Local receive target**, collection and wake for the group, Thread following, send a message to the target and inspect **Recent sends**.
4. **Refresh** reloads the current state. **Revoke this target authorization** removes the authorization.

![The Conversation authorization dialog](/guides/channel-sidebar/22-conversation-authorization-zh.webp)

## Add a connector

1. Click **+ Add connector**.
2. Choose an authorized source. If the list is empty, authorize a conversation first.
3. Choose the destination: this DM’s history or **Bot Inbox only**.
4. Enter a recognizable **Connector name**, choose the condition and save.

Adding a connector does not create an external account or new authorization. All dropdowns in these dialogs are searchable: type to filter.

## Edit, pause or delete

Click a connector row to open **Edit connector**. Change the **Connector name**, the condition (inherit, mentions of the receiving identity only, or all ordinary text messages) or the enable switch, then click **Save connector**. **Delete** asks for confirmation (**Delete this connector**). Pausing keeps the configuration and history; deleting does not remove messages already received.

![Editing an external connector](/guides/channel-sidebar/21-external-connector-dialog-zh.webp)

A local Group still manages its connectors in the group’s detailed Profile. Platform setup: [Lark / Feishu](/docs/lark-connection), [Slack](/docs/slack-connection), [personal WeChat](/docs/wechat-connection). [All sidebar features](/docs/channel-sidebar).
