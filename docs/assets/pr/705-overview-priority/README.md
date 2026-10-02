# Overview priority and Channel statistics — #705

Actual DSH Web Client evidence for PR #706. No mock UI or model responses.

## Compare

The `before-overview-*` and `after-overview-*` pairs use the same isolated Profile,
13 messages and one pending native question, at 1440 × 900 and 420 × 860, in light
and dark themes. Before uses main at `0a8fda0c`; after uses this PR. The final
concurrency fix changes reconciliation, so the paired visual state is unchanged.

## Human QA

1. Open Activity Center → Overview. The primary count is one; the waiting Bot is
   above idle Bots. Action, idle toggle and refresh controls have native icons.
2. Click the pending question's action. The native question and options open;
   close without answering. Bot and Session navigation retain their separate targets.
3. Toggle idle Bots. The idle Bot appears, then hides again.
4. Expand Statistics. Inspect the TanStack stacked chart, exact tooltip and numeric
   sender details. Disclosure and chart selection do not mark messages read.
5. Collapse Statistics and reload: the disclosure preference survives.
6. With unread messages present, click Mark all read. The message count becomes
   zero; the same pending question remains unanswered and can still be opened.
7. Send a new DM and wait for the real Bot reply: it is unread again.
8. Check light/dark theme and a narrow viewport: no horizontal overflow.

## Verification

Final actual browser run started with **1 genuine unread message** (asserted),
reached **0 unread**, preserved the exact pending request IDs, opened the native
question and saw **1 later unread Bot reply**. `read-with-action-pending.png` and
`pending-question-after-read.png` capture that run; the statistics total is larger
than in the comparison pairs because each run sends an additional real DM.

Focused Host tests cover the canonical SQLite read positions, messages arriving
after the captured heads, restart, access changes, deleted/Bot-only Channels,
explicit refusal and unchanged pending actions. Mounted Client tests cover busy
controls, retry, status-query failure, original write error and competing status
responses. No read receipt, answer, approval, dismissal or Bot wake authority is
introduced outside the existing owners.
