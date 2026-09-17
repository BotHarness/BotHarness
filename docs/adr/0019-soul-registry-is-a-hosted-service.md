# The Soul registry is a hosted service

SoulSnapshots need ownership, upload validation, quotas, and object storage, so sharing a PersonaBot at scale is a hosted service rather than a static directory of links: the registry runs on Cloudflare Workers with Hyperdrive → PlanetScale (MySQL, Drizzle ORM) for metadata and R2 for snapshot objects, accounts come from BetterAuth (email OTP via Cloudflare Email + Google), and the marketplace UI lives on `botharness.ai`. Phase 1 shares single bots only (bot sets are deferred), publishing is public by default with automated upload gates and takedown-on-report instead of pre-review, and the in-harness one-click share waits until the website flow has proven the pipeline.

## Considered Options

- **Repo as database (PRs + static site, the grokbot.dev model)** — rejected: no accounts, no upload validation, no quotas, no object storage; submitted packages would still need a host.
- **Cloudflare D1** — rejected: snapshot blobs belong in R2, and relational metadata wants PlanetScale/MySQL behind Hyperdrive.
- **Pre-review of every public listing** — rejected for phase 1: no moderation capacity. Automated gates run instead — schema/version check, file-type allowlist, zip-bomb and size limits, M8-style secret scan with hard reject — plus report → takedown → ban.
- **Agent/MCP-driven publishing** — deferred: publishing stays a human action. A future plugin may prepare a snapshot and open the review UI, but never complete a publish on its own.

## Consequences

- The marketplace is dynamic; `apps/docs` stays the static docs surface, and the registry is a separate Worker/service behind the same domain.
- GitHub is not an identity path: handles are chosen in the registry (email never public) and form the `@handle/slug` namespace.
- Public listings are free; private snapshots and excess size/volume are the paid tier, so the schema reserves `plan`/`quota` from day one.
- Every publish surface (website first, harness plugin later) validates the same package rules in one place — the registry API.
