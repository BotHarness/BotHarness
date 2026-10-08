# @botharness/ingest

`t.botharness.ai`: a stateless Hono Worker that forwards PostHog ingestion and `posthog-js` assets to PostHog Cloud US, so the product site and the plugin's telemetry only talk to our own domain (ADR-0132). It works where PostHog hosts are slow or blocked and survives ad blockers that filter them.

- `/static/*` and `/array/*` (library and remote config) go to `us-assets.i.posthog.com`; everything else goes to `us.i.posthog.com`.
- Browser calls are allowed from `deepseekbot.botharness.ai`, its preview URLs and `localhost`; the plugin Host calls from Node without CORS.
- Our cookies never reach PostHog and PostHog cannot set cookies on our domain. The client address is passed as `X-Forwarded-For` for country lookup and the cookieless daily hash; the PostHog project discards it ("Discard client IP data").

```bash
pnpm --filter @botharness/ingest dev         # local
pnpm --filter @botharness/ingest run deploy  # needs wrangler login on the botharness.ai account
```

In the PostHog project, also enable cookieless server hash mode, which the site's `cookieless_mode: 'on_reject'` requires.
