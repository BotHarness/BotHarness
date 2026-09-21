---
Status: Accepted
Date: 2026-09-21
---

# A Computer is a profile-scoped shared resource; PersonaBots are not a security boundary

A PersonaBot's value comes from handing work to another PersonaBot without repeating logins or moving files. If every PersonaBot had its own desktop and browser identity, handoff would require re-authenticating and copying state, so BotHarness assigns **one Computer per profile** whose files, browser profile (cookies and logins), and CLI credentials every PersonaBot of that profile shares.

## Decision

- **Computer** is a profile-scoped durable resource, not a PersonaBot-owned one. Its isolation boundary is the profile (the same boundary as the DSH Host and the Human's account); isolation is never per PersonaBot.
- A PersonaBot's work surface on a Computer is its **Bot Screen**: the windows and tabs it opened. Observation and action are scoped to its owned windows at the tool layer; the desktop itself is not partitioned.
- Window ownership is a **visibility scope, not a security boundary**. A shell inside the Computer can observe more than the tool layer allows, and PersonaBots must never be used to separate permissions from each other.
- **Takeover** is computer-wide: it is initiated from one Bot Screen but pauses every PersonaBot acting on the Computer and disables model-facing screenshots until the Human releases it. Audit attributes actions and takeover initiations per PersonaBot; it does not and cannot hide shared credentials from other PersonaBots.
- The browser is one shared process per Computer. Parallel work happens in separate windows, so one PersonaBot's browser failure or navigation can affect the others' windows.
- The Computer's volume is separate from BotHarness Memory Repositories and Workspaces. Moving content between them is an explicit export/import action, never an implicit filesystem path.

## Considered Options

- **Per-PersonaBot isolated browser profiles** — rejected: every handoff would repeat logins, which is the exact friction the shared Computer removes.
- **Per-PersonaBot X11 screens with a self-built login-sync layer** — rejected for v1: it reproduces a known "lost window" defect across screens, requires an unverified cookie-sync mechanism of our own, and buys physical separation that the no-security-boundary rule says we must not rely on anyway. Revisit only if a spike proves the sync layer and a workload demands physical separation.
- **Per-PersonaBot OS users or microVMs** — rejected: it dissolves the shared filesystem and credentials a Computer exists to provide, and contradicts "one computer" as the product story.
- **Per-PersonaBot Takeover** — rejected: input and screenshots are desktop-wide, so pausing only the initiating PersonaBot would leak what the Human types to every other bot.

## Consequences

- "Help it log in" happens once per Computer; every PersonaBot of the profile can reuse that login.
- PersonaBot-level access policy covers Channels and Memory, never the Computer's contents; documentation must state this red line.
- The roster's per-PersonaBot view shows a Bot Screen onto the same Computer, not an isolated machine.
- A future cloud or VM Computer Provider must preserve the same profile-scoped sharing semantics, not silently introduce per-bot isolation.
