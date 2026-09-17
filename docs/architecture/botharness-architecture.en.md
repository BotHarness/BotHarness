# BotHarness Architecture & Data Flow

<!-- Maintained source, not generated: this is the English translation of `docs/architecture/botharness-architecture.md`. Edit this file (and its `diagrams/en/*.mmd` sources), not `apps/docs`. -->

BotHarness is a plugin layer on top of DSH (DeepSeek Harness) that gives agents a persistent identity: **PersonaBot** — a persona with memory that spans sessions and can work concurrently. DeepSeekBot is its first app (sidebar roster + delegation + IM integration). The DSH core is not forked; IM channels come from the dsh-im base.

Status: M1 implemented (PR #13) · M2 memory MVP implemented · M3 roster & delegation · M5 IM adapter · M6 SoulSnapshot · M7 Soul registry (ADR-0019/0020) · updated 2026-09-18

## 1 · System context

```mermaid
flowchart LR
  User["User (DSH Web / people in a Feishu group)"]
  Feishu["Feishu / Lark Open Platform"]

  subgraph Host["DSH Host · single process"]
    IM["dsh-im base<br/>channels · conversation routing · streaming cards · settings page"]
    Core["@botharness/core<br/>registry · state · IM binding resolution"]
    Client["@botharness/client<br/>roster · detail · @delegation (M3)"]
    Agent["DSH Agent<br/>one executor per Session"]
  end

  User -->|"@ / delegate"| Client
  User -->|"group message"| Feishu
  Feishu <-->|"long connection (outbound)"| IM
  IM --> Agent
  Client --> Agent
  Core -.->|"provide('botharness')"| Client
  Core -.->|"read-only config.json / workspaces.json"| IM
  Agent -.->|"state events (wired in M3)"| Core

  classDef ours fill:#ecfdf5,stroke:#16a34a,color:#14532d;
  classDef dsh fill:#f5f3ff,stroke:#7c3aed,color:#4c1d95;
  classDef later fill:#f1f5f9,stroke:#94a3b8,color:#475569,stroke-dasharray:4 3;
  class Core ours;
  class IM dsh;
  class Client later;
```

Two entry points (DSH Web roster/delegation, Feishu group IM), one PersonaBot brain.

## 2 · Modules & packages

```mermaid
flowchart TB
  subgraph pkgs["monorepo packages"]
    Bundle["deepseekbot<br/>bundle + app (M5)"]
    CorePkg["@botharness/core<br/>host domain services (M1 done)"]
    ClientPkg["@botharness/client<br/>React client (M3)"]
    ImPkg["@botharness/im<br/>IM adapter (M5)"]
  end

  Bundle --> CorePkg
  Bundle --> ClientPkg
  Bundle --> ImPkg

  subgraph core["packages/core/src"]
    Plugin["plugin.ts<br/>apply / settings / provide"]
    Registry["bots/registry.ts<br/>CRUD · atomic writes · memory dir · findByWorkspace"]
    Slug["bots/slug.ts"]
    Record["bots/persona-bot.ts"]
    State["state/bot-state.ts<br/>five states → aggregate · events"]
    Store["im/config-store.ts<br/>read-only dsh-im JSON"]
    Identity["im/identity.ts<br/>workspace → BotIdentity"]
    MemoryService["memory/service.ts<br/>cwd → PersonaBot"]
    MemoryTools["memory/tools.ts<br/>memory_read/search/write/list"]
    MemoryStore["memory/store.ts<br/>read/write · generated index · one commit per write"]
    MemoryTree["memory/tree.ts<br/>directory tree · fold / overflow marker"]
    MemorySearch["memory/search.ts<br/>rg search"]
    MemoryGit["memory/git.ts<br/>one repo per bot"]
    FrontMatter["memory/front-matter.ts<br/>summary / degradation"]
  end

  Plugin --> Registry
  Plugin --> State
  Plugin --> Store
  Plugin --> MemoryService
  Plugin --> MemoryTools
  Registry --> Slug
  Registry --> Record
  Store --> Identity
  MemoryService --> MemoryStore
  MemoryTools --> MemoryStore
  MemoryStore --> MemoryTree
  MemoryStore --> MemorySearch
  MemoryStore --> MemoryGit
  MemoryStore --> FrontMatter
  MemoryTree --> FrontMatter
  ImPkg -.->|"write binding (M5)"| Registry

  classDef ours fill:#ecfdf5,stroke:#16a34a,color:#14532d;
  classDef later fill:#f1f5f9,stroke:#94a3b8,color:#475569,stroke-dasharray:4 3;
  class CorePkg,Plugin,Registry,Slug,Record,State,Store,Identity,MemoryService,MemoryTools,MemoryStore,MemoryTree,MemorySearch,MemoryGit,FrontMatter ours;
  class Bundle,ClientPkg,ImPkg later;
```

| Module                   | Responsibility                                                                                                   | Status            |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------- | ----------------- |
| `plugin.ts`              | Plugin entry: settings namespace + `provide('botharness')`; assembled by `createCore()`                          | M1 ✅             |
| `bots/registry.ts`       | PersonaBot lifecycle + atomic persistence; `remove` keeps memory by default, only `purge` clears it              | M1 ✅             |
| `state/bot-state.ts`     | Five session states reported → PersonaBot aggregation; `aggregate-changed / session-changed / session-removed`   | M1 ✅             |
| `im/*`                   | Read-only dsh-im store (v1/v2/v3 compatible) + workspace→BotIdentity (IM binding helper)                         | M1 ✅ (M5 wiring) |
| `memory/front-matter.ts` | Front-matter parse/serialize + graceful degradation (first line + mtime; invalid YAML never throws)              | M2 ✅             |
| `memory/store.ts`        | Memory read/write: path jail, atomic writes, serial queue, `MEMORY.md` index, one commit per write               | M2 ✅             |
| `memory/tree.ts`         | Directory tree: front-matter summary + `updated_at`; ≤1000 paths, oversized dirs folded to counts                | M2 ✅             |
| `memory/search.ts`       | Case-insensitive search (`rg` when available, pure-Node fallback); skips front-matter, returns path/line/excerpt | M2 ✅             |
| `memory/tools.ts`        | DSH tools `memory_read / memory_search / memory_write / memory_list` (write requires summary)                    | M2 ✅             |
| `memory/service.ts`      | `agent.session.header.cwd → PersonaBot` mapping; one store per memory dir (serial across Sessions)               | M2 ✅             |
| `memory/git.ts`          | One repo per bot: single `main` branch, `.gitattributes` forcing LF, local identity, `history()`                 | M2 ✅             |
| roster client            | `main` panel + `sidebar.panellist`; roster tree / detail / create; @delegation                                   | M3                |

## 3 · Boot & service exposure

```mermaid
sequenceDiagram
  participant D as DSH / Cordis
  participant P as @botharness/core · plugin.ts
  participant M as memory/service.ts
  participant T as memory/tools.ts
  participant O as other plugins (client / im / third-party)

  D->>P: apply(ctx)
  P->>D: settings.register('botharness')
  P->>M: createMemoryService({ registry })
  P->>D: provide('botharness', { rootDir, registry, states, memory })
  P->>T: createMemoryTools({ resolveStore })
  T-->>P: memory_* tools
  P->>D: tools.register(memory_read / memory_search / memory_write / memory_list)
  P->>D: systemPrompt.section(persona · memory-tree)
  O->>D: inject(['botharness'])
  D-->>O: ctx.botharness
  Note over O: read registry (list/get/findByWorkspace)<br/>subscribe states.on(...) for live state<br/>resolve this Session's memory via memory.storeForAgent
```

Everything goes through the Cordis service bus — no file polling.

## 4 · Creating a PersonaBot (data flow)

```mermaid
flowchart TD
  A["registry.create({ slug, displayName, … })"] --> B{"valid slug?<br/>kebab-case ≤64"}
  B -- no --> E1["reason: invalid-slug"]
  B -- yes --> C{"existing valid bot.json?"}
  C -- yes --> E2["reason: duplicate"]
  C -- no --> D{"memoryDir is absolute?"}
  D -- no --> E3["reason: invalid-memory-dir"]
  D -- yes --> F["assemble record<br/>slug/displayName/avatar/model/preset/workspaces/createdAt"]
  F --> G["atomic write: bot.json.tmp-<uuid> → rename"]
  G --> H["mkdir memory/ (default or custom)"]
  H --> I["return ok: record"]
  G -.->|"rebuild if corrupt: keep existing memory/"| H
```

Validate → duplicate check (against valid records, not stuck on tombstone directories) → atomic write → memory directory.

## 5 · IM binding resolution (helper today, wired in M5)

```mermaid
sequenceDiagram
  participant S as DSH Session (cwd = workspace)
  participant R as im/config-store.ts
  participant F as dsh-im disk (read-only)
  participant I as im/identity.ts
  participant G as registry (M5)

  S->>R: read()
  R->>F: integrations/dsh-feishu/config.json + workspaces.json
  F-->>R: bots[] · workspaces/aliases/conversationWorkspaces
  S->>I: resolveBotIdentity(workspace, conversationKey?)
  I-->>S: ok / ambiguous / not-found → BotIdentity{ id, displayName }
  S->>G: write binding: BotIdentity → registry slug (M5)
  Note over R,F: base upgrades need re-verification — never fork or patch
```

## 6 · State machine & events

```mermaid
stateDiagram-v2
  [*] --> idle
  idle --> thinking: delegate / wake
  thinking --> working: start execution
  working --> waiting: needs approval / waiting on someone
  waiting --> working: resume after confirmation
  working --> blocked: failure / missing precondition
  blocked --> working: retry after fix
  thinking --> blocked: stuck
  working --> done: finished (session event)
  done --> idle: aggregate back to idle
```

| Event               | Trigger                                            | Consumer               |
| ------------------- | -------------------------------------------------- | ---------------------- |
| `aggregate-changed` | aggregate state changed                            | roster / avatars (M3+) |
| `session-changed`   | any session state change (even if aggregate holds) | session detail         |
| `session-removed`   | session ended / cleaned up                         | tree refresh           |

## 7 · On-disk data

Ours (written by the registry):

```text
$DSH_HOME/botharness/bots/<slug>/
├── bot.json   # machine metadata (atomic write)
└── memory/    # default memory dir; absolute path configurable
               # M2: PERSONA.md / MEMORY.md / topic files
```

dsh-im's (read-only):

```text
$DSH_HOME/integrations/dsh-feishu/
├── config.json      # bots[]
├── workspaces.json  # v3: workspaces/aliases/overrides
└── bots/<botId>/state.json  # conversation binding (M5)
```

## 8 · Communication & boundaries

| Channel                            | Direction                    | Notes                                                                                         |
| ---------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------- |
| Cordis service `provide/inject`    | core → client/im/third-party | the `botharness` service; no global singleton                                                 |
| Tracker subscription `states.on()` | core → client                | in-process events, not polling                                                                |
| DSH event bus `ctx.on`             | DSH/dsh-im → core            | M3 subscribes to `agent/*` to drive state                                                     |
| Feishu / Lark                      | dsh-im ↔ open platform       | outbound long connection; no public ingress (webhook exception, see [PRD](/dev/spec/app-prd)) |
| dsh-im disk                        | read-only                    | only through the single `im/` module; no fork / no patch                                      |
| Secrets                            | —                            | only in the DSH credentials service; zero plaintext in the repo                               |

## 9 · How to maintain

- This is a **living** architecture document: when modules, data flows, or boundaries change structurally, update this file (mermaid sources are inlined).
- This page is synced to the docs site (`apps/docs`) by `scripts/sync-docs.mjs`; site address `https://botharness.ai/dev/architecture`.
- Companions: platform spec [docs/botharness.md](/dev/spec/platform) · app PRD [PRD.md](/dev/spec/app-prd) · glossary [CONTEXT.md](/dev/spec/context) · decisions [docs/adr/](/dev/adr/0015-botharness-is-a-dsh-plugin-layer).
