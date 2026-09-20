# Community UI patterns (field notes)

Snapshot 2026-09-19, distilled from 13 community plugins read at pinned SHAs. Evidence lives in the repo's research notes: `docs/research/2026-09-19-dsh-client-ui-common-patterns.md`, `2026-09-19-dsh-client-ui-flagship-dives.md`, `2026-09-19-dsh-market-deep-dive.md`, `2026-09-19-dsh-client-build-templates.md`. Field notes, not rules — when they disagree with `references/client.md` (official contract), the official contract wins.

## 1. How UI developers actually build UI

There is **no published client build preset**, so every out-of-tree plugin replicates the lazy-CJS contract itself. Three routes exist in the wild:

| Route | Examples | Take |
| --- | --- | --- |
| **tsdown, self-contained dual config** | dsh-compass, dsh-agent-team-gui, dsh-file-explorer, dsh-market | Closest to the official preset (also tsdown/rolldown + lightningcss); CSS Modules for free; the recommended family. |
| **esbuild + hand-written loader wrapper** | dsh-rewind | Most explicit and auditable — post-build smoke assertions, build hash — but you lose CSS Modules unless you add a plugin. Good fallback. |
| **Not portable — avoid** | dynamic import of a local harness checkout (agent-team); `../tsdown.client.ts` out-of-repo path (side-tasks, plugin-store); hand-written JS bundle with no build (channel-view, herald) | Cannot build standalone; artifact/source drift is unverifiable. |

The UI surface has converged. What varies is the **data channel**. The list records field usage, not an endorsement:

- official faces/hooks (`ctx.sessions`, `ctx.workspaces`, `uiConversation`) — the default for reads;
- API Gateway/Typert remote Services — the supported `/api` route; plugins may use generated or explicit SRC remote-method descriptors;
- generic Connection RPC on a plugin-owned channel — separate physical route; verify auth/reconnect/cancellation and never intercept `/api`;
- plugin-private HTTP routes (`fetch('/my-plugin/...')`) — needs your own auth story (one live plugin has an open security complaint for this);
- Typert `@Remote` code generation — common upstream; out-of-tree generation may need adaptation, while explicit descriptor registration remains a compatible fallback;
- direct DOM/FS reads — brittle; seen in the wild, avoid.

## 2. Commonalities worth copying

- Register with `ctx.slots.inject(key, () => ctx.slots.register(spec, Component))`; never call `register` outside the declaration lifecycle.
- `dsh.client.inject` lists **official package names**; the module `inject` lists **service names** (`slots`, `sessions`, `locale`, …).
- Keep React (and the shell's shared modules) external; everything else inlines. React 18 baseline.
- Wipe up in `ctx.effect(() => dispose)`; styles, registrations and subscriptions all return disposers.
- Read from official client services first; `useSyncExternalStore` over a store/controller, not ad-hoc subscriptions in components.
- Style with `--dsw-*` tokens; no Tailwind, no component library. CSS Modules or injected `<style data-plugin>`.
- i18n via `ctx.locale.register(NS, { zh, en })` + the `locale: NS` registration field; slot labels as thunks.
- Give a Typert remote Service a stable namespace, or name a distinct plugin-owned channel `<pkg-or-ns>/<method>`; `/api` remains API Gateway-owned.
- Ship a bilingual README with screenshots; declare Node 22.19+/24+.

## 3. Field-proven best practices

| Practice | Why it earned its place |
| --- | --- |
| **Compile-time slot pin** — a `readonly (keyof SlotMap)[]` test over your registrations | `slots.inject` waits forever on a removed slot with no error; one plugin shipped a card into a key that upstream had deleted and it silently vanished. |
| **Nested `ctx.inject` for optional services** (`settingsScope`, `connection`, `webServer`) | Module-level `inject` on a service the host may lack parks the whole plugin; nesting degrades to "one card missing". |
| **Post-build smoke assertions** — wrapper format, registration id, no leaked defines, exports, declaration files | The lazy-CJS contract is the easiest thing to break silently; turn it into a build failure. |
| **Build hash injected into the bundle** | Tells you (and users) which commit the browser is really running — stale bundles from cache are otherwise indistinguishable. |
| **Slot bridge + `createPortal`** — register a zero-UI component in a `list` slot, portal real UI into the host row | The only supported way to decorate host-owned rows (e.g. per-message actions) without DOM anchoring. |
| **Projection + pure presenter + `useSyncExternalStore`** — facts fold host-side into the session-list snapshot, the component only binds interactions | Row data needs zero RPC, survives reconnect, and is unit-testable without a DOM. |
| **Per-session draft/pending persistence** — localStorage + `useSyncExternalStore` + timed file backup + TTL resume | Covers session switch, page refresh and restart with one model. |
| **Typed i18n with one source of truth** — `zh` defines the keys, `en` is typed as `Record<keyof typeof zh, string>` | Missing translations become compile errors, not fallback text. |
| **`api()` anchored to `document.baseURI`** | Works behind reverse proxies and sub-path deployments. |
| **ErrorBoundary with an "export logs" button that survives the crash** | A third-party panel should never take the shell down, and a crash report should be one pasteable fact. |
| **Compat audit ledger** — pin the one host version line you tested, log every removed/renamed API with its replacement, assert the seams in tests | Preview-period drift is the #1 failure mode; "tests are the audit" beats a stale README. |
| **CI that installs the real host** (pinned `dsh`, real profile, browser smoke) | Catches "all tests green, installs broken" — the exact failure class plugin installs produce. |

## 4. Version drift is the top hazard

- **Removed slots**: `settings.plugin.item` is gone — use `plugins.bundle.config` (keyed by bundle package name) or `plugins.item`. A removed slot fails silently: the card just never renders.
- **Navigation changed**: `ctx.uiWorkspace.openSession(...)` is the current entry; older `sessions.open` / `openSubagent` shapes are gone in the pinned 0.1.6 line.
- **Declare intent**: `dsh.engines.dsh` + a tested peer range; only claim versions you actually test.
- **Guard declarations against usage**: scan your own `ctx.*` usage and reconcile it with `dsh.client.inject` — unused seams shrink your compatibility surface, missing ones wait forever.
- **Don't hardcode DOM or host text** (class names, `'Send'`/`'发送'` aria labels): host restyles or a language switch break it instantly.

## 5. Anti-patterns seen in the wild

- DOM anchoring into host markup (class names, tab labels, 2s watchdogs).
- Reading/writing `$DSH_HOME` files directly (session dirs, caches) instead of host APIs.
- `window.confirm`/`alert` instead of a dialog; silent `catch {}` with no reporting.
- Single 5,000-line component with 100+ `useState`; unclear state ownership.
- Unbounded observers/scans (repeated full scans, un-released subscriptions) — the classic "UI got slow" regression.
- Shipping prebuilt bundles with no reproducible build, or `lib/` that is the source.
- Publishing under someone else's scope, or a package name that already exists on npm.
- Missing LICENSE — blocks enterprise use and marketplace listings.

## 6. Build templates

The three field-proven templates (rewind's esbuild + assertions, compass's minimal tsdown config, dsh-market's reproducible tsdown + artifact governance) are compared dimension-by-dimension, with a recommendation and an M3 landing checklist, in `docs/research/2026-09-19-dsh-client-build-templates.md`.
