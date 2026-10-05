# @botharness/market

The Bot Marketplace Worker ([ADR-0131](../../docs/adr/0131-bot-marketplace-starts-as-a-github-indexed-catalog.md)). It indexes public GitHub repositories that carry the `botharness-bot` topic into its own D1 database and serves the catalog to the BotHarness Host.

## API

| Route                                                                                                                | Result                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /v1/bots?limit=&cursor=&sort=&q=&topic=`                                                                        | Listed entries. `sort=updated` (default, newest push first) or `stars`, keyset paged by an opaque `nextCursor`. `q` (≤ 100 characters) ranks name > description and topics > README with FTS5 trigram (terms under 3 characters fall back to substring match ordered by stars), first 200 matches only. `topic` filters by one GitHub topic. `400` `invalid-sort`, `invalid-query`, `invalid-cursor`                                          |
| `GET /v1/topics`                                                                                                     | `{ topics: [{ topic, count }] }`, the 30 most used topics among listed entries                                                                                                                                                                                                                                                                                                                                                                |
| `GET /v1/bots/{id}`                                                                                                  | `{ bot, readme, commitSha }` for a listed entry (`id` is the GitHub node ID), else `404 bot-not-found`. `readme` is Markdown with relative images rewritten to `raw.githubusercontent.com` and links to `github.com/…/blob` at `commitSha` (or the default branch), common README HTML (`img`, `a`, `br`) turned into Markdown, other tags, comments, scripts and non-`http(s)`/`mailto` URLs removed                                         |
| `GET /v1/challenge`                                                                                                  | An HMAC-signed ALTCHA challenge (`no-store`). Its cost (`maxnumber` 50,000 / 250,000 / 1,000,000) rises with the challenges the same source requested in the last 10 minutes. `503 challenge-unavailable` without `ALTCHA_HMAC_KEY`                                                                                                                                                                                                           |
| `POST /v1/submissions` `{ "url": "https://github.com/owner/repo", "altcha": "<solution>" }`                          | `201 { bot }`, or `{ error: { code } }` with `challenge-required`, `challenge-invalid`, `challenge-expired`, `challenge-replayed`, `rate-limited` (10 per source per hour), `repository-rate-limited` (one crawl per repository per 5 minutes, with `Retry-After`), `invalid-repository-url`, `repository-not-found`, `repository-private`, `repository-archived`, `repository-missing-topic`, `repository-blocked` or `upstream-unavailable` |
| `POST /v1/bots/{id}/reports` `{ "altcha": "<solution>", "reason"?: "…" }`                                            | `202 { received: true }`. Same challenge refusals, `rate-limited` (20 per source per hour), `invalid-report` (reason over 500 characters), `bot-not-found`. Reports from `REPORT_THRESHOLD` (default 3) distinct sources hide the entry as `hidden_reported`; a second report from one source does not count                                                                                                                                  |
| `POST /v1/admin/blocklist` `Authorization: Bearer <ADMIN_TOKEN>` `{ "id" \| "url", "action": "block" \| "restore" }` | `200 { bot: { id, fullName, visibility } }`. `block` keeps the repository out through paste and discovery (a URL not yet indexed is looked up and blocked); `restore` clears its reports and re-checks it on GitHub. `401 unauthorized`, `400 invalid-admin-request`, `404 bot-not-found`                                                                                                                                                     |

## Abuse protection

Paste and report need a solved [ALTCHA](https://altcha.org/) proof-of-work challenge; the Client solves it with WebCrypto and the Host forwards it, so nothing depends on a CAPTCHA service. A solution is valid once and for 5 minutes. A source is `sha256(ALTCHA_HMAC_KEY + "\n" + CF-Connecting-IP)`; raw IP addresses are never stored, and request events older than an hour are pruned.

| Secret / variable  | Use                                                                                |
| ------------------ | ---------------------------------------------------------------------------------- |
| `ALTCHA_HMAC_KEY`  | Signs challenges and salts source hashes; paste and report are off without it      |
| `ADMIN_TOKEN`      | Bearer token for `/v1/admin/blocklist`; the endpoint refuses everything without it |
| `REPORT_THRESHOLD` | Distinct reporting sources that hide an entry (default 3)                          |

Set the secrets with `wrangler secret put ALTCHA_HMAC_KEY` and `wrangler secret put ADMIN_TOKEN`, and locally in `packages/market/.dev.vars`.

## Sharing presentation: `.botharness/bot.json`

An optional descriptor in the Bot repository. Every field is optional; an invalid file (bad JSON, a wrong type, more than 8 roles, a name over 60 characters, an image path that is absolute, has `..` or a scheme, or is not `.png`/`.jpg`/`.jpeg`/`.webp`) is ignored as a whole and the defaults stay (repository name, no roles, generated avatar).

```json
{
  "name": "BotPixel 像素画师",
  "roles": ["像素画", "头像设计"],
  "avatar": { "image": "assets/avatar.png" }
}
```

`avatar` is either `{ "image": "<path in the repository>" }` (PNG, JPEG or WebP, at most 128 KiB) or `{ "recipe": { … } }` (the generated-avatar recipe a PersonaBot stores in `appearance.recipe`). The Worker reads the descriptor together with the README after each push and shows `name` and `roles` in the Marketplace. The Host reads it again from the cloned tree when installing and applies the avatar, never from the catalog; a symlink that leaves the clone is refused.

## Scheduled crawl

| Cron         | Job                                                                                                                                                                                                              |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0 3 * * *`  | Discovery: full `topic:botharness-bot` search sliced by creation date (every slice under the 1,000-result cap), adds new repositories and hides listed ones that no longer match after a complete scan           |
| `17 * * * *` | Refresh: GraphQL `nodes` in batches of 100 for stars, push time, topics, description, visibility, archived state and head commit; README is refetched only after a push; a failed batch keeps the last good rows |

Each run logs one JSON line (`module: marketplace-worker`, `phase`, counts, `durationMs`). GraphQL refresh needs `GITHUB_TOKEN`. Trigger a run locally with `wrangler dev --test-scheduled` and `curl "http://127.0.0.1:8787/__scheduled?cron=0+3+*+*+*"`.

## Local development

```bash
pnpm --filter @botharness/market db:migrate:local
pnpm --filter @botharness/market dev
```

Set `GITHUB_TOKEN` in `packages/market/.dev.vars` for authenticated GitHub requests. Point a local Host at the Worker with the `botharness-core` plugin config `marketplaceUrl` (default `https://market.botharness.ai`), for example in the Profile `cordis.patch.yml`:

```yaml
- id: botharness-core
  config:
    marketplaceUrl: http://127.0.0.1:8787
```

Production deployment is a separate, explicitly authorized step.
