---
Status: Accepted
Date: 2026-10-10
Issues: [#1328](https://github.com/BotHarness/DeepSeekBot/issues/1328)
---

# DeepSeekBot default-bundles Browser, Computer and the IM Provider

Fresh `deepseekbot` installs shipped only Core and Client, so every new Profile needed hand assembly (workspace links plus profile patch entries) before browsing, computer use, or IM worked. We decided that **the `deepseekbot` package is the install unit and default-bundles every DSH runtime feature — Core, Client, Browser, Computer and the qualified IM Provider — while IM accounts start disconnected and per-Bot Browser/Computer Access stays off until a Human enables it.**

## Decision

- **Umbrella owns composition.** `packages/deepseekbot/cordis.patch.yml` (source) and `cordis.im.patch.yml` (product) insert all six loader rows: `botharness-core`, `botharness-client`, `botharness-browser`, `computer-use` (the official seam from ADR-0079, no config) and `botharness-computer` (`target: local`), plus `xmanrui-dsh-im` in the product patch. Members stay `link:`/`file:` dependencies but are never promoted to top-level Bundles (duplicate loader entry, dsh-dev pitfall 10).
- **Release packs six artifacts.** `publicationOrder` and `PRODUCT_PACKAGES` cover the IM Provider, Browser, Computer, Core, Client and the product umbrella; `verifyProductComposition` requires all six rows and refuses standalone member Bundles with a remove-entry/retain-data message.
- **Upgrade retains data.** Existing Profiles gain the rows through the normal `deepseekbot@<version>` update plus restart; the dev launcher migrates formerly separate Browser/Computer Bundles into the umbrella. Removing a standalone Bundle keeps stored account configuration and credentials.
- **Packaged Profiles carry the workspace build policy.** pnpm 12 refuses unapproved postinstall scripts, and Browser arrives with one (`agent-browser`), so the packaged Profile workspace inherits the root `allowBuilds` adjudication; explicit Profile entries keep precedence.
- **Workers and CLIs stay out.** `market`, `links`, `ingest` (Cloudflare Workers) and `links-cli` (a CLI) carry no `dsh.bundle`/`dsh.client` manifest, so they cannot be Profile composition; they remain separate deployables. Community policy/probe stay operator concerns, out of the default product.

## Considered Options

- **Per-profile hand assembly (status quo):** rejected. It is exactly the failure the issue reports — full functionality required manual links and patch entries after install.
- **Top-level Bundles alongside the umbrella:** rejected. Promoting a member the umbrella patch already inserts fails boot with a duplicate loader entry.
- **Bundling Workers/CLI into the DSH product:** rejected. Without a Bundle manifest they are not Profile composition; shipping them inside the npm tarball would not make them load and would confuse the install unit.

## Consequences

- Fresh installs present Browser, Computer and IM with zero extra installs; IM requires user-supplied app credentials (no silent unauthenticated connections) and per-Bot Access gating is unchanged.
- Any new DSH runtime Plugin joins the umbrella patch, the release package set, and the composition verifier together — one slice, not a layered rollout.
- Changing product inputs still requires re-qualification per ADR-0127.
