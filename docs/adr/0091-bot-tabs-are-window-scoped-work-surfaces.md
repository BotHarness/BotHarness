---
Status: Accepted
Date: 2026-09-29
---

# Bot Tabs are window-scoped work surfaces on the shared Bot Browser

A **Bot Tab** is the window and tabs one PersonaBot owns on the Bot Browser. Each PersonaBot works in its own dedicated window of the one shared browser process; its tabs live there, idle windows are closed, and observation, action, and audit are scoped to its owned tabs. Tab ownership is a **visibility scope, not a security boundary** — every Bot Browser tab shares the profile's cookies and sign-ins, and the isolation boundary is the profile, never a PersonaBot (ADR-0051's shape applied to the browser). The Human never lends a tab: there is no borrow/return, because the Bot Browser's own persistent profile already carries the sign-ins the Bots use, and the Human's daily browser is a different browser.

Background operation is what makes one browser enough for many Bots: CDP targets act without taking the foreground, with focus emulation only where a page needs it, so several Bots work in parallel tabs — the property the desktop workspace model lacks (ADR-0083).

## Why

- Per-Bot windows give every Bot an obvious, Human-watchable work surface, and make takeover, observation, and audit attribution map one-to-one to what the Human sees.
- Windows are cheap because they share the browser process; the expensive unit is the browser instance, which is why the profile runs exactly one.
- Borrowing Human tabs would add confirmation overlays and overlapping ownership for no login benefit; the sign-in story lives in the Bot Browser profile instead.
- Stating the visibility-not-boundary property prevents a later reader from treating tab ownership as isolation.

## Considered options

- **One shared window with mixed Bot tabs** — rejected: weak ownership signal; takeover and audit ambiguity.
- **Tabs in the Human's current window** — rejected: most intrusive; the Bot Browser must never require the Human's window.
- **Per-PersonaBot browser instances** — rejected at the mechanism level (ADR-0089); tabs already parallelize.
- **Borrow/return of Human tabs** — deferred; revisit only with the extension route.

## Consequences

- The Browser entry lists each Bot's window and tabs, and Browser Takeover targets one Bot's tabs.
- A Human closing Bot tabs is normal: the Bot re-observes before its next action and reports a readable error if a tab is gone.
- The shared-cookie property is accepted and documented: the provider scopes observation and action to owned tabs, but the real boundary is the profile — a PersonaBot is not a security boundary.
