# ADR-0116: Daily Browser tabs use explicit ephemeral borrowing

- Status: Accepted
- Date: 2026-10-03
- Issue: [#741](https://github.com/BotHarness/BotHarness/issues/741), child of [#725](https://github.com/BotHarness/BotHarness/issues/725)

## Context

ADR-0114 gives managed Local and Container Browsers the same tool capabilities in separate Execution Worlds. Reusing a Human's daily-browser login requires a different boundary: the Human keeps ownership of the tab and explicitly lends one document to one PersonaBot. Launching the default Chrome profile or connecting its debugger would give broader authority than that interaction needs.

## Decision

Add the application-defined `extension` Browser Target, displayed as Daily Browser. The Browser Service owns process-local pairing codes, leases, command deadlines and observation fencing; neither the Registry nor the Operational Database stores borrow authority. Existing Browser Access, trusted Agent/Session ownership, native first-action approval and bounded audit summaries remain the Tool Provider's authority. Only `browser_observe` is registered for this target. Computer Access is independent.

An authenticated Client creates a cryptographically random, one-use, five-minute pairing code for one Bot. A Chrome/Edge MV3 extension redeems it over an HTTP loopback-only WebServer prefix. That prefix checks the actual peer address and extension Origin; lease operations also require a random Bearer token bound to that Origin. It never uses Host cookies. Pairing identifies the Bot without reading the page. The extension separately presents the Bot and current page and requires Share current tab read-only.

The extension uses `activeTab`, `scripting`, session storage and alarms, with host permissions limited to localhost/127.0.0.1. It has no all-sites, cookies, history or debugger permission. Observation reads the shared tab's main document on demand: bounded visible text and control labels, no input values. URL and document ID fence the response. Page text remains untrusted model input.

A lease lasts at most 30 minutes; missing polling for 45 seconds revokes it. Return, any reload/navigation, tab closure, Browser Access removal, target change and Host disposal reject pending observations and invalidate action approval. Pairing and leases disappear on restart; an extension never chooses another tab or re-establishes consent automatically. The Human tab stays open. The worker tracks pending Share navigation and cancels old polls before switching leases.

Use the existing authenticated Connection fetch seam for Human pair/return commands and WebServer prefix registration for extension traffic. DSH's prefix matcher adds its own slash delimiter; register the prefix without a trailing slash. A Connection request's synthetic URL is not a network peer authority. The loopback check belongs at the raw HTTP adapter.

## Consequences

This first slice supports reading an already logged-in tab, not clicking, typing or navigating it. Managed Local/Container targets retain their existing tools and previews. The extension is packaged as unpacked source with an installation guide; store distribution, remote Hosts, multiple tabs and broader interactions require later slices and explicit authority design.

## Verified platform references

- [Chrome activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab)
- [Chrome scripting](https://developer.chrome.com/docs/extensions/reference/api/scripting)
- [Extension network requests](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)
- [Service worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)
- DSH `0.2.0-rc.1` installed WebServer source and the running authenticated Host/Client transport.
