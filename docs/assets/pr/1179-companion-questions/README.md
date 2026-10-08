# Real DSH companion question qualification

Actual isolated DSH at a5193b36b31df37c918a509d4229165536b73106, Chinese1559×865, task-only QA Bots/data. Two real model Turns invoke the native question Tool; existing owner projections and canonical answer commands drive all request cards/results. No card, answer, Bot reply or presentation was injected. Login URLs, credentials and raw logs remain local. Visible Chat instructions are task-authored QA fixture text.

## Observed paths

- A presents3 supplied questions: single choice, checkbox multi-selection with descriptions and custom text. B independently presents1question. Both remain pending while an unrelated observer Channel is selected.
- Enter selects A's release option; Space selects both checkboxes and the real input receives custom text. Both themes preserve the draft. Explicit Enter submits exactly one canonical A answer, restores A character focus and keeps B pending while the observer remains selected. A's actual original Bot then commits its reply containing every selected/custom answer.
- The Human next opens B's Chat. Chat and companion inputs have unique IDs. A real Chat keyboard answer resolves B exactly once; the companion removes the same current request and B's original Bot commits its own reply. A stays resolved once.

## Media attribution

All8PNG files are real current-head screenshots. They are interaction states, not matched base/PR layout pairs; walking and selection change positions/backgrounds. Earlier before/after option-design evidence remains separately attributed in PR1188.

- choices-and-custom.webm: continuous real choice/custom-input actions; ends before submission. The observer then failed because its CSS selector required a type attribute while these native inputs use the default text type. This QA harness failure is retained rather than presented as a completed workflow.
- direct-answer.webm: continuous recording beginning with the already-selected draft, through theme continuity, explicit submission, focus recovery and original A continuation.
- chat-reconciliation.webm: continuous B Chat/companion presentation, actual Chat answer, companion reconciliation and original B continuation.

Official MCP silent screencasts, normal WebM container remux without re-encoding, dubbing or screenshot interpolation. These are not performance traces.

## Earlier keyboard-capture limits

Mouse click returned an unstructured tool error, so keyboard replay does not qualify mouse interaction. Initial scripted pause tried focusing a hidden toolbar button and did not disable walking; a separate postflight check first focused the character, then the now-visible toolbar and verified actual paused state. Initial pending captures show question-mark presentations; later original-reply captures show pixel Avatars. These screenshots do not establish the cause of that change or qualify mouth animation. Lifecycle/reconnect/reduced-motion edge scenes remain partial. See qualification.json for sanitized results and test failures.

## Additional mouse and lifecycle qualification

At the same runtime code a5193b36, a new actual native question was answered entirely through native mouse clicks: single choice, both checkbox choices and submit. The canonical owner records one answer, the unrelated observer Channel stays selected, character focus restores, and the original Bot commits a reply containing all selections. Walking pause was verified through the actual toolbar setting. mouse-answer.webm records this separate flow; mouse-selected-light.png and mouse-settled-light.png show its actual interaction states.

A second new native question stays pending when the header unpins its companion, then reappears when the header repins it. A real document reload recovers the same pending request while retaining the observer Channel. Native mouse submission then records one answer and resumes the original Bot. lifecycle-answer.webm records the complete sequence; lifecycle-repinned-light.png and lifecycle-reloaded-light.png show the same request before/after reload. These are lifecycle states, not base/PR implementation comparisons.

The earlier mouse-tool failure remains historical; this supplement qualifies new actual mouse actions rather than attributing that old failure to a product cause. One first harness precondition incorrectly checked the archived Bot flag instead of the walking setting, and was corrected without application changes. Console captures show no error messages and retain two form-field id/name advisories. Automatic interrupted-SSE recovery, Host restart, cancellation, archive/deletion, reduced motion and mouth animation remain outside this supplement. See mouse-lifecycle-qualification.json.

## Current integrated runtime and actual Host restart

Runtime ce926cbec838594bc2db098e42e108b95efd7bed integrates pinned main5efae378 and approval parentb593540f with formal pixel-avatar0.7.0. Chinese1559×865, light/dark. A real native question is answered by mouse over an unrelated selected Channel, exactly one canonical answer commits, the correct original Bot replies, and the companion question removes. A second real question is then left pending for actual Host stop/restart. The same browser document automatically recovers: unchanged timeOrigin/read-only observer, generation changes, old question expires/removes, a stale answer is refused with invalid-input without a canonical answer, no historical speech returns, and a new real Bot reply is displayed completely.

Seven actual screenshots and question-restart.webm show these successive scenes; they are not matched-base layout comparisons. The continuous silent official MCP recording is container-remuxed only. Initial wrong-target recording selected another same-named QA Bot and is retained privately; native Channel identity corrected the pin, and published recording begins with the existing unanswered question. No application state or execution facts were injected.

