[Issue #713](https://github.com/BotHarness/BotHarness/issues/713) | [Local Computer hub #707](https://github.com/BotHarness/BotHarness/issues/707) | [Agent claim](https://github.com/BotHarness/BotHarness/issues/713#issuecomment-5957465135)

Agent Task: `codex/local/01a0f25f-2150-75e3-8895-23d35394b8d8`

Closes #713

## Why the change

Local Computer can observe the user's Mac again after its implicit driver session expires, while previously issued action tokens stay invalid.

## Special things to note

- Merge risk: **medium**; revert restores the prior pin without a data migration, the blast radius is macOS Local Computer, and review should focus on verified release hashes, token invalidation and absence of action replay.
- Local now uses the reviewed [0.31.0 release](https://github.com/trycua/cua/releases/tag/cua-driver-rs-v0.31.0), including the driver's [idle recovery](https://github.com/trycua/cua/pull/4283) and [snapshot token contract](https://github.com/trycua/cua/pull/3873); Container retains 0.28.0, and model-visible lifecycle tools remain unregistered.
- Live OS permission revocation was **not run**; automated permission-refusal coverage passed, and QA changed no OS grants.

## Change outline

Recovery stays inside the owning driver:

```diff
 PersonaBot → Computer Provider → native MCP adapter → Local driver
-Local shares Container's 0.28.0 pin: idle observation → session_ended
+Local has a verified 0.31.0 pin: idle implicit session → fresh observation
+Expired snapshot tokens → stale_element_token, including after recovery
 Container retains its existing pin
 Provider does not retry or replay Local actions
```

Regression tests cover terminal refusals without renewal, Local transport failures without replay, and the optional real macOS MCP descriptor contract; a task-owned Cocoa fixture and native-session helper make the complete path repeatable.

**Before:** actual Client failure after 344 seconds of idle on 0.28.0.

![Before: Local observation returned session_ended](https://raw.githubusercontent.com/BotHarness/BotHarness/6745b232e687f5b149d97646ba032ab5e1ffedd8/.humanlayer/tasks/local-idle-recovery/evidence/ui-before.png)

**After:** actual Client shows fresh-token click readback and Computer Access off.

![After: fresh-token click succeeds and Access is off](https://raw.githubusercontent.com/BotHarness/BotHarness/6745b232e687f5b149d97646ba032ab5e1ffedd8/.humanlayer/tasks/local-idle-recovery/evidence/ui-after.png)

**Functional E2E:** after 370 seconds of real idle, the same Host and driver runtime returned a new image with an unprompted visual code; retired tokens were refused before and after observation, and one fresh-token AX click changed the fixture counter from 0 to 1.

![Actual driver attachment: fresh observation and counter 1](https://raw.githubusercontent.com/BotHarness/BotHarness/6745b232e687f5b149d97646ba032ab5e1ffedd8/.humanlayer/tasks/local-idle-recovery/evidence/fresh-counter.webp)

The real native Access-off Turn advertised zero Computer tools and made zero Computer calls; both QA Bots now have Access off. Driver images are exact native attachment bytes, checked against SHA256. [Sanitized assertion receipt](https://github.com/BotHarness/BotHarness/blob/6745b232e687f5b149d97646ba032ab5e1ffedd8/.humanlayer/tasks/local-idle-recovery/evidence/native-acceptance.json) and [provenance / runnable Human QA](https://github.com/BotHarness/BotHarness/blob/6745b232e687f5b149d97646ba032ab5e1ffedd8/.humanlayer/tasks/local-idle-recovery/evidence/README.md) document the accepted sequence and limits.

Validation: lint, formatting, types, build and bilingual ledger checks passed; the complete suite passed **1,968 tests with 3 skipped**, focused Computer coverage passed 35 tests, and the optional real 0.31.0 macOS MCP contract check passed separately.
