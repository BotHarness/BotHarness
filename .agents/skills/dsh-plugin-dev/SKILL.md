---
name: dsh-plugin-dev
description: Build full-stack DeepSeek Harness (DSH) plugins — host-side bundle plugins (tools, services, events, settings, credentials) and client-side web UI (slots, lazy-CJS bundles, client↔host RPC). Use when creating or modifying a DSH plugin package (dsh.bundle / dsh.client, cordis.patch.yml), registering tools or UI slots, wiring client RPC, packaging/installing a plugin into a DSH profile, or debugging a plugin that installs/compiles but does not activate or show up.
license: MIT
metadata:
  skillVersion: "0.2.0"
  verifiedAgainst: "dsh 0.1.6-alpha.2"
  upstreamSha: "ddefc45fbc7f8e46dd73185e68295696d1297887"
  verifiedAt: "2026-09-19"
  sources: "docs/research/2026-09-19-dsh-plugin-authoring-host.md, docs/research/2026-09-19-dsh-plugin-authoring-client.md, docs/research/2026-09-19-dsh-client-ui-common-patterns.md, docs/research/2026-09-19-dsh-client-ui-flagship-dives.md, docs/research/2026-09-19-dsh-market-deep-dive.md, docs/research/2026-09-19-dsh-client-build-templates.md"
---

# DSH Plugin Development (full-stack)

Skill v0.2.0 · verified against DSH `0.1.6-alpha.2` (upstream SHA `ddefc45fbc7f8e46dd73185e68295696d1297887`, 2026-09-17; verified 2026-09-19). MIT licensed. Developer preview — breaking changes are expected, and upstream fixes can invalidate specific claims; when a fact matters, verify against the pinned upstream rather than npm registry packages (published `dsh-client-*` are `0.0.1-rc.1`, far behind the host).

Deep dives (repo root):
- `docs/research/2026-09-19-dsh-plugin-authoring-host.md` — host-side facts with `file:line` citations.
- `docs/research/2026-09-19-dsh-plugin-authoring-client.md` — client-side facts with `file:line` citations.
- `docs/research/2026-09-18-dsh-plugin-installation.md` — `dsh plugin` CLI, profile layout, layer stack.
- `docs/research/2026-09-19-dsh-community-plugins-survey.md` — community exemplars (what to borrow).
- `docs/research/2026-09-19-dsh-client-ui-common-patterns.md` + `…-flagship-dives.md` + `…-dsh-market-deep-dive.md` — how community plugins actually build UI.
- `docs/research/2026-09-19-dsh-client-build-templates.md` — the three client-build templates compared (use when setting up a build).

## Mental model

1. **One package, up to two halves.** Host half: a Cordis plugin (`export function apply(ctx, config)`) mounted as a Loader entry. Client half: declared by `dsh.client`, built into a prebuilt lazy-CJS bundle the host serves at `/plugins/...` and the browser renders into declarative slots.
2. **Every registration is an effect.** `ctx.on`, `ctx.tools.register`, `ctx.provide`, `ctx.slots.register`, `ctx.effect` all auto-dispose with the fiber. Never rely on module-level side effects.
3. **Installed ≠ registered.** Host rows activate only when a patch (`cordis.patch.yml`) inserts them by package name; the client half is only scanned if its package is a *live* Loader entry. "It compiles" means nothing.
4. **Talk through seams, not imports.** Plugins exchange runtime values only via `ctx.<service>`; cross-package imports are `import type` + `declare module` for types. No `@deepseek-ai/*` runtime value imports between plugins (build purity gate enforces this on the client half).

## Pick the extension point

| Goal | Mechanism | Side |
| --- | --- | --- |
| Add a tool | `defineTool` + `ctx.tools.register` | host |
| Gate/approve tool calls | `ctx.on('tools/pre-execute', …)` (waterfall) + `ctx.approval` / `ctx.tools.guard()` | host |
| Expose a capability to other plugins | `ctx.provide(name, value)` or `class X extends Service` + `declare module` | host |
| React to agent/session lifecycle | `ctx.on('session/event', …)`, `agent/pre-step`, `agent/status`, … | host |
| Inject context into the model | `agent.inject(...)`, `agent/pre-step`, `ctx.systemPrompt.section/context` | host |
| Persist session-derived state | `ctx.sessionProjections.register(...)` (driven by `session/event`) | host |
| Long/background work | `ctx.jobs.start({ kind, label, owner, run })` | host |
| Plugin config / secrets | `ctx.settings.installSection(...)`; `ctx.credentials.resolve(ref)` | host |
| UI panel, header action, settings card | client slots via `ctx.slots.inject(key, () => ctx.slots.register(...))` | client |
| UI needs host data | `ctx.connection.rpc.call(...)` ↔ `ctx.connection.rpc.handle/intercept(...)` | both |

