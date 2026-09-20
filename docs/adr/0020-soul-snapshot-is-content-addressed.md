# SoulSnapshot is an immutable, content-addressed package

Sharing a PersonaBot means freezing its Soul — persona and selected memory — into a SoulSnapshot: a self-contained zip whose entry point is `bot.md` (YAML front-matter manifest + human-written setup instructions), always carrying `PERSONA.md`, and optionally a filtered `memory/` tree. A snapshot is immutable and content-addressed (digest over the archive); the registry stores it in R2 under that digest and models a Listing (`@handle/slug`) as a pointer to Versions (human-named tags → digests), so old versions stay importable for later "clone from a point in time". A snapshot is never a git repo pointer: the local memory repo remains local-only history, and a Soul export materializes the snapshot from a ref (`git archive`, honoring `export-ignore` plus ad-hoc exclusions, then re-scanning the final manifest). Attachments, credentials, sessions, workspaces, bindings, and `.git` history never travel in a SoulSnapshot; ADR-0040 defines a separate PersonaBot Export that may wrap the snapshot with explicitly selected operational facets without changing this registry unit.

## Considered Options

- **Share a repo reference (remote + ref) instead of a snapshot** — rejected: history leaks pre-redaction content, requires a reachable remote, and couples recipients to the sender's git.
- **Mutable listing = live bot** — rejected: recipients need reproducibility and rollback; the registry keeps immutable versions behind a `latest` pointer.
- **Globally unique names** — rejected: collisions and squatting; namespace per handle (Docker-style), display name separate.
- **DRM on `share_policy`** — rejected: honor system plus UI warnings; a re-export must preserve `provenance.upstream` and the original `license`.

## Consequences

- `bot.md` v1 carries: `format` / `format_version` / `kind` (template | handoff | backup) / `exported_at` / `app`; bot identity (slug, display_name, avatar, tags); `includes` (memory none | shared | all | paths, attachments false, git_history false); `redactions[]`; `requires` (plugins/tools — declared, never auto-installed); `license` (public listings default CC-BY-4.0); `share_policy` (allowed | ask | no-redistribution); `provenance` (account, listing, upstream, source_commit).
- Identifier URLs are fixed now even though the harness plugin is later: `botharness.ai/b/<handle>/<slug>` and `botharness://install/<handle>/<slug>@<version>`.
- Import always creates a fresh PersonaBot (new slug/repo, one `source=import` commit); `private` memory never leaves in `template`/`handoff` and is only exportable in a confirmed `backup`.
- Memory rules gain one requirement: every memory write carries a `summary` that becomes the git commit message.
- The Soul registry publishes only SoulSnapshots. Operational facets, provider account references, Service Grant declarations, and Messaging Archives are never registry Versions.
