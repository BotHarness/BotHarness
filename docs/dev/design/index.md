# Design

Design keeps only the integrated architecture and canonical product language. Mutable planning snapshots such as platform specs and app PRDs are not published as parallel authorities; durable choices belong in [Architecture Decisions](/dev/adr), and the living architecture integrates their current result.

- [Living architecture](/dev/design/architecture): system context, deep modules, authority, persistence, and data flow.
- [BotHarness Product Context](/dev/design/context): the single authority for PersonaBot, Channel, Source Event, Bot Inbox, Orchestrator Session, Assignment Session, and other BotHarness terms, distinct from DSH and Cordis vocabulary.
- [Bot runtime architecture](/dev/design/bot-runtime): the focused relationship between BotHarness product objects and DSH execution.

These pages are normative design sources. For the currently implemented code surface, use [Reference](/dev/reference).
