# #1220: native continuation frontier after #1223

Follow-up: the [DM card tracer and real browser E2E](1220-timed-question-card-e2e.md) adapt the
verified native question seam. Permission, capacity, cold recovery and Group privacy remain open.

Investigated on 2026-10-09, Asia/Tokyo. This is primary-source research; the
subsequent [isolated runtime qualification](1220-native-timed-question-experiment.md)
records the tested subset and remaining integration gaps. It is not a production design
decision. Application baseline: merged PR [#1223](https://github.com/BotHarness/DeepSeekBot/pull/1223),
commit `e1c1b43c4397879888eacd7210fcfe2cb44d3fbd`. The DSH Plugin skill Context
and Decision Tree were read before selecting the Service, Agent Inbox and
Session Projection seams. Orchestrator, Assignment, PersonaBot and Group
Channel below are application-defined BotHarness concepts.

## Finding

DSH **0.2.0-rc.2 already provides an opt-in native deferred-question mechanism**.
Its foreground `ask_user_question` call can truthfully finish with a pending
result, while the original question remains answerable by its original Session
and call ID. A later answer enters that same root Agent's Inbox as qualified
user input. This is promising for conversational questions; it is not a
resumption of a still-running tool call. It deserves a fresh real-model probe
before deciding that all nonblocking questions need a new upstream primitive.
That narrow probe subsequently passed; see its separate runtime report above.
[RC2 release](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.0-rc.2),
[native tool contract](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/interaction/tool-ask-user/README.md),
[native Service contract](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/interaction/user-questions/README.md).

Native **permission approval remains a separate unresolved boundary**. Its
outcomes have no pending/deferred value, its Service requires an open turn, and
the default Agent driver still awaits the current tool step. A timed question
answer is not an approval grant. Neither a version upgrade nor successful
question qualification clears the permission/capacity portions of
[#1220](https://github.com/BotHarness/DeepSeekBot/issues/1220).
[Approval outcomes](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/interaction/user-approval/src/types.ts#L28-L32),
[approval restrictions](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/interaction/user-approval/README.md#known-limitations-and-deferred-work),
[driver wait](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/core/agent-loop/src/agent.ts#L532-L538).

## Version boundary

The official repository's default and only advertised branch was `master` at
`5badb15009ae1756c3afe0ae0cef1faafc290ccc`, also the newest published tag,
`dsh-v0.2.1-alpha.1` (released 2026-10-03). The earlier experiment correctly
qualified pinned RC1; it did not test RC2 timed mode.
[Current revision](https://github.com/deepseek-ai/deepseek-harness/commit/5badb15009ae1756c3afe0ae0cef1faafc290ccc),
[official branches](https://api.github.com/repos/deepseek-ai/deepseek-harness/branches),
[official releases](https://github.com/deepseek-ai/deepseek-harness/releases).

| Release         | Exact revision                             | Relevant result                                                                                           |
| --------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `0.2.0-rc.1`    | `4878cdabd87d4041bdaff61d04c966883b9fd07a` | Original blocking question and approval experiment. No timed tool/projection files.                       |
| `0.2.0-rc.2`    | `639ed015397290b3745d163aafe02ffee4aa3f84` | First subsequent published release containing the experimental timed question and recoverable late reply. |
| `0.2.1-alpha.1` | `5badb15009ae1756c3afe0ae0cef1faafc290ccc` | Timed tool, question Service and Projection implementations are byte-identical to RC2.                    |

The retained introduction is commit
[`3a296b1`](https://github.com/deepseek-ai/deepseek-harness/commit/3a296b16b400ad2125476464f21d3d15678788f0),
followed by the tool-definition separation
[`daec283`](https://github.com/deepseek-ai/deepseek-harness/commit/daec283261f0c40005fff8c081babbb8087e1cca)
and recoverability fix
[`fc30c5a`](https://github.com/deepseek-ai/deepseek-harness/commit/fc30c5a7d2567c7dc38be335af39cfedf4fd7fdc).
Those commits landed after RC1 and before RC2. An earlier attempt was reverted;
its September 19 design-note filename is not a release-availability date.
[Timed-wait file history](https://api.github.com/repos/deepseek-ai/deepseek-harness/commits?path=packages/interaction/user-questions/src/timed-wait.ts).

Exact Git blob comparison across RC1, RC2 and the current alpha found the default
`agent-loop/src/agent.ts` unchanged (`2f68565cef052f82ef6f2a740141962507654e02`),
and `user-approval/src/index.ts` unchanged
(`9a14f04d0b3c7f6dbcacb1fd2537186b1213f02e`). Timed questions add a different
truthful tool-result lifecycle; they do not unlock concurrent model turns around
an unresolved existing tool Promise.
[RC1–RC2 comparison](https://github.com/deepseek-ai/deepseek-harness/compare/dsh-v0.2.0-rc.1...dsh-v0.2.0-rc.2),
[RC2–alpha comparison](https://github.com/deepseek-ai/deepseek-harness/compare/dsh-v0.2.0-rc.2...dsh-v0.2.1-alpha.1).

## Supported deferred-question contract

The native Tool is a Consumer of `UserQuestionService`; the latter owns the
foreground wait and qualified late-answer delivery. Its `userQuestions`
Projection derives durable answerability from canonical SessionEvents. No
second Agent, model executor, mailbox, or question database is required.
[Implemented upstream decision](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/.agents/notes/implemented/architecture/2026-09-19-timed-user-question-two-settlements.md#ownership).

### Configure the native tool

Shipped presets remain blocking. Change the `tool-ask-user` **Plugin row inside
the selected Agent Preset's `config.plugins`**, rather than adding a top-level
Patch entry or a second competing Tool Registration:

```yaml
- id: tool-ask-user
  name: '@deepseek-ai/dsh-tool-ask-user'
  config:
    mode: timed
    timeout: 2
```

Two seconds is a proposed short synthetic probe value, not a product default.
The native default is 120 seconds. A model call can supply `timeout`; positive
integer seconds select timed mode, while `-1` selects an indefinite wait. The
maximum seconds value is 2,147,483. The logged **Tool schema**, including its
`timeout` property, tells the Projection that this is a timed call even when the
model omits the argument. Legacy schema calls are not late-answerable.
[Configuration](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/interaction/tool-ask-user/README.md#use-this-package),
[implementation](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/interaction/tool-ask-user/src/timed.ts),
[Projection discriminator](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/interaction/user-questions/src/projection.ts#L25-L36).

Programmatic callers use the actual Service signature
`ctx.userQuestions.askTimed({ questions, agent, signal }, callId, timeoutMs)`.
It requires the exact live root Agent and a positive safe integer duration up to
2,147,483,647 milliseconds. Its result is an answer batch or
`{ pending: true, callId }`. A custom caller does not automatically get a
reconstructable native Tool history: the proposed qualification should induce
the real native Tool through the model, not call this Service as its proof.
[Service source](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/interaction/user-questions/src/index.ts#L222-L269).

### Two truthful settlements

1. During the foreground wait, the scoped `user-questions/request` Cordis Event
   waterfall carries `wait: { callId, timed: true }`. An in-time answer becomes
   the original Tool result. A foreground deadline ends only the private wait,
   producing the native pending result; it does not abort the Agent Turn.
2. After that result commits, the question is `continued`. The public Remote
   method `userQuestions.answer(agent, callId, answer)` verifies the exact live
   root and original continued call, then uses native `agent.steer` to deliver
   a `UserMessage` with source
   `{ kind: 'user-question-reply', callId, outcome: 'answered' }`. Its JSON text
   identifies `answer_to_pending_question`, original questions and answers.
   This does not rewrite the original pending result or invoke its Tool again.

[Wait/result source](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/interaction/tool-ask-user/src/timed.ts#L191-L207),
[late-answer source](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/interaction/user-questions/src/index.ts#L131-L205).

The shipped Client calls `remote.userQuestions.answer(sessionId, callId, answer)`;
the API Session Controller resolves that Session to its live Agent or resumes
its root. The isolated RC2 HTTP gateway names its Agent lookup argument **`agentId`**:
`POST /api/userQuestions/answer` with named arguments `{ agentId: sessionId, callId, answer }`.
Using the Service parameter name `agent` is rejected by the descriptor before execution.
This wire shape was verified on the running Host; it does not establish application Channel
authorization. A duplicate queued reply raises `REPLY_QUEUED`; an unknown/open call
returns false; a batch must name every original question exactly once.
Acceptance means queued input. The Projection settles only after admission as
`user/message`; discard leaves it answerable. Ordinary chat, including text that
imitates the reply JSON, has no qualified source and cannot settle the question.
[Client routing](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/client/ui-user-questions/src/client/index.ts#L282-L339),
[Agent resolution](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/api/session-controller/src/agent.ts#L139-L204),
[durable source compatibility](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/docs/persistence-changes/2026-09-21-user-question-reply.md#compatibility),
[reply tests](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/interaction/user-questions/tests/user-questions.spec.ts#L606-L906).

### Timing, restart and scope limits

- An unclaimed wait expires at its original Host deadline. A Client claims it
  with the cancellable `attachWait(agent, callId, signal)` Remote stream and
  owns its countdown; editing, focus or Take time can hold it. Losing the last
  claim restores the original deadline. Therefore finite configuration alone
  does not guarantee prompt availability while an actively editing Client
  still holds the foreground wait.
- A timed question can survive process exit because the Projection rebuilds
  from its Tool call/result and admitted reply. Resume repair's native
  `TOOL_OUTCOME_UNKNOWN` also makes an interrupted timed call continued. This
  preserves answerability, not the old JavaScript Promise. Native legacy calls
  do not gain this property; inherited questions are excluded from fork state.
- Parent cancellation is `ASK_ABORTED`, not a pending answer. The upstream
  decision explicitly lists real Host restart and live multi-Client delivery
  races as integration coverage gaps. Unit tests and source claims do not
  substitute for the required local qualification.
- The native Service authenticates Agent identity/root ownership and answer
  shape. It does not establish BotHarness Channel actor, Workspace Grant or
  disclosure authority. A qualified question reply still grants no permission
  to read or publish protected content.

[Wait lifetime](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/interaction/user-questions/src/timed-wait.ts),
[Projection rules](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/interaction/user-questions/src/projection.ts#L234-L347),
[upstream limits and coverage](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/.agents/notes/implemented/architecture/2026-09-19-timed-user-question-two-settlements.md#verification).

## BotHarness integration boundary

At the merged application baseline, `ChannelUserQuestions` stores only Session
and questions in its Channel request, ignores native `request.wait`, and deletes
its live pending map on abort while appending a cancelled resolution. Therefore
enabling timed mode alone can release the native model while expiring the
existing BotHarness Web question card. Keeping that stale Channel card pending
would not make its old Promise answerable. A future adapter must derive
continued state from the native Projection and use the qualified late-answer
contract through existing authenticated owning services, preserving actor and
Session ownership checks. This is an integration finding, not an instruction
to add another durable question authority.
[Application answerer](https://github.com/BotHarness/DeepSeekBot/blob/e1c1b43c4397879888eacd7210fcfe2cb44d3fbd/packages/core/src/channels/user-questions.ts#L89-L149),
[application cancellation](https://github.com/BotHarness/DeepSeekBot/blob/e1c1b43c4397879888eacd7210fcfe2cb44d3fbd/packages/core/src/channels/user-questions.ts#L246-L275).

The target in [#1038](https://github.com/BotHarness/DeepSeekBot/issues/1038) remains:
a protected private-content request must not silence the PersonaBot in that
same Group Channel. Before decision, the requester and another eligible member
must receive real replies to ordinary permitted messages, without protected
reads/disclosure, leaked approval details or implicit authorization. Repeat for
an unanswered formal question. Rejection settles only its protected operation;
accepted permission must revalidate current actor, owner, Grant scope and reply
destination. A question reply and Group membership are not authority grants.
Synthetic DM availability is a first probe, not this Group privacy acceptance.

## Safe next local probe

Start with **RC2 native timed question only**; keep approval as a negative
control. Preserve production root manifests, lockfile, patches and RC1 installs.
Use a task-local fixture under `.humanlayer/tasks/1220/candidate/`:

1. Copy the five development Bundle package manifests and built artifacts
   (`core`, `client`, `deepseekbot`, `computer`, `browser`), including their
   manifest-declared Patch/Client support files. Use copies, not package symlinks
   back to the production worktree. Keep local `link:` dependencies within that
   fixture. Create a minimal root workspace with exact
   `@deepseek-ai/dsh: 0.2.0-rc.2`.
2. In the copied manifests, explicitly rewrite every DSH dependency and peer
   pin to RC2; notably Core's `dsh-tools` peer and Browser/Computer's runtime
   `dsh-mcp-client`/`dsh-computer-use` dependencies otherwise import RC1. Pin
   required native experimental packages to RC2 as well. Do not copy production
   `node_modules` or its lockfile. Install the candidate workspace independently
   and inspect the resolved dependency graph for mixed DSH versions.
3. Recreate only necessary candidate workspace installation policy. Do not
   silently carry RC1 patches to RC2, remove a required guard, or claim the
   candidate is production-equivalent. Record omitted patch differences. Keep
   machine-local credential reuse, and use a checked DeepSeek model; the current
   AX Go qualification path explicitly refuses non-RC1 runtimes.
4. Launch the existing helper with `--worktree <absolute-candidate>` plus a
   fresh task-owned `--home` and unused loopback port. Its CLI equality check
   must see exact RC2 in both fixture root manifest and installed CLI. Verify
   authenticated native/API transport and a real model baseline reply. Record
   effective versions, preset/tool schema, bundle paths and exact owned PID.
   No shared Profile or IM service belongs in this first probe.
5. Apply timed mode only to the candidate preset row, verify the actual logged
   schema and two-second Tool argument, and induce a genuine native question.
   Let the native deadline return pending without cancellation/restart. Require
   the original call/result and a continued native Projection; send unrelated
   permitted input and obtain a real model reply before answering.
6. Use the shipped native authenticated late-answer control for this synthetic
   Session, explicitly recording that the current BotHarness card is not yet
   adapted. Require one qualified original-call reply, Inbox claim/admission,
   settled Projection and real model response; preserve the original pending
   Tool result unchanged. Wrong-call/duplicate/ordinary-chat attempts must not
   settle it. Do not expose this native bypass as a production Channel flow.

This fixture plan is supported by the launcher's existing `--worktree` and
version check, not a new arbitrary CLI override. Its sufficiency still needs
runtime validation. If a copied dependency or required RC1 patch prevents boot,
record that boundary before expanding scope.
[Launcher](../../scripts/dev-instance.mjs),
[development Bundle composition](../../scripts/dev-profile.mjs),
[current Core manifest](../../packages/core/package.json),
[current Browser manifest](../../packages/browser/package.json),
[current Computer manifest](../../packages/computer/package.json).

After that narrow path passes, qualify foreground answer, Client-held countdown,
cancelled/duplicate/discarded reply and a fresh-Profile restart as distinct cases.
Restart must be reported as durable-question recovery, never pending-call
suspension. Native Group privacy adaptation and bounded running-capacity
release/reacquisition remain later production seams.

## Proposals and unresolved maintainer questions

The public `AgentFactory` seam supports replacing the driver Provider, but this
does not constitute a supported ready-made pending-operation continuation API.
A custom driver would own Session order, original call/result pairing, one live
writer, Agent attribution and teardown. It is a substantial design proposal,
not the next minimal probe. Existing lifecycle hooks run at step/request/stop
boundaries; they cannot make the unchanged default driver enter a later step
while it awaits the current approval.
[Driver interchangeability](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/core/agent/README.md#design-concept),
[single factory](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/core/agent/src/index.ts#L348-L367),
[current-step ownership](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/core/agent-loop/src/agent.ts#L214-L234).

Concrete questions for a reviewable upstream Discussion draft are:

- Is native two-settlement approval planned, or is there another supported
  single-root mechanism retaining the protected operation's original identity
  while independent conversation proceeds? What is its canonical Session fact?
- If a permission operation is deferred after its foreground Tool truthfully
  finishes, who owns the exact arguments, actor/scope revalidation and later
  execution? Can the maintained native scheduler provide this without a
  downstream executor or automatic model reissue?
- How should bounded running permits, stop, expiry, process loss and uncertain
  effects interact with that mechanism? Which original call/result semantics
  are intentionally changed, rather than being presented as live suspension?
- For timed questions, is indefinitely holding the foreground wait during
  Client editing intended for an always-conversational Group Bot, and is there
  a supported configuration for stricter availability without discarding drafts?

Upstream currently does **not accept external pull requests** and directs bug
reports/feedback to GitHub Discussions. Prepare a concrete Discussion draft from
the native permission evidence and the new question probe; obtain Human
authorization before posting. No upstream post, production dependency upgrade
or downstream gate clearance is part of this research.
[Official contribution rules](https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/CONTRIBUTING.md).
