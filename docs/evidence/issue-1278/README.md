# Inbox history runtime verification

Verified against the pinned DSH `0.2.0-rc.1` and a real DeepSeek model on 2026-10-09.
[runtime.json](runtime.json) contains the bounded native Tool calls/results from the successful turn, with no credentials, login URL, system prompt or filesystem dump.

1. Build the branch and launch an isolated Profile with `node scripts/dev-instance.mjs --home <absolute-task-owned-home> --port <unused-port> --json`.
2. Create a Bot and send a DM containing “星期五发布。Nova owns the launch checklist.” Ask it to acknowledge through `channel_send` without writing Memory. Wait until the message is handled.
3. Record that message's time. Stop the exact launched Host PID. For a new-Session fixture, use the application's Session Ownership `markContentUnavailable()` while the Host is stopped, then close the owner; this leaves canonical Inbox history unchanged and represents the same unavailable-Session state as a portable restore. Do this only in the isolated QA Profile. Restart the same Profile.
4. Ask the Bot to call `inbox_history` twice, with `query="Nova"` and `query="星期五"`, `kind="dm"`, and an `until` timestamp between the seed and the query message. Ask it to report the result's id and state through `channel_send` without reading Channels or files.
5. Both calls return the old handled Source Event. The new native Orchestrator Session differs from the seed Session, and the successful turn uses only two `inbox_history` calls and one `channel_send`, with no approval request. The browser console is empty and the Client diagnostic attempt reports `shell-ready`.

The first runtime attempt exposed a missing name in the checked Bot Tool execution policy. The original approval card was preserved, rejected, and the owned Host rebuilt/restarted before a fresh successful turn; approving that card would not have validated the intended behavior. One browser navigation timed out even though navigation completed; the existing tab, fresh DOM, diagnostic attempt and actual DM reply were inspected separately.

Automated coverage also checks own-Bot scope, handled and pending admissions, empty-body commit/action records, Chinese/English/path matching, filters, tied timestamps and concurrent inserts, frozen relevance order, expiry, transactional rollback, update/retraction/purge (including purged causes), physical removal of purged FTS tokens, index rebuild and Generation 76 upgrade/restart. FTS5 `secure-delete` is enabled alongside the Purge owner's existing SQLite `secure_delete` setting ([SQLite contract](https://www.sqlite.org/fts5.html#the_secure_delete_configuration_option)). No Client component or visible control changed in this Host/Tool/prompt slice.
