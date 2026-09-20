# DSH Assignment runtime seam validation

Date: 2026-09-20
Issue: [#77](https://github.com/BotHarness/BotHarness/issues/77)
Scope: read-only validation of the DSH seams required by ADR-0035 and ADR-0045. This report does not change BotHarness runtime code or claim behaviour outside the pinned revision and environment below.

## Verdict

DSH `0.1.5-rc.2` has the low-level primitives BotHarness needs to create and resume an independent Assignment Session, choose a precise step/turn delivery boundary, query cold sessions, rebuild derived query state, enumerate continuable subagent descendants, and restrict tools. The pinned macOS Web profile also woke both a newly created idle root Agent and a cold-resumed root Agent without opening the conversation UI.

Three architecture assumptions must be corrected before implementation:

1. An Assignment Session is an independent runtime root, so it cannot use `ctx.subagents.sendMessage()` to report to an Orchestrator. BotHarness needs its own Assignment-directory/message adapter.
2. DSH tool scopes make role restrictions implementable, but DSH does not infer the Orchestrator/Assignment/Subagent roles. BotHarness must explicitly register and deny the role-specific tools, including on native subagents.
3. DSH provides a browser ZIP **export**, not an import/restore round trip. An exported session ZIP is not a portable restore artifact unless BotHarness later owns a separate, versioned import adapter.

No upstream blocker prevents the first Assignment implementation if those boundaries are accepted.

## Validation environment

| Item                            | Exact value                                                                                                                        |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| BotHarness DSH dependency       | `0.1.5-rc.2` in the current workspace package manifests                                                                            |
| DSH tag                         | `dsh-v0.1.5-rc.2`                                                                                                                  |
| DSH commit                      | `fb2c4b9e698e30edb738bca4cf0618587db7d203`                                                                                         |
| BotHarness Node / pnpm          | Node `v24.21.0`, pnpm `12.4.2`                                                                                                     |
| Upstream source-lab Node / pnpm | Node `v24.21.0`, upstream-pinned pnpm `11.7.0`                                                                                     |
| Host                            | macOS, arm64                                                                                                                       |
| Runtime profile                 | isolated Web profile at `/private/tmp/bh-dsh-home`, bundles `@deepseek-ai/dsh-base` + `@deepseek-ai/dsh-web-app`, `127.0.0.1:3080` |

The requested existing `web-dev` profile was not present and `dsh` was not globally installed. To avoid modifying the user's DSH home or adding a different package version, the runtime experiment built the exact upstream tag in `/private/tmp/botharness-dsh-015rc2` and used an isolated `DSH_HOME`. All probe code and result JSON lived under `/private/tmp`; none is a repository artifact.

Source-lab bootstrap and identity checks:

```bash
git clone --depth 1 --branch dsh-v0.1.5-rc.2 \
  https://github.com/deepseek-ai/deepseek-harness.git \
  /private/tmp/botharness-dsh-015rc2

cd /private/tmp/botharness-dsh-015rc2
fnm exec --using=24.21.0 -- corepack pnpm install --ignore-scripts
fnm exec --using=24.21.0 -- corepack pnpm run build:native-system
fnm exec --using=24.21.0 -- corepack pnpm run build
fnm exec --using=24.21.0 -- corepack pnpm dsh --version
git rev-parse HEAD
git describe --tags --exact-match HEAD
```

Observed identity output:

```text
0.1.5-rc.2
fb2c4b9e698e30edb738bca4cf0618587db7d203
dsh-v0.1.5-rc.2
```

`--ignore-scripts` intentionally prevented install-time native execution. The first focused test attempt therefore reported a missing `system.node`; running the upstream `build:native-system` target fixed the lab and the same tests passed. This was an incomplete source checkout bootstrap, not a DSH runtime failure.

## Evidence levels

The statuses below distinguish three evidence levels:

- **Web runtime**: an actual isolated Web host/profile and persisted JSONL sessions.
- **Pinned tests**: upstream tests executed locally at the exact tag and commit.
- **Pinned source**: public contract and implementation inspection at that revision.

`PASS` means the exact claimed seam was exercised at one or more appropriate levels. `FAIL` means the requested capability is absent or the stated assumption is false. `UNVERIFIED` means this run lacks adequate evidence; a mock is never counted as runtime proof.

## Result matrix

| Seam                                                                                 | Status         | Evidence                                   | Classification                                         | Implementation consequence                                                                                                                                   |
| ------------------------------------------------------------------------------------ | -------------- | ------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ctx.agents.create()` with `parentAgent` omitted creates an independent runtime root | **PASS**       | Web runtime, pinned tests/source           | Supported upstream seam                                | Create every Assignment Session without `parentAgent`; record the logical Orchestrator relationship in BotHarness, not DSH runtime ownership.                |
| `AgentHandle` is the teardown/ownership capability                                   | **PASS**       | Pinned tests/source                        | Supported upstream seam                                | The Assignment Runtime must retain the handle and be the only BotHarness component that disposes it.                                                         |
| `ctx.agents.resume()` restores a persisted root                                      | **PASS**       | Web runtime, pinned tests/source           | Supported upstream seam                                | A cold Assignment Session can resume by its durable Session id, then deliver input.                                                                          |
| `followup`, `steer`, `inject` step/turn boundaries                                   | **PASS**       | 196 agent-loop tests, pinned source        | Supported upstream seam                                | Map wake policies explicitly; do not treat these operations as synonyms.                                                                                     |
| `whenIdle()` and `cancel({ keepInbox: true })` convergence                           | **PASS**       | 196 agent-loop tests, pinned source        | Supported upstream seam                                | `whenIdle()` is whole-Agent quiescence, not acknowledgement of one message. `keepInbox` preserves unclaimed pending work only.                               |
| Newly created idle root wakes from `followup()` in Web profile                       | **PASS**       | Web runtime                                | Supported in tested environment                        | No UI-open workaround is required on this macOS profile.                                                                                                     |
| Cold persisted root wakes after `resume()` + `followup()`                            | **PASS**       | Web runtime                                | Supported upstream seam                                | A cold Assignment entry needs resume before delivery; there is no generic send-to-inactive-root API.                                                         |
| Windows/out-of-tree-plugin reproduction of upstream Discussion #6617                 | **UNVERIFIED** | Not this host                              | Environment-specific upstream risk                     | Keep a Windows/profile smoke test if Windows becomes a supported host; do not encode a UI-open workaround from the discussion alone.                         |
| Cold session query without making an Agent live                                      | **PASS**       | 169 query/export tests, pinned source      | Supported upstream seam                                | Read-only Assignment status/listing can use Session Query and BotHarness projections without waking Assignment.                                              |
| Projection/cache rebuild after restart                                               | **PASS**       | 169 query/export tests, pinned source      | Supported upstream seam                                | Treat query SQLite/projection caches as derived, rebuildable state.                                                                                          |
| Persistence `flush()` durability barrier                                             | **PASS**       | 175 JSONL persistence tests, pinned source | Supported upstream seam                                | Await flush before a coordinated stop/export boundary; it is not part of the BotHarness SQLite transaction.                                                  |
| DSH session ZIP export                                                               | **PASS**       | 169 query/export tests, pinned source      | Supported, browser-only upstream seam                  | Export includes root, descendants, and attachments; live roots are flushed first.                                                                            |
| DSH session ZIP import/restore                                                       | **FAIL**       | Pinned packages/source                     | **Upstream limitation**                                | Do not advertise DSH session ZIP round-trip restore. Exclude it from the first simple BotHarness import contract or add a separately designed adapter later. |
| Direct continuable parent/child messaging                                            | **PASS**       | 282 subagent/tool tests, pinned source     | Supported upstream seam with exact-adjacency limits    | Useful for real DSH continuable subagents only.                                                                                                              |
| Independent Assignment Session reports through `ctx.subagents.sendMessage()`         | **FAIL**       | Pinned source/authorization tests          | **BotHarness adapter gap** and false design assumption | Implement an Assignment-specific report/delivery tool backed by the durable Assignment directory and Orchestrator inbox.                                     |
| Continuable child settlement notice reaches direct parent                            | **PASS**       | 282 subagent/tool tests, pinned source     | Supported upstream seam                                | Preserve this behaviour for native subagents; it is an analogy for Assignment reporting, not the Assignment transport itself.                                |
| Durable descendant enumeration without waking children                               | **PASS**       | 282 subagent/tool tests, pinned source     | Supported upstream seam                                | Native subagent UI/status may use `listChildren`/`listDescendants`; Assignment listing remains a separate domain query.                                      |
| Scoped tool registration/restriction hides schema and rejects execution              | **PASS**       | 282 subagent/tool tests, pinned source     | Supported upstream seam                                | Register tools in the owning Agent scope and assert both schema invisibility and execution refusal.                                                          |
| DSH automatically knows Orchestrator/Assignment/Subagent tool roles                  | **FAIL**       | Pinned source                              | **BotHarness adapter gap**                             | Apply explicit restrictions on Assignment creation and every native in-process subagent start/resume.                                                        |

## 1. Independent root and handle ownership

The pinned contract in `packages/core/agent/src/index.ts` says `parentAgent?: Agent` and “omit for a root Agent” for both create and resume. Runtime ownership is therefore independent of durable session lineage: `meta.parentSession` describes persisted lineage; it does not make the Agent a live child. `AgentRegistry.roots()` is based on live runtime ownership.

The same contract defines `AgentHandle` as a capability. `ctx.agents.get(id)` deliberately returns a bare `Agent`; only the consumer that created/resumed the Agent receives its handle. `handle.dispose()` stops and drains the loop, unregisters the Agent, removes the live Session from the store, and unwinds the Agent scope. Factory-provider unload also drains all handles it created.

Focused command:

```bash
fnm exec --using=24.21.0 -- corepack pnpm exec vitest run \
  packages/core/agent-loop/tests/agent.spec.ts \
  packages/core/agent-loop/tests/loop.spec.ts \
  packages/core/agent-loop/tests/cancel.spec.ts \
  packages/core/agent-loop/tests/resume.spec.ts \
  packages/core/agent-loop/tests/scope-lifecycle.spec.ts
```

Observed summary:

```text
Test Files  5 passed (5)
Tests       196 passed (196)
```

**Result: PASS.** The BotHarness design must still choose a durable logical owner. The correct split is:

- DSH runtime owner: Assignment host component holding `AgentHandle`.
- BotHarness business owner: `OrchestratorSession -> Assignment` relationship in the Assignment directory.
- DSH durable identity: the Assignment Session id stored in that directory.

Do not infer any of these from another one.

## 2. Delivery and wake semantics

The exact pinned semantics are:

| Operation                            | Idle Agent              | Running Agent                                                 | Boundary                                                                               |
| ------------------------------------ | ----------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `followup(message)`                  | Wakes                   | Queues                                                        | Sole ordinary message of its own next turn                                             |
| `steer(message)`                     | Wakes and starts a turn | Consumed at nearest next step boundary                        | Next step; rejected step may leave it parked until another wake                        |
| `inject(message)`                    | Does **not** wake       | Claimed at nearest later pre-step                             | Adds model-facing context; can miss a request whose pre-step batch was already claimed |
| `cancel(cause, { keepInbox: true })` | No-op when already idle | Aborts active turn/maintenance; keeps unclaimed pending inbox | It does not restore an item already claimed by the active turn                         |
| `whenIdle()`                         | Resolves at quiescence  | Follows current and replacement work                          | Whole-Agent quiescence, not per-message settlement                                     |

A wake accepted after active cancellation is queued for the next turn and runs after the aborted activity converges to idle. A `disposed` cancellation leaves such work parked because disposal is terminal.

This produces an executable wake-policy mapping:

- “At the next safe model step, while current work continues” -> `steer`.
- “Supply context to the next step but do not start anything” -> `inject`.
- “Finish the current turn and then process a distinct user/work item” -> `followup`.
- “Interrupt the current step and replace direction” -> `cancel(..., { keepInbox: true })`, wait for convergence as required, then `steer` or `followup`. Never assume the in-flight claimed item returns to the inbox.

### Real Web-profile idle/cold probes

The minimal probe used a deliberately missing provider/model. That makes a successful model answer impossible, but it makes wake evidence unambiguous: a `turn/start` and `step/start` can only appear after the Agent driver wakes. The probe waited up to five seconds for `whenIdle()`, captured event types, disposed the handle, and exited.

The isolated profile was generated from the pinned CLI's default Web profile, then loaded the private probe from its user patch:

```yaml
# /private/tmp/bh-dsh-home/profiles/web/cordis.patch.yml
- insert:
    - id: botwork-web-wake-probe
      name: /private/tmp/botharness-dsh-015rc2/.tmp-seam-probe.mjs
```

Each boot used the same no-browser command; the host process exited only after the probe wrote its result and disposed the handle:

```bash
cd /private/tmp/botharness-dsh-015rc2
env DSH_HOME=/private/tmp/bh-dsh-home \
  fnm exec --using=24.21.0 -- corepack pnpm dsh web \
  --host 127.0.0.1 --port 3080 --no-open
```

New root core:

```ts
const handle = await ctx.agents.create({
  sessionId: SessionId('botwork-web-wake-probe'),
  agentOptions: { provider: 'probe-missing', model: 'probe-missing' },
  // parentAgent intentionally omitted
});
handle.agent.followup(
  createUserMessage({
    content: [{ type: 'text', text: 'probe web wake' }],
    source: { kind: 'user' },
  }),
);
await Promise.race([handle.agent.whenIdle(), timeout(5_000)]);
```

First-boot observed transition:

```text
before: permission/preset, sandbox/mode, approval/policy
after:  ... agent/inbox/spliced, turn/start, agent/inbox/spliced,
        step/start, step/end, turn/end
outcome: idle
```

The host was then stopped. On a second boot the probe used:

```ts
const handle = await ctx.agents.resume({
  resumeSessionId: SessionId('botwork-web-wake-probe'),
  agentOptions: { provider: 'probe-missing', model: 'probe-missing' },
  // parentAgent intentionally omitted
});
handle.agent.followup(
  createUserMessage({
    content: [{ type: 'text', text: 'probe cold resume wake' }],
    source: { kind: 'user' },
  }),
);
await Promise.race([handle.agent.whenIdle(), timeout(5_000)]);
```

Cold-boot observed transition:

```text
before: ... first turn/end, session/end-seed
after:  ... agent/inbox/spliced, turn/start, agent/inbox/spliced,
        step/start, step/end, turn/end
outcome: idle
```

**Result: PASS** for idle and cold-resumed wake on the tested macOS Web profile. A fully successful provider-backed response was not tested because this isolated profile intentionally had no credentials; that does not weaken the wake-boundary evidence.

The reported `0.1.5-rc.2` issue in [upstream Discussion #6617](https://github.com/deepseek-ai/deepseek-harness/discussions/6617) used Windows 11 and an external plugin and said opening the UI caused the queued turn to start. This run did not reproduce it on macOS with the exact tag and an out-of-tree file plugin. Windows/timing equivalence remains **UNVERIFIED**.

## 3. Cold query, projections, persistence, and transfer

Commands:

```bash
fnm exec --using=24.21.0 -- corepack pnpm exec vitest run \
  packages/session-query/session-query/tests/observation.spec.ts \
  packages/session-query/session-query/tests/session-query.spec.ts \
  packages/session-query/session-query-sqlite/tests/sqlite.spec.ts \
  packages/session-query/session-log-export/tests/archive.host.spec.ts

fnm exec --using=24.21.0 -- corepack pnpm exec vitest run \
  packages/session/session-persistence-jsonl/tests/jsonl.spec.ts
```

Observed summaries:

```text
Test Files  4 passed (4)
Tests       169 passed (169)

Test Files  1 passed (1)
Tests       175 passed (175)
```

### Confirmed capabilities

- Session Query reads a live Session when one exists and otherwise folds the persisted log without publishing an Agent.
- Cold observation can compute registered projections. Its bounded prepared-Session cache is keyed by persistence revision and reloads when the revision or persistence instance changes.
- The SQLite Session Query provider is a derived search index. Its reopen test proves unchanged revisions skip log reads and a changed backing store triggers reconciliation/reload.
- JSONL persistence has an explicit `flush()` barrier. Agent creation/resume owns a write handle; query/export paths use read handles.
- Session export flushes a live root before reading, then streams the root, descendants, and attachments as a browser ZIP. A cold persisted root needs no live flush.

### Non-capabilities

`@deepseek-ai/dsh-session-log-export` explicitly produces a browser download, not a Host filesystem path. More importantly, the pinned distribution has no inverse session-log import/restore service or command. The ZIP shape is therefore an export/interchange detail, not an upstream-supported restore transaction.

**Results:** cold query, flush, restart/rebuild, and outbound export are **PASS**. Import/round-trip restore is **FAIL — upstream limitation**.

Architecture consequences:

- DSH JSONL is canonical Session history; Session Query SQLite is not.
- BotHarness SQLite and DSH JSONL cannot share an atomic transaction. Store a repairable reference/status boundary rather than claiming cross-store atomicity.
- Before coordinated manual backup/export, stop or quiesce owned Agents and await DSH flush.
- The first simple BotHarness import/export contract should not promise to restore DSH Sessions from `/export` ZIPs. Adding that promise requires a separately versioned adapter, collision rules, attachment restoration, and restart tests.

## 4. Continuable subagent communication and settlement

Command:

```bash
fnm exec --using=24.21.0 -- corepack pnpm exec vitest run \
  packages/subagent/subagent/tests/continuation.spec.ts \
  packages/subagent/subagent/tests/list-children.spec.ts \
  packages/subagent/subagent/tests/run-settlement.spec.ts \
  packages/subagent/subagent/tests/service.spec.ts \
  packages/core/tools/tests/scoped.spec.ts
```

Observed summary:

```text
Test Files  5 passed (5)
Tests       282 passed (282)
```

The upstream service requires the **exact live sender Agent** and exact adjacency:

- Any live Agent may target its direct continuable child. A cold direct child may be resumed for the delivery.
- A continuable child may target its direct parent only while its continuable Activation is resident and the parent is live.
- A busy target receives a steer at the nearest step; an idle target starts a turn.
- There is no durable parent mailbox for child-to-parent delivery.
- `listChildren` and `listDescendants` read live plus persisted session state without loading children. Descendant enumeration is stable preorder and may traverse non-continuable nodes to find deeper continuable descendants.
- Runtime settlement sends the direct parent a user-role outcome notice with the child's closing assistant content, or an explicit “no closing message” result.

An independent Assignment Session has no resident continuable Activation and no direct-parent authorization. Giving it `meta.parentSession` does not change this. Calling `ctx.subagents.sendMessage(assignmentAgent, orchestratorId, ...)` therefore rejects as unauthorized rather than acting like a general Agent bus.

**Result:** native direct-parent continuable messaging, settlement, and enumeration are **PASS**. Reusing that service for Assignment-to-Orchestrator reporting is **FAIL — BotHarness adapter gap**.

The Assignment analogue should preserve the useful semantics without pretending Assignment is a DSH Subagent:

1. An Assignment-scoped `report_to_orchestrator` tool resolves the authoritative Assignment row.
2. It records the report as an immutable Source Event and lets the ordinary Inbox Trigger create an Orchestrator Inbox Admission.
3. The Orchestrator wake policy chooses `inject`, `steer`, or `followup` from its current status and event policy.
4. A final Assignment settlement is idempotent and distinct from intermediate reports.
5. Orchestrator-to-Assignment messaging resolves or resumes the Assignment Session through the Assignment Runtime, not `ctx.subagents`.

## 5. Tool restriction

The pinned scope contract supplies two layers:

- Registering a tool through an Agent's `agent.ctx` makes it local to that Agent scope and its descendants; siblings and unrelated roots do not see it.
- `ctx.tools.restrict({ allow, deny })` intersects inherited visibility. A denied tool disappears from the model schema and direct execution is rejected as unknown.

Native in-process subagent providers support a persisted `toolFilter` and apply it using the child's scoped restriction. External ACP/Codex/Claude-Code providers advertise `toolFilter: false`; they run in another process and do not inherit the Host Agent's scoped tool registry in the first place.

The inheritance direction matters. If Orchestrator Assignment-management tools are registered on `orchestratorAgent.ctx`, native subagents created below it inherit them unless the subagent request/config explicitly denies those names. Likewise, an Assignment-only report tool registered on `assignmentAgent.ctx` is invisible to the Orchestrator sibling/root, but the Assignment Agent's own native subagents inherit it unless denied.

**Result:** the restriction mechanism is **PASS**; automatic role gating is **FAIL — BotHarness adapter gap**.

Executable policy for implementation:

- Register `list_assignments`, `inspect_assignment`, `create_assignment`, `send_assignment_request`, and `stop_assignment` only on the Orchestrator Agent scope.
- Register `report_to_orchestrator` only during Assignment Agent `create`/`resume` setup.
- Apply a deny filter for all Assignment-management/report tools to every native subagent provider path beneath both roles.
- Test both `ctx.tools.schemas(agent)` absence and attempted execution rejection. Schema-only assertions are insufficient.
- Fail creation loudly if a configured deny name is unknown; do not silently weaken the boundary.

## Implementation acceptance derived from the spike

The following checks make the downstream implementation issues executable rather than interpretive.

### Session ownership and directory

- Create Assignment with omitted `parentAgent` and retain exactly one `AgentHandle` per live Assignment Session id.
- Use the DSH Session id as canonical Assignment identity. Persist explicit PersonaBot/root-role ownership plus Assignment purpose, Continuity Key, Workspace/dependency requirements, delivery-reconciliation facts, and latest semantic report in BotHarness SQLite.
- Derive activity/last-run state from DSH Session facts; do not create a competing BotHarness Assignment lifecycle state machine.
- Reject duplicate live activation for one Assignment Session.
- Bot stop/disposal cancels and drains its Orchestrator Agent, Assignment Agents, and native subagents before closing storage.
- Never derive business ownership from DSH `roots()`, `meta.parentSession`, or the presence of a live handle alone.

### Messaging and wake

- Idle/cold Assignment delivery is `resume(assignmentSessionId)` when needed, followed by `followup` for a distinct command.
- Orchestrator mid-turn updates use `steer` only when policy requests the nearest step; passive context uses `inject` and must not be expected to wake.
- Interrupting policy records the decision, calls `cancel(..., { keepInbox: true })`, and handles the already-claimed-work caveat.
- Concurrency admission fails the tool call with structured reason when the configured limit (default 3) is reached; it does not enqueue.
- Report and final-settlement writes are idempotent at the BotHarness boundary.

### Query, persistence, and backup

- `list_assignments` comes from the durable Assignment directory, with cursor/filter/sort, not from live `ctx.agents.roots()` alone.
- Cold status enrichment uses Session Query without resuming the Assignment Session.
- Coordinated manual backup quiesces owned Agents and awaits DSH persistence flush before copying any DSH-owned files.
- The UI/docs state plainly whether DSH Session history is excluded, copied as an opaque stopped-profile artifact, or unsupported; they must not label the browser export ZIP as restorable.
- Restart tests rebuild any derived session-query/projection state from canonical logs.

### Role-scoped tools

- Orchestrator cannot execute `report_to_orchestrator`.
- Assignment cannot execute Orchestrator Assignment-management tools.
- Native subagents under either role cannot see or execute either tool family by default.
- A restriction test covers both advertised schema and direct execution.

## Remaining UNVERIFIED scope

- Windows 11 reproduction or rejection of Discussion #6617.
- A real-provider successful completion in the isolated Web profile; the wake boundary itself was observed before the intentional missing-provider failure.
- Cross-process concurrent writers and profile copying while DSH remains running. Neither is required by the accepted single-host, coordinated-stop design and neither should be inferred from these results.

## Final classification

### Upstream limitations

- No session ZIP import/restore counterpart.
- No generic durable message bus from an independent root Agent to another root Agent.
- Continuable child-to-parent messages require a live parent and resident direct-child Activation; there is no durable parent mailbox.
- No direct delivery to a cold independent root without first resuming it.

### BotHarness adapter gaps

- Durable Assignment directory and handle registry.
- Assignment-to-Orchestrator report/final-settlement transport and Orchestrator-to-Assignment delivery.
- Status-aware wake-policy selection.
- Explicit role-scoped tool registration and descendant deny filters.
- Clear session-history policy for simple manual export/import.

### Design assumptions retained

- One Orchestrator Session can own multiple durable Assignment entries.
- Assignment Sessions are independent DSH runtime roots, not native continuable subagents.
- The Orchestrator controls Assignment lifetime and receives structured progress/settlement.
- No Assignment queue: reaching the configurable concurrency cap returns a structured tool error.
- DSH owns canonical Session logs; BotHarness owns its operational SQLite database and repairable references between the two domains.

No additional DSH pitfall was established strongly enough to amend `dsh-dev`: the only bootstrap failure came from deliberately skipping native install scripts, and the reported Web wake bug did not reproduce in the tested environment.