## Host-side workflow

1. **Package contract** — `type: "module"`, built `main`/`exports`, and:
   ```json
   {
     "files": ["lib/index.js", "cordis.patch.yml"],
     "engines": { "dsh": ">=0.1.5-rc.1 <0.1.6" },
     "dsh": { "manifestVersion": 1, "bundle": { "patch": "./cordis.patch.yml" } }
   }
   ```
   `engines.dsh`/`manifestVersion` are declarative only (never enforced). `files` must include the patch file. Official deps invariant: `@deepseek-ai/cordis` in both `peerDependencies` and `devDependencies` (mirrored), `@deepseek-ai/schemastery` in `dependencies`.
2. **`cordis.patch.yml`** — top-level YAML array. Insert your row by package name, anchor it with a stable `id`:
   ```yaml
   - insert:
       - id: botharness-core
         name: '@botharness/core'
         config: { enabled: true }
   ```
   Layers apply in order: bundle list → profile patch → home patch → `--patch` overlays. A later layer **replaces the whole `config` object** (no deep merge). Use `[]` to disable a layer; an empty file fails startup.
3. **Plugin module** — `name` (diagnostics), `inject` (required services only), `Config` (Schemastery/Standard Schema, gains defaults at load), `apply(ctx, config)`. See `references/host.md` for tools/services/events code.
4. **Validate before installing** — `dsh --profile <p> --dump-config` (composed rows + sources; no app start). Then `dsh plugin --profile <p> add <pkg|tarball|git>`; bundle changes require a process restart, patch-file edits hot-reload only where HMR is enabled.
5. **Smoke-test the real host lifecycle** — install → boot → register → exercise → uninstall → reboot. `dsh-testkit` (community, unaudited) automates this shape; BotHarness M3.5 gate uses the same checkpoints.

Golden samples in the pinned upstream (read-only reference): `packages/context/time-context` (tiny host plugin covering projections + `agent/pre-step` + `ctx.effect`), `packages/feedback/message-feedback` (Service subclass + event declaration merge), `packages/context/agent-instructions` (optional services, durable injection), `packages/bundle/{base,web-app}` (composition layers).

## Client-side workflow

