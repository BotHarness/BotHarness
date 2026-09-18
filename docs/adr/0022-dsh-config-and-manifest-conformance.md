# Plugin config uses the Cordis channel; settings cards are deferred

DSH's canonical plugin-configuration channel is an exported `Config` schema plus `apply(ctx, config)`, with `config` supplied by the composition entry (`cordis.yml` / bundle patch). BotHarness now uses exactly that: `apply` consumes `config.enabled` and registers nothing when it is false; the `ctx.settings.register('botharness', …)` call and the static `'settings'` injection are removed. The namespace registration was never a working settings card (it registered a schema and dropped the returned scope), and it made the plugin permanently PENDING in profiles without a settings provider (`sdk-minimal`), losing tools and prompt sections. A settings card returns in M3+ through the cookbook pattern — dynamic `ctx.inject(['settings'], …)` plus `ctx.settings.installSection(...)` — so a missing provider falls back to the composition entry instead of blocking the plugin. The package manifest also converges on official fields: `dsh.compatibility` is dropped in favor of `dsh.manifestVersion: 1` and `engines.dsh: 0.1.5-rc.2` (the host line the M3.5 gate pins).

## Considered Options

- **Static `inject: ['settings']` + `ctx.settings.register` (status quo)** — rejected: a hard dependency on a settings provider, `enabled` was dead config, and `register` is the namespace-owner API, not the path a composition-entry consumer should use.
- **Install a settings section now (`installSection` + dynamic inject)** — deferred: M3 has no settings card on the roster path, and the cookbook pattern wants a Host half and a client half designed together; the settings surface is an M3+ commitment.
- **Keep the dead `enabled` flag (or delete it)** — rejected: a schema that validates but never acts is worse than no flag; the canonical channel gives the flag real meaning with no extra work.
- **Keep `dsh.compatibility` alongside the official fields** — rejected: no official reader reads the unofficial field; metadata should not advertise ghosts.

## Consequences

- Removing `'settings'` from `inject` lets the plugin load in every profile; `apply(ctx, { enabled: false })` is a composition-level kill switch and is covered by a test.
- `SETTINGS_NAMESPACE` leaves the public exports until a settings card needs it; that card must re-add it via `installSection` (namespace key `botharness`) with a client half using the same key.
- `engines.dsh` is author intent only — current installers and loaders do not enforce it; the M3.5 install gate is the real version check.
- `tsdown` externals shrink to the single runtime import (`@deepseek-ai/dsh-tools`); `dsh-system-prompt` and `dsh-agent` are type-only and are erased at build.
- Line-level evidence for every claim: `docs/research/2026-09-18-dsh-authoring-conformance.md` (§3.1–§3.3).
