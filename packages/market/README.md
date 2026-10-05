# @botharness/market

The Bot Marketplace Worker ([ADR-0131](../../docs/adr/0131-bot-marketplace-starts-as-a-github-indexed-catalog.md)). It indexes public GitHub repositories that carry the `botharness-bot` topic into its own D1 database and serves the catalog to the BotHarness Host.

## API

| Route                                                               | Result                                                                                                                                                                                                                 |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /v1/bots?limit=&cursor=`                                       | Listed entries, newest push first, with an opaque `nextCursor`                                                                                                                                                         |
| `POST /v1/submissions` `{ "url": "https://github.com/owner/repo" }` | `201 { bot }`, or `{ error: { code } }` with `invalid-repository-url`, `repository-not-found`, `repository-private`, `repository-archived`, `repository-missing-topic`, `repository-blocked` or `upstream-unavailable` |

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