1. **Manifest** — `exports["./client"]` → built `lib/client.js`; `dsh.client: { platform: "web", inject?: [...], external?: [...] }`. `inject` here is a code-arrival edge (pre-delivers injected packages' factories), not an activation edge; activation is still Cordis service `inject`.
2. **Browser half** — `src/client/index.ts`: `export const inject = ['slots', ...]`; `export function apply(ctx)`; register UI through `ctx.slots.inject(key, () => ctx.slots.register({ name, id/key, order, label }, Component))`. Components are pure props (the five shares) and never see `ctx`; data comes from standard hooks (`useSessions`, `useSession`, `useStore`, …). No module-level side effects; every registration needs a stable `id`/`key` and `order`.
3. **Host half stays required** — an empty `src/index.ts` (`export function apply() {}`) so the package is a Loader entry and its `dsh.client` gets scanned. Two-half-same-package is the official shape (`exports: { ".": …, "./client": … }`).
4. **Build contract you must replicate outside the upstream monorepo** — there is **no published client build preset**. Target: CJS, `platform: browser`, entry `lib/client.js`, each output wrapped in a self-registration banner `window.__ModuleLoader__.load({ id, factory: (require) => … })`, baseline externals (`react`, `react/jsx-runtime`, `react-dom`, `react-dom/client`, `@deepseek-ai/cordis`, `@deepseek-ai/dsh-client-store`, `@deepseek-ai/dsh-client-ui-slots`, `@deepseek-ai/dsh-client-ui-primitives`, `@deepseek-ai/dsh-client-ui-dockkit`), everything else inlined, CSS Modules injected as `<style data-plugin>`, sourcemaps, and entry mtime touched after chunks (HMR revision). Details in `references/client.md`; pick a proven template in `references/community-ui-patterns.md` §1/§6.
5. **Host communication** — generic RPC is the supported third-party route: client `ctx.connection.rpc.call(channel, endpoint, payload, signal)`; host `ctx.connection.rpc.handle('/my-plugin', handler)` or `intercept('/api', …)`. Envelope: `{ ok: true, value } | { ok: false, error: { code, message, details } }` — never rejects. Streaming: register an exact `ctx.connection.fetch.register` route and use fetch/SSE. Avoid Typert `@Remote` outside the upstream monorepo (generator depends on in-repo tsconfig faces; unverified).
6. **Debug loop** — rebuild `lib/client.js` on change (`tsdown --watch`); the browser half hot-replaces via HMR polling or a page refresh. Failure signatures (bundle not found, not self-registering, undeclared slot, silent missing UI) are tabulated in `references/client.md`; verify with `window.__DSH_BOOT__.entries`, Network `/plugins/<pkg>/client.js`, and `Settings → Plugins → Plugin list`.

Slot catalog (full tables in `references/slots.md`):

| Need | Slot | Kind/scope |
| --- | --- | --- |
| Roster/main panel | `sidebar.panellist` (id=X) + `main` (key=X) | list + keyed / root |
| Session quick action | `conversation.session.header.actions` | list / session |
| Frame-level overlay/status | `shell.overlay` | list / root |
| Settings row / plugin page | `settings.general.item`; `plugins.item`, `plugins.bundle.config` | list/keyed / root |
| Composer takeover (e.g. asking user) | `conversation.composer` | chain / session |
| Tool call card | `tool.call.toolview` (key = tool name) | keyed / session |

## BotHarness specifics

- Host half lives in `packages/core` (`@botharness/core`, `dsh.bundle.patch` → `cordis.patch.yml`). M3 adds a `deepseekbot` bundle package and `@botharness/client`; follow the official two-half layout or give the client package a thin host half so it becomes a Loader entry.
- Decisions already made (**do not re-litigate**): generic Connection RPC over Typert (`docs/client-bridge.md`, ADR 0023); self-built client bundle replicating the official contract is the top M3 engineering risk; secrets go through the credentials seam, never config (M8); memory is not an official seam — ours is "system-prompt section + tools + file truth" (the official mapping in `extension-cookbook`).
- Repo conventions: TypeScript ESM strict, pnpm 12 / Node ≥22, tsdown builds, tests in `packages/*/test` (vitest). Run `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test` before calling work done.
- Current gaps to fix when touching `packages/core`: missing `declare module` Context merge, `exports["."].types`, `engines.node` (`>=22` vs upstream `^22.19.0 || >=24.0.0`).

## Top pitfalls

1. Patch `config` replacement is whole-object — restate every key you keep.
2. Optional services use `ctx.get('svc')` / `ctx.inject([...], cb)`; a hard `inject` on a missing provider parks the plugin in PENDING forever.
3. `turn/*`, `step/*`, `tool/call` are persisted **session event types**, not Cordis events — observe `session/event` and switch on `event.type`.
4. `tools/pre-execute` is a waterfall: call `next()` or you have short-circuited every downstream gate (including approvals).
5. `execute` must observe `exec.signal`, return exactly the declared `output.schema` JSON value, and throw only on infrastructure failure (registry maps to `isError`).
6. Client value-importing another plugin's package fails the purity gate — go through slots/services.
7. UI silently missing = parent slot not mounted, wrong keyed key, id collision shadowed, or the client bundle never rebuilt.
8. Client components cannot inject host services — everything host-side goes through RPC.
9. Unhandled promise rejections outside `apply` are fatal to boot; wrap async work in `ctx.effect`.
10. npm package name ≠ plugin identity — row `name`, bundle ids, and client wire ids are separate things; keep them stable.

## References

- `references/host.md` — host API surface: plugin shapes, tools DSL, events/waterfall, settings, credentials, system prompt, sessions/agents, lifecycle, publish/validate.
- `references/client.md` — `dsh.client` fields, client services/hooks, RPC, build contract, failure table, verification checklist.
- `references/slots.md` — full slot catalog with kinds/scopes and source declarations.
- `references/community-ui-patterns.md` — field notes from 13 community plugins: build routes, data channels, slot/RPC conventions, proven practices, drift hazards, anti-patterns.
