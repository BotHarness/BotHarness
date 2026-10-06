---
Status: Proposed
Date: 2026-10-06
---

# Anonymous PostHog telemetry and campaign short links

DeepSeekBot measures two things it cannot see today: how the plugin is used, and which marketing posts and videos bring people to the product site. Both go to one PostHog Cloud US project. The plugin sends anonymous, default-on usage events from the Host; the product site sends named interaction events with consent-based cross-day identity; and a separate short-link Worker turns per-post Campaign Links into UTM parameters that PostHog already understands. Telemetry exists to improve the plugin and understand usage, collects nothing that identifies a person or their content, and the code doing it is open source in this repository and `BotHarness/deepseekbot-site`.

## Shared ingestion

- **One project.** Plugin and site events share one PostHog Cloud US project (`DeepSeekBot`, in the organization that already holds the maintainers' other projects), distinguished by a `source` property (`plugin`, `site`, `links`). They are one product's funnel; PostHog's MCP connector reads both.
- **First-party ingest proxy.** Clients never call PostHog domains directly. A small Hono Worker on `t.botharness.ai` forwards ingestion and the `posthog-js` assets to PostHog US. This keeps the site and plugin working where PostHog hosts are slow or blocked (mainland China) and where ad blockers filter them, and lets us change the backend without shipping a plugin release.
- **No stored IP.** The proxy forwards the client address, which PostHog uses for GeoIP and the daily cookieless hash before discarding it ("Discard client IP data" is on). Cookieless events currently carry no country, because PostHog strips their address before GeoIP runs (PostHog issue 48660).
- **Region.** US rather than EU (Vain, 2026-10-06): the data is anonymous with IPs discarded, and the maintainers' existing PostHog organization and its MCP connection are on US Cloud; an EU project would need a separate EU account.

## Plugin telemetry

- **Default on, easy off.** The Host sends telemetry unless the Human sets `telemetry: false` in the plugin config, or the environment sets `DO_NOT_TRACK=1` or `BOTHARNESS_TELEMETRY=0`. The Client shows a one-time notice on first start explaining what is collected, why, and how to turn it off, linking to the privacy page and source.
- **Anonymous Install ID.** A random UUID generated on first start and stored in the plugin's data directory is the only identifier. It is never derived from hardware, accounts or paths, and is never linked to a site visitor.
- **Host only.** Events are sent by the Host, batched, over plain `fetch` to the proxy; the Client sends nothing. Failure to send never affects product behavior and is not retried beyond the next batch.
- **Events.** `plugin_started` (plugin version, DSH version, OS, architecture); `bot_created`, `bot_archived`, `bot_deleted`; `marketplace_bot_installed`; `connector_enabled` (connector type only); `avatar_edited`; one `daily_usage` summary (counts of PersonaBots, Sessions and messages). Per-message events are not sent.
- **Errors.** Unhandled Host errors are sent as PostHog exceptions with error type and a stack whose home-directory paths are replaced; messages, prompts, Memory content and tool arguments are never included.
- **Never collected.** Display names, Persona or Memory content, conversation text, repository URLs, connector credentials or workspace identifiers, file paths, IP addresses.

## Site telemetry

- **Consent with a cookieless fallback.** `posthog-js` runs in `cookieless_mode: 'on_reject'`: a non-blocking bar (Chinese at `/`, English at `/en/`) asks once. Accepting persists an anonymous ID, so a visitor who returns days later keeps their first-touch campaign; rejecting or ignoring still counts the visit without storing anything on the device.
- **Named events, no autocapture.** Pageviews (including `/market` and `/docs`), plus stable named events: `install_tab_switched`, `install_command_copied`, `github_clicked`, `discord_clicked`, `qq_group_copied`, `video_played`, `avatar_downloaded`, `market_bot_opened`, `market_install_clicked`, `language_switched`.
- **Referrers.** An incoming `?ref=<x>` (Product Hunt uses `?ref=producthunt`) is normalized into `utm_source=<x>` before PostHog initializes, so it lands in PostHog's initial-UTM properties alongside short-link traffic.
- **Privacy page.** `/privacy` and `/en/privacy` explain what both the site and plugin collect, why, how to opt out, and link to the source.

## Campaign short links

- **Model.** A **Campaign** (one marketing push, such as a Product Hunt launch) owns many **Campaign Links**. Each link has a short slug, a platform (`bilibili`, `x`, `youtube`, `producthunt`, …), a media type (`video`, `post`, `launch`, …), a target path on `deepseekbot.botharness.ai` and a language. Resolving `go.botharness.ai/<slug>` returns a 302 to the target with `utm_campaign` = campaign slug, `utm_source` = platform, `utm_medium` = media type, `utm_content` = link slug. Targets are restricted to the product site, so the service is not an open redirect.
- **Click capture.** Each redirect increments a D1 counter and sends a server-side `link_clicked` event without a person profile, so clicks are counted even when the visitor blocks the site's script. Conversion and funnel analysis stay in PostHog; the link service does not duplicate it.
- **Service.** A dedicated Hono Worker, `packages/links` in this repository, with its own D1 database, in the same Cloudflare account as `market.botharness.ai`. Its HTTP API is defined once with `@hono/zod-openapi` and published as `/openapi.json`; the admin page, MCP server and CLI all call that API rather than reimplementing operations, following the single-definition idea of Cloudflare's Forge pipeline at our scale.
- **Access.** Humans use a minimal admin page behind Cloudflare Access (allowed e-mails), with no account system of our own. Agents and scripts use Personal Access Tokens created on that page: stored as hashes in D1, prefixed for recognition, scoped read or write, with expiry and revocation.
- **MCP.** The same Worker serves Streamable HTTP MCP at `/mcp`, authenticated with `Authorization: Bearer <PAT>`, exposing Campaign and Link create, update, archive, list and click counts. claude.ai web connectors need OAuth; adding Cloudflare's OAuth provider is the second phase.
- **CLI.** `@botharness/links` on npm (command `bh-links`) is a thin typed client over the published OpenAPI document, authenticated by PAT.

## Considered Options

- **Cookieless only, no consent bar** — rejected: it cannot attribute a visit that converts on a later day, and without accounts that is the only attribution available.
- **Plugin telemetry opt-in** — rejected: opt-in data is too sparse to guide the product; default-on with a first-run notice and standard opt-outs follows common open-source CLI practice (Next.js, Astro).
- **Static `_redirects` rules on the site for short links** — rejected: every new link would need a site deploy from a maintainer's machine, and redirects would not be counted when the visitor blocks scripts.
- **Short links and ingest proxy in one Worker** — rejected: a fault or deploy in either would take the other down.
- **Calling PostHog hosts directly** — rejected for reachability from mainland China and ad-block loss.
- **Attributing plugin installs to campaigns** — not possible without accounts: the install happens inside DSH, not the browser. Installs are reported as totals.

## Consequences

- The plugin config gains `telemetry`; the Client gains a one-time notice; the Host gains a small telemetry module with an injectable sender so tests assert no event carries content.
- The product site gains `posthog-js`, a consent bar, a `ref` normalizer and a privacy page; it stays static assets.
- Two new Workers (`t.botharness.ai`, `go.botharness.ai`) and one D1 database are deployed; the links Worker needs a PostHog project key and Cloudflare Access configuration. Backend code for both follows Hono conventions.
- Delivery follows tracer bullets: proxy and site pageview with `ref` first, then plugin `plugin_started` end-to-end, then the links Worker redirect with PAT API, then the admin page, MCP and CLI.
