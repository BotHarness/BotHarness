# Local Computer idle acceptance — issue #713

## Result and driver provenance

The macOS Local driver is pinned to **0.31.0**, upstream revision
`5272e492d61b96caf08e3bf434d91126c1f3dccc`. Container retains its existing 0.28.0 pin.
The archive and all three executable/runtime files are checked against fixed SHA256 values before use.

Upstream [#4283](https://github.com/trycua/cua/pull/4283), first released in 0.30.3,
recreates only an idle-reclaimed implicit session on its owner's next call.
[0.31.0](https://github.com/trycua/cua/releases/tag/cua-driver-rs-v0.31.0) also includes
[#3873](https://github.com/trycua/cua/pull/3873)'s snapshot-store/token invalidation contract.
The [release-pinned lifecycle contract](https://github.com/trycua/cua/blob/5272e492d61b96caf08e3bf434d91126c1f3dccc/docs/content/docs/reference/cua-driver/contracts.mdx)
keeps named sessions, explicit termination and transport close terminal.
BotHarness does not register session lifecycle tools for the model or add a retry loop.

## Real native acceptance

These are real PersonaBot Turns through the owning Computer Provider, pinned macOS driver,
DSH native MCP adapter, Session Persistence and attachment store. This is not a mock driver.

1. **Before fix:** 0.28.0 succeeded initially, then one exact-window observation after 344 seconds
   of real idle returned `session_ended`. The model reported failure without retrying.
2. **Accepted baseline:** 0.31.0 observed a task-owned Cocoa window. Its random visual code
   `7D6F6F` was absent from the filtered Accessibility text and was read correctly from the image.
   The QA button received token `s00000002:64`.
3. **After 370 seconds of real idle:** the first call used that old token once. The driver returned
   `stale_element_token` with no current snapshot. The fixture counter remained **0**.
4. **Fresh observation:** without restarting Host or driver, one observation returned a fresh
   image and snapshot `s00000003`. The model read the newly generated, unprompted code **69C4FF**.
5. **Old token remains invalid:** one further call with the retired token returned
   `stale_element_token`, now naming the fresh snapshot. The counter remained **0**.
6. **Fresh token works:** one background AX click using `s00000003:64` incremented the fixture.
   A new observation and the fixture's independent private counter file agreed on **Clicks: 1**.
7. **Access off:** a subsequent real native Turn had zero Computer tools in its request header,
   zero Computer calls, and sent `IDLE_ACCESS_OFF_QA: Computer Access is off.` Both QA Bots now
   have Computer Access off; Browser Access and Auto-allow stayed off.

Before/after immutable capture IDs share the same driver runtime identity. The task-owned Host
launch PID also remained unchanged during idle. The receipt records both checks without exporting
private paths, login tokens, cookies, prompts or raw Accessibility text.

The accepted sequence uses only exact-PID/window observations, the fixture's disposable button,
and `channel_send`. Earlier setup observations and a model's ambiguous `0`/`O` visual read were
rejected as acceptance evidence; the final baseline used a new unambiguous random code.
No personal application input, foreground fallback or OS permission change was used.
Live OS permission revocation is **NOT_RUN**, not a pass; permission refusal remains covered by
the automated provider/native-adapter tests.

## Artifacts

- `ui-before.png` — actual Client showing the recorded 0.28.0 `session_ended` failure, 1280×720.
- `ui-after.png` — actual Client showing successful fresh-token count readback and Access off,
  1280×720; same locale, theme and viewport as the failure screenshot.
- `before.webp` — accepted baseline driver attachment, visual code `7D6F6F`, counter 0.
- `after.webp` — fresh driver attachment after expiry, visual code `69C4FF`, counter 0.
- `fresh-counter.webp` — actual post-action driver attachment, counter 1.
- `native-acceptance.json` — sanitized native assertion receipt, attachment hashes and pin provenance.

All driver images are exact attachment bytes with verified SHA256, 1560×924. No image was edited.
The Client screenshots show recorded execution messages; the receipt establishes actual tool
results, native attachments and independent fixture state rather than trusting the model's claims.

## Runnable Human QA

1. Build this worktree and start an isolated Profile with `scripts/dev-instance.mjs`. Keep the
   server loopback-only and use its private login URL locally. Verify the Local Computer target
   and existing OS grants; do not mutate OS permissions as part of this run.
2. Compile `scripts/fixtures/local-computer-idle-qa.swift` as a task-owned Cocoa app. Set
   `BH_QA_PROOF_FILE`, `BH_QA_COUNTER_FILE`, and `BH_QA_PID_FILE` to private absolute paths when
   launching it. Its window is titled **BotHarness Local Idle QA**. Never reuse a personal app.
3. Set private `BH_E2E_HOME`, `BH_E2E_ORIGIN`, `BH_E2E_STATE`, `BH_E2E_BASELINE`,
   `BH_QA_PROOF_FILE`, and `BH_QA_COUNTER_FILE`. Prepare a fresh Bot with
   `node scripts/e2e-local-computer-screenshot.mjs --prepare`; it writes the private state file
   and leaves Auto-allow off. The Client calls this Bot **Local Screenshot QA**.
4. Set `BH_QA_FIXTURE_PID` from the fixture's private PID file. Run
   `node scripts/e2e-local-computer-idle.mjs --before`; review the exact PID in the native approval
   card and **Allow once**. Wait for the actual reply, then run `--record-before`.
5. Leave Computer unused for at least **330 seconds**. Run `--expired-token` and wait for its
   refused reply. Run `--after` and wait for the new visual readback; then `--stale-token` and wait
   for the refusal. Run `--fresh-token` and wait for the observed counter 1.
6. Run `--cleanup`, wait for the Access-off reply, then set a private `BH_E2E_REPORT_DIR` and run
   `--verify`. A failed assertion is not a pass. Refresh the Client after changing Access through
   the API so the switch reflects its current owner state.
7. Optional real protocol check, without any window input:
   `BH_LOCAL_DRIVER_CONTRACT_DIR=<verified-driver-directory> pnpm exec vitest run packages/computer/test/local-driver-contract.test.ts`.

The retained isolated QA instance shows the successful second Bot DM and has temporary Access off.
The fixture's counter is already 1; start a new fixture/Bot baseline for a repeat run rather than
overwriting a prior acceptance state.
