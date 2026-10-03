# ADR-0122: Daily Chrome Profile control uses explicit persistent pairing

- Status: Accepted
- Date: 2026-10-04
- Issue: [#774](https://github.com/BotHarness/BotHarness/issues/774)
- Supersedes: ADR-0121 only for the new `profile-control` target; existing single-document grants retain ADR-0121.

## Context

The Human wants to pair a Chrome Profile once, then permit a PersonaBot to use its ordinary webpage tabs through Browser Access, without lending every navigated document again. The official Playwright extension scopes clients to tab groups; its connection bypass token does not grant all existing tabs.

## Decision

The application-defined Browser Provider selects a separate first-party MV3 extension adapter for `profile-control`. Its curated Tools are tabs list/select, open (navigate the selected tab, including reload), observe, ref-based type and click. Browser/extension pages and private tabs are excluded. This slice does not claim screenshot, keyboard, scroll, upload, tab creation/closure or full managed Browser parity.

One Chrome Profile pairs explicitly to the local DSH Host. The Browser Plugin owns a durable origin-bound token hash in its existing application persistence directory; the extension stores the bearer credential privately in `chrome.storage.local`. A single-use five-minute pairing code is generated only through the authenticated Human connection route. Replacing/forgetting pairing revokes the prior credential. Page content cannot read extension storage. Pairing is independent of PersonaBot Browser Access and native Session approval; Computer Access stays separate.

The Host webServer prefix accepts only loopback clients, exact Chrome-extension origins, bounded POST bodies and the paired credential. Only curated operations cross this seam; arbitrary evaluation and CDP passthrough are absent. DSH API Gateway remains the sole `/api` interceptor; existing authenticated Connection Fetch routes serve the Human controls. Tool Registrations remain under trusted Agent Scope. Browser Plugin disposal owns pending commands and route cleanup.

Pairing survives Host/browser restart. Selected tabs, Session approval, element refs and pending commands are process-local. A new extension connection changes the operation epoch and invalidates Session authorization. Main-document navigation and Human input invalidate refs without expanding or ending the explicitly granted Profile scope. Refs bind to the Bot, selected tab and document, retain original element identities in the isolated world, and cannot target a replacement element with the same label.

The Host serializes Profile commands across Bots. Pause fences new commands, waits for issued work to finish and invalidates refs before acknowledging; Resume requires fresh observation. Native Browser revocation and target changes fence queued work and late results. Already-issued remote input may complete before revocation is processed; revocation cannot undo a click. There is no fallback to another Profile or Computer.

The first-party extension uses the repository's existing unpacked MV3 distribution pattern, without a new build framework in this tracer. WXT remains an option for a later extension product/build consolidation; Context sharing remains separate v2.0 work.

## Consequences

An explicit Profile-wide scope is broader than single-document control and is labelled in both UI surfaces. Humans may keep the read-only or official single-document modes. Chrome debugger input gives trusted webpage events and its native debugging indicator; unavailable debugger attachment refuses instead of emulating input. Credential hashes and bounded lifecycle diagnostics omit credentials and page-content copies. Chrome store publication and other browsers require separate qualification.
