---
Status: Accepted
Date: 2026-10-08
---

# Window Companion requests use their live owners

The Human extended [ADR-0144](0144-window-companions-consume-owned-activity-and-scoped-output.md)'s navigate-only attention surface in [#1178](https://github.com/BotHarness/DeepSeekBot/issues/1178): a pinned Bot must expose pending Tool Approval decisions without selecting its DM. The subsequent question slice is tracked by #1179. The original specification remains a record of its accepted scope.

## Decision

The application-defined Companion Feed observes the existing live `ChannelToolApproval` owner through a Fiber-owned, disposable attachment. Snapshots query that owner's current committed requests for each selected, active Bot; notifications only invalidate the presentation. Requests are never reconstructed from ordinary speech, Activity counts or durable Channel history. First pin and reconnect therefore discover current pending requests while ordinary speech retains its future-only baseline. Host restart has no old process-local requests to expose.

The authenticated feed carries Bot/DM/message/Session/call identity and the owner's operation, role, working directory and bounded input. Companion Visibility is an output-observation preference and grants no decision authority. The Client renders a persistent, scrollable request section with a visible total; decorative timers, retained-card limits and Activity/DM/group switches do not control it. It temporarily takes presentation priority over ordinary speech, which pauses with a visible waiting count and resumes through its existing bounded queue. Unpinning removes a presentation without deciding or cancelling the native request.

Chat, Human Inbox and companions compose the same Tool Approval controls. The companion supplies an explicit qualified target and current feed freshness; only this context can operate independently of the selected conversation. Ordinary chat's selection guard remains. Companion submission revalidates live status immediately before the existing command; the Host still resolves the canonical DM/message and the owner validates the exact tracked native call, scope, cancellation and decision lock. Rule-saving choices and the broad-rule confirmation remain unchanged. No new Agent Tool, prompt or general input surface is introduced.

An owner notification reconciles all companion presentations after success, rejection, cancellation, expiry or invalidation. Offline controls remain disabled, failed status reads offer revalidation, and removing a focused request restores focus to the next request or the Bot. The shared request section and current-state transport can admit a typed question variant in the dependent slice; approval code does not fabricate or implement question requests early.

## Consequences

- The Channel log retains request/decision audit facts; native execution and its existing one-call fence remain authoritative. The companion is another Human Consumer, not a second approval store.
- The existing `shell.overlay` Slot and Typert/API Gateway decision path suffice. No DSH-native approval interface or independent desktop window is added.
- A copied historical message cannot resurrect approval. A competing chat or Client decision can succeed only once, regardless of which presentation initiated it.
- Real DSH cross-page, keyboard and light/dark visual evidence remains an acceptance gate alongside automated owner/feed/Client regression coverage.
