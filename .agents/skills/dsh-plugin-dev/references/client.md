# Client-side reference (pinned upstream SHA `ddefc45…`, DSH 0.1.6-alpha.2)

Cite as `path:lines` relative to the upstream repo root. Deeper source-level notes: `docs/research/2026-09-19-dsh-plugin-authoring-client.md`.

## Docs map

- `docs/subsystems/web-client.md` — layering (Host → Transport/Remote → client models → UI adapters → Conversation → Slots → React), browser boot, reconnect.
- `docs/subsystems/client-modules.md` — `dsh.client` scanning, `WebBootGraph`, `/plugins/??<pkg>/client.js&rev=…`, lazy-CJS model.
- `docs/subsystems/slots.md` — slots spec (declaration, kinds/scopes, props shares, hooks, tree).
- `docs/subsystems/{client-resources,sidebar-right,conversation}.md` — resource URLs, right sidebar tabs, conversation targets.
- `docs/cookbook/adding-a-settings-card.md` — the only external-facing client tutorial (host `installSection` + browser `slots.register` + packaging; states explicitly that no published preset exists).
- `docs/cookbook/adding-a-remote-api.md`, `docs/api-gateway.md` — Typert Remote pipeline (in-repo generation).
- `docs/web-styling.md` — CSS Modules + `clsx`, `--dsw-*` tokens, no Tailwind/component libraries.
- `packages/client/AGENTS.md` — in-repo hard rules (props shares, export/ctx discipline, shared modules, new-package checklist).
- `packages/client/README.md` — package map and `ctx.*` owners.

## `dsh.client` manifest (`packages/util/package-manifest/src/types.ts:63-77`; parser `packages/client/modules/src/client/manifest.ts:141-178`)

| Key | Type | Meaning |
| --- | --- | --- |
| `platform` | string | required; Web consumers only accept `'web'` |
| `inject` | string[] | package-name edges: pre-delivers injected packages' factories before materialize; **not** an activation edge (Cordis service `inject` decides activation) |
| `immediately` | boolean | phase-one preload barrier; infrastructure rows only |
| `external` | string[] | extra precise module-table requests (`<pkg>/client` style) beyond baseline; infra/transport only, not a dependency mechanism |

`exports["./client"]` must resolve (string or `{ default: string }`); missing → `client-modules: <pkg> declares dsh.client but exports no "./client" bundle`. Scanning covers **live Loader entries**; malformed decls aggregate into `ClientPackageCompositionError` at activation (fail-loud), steady-state errors only warn.

Minimal manifest (official, `packages/client/ui-jobs/package.json:16-40`):

```json
{
  "exports": {
    ".": { "types": "./lib/types/index.d.ts", "default": "./lib/index.js" },
    "./client": { "types": "./lib/types/client/index.d.ts", "default": "./lib/client.js" },
    "./src/*": "./src/*",
    "./package.json": "./package.json"
  },
  "dsh": { "client": { "platform": "web", "inject": ["@deepseek-ai/dsh-client-ui-conversation"] } },
  "files": ["lib/index.js", "lib/client.js", "lib/types/**/*.d.ts"]
}
```

## Runtime

- Entry = built `lib/client.js`, a lazy-CJS factory; the client Cordis loader consumes its exports as an object plugin: `export const inject = [...]` + `export function apply(ctx)`.
- The browser half is a **separate Cordis application**: no host service injection, no filesystem, no agent/session objects. `inject` names are client services (`slots`, `locale`, `sessions`, `remote`, `connection`, `uiSession`, …); apply waits for them and re-runs if they disappear.
- Host half of the same package is a normal (often empty) Cordis plugin so the package is a Loader entry.
- Components never receive `ctx`; everything arrives as slot props (the five shares) or standard hooks. No module-level side effects; no self-built subscriptions in business components.

Client services (`packages/client/README.md`, package READMEs):

