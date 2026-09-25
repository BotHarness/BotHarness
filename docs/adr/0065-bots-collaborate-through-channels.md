---
Status: Accepted
Date: 2026-09-25
---

# PersonaBots collaborate through Channels

PersonaBots work together through the same application-defined Messaging authority as Human messages. A Bot-to-Bot DM is a real `dm` Channel with exactly two PersonaBot participants, not a peer relay between DSH Sessions. A Bot's explicit send creates one canonical Source Event and Channel placement; the other Bot's Inbox Admission and delivery work are committed under ADR-0036/0037. The sending Bot does not admit its own output. Trusted Session ownership establishes the sender, while Host membership checks and the Bot-hop guard apply to every Bot-authored send.

A Human–PersonaBot DM remains a two-participant Channel. Selecting `@Bot B` there gives the current Bot A bounded contact context, including B's stable ID and description, in A's prompt. The mention alone neither adds B to that DM nor admits or wakes B. A decides whether to send a separate message to B's Bot-to-Bot DM. The candidate set is all active PersonaBots, and only a selected identity token has this meaning; a typed name cannot choose an identity. This context cannot expose B's full Soul, private Memory, or credentials.

Bot-to-Bot DMs are absent from Human roster navigation by default but remain discoverable for Human read-only inspection. Opening one does not grant Human Channel membership or send authority. Every committed Bot send to a non-Human DM Channel also creates a centered activity chip in the sender Bot's Human DM. The chip identifies the action and links to the read-only conversation; it is emitted for each send and references the committed message rather than copying its content into a second social history. Human intervention requires a separate explicit action.

In a Group Channel, a member PersonaBot may mention other member PersonaBots. Mentions create independent per-recipient Inbox attention from one Source Event; they do not invite a non-member. A PersonaBot may also create a Group Channel and invite other Bots. Invitation is pending until the invited Bot accepts or declines; only acceptance creates membership and its read/send authority. The creating Bot may manage Bot members and Group settings through Host-checked commands. The Human can inspect and override these operations and alone may delete the whole Channel. Bot management cannot change the Human's roster presentation choices or remove Human control.

## Why

The same Channel and Messaging path gives colleagues a shared, inspectable conversation and preserves one content authority. A Human's `@` in a private DM is a request to the addressed Bot to consider a colleague, while a Group `@` addresses another member directly. Keeping these meanings distinct prevents a private DM from silently becoming a group or waking a Bot whom the sender did not contact. Default-hidden, read-only Human inspection makes Bot collaboration observable without turning the Human into a participant or filling the primary roster with internal traffic.

## Considered options

- **Add B to the Human–A DM on `@B`** — rejected: the conversation would stop being a DM, and B would see Human–A content without A deciding to share it.
- **Wake B immediately from Human's `@B`** — rejected: the Human addressed A with contact context; only A's explicit send addresses B.
- **Use a private Session relay or copied Inbox conversation for Bot-to-Bot contact** — rejected: it would bypass Channel history, trusted Messaging authorization, and the canonical Source Event.
- **Show every Bot-to-Bot DM in the main roster by default** — rejected: internal collaboration can be inspected when needed without crowding Human navigation.
- **Make the Human a third DM member for oversight** — rejected: read-only inspection is a distinct authority and does not alter two-party membership.
- **Instantly join an invited Bot** — rejected: invitation and membership represent different decisions; the invited Bot can decline.

## Consequences

- `dm` includes Human–PersonaBot and PersonaBot–PersonaBot pairs. Existing Human DM UI and PersonaBot-specific sidebar entries retain their narrower scope; a Bot-to-Bot DM needs its own read-only Human presentation.
- The default-hidden rule extends Hidden Channel presentation without archiving, muting, or deleting the Channel. The Human can open the conversation for inspection; whether it can be added to the main roster is a later UX decision.
- #254 remains the first Human-authored Group mention slice. #278 tracks the later Bot-to-Bot DM, Human DM contact mention, Bot-authored Group mention, and Bot-created Group invitation/management tracers.
- #46/#47 remain the owners of canonical Messaging and Inbox authority. Channel and invitation commands require trusted Actor context, durable idempotency, post-commit presentation, and recoverable wake.
