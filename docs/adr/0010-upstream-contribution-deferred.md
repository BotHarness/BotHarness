# Keep self-built capabilities in-repo for now

Bot memory, the reply-scope decision, and the user-facing management UI are implemented as independent modules in this repository rather than submitted upstream immediately. The intent is to keep changes mergeable (thin layer, minimal edits to the base), preserve rebase ability, and decide on upstream PRs once the PoC stabilizes.

## Consequences

We record the dsh-im baseline and maintain a patch list per release so a deferred upstream PR stays feasible (PRD §2.2 P2-2, AC-8.x).
