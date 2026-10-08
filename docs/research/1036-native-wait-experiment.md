# #1036: native waiting experiment

Verified on 2026-10-09 (Asia/Tokyo), against application baseline
`fe08fd925f9bf4644b4634ef464ce83e758bfdae`, official DSH `0.2.0-rc.1`
(`4878cdabd87d4041bdaff61d04c966883b9fd07a`), pnpm `12.4.2`, Windows Node
`24.14.0`. This is a feasibility result, not delivery of #1037 or #1038.

## Result

An Assignment-owned native approval leaves its independent Orchestrator root
available when the Orchestrator ends its dispatch turn. The same PersonaBot
really processed and replied to unrelated Inbox work before approval. Web Allow
once then resolved the original native call; its actual stdout was
`EXACT_OPERATION_1036` with a non-error result. This does **not** prove that the
waiting Assignment released its running permit or that bounded waiting capacity
and reacquisition exist.

An Orchestrator-owned native approval and an Orchestrator-owned formal question
both blocked that same Agent's unrelated processing. For more than 20 seconds,
the second message was durably admitted and labelled processing/observed, but
had no native `user/message` claim, subsequent model step or reply. Existing Web
controls accepted the decision. The original call returned in the same Session,
then the native Agent claimed the unrelated message and the real model called
`channel_send`, whose receipt matches the committed Channel reply.

