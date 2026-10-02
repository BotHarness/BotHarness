# Active Bots and direct actions in Overview — #698

Unedited screenshots from a real isolated DSH Profile, Chinese locale. Desktop captures are 1440×900; narrow captures are 420×860. Three real PersonaBots supply an idle reply, native release-route question, and native tool approvals for Orchestrator/Assignment timed print commands. A real model reply verified the provider. No mocked RPC response or copied Inbox state supplies the screenshots.

The Before captures use the main Client at `76dac30baa86cff2940a08c071e29329a1bf2687`, served briefly against the same Profile and canonical Host data; the current Client was restored after capture. The existing Overview contract ignores the newly added `hasAction` field. Waiting/idle data is paired separately from executing data. Session titles were changed through native Session rename, then refreshed/subscribed through the real Client catalog.

| Captures                                                       | State                                                                                                              |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| overview-before-light/dark → overview-actions-light/dark       | Same three-Bot roster and pending actions; default hides idle and exposes canonical requests under each owning Bot |
| overview-all-bots-light                                        | Show idle restores the full roster                                                                                 |
| overview-question-light/dark                                   | Native question form opens from Overview; full context and source navigation remain available                      |
| overview-question-handled-light                                | Answer sent through the owning Host command; row/count update while Overview stays open                            |
| overview-tiles-before-light/dark → overview-tiles-light/dark   | Executing Orchestrator and Assignment roots, native current titles, role icons and compact one-row tiles           |
| overview-narrow-before-light/dark → overview-narrow-light/dark | Narrow shell and compact executing tiles; no horizontal overflow                                                   |

`verification.json` records the real E2E assertions and geometry. Tool commands only wait and print; tool-approval modal screenshots are omitted because the native form includes machine-local paths. Tokens, launch logs, model transcripts, fixture IDs and private paths remain outside published evidence.

## Reproduce

1. Build this branch and launch a task-owned Profile with `node scripts/dev-instance.mjs --home <temporary-home> --port 32017 --build`. Keep its token URL private. This helper requires the shared machine-local provider key or the Profile's credential.
2. Set `BH_OVERVIEW_QA_HOME` to that home and `BH_OVERVIEW_QA_PORT` to its port. Run `node scripts/e2e-overview-actions.mjs prepare`, then `node scripts/e2e-overview-actions.mjs check`. This creates real QA Bots/messages and performs the question answer and one-time approvals in the browser.
3. To review manually, open Activity Center → Overview: check idle filtering, select Show idle, answer a request directly, and approve the two timed execution requests. Each command runs for three minutes so both role tiles can be inspected.
4. Click a Bot header to open its DM; click a Session tile to switch to its native DSH Session. Rename the native Session and return to Overview to verify the current title.

Canonical requests, unread state and Human Inbox ownership keep their existing authority. Pagination is oldest first, 50 per page; automatic refresh retains up to three loaded pages. Above 150 rows automatic refresh pauses and the visible refresh control remains available.
