# External identities

Open **Bot DM → Channel sidebar → External identities**. An external identity decides who this Bot speaks as on an external platform such as Lark / Feishu, Slack or WeChat. Each Bot can bind one identity per platform; other Bots cannot borrow it. Binding an identity does not authorize any group or conversation and does not turn on intake: that is done in [External connectors](/docs/channel-sidebar/external-connectors).

![The External identities entry with one row per bound identity](/guides/channel-sidebar/18-external-identities-zh.webp)

## Read the rows

| Row                                     | What it shows and does                                                                                                                                                                               |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One row per bound identity              | Local display name, a status chip (**Available**, **Paused**, **Unavailable** or **Rebind required**) and “platform · Inherit global default / Custom”. The Switch enables or disables the identity. |
| **+ Bind identity**                     | Bind a new identity by choosing a connected **IM account**.                                                                                                                                          |
| **Connect Lark / Feishu** (Setup guide) | Opens the step-by-step Lark / Feishu setup guide. Its **Locate** buttons highlight the matching sidebar row, expanding **External connectors** when needed.                                          |
| **IM administrator pairing**            | Shows “N pending” and “N paired”. Opens the pairing review dialog; see [Connect a Bot to Lark / Feishu](/docs/lark-connection).                                                                      |
| **Lark approval notifications**         | Shows the destination, or **Automatic notifications off**. Opens the approval notification dialog.                                                                                                   |

## Bind an identity

1. First connect the application account under **Settings → IM Bots**, following the guide for your platform.
2. Click **+ Bind identity**.
3. Choose the connected account in **IM account**. The dropdown is searchable: type to filter.
4. Save. Then authorize a conversation under [External connectors](/docs/channel-sidebar/external-connectors).

## Edit, reconnect or unbind

Click an identity row to open **Edit identity**.

1. Change the **Local display name** or the identity’s default behavior after binding: inherit the global default, or choose a custom value.
2. Click **Save identity**.
3. **Reconnect** revalidates the same account and its existing authorized scopes. A changed account requires unbinding and binding again.
4. **Unbind** (red) asks for confirmation and lists the existing authorizations for this Bot that it invalidates. Accepted messages and source history are retained; the shared account and its credentials are not removed.

![Editing an external identity](/guides/channel-sidebar/19-external-identity-dialog-zh.webp)

Platform setup: [Lark / Feishu](/docs/lark-connection), [Slack](/docs/slack-connection), [personal WeChat](/docs/wechat-connection). [All sidebar features](/docs/channel-sidebar).
