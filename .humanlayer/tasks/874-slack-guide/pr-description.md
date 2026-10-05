[Issue #874](https://github.com/BotHarness/BotHarness/issues/874) | [Claim](https://github.com/BotHarness/BotHarness/issues/874#issuecomment-5994275266)

## Why the change

The official docs have no illustrated Slack setup walkthrough, so this adds English and Chinese instructions from application configuration through identity binding, channel authorization and an actual native-thread reply.

## Special things to note

- Merge risk: **Small**; documentation/navigation/media only, reversible by reverting this PR, with no runtime or data migration; review token/scope guidance, screenshot privacy and the public-channel qualification boundary.
- The guide labels the qualified source preview and distinguishes empty setup forms from accepted #868 runtime evidence and #845 shared-Channel evidence; no new app, credential, permission, registry release or website deployment is included.

## Change outline

```text
English + Chinese canonical Slack guide
  → docs catalog / locale navigation / clean .md pages
  → 13 real WebP screenshots (920 KB total)
  → local built HTML, language switch and mobile reading
```

The walkthrough separates application connection, PersonaBot external identity and Channel connector, then covers Manifest creation, Socket Mode, both token types, Bot scopes/events, workspace installation, channel authorization, Inbox-only versus explicit Channel routing, native replies, ordinary harvest/topic following and recovery.

### New guide entry — Chinese desktop, light theme

**Before:** the currently deployed site's Lark guide/navigation has no Slack guide. This is the prior public entry point for a new page, not a deployment of this PR.

![Before: public docs navigation without Slack](https://raw.githubusercontent.com/BotHarness/BotHarness/718c20963bdcd5148554feae581a567d7031e3b7/docs/assets/pr/874-slack-guide/before.webp)

**After:** the locally built Slack guide appears alongside Lark, with the three settings distinguished.

![After: Chinese Slack guide and navigation](https://raw.githubusercontent.com/BotHarness/BotHarness/718c20963bdcd5148554feae581a567d7031e3b7/docs/assets/pr/874-slack-guide/zh-light.webp)

### Same guide state — dark theme and mobile

![Chinese guide in dark theme](https://raw.githubusercontent.com/BotHarness/BotHarness/718c20963bdcd5148554feae581a567d7031e3b7/docs/assets/pr/874-slack-guide/zh-dark.webp)

![Chinese guide at 390 × 844](https://raw.githubusercontent.com/BotHarness/BotHarness/718c20963bdcd5148554feae581a567d7031e3b7/docs/assets/pr/874-slack-guide/mobile.webp)

### Real setup and retained integration result

The actual empty onboarding form identifies the Manifest and two credential fields; it is not proof of a new connection.

![Actual Slack onboarding](https://raw.githubusercontent.com/BotHarness/BotHarness/718c20963bdcd5148554feae581a567d7031e3b7/apps/docs/public/guides/slack/01-onboarding.webp)

The accepted #868 installed-product source and independently visible native model replies show what successful verification looks like. This documentation task reuses that completed E2E instead of changing the running receiver or repeating its actions.

![Actual handled source and original report](https://raw.githubusercontent.com/BotHarness/BotHarness/718c20963bdcd5148554feae581a567d7031e3b7/apps/docs/public/guides/slack/10-source.webp)

![Actual same-thread model replies](https://raw.githubusercontent.com/BotHarness/BotHarness/718c20963bdcd5148554feae581a567d7031e3b7/apps/docs/public/guides/slack/11-native.webp)

Validation: docs build generated 326 pages; four relevant language/sidebar/design/ledger test files passed **37 tests**. Lint, bilingual ledger, focused formatting and diff checks passed. Both HTML pages, clean Markdown siblings and all 13 images return 200; browser checks show every image loaded, correct EN/中文 navigation, matched light/dark states and no Chinese mobile overflow. Chinese OG font regenerated. [Capture provenance and reproduction notes](https://raw.githubusercontent.com/BotHarness/BotHarness/718c20963bdcd5148554feae581a567d7031e3b7/docs/assets/pr/874-slack-guide/README.md), [bounded proof](https://raw.githubusercontent.com/BotHarness/BotHarness/718c20963bdcd5148554feae581a567d7031e3b7/docs/assets/pr/874-slack-guide/proof.json).

Closes #874.

Agent-Task: `codex/local/01a0f14c-5338-7020-853b-0fe54b87aa95`.
