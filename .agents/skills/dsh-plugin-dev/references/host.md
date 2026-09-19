# Host-side reference (pinned upstream SHA `ddefc45…`, DSH 0.1.6-alpha.2)

Cite as `path:lines` relative to the upstream repo root. Deeper source-level notes: `docs/research/2026-09-19-dsh-plugin-authoring-host.md`.

## Official docs map

- `docs/user/develop/basic/{index,tool,config,publish}.zh.md` — first plugin, tools, config, packaging/install.
- `docs/user/develop/framework/{index,service,events}.zh.md` — lifecycle/fibers, services, events.
- `docs/user/develop/practice/{index,dynamic-cordis,llm-adapter}.zh.md` — capability roles, dynamic mounting, LLM adapters.
- `docs/cordis-tutorial/01..07` + `docs/cordis-primer.zh.md` — Cordis in seven lessons.
- `docs/cookbook/{adding-a-tool,adding-a-package,adding-a-settings-card,adding-a-remote-api,extension-cookbook}.zh.md` — task recipes.
- `docs/capability-seams.zh.md`, `docs/event-producer-consumer.zh.md`, `docs/subsystems/*.zh.md` — service/event/subsystem references (generated surfaces are authoritative over static lists).

## Package manifest (`packages/util/package-manifest/src/types.ts:27-77`)

| Field | Notes |
| --- | --- |
| `dsh.manifestVersion` | `1`; format id, not enforced |
| `dsh.bundle.patch` | path to your patch file; profile launcher reads it; must be shipped in `files` |
| `dsh.profile.bundles` | only inside a profile directory (composition list), not for published packages |
| `dsh.client.{platform,inject,immediately,external}` | client half; `platform: "web"`; see client reference |
| `engines.dsh` | declarative SemVer range; never enforced by installer/loader (reads only) |

Minimal published bundle (`docs/user/develop/basic/publish.zh.md`):

```text
hello-plugin/
├── package.json        { "type": "module", "main": "index.js",
│                         "files": ["index.js", "cordis.patch.yml"],
│                         "dsh": { "bundle": { "patch": "./cordis.patch.yml" } } }
├── cordis.patch.yml    - insert: [ { id: hello, name: dsh-hello-plugin } ]
└── index.js            export function apply(ctx, config) { … }
```

Dependency rules (upstream invariant, `docs/cookbook/adding-a-package.zh.md:25`): `@deepseek-ai/cordis` in `peerDependencies` **and mirrored** in `devDependencies`; every dsh peer mirrored in dev; `@deepseek-ai/schemastery` in `dependencies`. Runtime values flow only through `ctx`; between plugins use `import type` + `declare module`.

## Patch semantics (`vendor/include/src/index.ts:57-141`)

| Shape | Meaning |
| --- | --- |
| `- insert: [ {id, name, …} ]` | append rows to the entry list |
| `- id: <group-id>` + `insert: […]` | append children into a `group: true` row |
| `- id: <row-id>` + `config/disabled/inject/…` | override/disable an existing row; optional `name` is an assertion |

- Later layers win per row; `config` is **replaced wholesale** (no deep merge). Defaults belong in the plugin's `Config` schema, since users may override your row.
- Row options: `id`, `name` (module specifier: package name, path, file URL), `config`, `disabled` (accepts `!!js`), `inject`, `group`, `isolate`/`intercept` (`vendor/loader/src/config/entry.ts:9-22`).
- `!!js <expr>` evaluates after the row's injections activate; launcher exposes `ctx.dshHomePath`, `ctx.cmdlineArgs`.
- Failure posture: empty patch file → boot fails (use `[]`); missing patch file → boot fails; unmatched target or failed `name` assertion → warn + skip.
- Layer order: `dsh.profile.bundles` order → profile `cordis.patch.yml` → `$DSH_HOME/cordis.patch.yml` → `--patch` overlays (`apps/cli/reference/README.zh.md:11`).
- `ctx.plugin(SubPlugin)` mounts a child fiber from code (inherits ctx, own lifecycle, disposed with parent) — use it for conditional/internal sub-plugins; use patch rows for anything users should enable/configure/override.

## Plugin module

