# Connect a Bot to QQ groups

Use a **QQ Bot application authorized through Tencent's official platform**. This path connects a PersonaBot to an application that has joined a QQ group. Start with one application, one Bot and a dedicated test group.

This is the development slice tracked by [#1152](https://github.com/BotHarness/BotHarness/issues/1152). It requires the qualified Provider selected by `scripts/dev-im-provider.mjs`; an arbitrary dsh-im installation does not provide its checked contract. Public release and the remaining [QQ capabilities](https://github.com/BotHarness/BotHarness/issues/1149) have separate delivery records.

## Connect and bind the application

1. Create an application in the [official QQ Bot platform](https://bot.q.qq.com/open). Follow its current application eligibility and group membership requirements. Add the application to your test group.
2. Confirm that your PersonaBot can answer a local DM using the chosen model.
3. Open **Settings → IM Bots → QQ → Scan to connect**. Complete Tencent's authorization flow for that application. Keep credentials in the Provider's credential service.
4. Open the Bot's DM, then **Channel sidebar → External identities → Bind app**. Select your QQ application and bind it. The ready state means its group mentions can reach this Bot's Inbox. You do not need to save a delivery target or authorize each group separately.
5. In QQ, @mention the application with a short text question. Inspect the **Bot Inbox**, open its source, and check the reply in the original QQ group.

An application belongs to one Bot. The Bot replies through the application that received the message. The platform controls who can reach that application through its availability and group membership settings.

## Understand the first slice

| Behavior        | Current contract                                                |
| --------------- | --------------------------------------------------------------- |
| Input           | Text from a trusted `GROUP_AT_MESSAGE_CREATE` event             |
| Destination     | The same application-scoped QQ group                            |
| Reply           | Native text reply associated with the original message          |
| Receipt         | QQ's native response message ID; this means provider acceptance |
| Pause or unbind | Stops new intake and fences unsent replies                      |
| Duplicate event | Reuses its canonical Source Event and Inbox Admission           |
| Uncertain send  | Retains an unknown outcome; no automatic resend                 |

The [official group send contract](https://bot.q.qq.com/wiki/develop/api-v2/autogen/api/v2_groups_group_openid_messages.post.html) gives passive replies a five-minute window and a five-reply limit per source message. The Bot does not automatically switch an expired reply to a proactive send. A provider receipt does not prove that a person received or read the message.

This slice excludes private QQ messages, ordinary group traffic, attachments and compound or quoted payloads. [Ordinary group events](https://bot.q.qq.com/wiki/develop/api-v2/autogen/event/group_message_create.html) additionally require the application's receive-all setting; their explicit opt-in is tracked separately. Images, files, voice input and delayed proactive reports follow in the later slices.

QQ does not provide this consumer with a group-history API or a durable resume cursor. Disconnects can leave gaps. After a Host restart, previously retained sources remain inspectable, but their process-local reply proof is unavailable until a qualifying native event is delivered again. An old source must never become permission to send an unrelated new message.

## If the app does not appear or cannot reply

- Check the connection under **Settings → IM Bots → QQ**. An online receiver and a verified application identity are both required.
- Expand the application's **Diagnostic details**. Safe HTTP status, platform error code and qualification guidance help distinguish credential, permission and response failures. Do not share credentials or authorization QR codes.
- For an expired source, send a fresh @mention in QQ. An unknown send outcome needs inspection in the group before another message is requested.
- Check that the Bot, binding and conversation are enabled and allowed. Pausing, blocking or unbinding invalidates pending authority.

The [Provider integration guide](dev/guides/im-provider-integration.md) and [ADR-0151](adr/0151-qq-group-replies-use-authenticated-apps-and-process-local-source-proof.md) describe the implementation boundary.
