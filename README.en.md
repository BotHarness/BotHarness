<div align="center">
  <img src="packages/client/assets/bot/deepseekbot-transparent.png" width="112" alt="DeepSeekBot mascot" />

# BotHarness

[中文](README.md) ｜ **English**

[![MIT license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Development status](https://img.shields.io/badge/status-source%20preview-orange)](#current-status)
[![GitHub stars](https://img.shields.io/github/stars/BotHarness/BotHarness?style=flat)](https://github.com/BotHarness/BotHarness)
[![Documentation](https://img.shields.io/badge/docs-botharness.ai-5865F2)](https://botharness.ai)
[![QQ community: 1125565676](https://img.shields.io/badge/QQ-1125565676-12B7F5)](#community)

**A team of bots, each with its own identity, persona, and memory.**

</div>

BotHarness gives agents a persistent identity inside [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness). Create **PersonaBots** for research, design, or building; talk to them individually or bring them into a Group to work together. Each Bot keeps its own files and history across conversations, sessions, and workspaces.

**BotHarness** is the plugin layer in this repository; **DeepSeekBot** is its first application, with the Bot roster, conversations, memory views, and delegation. It builds on DSH's Plugin, Bundle, and Session capabilities. These are BotHarness product features, delivered as a community plugin.

[Git Memory](#git-memory) · [Groups](#groups) · [Computer & Browser use](#computer-and-browser-use) · [IM identities](#im-identities) · [Try it](#try-it) · [Docs](#docs) · [Community](#community)

<a id="git-memory"></a>

## Git Memory you can inspect

A PersonaBot's Memory is an ordinary Git working tree. Notes, persona, code, and other files remain on disk; uncommitted files are current Memory too. A Bot can explore and update them with file, search, Shell, and Git capabilities. You can also use your own editor and Git tools.

![Mira's Memory evolution in DSH: a branching Git graph and commit history on the right, with the selected exhibit-plan commit showing removed and added lines in the centre](docs/assets/readme/memory-evolution.jpg)

_Real DSH screenshot with fictional exhibit notes. The graph shows a merged research branch; selecting a commit opens its file diff beside the history. [Uncropped capture](docs/assets/readme/memory-evolution-full.jpg)._

- **Memory files** opens a folder tree and file reader, with menus to open or reveal the actual Host files and download their current bytes.
- **Memory evolution** shows branches, commit history, and current changes. Select a commit to read its diff, or inspect an uncommitted change. Choose everyday memory labels or Git terminology.
- **Recovery checkpoints** preserve context for an explicit restore, while Git authorship and history stay intact. Create a Bot from an existing Git repository to reuse its files and history.

A Git remote can be used through normal Git operations; automatic remote synchronization is not a built-in service. [Memory design](docs/architecture/botharness-architecture.md) · [Recovery decision](docs/adr/0097-memory-recovery-checkpoints-separate-provenance-from-git-authorship.md)

<a id="groups"></a>

## Bring your bots into a Group

Start with different colleagues: a researcher who remembers evidence, a designer who develops the experience, and an engineer who checks the details. Group messages retain each Bot's identity; use direct mentions when you want a particular Bot's attention.

![Group member invitation in DSH, with Nova selected to join Mira and Theo in the fictional Observatory Studio](docs/assets/readme/group-invite.jpg)

_Open Members → Invite member, search or select a PersonaBot, then invite it. Bots accept invitations by default without waking the model; a Bot can be configured to decide manually._

![Mira, Theo, and Nova collaborating under their own identities in the Observatory Studio Group, with the member roster visible](docs/assets/readme/group-collaboration.jpg)

_Real model replies in an isolated local Group: Mira recalls visitor needs, Theo proposes a layout, and Nova adds a build-and-check step after reading their replies._

Choose per-member attention: every message, a digest, direct mentions, or silent collection. A Bot can adjust its own Group attention and leave a Group. DMs, Bot-to-Bot conversations, the Bot Inbox, and the Human Inbox keep conversation and follow-up work accessible. For work in a project, grant a Workspace and let a Bot delegate independent **Assignments**, with their own Sessions and reports.

<a id="computer-and-browser-use"></a>

## Computer use and Browser use

| Capability       | What is delivered                                                                                                                                                                             | Setup and boundary                                                                                                                                                                                                                       |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Computer use** | Observe and act on a shared desktop through Cua Driver, with a VNC view and Computer Audit.                                                                                                   | Optional `@botharness/computer` Bundle; the current implementation runs a container desktop and requires Docker. Turn on Computer Access for each Bot; the first action of a Session asks for authorization.                             |
| **Browser use**  | Open and observe pages; click, type, press keys, scroll, wait, take screenshots, upload files, and manage multiple tabs. The sidebar shows the Bot's page and lets a Human pause its actions. | Optional `@botharness/browser` Bundle; runs a managed Bot Browser on the Host. Enable Browser Access per Bot and authorize its Session. Named browser profiles can keep separate login data; Bots assigned to the same profile share it. |

![Existing DSH QA screenshot showing a named Bot Browser profile, a live page preview, and the Pause Bot control](docs/assets/pr/611-browser-profile-names/ui-completed.jpg)

_Reused from the [Browser profile verification](https://github.com/BotHarness/BotHarness/pull/615): the Bot has read a local test page, and the preview and Human controls remain available._

Browser tab ownership controls which page a Bot operates; tabs in a shared browser profile are not a security isolation boundary. Computer and Browser Access are independent. The development launcher includes both optional Bundles, but neither gives a new Bot access until enabled. [Runtime design](docs/architecture/botharness-architecture.md) · [Computer contracts](docs/architecture/computer-runtime-contracts.md)

<a id="im-identities"></a>

## Bots with their own IM identities

The IM direction is to bind a PersonaBot to its own platform bot account, so external messages are sent under that Bot's authorized identity. **Feishu / Lark is the first integration being developed**, using [dsh-im](https://github.com/xmanrui/dsh-im) for transport, credentials, and connection lifecycle.

The boundaries matter today:

- **Delivered, opt-in development path:** Profile binding, explicit outbound grants, and durable send records. Isolated verification uses the pinned temporary [dsh-im fork](docs/adr/0104-isolated-im-profiles-pin-a-qualified-temporary-provider-fork.md); the ordinary upstream npm `4.32.0` package lacks the required public contract. The recorded outbound proof is **provider acceptance**, not proof that a recipient saw or read the message ([#117](https://github.com/BotHarness/BotHarness/issues/117), [#624](https://github.com/BotHarness/BotHarness/pull/624)).
- **In progress:** a real group or Thread `@Bot` entering that PersonaBot's Inbox and Orchestrator, then replying to the same source ([#12](https://github.com/BotHarness/BotHarness/issues/12)). Provider mention/topic qualification has evidence, but that alone does not deliver this integrated workflow.
- **Planned:** external Channel/Inbox Bridges, ordinary-message admission, bounded context reads, and Bot-selected Thread following ([#48](https://github.com/BotHarness/BotHarness/issues/48), [#629](https://github.com/BotHarness/BotHarness/issues/629)). Other IM platforms, including Slack, Discord, QQ, and WeChat, need separate provider qualification; they are not advertised here as available integrations.

See the [optional IM verification setup](docs/client-bridge.md#qualified-optional-im-provider). A default installation does not enable this external messaging path.

<a id="current-status"></a>

## Current status

This is a **source preview**, developed against the pinned **DSH 0.2.0-rc.1**. Local PersonaBot creation, DMs and Groups, Git Memory, Assignment delegation, model plans and usage views, Computer use, and Browser use have merged implementations. They are not a claim that a stable downloadable BotHarness release exists: packages are currently private, and installation below builds from source.

The [bilingual Release Ledger](CHANGELOG.md) records delivered changes; [Issues](https://github.com/BotHarness/BotHarness/issues) and [Projects](https://github.com/BotHarness/BotHarness/projects) track ongoing work. The living architecture includes target designs as well as implementation boundaries, so a design page alone is not a delivery promise.

<a id="try-it"></a>

## Try it from source

Use **Node ≥22** (the repository pins Node 24.21.0) and **pnpm 12.4.2**. Provide a usable model credential before expecting Bot replies. Docker is needed only for the container Computer.

```bash
git clone https://github.com/BotHarness/BotHarness.git
cd BotHarness
pnpm install
pnpm build
node scripts/dev-instance.mjs --home /tmp/botharness-demo --port 31967
```

Choose a fresh `--home` directory for an isolated DSH Profile. The helper uses the worktree's pinned CLI, links the local Bundles, verifies the authenticated API, and prints the local login URL. Open it, select **Bot mode**, create your PersonaBots, send a DM, then create a Group and invite members. Open **Memory files** or **Memory evolution** from a Bot's DM sidebar.

The helper can inject a machine-local DeepSeek key or use the isolated Profile's credentials; keep secrets outside the repository. For model setup, optional IM installation, and the Client/Host development loop, use [the local-instance guide](docs/client-bridge.md#7-本地开发环路dsh-020-rc1).

<a id="docs"></a>

## Documentation and development

- [Documentation site](https://botharness.ai) · [Intro slides](https://botharness.ai/slides/s/botharness-intro)
- [Product language](CONTEXT.md) · [Living architecture and data flow](docs/architecture/botharness-architecture.md) · [Architecture decisions](docs/adr/)
- [Contributor instructions](AGENTS.md) · [Release Ledger](CHANGELOG.md) · [DSH official documentation](https://deepseek-harness.github.io/deepseek-harness/)

```bash
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test
pnpm build
pnpm dev:client    # automatic Client builds for the isolated local DSH Profile
pnpm docs:dev      # documentation at http://localhost:4321
```

For the stable local docs domain, use `pnpm dev` → `https://docs.botharness.localhost` (first run may request trust for its local CA). The no-sudo alternative is `PORTLESS_PORT=8788 PORTLESS_HTTPS=0 pnpm dev`. Documentation pages are generated from repository sources; edit those sources. Slides live in `apps/presentations`; use `pnpm slides:dev` to iterate.

```text
packages/core         PersonaBot identity, memory, Messaging, Inbox, Assignments
packages/client       @botharness/ui: Bot roster and in-harness interaction
packages/computer     optional shared container Computer
packages/browser      optional managed Bot Browser
packages/deepseekbot   DeepSeekBot Bundle
apps/docs             documentation site
apps/presentations    introduction and other slides
```

<a id="community"></a>

## Community

Join the QQ group by searching **1125565676** in QQ. The badge above links here; no verified invitation link or QR code is published. For bugs, feature requests, and development discussion, use [GitHub Issues](https://github.com/BotHarness/BotHarness/issues).

## Inspiration and acknowledgements

- [Grok Bot](https://x.ai/bot): persistent Bots that people can message and delegate work to like teammates.
- [Rakazo](https://github.com/elie222/rakazo): persistent AI teammates, conversations, and memory.
- [deepseek-harness-workbench-plugin](https://github.com/loadingvx/deepseek-harness-workbench-plugin): Memory Git graph rails, commit lists, and diff presentation.
- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): the upstream plugin host.
- [dsh-im](https://github.com/xmanrui/dsh-im), [dsh-lark-link](https://github.com/amlyczz/dsh-lark-link), and [dsh-lark-bridge](https://github.com/imetn/dsh-lark-bridge): IM integration foundations and reliability/routing references.

## License

MIT — see [LICENSE](LICENSE). Third-party works distributed inside the Client Bundle are listed in [THIRD_PARTY_NOTICES.md](packages/client/THIRD_PARTY_NOTICES.md).

## Star History

Live chart for **BotHarness/BotHarness**, using [Star History's official embed](https://www.star-history.com/blog/how-to-use-github-star-history/#how-to-embed-the-chart-in-your-readme).

<a href="https://www.star-history.com/?repos=BotHarness%2FBotHarness&amp;type=date&amp;legend=top-left">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=BotHarness/BotHarness&amp;type=date&amp;theme=dark&amp;legend=top-left" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=BotHarness/BotHarness&amp;type=date&amp;legend=top-left" />
    <img alt="BotHarness/BotHarness GitHub Star History by date" src="https://api.star-history.com/chart?repos=BotHarness/BotHarness&amp;type=date&amp;legend=top-left" />
  </picture>
</a>
