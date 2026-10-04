# ADR-0126: Slack text intake uses an exclusive checked Provider

- Status: Accepted
- Date: 2026-10-05
- Issue: [#802](https://github.com/BotHarness/BotHarness/issues/802)

## Context

The existing dsh-im Slack Plugin connects over Socket Mode and routes mentions into its own DSH Sessions. BotHarness needs the same external transport to feed canonical Source Events and the existing PersonaBot Orchestrator, with the receiving Bot's own identity and a verifiable original-thread reply. A second receiver or a fallback Session would duplicate processing and split authority.

## Decision

The existing DSH Service Definition/Provider/Consumer seam carries an additional checked Slack account adapter. The Plugin owns the native Socket connection; BotHarness owns application-defined Binding, Grant, Source Event, Bot Inbox admission and Outbox authority. Host registration is isolated by platform and disposed through the owning Fiber. Legacy standalone Slack behavior remains available for unclaimed configurations.

Authenticated `auth.test` and `bots.info` identify workspace, Bot user, Bot ID and App ID. A stable fingerprint includes those identifiers rather than the token. Socket `hello.connection_info.app_id` must match the authenticated Bot's App. Incoming event workspace and App must also match. Credentials remain in the DSH credentials service and never enter public configuration or the Client DTO.

Claiming an exclusive Consumer persists `external-consumer` mode before replacing the runtime. Disposal, restart, missing Consumer and invalid persisted mode cannot silently restore standalone Session routing. The shared lease registry fences replacement and cancellation. Socket envelopes are acknowledged only after the application reports durable acceptance; unsupported events are acknowledged without admission. Provider redelivery remains possible, so canonical source identity deduplicates repeated deliveries.

The first slice supports public-channel Human text mentions only. Slack's channel ID remains the external conversation ID, message `ts` remains the external message ID, and `event_id` remains delivery evidence. The reply route uses `thread_ts` when supplied, otherwise the root message's `ts`, so a mainline mention can start a native thread. The latter is a derived reply target, not a claim that Slack supplied an existing thread ID. Slack supplies no Lark-style parent message ID; none is fabricated. Actor names are best-effort bounded `users.info` projections, with stable IDs retained.

Before each reply, the same Bot verifies current channel membership and reads the exact root or child through the native history/replies endpoint. The actor and route must match. The existing BotHarness dispatch fence runs after qualification and before one `chat.postMessage` request with `thread_ts`. A checked receipt records the native channel and message timestamp. Ambiguous transport or malformed result is unknown, never automatically resent or redirected to the channel mainline.

Client Profile identity and connector tables and source details reuse existing components and localized platform labels. Built-in preferences are resolved per platform; Slack does not inherit the Human's mutable Lark defaults. The global settings editor remains qualified for Lark in this slice. Ordinary-message intake, editable Slack platform defaults, bounded context, files and proactive receipt capabilities are withheld until separately qualified tracer bullets.

## Follow-up: bounded context (#819)

The first text tracer is extended with explicitly requested, source-anchored channel,
nearby and native-thread reads through the same checked Provider. Each page requalifies
its own account, active exclusive Consumer lease, joined public channel and exact native
source author/thread. The adapter separately handles newest-first channel history and
chronological replies within native thread pages. Time-bounded Slack cursors can traverse older reply chunks while repeating a root outside the requested reply count; the adapter reserves root capacity, returns it once and rejects overlapping/reversed chunk progress. Channel/nearby coverage follows Slack channel history;
it does not claim to include every child reply from every thread.

Nearby reads paginate all supported Human text in the inclusive five-minute window and
supplement sparse sides to configurable 0–20 counts (default 10 before / 5 after).
Continuations are signed by the current runtime and bound to account/source/query, with
at most 20 native candidate timestamps and no cached transcript bodies or credentials.
After-window selection may require empty continuation pages while newest-first history
is scanned towards the boundary; selected closest candidates are re-read before return.
Stopping the runtime invalidates these cursors. Each result page is bounded to 20 native
items, respects cancellation, and reports provider-visible text coverage and omissions.

Core retains only returned history as canonical Source Events and source-read evidence,
without Inbox Admission, Channel placement or wake. A character-budget re-read compares
page content rather than renewed opaque cursor bytes; changed messages remain stale.
No new durable table or shared transcript store is introduced. Files, ordinary-message
subscription, private/DM reads and editable platform preferences remain separate slices.

## Follow-up: source files (#831)

Slack's exclusive Consumer can explicitly opt into one hosted file on a Human mention.
The Provider re-reads the exact native source before canonical acceptance and records
only the native file ID, source message ID, bounded name, safe MIME type and declared
size. It does not persist private download URLs or expose them to the model/Client.
Unlike Lark's referenced parent file, Slack's file belongs to the mentioned message;
Core validates this platform-specific association without fabricating a parent ID.
Multiple files and unsupported file modes are refused in this narrow slice.

An explicit read requalifies account, exclusive lease, public-channel membership,
source author/native thread and the current file association, then calls `files.info`
and privately streams the hosted resource into the existing canonical Attachment
owner. Declared and actual bytes are bounded to 25 MiB and checked for completeness.
Host stop, lease revocation and cancellation invalidate the read; downloads block
redirects and only send credentials to Slack's validated private-file host.

The existing file Outbox accepts an explicitly imported result and uploads it through
Slack's ticket, raw-byte and `files.completeUploadExternal` stages. A checked fence
revalidates the source and runtime immediately before completion makes the file visible
in the original thread. Final completion is never blindly retried: a confirmed file ID
is platform acceptance, while ambiguous completion remains an unknown outcome.
`files:read` and `files:write` are independently authorized App scopes, not Human login.
No extra file store, Session, DM mirror, ordinary subscription or history-file search is
introduced. The Client reuses its source Modal and file download row.

## Consequences

One canonical source and Outbox continue to serve all supported Providers; no new database authority or schema migration is required for this text slice. Native Slack routing is adapted at the Provider boundary rather than imposed on Lark or on platforms without threads. Socket redelivery and uncertain sends remain explicit reliability boundaries. A passing automated regression is preparatory evidence; real Slack App installation, a fresh model round trip, screenshots and Human QA are still required before issue completion.

## References

- [Socket Mode](https://docs.slack.dev/apis/events-api/using-socket-mode/)
- [Bot identity](https://docs.slack.dev/reference/methods/bots.info/)
- [Channel history](https://docs.slack.dev/reference/methods/conversations.history/)
- [Thread reads](https://docs.slack.dev/reference/methods/conversations.replies/)
- [Native message replies](https://docs.slack.dev/reference/methods/chat.postMessage/)
