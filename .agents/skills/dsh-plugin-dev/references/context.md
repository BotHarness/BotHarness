# DSH/Cordis canonical context

Use these leading words in plans, PRDs, ADRs, code, and review. A term names one boundary; do not substitute a nearby word because it sounds familiar.

## Provenance labels

- **DSH-native** — exists in the pinned DeepSeek Harness source/API.
- **Cordis-native** — exists in the Cordis framework used by DSH.
- **application-defined** — a downstream product or Plugin concept that does not exist in the pinned DSH/Cordis contract.
- **durable** — recoverable from persisted records after process exit.
- **live/process-local** — exists only in the current runtime.

When writing a design, label application-defined APIs explicitly. A downstream `ctx.<name>` without that label otherwise reads like an upstream guarantee.

## Runtime composition

### Plugin and Fiber

- **Plugin** — runtime feature module and lifecycle container. It may provide Services, listen to Events, add Registrations, create child Plugins, or provide no Service at all.
- **Fiber** — one live Plugin instance and its lifecycle ownership. Its effects and Registrations are revoked on disposal.

```text
Plugin != ctx.<service>
Plugin = lifecycle + services + listeners + registrations + effects + children
```

### Bundle, Profile, Patch

- **Bundle** — what a package contributes through its `dsh.bundle` manifest and configuration layer.
- **Profile** — the ordered runtime composition a user starts.
- **Patch** — a later configuration overlay that inserts or overrides Loader rows.

```text
Bundle = published contribution
Profile = launched composition
Patch = overlay
```

Profile is not a browser profile, user identity, cookie jar, or Session isolation boundary. Later Patch layers replace a row's whole `config` object.

### Three composition levels

```text
Profile / Bundles    -> which feature packages start
Plugin tree / Fibers -> who owns runtime lifecycle
Registries           -> which contributions are live now
```

Agent Scope acts principally on Registrations, not on Profile composition.

## Capability seam

### Service Definition, Provider, Consumer

- **Service Definition** — stable command/query contract: methods, inputs, outputs, error and cancellation semantics.
- **Provider** — concrete implementation of a Service Definition, such as local, remote, or container Shell.
- **Consumer** — caller of a Service: Tool, Event listener, route/UI adapter, Scheduler/Job, or another Service.
- **Capability seam** — `Consumer -> Service Definition -> Provider`.

**Service** means the stable capability API available through `ctx.<name>`, not the Plugin that happens to provide it.

```text
Tool != Service
Tool = model-facing Consumer
```

Changing where a capability executes means replacing its Provider while preserving the Definition and Consumers.

## Registry, Registration, and scope

- **Registry** — pattern: live entries plus lookup, precedence, ownership, and lifecycle. Tool, Skill Provider, System Prompt Section, UI Slot, and Workspace registries are examples.
- **Registration** — one Plugin's runtime contribution to a Registry.
- **Agent Scope** — visibility rule for scope-aware Registries: which Registrations an Agent can see.
- **Service Isolation (Realm)** — dependency-resolution boundary: which same-named Service instance a context subtree resolves.

`Registry` is the general pattern. `ctx.registry` specifically means the Cordis Plugin Registry.

```text
Agent Scope       = which registrations this Agent sees
Service Isolation = which Service instance this context resolves
```

The two axes are orthogonal. Only a subsystem that implements scoped resolution honors Agent Scope.

## Cordis Event

A **Cordis Event** is process-local notification, interception, or lifecycle coordination. A Service call does not automatically become an Event.

| Dispatch mode | Contract | Typical use |
| --- | --- | --- |
| `emit` | synchronous broadcast; does not await returned Promises | fire-and-forget status notification |
| `parallel` | run listeners concurrently; await settlement | independent preparation that must finish |
| `serial` | await listeners in order; may bail | ordered processing |
| `bail` | dispatcher tries listeners until one claims | handler/Provider selection |
| `waterfall` | listener calls `next()` to continue and may wrap/veto | policy, approval, rewrite |

In **bail**, the dispatcher advances. In **waterfall**, the current listener advances by calling `next()`.

## Sessions: facts and derived views

- **Agent** — live DSH executor attached to one Session; it is a runtime object, not a durable product identity.
- **AgentHandle** — lifecycle capability returned by Agent create/resume; its owner can stop, drain, and dispose that live Agent.
- **Subagent** — delegated child Agent and child Session created through the DSH Subagent capability inside a parent Agent's work.
- **Agent Inbox** — live delivery queue that controls when selected input reaches an Agent Turn or Step boundary.
- **SessionEvent** — typed, append-only, durable fact in a DSH Session. The Session log is the canonical Agent-execution history.
- **`session/event`** — live Cordis Event emitted after a SessionEvent commits.
- **Projection** — rebuildable fold from SessionEvent history to a current read model.
- **Session Persistence** — Provider for canonical durable Session logs, such as JSONL.
- **Session Query** — derived search index over Session history, such as SQLite FTS.
- **Conversation Assembly** — combines a durable event window and transient live chunks into target-neutral presentation nodes for Chat/Trajectory renderers.

```text
SessionEvent[] + reducer -> Projection
event window + transient -> Conversation Assembly
```

SessionEvent is not a per-frame UI bus. Projection and Session Query are not additional truths.

## Execution and storage

- **Execution World** — where a program runs: local OS, container, remote host, microVM, or cloud sandbox.
- **Sandbox** — `ctx.sandbox` currently confines filesystem effects of a same-world subprocess. A different Execution World is a sibling Provider, not a Sandbox mode.
- **Shell** — command-oriented Service such as `ctx.shell`.
- **Subprocess** — argv/process primitive such as `ctx.subprocess`; it is not a shell command string.
- **Job** — long-running work with identity and status/collect/stop lifecycle.
- **Terminal/PTY** — interactive process with a controlling terminal.
- **Schedule** — future delivery time; it is not a running Job.
- **Spill** — external storage for oversized Tool Results, leaving a preview/locator in model context.
- **Storage Domain** — typed non-Session product data, routeable to JSON/SQLite. It is not a general ORM or Session Persistence.

```text
bash Tool -> Shell Service -> Shell Provider -> Subprocess Service -> Provider -> OS
```

## Host/client boundary

- **Slots** — browser UI composition seam. `single`, `list`, `keyed`, and `chain` encode conflict/coexistence behavior.
- **Typert** — typed remote Service protocol and registry used for Host/client calls.
- **API Gateway** — sole owner of the `/api` interceptor; it claims Typert endpoints.

The browser is a separate Cordis application. A client Plugin cannot inject Host Services. Expose remote methods through a `TypertRemoteService` claimed by the API Gateway; another `connection.rpc.intercept('/api', …)` would shadow native APIs.

## One-line model

> Plugin is the lifecycle container; Service is the capability entrance; Provider is its implementation; Consumer uses it; Cordis Event coordinates live reactions; Registry composes runtime entries; Registration is one entry; SessionEvent is durable truth; Projection is a rebuildable read model; Bundle/Profile/Patch determine which Plugins load.
