# #1108 Bind a Lark app; DMs and @mentions reach the Inbox

Rows and conversations are sample data injected into the client; the Host behaviour is covered by `packages/core/test/messaging-default-traffic.test.ts`.

## Before: Bind identity, then authorize each conversation

| zh                                                                         | en                                                                         |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| ![before zh](../1085-external-identities-connectors/sidebar-zh-light.webp) | ![before en](../1085-external-identities-connectors/sidebar-en-light.webp) |

## After

|                        | zh light                         | en dark                         |
| ---------------------- | -------------------------------- | ------------------------------- |
| Bind app dialog        | ![](bind-dialog-zh-light.webp)   | ![](bind-dialog-en-dark.webp)   |
| Ready after the commit | ![](bind-ready-zh-light.webp)    | ![](bind-ready-en-dark.webp)    |
| App row with count     | ![](sidebar-zh-light.webp)       | ![](sidebar-en-dark.webp)       |
| Conversation list      | ![](conversations-zh-light.webp) | ![](conversations-en-dark.webp) |

The remaining light/dark and zh/en variants are in this folder.