An overbroad disconnect assertion included every descendant input and failed: real choice/retry buttons and custom input were disabled, but two additional inputs were not. The Host was immediately restored and automatic recovery still verified. That failure remains private, and this report does not claim every descendant input disabled or include a separate stale-state screenshot. A read-only100ms observer records1533samples and ordered live→stale→live states; same-document live recovery is independently verified. Sampling is not a performance measurement or proof of unsampled transients. Console retains intentional connection errors/native retry warnings, no other errors; no clean-console claim. All owned pages/browser are closed.

This qualifies basic current integration and Host restart/new-generation recovery. Earlier multi-question/multi-Bot/custom/Chat recordings keep their original source attribution. Short same-Host interruption, archive/deletion/cancellation/competing-client runtime edges, reduced motion, performance and overall issue acceptance remain separate.

## Same-Host automatic interruption recovery

At the same integrated runtime ce926cbe, an actual native request contains single choice, multi-select and custom text. Native mouse/input actions prepare all three drafts. A task-only transparent loopback proxy then interrupts only the actual companion SSE; the Host, native RPC and question owner keep running. The unchanged document observes live→stale→live, disables the question controls during stale, retains all drafts and the unrelated selected Channel, and recovers the same still-pending request without an answer. Explicit native mouse submission afterwards records exactly one canonical answer and the original Bot replies with every actual selection and custom text.

Five screenshots show draft, stale disabled controls, light/dark recovery and resolved request. same-host-reconnect.webm is49.967seconds of continuous silent official MCP recording, remux only. Screenshots are successive states, not matched-base design comparisons. Read-only100ms sampling records375samples and does not qualify performance. The one intentional truncated-SSE console error was missed by the initial narrow classifier and explicitly reclassified postflight without changing raw logs; no clean-console claim. An earlier proxy Host/Origin mismatch correctly received403 before a request existed; the fixture was corrected without changing application/authentication policy. All owned browser pages and the task proxy are closed. See interruption-qualification.json for scope and remaining limits.

## Archive, cancellation and deletion

At integrated runtime ce926cbe/formal pixel-avatar0.7.0, a fresh task-only QA Bot creates real native questions. Existing authenticated pause/resume commands remove archived question controls and restore the still-live request after unarchive. Native session/cancel commits a canonical cancellation, expires the owner and removes current controls in the unchanged document. A new pending question is then left while deletionPreview/deletionConfirm delete only this newly created Bot with eraseMemory=false: deletion completes, memory stays retained, the companion/controls remove and the unrelated observer Channel remains selected.

Seven actual screenshots, question-archive.webm(14.6s) and question-cancel-delete.webm(19.233s) show these successive states. First clip ends after native cancel command when a QA response-envelope assertion failed. A fresh isolated follow-up initially lacked the pin; explicit exact-Bot repin corrected that precondition, and the second clip records a new native question/cancellation and deletion. Separate postflight corrects earlier malformed stale probes to answer.answers and verifies rejection with unchanged canonical decisions; it is not presented as recorded mouse interaction. No product/source changes, synthetic owners/events/cards/answers or memory erasure. Capture consoles contain0errors; all owned browser pages are closed. Host-command paths do not qualify mouse interactions with archive/delete/cancel menus. See lifecycle-qualification.json for full attribution, retained failures and remaining limits.

## Competing clients and reduced motion

At integrated runtime ce926cbe/formal pixel-avatar0.7.0, two official isolated browser contexts show the same actual native question with independent selected drafts. One MCP mouse attempt submits; the other tool cannot interact before timeout, so this is not claimed as two mouse submissions. Both pages remove the request after the one canonical answer and correct original-Bot reply. A second actual native question independently receives two concurrent authenticated existing answer commands: exactly one accepted, one invalid-input refusal, one canonical answer, correct winner continuation and both unchanged documents/observer Channels reconcile. question-competing-clients.webm(39.1s) continuously captures client A; seven screenshots include actual client B states.

Same-context second-page setup had a selected pin without a mounted companion, pending GET/no selection POST and no console errors. Independent contexts work; connection contention remains an unproven hypothesis, not an established product fix. Earlier failed setups created no question and closed owned browsers.

Official MCP chromeArg --force-prefers-reduced-motion produces actual prefers-reduced-motion=true and application policy reduce. Actual pending question is readable light/dark. First12.1sclip stops before submission after a QA script incorrectly expected two Tabs to reach submit; no answer commits. A fresh reduced browser explicitly repins the same pending request. Second12.333sclip observes three native Tabs(other option, custom input, submit), native Enter, one canonical answer, correct original-Bot continuation and request removal while retaining the observer Channel. Four screenshots show pending themes, real keyboard focus and resolved state. Saved mouth is observed after completion, not continuous animation qualification.

All capture consoles have0errors and owned browsers close. Recordings are continuous/silent official MCP, container-remux only, not performance evidence; screenshots are interaction states, not base/PR layout comparisons. See client-edges-qualification.json for exact assertions and retained failures.
