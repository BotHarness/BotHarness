# Compact bubble metadata — #803

Production Client-only change. Consecutive messages keep their existing 2px gap; metadata no longer reserves a 22px row beneath each bubble. The delivery receipt sits beside the bubble, copy/reply reveal toward the center on hover or keyboard focus, and the author row contains exactly one timestamp from the group's first message. Human approved mirrored controls: Bot controls right of receipt, Human controls left. Pending/generating feedback remains in the bubble; failed-message restore stays available. Touch devices retain visible controls/time because they have no hover.

Composition reuses the shipped message group, delivery receipt, copy/reply primitives and DSH tokens. It borrows the existing compact conversation/hover-toolbar pattern from the in-harness UI, retaining the user-requested receipt placement and author timestamp. There are no new Host or Gateway operations.

## Actual runtime evidence

Fresh isolated DSH 0.2.0-rc.1, real Flash/low Orchestrators and eight actual Bot messages. The same ten-message Group timeline is used before and after. The before screenshot is the actual light/wide base build (`db3ea898`); after light/wide and dark/narrow rest/hover screenshots show the same scene. Additional narrow screenshots show Human mirror and touch access. The before capture also completed native send verification before its later unrelated rail-navigation wait failed; it is not presented as a passing rail audit.

The browser checks actual rectangles, group timestamp count, hover/focus opacity, no reserved row, receipt/action horizontal alignment and narrow bounds. It physically clicks copy and reads the actual clipboard (including Chromium's separate sanitized-write permission), clicks reply and verifies the chosen body, and opens/dismisses the actual delivery dialog. No clipboard, message, receipt, API or Client state is mocked. Bounded after-proof.json contains QA messages and measurements; authentication and failure diagnostics remain private.

## Reproduce

Use a fresh loopback DSH and machine-local key with scripts/dev-instance.mjs. Prepare real Group messages via scripts/e2e-group-shell.mjs prepare/check, and save its private qa-state.json to .humanlayer/tasks/message-inline-actions/qa-state.json. The UI verifier only needs that scene's Group identity and ten committed messages; run it against the base build with before and the new build with after. Set BH_E2E_ORIGIN, BH_E2E_HOME and BH_E2E_EVIDENCE to private outputs, then:

```sh
node scripts/e2e-message-inline-actions.mjs before
node scripts/e2e-message-inline-actions.mjs after
```

Do not publish cookies, native logs or one-shot URLs. Browser permission setup grants only the test context clipboard access; it does not change the application's permissions.

## Human QA

Open the supplied 3328 isolated page, enter Bot mode and open Group shell QA 1791126544799. Atlas/Boreal pairs should be compact. Hover a bubble: copy/reply appear alongside its receipt and one time appears after that group's name. Move to the second bubble and copy/reply: both act on the second message. Click the receipt to see the existing recipient details. Human's action controls should mirror left while its bubble remains right aligned. Check a narrow viewport and keyboard Tab focus too.
