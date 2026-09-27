---
Status: Accepted
Date: 2026-09-28
---

# Computer Access is per-PersonaBot; Computer Authorization is session-scoped and Human-owned

**Computer Access** is a durable per-PersonaBot preference, default off, stored on the PersonaBot record so it survives restart, export, and import. When it is on, the Computer Tool Provider registers its tools and guidance only in that PersonaBot's session scopes — its Orchestrator session and its Assignment sessions — and only while the provider is composed. Turning it off disposes the registration and aborts in-flight calls. No other PersonaBot and no Human session ever sees the tools. The toggle lives at the top of the Computer entry in that PersonaBot's Channel sidebar.

**Computer Authorization** is the once-per-session Human approval before that PersonaBot's first Computer action; it is requested through the native approval path and renders in the Bot DM. A profile-level auto-allow switch skips asking. Access decides whether tools exist; Authorization decides whether they may run; the two are independent.

**Computer Audit** records every Computer observation and action attributed to the PersonaBot, session, and root role, with a per-tool summary, outcome, and duration. Typed text and screenshots never enter the audit; screenshots exist only as model attachments. Known-type SessionEvents join the audit with Bot Screen in the next slice.

## Why

- The Computer is profile-shared (ADR-0051), but acting on it is a per-PersonaBot decision. A profile-wide tool injection would put the catalog into every PersonaBot's prompt, remove the Human's ability to withhold one Bot, and blur audit attribution.
- DSH already owns approval semantics and the Bot DM already renders tool approvals (#126); a bespoke confirm or a per-action prompt would either bypass that path or make ordinary work unusable.
- The audit is the Human's answer to "which Bot did what on the Computer"; it must be useful without becoming a credential or screenshot store.

## Considered options

- **Profile-wide access** — rejected: every PersonaBot carries the tools; the Human cannot withhold one.
- **Browser-local access flag** — rejected: not durable, invisible to the Host, lost on export/import.
- **Per-action approval** — rejected: friction with no added protection over a session grant plus audit.
- **No audit, or full-text audit** — rejected: no attribution answer, or a credential leak into logs.
