# #1109 Conversation list: mute, rules, block, allow again

Captured from a real DSH Host (0.2.0-rc.1) with the simulated Lark provider and the real OpenCode Go model. Each state was produced through the Host commands, not injected client data.

## Before

The app's **Conversations** list was read-only. A conversation could not be muted, given its own rules or blocked, and every new DM or @mention was admitted.

## After

|                   | zh light                         | en dark                         |
| ----------------- | -------------------------------- | ------------------------------- |
| Four groups       | ![](conversations-zh-light.webp) | ![](conversations-en-dark.webp) |
| Block confirm     | ![](block-confirm-zh-light.webp) | ![](block-confirm-en-dark.webp) |
| Rules for a group | ![](rules-zh-light.webp)         | ![](rules-en-dark.webp)         |

The remaining light/dark and zh/en variants are in this folder.
