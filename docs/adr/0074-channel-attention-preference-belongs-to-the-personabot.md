---
Status: Accepted
Date: 2026-09-27
---

# A PersonaBot owns its Channel attention preference

The per-Channel attention preference belongs to the PersonaBot. It may read and change how a joined Channel reaches it through its own tools, including the digest parameters, and a change applies to subsequent admissions. The Human can inspect and override the same preference. Four presets express it, with `digest` as the default for a newly joined Channel: `all` (every ordinary message becomes immediate attention), `digest` (ordinary messages join the Wake Policy digest at the configured count and interval), `mentions` (ordinary messages enter this Bot's Inbox without waking it; a direct mention may bring a bounded selection of that Channel's pending ordinary messages into the same turn), and `silent` (ordinary messages enter this Bot's Inbox but neither wake it nor ride a direct-mention turn; only an explicit Bot read surfaces them). The preset active when a message arrives is recorded on its Admission so later preference changes do not retroactively change that message's delivery. Direct addresses — a mention or a DM — always reach the PersonaBot and are not silenceable by this preference; absolute quiet means leaving the Channel. `count` and `interval` are part of the preference: the Bot may tune how often it checks a Channel, and the Human may change the same values.

## Why

Attention is what a person manages for themselves. A colleague decides which rooms to watch closely and how often to look, and may need a high check frequency for one important Channel and a silent record elsewhere; a PersonaBot should not need its Human to open settings for this (ADR-0076 puts the policy in the Bot's hands with Human override). The four presets keep one simple surface instead of exposing Wake Policy internals: the Host still owns wake evaluation and delivery (ADR-0025, ADR-0077), and membership, subscription, and wake remain separate relationships (ADR-0036).

## Considered options

- **The Human owns the preference alone** — rejected: every noisy Channel becomes a Human settings task, and it contradicts treating the PersonaBot as a person.
- **Only three Lark-like presets (all / mentions / none)** — rejected: digest is the useful middle for ordinary chatter and already exists.
- **No `all` preset** — rejected: a Bot must be able to watch a Channel promptly when that is the Channel's point.
- **A separate `muted` that removes attention entirely** — rejected: `silent` already records without waking, and absolute quiet means leaving the Channel.
- **Preset only, with count and interval owned by the Host** — rejected: check frequency is the substance of the preference for a person; the Bot and the Human share the values.

## Consequences

- The preference object carries four modes plus count and interval; the existing three values remain valid and `digest` becomes the default for new memberships.
- Ordinary messages admitted under `mentions` remain visible as pending, with a distinct wake explanation from `silent`. A direct mention may bring them into the same Channel's bounded context; it does not make them independent wake triggers. `silent` messages require an explicit read. Previously stored `mentions` messages with no Admission remain Channel history, not fabricated pending Inbox events; the migration and any optional backfill must preserve that provenance.
- The Bot gets tools to read and set it (ADR-0076); the Human's member-sidebar control becomes the override and default surface.
- The preference revision continues to participate in every ordinary admission (ADR-0025); changes apply prospectively.
- CONTEXT's **Bot Channel subscription** entry is rewritten to the four presets and PersonaBot ownership.
