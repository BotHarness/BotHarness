---
Status: Accepted
Date: 2026-09-29
---

# Custom PersonaBot avatars are bounded data URLs served by a read route

A custom PersonaBot avatar must persist across restarts and reconnects, fall back deterministically when missing or corrupt, and never leave a dangling asset reference in an export (#58, #17). We decided the PersonaBot record's `avatar` field stays the single authority: a custom avatar is a bounded `data:image/(png|jpeg|webp);base64,` value produced from a 512×512 crop, encoded as WebP with adaptive quality down to a 128 KiB decoded cap and validated with a magic-byte sniff. The wire read model does not inline those bytes: `botharness/list` and friends carry an authenticated avatar read URL with cache validators, so message-driven roster refreshes do not re-send base64. An absent, invalid, or corrupt avatar deterministically falls back to the identity-seeded Blobatar, remote URLs are rejected, and because the bytes live in `bot.json` no export facet can reference a missing asset (export UX remains #17/#76).

## Considered Options

- **Inline the data URL in list responses** — the group Channel avatar precedent (ADR-0081) — rejected here: roster data is re-read on message traffic, and 512px base64 per PersonaBot per refresh is real cost.
- **A file under the PersonaBot directory** — rejected: it adds orphan and stale-file lifecycle plus export-closure machinery for a ~100 KiB image.
- **A content-addressed asset** — deferred, not rejected: it needs the attachment GC mark set and export closure generalized first; the record field can migrate later.

## Consequences

- A new authenticated fetch route serves avatar bytes with conditional requests; `PersonaBotSummary.avatar` is a URL rather than raw bytes, and the existing `PersonaBotAvatar` renderer keeps working because it already treats `avatar` as an image source.
- Validation is the analogue of `isGroupAvatar` (bounded, sniffed data URL) on a larger 512px budget; a remote `http(s)` URL can no longer be smuggled in through the field.
- The seed-based Blobatar remains byte-free and identity-derived: it is the fallback, not a stored asset.
