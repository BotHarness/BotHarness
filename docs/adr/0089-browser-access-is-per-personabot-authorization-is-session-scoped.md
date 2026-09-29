---
Status: Accepted
Date: 2026-09-29
---

# Browser Access is per-PersonaBot; Browser Authorization is session-scoped and Human-owned

**Browser Access** is a durable per-PersonaBot preference, default off, stored on the PersonaBot record so it survives restart, export, and import. When it is on, the Bot Browser's tools and guidance are registered only in that PersonaBot's session scopes — its Orchestrator session and its Assignment sessions. Turning it off disposes the registrations and aborts in-flight calls. No other PersonaBot and no Human session ever sees the tools. The toggle lives at the top of the Browser entry in that PersonaBot's Channel sidebar and is independent of Computer Access: either capability can be on alone.

**Browser Authorization** is the once-per-session Human approval before that PersonaBot's first browser action; it is requested through the native approval path and renders in the Bot DM, with the usual one-time and always choices and the profile-level auto-allow switch. Access decides whether tools exist; Authorization decides whether they may run.

**Browser Audit** records every browser observation and action attributed to the PersonaBot, session, and root role, with a redacted per-tool summary including the URL, outcome, and duration. Typed text enters only as its character count; page contents and screenshots never enter the audit — screenshots exist only as model attachments. **Browser Takeover** pauses one PersonaBot's browser actions and disables model-facing screenshots for its duration, and any Human input always invalidates that PersonaBot's older observations so its next action re-observes. One PersonaBot's browser actions run serialized; different PersonaBots act in parallel.

## Why

- The Bot Browser is profile-shared (ADR-0088), but acting in it is a per-PersonaBot decision; a profile-wide injection would put the catalog into every prompt, remove the Human's ability to withhold one Bot, and blur audit attribution.
- Human and Bot act in the same real browser: without takeover and observation invalidation, a Bot could act on a stale view over the Human's shoulders. Computer Takeover already models pause plus no model screenshots; the per-Bot scope follows from tabs being per-Bot (ADR-0090).
- Serializing one Bot's actions prevents its Orchestrator and an Assignment from interleaving actions on the same tab; per-tab locking is the recorded refinement if parallel tool calls become common, and it needs no vocabulary change.
- The audit is the Human's answer to "which Bot did what in the browser" and must stay useful without becoming a credential or screenshot store; the existing approval card and Tool Approval Rules already cover "always allow".

## Considered options

- **Profile-wide access** — rejected: every PersonaBot carries the tools; the Human cannot withhold one.
- **The switch as blanket permission (no session authorization)** — rejected: contradicts the Computer's Human-owned authorization and the product's ask-when-it-matters behavior.
- **Per-site or per-action policy** — rejected for 1.0: friction and surface with no evidence it beats one session grant plus audit; the classifier seam stays available.
- **Silent coexistence with no takeover** — rejected: no way to pause an autonomous Bot on the shared browser; observation invalidation still applies outside takeover.

## Consequences

- Browser Access joins the PersonaBot record next to Computer Access; the Browser entry owns the switch, the observation view, and the takeover control.
- Audit rows land in `logs.db` alongside lifecycle lines, so the Human can attribute and replay without reading page content.
- Approval Rules persist "always" decisions; the auto-allow switch mirrors the Computer's.
