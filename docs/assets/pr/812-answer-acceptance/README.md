# Assignment answer acceptance — real DSH E2E

Issue: [#812](https://github.com/BotHarness/BotHarness/issues/812).

Base: `93f8cd520724ec946eb32ca754f85e1fd2d0dac6`. Implementation: `98d3704051c6a48e32dac3bcbb214f0223176fb7`.

These are actual DSH 0.2.0-rc.1 screens, using DeepSeek Flash through the normal Channel → Orchestrator → Assignment path. Both revisions use the same isolated test Profile snapshot, original Assignment Session, open ask, locale (Chinese), viewport (1500 × 1000), Grant, and model route. The Profile contains only generated QA conversation data.

## Reproduction

1. In Bot mode, create a Bot with a Human-granted test workspace. Ask it to create an Assignment that reports `waiting-human`, asks “请选择 A 或 B”, and ends its turn. It must only report completion after receiving choice A.
2. Stop and restart this isolated Host so the Assignment must resume through native Session Persistence. After clean boot, copy that test Session's native log into a second directory under this same isolated Profile. Native `SessionPersistence.stat` refuses the duplicate Session ID before Inbox insertion. No fake adapter or production fault endpoint is used.
3. Send an addressed Human response through normal Channel delivery, explicitly asking the Orchestrator to forward it with the original `answer_to`. Wait for the canonical Session failure card.
4. On the base revision, “需要我处理” loses the ask, and the source view shows “已发送给 Bot” with no reply form. On the implementation, the original ask remains actionable, the Session returns to idle, and the source view offers a retry with “上次回应尚未送达事项；可重新发送。”
5. Remove only the test duplicate. Open the preserved ask, type choice A, and submit the real Human Inbox reply form. The original Assignment receives the answer and reports completion. The action row disappears. Restart the same repaired Profile and verify the completed state remains closed.

## Evidence

- `before-inbox.png` / `after-inbox.png`: same pre-acceptance failure; empty Actions versus preserved ask.
- `before-source.png` / `after-source.png`: same original ask; closed receipt versus retry form. The `-dark` counterparts show the same states in dark theme.
- `after-retry-submitted.png`: actual Human Inbox submission.
- `after-completed.png` / `after-cleared.png`: actual model completion in the original Session and empty Actions afterward.
- `e2e-results.json`: allowlisted canonical state and native event facts. The failed and repaired delivery tool results both say `acceptance: pending`; only the repaired delivery adds an `agent/inbox/spliced` message. There is exactly one additional accepted answer, followed by the completion turn. Grant, permission mode, approval, and model route remain unchanged. Native acceptance is not described as execution completion.

## Validation

- Broad suite: 2400 passed, 9 skipped; its single docs-build failure came from a concurrent build replacing generated output. The affected docs test subsequently passed on its own.
- Final revision: 98 tests passed across the changed runtime, adapter, Human Inbox, migration, and docs surfaces.
- The 3 Browser files excluded from the broad sandbox run passed separately: 21 tests with an isolated test home and loopback access.
- Lint, source policy, format, typecheck, bilingual ledger checks, build, and docs build passed.
- Independent Standards and Spec reviews passed for `98d37040`; Human QA remains pending.
