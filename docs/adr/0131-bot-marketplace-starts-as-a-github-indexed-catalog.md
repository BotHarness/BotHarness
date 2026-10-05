---
Status: Proposed
Date: 2026-10-05
---

# The Bot Marketplace starts as a GitHub-indexed catalog

The first Bot Marketplace lists public GitHub repositories instead of hosting uploaded Bots. An author opts in by adding the `botharness-bot` topic to a public repository; a scheduled crawler keeps a catalog of those repositories in Cloudflare D1, the harness opens it in a Marketplace modal, and **Install** creates a fresh PersonaBot from the repository's Git URL through the existing creation path (#298). Platform accounts, uploaded publications, favorites and honest import counts follow in a second phase built on Better Auth. This reverses the order of [#18](https://github.com/BotHarness/BotHarness/issues/18)'s 2026-09-30 contract, which made the authenticated publish/import tracer (#17) the first slice and discovery the last: a browsable catalog of Bots that already exist on GitHub is useful without accounts, and Git-URL creation already proves the install path.

## Phase 1 — GitHub-indexed catalog

- **Opt-in and consent.** A repository is listed only when it is public and carries the `botharness-bot` topic. The topic is the author's consent; removing it, deleting the repository or making it private hides the entry at the next refresh. There is no anonymous submission of arbitrary repositories.
- **Instant inclusion.** Because discovery runs on a schedule, an author can paste their repository URL into the Marketplace to crawl it immediately. The pasted repository must still satisfy the topic rule; the paste only shortens the wait.
- **Presentation.** No manifest is required. The entry uses the repository name as display name, the GitHub description as summary, topics (minus `botharness-bot`) as tags, the README as detail and search text, and the fresh Bot's default generated avatar. An optional committed `.botharness/bot.json` may override display name, avatar path and role badges, keeping the repository root clean. The README also becomes ordinary Memory content after install.
- **Identity.** Entries are keyed by the GitHub repository node ID, so renames and transfers follow the same entry; hidden entries keep their row.
- **Crawling.** Discovery and refresh are separate jobs. Discovery runs a full topic search daily, sliced by repository creation date so each slice stays under GitHub search's 1,000-result cap; adding a topic does not change `pushed_at`, so discovery cannot be incremental on push time. Refresh runs hourly through authenticated GraphQL `nodes` batches of 100 repositories for stars, last push, topics, visibility and archive state, and refetches the README only when the last push changed. A single Worker cron is sufficient at thousands of repositories; batches are shaped so the work can move onto Cloudflare Queues when Worker subrequest or CPU limits, not GitHub quota, become the bound.
- **Storage and query.** A dedicated Worker with its own D1 database (for example `market.botharness.ai`), separate from the product sites. Browsing sorts by stars or last update with keyset cursors; search uses an FTS5 index over name, description, topics and README, ranked by bm25, and is capped at the first 200 results because rank changes across refreshes make cursors unstable. Filtering starts with topics.
- **Detail view.** The modal renders the README as sanitized Markdown, rewriting relative images to `raw.githubusercontent.com`.
- **Install.** Install reuses Git-URL PersonaBot creation (#298): the Host clones the default branch into staging and creates the Bot only after a successful clone, with `origin` pointing at GitHub so ordinary `git pull` updates it. The confirmation shows the latest commit time and abbreviated SHA, plus a disclaimer that third-party repositories may contain harmful files or instructions and that the Bot will read them as Memory.
- **Abuse controls.** URL paste and reporting share a self-hosted proof-of-work challenge (ALTCHA) instead of Cloudflare Turnstile, which is unreliable from mainland China, plus per-IP and per-repository rate limits with escalating challenge cost. **Report** is a one-click action with an optional reason, needing neither an account nor GitHub access. Enough reports from distinct sources hide an entry automatically until an administrator restores it or adds it to a D1 blocklist.
- **No popularity claims.** Phase 1 shows GitHub stars and last commit only. It records no download or import counts, because without sign-in it cannot bind a completed-import receipt to an importer.

## Phase 2 — accounts and uploaded Bots

Better Auth (latest) adds Email OTP sign-up, Passkey sign-in and Google sign-in; signing in is required to upload, favorite and record imports, and requires accepting terms covering privacy of Memory content and liability for installing third-party Bots. Signed-in users can upload a Bot from their local harness — defaulting to the Bot's name and avatar, editable, with tags — for users who do not use GitHub. Imports through the Marketplace button produce completed-import receipts, shown alongside favorite counts; users can view their favorites. The hosted publication contract of #18 (full committed Memory Git repository, excluded internal refs, fresh local identity, read-only Git remote, withdrawal, author-confirmed license, honest metric naming) remains the target for this phase and is re-sliced from #17 after Phase 1 ships.

## Considered Options

- **Authenticated publication first (#18/#17 as of 2026-09-30)** — deferred: it front-loads accounts, email delivery, artifact storage and a Git remote before anyone can browse a single Bot, while public GitHub Memory repositories and Git-URL creation already exist.
- **Anonymous URL submission as the listing gate** — rejected: anyone could list someone else's repository and spam is cheap. The topic proves the owner's intent; the paste box only accelerates a crawl.
- **Required root `bot.md` manifest** — rejected for Phase 1: it clutters the GitHub repository and duplicates the README and repository metadata the crawler already reads.
- **GitHub issue as the report channel** — rejected: GitHub is not reliably reachable for every user, and a report should take one click.
- **Cloudflare Turnstile** — rejected for the same reachability reason; ALTCHA is self-hosted and already proven in a sibling project.
- **Counting Install clicks as downloads** — rejected: without an authenticated completed-import receipt the number would be inflated and indistinguishable from external clones.

## Consequences

- ADR-0019 is superseded where it chose Hyperdrive → PlanetScale and rejected D1, and where it placed the marketplace UI on `botharness.ai` first; Workers, R2 for later artifacts, Better Auth and report-based takedown remain.
- ADR-0020's zip SoulSnapshot without Git history is no longer the sharing unit; #18's full-repository contract already superseded it, and this ADR does not revive it. Phase 1 entries are not SoulSnapshots, Listings or Versions.
- #18 is rewritten to this order; #17 becomes the Phase 2 tracer. Phase 1 needs no Host Memory changes beyond reusing #298 and a Client modal with an install confirmation.
- The Worker needs a GitHub token as a deployment secret, an ALTCHA HMAC key, and an administrator path for the blocklist.
