---
name: dsh-plugin-dev
description: Design, build, or review DeepSeek Harness (DSH) and Cordis plugins. Use for Plugin/Fiber/Bundle/Profile/Patch composition; Service/Provider/Consumer capability seams; Registry/Registration/Agent Scope/Service Isolation; Cordis Events; SessionEvent/projections/persistence; execution worlds, jobs, storage; Typert/API Gateway; or Slots. Start with the canonical DSH/Cordis vocabulary and decision tree before reaching host, client, UI, or community implementation details.
license: MIT
metadata:
  skillVersion: "0.3.2"
  verifiedAgainst: "dsh 0.1.6-alpha.2"
  upstreamSha: "ddefc45fbc7f8e46dd73185e68295696d1297887"
  verifiedAt: "2026-09-20"
  sources: "pinned DSH upstream and docs/research authoring reports; dsh_research DSH/Cordis foundations"
---

# DSH plugin development

Skill v0.3.2 · verified against DSH `0.1.6-alpha.2` (upstream SHA `ddefc45fbc7f8e46dd73185e68295696d1297887`). DSH is in developer preview: verify a material mechanism against the pinned upstream and the running host.

## Foundation-first workflow

1. Read [`references/context.md`](references/context.md) completely. Name the objects and boundaries with its canonical DSH/Cordis vocabulary. This step is complete when every important platform noun maps to one defined term and application-defined concepts are not presented as native APIs.
2. Follow [`references/decision-tree.md`](references/decision-tree.md). Classify each requirement as durable fact, command/query, runtime notification/interception, registration, projection/presentation, persistence, or execution concern. This step is complete when each responsibility has one primary seam and explicit ownership/lifecycle.
3. Load only the implementation branch needed:
   - [`references/host.md`](references/host.md) — Bundle/Profile/Patch, Plugin/Fiber, Service, Tool, Event, Session, lifecycle, publish.
   - [`references/client.md`](references/client.md) — browser Cordis application, Typert/API Gateway, client models, build and verification.
   - [`references/slots.md`](references/slots.md) — only when adding or changing a UI contribution.
   - [`references/community-ui-patterns.md`](references/community-ui-patterns.md) — only when selecting a proven UI/build pattern or checking ecosystem drift.
4. Implement through the selected seams, then validate install → boot → registration → exercise → unload/restart as applicable. A compiling package is not an activated Plugin.

Deep source reports live under `docs/research/`; the DSH/Cordis portions of the three `dsh_research/` documents are inputs to the foundational references. A downstream product's own Context, architecture, and ADRs remain outside this skill and own its product vocabulary.

## Mental model

- **Plugin/Fiber ownership:** a Plugin is a lifecycle container; its Fiber owns Services, listeners, Registrations, effects, and child Plugins. Registrations leave with the Fiber.
- **Three composition levels:** Bundle/Profile/Patch selects and configures Plugins; the Plugin tree owns runtime lifecycle; Registries compose live contributions. Profile is runtime composition, not user identity or Session isolation.
- **Capability seam:** `Consumer → Service Definition → Provider`. A Tool is a model-facing Consumer, not a Service synonym.
- **Visibility vs resolution:** Agent Scope selects visible Registrations; Service Isolation selects which Service instance resolves in a context subtree. They are orthogonal.
- **Facts vs notification:** SessionEvent is durable, replayable truth. `session/event` is the process-local Cordis notification after commit. Other Cordis Events coordinate live work.
- **Derived state:** Projection folds history into a read model. Session Query is a derived search index. Conversation Assembly combines an event window and transient state into presentation nodes.
- **Two application halves:** a package may have a Host Cordis Plugin and a separate browser Cordis Plugin. Runtime values cross package boundaries through Services, Events, Typert, and Slots—not value imports.

## Fast seam check

| Goal | Mechanism | Side |
| --- | --- | --- |
| Add a tool | `defineTool` + `ctx.tools.register` | host |
| Gate/approve tool calls | `ctx.on('tools/pre-execute', …)` (waterfall) + `ctx.approval` / `ctx.tools.guard()` | host |
| Expose a capability to Consumers | Service Definition + Provider (`ctx.provide` or `Service`) | host |
| React to agent/session lifecycle | `ctx.on('session/event', …)`, `agent/pre-step`, `agent/status`, … | host |
| Inject context into the model | `agent.inject(...)`, `agent/pre-step`, `ctx.systemPrompt.section/context` | host |
| Persist session-derived state | `ctx.sessionProjections.register(...)` (driven by `session/event`) | host |
| Long/background work | `ctx.jobs.start({ kind, label, owner, run })` | host |
| Plugin config / secrets | `ctx.settings.installSection(...)`; `ctx.credentials.resolve(ref)` | host |
| UI panel, header action, settings card | client slots via `ctx.slots.inject(key, () => ctx.slots.register(...))` | client |
| UI needs host capability | Typert remote Service claimed by API Gateway | both |

## Host-side workflow

Read [`references/host.md`](references/host.md), then validate package contract → composed Profile → live Fiber → registered capability → exercised behavior → disposal/restart. `--dump-config` proves composition, not activation.

## Client-side workflow

Read [`references/client.md`](references/client.md) for the browser Cordis application, supported Typert/API Gateway boundary, client models, lazy-CJS build contract, and verification. Load [`references/slots.md`](references/slots.md) only when the requirement actually contributes UI.

### `/api` transport rule

`@deepseek-ai/dsh-api-gateway` owns the single `/api` interceptor and claims endpoints from the Typert Registry. A third-party Plugin must not register another `connection.rpc.intercept('/api', …)`: it shadows native APIs. Expose plugin endpoints through a `TypertRemoteService` with a `typertRemote` binding and remote-method markers.

## Top pitfalls

1. Patch `config` replacement is whole-object — restate every key you keep.
2. Optional services use `ctx.get('svc')` / `ctx.inject([...], cb)`; a hard `inject` on a missing provider parks the plugin in PENDING forever.
3. `turn/*`, `step/*`, `tool/call` are persisted **session event types**, not Cordis events — observe `session/event` and switch on `event.type`.
4. `tools/pre-execute` is a waterfall: call `next()` or you have short-circuited every downstream gate (including approvals).
5. `execute` must observe `exec.signal`, return exactly the declared `output.schema` JSON value, and throw only on infrastructure failure (registry maps to `isError`).
6. Client value-importing another plugin's package fails the purity gate — go through slots/services.
7. UI silently missing = parent slot not mounted, wrong keyed key, id collision shadowed, or the client bundle never rebuilt.
8. Client components cannot inject host Services — cross through Typert/API Gateway or consume client read models.
9. Unhandled promise rejections outside `apply` are fatal to boot; wrap async work in `ctx.effect`.
10. npm package name ≠ plugin identity — row `name`, bundle ids, and client wire ids are separate things; keep them stable.

## References

- `references/context.md` — canonical DSH/Cordis vocabulary and native-vs-application-defined boundary.
- `references/decision-tree.md` — requirement-to-seam decisions, including Cordis dispatch and persistence choices.
- `references/host.md` — host API surface: plugin shapes, tools DSL, events/waterfall, settings, credentials, system prompt, sessions/agents, lifecycle, publish/validate.
- `references/client.md` — `dsh.client` fields, client services/hooks, Typert/API Gateway, build contract, failure table, verification checklist.
- `references/slots.md` — full slot catalog with kinds/scopes and source declarations.
- `references/community-ui-patterns.md` — field notes from 13 community plugins: build routes, data channels, slot/RPC conventions, proven practices, drift hazards, anti-patterns.
