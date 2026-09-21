# DeepSeekBot Changelog

Notable changes to DeepSeekBot are recorded here. See the
[Release Ledger guide](docs/agents/changelog.md) before adding or publishing an entry.

## [Unreleased]

Advances the first PersonaBot workflow with Assignment delivery, shared motion controls, and a channel composer island.

### Added

- Added an optional Computer plugin: a profile-scoped shared Linux desktop that runs locally in Docker and appears in the DSH Web Client as an authenticated VNC panel, with explicit authorization for start and stop, live image-pull progress, idle stop, and one-file export/import of the Computer's persistent store; PersonaBot binding and a Settings-based directory picker remain follow-up slices ([#150](https://github.com/BotHarness/BotHarness/issues/150)).
- Added the Channel sidebar shell: Bot mode's right region now renders ordered, collapsible entries (group members, DM Assignments) registered through one client-side seam ([#156](https://github.com/BotHarness/BotHarness/issues/156)).

- Added the first Human-testable PersonaBot Assignment tracer bullet: a PersonaBot can receive a DM through its durable Bot Inbox, run an Orchestrator plus an independent Assignment Session, explicitly send the Assignment result back to the same Channel, and expose Assignment list/detail views; default Memory and Workspace Grant behavior remain follow-up work in [#81](https://github.com/BotHarness/BotHarness/issues/81).
- Added a persistent BotHarness motion preference with Follow system, Reduce motion, and Full motion modes, including a live accessible preview and one effective policy shared by Client surfaces ([#128](https://github.com/BotHarness/BotHarness/issues/128)).
- Reworked the DM and group Channel composer as a responsive floating island with multiline input and an accessible, projection-only PersonaBot activity region ([#129](https://github.com/BotHarness/BotHarness/issues/129)).
- Added deterministic, read-only GitHub Release draft preparation for the independent DeepSeekBot and DSH Skill release trains ([guide](docs/agents/changelog.md#preparing-a-github-release-draft), [#103](https://github.com/BotHarness/BotHarness/issues/103)).

### Changed

- PersonaBot creation now provisions a real Git-backed Memory Repository and the Orchestrator Session runs inside it; reopening a repository never auto-commits a provisional working-tree edit ([#115](https://github.com/BotHarness/BotHarness/issues/115)).
- Removed the model-visible `memory_read`, `memory_search`, `memory_write`, and `memory_list` tools; V1 works through ordinary file, Shell, grep, and git capabilities ([#115](https://github.com/BotHarness/BotHarness/issues/115)).

- PersonaBot DM and group Channels can now be hidden from every roster navigation surface and restored from a searchable `More → Hidden channels` modal without changing their pin, section, order, messages, PersonaBot, or Memory state ([#137](https://github.com/BotHarness/BotHarness/issues/137)).
- Channel and section context menus now expose the same organization controls as drag-and-drop: sections can move up/down, rename, or be safely removed; every group or PersonaBot DM Channel can pin/unpin, move to an existing or newly created section, rename, or hide. Renaming a DM updates the PersonaBot display name while stable internal identifiers remain unchanged; true Channel/PersonaBot deletion remains deferred to [#138](https://github.com/BotHarness/BotHarness/issues/138) ([#10](https://github.com/BotHarness/BotHarness/issues/10)).
- Group Channels and PersonaBot DMs can now be pinned by context menu or drag. An empty pin target stays hidden until a Channel drag begins, then transitions open; dragging a pinned card reveals a dedicated dashed target that unpins and restores its prior placement, while dropping on a specific Channel, section, or section gap unpins it at that predicted position. Ordinary roster whitespace is not a drop target. Legacy PersonaBot-slug pins migrate to Channel ids ([#10](https://github.com/BotHarness/BotHarness/issues/10)).
- The collapsed BOT-mode sidebar now projects every ordered Channel into its 36px rail: pinned Channels appear first behind a divider, followed by the same flattened section/loose order; PersonaBot DMs keep their avatars, group Channels use the hash glyph, and the native hover card shows identity plus the latest message preview ([#10](https://github.com/BotHarness/BotHarness/issues/10)).

- Session listing and PersonaBot activity now resolve through explicit durable Session ownership, including fork and Subagent lineage, instead of cwd or workspace membership ([#80](https://github.com/BotHarness/BotHarness/issues/80)).
- Section headers can now create either a group Channel or a PersonaBot DM directly inside that section, and newly created sections, loose Channels, and section members default to the first position in their scope ([#10](https://github.com/BotHarness/BotHarness/issues/10)).

### Fixed

- PersonaBot DM now previews a reply as the Orchestrator streams an explicit `channel_send` call, then replaces it with the committed Channel message; other committed messages appear without refresh, and reconnects replay missed history ([#141](https://github.com/BotHarness/BotHarness/issues/141), [ADR-0054](docs/adr/0054-channel-live-delivery-follows-durable-commit.md)).
- A running turn no longer reports `needs-repair` while a side effect is in flight; an interrupted attempt is reconciled at boot (side effect started → reconciliation, otherwise retryable) ([#115](https://github.com/BotHarness/BotHarness/issues/115)).
- The Memory tree in the system prompt renders dates only and stays byte-identical across same-day rewrites of the same files, keeping the cached prompt prefix stable ([#115](https://github.com/BotHarness/BotHarness/issues/115)).

- Fixed a pinned Channel drop onto a specific loose position so its preserved pre-pin `topOrder` entry is removed before the predicted position is inserted; unpinning and placement now commit together instead of returning the Channel to its old slot ([#10](https://github.com/BotHarness/BotHarness/issues/10)).
- Aligned the hidden-Channel recovery Modal with the native DeepSeek 380px/24px-inset geometry, tightened its search/list spacing and rows, ordered recoveries most-recently-hidden first, added a 180ms search debounce, and made the whole non-Channel area of a section—including its name label—open the section context menu ([#10](https://github.com/BotHarness/BotHarness/issues/10), [#137](https://github.com/BotHarness/BotHarness/issues/137)).
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
