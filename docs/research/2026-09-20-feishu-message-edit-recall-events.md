# Feishu/Lark work-group, message edit and recall contracts

## 2026-10-01 work-group contract qualification (#78)

This update is the dated provider-facts prerequisite for [#12](https://github.com/BotHarness/BotHarness/issues/12) and [#117](https://github.com/BotHarness/BotHarness/issues/117). It extends this existing research note; the September 20 plugin comparison below remains a historical snapshot. It does not change the normative Messaging authority in ADR-0036–0039 or claim that an external message already enters a PersonaBot Inbox.

**Result:** a real Lark user @mention in a private ordinary work group and an existing topic reached a same-Host, exclusive public `dshIm` consumer and received a checked reply at the original group/topic. Forged group/topic routes were refused before sending. The tested consumer is a minimal fork proposal, not a released upstream capability. BotHarness Messaging ingress, durable Source Event/Inbox Admission, Orchestrator execution and the reply Outbox still belong to #12.

### Sources and tested revisions

| Source                                        | Revision/version                                                                                                                          | Evidence scope                                                                                                                 |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Official Feishu and Lark messaging references | Retrieved 2026-10-01; each claim links its owning `.md` reference below                                                                   | Documentation contract; brands are checked separately                                                                          |
| Official Node SDK                             | [`394c83092395a51402ee408b751d7f9fb05f5518`](https://github.com/larksuite/node-sdk/tree/394c83092395a51402ee408b751d7f9fb05f5518), 1.74.0 | Public source; awaited-handler acknowledgement                                                                                 |
| Installed Node SDK                            | [1.73.0 registry metadata](https://registry.npmjs.org/@larksuiteoapi%2fnode-sdk/1.73.0)                                                   | Live Profile; generated source inspected locally, no publicly retrievable source SHA claimed                                   |
| dsh-im upstream outbound proposal             | [PR #293](https://github.com/xmanrui/dsh-im/pull/293), head `ea0e69eb938e528650680f6eddfd48a8136c0403`                                    | Versioned account/conditional-send contract, pending upstream acceptance/release                                               |
| dsh-im minimal inbound fork                   | [`19d88f14bf85d74d4abf035a0c749d0b4a640257`](https://github.com/DoodleBears/dsh-im/tree/19d88f14bf85d74d4abf035a0c749d0b4a640257)         | Live exclusive consumer and checked text reply; 3,465 provider tests, build and package verification passed                    |
| DSH / BotHarness                              | `0.2.0-rc.1` / base `a3d88bbab25d2479ae435c9a8c1441c747cea20e`                                                                            | Isolated Profile with the explicit QA Plugin; no PersonaBot integration claimed                                                |
| Lark CLI                                      | Installed 1.0.66; [official source](https://github.com/larksuite/cli/tree/7beffb086d7fa3c5b843d8affa7c089f49cfc65e) 1.0.97                | Installed CLI used only for test group/topic setup and receipt reads; newer source is not proof of the older binary's behavior |

### Capability matrix and owner boundaries

“Supported” below describes the named platform contract or tested adapter surface. It does not grant an action, prove tenant permissions, or complete the corresponding BotHarness implementation.

| Capability                           | Platform contract                                                                                                                            | Live Lark / fork evidence                                                                                    | BotHarness implication                                                                                                            |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| User @mention in work group          | Supported with receive subscription, Bot membership and group-mention scope [R1, R2]                                                         | Verified with authenticated Bot mention ID, exact authorized group and user                                  | ADR-0036: trusted adapter context enters Messaging commands; names or text `@` are not identity                                   |
| Existing-topic reply                 | Supported; message, chat, thread, root and parent are distinct IDs [R3, R4]                                                                  | Verified through public `replyChecked`; changed group/thread refused; returned receipts read back            | ADR-0036: reply resolves a trusted Source Event route; model cannot choose a destination                                          |
| Create a topic from an ordinary root | Supported with `reply_in_thread=true`, even when the inbound root lacks `thread_id` [R3, R4]                                                 | Verified as explicit CLI test setup; first provider reply stayed flat                                        | Routing UX remains #12 policy; absence of `thread_id` does not mean platform inability                                            |
| Awaited receive acceptance           | Official SDK awaits the handler before success acknowledgement [R5]; current long-connection guide requires processing within 3 seconds [R6] | Probe flushes its task-owned evidence before resolving; sends happen later                                   | ADR-0037: production must resolve only after the single Messaging transaction commits; this probe file is not the canonical Inbox |
| Receive deduplication                | Receive documentation specifies `message_id`, **not** `event_id` [R1, R2]                                                                    | One delivery per observed source; repeated delivery IDs and restart dedup covered by probe/provider tests    | Scope original-message identity by authenticated provider account + message ID; retain event ID as delivery evidence              |
| Current-message fetch                | Supported but separately permission gated; Feishu group app reads require `im:message.group_msg` [R7, R8]                                    | Verified for this Lark app by reply preflight and returned-receipt reads                                     | ADR-0038: @mention receive permission alone never proves fetch capability                                                         |
| Edit reconciliation                  | Own text/post edit API exists; GET returns current content/update markers [R7–R9]                                                            | No live user-edit propagation proof; no dedicated edit event located in the inspected official indexes       | Unknown event capability, not platform-wide absence; use bounded reconciliation and Source Revision checks                        |
| Recall                               | `im.message.recalled_v1` is documented; sparse message/chat/time metadata [R10]                                                              | This text-only fork does not subscribe/project recall; post-recall GET behavior unverified                   | Supported platform capability, currently unimplemented adapter surface; keep original routing evidence                            |
| Own-Bot echo / other-Bot messages    | Feishu now documents include-Bot scopes; Lark's current all-group description excludes Bot messages [R1, R2]                                 | First consumer accepts user text only; no echo correlation or other-Bot live proof                           | ADR-0036: unresolved own echoes must not wake; do not advertise cross-brand Bot-to-Bot support                                    |
| Reply idempotency / unknown outcome  | Optional UUID, max 50 characters, at most one successful reply per UUID within one hour; no verified UUID result-lookup contract [R3]        | Checked-reply fork does not offer reply UUID/result lookup; probe never retries an unknown result            | ADR-0039: no exactly-once promise; production requires an Outbox Intent and honest Unknown Outcome                                |
| Offline replay / gap recovery        | No durable WS resume cursor contract verified; history pagination is a separate API [R6, R11]                                                | Consumer reports `resumeCursor:false`, `gapPossible:true`; no provider-redelivery or gap-recovery live claim | Do not convert reconnect, an in-memory cache, or history `page_token` into a durable checkpoint                                   |
| Reactions, cards, resources          | Separate events/APIs exist [R12–R15]                                                                                                         | Outside this text tracer                                                                                     | Adapter scope, not platform unsupported; add only in subsequent vertical slices                                                   |

### Exact identity, ownership and refusal facts

- The sandbox uses an internal app. Official Lark authentication uses app ID/secret to mint a tenant access token, while its FAQ distinguishes tenant-scoped internal apps from multi-tenant store apps whose app ID alone is not unique [R17, R18]. The tested fork fingerprint hashes provider/domain/app ID/authenticated Bot open ID; it does not claim a separately verified tenant key or ISV installation identity ([pinned account implementation](https://github.com/DoodleBears/dsh-im/blob/19d88f14bf85d74d4abf035a0c749d0b4a640257/src/channels/feishu/multi-bot-controller.mjs#L568-L598)). Live credential rotation, revocation and account removal were **not** exercised. Credentials remain in DSH, every checked operation authenticates the current account, and deletion removes its consumer in the fork; lifecycle fixtures are not a platform rotation/revocation guarantee. Those broader cases remain explicit follow-up proof gates.

- Both receive references warn that exceptional duplicate pushes occur and recommend message ID deduplication. The application-scoped account fingerprint, opaque Bot reference, delivery event ID, message ID, user open ID, mention ID, chat ID and thread/root/parent IDs have different roles [R1, R2]. GET defaults to `user_id_type=open_id`; user sender identity follows the query type, application senders use `app_id`, and Bot mention representation can change when the query type is explicitly selected [R7, R8]. Select the exact requested message from a potentially multi-item GET result.
- Lark documents `im:message.group_at_msg` / `:readonly` for user mentions and sensitive `im:message.group_msg` for all user group messages. Current Feishu adds `im:message.group_at_msg.include_bot:readonly` and `im:message.group_msg.include_bot:read`, excluding the current Bot's own messages. Keep the first tracer user-only; these documents differ and this Lark sandbox cannot prove Feishu behavior [R1, R2].
- A normal `chat_mode=group` may use `group_message_type=thread`; legacy `chat_mode=topic` is a distinct group form. A quoted flat reply and a topic reply are distinct even though the client can show both in a reply detail view [R4]. The sandbox first sent a flat checked reply, then explicitly created a topic, then sent a user @mention **inside** that topic.
- The long-connection guide describes clustered delivery: one random connected client receives each event, rather than broadcasting to every listener; up to 50 connections/app are documented [R6]. A second CLI event listener would compete with dsh-im. The sandbox stopped the previous task-owned Host for the same test app and used one SDK owner; unrelated Profiles were untouched.
- Reply requires current membership and speaking permission. Reply/GET limits are 1,000/min and 50/sec, while group sends share 5 QPS across group Bots. Refusals include recalled source (`230011`), frequency (`230020`), invisible source (`230050`), group topic refusal (`230071`) and aggregated-message topic refusal (`230072`) [R3]. A refused/unknown topic reply must never fall back to a different group send. The live stale-route probes verified only substituted group/thread refusal; recall, membership loss and these platform error codes were not live-tested.
- The installed SDK 1.73.0 generated handler and pinned 1.74.0 source both await dispatch before ACK; an exception produces a failed acknowledgement [R5]. Await only canonical durable acceptance in production, not model execution or external reply. Generic webhook retry intervals are not independently verified WS retry timing [R16].

### Normalized fixture seam and runnable verification

The application-defined fork exposes `describeBot`, `consumeInbound` and `replyChecked` through public same-Host `dshIm`. [QA probe](../../scripts/e2e-lark-provider-contract.mjs) and [regressions](../../scripts/test/e2e-lark-provider-contract.test.mjs) use that seam, with no private provider-store import or second SDK connection. The probe is opt-in through an isolated Profile Patch; it is absent from the production Bundle. Config and raw platform evidence remain local. Its atomic task-owned file records qualification evidence, **not** a Messaging store, Source Event, Inbox Admission or Outbox authority.

An illustrative redacted fixture (aliases are not native IDs):

```json
{
  "version": 1,
  "channel": "feishu",
  "botId": "account-reference",
  "fingerprint": "authenticated-account-fingerprint",
  "eventId": "delivery-event",
  "messageId": "provider-message",
  "actor": { "kind": "user", "id": "app-scoped-user-open-id" },
  "conversation": { "kind": "group", "id": "exact-group" },
  "mentions": [{ "id": "authenticated-bot-open-id", "key": "@_user_1" }],
  "mentionedAccount": true,
  "text": "[BH78 TOPIC] qualification",
  "reply": {
    "messageId": "provider-message",
    "conversationId": "exact-group",
    "actorId": "app-scoped-user-open-id",
    "threadId": "exact-topic",
    "rootId": "topic-root",
    "parentId": "reply-parent"
  },
  "replay": { "kind": "provider-redelivery", "resumeCursor": false, "gapPossible": true }
}
```

`replay.kind` declares how repeated input is classified, not evidence that replay happened during this run. The probe saves a message once, retains repeated delivery count, refuses a different account/group/user/non-mention, defers reply until after acceptance, stops effects on disposal and never automatically retries an accepted/in-flight/unknown attempt on restart. Corrupt persisted evidence fails closed.

See the [sandbox runbook and public evidence](evidence/78-lark-provider-contract/README.md) for reproduction, screenshots, exact runtime pins and explicit PASS/UNVERIFIED boundaries. Public evidence contains comparisons and counts rather than account IDs, names, credentials, login URLs, invite links or unrelated chat content. Actual Lark UI showed both ACK replies; screenshot evidence is a clearly labelled report derived from those real events and receipt reads, not a PersonaBot product UI.

### Remaining proof gates for #12

1. Freeze and adopt a compatible pinned provider artifact; this fork is tested source, not upstream acceptance or a published release.
2. Connect the exclusive consumer to the canonical Messaging command/transaction and an explicit PersonaBot Binding. Validate one Source Event, one Inbox Admission and one Orchestrator wake under real redelivery/restart fixtures.
3. Commit checked replies through the BotHarness Outbox, validate the observed Source Revision and account/route at execution, and preserve Unknown Outcome when provider reconciliation is unavailable.
4. Provide the Human-testable Binding/connection UI and real work-group @mention → PersonaBot execution → same-group/topic reply slice. Do not substitute the qualification probe for that tracer bullet.
5. Defer edit/recall, own-echo correlation, other-Bot/group background attention, richer content and gap recovery until their next explicit slice; keep capabilities honest meanwhile.

### Official references (retrieved 2026-10-01)

- R1: [Lark receive](https://open.larksuite.com/document/server-docs/im-v1/message/events/receive.md).
- R2: [Feishu receive](https://open.feishu.cn/document/server-docs/im-v1/message/events/receive.md).
- R3: [Lark reply](https://open.larksuite.com/document/server-docs/im-v1/message/reply.md), [Feishu reply](https://open.feishu.cn/document/server-docs/im-v1/message/reply.md).
- R4: [Lark thread introduction](https://open.larksuite.com/document/uAjLw4CM/ukTMukTMukTM/reference/im-v1/message/thread-introduction.md).
- R5: [Official dispatcher](https://github.com/larksuite/node-sdk/blob/394c83092395a51402ee408b751d7f9fb05f5518/dispatcher/event.ts#L123), [WS handler](https://github.com/larksuite/node-sdk/blob/394c83092395a51402ee408b751d7f9fb05f5518/ws-client/index.ts#L679).
- R6: [Feishu long-connection guide](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/event-subscription-guide/long-connection-mode.md).
- R7: [Lark message GET](https://open.larksuite.com/document/server-docs/im-v1/message/get-2.md).
- R8: [Feishu message GET](https://open.feishu.cn/document/server-docs/im-v1/message/get.md).
- R9: [Lark edit message](https://open.larksuite.com/document/uAjLw4CM/ukTMukTMukTM/reference/im-v1/message/update.md).
- R10: [Lark recall event](https://open.larksuite.com/document/server-docs/im-v1/message/events/recalled.md).
- R11: [Lark history pagination](https://open.larksuite.com/document/server-docs/im-v1/message/list.md), [official WS interface](https://github.com/larksuite/node-sdk/tree/394c83092395a51402ee408b751d7f9fb05f5518/ws-client).
- R12: [Lark reaction-created event](https://open.larksuite.com/document/server-docs/im-v1/message-reaction/event/created.md).
- R13: [Official CLI card action](https://github.com/larksuite/cli/blob/7beffb086d7fa3c5b843d8affa7c089f49cfc65e/events/im/card_action.go).
- R14: [Lark resource download](https://open.larksuite.com/document/server-docs/im-v1/message/get.md).
- R15: [Feishu resource download](https://open.feishu.cn/document/server-docs/im-v1/message/get-2.md).
- R16: [Lark generic event overview](https://open.larksuite.com/document/server-docs/event-subscription/overview-of-event-subscription.md).
- R17: [Lark internal-app token authentication](https://open.larksuite.com/document/server-docs/getting-started/api-access-token/auth-v3/tenant_access_token_internal.md).
- R18: [Lark account/tenant FAQ](https://open.larksuite.com/document/server-docs/im-v1/faq.md).

---

## 2026-09-20 historical edit/recall snapshot

## Scope and snapshot

This note answers the factual prerequisite behind BotHarness architecture question Q17:

1. Does Feishu/Lark publish message-edit and message-recall events to apps/bots?
2. Which identifiers and version/routing fields are present?
3. Do the three currently referenced bridge implementations consume those events?

Sources are limited to the official Feishu/Lark documentation, the official Lark Node SDK, and the three named source repositories. Repository observations are pinned to the following revisions (retrieved 2026-09-20):

| Source                  | Revision                                                                                             | Package version |
| ----------------------- | ---------------------------------------------------------------------------------------------------- | --------------- |
| `larksuite/node-sdk`    | [`394c8309`](https://github.com/larksuite/node-sdk/tree/394c83092395a51402ee408b751d7f9fb05f5518)    | 1.74.0          |
| `xmanrui/dsh-im`        | [`cba275c6`](https://github.com/xmanrui/dsh-im/tree/cba275c63b38850f6549d8efb3d1a2880bc9f332)        | 4.22.0          |
| `amlyczz/dsh-lark-link` | [`8b6c5d99`](https://github.com/amlyczz/dsh-lark-link/tree/8b6c5d99b5d5baf19a75d482e999cd246aa79c7a) | 0.5.4           |
| `imetn/dsh-lark-bridge` | [`f1e544cc`](https://github.com/imetn/dsh-lark-bridge/tree/f1e544cce5108873e238313bf7c5ccf092827e2a) | 0.1.0           |

## Result

- **Recall is a documented inbound event.** Its exact event name is `im.message.recalled_v1`. It identifies the recalled message with `message_id` and the conversation with `chat_id`, and includes `recall_time` and `recall_type`. It does **not** include message content, `root_id`, `parent_id`, `thread_id`, an editor/actor ID, or a message version. The official page labels the push mode as Webhook, while its SDK examples explicitly show both long connection (`WSClient`) and HTTP webhook registration. [Official recall-event documentation](https://open.feishu.cn/document/server-docs/im-v1/message/events/recalled) and [official generated event type](https://github.com/larksuite/node-sdk/blob/394c83092395a51402ee408b751d7f9fb05f5518/code-gen/events-template.ts#L4305-L4327).
- **No documented message-edited/updated inbound event was found.** The current official Feishu and Lark messaging indexes enumerate receive, read, recall, and reaction events, but no edit/update event. The official Node SDK's generated IM event catalog likewise has no `im.message.*edited*` or `im.message.*updated*` handler key. Feishu does expose an outbound **Edit message** API; that is not an edit notification. [Feishu messaging index](https://open.feishu.cn/llms-docs/zh-CN/llms-messaging.txt), [Lark messaging index](https://open.larksuite.com/llms-docs/en-US/llms-messaging.txt), and [official SDK event catalog](https://github.com/larksuite/node-sdk/blob/394c83092395a51402ee408b751d7f9fb05f5518/code-gen/events-template.ts#L4071-L4462).
- `im.message.receive_v1` carries `message_id`, `chat_id`, `root_id`, `parent_id`, `thread_id`, content, `create_time`, and optional `update_time`. However, the official trigger description only promises delivery when the bot **receives a sent message**; it does not say that a later user edit re-emits this event. Therefore `update_time` must not be treated as proof of live edit notifications. The same page warns that delivery can be duplicated and says to deduplicate by `message_id`, not `event_id`. [Official receive-event documentation](https://open.feishu.cn/document/server-docs/im-v1/message/events/receive) and [official generated receive type](https://github.com/larksuite/node-sdk/blob/394c83092395a51402ee408b751d7f9fb05f5518/code-gen/events-template.ts#L4422-L4462).
- The message GET API, `GET /open-apis/im/v1/messages/:message_id`, can be used to reconcile current state. Its response includes the current body plus `updated`, `update_time`, `deleted`, `chat_id`, `root_id`, `parent_id`, and `thread_id`. This is a read API, not an event stream. Receiving a message does **not** by itself prove the app has permission to call it: the GET API requires `im:message` or `im:message:readonly`, and application-identity reads of group messages additionally require `im:message.group_msg`. [Official GET-message documentation](https://open.feishu.cn/document/server-docs/im-v1/message/get) and [official SDK response type](https://github.com/larksuite/node-sdk/blob/394c83092395a51402ee408b751d7f9fb05f5518/code-gen/projects/im.ts#L994-L1062).
- The GET documentation has a recall-related ambiguity that requires live verification: the response schema describes `deleted: true` with no content for a recalled/deleted message, but the error table also documents error `230110` as "Action unavailable as the message has been deleted." BotHarness should use the recall event as the authoritative tombstone and must not depend on a successful post-recall GET.

## Current plugin implementation

| Implementation    | Subscribed/handled inbound events                                                                                                                                                                                                                                                                                                                                                                                                                   | Edit/recall result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dsh-im`          | One-click provisioning subscribes only `im.message.receive_v1`; runtime handlers are receive, reaction-created/deleted, and card action. [Provisioning](https://github.com/xmanrui/dsh-im/blob/cba275c63b38850f6549d8efb3d1a2880bc9f332/src/channels/feishu/plugin-controller.mjs#L97-L112), [runtime dispatcher](https://github.com/xmanrui/dsh-im/blob/cba275c63b38850f6549d8efb3d1a2880bc9f332/src/channels/feishu/feishu-runtime.mjs#L335-L350) | **Neither is handled.** Recall is not subscribed or registered. Inbound receive events are deduplicated by `message_id`, so a hypothetical second receive event with the same ID would also be dropped rather than represented as a revision. [Deduplication](https://github.com/xmanrui/dsh-im/blob/cba275c63b38850f6549d8efb3d1a2880bc9f332/src/channels/feishu/bridge.mjs#L935-L970)                                                                                                                                                                                           |
| `dsh-lark-link`   | Declares `im.message.receive_v1` as its sole required event; transport wires only receive plus card action. [Setup](https://github.com/amlyczz/dsh-lark-link/blob/8b6c5d99b5d5baf19a75d482e999cd246aa79c7a/src/host/auth-setup.ts#L23-L40), [transport](https://github.com/amlyczz/dsh-lark-link/blob/8b6c5d99b5d5baf19a75d482e999cd246aa79c7a/src/inbound/transport.ts#L337-L375)                                                                  | **Neither is handled.** Its normalized inbound type keeps message/chat/root/parent/thread/create time but not `update_time`, `updated`, or `deleted`. [Normalization](https://github.com/amlyczz/dsh-lark-link/blob/8b6c5d99b5d5baf19a75d482e999cd246aa79c7a/src/inbound/transport.ts#L165-L233) Its disconnect compensation lists `message_id` and `create_time` and deduplicates by message ID; it is not an edit reconciler. [Compensation](https://github.com/amlyczz/dsh-lark-link/blob/8b6c5d99b5d5baf19a75d482e999cd246aa79c7a/src/inbound/missed-compensation.ts#L30-L82) |
| `dsh-lark-bridge` | Provisioning requests receive plus reaction-created; the bridge consumes normalized `message`, `reject`, `cardAction`, and `reaction` events. [Provisioning](https://github.com/imetn/dsh-lark-bridge/blob/f1e544cce5108873e238313bf7c5ccf092827e2a/src/cli.ts#L282-L296), [handlers](https://github.com/imetn/dsh-lark-bridge/blob/f1e544cce5108873e238313bf7c5ccf092827e2a/src/bridge.ts#L345-L386)                                               | **Neither is handled.** Its channel seam exposes no edit or recall event. The official SDK channel layer it uses currently also registers receive/reactions but not recall and has no recall/edit member in `EventMap`. [Official channel dispatcher](https://github.com/larksuite/node-sdk/blob/394c83092395a51402ee408b751d7f9fb05f5518/channel/channel.ts#L475-L525), [official `EventMap`](https://github.com/larksuite/node-sdk/blob/394c83092395a51402ee408b751d7f9fb05f5518/channel/types.ts#L103-L119)                                                                    |

None of the three repositories calls the GET-message endpoint to compare `update_time` or current content. `dsh-lark-link` requests the broad `im:message` and `im:message.group_msg` scopes, so it has the closest permission basis for group reconciliation, but it does not implement that reconciliation. `dsh-im` requests `im:message:readonly` and can add `im:message.group_msg` in its all-group-message mode; `dsh-lark-bridge`'s setup requests `im:message:readonly` plus group-mention receive permission, not `im:message.group_msg`. These scope observations do not substitute for an installed-app permission and live API check.

## Consequences for BotHarness Q17

1. **Recall can be modeled now as a new immutable Source Event.** The Bridge should subscribe to `im.message.recalled_v1`, resolve `(provider/app binding, message_id)` to the original Source Event, and append a recall/tombstone Source Event. If the original event was admitted to a Bot Inbox, the recall should create a new Inbox Admission for the same target Bot, governed by its own Trigger and Wake Policy. It should not overwrite or erase the original Source Event.
2. **The original event must retain routing data.** Since a recall event lacks thread/root/parent IDs, BotHarness needs the original event's saved Reply Route and an index by provider message ID to identify the affected Channel/thread and Inbox admissions.
3. **Live user edits are not currently an event-driven guarantee.** Q17 should specify a provider capability boundary: if a future provider or plugin supplies an edit event, append a revision Source Event and a fresh Inbox Admission. For Feishu/Lark today, use optional on-demand reconciliation through GET-message only where scopes allow it, compare `update_time` and content against the stored revision, and append a revision event only when a change is observed.
4. **Do not silently turn every read into polling.** Periodically polling every stored message would add API load and still not be a reliable event stream. Suitable reconciliation points are explicit refresh, reply/use of a source item, recovery of an unresolved item, or a bounded provider-specific policy. Which points should wake an Orchestrator remains a BotHarness Trigger/Wake Policy decision, not a Feishu transport fact.
5. **Version-aware idempotency is required for revision-capable providers.** The current plugins key deduplication solely by `message_id`. BotHarness should key an original message by provider message ID but key revisions by a provider version/update timestamp or by a deterministic content revision hash; otherwise a same-ID revision will be mistaken for a delivery retry.

## Remaining uncertainties requiring live verification

- Whether the installed Feishu/Lark tenant and app configuration actually permit `im.message.recalled_v1` over the selected long-connection setup. The official examples say yes, but none of the three plugins currently subscribes to it.
- The actual GET-message behavior after a recall (`deleted: true` response versus error `230110`).
- Whether any tenant/client behavior re-delivers `im.message.receive_v1` after a user edit. The official contract does not promise this, so a positive observation would be a provider behavior test, not a portable API guarantee.
