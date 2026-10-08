# #1036: pinned native wait and continuation source analysis

Investigated: 2026-10-09, Asia/Tokyo. Scope: the source-level mechanism behind
Assignment-owned tool approvals and Orchestrator-owned formal questions/tool
approvals. This note is **source analysis, not runtime evidence**. The bounded
experiment and its sanitized native/model timeline must independently establish
what actually ran.

DSH baseline: `0.2.0-rc.1`, official upstream revision
[`4878cdabd87d4041bdaff61d04c966883b9fd07a`](https://github.com/deepseek-ai/deepseek-harness/commit/4878cdabd87d4041bdaff61d04c966883b9fd07a).
Application baseline inspected:
[`fe08fd925f9bf4644b4634ef464ce83e758bfdae`](https://github.com/BotHarness/BotHarness/commit/fe08fd925f9bf4644b4634ef464ce83e758bfdae).
Pinned upstream files were read directly from the official repository; the
ignored `reference/1036/` directory is a convenience copy, not a new authority.
The DSH Plugin skill Context and Decision Tree were read before choosing seams.

## Finding

The inspected default DSH Agent driver supports waiting on the original live
tool call and continuing it after the answerer resolves. It does **not expose an
exact-operation suspension primitive that releases that same Agent to process
another model turn while its current approval/question remains unresolved**.
This is a bounded finding about the pinned public Agent contract and default
driver, not a claim about every conceivable custom driver or later release.

An Assignment-owned wait and an Orchestrator-owned wait therefore need separate
experiments. Independent Assignment and Orchestrator root Sessions can run
independently; that existing ownership relationship is a plausible supported
path for keeping the Orchestrator available while an Assignment waits. An
Orchestrator waiting inside its own formal question or approval still owns its
current step, so new input can be accepted into its native Agent Inbox without
being processed by the model. This conclusion follows from the execution chain
below and must be checked against the actual Host.

## Native execution chain

| Boundary          | Pinned source fact                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Consequence for this experiment                                                  |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Agent delivery    | `followup` sends to `next-turn`; `steer` sends to `next-step`; `inject` sends to `next-step` without waking. [`agent.ts:154–172`](https://github.com/deepseek-ai/deepseek-harness/blob/4878cdabd87d4041bdaff61d04c966883b9fd07a/packages/core/agent-loop/src/agent.ts#L154-L172)                                                                                                                                                                                                                                                                                     | Acceptance is queue insertion, not model execution.                              |
| Driver ownership  | `wakeDriver` returns when a non-idle phase already owns the Agent. Only idle starts a new driver. [`agent.ts:214–234`](https://github.com/deepseek-ai/deepseek-harness/blob/4878cdabd87d4041bdaff61d04c966883b9fd07a/packages/core/agent-loop/src/agent.ts#L214-L234)                                                                                                                                                                                                                                                                                                | A steering wake cannot open a parallel model turn around a pending tool.         |
| Inbox consumption | `preStep` claims Inbox input; `Inbox.claim` drains next-step input and, for a next-turn boundary, one queued turn item. [`agent.ts:267–285`](https://github.com/deepseek-ai/deepseek-harness/blob/4878cdabd87d4041bdaff61d04c966883b9fd07a/packages/core/agent-loop/src/agent.ts#L267-L285), [`inbox.ts:103–113`](https://github.com/deepseek-ai/deepseek-harness/blob/4878cdabd87d4041bdaff61d04c966883b9fd07a/packages/core/agent-loop/src/inbox.ts#L103-L113)                                                                                                     | A message must reach a later step before the model can see it.                   |
| Step execution    | The turn awaits `step(decision)` before closing the step or proposing another one. The step awaits `executeToolCalls`. [`agent.ts:313–364`](https://github.com/deepseek-ai/deepseek-harness/blob/4878cdabd87d4041bdaff61d04c966883b9fd07a/packages/core/agent-loop/src/agent.ts#L313-L364), [`agent.ts:532–538`](https://github.com/deepseek-ai/deepseek-harness/blob/4878cdabd87d4041bdaff61d04c966883b9fd07a/packages/core/agent-loop/src/agent.ts#L532-L538)                                                                                                      | An unresolved tool prevents the next Inbox claim/model step.                     |
| Tool scheduling   | Ordered preparation is awaited before dispatch. The scheduler drains dispatched calls and commits their results in model order before returning. Parallel bodies belong to one existing assistant step. [`tool-calls.ts:165–184`](https://github.com/deepseek-ai/deepseek-harness/blob/4878cdabd87d4041bdaff61d04c966883b9fd07a/packages/core/agent-loop/src/tool-calls.ts#L165-L184), [`tool-calls.ts:199–246`](https://github.com/deepseek-ai/deepseek-harness/blob/4878cdabd87d4041bdaff61d04c966883b9fd07a/packages/core/agent-loop/src/tool-calls.ts#L199-L246) | Parallel tool dispatch is not a separate Inbox-processing/model-turn capability. |

The public Agent contract agrees: steering is consumed at the next step;
maintenance requires true idle and throws if turn-driving already owns the
Agent. Its declared methods cover `cancel`, `whenIdle`, `runMaintenance`, `send`,
`followup`, `steer`, and `inject`; none supplies an in-flight-call suspension or
resume handle.
[`runtime-types.ts:163–241`](https://github.com/deepseek-ai/deepseek-harness/blob/4878cdabd87d4041bdaff61d04c966883b9fd07a/packages/core/agent/src/runtime-types.ts#L163-L241)

### Approval wait

Native tools preparation awaits `tools/pre-execute` and any `ask` resolution;
`serviceAsk` awaits `approval.request`. Only `allowed-once` permits dispatch.
[`tools/index.ts:1505–1535`](https://github.com/deepseek-ai/deepseek-harness/blob/4878cdabd87d4041bdaff61d04c966883b9fd07a/packages/core/tools/src/index.ts#L1505-L1535),
[`tools/index.ts:1729–1765`](https://github.com/deepseek-ai/deepseek-harness/blob/4878cdabd87d4041bdaff61d04c966883b9fd07a/packages/core/tools/src/index.ts#L1729-L1765)

`ApprovalService.request` requires an open turn, appends `approval/asked` with a
fresh request ID and the original optional `callId`, awaits the scoped answerer,
then appends matching `approval/decided`. The answer is a live Promise outcome,
not a persisted executable continuation. Aborting settles `cancelled` and a late
answer cannot replace that outcome.
[`user-approval/index.ts:197–234`](https://github.com/deepseek-ai/deepseek-harness/blob/4878cdabd87d4041bdaff61d04c966883b9fd07a/packages/interaction/user-approval/src/index.ts#L197-L234),
[`user-approval/index.ts:267–306`](https://github.com/deepseek-ai/deepseek-harness/blob/4878cdabd87d4041bdaff61d04c966883b9fd07a/packages/interaction/user-approval/src/index.ts#L267-L306)

### Formal question wait

The model-facing `ask_user_question` tool awaits `ctx.userQuestions.ask` and
returns the Human answer as its ordinary tool result. The service awaits the
scoped `user-questions/request` waterfall. A supplied Agent must be the registry's
exact live instance and a live runtime root; native delegated children receive
`DELEGATED_CALLER`. An application-owned independent Assignment root is distinct
from a native child, but BotHarness's current Channel question answerer itself
accepts only Orchestrator ownership.
[`tool-ask-user/index.ts:79–98`](https://github.com/deepseek-ai/deepseek-harness/blob/4878cdabd87d4041bdaff61d04c966883b9fd07a/packages/interaction/tool-ask-user/src/index.ts#L79-L98),
[`user-questions/index.ts:86–107`](https://github.com/deepseek-ai/deepseek-harness/blob/4878cdabd87d4041bdaff61d04c966883b9fd07a/packages/interaction/user-questions/src/index.ts#L86-L107),
[`user-questions/index.ts:130–150`](https://github.com/deepseek-ai/deepseek-harness/blob/4878cdabd87d4041bdaff61d04c966883b9fd07a/packages/interaction/user-questions/src/index.ts#L130-L150),
[`ChannelUserQuestions.ask`](https://github.com/BotHarness/BotHarness/blob/fe08fd925f9bf4644b4634ef464ce83e758bfdae/packages/core/src/channels/user-questions.ts#L89-L149).

## Current application ownership and decision scope

These are **application-defined** boundaries, not new DSH APIs:

- The architecture assigns one independent Orchestrator root Session and zero
  or more independent Assignment root Sessions to a PersonaBot. Assignment
  AgentHandles belong to Host-lifetime Assignment Runtime, not the Orchestrator
  Agent's lifecycle. Ordinary Assignment Requests map to native injection,
  steering or follow-up, without cancelling an in-flight tool.
  [Runtime architecture](../architecture/bot-runtime-architecture.en.md#assignment-session).
- `runOrchestrator` uses the selected native handle, sends follow-up input, and
  awaits `whenIdle`; `steerOrchestrator` calls that same handle's native `steer`
  and returns `true` after submission.
  [`dsh-bot-agent-adapter.ts:314–382`](https://github.com/BotHarness/BotHarness/blob/fe08fd925f9bf4644b4634ef464ce83e758bfdae/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L314-L382).
- `ChannelToolApproval` tracks original Agent, Session, call, tool name, complete
  serialized input, role, working directory and scope. Its answer Promise is
  kept live until the existing Web/adapter decision resolves it. Decision
  validation and the later execution guard recheck original call/input,
  ownership and scope.
  [`tool-approval.ts:104–246`](https://github.com/BotHarness/BotHarness/blob/fe08fd925f9bf4644b4634ef464ce83e758bfdae/packages/core/src/workspaces/tool-approval.ts#L104-L246),
  [`tool-approval.ts:313–406`](https://github.com/BotHarness/BotHarness/blob/fe08fd925f9bf4644b4634ef464ce83e758bfdae/packages/core/src/workspaces/tool-approval.ts#L313-L406).
- Assignment approval scope requires the original active Workspace Grant and
  captures `[assignment, cwd, grantId]`. Orchestrator scope captures
  `[orchestrator, cwd, sorted active grant IDs and write revisions]`. Revocation
  or changed scope therefore offers a real refusal probe. The actual result
  must be recorded; source checks alone are not runtime proof.
  [`plugin.ts:990–1013`](https://github.com/BotHarness/BotHarness/blob/fe08fd925f9bf4644b4634ef464ce83e758bfdae/packages/core/src/plugin.ts#L990-L1013).
- Formal questions retain their own exact live Agent/Orchestrator ownership and
  signal checks; they do not carry the tool approval Workspace Grant snapshot.
  A question answer is not a grant for a later filesystem operation. The later
  operation still enters the existing permission/approval gates.
  [`user-questions.ts:164–221`](https://github.com/BotHarness/BotHarness/blob/fe08fd925f9bf4644b4634ef464ce83e758bfdae/packages/core/src/channels/user-questions.ts#L164-L221),
  [`plugin.ts:1144–1187`](https://github.com/BotHarness/BotHarness/blob/fe08fd925f9bf4644b4634ef464ce83e758bfdae/packages/core/src/plugin.ts#L1144-L1187).
- Existing Web decisions are `toolApprovalDecide` and `userQuestionAnswer`,
  targeting their committed Channel request message. They return decision
  acceptance separately from the native tool's subsequent result.
  [`bridge/rpc.ts:819–840`](https://github.com/BotHarness/BotHarness/blob/fe08fd925f9bf4644b4634ef464ce83e758bfdae/packages/core/src/bridge/rpc.ts#L819-L840).

An especially important evidence limitation: the current application marks
steered DM Admissions observed immediately after `steerOrchestrator` returns
success. That is earlier than the native later-step Inbox claim described above.
Neither this observation nor a healthy Admission/API proves the model processed
the message during the wait.
[`bot-runtime.ts:1378–1385`](https://github.com/BotHarness/BotHarness/blob/fe08fd925f9bf4644b4634ef464ce83e758bfdae/packages/core/src/runtime/bot-runtime.ts#L1378-L1385)

## Cancellation and cold resume are different mechanisms

Native `cancel` aborts the active signal; `keepInbox` preserves pending messages,
not the active tool's continuation. The running turn records an `aborted` ending.
[`agent.ts:175–180`](https://github.com/deepseek-ai/deepseek-harness/blob/4878cdabd87d4041bdaff61d04c966883b9fd07a/packages/core/agent-loop/src/agent.ts#L175-L180),
[`agent.ts:366–385`](https://github.com/deepseek-ai/deepseek-harness/blob/4878cdabd87d4041bdaff61d04c966883b9fd07a/packages/core/agent-loop/src/agent.ts#L366-L385).

`ctx.agents.resume` opens a persisted Session under exclusive write ownership and
constructs a fresh live Agent. For an interrupted final turn, the default factory
appends missing tool error results and step/turn closers before publication.
It does not recover the old JavaScript tool Promise or pending question/approval
answerer. Creating another live writer for the same Session is explicitly
excluded by its write claim.
[`agent-loop/index.ts:816–882`](https://github.com/deepseek-ai/deepseek-harness/blob/4878cdabd87d4041bdaff61d04c966883b9fd07a/packages/core/agent-loop/src/index.ts#L816-L882).

Consequently, stopping and re-prompting, cold-loading the same Session history,
reissuing a tool under a new call ID, or returning a fabricated pending tool
result cannot establish exact-operation suspension/resume for #1036.

## Runnable candidate paths and remaining gate

1. **Assignment-owned native tool approval:** create a real owned Assignment
   through the existing runtime, induce one benign opaque call requiring Web
   approval, retain its original Session/call/native approval IDs, then send an
   unrelated DM to the same PersonaBot. Require a real model-generated explicit
   Channel reply before accepting the pending Assignment approval. Accept once
   and observe the original call's result plus an actual authorized effect.
2. **Orchestrator-owned native formal question:** induce native
   `ask_user_question`, leave it unresolved, and send an unrelated DM. Retain
   the accepted Inbox input and check whether a model request/reply occurs
   before answering. The source predicts it will stay queued. Answer through
   `userQuestionAnswer` and observe the original call result and subsequent
   model processing on that same Session, without cancellation.
3. **Orchestrator-owned native tool approval and scope refusal:** induce a
   benign opaque call through the existing gate. Test a fresh allowed case and
   a separate original request whose grant scope is revoked/changed while
   pending. Preserve acceptance/refusal and native result/effect evidence for
   each. A formal question does not substitute for the approval scope test.

Use bounded wait windows and fresh identifiers per run. Preserve request/decision
timestamps, original native call IDs, Session ownership, Inbox insertion/claim,
model request boundaries, original tool results and committed replies. A finite
absence window alone does not prove an impossible capability; the source chain
above explains the boundary, and a reply after resolution makes the blocked
timeline reproducible.

If runtime matches this analysis, the remaining upstream capability requirement
is specific: preserve an unresolved original operation and its native ownership,
allow the owning Orchestrator to process unrelated native Inbox input through the
real model, then resume that exact operation only after accepted Human decision
and current-scope validation. Its design must preserve Session call/result order
and cancellation semantics without a second executor/mailbox or downstream
fabricated API. This note proposes a requirement, not an implementation.

The negative Orchestrator result must leave the production continuation gate
blocked. #1036 requires a concrete blocking issue and explicit dependency
relationships before closing the gate or selecting #1037/#1038 implementation.
This source investigation neither authorizes an upstream post nor delivers those
production features. [#1036 acceptance criteria](https://github.com/BotHarness/DeepSeekBot/issues/1036).
