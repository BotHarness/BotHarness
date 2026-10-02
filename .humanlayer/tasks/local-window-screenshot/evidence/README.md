# Local Computer screenshot acceptance

Issue #708, parent #707. Driver 0.28.0, DSH 0.2.0-rc.1, real DeepSeek Flash PersonaBot Turns.

## Actual evidence

- Turn 3 used the native allow-once card, listed only the task-owned fixture process, then requested one matching window screenshot. Native Session content contains a durable WebP attachment: 1560 × 864, 166,918 bytes. `driver-window.webp` is that exact attachment, verified by SHA-256; it is not an independent screen capture or a reconstructed image.
- The fixture draws a newly generated six-character marker directly in an `NSView`; no text control, Accessibility value or tool text exposes it. The real Bot replied `VISUAL_QA: 930B95`, matching the independent fixture-owned marker file. All screenshot/structured text blocks were checked for absence of that marker. The earlier pre-fix run used a different marker and is not substituted for this final run.
- Turn 4 made exactly one screenshot request for an intentionally absent window ID in the same task process. It returned native `isError: true`, `window_id_not_found`, and no image. The Bot reported failure without retry or another-window capture. Computer Audit recorded `error` with a stable content-free reason.
- Computer Access was disabled. Turn 5 exposed zero Computer tools and made zero Computer calls. Browser Access remains off. `native-result.png` is a raw capture of the real DM failure and Access-off reply after refreshing the client from its owning Host; the switches are off.
- `native-acceptance.json` contains only sanitized assertions and attachment metadata. Raw Session logs, authentication URLs, cookies and marker-state files remain private.

The first native negative run, Turn 2, hit `session_ended` after idle, before window lookup. Native correctly reported failure, but Audit incorrectly wrote `ok`; that is the runtime regression fixed here. Preserve it as a failure rather than relabeling it as the final missing-window test. This PR does not implement idle-session revival.

Permission-failure propagation and observation redaction are covered by the Native MCP regression using a returned `isError` fixture. **Live OS permission revocation was not run**, and no OS grant was changed. No desktop capture, personal application interaction, Shell or Browser tools, input, or automatic approval was used by the QA Bot.

## Runnable Human QA

Use an isolated Profile launched through `scripts/dev-instance.mjs`, select Local Computer, and leave Auto-allow off. The preserved QA Profile's Local Screenshot QA DM shows the final result with Computer and Browser Access off; its native window shows the marker.

For a fresh run:

1. Compile `scripts/fixtures/local-computer-screenshot-qa.swift` with `swiftc -module-cache-path <private-cache> ... -o <fixture-binary>`. Launch the task-owned fixture with `BH_QA_PROOF_FILE` pointing at a private temporary file. Record only its PID and raise its QA window. Keep the generated marker out of the Bot prompt and files the Bot can read.
2. Set `BH_E2E_HOME`, `BH_E2E_ORIGIN` (loopback only), and `BH_E2E_STATE` (private state file). Run `node scripts/e2e-local-computer-screenshot.mjs --prepare` to create the isolated QA Bot and check existing OS grants. This does not grant OS permissions.
3. Set `BH_QA_FIXTURE_PID` and run `--capture`. Review the native card and allow once only for the task PID. Wait for the Bot's committed `VISUAL_QA:` reply. This helper never approves automatically.
4. Run `--failure` promptly and wait for `CAPTURE_FAILURE_QA:`. It requests one absent window ID without retry or OS-grant changes. If the driver has idled out, preserve the actual refusal and restart this isolated Computer before repeating with a fresh observation; do not treat a different refusal as missing-window evidence.
5. Run `--cleanup`, wait for `ACCESS_OFF_QA:`, then set `BH_QA_PROOF_FILE` and `BH_E2E_REPORT_DIR` and run `--verify`. It checks canonical Native events, matching visual-only readback, durable attachment bytes/hash, native decision, explicit capture failure, Audit outcome, and Access-off tool visibility.
6. Refresh the UI to read externally changed Access from the Host before judging its switch. Inspect the actual native window, Bot replies, failure feedback and preserved driver image.

No product layout changed. These images prove the screenshot and refusal workflow rather than a styling comparison.
