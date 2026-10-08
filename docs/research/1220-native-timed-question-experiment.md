# #1220: isolated native timed-question qualification

This report retains the original native-only baseline, including its cancelled application
card. The subsequent [real browser card E2E](1220-timed-question-card-e2e.md) qualifies the
application adapter on a later fixed application revision; it does not rewrite this baseline.

Verified on 2026-10-09 (Asia/Tokyo), after merging [#1223](https://github.com/BotHarness/DeepSeekBot/pull/1223).
Application baseline: `e1c1b43c4397879888eacd7210fcfe2cb44d3fbd`.
Native runtime: DSH `0.2.0-rc.2`, upstream
[`639ed015397290b3745d163aafe02ffee4aa3f84`](https://github.com/deepseek-ai/deepseek-harness/commit/639ed015397290b3745d163aafe02ffee4aa3f84).
This is an isolated native capability experiment, not production delivery or completion of
[#1220](https://github.com/BotHarness/DeepSeekBot/issues/1220).

## Result

**A real PersonaBot model can continue ordinary conversation while its original timed native
question remains unanswered, then process a qualified late answer in the same Session.**
The native Tool finishes truthfully with pending; the native question remains `continued`.
The later answer is qualified Inbox input correlated to the original call, not a replacement
question or a rewrite of its Tool result.

The existing BotHarness Web card is **not compatible**: its foreground abort handler records
`cancelled` when the native deadline expires, even though the native question remains answerable.
The synthetic probe therefore submits the late answer through the authenticated native control,
not through the application card. This does not qualify the application's current actor,
Channel, Workspace Grant or disclosure checks. Production dependencies remain RC1.

| Observed behavior                                                                         | Result                         |
| ----------------------------------------------------------------------------------------- | ------------------------------ |
| Real DM baseline through native model → `channel_send` → committed Channel message        | Passed                         |
| Genuine `ask_user_question`, timed schema and `timeout: 2`                                | Passed                         |
| One successful pending Tool result identifying the original call                          | Passed                         |
| Same Session question stays `continued` through a real unrelated model reply              | Passed                         |
| Ordinary message does not settle the question                                             | Passed                         |
| Wrong-call native answer                                                                  | Returned false                 |
| Original-call late answer → qualified Inbox enqueue → admitted `user/message`             | Passed                         |
| Real model replies with the actual selected answer, native Projection settles             | Passed                         |
| Duplicate answer after settlement                                                         | Returned false                 |
| Original pending Tool result remains unchanged, no question reissue or Agent cancellation | Passed                         |
| Existing BotHarness question card after native timeout                                    | Cancelled: integration gap     |
| Real browser console/DOM at entry and completion                                          | Captured; zero warnings/errors |

The public [native timeline](../evidence/issue-1220/timed-question.json) retains bounded snapshots,
original call/result, timed schema, model route, qualified answer provenance, canonical send
receipts and decision observation times. [The verifier](../../scripts/experiment-timed-question-proof.mjs)
rechecks these relationships instead of accepting a marker, queue acceptance or a native API
success alone. It drops system prompts, reasoning, Provider request bodies, login material,
local paths and full browser text. Private failed attempts are retained locally.

## Isolation and reproducibility

Only a task-local copied Bundle ran on RC2. The five package manifests and declared build files
were copied, with every native dependency/devDependency/peer pin explicitly changed to RC2.
No production package manifest, lockfile, install or shared Profile was changed. The candidate's
resolved native package directories contained no RC1 packages.

The candidate preserves the repository's pnpm policy and both reviewed native patches: filesystem
service injection and Go Session header handling. Their target keys are explicitly remapped to
RC2 while the reviewed patch files are retained; the RC2 install applies both successfully under
strict patch checks. This establishes applicability, not a new qualification of Go or filesystem
behavior. The actual question probe used DeepSeek, not Go.

The existing launcher verified exact candidate CLI equality and authenticated native/application
transport. The selected standard Agent Preset alone enabled its nested `tool-ask-user` Plugin
in timed mode. Adding a competing top-level Tool registration would not test the same contract.
The actual logged model Tool schema and arguments, not configuration alone, establish timed mode.

Run from a built application checkout. Keep all generated files private under the ignored task
directory. Choose unused candidate, home and port values; never reuse a shared Profile.

```powershell
pnpm build
node scripts/experiment-timed-question-fixture.mjs prepare .humanlayer/tasks/1220/candidate-new
pnpm --dir .humanlayer/tasks/1220/candidate-new install
```

Before launching, dump the candidate's native Web template using its own CLI with an explicit
fresh `DSH_HOME`. The fixture helper invokes the installed CLI's `--from-default-profile web`
and `--dump-config` flags, and retains the resulting configuration privately. Then:

```powershell
node scripts/experiment-timed-question-fixture.mjs dump .humanlayer/tasks/1220/candidate-new .humanlayer/tasks/1220/profile-new .humanlayer/tasks/1220/native-config-new.yml
node scripts/experiment-timed-question-fixture.mjs configure .humanlayer/tasks/1220/native-config-new.yml .humanlayer/tasks/1220/profile-new
node scripts/dev-instance.mjs --home .humanlayer/tasks/1220/profile-new --port 32141 --worktree .humanlayer/tasks/1220/candidate-new --json > .humanlayer/tasks/1220/launch-new.json
node scripts/experiment-timed-question.mjs .humanlayer/tasks/1220/launch-new.json .humanlayer/tasks/1220/proof-new.json
node scripts/experiment-timed-question-proof.mjs .humanlayer/tasks/1220/proof-new.json .humanlayer/tasks/1220/safe-new.json
```

The runner creates only a fresh synthetic Bot/DM and questions, uses two declared tools, reads
the real browser DOM/console, and does not approve protected operations. Keep launch JSON and raw
proof private. Stop only that launch's verified owned Host PID after evidence capture; cleanup is
not part of question continuation. Review exported content before publishing it.

The runtime signature is `userQuestions.answer(agent, callId, answer)`; its RC2 named HTTP wire
argument is `agentId`, carrying the Session ID. The gateway rejects `agent` before execution.
The native pending result also includes an explanatory `message`; the verifier checks its
pending/call identity without rejecting that extra field. Early local probe failures exposed
both harness mistakes, plus a wrong Human message ID prefix and an overly strict answer
punctuation assertion. They were corrected with failures retained; no uncertain decision was
retried. A fresh Bot completed the full behavior; its captured evidence passed the corrected
verifier. A later browser attempt stalled at native “Loading plugins…” without console errors
and made no model request; that first failure is retained, not presented as a product fix.
The final fresh Bot run then passed the complete corrected runner, including both browser
observations and all native/model/Channel correlations; its timeline is the retained public evidence.

## Meaning for the delivery gates

This narrows the [source investigation](1220-native-continuation-frontier.md): an unsupported new
primitive is not required merely to keep a timed question answerable while conversation proceeds.
It changes the Tool lifecycle deliberately; it does not suspend an open Tool Promise. Permission
approval remains a separate unresolved capability. Its relevant driver and approval Service
sources are unchanged from RC1; this experiment does not claim a new RC2 approval runtime test.

The next application tracer must preserve the original native call correlation, derive answerability
from native Projection, and send late answers through the existing authenticated owner with current
actor/Session/Channel checks. Keeping an expired Promise or copying native state into a second
question authority is insufficient. Qualify foreground answers, held countdowns, duplicate/queued/
discarded replies, actual cancellation, cold recovery and native capacity accounting separately.

[#1036](https://github.com/BotHarness/DeepSeekBot/issues/1036) still blocks
[#1037](https://github.com/BotHarness/DeepSeekBot/issues/1037), which blocks
[#1038](https://github.com/BotHarness/DeepSeekBot/issues/1038). The required Group privacy scenario
still needs real permitted replies to the requester and another eligible member while a protected
operation awaits a decision; no protected read/disclosure, approval-detail leakage or implicit grant
may occur. Rejection must leave conversation available; acceptance must revalidate current actor,
owner, scope and destination before only the original operation proceeds. A DM timed-question
probe does not demonstrate those properties. No upstream post or production rollout occurred.

## Validation

- Final fresh real-model/native/browser probe: passed; both browser observations had zero warnings/errors.
- Retained RC2 and RC1 evidence verification: 21 tests passed, including forged provenance,
  rewritten results, replacement Sessions, premature settlement, failed sends and mismatched receipts.
- Repository lint/source policy, bilingual product/Skill ledgers, formatting and type check: passed;
  the new scripts have no lint warnings.
- Direct Astro docs build: passed (400 documentation pages); Chinese OG font regeneration passed.
  This avoids the unrelated existing Windows Slides wrapper limitation and is not a claim that
  the full wrapper or full repository test suite was requalified.
- Fixture preparation, native config dump and nested-preset configuration: exercised separately;
  the actual RC2 install and authenticated launch are retained privately.
