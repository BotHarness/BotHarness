# @botharness/market

The Bot Marketplace Worker ([ADR-0131](../../docs/adr/0131-bot-marketplace-starts-as-a-github-indexed-catalog.md)). It indexes public GitHub repositories that carry the `botharness-bot` topic into its own D1 database and serves the catalog to the BotHarness Host.

## API

| Route                                                               | Result                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /v1/bots?limit=&cursor=&sort=&q=&topic=`                       | Listed entries. `sort=updated` (default, newest push first) or `stars`, keyset paged by an opaque `nextCursor`. `q` (≤ 100 characters) ranks name > description and topics > README with FTS5 trigram (terms under 3 characters fall back to substring match ordered by stars), first 200 matches only. `topic` filters by one GitHub topic. `400` `invalid-sort`, `invalid-query`, `invalid-cursor`  |
| `GET /v1/topics`                                                    | `{ topics: [{ topic, count }] }`, the 30 most used topics among listed entries                                                                                                                                                                                                                                                                                                                        |
| `GET /v1/bots/{id}`                                                 | `{ bot, readme, commitSha }` for a listed entry (`id` is the GitHub node ID), else `404 bot-not-found`. `readme` is Markdown with relative images rewritten to `raw.githubusercontent.com` and links to `github.com/…/blob` at `commitSha` (or the default branch), common README HTML (`img`, `a`, `br`) turned into Markdown, other tags, comments, scripts and non-`http(s)`/`mailto` URLs removed |
| `POST /v1/submissions` `{ "url": "https://github.com/owner/repo" }` | `201 { bot }`, or `{ error: { code } }` with `invalid-repository-url`, `repository-not-found`, `repository-private`, `repository-archived`, `repository-missing-topic`, `repository-blocked` or `upstream-unavailable`                                                                                                                                                                                |

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
