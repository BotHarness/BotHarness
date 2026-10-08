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

## Limits

Mouse click returned an unstructured tool error, so keyboard replay does not qualify mouse interaction. Initial scripted pause tried focusing a hidden toolbar button and did not disable walking; a separate postflight check first focused the character, then the now-visible toolbar and verified actual paused state. Initial pending captures show question-mark presentations; later original-reply captures show pixel Avatars. These screenshots do not establish the cause of that change or qualify mouth animation. Lifecycle/reconnect/reduced-motion edge scenes remain partial. See qualification.json for sanitized results and test failures.
