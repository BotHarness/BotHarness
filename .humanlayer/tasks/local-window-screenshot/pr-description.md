[Issue #708](https://github.com/BotHarness/BotHarness/issues/708) | [Local Computer hub #707](https://github.com/BotHarness/BotHarness/issues/707) | [Agent claim](https://github.com/BotHarness/BotHarness/issues/708#issuecomment-5949506300) | Task: `codex/local/01a0f25f-2150-75e3-8895-23d35394b8d8`

## Why the change

Local Computer lacked real screenshot-to-model acceptance evidence, and driver-returned failures appeared successful in Computer Audit, so this verifies visual readback and records those refusals accurately.

## Special things to note

- Merge risk: **two-way door** — revert this commit; **small blast radius** — Computer Audit classification for returned MCP failures, with unchanged tool authorization and execution. Review focus: native error propagation, content-free Audit, and actual image-admission evidence.
- Live macOS capture, native allow-once approval, missing-window refusal and Access revocation passed; OS permission-denial propagation has focused automated coverage, while live OS permission revocation was **not run** and no OS grant was changed.
- The first negative run hit driver `session_ended` after idle; its Native failure and incorrect pre-fix Audit `ok` are preserved. Idle observation recovery is the next separate slice [#713](https://github.com/BotHarness/BotHarness/issues/713), already a native child of #707.

## Change outline

```text
Real PersonaBot → owning Computer Provider → pinned macOS driver
  list_windows(task PID)
  get_window_state(task PID, matching window ID, screenshot=true)
  Native durable WebP attachment → actual vision model
  channel_send("VISUAL_QA: 930B95")

Driver returns MCP isError=true
- Computer Audit: ok
+ Computer Audit: error + stable content-free reason
  Native tool failure remains intact; no automatic retry
```

**Real Local driver screenshot — 1560 × 864.** The six-character code is drawn into the fixture and absent from its Accessibility tree and structured text; the Bot read this newly generated code correctly in real Turn 3. This is the exact Native attachment, verified by its stored bytes and SHA-256.

![Actual Local Computer driver frame with visual-only marker 930B95](https://raw.githubusercontent.com/BotHarness/BotHarness/c7dd7f09f5e5955d4e92f5c75e1eeb14aafa8367/.humanlayer/tasks/local-window-screenshot/evidence/driver-window.webp)

**Real failure and Access-off DM — 1280 × 720.** Turn 4 requested one absent window in the task PID, returned `window_id_not_found` and no image, and recorded Audit `error`; Turn 5 exposed zero Computer tools and made zero Computer calls. The raw Client capture follows a refresh from the owning Host, with both Access switches off.

![Native missing-window failure and Computer Access-off reply](https://raw.githubusercontent.com/BotHarness/BotHarness/c7dd7f09f5e5955d4e92f5c75e1eeb14aafa8367/.humanlayer/tasks/local-window-screenshot/evidence/native-result.png)

[Sanitized native receipt](https://github.com/BotHarness/BotHarness/blob/c7dd7f09f5e5955d4e92f5c75e1eeb14aafa8367/.humanlayer/tasks/local-window-screenshot/evidence/native-acceptance.json) · [Reproduction and Human QA](https://github.com/BotHarness/BotHarness/blob/c7dd7f09f5e5955d4e92f5c75e1eeb14aafa8367/.humanlayer/tasks/local-window-screenshot/evidence/README.md)

```text
scripts/
  fixtures/local-computer-screenshot-qa.swift   visual-only random marker
  e2e-local-computer-screenshot.mjs            real native acceptance assertions
packages/computer/
  src/tool/provider.ts                        returned MCP failure Audit
  test/computer-tools.test.ts                  actual Native projection/redaction
```

Local lint, formatting, typecheck, build and both Release Ledger validators passed; full tests: **1,914 passed, 2 optional tests skipped**. The committed helper independently passed against the real QA Profile after Access was disabled. Automated image-projection coverage uses the real pinned Native MCP adapter with fake model/store services; it does not substitute for the real-model evidence above. No product layout changed. Await Human QA before merge.

Closes #708.
