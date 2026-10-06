# Discord nearby context candidate — #981

This is development-source qualification of the next narrow slice after accepted #937. Agent-performed real native nearby pagination, original-thread reply and exact temporary permission restoration have passed; the product Provider pin, ordinary intake and combined history/nearby/topic qualification are unchanged.

## Runtime and checks

- OFF-evidence Core runtime: `74cb0678752c6e48aefd3450186a92a8c12df39e`, based on merged-main `632e79821e9f8d6cde996134a4986065cbb08ef2`.
- Isolated Provider candidate: `5ae8bb3b1b0bb4067bf240e0dfb6fbe38d582c32`; loaded `lib/index.js` SHA-256 `a59c18c5323cc2852f43f88187237fcc6e997e520520fb18bc0c47151816221b` matches the candidate artifact.
- DSH `0.2.0-rc.1`; actual Session request uses DeepSeek Pro/off. The persistent QA Profile reuses #937's one original Binding/Grant and native App/channel/existing public thread.
- Provider build, 3,594 full tests and package verification pass, including dense/sparse/boundary/count/omission/snapshot/cursor/expiry/restart/cancellation checks. Host lint, format, types, 104 focused context/canonical checks, full 2,740 tests / 9 skipped, build, bilingual ledgers and 366-page docs pass. These were the initial local checks. After merging main `c7a7ddacc02eb7acb44a50ea3416f97319889528`, positive E2E ran on Core `7edd33e03876c7638fa781deb968fe565851d193`: local lint/format/types/ledgers/slides, 2,745 tests / 9 skipped, build and 368-page docs pass. Its exact-head [CI run 37430597789](https://github.com/BotHarness/BotHarness/actions/runs/37430597789) also passed. Later evidence-only commits have their own PR checks; they do not change this runtime input. CodeRabbit skipped the draft, so that green context is not review evidence.

## Query behavior

`bridge_context(nearby)` reads the source's exact native channel or existing public thread. It assembles the five-minute window on either side using page-bounded newest-first native requests, supplements sparse sides with the closest supported Human texts to the requested minima (defaults 10 preceding / 5 following), and includes the anchor independently. A dense window is not capped at those minima; sparse exhausted history may return fewer and future messages are never awaited.

Continuations contain signed, body-free runtime state, an immutable snapshot ceiling and a 30-minute lifetime renewed after successful pages. Every read rechecks the native account, ancestry and current content/read permissions plus existing Host authority. Restart or query/identity changes invalidate old cursors. Bot/webhook/system/unsupported text is omitted honestly. The existing canonical reconciliation/audit owns retained context, with no new transcript store, ordinary Admission, placement, listener or Session.

[Discord's native contract](https://docs.discord.com/developers/resources/message#get-channel-messages) defines newest-first pages and mutually exclusive before/after/around boundaries. The bounded assembly implements this narrower nearby contract; it is not provider-wide search or a full archive.

## Accepted negative path and stable restart

With native App flags `0`, a real browser mention caused one actual model `bridge_context` call with scope nearby, before_count 10 and after_count 5. Its actual result was `Error: history-permission-denied`; one `bridge_reply` settled provider-accepted and independently read back as `DISCORD-981-NEARBY-OFF:history-permission-denied` from the own Bot in the original public thread, referencing the fresh Human source. The source audit records nearby/refused with no history source IDs. All prior canonical rows remain byte-identical; only the fresh trigger Source Event, its Admission and one reply Intent were added. Binding/Grant/placements are unchanged.

The first latest-main startup created one Memory-change Source Event and Admission, with no external source or reply; it is recorded separately rather than called a table-preserving restart. After initialization, a second cold restart preserved all six canonical tables byte-for-byte. Settled counts after the OFF case: 1 Binding / 1 Grant / 23 Source Events / 6 Admissions / 4 Outbox replies / 2 placements. These cumulative counts include the earlier DM and Memory initialization.

![Real nearby OFF refusal](../../assets/pr/981-discord-nearby/nearby-off-model-native.jpg)

[Model/native/canonical proof](../../assets/pr/981-discord-nearby/nearby-off-proof.json) · [settled cold restart proof](../../assets/pr/981-discord-nearby/cold-restart-proof.json)

## Accepted positive pagination and restoration

A fresh browser mention asked the same real model to read an existing admitted source in the original public thread with nearby 10/5 and to reuse each returned cursor exactly. Three actual `bridge_context` results returned **11 / 0 / 5** Human texts, with **8 / 3 / 0** native omissions. The empty intermediate page retained its legitimate continuation; the final page had no cursor and `incomplete=false`. Independent native messages match all 16 returned bodies, sender identities and exact thread. The anchor appears once; the other IDs are the nearest 10 preceding and 5 following supported Human texts. This sparse native case qualifies nearest supplementation and continuation; dense-window completeness and edge/restart/cancellation behavior have automated fixtures rather than a fresh dense native claim.

One `bridge_reply` replied to the **fresh trigger**, not the already-replied old anchor. Native message `1556935049557966871` is from own Bot `1556613973846007899` in exact thread `1556622420222283798`, referencing trigger `1556934836273287291`. Its independently read text reports `pages=3;unique=16;complete=true` and exactly the returned IDs.

Canonical comparison added two Source Events (the fresh trigger and one previously unretained historical message), one Admission for the trigger and one Outbox reply. No historical Admission, placement or Binding/Grant change occurred. The sole changed prior Source row appends three read audits to the bound anchor; its canonical body and all other prior rows remain unchanged. Message Content was then restored OFF; native App flags returned from `524288` to `0`, Presence/Members remained OFF, and the portal had no unsaved changes. Both permission restoration and a final cold restart preserve all six tables byte-for-byte: 1 Binding / 1 Grant / 25 Sources / 7 Admissions / 5 Outbox replies / 2 placements.

![Real nearby positive pagination and original-thread reply](../../assets/pr/981-discord-nearby/nearby-on-model-native.jpg)

![Temporary permission restored OFF](../../assets/pr/981-discord-nearby/portal-restored-off.jpg)

[Sanitized actual Tool/native/canonical/restore proof](../../assets/pr/981-discord-nearby/nearby-positive-proof.json) records call IDs, exact native references, cursor hashes (not reusable cursor bodies), counts and immutable inputs. Agent E2E acceptance is complete; merge, product Provider promotion, release and deployment remain separate actions.
