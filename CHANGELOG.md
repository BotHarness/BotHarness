# DeepSeekBot Changelog

Notable changes to DeepSeekBot are recorded here. See the
[Release Ledger guide](docs/agents/changelog.md) before adding or publishing an entry.

## [Unreleased]

Advances the first PersonaBot workflow with Assignment delivery, shared motion controls, and a channel composer island.

### Added

- Added the first Human-testable PersonaBot Assignment tracer bullet: a PersonaBot can receive a DM through its durable Bot Inbox, run an Orchestrator plus an independent Assignment Session, explicitly send the Assignment result back to the same Channel, and expose Assignment list/detail views; default Memory and Workspace Grant behavior remain follow-up work in [#81](https://github.com/BotHarness/BotHarness/issues/81).
- Added a persistent BotHarness motion preference with Follow system, Reduce motion, and Full motion modes, including a live accessible preview and one effective policy shared by Client surfaces ([#128](https://github.com/BotHarness/BotHarness/issues/128)).
- Reworked the DM and group Channel composer as a responsive floating island with multiline input and an accessible, projection-only PersonaBot activity region ([#129](https://github.com/BotHarness/BotHarness/issues/129)).
- Added deterministic, read-only GitHub Release draft preparation for the independent DeepSeekBot and DSH Skill release trains ([guide](docs/agents/changelog.md#preparing-a-github-release-draft), [#103](https://github.com/BotHarness/BotHarness/issues/103)).

### Changed

- PersonaBot DM rows can now be pinned by context menu or by dragging them into the persistent pin zone, while pinned cards can be dragged back to the highlighted roster to unpin; neither path loses the DM's previous section or loose position ([#10](https://github.com/BotHarness/BotHarness/issues/10)).
- Section headers can now create either a group Channel or a PersonaBot DM directly inside that section, and newly created sections, loose Channels, and section members default to the first position in their scope ([#10](https://github.com/BotHarness/BotHarness/issues/10)).

### Fixed

- Made PersonaBot DM Channels follow the same section, loose-placement, drag, and move rules as group Channels while retaining their avatar contact rows ([#56](https://github.com/BotHarness/BotHarness/issues/56)).
- Fixed flat-order drag commits so an unpinned PersonaBot DM can persist at the absolute top or between Channel sections exactly like a group Channel ([#56](https://github.com/BotHarness/BotHarness/issues/56)).
- Channel messages no longer wait for the PersonaBot's Orchestrator turn: a Human message appears immediately, can be sent while the bot is still working, and is admitted to the Bot Inbox for serial processing ([#140](https://github.com/BotHarness/BotHarness/issues/140)).

### Documentation
- Documented the Channel sidebar as Bot mode's scoped right region with one ordered, collapsible entry seam, retiring PersonaBot navigation ([ADR-0053](docs/adr/0053-channel-sidebar-is-the-scoped-right-sidebar.md), [#156](https://github.com/BotHarness/BotHarness/issues/156)).

- Added the canonical Release Ledger, bilingual parity checks, and contributor guidance ([#100](https://github.com/BotHarness/BotHarness/issues/100)).
- Documented the planned PersonaBot DM navigation and renamed the application-defined Work concepts to Assignment, Assignment Session, Assignment Agent, and Assignment Directory; this records design language and does not claim the UI or runtime is implemented ([#109](https://github.com/BotHarness/BotHarness/pull/109)).
- Published a bilingual Development status page that keeps the DeepSeekBot and DSH Skill release trains separate from the Changelog ([#105](https://github.com/BotHarness/BotHarness/issues/105)).
- Documented Memory as an optional Git-backed Cordis Service, keeping the DM → Orchestrator → Assignment path independent of Persona and Memory ([ADR-0047](docs/adr/0047-memory-is-an-optional-git-backed-service.md), [#74](https://github.com/BotHarness/BotHarness/issues/74)).

## [Development] - 2026-09-20

Consolidated the implemented foundation and public documentation that preceded DeepSeekBot's first release; this is development history, not a released or installable version.

### Added

- Added durable PersonaBot identity, file-based Memory tools, and the BOT-mode creation flow ([#22](https://github.com/BotHarness/BotHarness/pull/22), [#98](https://github.com/BotHarness/BotHarness/pull/98)).
- Added the BOT-mode Channel shell, roster sections, per-scope sorting and drag movement, with durable Host-side arrangement ([#51](https://github.com/BotHarness/BotHarness/pull/51), [#64](https://github.com/BotHarness/BotHarness/pull/64), [#72](https://github.com/BotHarness/BotHarness/pull/72), [#73](https://github.com/BotHarness/BotHarness/pull/73), [#95](https://github.com/BotHarness/BotHarness/pull/95)).

### Changed

- Aligned the plugin manifest, configuration path, and client bridge with the verified DSH contract ([#27](https://github.com/BotHarness/BotHarness/pull/27)).

### Documentation

- Published the bilingual documentation site with maintained BotHarness architecture and product language, plus a stable DSH/Cordis Context and Decision Tree for plugin developers ([#26](https://github.com/BotHarness/BotHarness/issues/26), [#88](https://github.com/BotHarness/BotHarness/pull/88), [#90](https://github.com/BotHarness/BotHarness/pull/90), [#92](https://github.com/BotHarness/BotHarness/pull/92)).
