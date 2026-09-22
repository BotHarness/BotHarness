---
Status: Accepted
Date: 2026-09-22
---

# Computer settings are runtime settings, contributed into the BotHarness section through a child slot

The Computer's export directory and idle stop time started as plugin configuration: `exportDir` decided whether export/import was possible at all, and `idleStopMinutes` armed the idle policy once at boot. Both are the kind of choice a Human makes while looking at the feature — "put my exports here", "stop it sooner" — and neither should require editing a profile file or restarting DSH. At the same time the BotHarness settings section belongs to `@botharness/client`, while the Computer is an optional standalone package, so the section must not learn about the Computer to host its rows.

## Decision

- **Runtime-editable Computer fields live in a settings namespace**, `botharness-computer`, registered by the Host with the plugin config as the composition `base` layer. A Human override in the settings document wins; the resolved value is read at call time, so the export endpoints and the idle policy follow an edit immediately and no restart is involved. Fields that shape the container itself (image, resources, hardening) stay plugin configuration, because they describe the machine rather than a session preference.
- **The idle watcher reads its threshold through a getter.** `createIdleWatcher` accepts `idleMs` as a number or a function, so a settings change applies to the next check instead of only the next boot.
- **The BotHarness section declares a child slot** (`botharness.settings.item`) and renders it below its own rows. `@botharness/client` never imports the Computer: the Computer registers its group into the slot when it is installed, and a profile without it simply shows the section's own rows.
- **The export directory is chosen with the Host's own directory picker** (`ctx.uiWorkspace.pickDirectory()`), so the Web profile gets the in-app browser surface and a native deployment gets its OS dialog without the Computer knowing which one is mounted. When no picker is mounted the picker control is unavailable, and the Host's reported `exportDir` still tells the rows whether export/import can run.
- **Export and import keep their explicit authorization.** The rows ask before sending `authorize: true`; the Host keeps validating archive names and refusing traversal, and a start/stop-free export still stops the container around the tar.

## Consequences

- The Computer's client bundle gains the settings capability as an optional dependency: without a settings provider the rows still list archives and export/import, but the directory and idle time are read-only.
- Two places can now express the same value (plugin config and user override). The settings document wins by design, and `pnpm` profiles that pin `exportDir` in the plugin config keep working as the deployment default.
- The child slot is an application-defined seam between our own packages; a future BotHarness settings group (memory, messaging) registers there the same way instead of editing the section.
