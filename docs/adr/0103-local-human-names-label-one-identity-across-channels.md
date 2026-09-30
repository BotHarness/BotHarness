---
Status: Accepted
Date: 2026-10-01
---

# Local Human names label one stable identity across Channels

Roleplay can require the local Human to use different names with different PersonaBots. The application-defined Messaging authority therefore owns one optional default Human display name and optional per-Channel nicknames, while ADR-0078's one stable local Human identity continues to own membership, read positions and Human Inbox attention. Names are labels: Channel nickname overrides default name, which falls back to `Human`; clearing an override restores inheritance. BotHarness plugin settings edit the default, and a Human-participating DM or Group Channel's header menu edits its nickname.

Trusted Human and PersonaBot mentions retain typed stable targets and render current names, including in historical messages. Human labels resolve in the message's source Channel; PersonaBot labels resolve from current PersonaBot identity. Original Source Event content and mention offsets remain unchanged, so renaming neither creates a Source Revision nor repeats notifications, Bot Admissions or wakes. Saved labels may serve as presentation fallback when a target cannot be resolved, never as evidence to retarget by name. Duplicate names are allowed and presentation distinguishes Actor types.

## Considered Options

- **One global name only** — insufficient for the confirmed roleplay scenario across DM and Group Channels.
- **A new Human identity or Inbox for each nickname** — rejected because roleplay names still refer to the same person and should not fragment authorization, reads or pending actions.
- **Let Agent Memory own the current name** — rejected because authors, mentions, receipts and multiple browser windows need the same Host-owned current fact; Memory may still retain ordinary conversational background.
- **Keep saved labels as the primary historical display or rewrite message content on rename** — rejected because the chosen interaction shows the current name by ID while preserving the original Source Event.

## Consequences

- UI and Bot-facing current Channel context share the same name resolution; previously assembled DSH model input and Session events remain execution history.
- Existing default `Human` member labels do not count as explicit nickname overrides. This ADR defines the target; current per-Channel labels and saved-label rendering require later implementation.
- Names confer no authority or roleplay instruction. Saved Human Persona backgrounds, external identity mapping and multi-Human login remain outside this design.

## References

- ADR-0078, ADR-0046 and ADR-0036.
- [Documentation #616](https://github.com/BotHarness/BotHarness/issues/616), [Human Inbox #126](https://github.com/BotHarness/BotHarness/issues/126).
