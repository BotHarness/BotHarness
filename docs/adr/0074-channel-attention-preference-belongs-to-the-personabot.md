---
Status: Accepted
Date: 2026-09-27
---

# A PersonaBot owns its Channel attention preference

The per-Channel attention preference belongs to the PersonaBot. It may read and change how a joined Channel reaches it through its own tools, and a change applies to subsequent admissions. The Human keeps ultimate authority: Bot mode can inspect and override the preference for an owned Bot. The product surface keeps three presets, replacing the earlier `all | mentions | muted` wording in CONTEXT: `mentions` (only direct mentions wake it), `digest` (ordinary messages join the Wake Policy digest at the configured count and interval), and `silent` (ordinary messages are recorded as attention with no automatic wake). `all` is not offered because it is the spam-shaped end, and `silent` records rather than discards.

## Why

Attention is what a person manages for themselves; a PersonaBot invited into a Group must be able to quiet it without asking its Human to open settings. Keeping the Human as override preserves accountability for a Bot the Human owns. The three presets keep one simple surface instead of exposing Wake Policy internals: digest timing stays a Host scheduling concern (ADR-0025), and membership, subscription, and wake remain separate relationships (ADR-0036).

## Considered options

- **The Human owns the preference alone** — rejected: every noisy Channel becomes a Human settings task, and it contradicts treating the PersonaBot as a person.
- **The Bot sets raw Wake Policy timing** — rejected: digest timing is a Host scheduling guarantee, not a model choice; the presets select its outcomes.
- **Keep `all` and `muted` presets** — rejected: `all` wakes on every ordinary message, and `silent` already keeps attention without waking, so `muted` adds no distinct behavior.
- **Two separate controls (subscription and ordinary-message wake)** — rejected for now: two knobs for one intent.

## Consequences

- New Bot tools read and set its Channel attention preference; the existing Human control becomes the override and default surface.
- The preference revision continues to participate in every ordinary admission (ADR-0025); Bot changes apply prospectively.
- CONTEXT's **Bot Channel subscription** entry is rewritten to the three presets and PersonaBot ownership.
