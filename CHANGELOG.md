# DeepSeekBot Changelog

Notable changes to DeepSeekBot are recorded here. See the
[Release Ledger guide](docs/agents/changelog.md) before adding or publishing an entry.

## [Unreleased]

Established a concise, bilingual release history for DeepSeekBot contributors.

### Added

- Added deterministic, read-only GitHub Release draft preparation for the independent DeepSeekBot and DSH Skill release trains ([guide](docs/agents/changelog.md#preparing-a-github-release-draft), [#103](https://github.com/BotHarness/BotHarness/issues/103)).

### Documentation

- Added the canonical Release Ledger, bilingual parity checks, and contributor guidance ([#100](https://github.com/BotHarness/BotHarness/issues/100)).
- Documented the planned PersonaBot DM navigation and renamed the application-defined Work concepts to Assignment, Assignment Session, Assignment Agent, and Assignment Directory; this records design language and does not claim the UI or runtime is implemented ([#109](https://github.com/BotHarness/BotHarness/pull/109)).

## [Development] - 2026-09-20

Consolidated the implemented foundation and public documentation that preceded DeepSeekBot's first release; this is development history, not a released or installable version.

### Added

- Added durable PersonaBot identity, file-based Memory tools, and the BOT-mode creation flow ([#22](https://github.com/BotHarness/BotHarness/pull/22), [#98](https://github.com/BotHarness/BotHarness/pull/98)).
- Added the BOT-mode Channel shell, roster sections, per-scope sorting and drag movement, with durable Host-side arrangement ([#51](https://github.com/BotHarness/BotHarness/pull/51), [#64](https://github.com/BotHarness/BotHarness/pull/64), [#72](https://github.com/BotHarness/BotHarness/pull/72), [#73](https://github.com/BotHarness/BotHarness/pull/73), [#95](https://github.com/BotHarness/BotHarness/pull/95)).

### Changed

- Aligned the plugin manifest, configuration path, and client bridge with the verified DSH contract ([#27](https://github.com/BotHarness/BotHarness/pull/27)).

### Documentation

- Published the bilingual documentation site with maintained BotHarness architecture and product language, plus a stable DSH/Cordis Context and Decision Tree for plugin developers ([#26](https://github.com/BotHarness/BotHarness/issues/26), [#88](https://github.com/BotHarness/BotHarness/pull/88), [#90](https://github.com/BotHarness/BotHarness/pull/90), [#92](https://github.com/BotHarness/BotHarness/pull/92)).
