# Slack source attachment tracer (#831)

All captured messages and files are synthetic QA data, shared with Human authorization in the dedicated public Slack QA channel. Credentials, private file URLs and raw Host logs are excluded.

- Before: exact main `c180368acf25e223e463ec52898dcc92ec68b1fe`, qualified prior Provider `b020d3bab941aeb9acc303b719e691554ef10ec4`. The text-source Modal is the previous entry point; Slack file intake was not qualified there. This is an absence-state comparison, not the same source on both versions.
- After: application runtime at `3eb1ffc3` (later `4c651eb8` adds only a test and the final immutable Provider pin), qualified Provider `b442da91b267412e84a4d18224adc30777024862`; Chinese, dark, 1230 × 820. Slack screenshot uses its native viewport.
- Human-authorized installation added only `files:read` and `files:write` to the existing QA App. App mention subscriptions, channel authorization and identity stayed unchanged.
- Final genuine thread mention `[BH831 FILE 02]` carried one 147-byte ZIP. It reached canonical Source Event / Inbox; the real model saved an independent copy through `bridge_attachment_save`, processed the synthetic input through a one-time native tool approval, imported a new result and called `bridge_reply_file`.
- Slack accepted a single 152-byte result in the original thread. Independent `files.info`, native thread-message lookup and private authenticated download confirmed the file ID, original thread, byte hash and expected `result.txt` contents. See `independent-proof.json`.
- Source Modal displayed sender, receiving identity, native message and file name / MIME / declared bytes. Clicking Download completed its busy state without a visible error. Browser download-event capture timed out; no assertion is made about a captured browser-save path. An independent call to the identical authenticated Host attachment endpoint returned HTTP 200 and byte-for-byte original content; see `source-proof.json`. Human can exercise the visible download control in the preserved QA instance.
- The initial `[BH831 FILE 01]` did not reach Inbox because the production runtime factory dropped the Consumer file opt-in. A focused factory regression and corrected final Provider fix the seam; the final evidence uses a fresh Slack message, not injected replay.

## Reproduce

1. Open the preserved isolated QA instance and PersonaBot Slack Intake QA #802.
2. In Bot Inbox, expand processed messages for `botharness-im-qa-802`, then open `[BH831 FILE 02]`.
3. Inspect file name, MIME, size and Download; source details retain native association IDs.
4. In the Slack QA channel, open the original `[BH802 ROOT 01]` thread and find the Bot's `bh831-result.zip` immediately after FILE 02. Download and inspect `result.txt`: `BH831-SLACK-FILE-OUTPUT` followed by `count=6`.

Scope: one hosted file, Human @, existing authorized public QA channel and original thread. No ordinary-message intake, private channels / DMs, history-file search, image interpretation, defaults editor or packaging change.
