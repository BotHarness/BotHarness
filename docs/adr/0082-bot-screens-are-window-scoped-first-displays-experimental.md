---
Status: Accepted
Date: 2026-09-28
---

# Bot Screens are window-scoped work surfaces; per-Bot displays are an experimental opt-in

A **Bot Screen** starts as the windows one PersonaBot owns on the shared desktop: the provider scopes observation and action to that set, attributes every action in the audit, and — when the Human watches — places those windows on their own X11 workspace so the viewer can switch between Bots. **Per-PersonaBot virtual displays** (each Bot its own `Xvfb :N`, driver, and browser) are an experimental opt-in in Bot settings, not the default.

Measured on 2026-09-28: XFCE unmaps windows on non-current workspaces, so a Bot whose workspace is not displayed cannot be observed or verified — the workspace model is a **sequential** work surface, not a parallel one. That boundary is why per-Bot displays exist: they are the only way several Bots work in parallel, matching the reference product's "each Bot gets its own screen". The cost playbook for that mode is recorded in `docs/research/2026-09-28-multi-display-cost-reduction.md`: cap the primary `Xvfb` geometry (measured ~~490 MB, once; the actual resolution then continues to drive encoding CPU and screenshot size, with 1280×800 the preferred default and 1024×768 the floor), a light window manager per display instead of XFCE (~~-280 MB per Bot), lazy display+driver creation with idle reaping (~50 MB idle floor), one Chromium per Bot (hard constraint, ~200–230 MB each: windows cannot span X displays and one `user-data-dir` admits one process), a single Selkies that follows the watched display, `Xvfb` without GLX, and headless Chromium for non-visual work.

One decision is deliberately left to the experimental design: shared logins. Per-Bot Chrome profiles do not share cookies, so the mode must either sync sessions (for example through CDP) or abandon the shared-login semantics that both the container default and the reference product provide; silently breaking shared logins is not acceptable.

## Why

- The window-scoped surface costs nothing new, delivers ownership, audit attribution, and a Human-visible organization immediately, and is required by both modes anyway.
- The measured unmap boundary makes "workspaces give parallel work" false; without that fact the container would silently fail multi-Bot expectations.
- Per-Bot displays cost roughly 0.4–0.8 GB per active Bot while the container already runs near its 2 GB default, so they must be a knowing Human choice with a budget, not a default.
- The login trade-off changes product semantics; it deserves its own decision rather than being inherited from a display optimization.

## Considered options

- **Per-Bot displays by default** — rejected: cost and the shared-login trade-off are too large for a default.
- **Window scoping only, never displays** — rejected: the product model includes parallel per-Bot screens; the path stays recorded with its playbook.
- **Browser contexts (CDP) as the screen model** — rejected: isolates only the browser; a Bot Screen covers any application.

## Consequences

- The container stack gains what window scoping needs (workspace tooling or the driver's own space model) now, and the per-Bot display path is gated behind an experimental switch.
- Bot settings gains the experimental toggle with its memory budget surfaced; the container default memory becomes a follow-up decision.
- The C-mode login strategy is an open item to settle in the experimental design.
- The research playbook is the cost baseline; new measurements replace estimates there, not in this record.