The concrete local upstream-capability blocker is
[#1220](https://github.com/BotHarness/DeepSeekBot/issues/1220). #1036 remains open
and blocked; #1037 remains blocked by #1036, and #1038 by #1037. No upstream post
has been made. An upstream proposal needs contribution-rule review and Human
authorization. Clearing the gate requires a supported mechanism and fresh real
native/model qualification, not just a later version or a negative report.

## Retained native evidence

Times below are on 2026-10-09, Asia/Tokyo. JSON event times are Unix milliseconds;
Channel timestamps use UTC. Each file retains exact original Session/call/owner,
native approval identity when applicable, serialized arguments, original result,
actual model Provider/route and the unrelated send/Channel receipt correspondence.

| Independent case                       | Unrelated reply                                   | Original native result                                                         | Evidence                                                          |
| -------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| Assignment approval                    | 00:45:56.225, before approval at 00:45:57.317     | Exact stdout at 00:45:58.447                                                   | [Assignment](../evidence/issue-1036/assignment.json)              |
| Orchestrator approval                  | 00:42:43.184, after approval at 00:42:39.469      | Exact stdout at 00:42:40.514                                                   | [Approval](../evidence/issue-1036/orchestrator-approval.json)     |
| Orchestrator formal question           | 00:44:03.155, after answer/result at 00:44:01.702 | Original question returns `Canary`                                             | [Question](../evidence/issue-1036/orchestrator-question.json)     |
| Assignment Grant revoked               | 00:46:12.987, before refusal                      | Native `unavailable`, error result at 00:46:13.469; stale Web decision refused | [Revocation](../evidence/issue-1036/assignment-revoked.json)      |
| Orchestrator Grant write scope changed | 01:02:55.240, after refusal                       | Native `unavailable`, error result at 01:02:52.330; stale Web decision refused | [Changed scope](../evidence/issue-1036/orchestrator-changed.json) |

All actual model routes were `deepseek-official/deepseek-flash`, using the
existing machine-local DeepSeek fallback. OpenCode Go was not configured. Every
case first obtained a real `BASELINE_1036` DM reply. No IM receiver, shared test
account or production service was involved. Neither cancellation nor restart
was used to continue any retained operation.

Question cards carry the owning Session and questions, not a call ID. The
verifier resolves the exact `ask_user_question` native call by its complete
question arguments in that Session. An answer is not a filesystem authorization;
Grant-scope negative checks belong to the tool-approval cases.

## Reproduce

Use a fresh task-owned isolated Profile and the repository's documented
[model credential reuse](../agents/ax-model.md). Never commit the launch JSON,
cookie jar, Profile or `private.json`: these remain under ignored `.humanlayer/`.
The launcher refuses a mismatched CLI and verifies authenticated native/Bridge
transport. Its health is not model proof; the experiment obtains its own DM.

From the worktree in PowerShell:

```powershell
pnpm install --frozen-lockfile
pnpm build
New-Item -ItemType Directory -Force .humanlayer/tasks/1036-review | Out-Null
node scripts/dev-instance.mjs --home .humanlayer/tasks/1036-review/profile --port 32137 --json > .humanlayer/tasks/1036-review/launch.json
$env:BH_WAIT_LAUNCH = (Resolve-Path .humanlayer/tasks/1036-review/launch.json).Path
$env:BH_WAIT_OUT = '.humanlayer/tasks/1036-review/evidence'
node scripts/experiment-native-wait.mjs assignment
node scripts/experiment-native-wait.mjs approval
node scripts/experiment-native-wait.mjs question
node scripts/experiment-native-wait.mjs revoked
node scripts/experiment-native-wait.mjs changed
pnpm exec vitest run scripts/test/experiment-native-wait-proof.test.mjs
```

Run cases sequentially. Each creates a fresh QA PersonaBot and Grant through
existing authenticated owning services, uses a real model, observes a bounded
wait, and clicks the existing Web Allow once / Answer and continue control.
Negative cases change/revoke only their own QA Grant, then call the existing Web
decision endpoint to retain its explicit refusal. The native operation is a
single `echo` marker. Native tool names/arguments are read from actual events;
Windows exposes `pwsh` and may also accept native `bash`.

Each case records private checkpoints and writes public `evidence.json` only
after native assertions pass. The public projection excludes model requests,
reasoning, streams and runtime context, and redacts local home paths. Inspect
any proposed publication; the retained examples contain synthetic task content
only. Do not publish an arbitrary user's Profile through this exporter.

To revalidate/export a retained private run independently:

```powershell
node scripts/experiment-native-wait-evidence.mjs <private-run.json> <review-evidence.json>
node scripts/dev-client-diagnostics.mjs --launch .humanlayer/tasks/1036-review/launch.json
```

The script independently captures real DOM and browser warnings/errors at entry
and exit. The diagnostic reader retains document attempts; a closed browser
reports closed/stale, not current shell readiness. A failed runner preserves
private evidence and throws; inspect the existing request before retrying with a
fresh case. Never replay an uncertain decision. When review finishes, stop only
the exact task-owned Host PID recorded by the launcher. Stopping is cleanup,
not a continuation experiment.

## Attempt history and limits

- Initial browser navigation attempts failed before sending any model request:
  a broad `.bh-root` selector also matched native navigation. The corrected
  runner waits for the first-run notice and actual Channel navigation. No
  browser warnings/exceptions were observed in the retained successful paths.
- The first successful Assignment's model report falsely said no approval card
  appeared. Native `approval/asked`, the committed request/Web decision and
  `approval/decided` prove otherwise. Model prose is not lifecycle evidence.
- Early negative runners incorrectly treated the Bridge's expected
  `invalid-input` refusal as failure, or waited for a successful-result DM after
  native refusal. Their original Session tails were later collected read-only;
  no restart, cancellation, new decision or effect replay occurred. Their
  native `unavailable`/error results and actual unrelated replies are retained.
- The corrected runner completed a fresh-Profile changed-scope case without
  manual recovery, including its own native assertions and sanitized export;
  that final run supplies the retained changed-scope evidence above.
- Later overlapping retries encountered local `ECONNRESET` and are excluded
  from successful qualification. The Host still answered diagnostics. The
  reset's cause is unproven; it is not evidence of a native continuation defect.
- Twenty seconds is a bounded runtime observation, not proof of arbitrary
  liveness. The pinned driver source independently explains why no next model
  step can begin before the awaited current tool resolves. See the
  [primary-source analysis](1036-native-wait-source-analysis.md).
- There is no new executor, mailbox, decision authority, native API, production
  wait state, permit release/reacquisition, expiry/restart implementation or UI
  behavior. Existing ADR-0035 and ADR-0045 ownership/delivery invariants remain.

Human review should rerun both Orchestrator cases, inspect exact original
call/result and unrelated reply ordering, and review #1220's upstream proposal.
Independent Assignment success alone cannot clear this gate.

## Repository validation

Build, lint (including source policy and both bilingual Release Ledgers),
formatting and type checking passed. The focused evidence, tool-approval and
formal-question suite passed 34 tests across three files. Its evidence checks
reject failed original operations, unaccepted Web decisions, replacement
Sessions, changed arguments, unrelated receipts, cancellation and incomplete
native snapshots.

The full repository test run encountered failures in unchanged modules and
does not establish a green baseline. A separate single-worker reproduction of
`registry.test.ts` / `provisions the Memory directory for a name-only bot but
writes no Persona` failed in existing `afterEach` cleanup: Windows returned
`EPERM` to recursive removal of its temporary directory. Other full-suite
failures include timeouts; their causes have not been established by this
experiment. No production module or existing test was changed to mask them.