| Service | API highlights |
| --- | --- |
| `ctx.slots` | `register`, `registerFactory`, `inject(key, cb)`, `provideRoot`, `install/installLocale`, `entries/entriesOfSlot/snapshot/subscribe/getVersion/onEntryError` (`ui-renderer/src/client/registry.ts:120-473`) |
| `ctx.locale` | `register(ns, { zh, en })`, `addLanguage`, `bind(ns)` (both dictionaries required in object form) |
| `ctx.sessions` / `ctx.workspaces` | React-free client read models; consume via `useSessions`/`useSession`/`useWorkspaces` |
| `ctx.remote` | Typert remote calls `ctx.remote.<ns>.<method>()`, `$on`, `$host` |
| `ctx.connection` | transport primitives and connection generation/reconnect; `/api` remains API Gateway-owned |
| `ctx.uiSession` | session source + `registerPendingInteraction` |
| `ctx.theme`, `ctx.layout`, `ctx.sidebarRight`, `ctx.resources`, `ctx.settingsScope`, `ctx.fileUpload`, `ctx.modules` | theme, main-panel selection, right-bar navigation, resource protocols, plugin settings cards, uploads, module table |

Standard hooks by scope (`docs/subsystems/slots.md:79-93`): all scopes — `useSessions`, `useSessionStatus`, `useSessionRetainInfo`, `useWorkspaces`, `usePanelInfo`; `session` scope adds `useSession`/`sessionId`/`useProjection`, `useConversation`/`useInput`/`inputActions`, `useChat`, `useTrajectory`; registration may add `useStore`/`t`/`useResource` and inject-face `use<Name>`. React is 18.2 (shared by the shell).

## Slots

Mechanics (`packages/client/ui-slots/src/index.ts`, `ui-renderer/src/client/registry.ts`):

- Kinds: `single` (second same-priority registration throws; higher priority shadows), `list` (requires `id`, ordered by `order` then registration), `keyed` (owner passes `entryKey`; duplicate key same priority throws), `chain` (each entry provides `select(owner)`; lowest non-null priority wins, owner fallback otherwise).
- Scopes: `root`, `session-maybe`, `session`.
- Register through the declaration lifecycle:

```tsx
export const inject = ['slots']
export function apply(ctx: Context): void {
  ctx.slots.inject('conversation.session.header.actions', () =>
    ctx.slots.register({ name: 'conversation.session.header.actions', id: 'review', order: 100 }, HeaderAction))
}
```

- Rules: no module-level side effects; registrations are fiber-scoped effects; stable `id`/`key` + `order`; `label` may be a thunk for language changes; atomic multi-registration can return a generator; ordering is fixed at registration (only unload removes).
- Component props are derived types only (never hand-write): `PropsRuntime<K>`, `PropsRenderSlots`, `PropsRenderFactories`, `PropsStore`, inject face; ReactNodes pass only through child slots.
- Source declarations are the truth; the published docs tree lags (e.g. `settings.plugin.item` in the cookbook does not exist; `sidebar.toggle.badge`, `sidebar.right.tab.document`, `tool.view.cordis` exist but are missing from the docs tree). Inspect the live tree with `cordis_inspect what:"client"`.

Full catalog: `references/slots.md`.

## Typert / API Gateway host communication

The browser calls `POST /api/<namespace>/<method>` through `@deepseek-ai/dsh-api-gateway`. The gateway owns the route's **single interceptor** and claims methods from the Typert Registry.

In BotHarness, the Host Plugin provides a `TypertRemoteService` with a `typertRemote` namespace binding and remote-method descriptors. Standard decorators do not survive this repository's oxc/tsdown pipeline, so `packages/core/src/bridge/rpc.ts` writes the protocol descriptor directly (SRC markers, no code generation). The client uses the Typert `ctx.remote` face or the gateway wire contract generated/defined for that namespace.

Hard guardrail: do not register `connection.rpc.intercept('/api', …)` in a third-party Plugin. A second interceptor shadows native controllers (`settings`, model providers, plugin settings, directory picker) while the custom endpoint may appear to work.

Wire shape used by the current host:

```text
POST /api/<namespace>/<method>
{ type: "client-request", rpcId, method, payload: { args: { ...namedArgs } } }

-> server-response envelope
   ok: true with value
   or ok: false with { code, message, details }
```

