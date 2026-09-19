# DSH seam decision tree

Read [`context.md`](context.md) first. For every requirement, walk this tree and record one primary seam, its owner, and its durability. Mixed requirements may need several seams connected in order; that does not make the seams interchangeable.

## 1. Choose the primary abstraction

1. Must this fact survive process exit and replay as part of Agent execution?
   - Yes: append a **SessionEvent**.
   - If it is BotHarness operational data outside Agent execution—Source Events, Inbox Admissions, ownership, grants—use the owning deep module over the profile's **BotHarness operational database** instead.
2. Is a caller asking for a concrete operation/result with errors or cancellation?
   - Yes: define a **Service Definition**, select a **Provider**, and call it from a **Consumer**.
3. Is this a process-local notification or interception point?
   - Yes: use a **Cordis Event** and select its dispatch mode below.
4. Is a Plugin contributing one of several runtime choices?
   - Yes: add a **Registration** to the appropriate **Registry**.
5. Is the requirement asking for current state derived from history?
   - Yes: build a **Projection**. For search, build a **Session Query** index. For Chat/Trajectory rendering, use **Conversation Assembly**.
6. Is it about where/how a program runs?
   - Use the execution branch below.

Quick language test:

| Sentence shape | Primary seam |
| --- | --- |
| “Do this and return the result” | Service |
| “This happened; interested parties may react” | Cordis Event |
| “These implementations/contributions are currently available” | Registry + Registration |
| “This happened and replay/audit must retain it” | SessionEvent |
| “Given history, what is true now?” | Projection |

## 2. Select Cordis Event dispatch

1. Fire-and-forget, with no need to await listeners? → `emit`.
2. All independent listeners must finish? → `parallel`.
3. Ordered listeners, with dispatcher-controlled progression? → `serial`.
4. First capable handler/Provider claims the request? → `bail`.
5. Policy or middleware may modify, wrap, approve, or veto? → `waterfall`; continuing requires `next()`.

Use a Service when completion of one named capability matters. Use an Event when reactions are extensible and not owned by the caller.

## 3. Durable fact, live signal, or presentation

```text
must replay/audit -> SessionEvent
just committed -> session/event Cordis notification
transient runtime signal -> another Cordis Event
current domain state -> Projection
search history -> Session Query
Chat/Trajectory nodes -> Conversation Assembly
```

Record the model-visible representation in Session history. Do not copy an entire theoretically accessible Channel into a Session.

## 4. Registry visibility or Service resolution

- Different Agents see different Tools/Skills/Prompt sections → **Agent Scope** on a scope-aware Registry.
- Same Service name resolves to different implementations/configuration in subtrees → **Service Isolation**.
- Both may apply; document them as separate axes.

## 5. Execution branch

1. Change local vs container vs remote vs microVM? → replace the capability **Provider** for the target **Execution World**.
2. Restrict filesystem effects of a same-world child process? → `ctx.sandbox`.
3. Need command semantics? → **Shell**. Need argv/process primitive? → **Subprocess**.
4. Start long work now and later inspect/stop/collect? → **Job**.
5. Need interactive input or a controlling terminal? → **Terminal/PTY**.
6. Deliver work at a future time? → **Schedule**.
7. Tool output is too large for model context? → **Spill**, with a useful preview and locator.

## 6. Product data branch

- Agent execution facts → SessionEvent through Session Persistence.
- DSH-owned small typed records → Storage Domain when that subsystem's contract fits.
- BotHarness operational records → their deep module over the single profile-scoped `botharness.db` transactional owner.
- Source Event is the sole local content/provenance fact; Channel placement and Inbox Admission may independently reference it.
- Bot Inbox is a view over Inbox Admissions and Attention Decisions, not a content mailbox or queue.
- Search/index/projection → derived data that can rebuild from its canonical source.

When one command changes several product records atomically, keep them in the same transactional owner. Emit process-local notifications only after commit.

## 7. Host/client/UI branch

1. Need Host capability from browser? → expose a Typert remote Service claimed by API Gateway.
2. Need streaming? → use a supported Typert stream or an exact authenticated fetch/SSE route; verify the pinned host contract.
3. Need several Plugins to contribute UI at one declared point? → **Slots**.
4. Select Slot cardinality:
   - `single`: one winning contribution.
   - `list`: coexist in order.
   - `keyed`: select by owner-provided key.
   - `chain`: first applicable renderer/handler by precedence.

The API Gateway owns `/api`. Registering another `connection.rpc.intercept('/api', …)` is not an extension path.

## 8. Bot/IM branch

Read [`bot-runtime-architecture.md`](bot-runtime-architecture.md) before choosing APIs.

1. Is this Human/PersonaBot social communication? → Channel + Messaging capability seam (**BotHarness-proposed**).
2. Did something arrive from a Channel, Bridge, webhook, Session, or system source? → immutable Source Event.
3. Is it eligible for one PersonaBot's attention? → Inbox Trigger creates an Inbox Admission; Bot Inbox presents the resulting view without copying content.
4. Must deterministic policy decide whether/when an Orchestrator runs? → Wake Policy outside the Orchestrator, then Delivery Policy selects a safe DSH boundary.
5. Is it PersonaBot-wide social/routing/control work? → Orchestrator Session.
6. Is it an independent task/project/workspace context? → Work Session, an independent root DSH Session.
7. Is it delegated work inside one Work Session? → DSH-native Subagent Session.

```text
peer PersonaBot communication -> product IM
Orchestrator <-> Work -> BotWork Runtime, Work Request/Report/Lifecycle Notice
Work main Agent <-> child -> DSH subagent APIs
```

## 9. Wake timing

After Wake Policy and Delivery Policy select delivery, Bot Runtime maps the admitted Source Event to DSH-native Orchestrator behavior based on current runtime state:

- idle/cold and should run now → resume as needed, then `followup`.
- running, but the admitted Source Event belongs to the next Turn → queue next-turn delivery.
- running and the next Step should see it → `steer` at the supported boundary.
- context should be durable/model-visible without waking → `inject`.

BotWork separately maps an addressed Work Request's `context-update`, `next-step`, or `next-turn` mode to `inject`, `steer`, or `followup` after rechecking ownership, liveness, and concurrency.

Do not assume every provider can interrupt an arbitrary in-flight Tool or external operation. Define interruption/cancellation separately from “deliver before the next Step.”

## 10. Completion checklist

Before implementation, every responsibility must answer:

- canonical term and DSH-native/BotHarness-proposed label;
- durable source of truth, if any;
- owning Plugin/Fiber and cleanup behavior;
- Service Definition and Provider, if it is a capability;
- Registry/Registration and Agent Scope, if visibility varies;
- Event dispatch mode, if it is live coordination;
- Execution World and cancellation, if it runs code;
- Host/client boundary and authorization, if it crosses `/api`;
- Projection/index rebuild path, if it is derived.
