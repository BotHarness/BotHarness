# Optional onboarding Memory acceptance (#1200)

The screenshots are unmodified 1559 × 865 captures of the real DSH Client in Chinese, using the same isolated Profile and PersonaBot. The baseline welcome has a completed genuine DM and no Memory entry; the new views reuse existing Memory queries and readers.

## Reproduce

1. Start a task-local instance with the pinned launcher described in `docs/client-bridge.md` §7. Enter Bot mode and finish a real DM reply.
2. Open **Explore memory** beside **Create PersonaBot** in the retained welcome message. It opens only on request. **Not now**, Close and Escape return to the conversation without resetting completion or sending anything.
3. Choose **Memory files** and open `MEMORY.md`. It opens the existing normal reader; the initial template alone is not evidence of a saved preference.
4. Return to the welcome action and inspect actual changes. The captured initial state has no uncommitted changes and retains initialization history.
5. Choose **Remember a preference**. An empty draft cannot be sent. Enter a non-sensitive test preference, then explicitly select **Send to Bot**. This follows the normal Human DM, Inbox and Orchestrator path, with existing tool approval and failure behavior.
6. After the real reply, reopen actual changes and select the changed file. Confirm the preference in the normal file/diff reader, independently of the Bot's acknowledgement. No commit is required.
7. Close the dialog, leave/re-enter the Channel, or restart the Client: it must not reopen itself. Another Bot must not receive the previous Bot's draft or selected file.

## Observed result

The genuine model request added a `Preferences` section to `MEMORY.md`: “Reply style: give the conclusion first, then the supporting details.” The normal working diff showed **+4 / −0**, and the subsequent file read returned those saved bytes. The completion receipt remained complete. Only the one-off read-only directory-listing tool request needed explicit approval; no persistent tool grant was added.

The `reader-before-light.png` / `reader-after-light.png` pair shows the actual file before and after that request. `diff-light.png` and `diff-dark.png` show its uncommitted change. `changes-empty-light.png` records the real earlier no-change result; initialization commits are never presented as learning the preference. `preference-dark.png` shows the empty-draft disabled state.

## Automated checks

The Client suite covers this flow, scoped file and diff navigation, explicit send, blank/busy blocking, silent dismissal, completion independence, and query/send failures. Existing Memory read tests cover retained errors, polling and scope changes. Type checking, formatting, lint, Release Ledger validation and the production build also pass.

The broader local Windows suite could not finish cleanly: existing core Memory tests fail while removing temporary Git repositories with `EPERM`, including a low-concurrency retry. No core runtime or test helper is changed by this PR; GitHub CI supplies the full-suite result.
