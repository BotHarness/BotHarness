# ADR-0128: Discord checked replies preserve native child-channel routing

- Status: Proposed; implementation candidate, pending real Discord qualification and Human QA
- Date: 2026-10-05
- Issue: [#855](https://github.com/BotHarness/BotHarness/issues/855)

## Context

The generic dsh-im Discord transport creates native threads after channel mentions and owns standalone DSH Sessions. BotHarness needs the existing canonical Inbox/Orchestrator path, with a responder's own identity and a reply in the original channel or an existing public thread. Generic SDK support does not qualify this application-defined contract.

## Decision candidate

Keep the DSH-native Plugin/Fiber and checked Service Definition → Provider → Consumer seam. The Provider owns one Gateway connection and DSH credential references. Messaging retains Binding, Grant, Source Event, Inbox Admission, trusted Reply Route and Outbox; the existing Orchestrator owns execution. No schema migration, transcript store, receiver or provider-specific Session runner is introduced.

The Provider authenticates the current Bot user and associated Application using native API calls and checks the Gateway READY App/user pair. Fingerprints include App and Bot user IDs, never tokens or mutable names. Snowflakes remain strings. A Profile can explicitly set the Discord Provider's `consumerMode: external-consumer` before connecting accounts. This prevents a privileged-content/standalone Session bootstrap before the Human binds the identity. Standalone configurations retain their original mode. Claiming a checked Consumer persists external mode; missing/disposed leases and restart do not restore standalone processing.

The mention path requests `GUILDS` and `GUILD_MESSAGES`, checks the native `mentions` array and accepts bounded Human text from guild text channels or existing public threads. It does not infer direct addressing from role mentions, display names or `@everyone`. Own Bots and webhooks are suppressed. Gateway sequence plus session identifies delivery evidence; it is not a durable replay cursor or per-message acknowledgement protocol. Canonical message identity and per-Bot Admission deduplicate redelivery in Messaging.

For a text channel, external conversation and native destination are that channel. For an existing public thread, external conversation is its verified parent text channel, while `threadId` is the native child channel ID. Check parent/child guild correspondence. Discord `parent_id` is a parent channel, not a parent message. No root or parent message ID is fabricated from it or from a reply reference. Thread following remains unavailable in this slice because that independent contract has not been qualified.

Before reply, read current guild roles, the Bot member and parent-channel overwrites using the official permission order and exact integers. Require VIEW_CHANNEL, READ_MESSAGE_HISTORY and the appropriate SEND_MESSAGES or SEND_MESSAGES_IN_THREADS permission; refuse timed-out members, private threads and archived/locked threads in this candidate. Read the exact source in the native destination and verify its actor/message/route. Run the latest BotHarness fence immediately before one native Create Message call with retries disabled, mentions suppressed and a required existing source reference. Verify returned native author, destination and message ID before recording a canonical receipt; its conversation ID remains the authorized parent conversation while checked `threadId` retains the actual destination. Do not redirect or blindly retry an unknown outcome.

Core platform registration, Inbox/source DTO validation and the existing Client source label admit Discord through these checked contracts. Global defaults editing, ordinary intake, context windows, files, autonomous thread following, shared Channel qualification and proactive canonical receipt are separate real tracers. Their capability ledger remains unqualified.

## Evidence boundary

Provider candidate source: `e6f0de2a989c28d20db92c0e7f43b20c6d3028b9`, based on the current product-pinned Provider `48e7a35792af5222cd40cfe1ba2607ac55a59df2`. Controlled Provider and assembled-Core tests prove contract behavior, not a real Discord App or model reply. Real authorized App/guild/channel/thread, installed artifact hash, native read-back, screenshots/recording and Human QA remain required before acceptance or qualification. No merge, deployment or publication follows from this proposal.

## Local Host checkpoint — 2026-10-05

An isolated DSH `0.2.0-rc.1` Profile loaded BotHarness candidate `ea5ca546` and the local Provider candidate through their real Bundle layers. Authenticated `/api/botharness/list` and `/api/dsh-im/discord` status returned HTTP 200 with `ok: true`; the Discord controller reported zero configured/connected accounts. The composed Profile retained `discord.consumerMode: external-consumer` before any account connection. The Provider runtime digest covered 394 files with SHA-256 `2d1f6c0d313cf044024e7e2609070934249e4a00a4a777f09aa45b2dd2c89727`. This proves candidate Host loading and Profile composition only; it provides no native Gateway, real mention/model reply, visual or Human acceptance evidence.

The same isolated Profile also completed a real model DM probe at `2026-10-05T08:49:17.791Z`: a dedicated PersonaBot received the Human request, used `channel_send` to append `DISCORD-LOCAL-MODEL-855-OK` to that same DM, and returned to idle with its Session marked done. The Human message's delivery was handled. This verifies local Inbox/model/Channel execution with the actual Host adapter; it does not verify Discord intake, native external delivery or thread routing.

## References

- [Discord Gateway](https://docs.discord.com/developers/events/gateway)
- [Discord Application](https://docs.discord.com/developers/resources/application)
- [Discord Threads](https://docs.discord.com/developers/topics/threads)
- [Discord Permissions](https://docs.discord.com/developers/topics/permissions)
- [Discord Message API](https://docs.discord.com/developers/resources/message)
- ADR-0036/0037/0038, ADR-0126/0127; CONTEXT.md; #629/#693
