---
Status: Accepted
Date: 2026-09-28
---

# Group management keeps Human invitations and avatars on the Channel authority

A Group Channel has one management surface for Human edits to its name, avatar, members, invitations, join requests, and lifecycle. The Member roster lists current members only. A Human invitation is recorded on the existing Channel invitation fact with `inviterHuman: true`, separate from `inviterBotSlug`. It creates the same durable Source Event and Bot Inbox Admission as a Bot invitation. The invited PersonaBot receives no Group membership or history until it accepts, or the existing Bot-mode auto-accept policy accepts on its behalf.

A Human-selected Group avatar is an optional, bounded PNG, JPEG, or WebP data URL on the canonical `ChannelRecord`. The Client crops it to a small square; the Host validates the encoded type and size before writing. Clearing the avatar removes the field. Group name, member removal, and whole-Channel deletion continue to use their existing Channel operations.

## Why

- The Human needs a coherent place to manage Groups without mixing actions and pending requests into the Member roster.
- A Human invitation needs attribution that cannot be confused with a Bot creator or imply a transfer of Bot ownership.
- Group presentation state must survive restart and reach every client through the same Channel projection.

## Considered options

- **A second invitation or avatar store** — rejected: it would create another durable authority and complicate restart and cross-window consistency.
- **Represent the Human as the Bot owner** — rejected: it grants the wrong identity and weakens ownership checks.
- **Browser-local or unbounded avatar data** — rejected: it would disappear across clients or allow oversized Channel records.
