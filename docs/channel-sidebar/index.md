# Channel sidebar

The **Channel sidebar** is the right-hand column in **Bot mode**. It follows the selected chat: a PersonaBot DM shows that Bot’s own resources; a local group shows the group’s members and management controls. Opening a native DSH Session takes you to a different, Session-scoped interface.

These pages use DSH **0.2.0-rc.1** and the public **deepseekbot@0.1.0-alpha.1** package. First complete [installation](/docs/installation) and [API and Bot model setup](/docs/model-setup).

## Open the sidebar

1. Enter **Bot mode** and open a Bot DM or a local group in the left roster.
2. If the right column is closed, click **Expand the Channel sidebar** at the right edge.
3. Click an entry’s title to expand or collapse it. Several entries can remain open together.
4. Switch chats to inspect the resources for that Bot or group. Check the chat header before using an action.

![The Bot DM with the Channel sidebar on the right](/guides/channel-sidebar/01-sidebar-overview-zh.webp)

## Choose a feature

| In a Bot DM                                                | What you can do                                                              |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------- |
| [Memory files](/docs/channel-sidebar/memory-files)         | Browse the current repository tree and read a file in the center.            |
| [Memory evolution](/docs/channel-sidebar/memory-evolution) | Inspect uncommitted changes, Git history, branches and recovery checkpoints. |
| [Sessions](/docs/channel-sidebar/sessions)                 | Open this Bot’s Orchestrator and Assignment Sessions in DSH.                 |
| [Bot Inbox](/docs/channel-sidebar/bot-inbox)               | Inspect source messages and Assignment reports that the Bot has received.    |
| [Workspace Grants](/docs/channel-sidebar/workspaces)       | Review and explicitly authorize the Host folders available to this Bot.      |

| In a local group                                             | What you can do                                                         |
| ------------------------------------------------------------ | ----------------------------------------------------------------------- |
| [Members and group management](/docs/channel-sidebar/groups) | Inspect members, invite a Bot, handle join requests and edit the group. |

[Display and layout](/docs/channel-sidebar/display) explains width, entry ordering, visibility and feature-specific display options. [Settings guide](/docs/settings) covers the rest of the non-IM settings.

## Why an entry may be missing

Bot-only entries do not appear in a group; group management does not appear in a Bot DM. The Bot Inbox entry is conditional on having records or a loading/error state. An entry may also be hidden through **Edit sidebar**.

Optional plugins can contribute further entries. The public alpha.1 product does not include the Browser or Computer packages: their absence is expected. When those packages are installed and available, follow [Share a browser tab](/docs/daily-browser) or [Computer export and migration](/docs/computer-export) for their separate prerequisites and procedures. Installing an IM connection is a separate setup flow.