```ts
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'

export const name = 'my-plugin'
export const inject = ['tools']                    // required services only
export interface Config { greeting: string }
export const Config: Schema<Config> = Schema.object({ greeting: Schema.string().default('Hello') })
export function apply(ctx: Context, config: Config) { /* ctx.tools is ready */ }
```

- Shapes: function / object (`export default { name, inject, apply }`) / class (`extends Service`, `static inject`, `super(ctx, 'key')` when you provide a service). Loader normalizes ESM/CJS/default exports (`unwrapExports`, `vendor/loader/src/index.ts:188-196`).
- `Config` must be a Standard Schema (Schemastery/zod); validation happens at load, defaults fill in.
- Consume: static `inject` (auto unload/reload when the service appears/disappears), optional `ctx.get('svc')`, or dynamic `ctx.inject(['settings'], cb)`.
- Provide: `ctx.provide(name, value)` or a `Service` subclass; add `declare module '@deepseek-ai/cordis' { interface Context { myService: MyService } }` for consumer typing.
- Isolation: `isolate` in the loader config gives plugin groups their own instances (`docs/user/develop/framework/service.zh.md:111-141`).

## Tools (`docs/cookbook/adding-a-tool.zh.md`)

```ts
import { defineTool } from '@deepseek-ai/dsh-tools'

ctx.tools.register(defineTool({
  name: 'read_file',
  description: 'Read a file from disk.',
  parameters: {
    path: { type: 'string', required: true, description: 'Absolute path' },
    limit: { type: 'number' },
  },
  output: {
    schema: { type: 'string' },
    render: (_args, value) => [{ type: 'text', text: value }],
  },
  async execute(args, exec) {
    return readFile(args.path, { encoding: 'utf8', signal: exec.signal })
  },
}))
```

