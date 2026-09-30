# Human Inbox inline reply — #547

Real isolated DSH `0.2.0-rc.1`, local Profile `bh-547-reply`, port 31987,
1440 × 900 Chromium viewport. A live DeepSeek model produced the Group and Bot DM
source messages. The browser operated the shipped Client through its real Bridge
and the canonical Channel owner; no message fixtures were inserted into storage.

## Captured behavior

- `before.png`: main's unread Inbox, before inline reply.
- `after-draft.png`: exact Group source, expanded nearby messages, Human draft.
- `after-sent.png`: confirmed Group reply in Inbox.
- `after-source.png`: precise navigation to that canonical reply in its Channel.
- `after-dm.png`: confirmed private reply without leaving Inbox.
- `after-light.png` / `after-dark-draft.png`: final reply UI in both shell themes.
- `after-error.png`: deleting the QA source Group rejects sending and retains the draft.
- `after-navigation-error.png`: failed source navigation also retains the Inbox and draft.
- `result.json`: canonical Group/DM source and reply IDs; each submitted reply was found exactly once with the Human author and correct `replyTo`.

The final spec review found and resolved visible-context read advancement and
failed-navigation draft retention. Focused tests cover those fixes and stable
retry IDs, plus Host rejection of hidden, missing and deleted source messages.

## Human QA

1. Open the isolated Profile and enter Bot mode → Inbox → Unread.
2. Ask Launch Planner QA for a new update in its DM or mention it in Launch review QA.
3. Click Reply on the Channel row. Inspect the exact source and expand nearby messages.
4. Type a reply. Confirm list refresh/read advancement does not remove the draft.
5. Send; confirm the success state and open the source to inspect the reply reference.
6. Repeat in the other Channel. For failure QA, use a disposable Group and delete it
   after opening a draft; sending and source navigation should report failure and
   keep the draft.

## Automated runtime reproduction

Use a fresh isolated home with a machine-local DeepSeek credential, build the
checked-out revision and run:

```sh
node scripts/dev-instance.mjs --home <temp>/bh-547-reply --port 31987 --build
node scripts/e2e-human-inbox-reply.mjs seed
node scripts/e2e-human-inbox-reply.mjs reply
node scripts/e2e-human-inbox-reply.mjs error
node scripts/e2e-human-inbox-reply.mjs light
```

The script reads the one-shot URL from the task launch log without printing it;
evidence goes to ignored `.humanlayer/tasks/issue-547/evidence/`. `seed` is for a
fresh Profile. `before` captures the baseline before rebuilding with this change.

## Validation limits

One full Windows run: 1,347 passed, five failures, one skipped. Failures were two
existing browser runtime POSIX-path assumptions, a registry Git CRLF expectation,
and 15-second timeouts in Human DM steering and Memory branch coordination.
The repository-wide format check also sees the Windows checkout's CRLF files;
all task source files pass the focused formatter check. Linux CI is the final
repository-wide gate; these local failures are not reported as passes.

Native and custom controls share the shell font. Measured native New Session
height is 38px; compact reply controls are 29.5px with 6px corners. The reply form
borrows the existing Channel reply/composer composition and the documented
compact form state pattern. Native capsule Button geometry is deliberately
omitted for these compact Inbox controls; missing radius tokens are centralized
with their native measurement rationale.
