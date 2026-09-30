---
Status: Accepted
Date: 2026-09-29
---

# Browser use is a profile-scoped managed Bot Browser

BotHarness gives PersonaBots browser use through a **Bot Browser**: one browser per profile, launched and supervised by BotHarness with its own persistent browser profile of cookies and sign-ins, shared by the PersonaBots as owned windows and tabs (ADR-0091). It is not the Human's everyday browser, and 1.0 ships no browser extension. The binary is preferably the Chrome or Edge already installed on the machine, launched with a dedicated `--user-data-dir` and a loopback CDP endpoint — which also sidesteps Chrome's restriction on debugging the default profile — and with the AutomationControlled blink feature disabled so `navigator.webdriver` stays false and the Human can sign in on sites that reject automated browsers; when no suitable browser is installed, a version-pinned Chrome for Testing is installed on demand. It is headed by default — the Human can see it, sign in once through the entry's **Open Bot Browser** action, and operate it directly — with a setting for headless.

The capability ships as an optional standalone bundle, `@botharness/browser`, and owns the whole integration through a BotHarness-owned, application-defined provider: binary discovery and pinning, launch and supervision, the CDP driver, the persistent profile directory under `$DSH_HOME/botharness/browser`, and the sign-in flow. It does not depend on the experimental `@deepseek-ai/dsh-browser-use` service or provider packages: that seam only reserves a provider name, is not composed by default, and would add an experimental dependency for no capability. The Bot Browser starts on first use, stops after the same 30-minute idle window as the Computer, logs launch, stop, and refusals to `logs.db`, and a stopped browser is a readable tool-call error that never threatens Host boot.

Container execution is the same mechanism (Chromium plus CDP on a loopback port) and is deferred; a remote viewer's explicit enable-interaction control belongs to that deferred target rather than the local Pause Bot control (ADR-0090). Only the local target ships first, mirroring ADR-0082's sequencing.

## Why

- One shared browser with independent tabs keeps multi-Bot work cheap and parallel: no per-PersonaBot browser instance (one Chromium per Bot was already a hard ~200–230 MB constraint in ADR-0083), and background CDP targets act without taking the foreground, so tabs replace the sequential desktop-workspace model.
- Driving the Human's everyday browser is not reliably available: Chrome restricts remote debugging on default profiles, and the extension route carries a developer-mode and policy lifecycle — Chrome removed `--load-extension` and can disable unpacked extensions — plus an all-sites debugger grant, a "started debugging this browser" infobar, and manual reloads for updates. The managed browser is the Computer's shape applied to browsing: a profile-scoped shared resource with per-PersonaBot access, session authorization, audit, and a viewer.
- Preferring the installed Chrome keeps the binary maintained by the browser's own updater, with a real brand and fingerprint; the fallback installs a version-pinned Chrome for Testing for machines without Chrome, so the Host is never blocked on a missing browser.
- The costs are accepted explicitly: the Human signs in once inside the Bot Browser instead of inheriting current daily-browser sessions, and anti-automation checks on some sites remain a known limitation.

## Considered options

- **Extension bridge to the Human's browser (BrowserSkill-style borrow/return)** — deferred: strongest login reuse, but a new distribution and trust line (developer-mode sideload, Chrome policy, debugger infobar, DevTools conflicts) that 1.0 deliberately does not take on; revisit only if using the Human's current sessions becomes a hard requirement.
- **Official experimental browser-use service and providers** — rejected: experimental channel, not composed by default, a single global slot with whole-Host activation, and a tool catalog we do not own.
- **Attach to the already-running Chrome over CDP** — rejected: requires relaunching the Human's browser with debugging flags; not a user-installable default.
- **Per-PersonaBot browser instances** — rejected: repeats ADR-0083's memory constraint for no additional capability; tabs already give independent work surfaces.
- **Folding Browser into `@botharness/computer`** — rejected: Browser is an independent capability with its own access switch, tools, audit, and surfaces; the optional-bundle pattern of ADR-0050 keeps "not installed means not there".

## Consequences

- The bundle owns binary discovery and pinning, launch policy, the CDP driver, the persistent profile, and sign-in; browser-profile backup and export stay a later profile-level decision, like Computer Export.
- Browser Access, Authorization, Audit, and Pause land per ADR-0090; per-Bot window and tab scoping per ADR-0091.
- Delivery starts with a read-only browsing slice — open, semantic observe, screenshot — carrying the full access, authorization, audit, and observation plumbing; interaction tools follow.
- If DSH's browser-use seam stabilizes, registering this provider's name on it is a local change; the tool surface and Consumers stay.
