# Lark Bot read receipts for received thread replies

Investigated: 2026-10-01. Scope: an international Lark app Bot receiving a Human's group/thread message; native message read indicators, rather than BotHarness Inbox processing state.

## Conclusion

No supported public operation was found that lets an app Bot explicitly mark a received Human thread reply as natively read. This is a bounded finding from the current public IM API documentation and first-party SDK, not proof that Lark has no internal operation or automatic server behavior. The installed first-party desktop client contains a concrete group-versus-thread display distinction that can produce exactly the observed colors without a Bot read transition. Human-provided reader-list evidence confirms the QA mainline green check has zero read and zero unread recipients, with no Bot listed. The corresponding thread's live raw counts and feature flag remain unverified.

Do not implement a guessed read endpoint, change event acknowledgements to an undocumented payload, or use a Human client identity to impersonate the Bot's read state. A supported implementation requires a documented Bot operation or confirmation from Lark of an automatic read contract for thread messages.

## Verified public contracts

- **Read-user query has the opposite direction.** `GET /im/v1/messages/:message_id/read_users` reports readers of a message sent by the current Bot within seven days. The Bot must remain in the conversation. It cannot answer whether that Bot read a Human-origin message, and it does not mutate read state. [Lark read-users API](https://open.larksuite.com/document/server-docs/im-v1/message/read_users)
- **Read events also have the opposite direction.** `im.message.message_read_v1` is emitted when a user reads a private-chat message sent by the Bot. It is not a Bot-to-Lark receipt for an incoming thread message. [Lark message-read event](https://open.larksuite.com/document/server-docs/im-v1/message/events/message_read)
- **Public thread operations do not establish a read contract.** The thread guide documents mode configuration, thread replies, forwarding, history reads, visibility and notification events. It does not document a Bot read marker or thread subscription operation that updates message read status. History access and reply success therefore do not, by themselves, establish native read status. [Lark thread guide](https://open.larksuite.com/document/uAjLw4CM/ukTMukTMukTM/reference/im-v1/message/thread-introduction)
- **The native circle is a recipient reading indicator.** Lark's help describes gray as no readers, partial green as some readers, and a green check as all readers; clicking it shows the reader list. The guide describes opening a chat and viewing a message for a user. It does not define how Bots participate in group-versus-thread counts. [Lark read-status help](https://www.larksuite.com/hc/en-US/articles/360024163794-check-the-read-or-unread-status-of-messages)

## First-party SDK cross-check

The public SDK's `main` branch currently identifies itself as `@larksuiteoapi/node-sdk` 1.74.0. Its generated IM resource exposes `readUsers` as a GET query with the same Bot-sent restrictions. Inspection/search found no IM mark-read or subscribe operation. This corroborates the public API inventory; SDK absence alone is not a universal capability guarantee. [SDK package version](https://github.com/larksuite/node-sdk/blob/main/package.json), [generated IM API source](https://github.com/larksuite/node-sdk/blob/main/code-gen/projects/im.ts#L1315-L1372)

The SDK WebSocket `handleEventData` awaits the event dispatcher, constructs a response with HTTP status 200 (500 on failure), optionally includes the handler result encoded as data, and returns a frame. This path neither branches on `thread_id` nor invokes a read-mark API. It acknowledges event dispatch; the source does not establish any Lark server-side native read side effect. The local QA Provider uses SDK 1.73.0 with the same relevant acknowledgement shape. [Current SDK WebSocket source](https://github.com/larksuite/node-sdk/blob/main/ws-client/index.ts#L631-L683)

## Remaining discriminating evidence

Inspect the native reader list and tooltip for a Human test message's mainline presentation. A green mainline circle only proves the reader-count rule used by that presentation; it does not identify the Bot as a reader until the list does. If the list explicitly includes the Bot only on the mainline, request Lark's supported group/thread automatic-read semantics or a supported Bot receipt operation. A thread circle can intentionally disable its reader-list popover under the condition below; lack of a popover alone is not proof of an automation failure.

## Installed first-party desktop renderer: a concrete display distinction

Read-only inspection of the installed Lark desktop bundle found the following rules. This inspected static application code only; it did not read client account storage, change feature flags, invoke private client APIs, or expose credentials.

Source archive: `/Applications/LarkSuite.app/Contents/Frameworks/Lark Framework.framework/Versions/143.0.7499.203/Resources/webcontent/messenger.asar`.

- `common/c9b65f4721.js`, Webpack module `890074`: the read-circle renderer subtracts one sender from the read count. If both remaining read and unread counts are zero, its default ratio is one, which renders the green check. Thus a green check can represent zero other counted recipients; it does not require a positive Bot read count. Static entry SHA-256: `3db945c8c55a1bddd63072f0afbcd7343ef11477a4f783c8b1728f1cc14bb4fe`.
- `common/06dc89359a.js`, Webpack module `545577`: the thread wrapper checks a feature flag, a non-root reply, raw read count equal to one, and unread count equal to zero. When all are true, it sets `customShowVirtualIcon` and `disablePopover`. The circle renderer forces that virtual icon to gray and the wrapper supplies the no-reader tooltip. Static entry SHA-256: `120838af6bc0be76e3e30169316b026d75487e5d9b39a509bf3dbcf4180bda62`.
- `39989/cd84adfb63.js`, Webpack module `876150`, export `Cz`: the relevant feature flag is `messenger.thread.read_receipt_myreply_opt`, with a default of true in this installed code. A default is not live proof of the current account's flag value.

Consequently, raw counts of one read sender and zero unread recipients can yield a green mainline circle but a gray thread-reply circle. This is a verified conditional renderer rule and a plausible explanation of the test screenshots, not a verified measurement of those messages' live counts or a proof that Bots are excluded from every reader count. Changing BotHarness's event ACK does not change this client rendering condition through any documented contract found here.

### Human QA evidence received in this investigation

The Human opened the mainline green circle and supplied a screenshot of its popover. It displays **0 read, 0 unread**, with an empty reader list. The QA chat header displays one Human member and one Bot. Therefore, this screenshot provides no positive Bot read receipt: the Bot is absent from the shown read/unread lists, and the mainline green check is consistent with the verified zero-recipient rendering rule above.

This resolves the misleading interpretation that the green mainline circle proves Bot-native read reporting. The gray thread circle is consistent with the separate virtual-icon rule, but the exact live thread counts and flag have not been directly measured. No BotHarness read-reporting change is justified by this evidence, and no supported operation to insert the Bot into these native recipient counts was found.

This investigation made no authentication changes, sent no messages, and made no read-state mutations. No private client API or client credential was extracted.