- Schema is `@deepseek-ai/dsh-tools`' own JSON-value DSL (`ParameterSchemaSpec`/`ValueSchemaSpec`), not zod. Supports string/number/integer/boolean/null/array/object/`json`/`oneOf`; explicit object nodes need `additionalProperties`. Raw JSON Schema `ToolDefinition` is also accepted (MCP-style).
- `execute` returns exactly the `output.schema` JSON value; `output.render` produces model-facing content. Throw only for infrastructure failure (becomes `isError`).
- `exec` gives read-only `callId/name/arguments/agent/token/signal`; always observe `exec.signal`.
- Pipeline seams: `tools/pre-execute` (waterfall allow/deny/**ask** → answered by `ctx.approval`), `ctx.tools.guard()` (monotonic deny), `tools/execute` (wrap), `tools/post-execute`, `tools/result` (observe). Sandbox is an orthogonal axis: `ctx.sandbox.confine(argv, policy)` + `ctx.sandboxPolicy.resolve()`.
- Long-running work: `ctx.jobs.start({ kind, label, owner: exec.agent, run })`; after start, use the job's signal.
- Web call cards come from keyed slot `tool.call.toolview` reading wire values; host side contributes `output.presentationMeta` (don't expect `presentCall/presentResult` to draw cards).
- Tools are automatically callable as `await tools.<name>(args)` inside `run_code` (PTC) — no extra integration.

## Events (`docs/user/develop/framework/events.zh.md`, `docs/event-producer-consumer.zh.md`)

Five dispatch modes: `emit` / `waterfall` / `parallel` / `serial` / `bail`. Waterfall listeners take `(...args, next)` and **must** call `next()` to continue:

```ts
ctx.on('tools/pre-execute', async (exec, next): Promise<PreToolDecision> => {
  if (!(await isAllowed(exec))) return { kind: 'deny', reason: 'Denied by policy.' }
  return next()
})
```

- Type-safe declaration: `declare module '@deepseek-ai/cordis' { interface Events { 'my-plugin/ready': (p: {...}) => void } }`.
- Naming `namespace/action`. `turn/*`, `step/*`, `tool/call`, `tool/result`, `compaction/*` are **persisted session event types**, observed via `session/event` + `event.type`.
- Families worth knowing: `tools/*` (pipeline), `agent/*` (`created`, `status`, `pre-step`, `request`, `turn-stopping`, `assistant-stream`, `inbox/*`, `disposed`, `error`), `session/*` (`created`, `event`, `flush`, `disposed`), `system-prompt/assemble` (authoritative waterfall), `approval/request`, `commands/change`, `settings/*`, `credentials/*`, `workflow/*`, `subagent/*`, `skills/change`, `fs/*-intent`.
- `ctx.on` registrations are effects; `{ prepend: true }` orders your listener before ordinary ones.

## Settings, credentials, prompts

- `ctx.settings.installSection(...)` inside `ctx.inject(['settings'], cb)`: composition config as base, optional provider, user document layer on top, `get()` returns deep-frozen snapshots, `role('secret')` fields are redacted on the protocol surface. Namespace literals are `[a-z0-9-]` (`packages/settings/settings/README.zh.md:46-76`).
- `ctx.credentials`: config carries a `CredentialRef` (env-var-style name), never a value; `resolve(ref)` per operation, never cache across operations; `describe/readRecord/…` for authorization records (`docs/subsystems/credentials.zh.md:5,20-31,127-215`).
- `ctx.systemPrompt.section({ name, order, text })` (text may be static or `(ctx) => string`); `context(...)` for cache-safe durable snapshots; `tools(provider)` for schemas; `variable(name, provider)`; `system-prompt/assemble` waterfall is authoritative and `complete: true` sections cannot be bypassed (`docs/subsystems/system-prompt.zh.md:46-88,100-201`).

## Sessions, projections, agents

- `ctx.sessions` — live in-memory Session access; committed SessionEvents form the canonical durable log through `sessionPersistence`, while `session/event` is the process-local post-commit notification and `sessionQuery` is a derived cold-search seam.
- `ctx.sessionProjections.register(...)` — fold session events into domain state exposed to UI/other plugins; registration is an effect (key leaves snapshots on unload); history can be lazily folded (`docs/subsystems/session-projection.zh.md:205`).
- `ctx.agents`: `followup(msg)` queues next-turn prompt and wakes the driver; `steer(msg)` submits next-step input; `inject(msg)` adds durable model-facing context without waking; `cancel`, `whenIdle`.
- Dynamic context injection patterns: durable `agent.inject({ content, source })`, `agent/pre-step` waterfall (append to `decision.messages`), or `systemPrompt` contributions. Golden sample: `packages/context/time-context/src/index.ts:153-221`.

## Lifecycle (`docs/user/develop/framework/index.zh.md`)

- Fiber states: `PENDING → LOADING → ACTIVE`, apply throw → `FAILED`; `ACTIVE → UNLOADING → DISPOSED`.
- All registration APIs auto-dispose; custom resources via `ctx.effect(() => cleanup)`. Disposers run in reverse order, but async disposers run concurrently — put ordered cleanup in one effect.
- `dispose` removes registrations, recursively disposes child plugins, resolves after async cleanup.
- HMR: source change → unload old plugin → load new code → new `apply`; config change hot-replaces; **package install/version replacement still requires process restart** (`packages/boot/hmr/README.zh.md:56-63,84-89`).
- Error isolation (`packages/boot/app-boot/README.zh.md:76-90`): optional row apply failure → warn and continue; required row failure → app fails; schema failure → that row inactive; unhandled rejections outside `apply` are fatal.

## Publish & validate

- Forms (`docs/user/develop/basic/publish.zh.md:153-178`): npm (ship prebuilt `main` + patch in `files`), tarball (`pnpm pack`), git (self-contained `prepare`; pnpm ≥10 `allowBuilds` gate; pin a commit).
- Only official composition check: `dsh --profile <p> --dump-config` (rows + provenance; `!!js` printed unevaluated). No official doctor / marketplace validator exists.
- Compatibility is ultimately exposed at import/mount time; profiles use `autoInstallPeers: false` + lockfile + runtime resolution generations (`packages/boot/app-boot/src/profile.ts:183-188`).

## Pitfalls

1. Config replacement is whole-object; restate keys.
2. Don't hard-`inject` optional providers (`ctx.get` / `ctx.inject` instead).
3. Session event types are not Cordis events.
4. Waterfall listeners must call `next()` (or intentionally short-circuit).
5. `exec.signal` must be observed; `args` is read-only.
6. Patch failures: empty file fatal, unmatched target warn-and-skip.
7. `import type` only across plugins; runtime through `ctx`.
8. Unhandled rejections outside `apply` are fatal.
9. Installed ≠ registered; the row must be inserted by some patch.
10. Upstream monorepo invariants (`private: true`, synced versions, exports gates) are not external-package obligations.