- Omit absent named arguments; the decoder rejects explicit `undefined` fields.
- Browser code cannot inject Host Services. The remote Service is the capability adapter across that boundary.
- Streaming requires a supported Typert logical stream or an exact authenticated fetch/SSE route verified against the pinned Host; `$events` forwarding is first-party whitelisted.
- A separate Connection RPC channel (`rpc.handle('/my-plugin', …)` with matching client channel) is a distinct physical route, not a way to extend `/api`. Verify authentication, cancellation, and reconnect behavior before selecting it.
- Trust boundary: Host/origin allowlist plus signed cookie; `dsh web --host 0.0.0.0` is unsupported.

## Build contract (must be replicated; no published preset)

Official preset reference: `packages/client/tsdown.client.ts`; platform seed: `packages/client/web/src/platform.ts:8-18`.

| Item | Requirement |
| --- | --- |
| Output | CJS, `platform: 'browser'`, entry filename `lib/client.js`, chunks `client.<name>.js` |
| Self-registration | every output wrapped with `window.__ModuleLoader__.load({ id, factory: (require) => { … return module.exports } })` |
| Externals | baseline only: `react`, `react/jsx-runtime`, `react-dom`, `react-dom/client`, `@deepseek-ai/cordis`, `@deepseek-ai/dsh-client-store`, `@deepseek-ai/dsh-client-ui-slots`, `@deepseek-ai/dsh-client-ui-primitives`, `@deepseek-ai/dsh-client-ui-dockkit`; plus `dsh.client.external` requests; **everything else inlined** |
| Purity gate | cross-plugin `@deepseek-ai/*` value imports that are neither requested nor inline-safe fail the build — use services/slots |
| CSS | `*.module.css` → hashed classes injected at factory execution as `<style data-plugin>`; plain `.css` / `?inline` also supported |
| Sourcemaps | chain `lib/types` tsc maps into the bundle |
| Two halves | one package builds node lib + browser bundle, `exports` `.` and `./client`, `files` covers both |
| HMR revision | touch the entry after all chunks are written (entry bytes + completion stamp) |

In-repo new-package checklist also requires aggregate tsconfig references, a `dsh.client` row in `packages/bundle/web-app/cordis.patch.yml`, and web-app package deps (`packages/client/AGENTS.md:136-145`); outside the repo these correspond to: a bundle patch row for your host half + normal package deps.

## Dev loop & failure table

- Rebuild `lib/client.js` on change (own `tsdown --watch`); HMR polls ~500 ms, unloads old fiber, materializes new bundle, remounts plugin (local React state lost; session/workspace/connection state kept). Out-of-tree plugins must be rebuilt — the host only serves `lib/client.js`.

| Symptom | Root cause |
| --- | --- |
| `AggregateError: N client packages failed to compose` / `client bundle not found; run pnpm run build before launch` | `dsh.client` declared but `lib/client.js` missing |
| `… declares dsh.client but exports no "./client" bundle` | missing `exports["./client"]` |
| `bundle <url> loaded without registering "<id>" via __ModuleLoader__.load` | output is not lazy-CJS (e.g. ESM build) |
| `client bundle purity: "<spec>" is not in … externals` | value-imported another plugin's package |
| `slot "<key>" is not declared` / duplicate same priority / store handle across scopes | registration errors at activation |
| UI missing, no error | parent slot not mounted, keyed key mismatch, list id collision shadowed |
| Page-side sync failure | HMR download/materialize failure; retry in `Settings → Plugins → Plugin list` |

Verification checklist: `window.__DSH_BOOT__.entries` contains the package; `/plugins/<pkg>/client.js` returns 200; `Settings → Plugins → Plugin list` shows no sync failure; `cordis_inspect what:"client"` lists your slot entries; rebuild before probing after bundle edits.

## Golden samples

- `packages/client/ui-jobs` — minimal browser half (42 lines): locale registration + `conversation.session.header.actions`, zero RPC, standard hooks only.
- `packages/client/ui-user-questions` — advanced: `conversation.composer` chain takeover, `ctx.remote.$on` events, store, typed i18n, two-half package.
