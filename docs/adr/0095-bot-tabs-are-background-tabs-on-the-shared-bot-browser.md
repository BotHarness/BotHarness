---
Status: Accepted
Date: 2026-09-30
---

# Bot tabs are background tabs on the shared Bot Browser

A **Bot Tab** is a background tab a PersonaBot owns on the shared Bot Browser, not a dedicated window: tabs open with `newWindow: false, background: true, focus: false`, so a Bot never pops a window and never steals focus from the Human. The Human's **Open Bot Browser** action is the only path that creates (and focuses) a window, for sign-in. CDP exposes no tab-group API — grouping tabs is extension-only (ADR-0089's deferred extension route) — so the Browser entry lists a Bot's tabs and previews the focused one instead of relying on window chrome.

Ownership stays by tab (target id): observation, actions, audit, pause, and admission are scoped to a Bot's owned tabs; the profile remains the isolation boundary.

## Why

- A window per Bot stole focus and interrupted Human+Bot parallel work; background tabs keep the Human in control of their own window while the Bot works.
- One shared window matches the product model (one browser, per-Bot tabs; ADR-0051's profile boundary), and the entry's tab list gives the Human the visibility a title bar used to provide.
- Tab groups would give better visibility but are not reachable over CDP; if they become a hard requirement they belong to the extension route.

## Considered options

- **Dedicated window per Bot (ADR-0091)** — superseded in part: focus stealing and window clutter outweigh the visibility benefit once the entry lists tabs.
- **Tabs in the Human's daily browser** — rejected: the separate instance and profile stay the boundary; attaching to the daily browser is not reliably available (Chrome's default-profile debugging restrictions).
- **Extension-based tab groups now** — deferred: a new distribution and trust line for a presentation nicety.

## Consequences

- The entry surfaces the tab list and the focused tab (the #492 redesign); window-based visibility copy is removed.
- **Browser Pause** replaces the Takeover copy: pausing stops the Bot without implying the Human needs permission to operate the window.
- The container and remote target keep their own viewer semantics (explicit interaction enable), where a window is the natural unit again.
