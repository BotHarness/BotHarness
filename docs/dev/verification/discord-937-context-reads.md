# Discord bounded context reads — verification scope

## Candidate checkpoint — 2026-10-06

[#937](https://github.com/BotHarness/BotHarness/issues/937) adds explicit bounded Human-text reads from the already authorized guild text channel or an existing public thread. Real model channel and thread read/reply checks passed on the development candidate. Final model continuation and patched-source-conflict acceptance remain pending a specifically authorized temporary Message Content enablement. The combined history/nearby/topic capability row stays unqualified; product Provider promotion, release and deployment remain separate.

The application-defined path is `bridge_context` → `MessagingProvider.history` → registered `historyChecked`. `bridge_read` reads the retained source itself. The Provider Plugin owns native identity, source ancestry, permissions, normalization and signed runtime-local continuations. Existing canonical Binding/Grant and Host authorization still gate every read. Each native page is at most 20 messages; the Host also bounds serialized model context and can return its own continuation before the next native page. Bot/webhook/system and empty/non-text messages are omitted. `incomplete` can describe omissions even when no next cursor exists; it never means a complete archive.

### Native content preflight and model paths

| Check                                                   | Observed result                                                                                                                                                           | Evidence boundary                                                                                                                             |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Ordinary channel message, Message Content OFF           | Browser shows `cobalt-37`; native HTTP 200 censors its ordinary body. All canonical rows remain exactly unchanged.                                                        | Actual non-mentioned Human source; censored success is not empty complete history.                                                            |
| Same source, specifically authorized Message Content ON | Native body becomes visible; canonical records remain unchanged before explicit context reads.                                                                            | Only the original QA App flag changes; Presence/Members stay OFF.                                                                             |
| Channel mention → real model context → own reply        | Actual `bridge_context(group)` returns the ordinary `cobalt-37`; one `bridge_reply` produces `DISCORD-937-GROUP-OK:cobalt-37` under the original source.                  | Call/result IDs, canonical intent and independent own-Bot native receipt agree; 42 Admissions / 37 Intents / 6 placements.                    |
| Existing public thread                                  | Ordinary `iris-62` creates no Admission or intent. A fresh mention calls `bridge_context(thread)` and replies `DISCORD-937-THREAD-OK:iris-62` once in that child channel. | Native actor, original source reference and child location verified; 43 / 38 / 6. No new native thread or Session.                            |
| Native two-page reader                                  | Two actual native limit-2 pages; Bot text omitted. Tampered and cross-route cursors refuse before another page fetch; caller cancellation refuses.                        | Direct production Provider reader against the native QA account, separate from model pagination. Canonical rows unchanged.                    |
| First actual model continuation                         | Page 1 succeeds, then page 2 includes a source edited in earlier #855 QA; canonical conflict is wrapped as a generic transaction failure.                                 | Model does not claim success or reply externally. It writes one explicit failure report to its local DM, adding one ordinary local placement. |
| Message Content restored OFF                            | Native flag verified OFF; a fresh actual model context call refuses `history-permission-denied`, then one native own-location reply reports that code.                    | 45 Admissions / 39 Intents / 7 placements. Original Binding/Grant and all original placements preserved.                                      |
| Cold Host restart with patched classification           | All six canonical table snapshots are exactly equal before/after restart, including settled outcomes; both QA connections recover.                                        | No automatic resend/backfill. Fresh patched positive/conflict paths remain pending.                                                           |

![Actual channel context and original-source reply](../../assets/pr/937-discord-context/group-context-native.jpg)

![Actual existing-thread context and child-channel reply](../../assets/pr/937-discord-context/thread-context-native.jpg)

![Fresh model refusal after restoring Message Content OFF](../../assets/pr/937-discord-context/content-off-refusal-native.jpg)

![Saved native Message Content OFF restoration](../../assets/pr/937-discord-context/message-content-restored-off.jpg)

These are actual Chinese/dark browser captures at 1230 × 820, showing distinct runtime cases rather than a rendered Client before/after change. No visible Client code changes in this slice. Credentials and full native/model logs stay private. Sanitized [channel](../../assets/pr/937-discord-context/group-e2e-proof.json), [thread](../../assets/pr/937-discord-context/thread-e2e-proof.json), [native pages](../../assets/pr/937-discord-context/native-pages-proof.json) and [restored refusal](../../assets/pr/937-discord-context/off-e2e-proof.json) assertions distinguish each evidence layer.

### Edited-source refusal regression

Native inspection confirms one historical QA source has different current and retained body, with the same actor and route. A deterministic continuation regression reproduces the generic `Operational transaction for messaging failed` result. Context persistence now uses the existing Messaging transaction boundary, preserving `source-conflict` for the caller and refusal audit. The entire conflicting page rolls back, retains the old source unchanged and creates no new Admission; it does not overwrite evidence or silently skip a conflicting Human message. The related Core suite passes 102 tests. This fixes classification; it does not synchronize remote edits/deletions.

### Immutable candidate and limitations

- DSH `0.2.0-rc.1`; isolated original QA Profile, one checked receiver, existing Orchestrator.
- Provider source `263137fe27026ec8fa70afebc0644abcebdd6bcb`, base `1a605b11fa8d321110540de42d58a77bdcd60f13`; 395 runtime files, SHA-256 `6efccd475a1dee29722aaf78829ae1feb6c6c6bcb4d88329d47f0db9116b8bc1`. Host artifact rebuilt, Client artifact unchanged; full Provider suite 3,584 passed and package verification passed.
- Positive model paths used Core `53ee580d24a3a4dffe5c6503cd03311ff1053a36`; restored refusal used the same build. Cold restart then used the `1ec6c20c3768442160c94d9ec64e8b6c9138ec3c` conflict-classification patch. Full Core verification: 2,639 passed / 9 skipped; lint, typecheck, formatting, ledgers, build and docs build passed. Final fresh acceptance remains pending.
- Gateway identify remains `GUILDS | GUILD_MESSAGES`; App Message Content visibility controls HTTP bodies independently. Ordinary reception, nearby windows/count minima, files, new/private threads, autonomous following and proactive posts are outside this tracer.
- Original identity/Grant, product Provider pin and unrelated QA Profiles stay unchanged. The narrow temporary access expansion was restored OFF before further debugging.

Primary native contracts: [Message Content and HTTP restrictions](https://docs.discord.com/developers/events/gateway#message-content-intent), [Get Channel Messages](https://docs.discord.com/developers/resources/message#get-channel-messages), [Threads](https://docs.discord.com/developers/topics/threads). See the maintained [IM Provider integration guide](../guides/im-provider-integration.md) and earlier [mention/reply qualification](discord-855-mention-reply.md).
