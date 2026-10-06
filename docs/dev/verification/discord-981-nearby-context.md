# Discord nearby context candidate — #981

This is development-source qualification of the next narrow slice after accepted #937. Positive native nearby pagination remains pending action-time permission; the product Provider pin, ordinary intake and combined history/nearby/topic qualification are unchanged.

## Runtime and checks

- Core runtime: `74cb0678752c6e48aefd3450186a92a8c12df39e`, based on merged-main `632e79821e9f8d6cde996134a4986065cbb08ef2`.
- Isolated Provider candidate: `5ae8bb3b1b0bb4067bf240e0dfb6fbe38d582c32`; loaded `lib/index.js` SHA-256 `a59c18c5323cc2852f43f88187237fcc6e997e520520fb18bc0c47151816221b` matches the candidate artifact.
- DSH `0.2.0-rc.1`; actual Session request uses DeepSeek Pro/off. The persistent QA Profile reuses #937's one original Binding/Grant and native App/channel/existing public thread.
- Provider build, 3,594 full tests and package verification pass, including dense/sparse/boundary/count/omission/snapshot/cursor/expiry/restart/cancellation checks. Host lint, format, types, 104 focused context/canonical checks, full 2,740 tests / 9 skipped, build, bilingual ledgers and 366-page docs pass. These are local checks; hosted CI is independently reported by the PR.

## Query behavior

`bridge_context(nearby)` reads the source's exact native channel or existing public thread. It assembles the five-minute window on either side using page-bounded newest-first native requests, supplements sparse sides with the closest supported Human texts to the requested minima (defaults 10 preceding / 5 following), and includes the anchor independently. A dense window is not capped at those minima; sparse exhausted history may return fewer and future messages are never awaited.

Continuations contain signed, body-free runtime state, an immutable snapshot ceiling and a 30-minute lifetime renewed after successful pages. Every read rechecks the native account, ancestry and current content/read permissions plus existing Host authority. Restart or query/identity changes invalidate old cursors. Bot/webhook/system/unsupported text is omitted honestly. The existing canonical reconciliation/audit owns retained context, with no new transcript store, ordinary Admission, placement, listener or Session.

[Discord's native contract](https://docs.discord.com/developers/resources/message#get-channel-messages) defines newest-first pages and mutually exclusive before/after/around boundaries. The bounded assembly implements this narrower nearby contract; it is not provider-wide search or a full archive.

## Accepted negative path and stable restart

With native App flags `0`, a real browser mention caused one actual model `bridge_context` call with scope nearby, before_count 10 and after_count 5. Its actual result was `Error: history-permission-denied`; one `bridge_reply` settled provider-accepted and independently read back as `DISCORD-981-NEARBY-OFF:history-permission-denied` from the own Bot in the original public thread, referencing the fresh Human source. The source audit records nearby/refused with no history source IDs. All prior canonical rows remain byte-identical; only the fresh trigger Source Event, its Admission and one reply Intent were added. Binding/Grant/placements are unchanged.

The first latest-main startup created one Memory-change Source Event and Admission, with no external source or reply; it is recorded separately rather than called a table-preserving restart. After initialization, a second cold restart preserved all six canonical tables byte-for-byte. Settled counts after the OFF case: 1 Binding / 1 Grant / 23 Source Events / 6 Admissions / 4 Outbox replies / 2 placements. These cumulative counts include the earlier DM and Memory initialization.

![Real nearby OFF refusal](../../assets/pr/981-discord-nearby/nearby-off-model-native.jpg)

[Model/native/canonical proof](../../assets/pr/981-discord-nearby/nearby-off-proof.json) · [settled cold restart proof](../../assets/pr/981-discord-nearby/cold-restart-proof.json)

## Remaining acceptance

Agent-performed real-model positive nearby reads, continuation, native original-location reply and precise temporary Message Content restoration remain pending. Enabling native content visibility needs new action-time authorization after the previous #937 window was restored OFF. No manual Human QA gate, product promotion, release or deployment is inferred.
