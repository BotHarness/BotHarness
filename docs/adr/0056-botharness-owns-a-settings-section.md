---
Status: Accepted
Date: 2026-09-22
---

# BotHarness owns a settings section instead of adding rows to the native General page

BotHarness keeps accumulating preferences that belong to the product, not to DSH: interface motion, BOT list sorting, and — next — the Computer's settings, export/import, and resource bounds. The first two shipped as rows inside DSH's native 通用设置 page (`settings.general.item`). That seat is the shell's page for cross-feature preferences, and filling it makes product settings read as native DSH settings while coupling our ordering and copy to a page we do not own.

## Decision

- **The client registers its own settings section**: a `settings.section` contribution with `id: 'botharness'`, `order: 25` (after the native `general` 0, `models` 10, `plugins` 15, and `agent-presets` 20), and a `label` resolved from the `botharness` locale namespace. The section's page is ours; the shell keeps owning the dialog, navigation, and active-section state.
- **BotHarness preferences move out of 通用设置**: the motion and BOT-sorting rows leave `settings.general.item` and render inside the new section, through the same preferences face and settings scope, so behavior and write paths are unchanged.
- **The section is the home for Computer settings**: the Computer's export directory picker, export/import actions, and resource bounds (`cpus`, `memory`, `shmSize`, `pidsLimit`, `idleStopMinutes`) land here ([#168](https://github.com/BotHarness/BotHarness/issues/168)).
- **The Settings 插件配置 tab is not this surface.** It renders host-plane plugin configuration for plugins that serve a settings namespace with a matching card; product preferences are not plugin configuration and do not belong there.
- **The section is client-only.** It adds no Host contract: it consumes the existing settings scope and, later, the existing Computer endpoints.

## Consequences

- The nav glyph is ours at runtime: the shell picks nav icons from a hardcoded map keyed by section id and offers no icon option on `settings.section`, so the client tags the Bot section's nav cell (matched by its localized label), hides the shell glyph and inserts the chosen Bot mark (ADR-0057). DSH's gear remains only as the fallback when the cell cannot be matched; a first-class icon affordance upstream would let us delete the patch.
- Section ordering is ours to keep sensible as more BotHarness preferences appear; the section renders as one page, so a row that needs a page of its own would become a child surface or a second section.
- DSH's shell resolves the nav label from the registration's `label` option, so the registration carries localized text; any future copy change re-registers with fresh text rather than reaching into the shell.
