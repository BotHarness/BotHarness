# #896 acceptance evidence

This records real, authenticated local DSH API and model execution on an isolated,
disposable Profile. It is backend E2E evidence, not rendered UI acceptance.

The model delivered `QA896_READY` through `channel_send`. Ordinary deletion retained
the Memory Git repository, uncommitted bytes, native Session ownership and Channel
history; subsequent resume and DM delivery were rejected. Explicit Memory erasure
removed only the selected disposable repository. A real Agent waiting for native
tool approval was stopped before deletion completed. After a cold Host restart,
all three identities remained deleted, their Memory outcomes and native history
were unchanged, and late input/resume remained rejected. Further real Host checks
refused a stale confirmation before persisting deletion, refused an escaping Memory
symlink while preserving outside bytes, and reported an injected filesystem
permission failure as incomplete. After a second cold restart, the incomplete
state still fenced execution; explicit retry completed the original erasure scope.

`backend-e2e.json` contains the checkpoints and opaque test identity/session IDs.
No authentication token or credentials are included.

## Reproduce backend checks

Build the branch and start an isolated Profile with `scripts/dev-instance.mjs`
using `--json`. Store that launch result in a machine-private file and pass its
path to `node docs/evidence/issue-896/host-e2e.mjs <private-launch-json>`.
The script creates and deletes only its own disposable Bots. Stop that exact Host
PID, restart the same Profile, and run
`node docs/evidence/issue-896/cold-e2e.mjs <fresh-private-launch-json>`.
It also leaves two active disposable Bots for Human UI review. Then run
`node docs/evidence/issue-896/failure-e2e.mjs <private-launch-json>`; restart the exact
Host again and run that script with `retry-after-cold-restart` as its final argument.
This temporarily changes permissions only on the new disposable Memory root and
restores its original permissions before exiting. Do not commit the
launch JSON, credentials or other private Profile contents.

## UI capture blocker and Human review

The browser tool previously refused this task's local QA surface and alternate
navigation/capture. No alternate browser, screenshot utility, CDP or proxy was
used. Actual before/after screenshots, native folder opening and visual Human QA
remain pending; automated consent tests do not replace them.

In the running QA Profile, open a disposable Bot's Profile and its Delete section.
Verify in both themes:

1. The confirmation names the Bot and Memory path. The checkbox starts unchecked.
2. Opening the Memory folder does not opt in to erasure. Cancel, reopen, and verify
   a previously checked choice resets to unchecked.
3. Ordinary deletion preserves Memory and historical DM/Session/Report views,
   while controls cannot revive the deleted identity.
4. For the second disposable Bot, explicitly check Memory erasure; the final label
   includes Memory files, and the resulting state reports erasure honestly.
5. Compare against the base Profile entry point, and capture matching before/after
   screenshots. Failure/incomplete state has real API/cold-restart evidence; a rendered
   failure-state review remains pending. Custom/shared-path ownership and overlap
   refusal have owner-module tests and still need real Host scenario qualification.

A real native operating-system folder open has not been executed by these API
scripts; `native-folder-target` only verifies its Host target metadata.
