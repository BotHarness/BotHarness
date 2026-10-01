---
Status: Accepted
Date: 2026-10-01
---

# External files use trusted source capabilities and the existing Attachment owner

The first Lark file tracer extends ADR-0106's existing public same-Host dsh-im Service. It receives a user text mention replying to one file message, processes an independent working copy and explicitly replies with a new result in the same topic. File capabilities do not create a second connection, file catalog, message transcript, local Channel or Human DM placement.

## Source and acquisition

The provider authenticates its account fingerprint, resolves exactly the received text's parent with that Bot's SDK, and retains one file descriptor `{id,messageId,resourceKey,name}` with the trusted conversation and thread/root/parent route. This is one causal parent lookup, not general history access. Messaging validates the descriptor's parent association and stores it in the existing immutable Source Event/Inbox transaction. Changed descriptors on redelivery are conflicting evidence rather than fresh authority. Metadata does not claim a MIME type or size before bytes are available.

The existing Source Event detail view shows the filename and an explicit download action. Both Human download and `bridge_attachment_save` use the same source-qualified acquisition. An opaque descriptor ID selects only that admitted source's file; model-supplied paths, resource keys, accounts and URLs never select provider resources. Current Binding, Grant revision, active Bot, exclusive reception lease and provider Registration are required before acquisition. The provider rechecks the original mention and parent resource against its SDK before fetching bytes.

The existing Attachment owner materializes bytes only on first access. A stable opaque file identity derives from the authenticated provider/account/conversation/file association, and its ordinary owner receipt makes completed acquisition reusable after restart. In-flight acquisitions share that owner operation. Existing edited contents remain current; a receipt whose destination is missing fails instead of downloading and reconstructing an original. No parser, document text cache, history archive or parallel durable transfer table is introduced. Received bytes are limited to 25 MiB, with bounded cancellation and source/registration checks during transfer; AX logs record bounded lifecycle facts without credentials or raw content.

## Working files and explicit reply

`bridge_attachment_save` checks a Human-selected Workspace Grant's current Orchestrator write permission, saves an independent file without overwriting, and returns its path. Native file tools and approved Shell use that Grant's existing execution seam. The source lease never authorizes editing a remote original or another attachment. Revocation stops new source calls and in-flight downloads; a completed independent working file remains subject to its own Grant.

`channel_attachment_import` explicitly selects a result under current Memory/Grant read authority, including an Inbox-only turn. The current run retains the returned owner reference as its selection. `bridge_reply_file` accepts only that selected file ID and the canonical source ID. It shares the existing one durable reply intent per source with text `bridge_reply`, so a preliminary text acknowledgement cannot silently become a second file send.

Messaging records the file reference in the existing Outbox JSON and marks its attempt before provider effects. Current Binding, Grant, reception and trusted topic are checked again before sending. The provider uses its existing native uploader, rechecks account/runtime/source after upload and replies to the exact source message/topic. Upload failure, explicit rejection, provider acceptance and uncertain interruption remain distinct. Uncertain replies are never blindly retried or retargeted; restart preserves the existing terminal or unknown result instead of resending. No remote original replacement is supported.

## Qualification and reversal

This capability uses the temporary [DoodleBears/dsh-im source](https://github.com/DoodleBears/dsh-im/commit/3784a5cb2e5a2aec6eb3a89c9eccf5426b9fb103) on DSH `0.2.0-rc.1`, retaining ADR-0104's explicit installation and fixed runtime digest. `fileVersion: 1`, `source-file-checked` and `reply-file-checked` are additive public capabilities; legacy text contracts remain version 1. This is not an upstream package release or production enablement. Slack, rich-text normalization, general history and ordinary group subscription remain separate slices.

No schema migration is added. Reverting code disables future file capabilities but does not remove owner files, retained Source Events, Outbox history or already sent platform messages. Preserve their canonical records and recover forward when an external send outcome is unknown. Human QA follows the completed vertical tracer before sibling scope expands.

## References

- [#657](https://github.com/BotHarness/BotHarness/issues/657), [#631](https://github.com/BotHarness/BotHarness/issues/631), ADR-0104, ADR-0105 and ADR-0106.
- [File operations guide](../file-open.md), [isolated provider guide](../client-bridge.md#qualified-optional-im-provider).
- Official Lark CLI references for [resource download](https://github.com/larksuite/cli/blob/main/skills/lark-im/references/lark-im-messages-resources-download.md) and [message reply](https://github.com/larksuite/cli/blob/main/skills/lark-im/references/lark-im-messages-reply.md).
