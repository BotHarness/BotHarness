# ADR-0120: Daily Chrome control is bound to one selected document

- Status: Accepted
- Date: 2026-10-04
- Issues: [#765](https://github.com/BotHarness/BotHarness/issues/765), [#766](https://github.com/BotHarness/BotHarness/issues/766)

## Context

ADR-0116 lends a Human document read-only. The approved next slice adds explicitly granted input and clicks in an existing logged-in Chrome tab without replacing the managed Local/Container drivers or granting Computer Access. The official Playwright extension supports client tab groups, which are broader than a one-document application grant.

## Decision

The existing application-defined Browser Tool Provider remains the primary Capability seam. Add `daily-control`, displayed as Daily Chrome · Control, beside the unchanged read-only `extension` target. Each Bot gets a cancellable Subprocess running the pinned official Playwright MCP browser connector from `playwright-core@1.64.0-alpha-1790635538000` (`lib/coreBundle.tools.resolveCLIConfigForMCP` and `createBrowserWithInfo`). The corresponding upstream source is `7ad3fba1aad9471c7e46d67a11b0e710a5d77ea8`; the official extension is version 0.4.0, protocol 2. This exported, version-specific connector is an adapter detail, not a DSH native Browser service. No MCP tool catalog, code execution entry point, second model loop or upstream default driver is exposed to the PersonaBot.

The authenticated Connection fetch seam owns connect, grant and return commands. Connect opens the official Human selection page; only one initially selected Page is accepted. The Client projects the selected title and URL with **control not granted**. A separate Human command grants that document to the Bot. Existing Browser Access and native Session approval still gate every Tool Execution. The Tool Provider registers only `browser_observe`, ref-based `browser_type` and `browser_click`. An existing read-only lease never becomes a control grant.

The adapter captures that Page object permanently for the connection. It never selects another page, follows an upstream current-tab pointer, calls group-level actions or silently reconnects. Extension tab groups and debugger permissions are upstream transport capabilities; the application grant does not authorize their wider scope. Dragging another tab into the group does not make it available to this Bot. Another client cannot select a tab already assigned to this client under the pinned extension contract.

Observation returns bounded main-document visible text, labels and ordinary input values, excluding password values. Every observation creates new opaque refs backed by ElementHandles in the observed document. An action cannot retarget an equivalent element after navigation. Pause and Resume invalidate refs and require fresh observation. Pause refuses new actions immediately and waits for issued actions to settle before acknowledging to the Client, so an earlier Playwright action cannot change the page after confirmed Pause. Before an authorized input or click, the adapter brings only the captured Page to the foreground and rechecks the grant and control revision. Chrome can suspend animation frames in background tabs, preventing Playwright from completing its normal stability checks; the official tab-selection implementation similarly brings the selected Page to the foreground. Browser Access remains separate from Computer Access; no Computer fallback is granted.

Main-frame navigation requests and committed frame navigation (including reload and same-document navigation), Page closure/crash, browser disconnection, Return, Access removal, target/profile changes and Host disposal revoke the process-local connection. Revocation stops the Subprocess, cancels pending requests/results, invalidates native Session approval through the existing authorization scope, and retains the Human tab. Restart restores no grant. Process isolation also makes a connection waiting indefinitely for upstream Human selection cancellable. There is no second durable authority or storage migration.

The child's environment excludes Playwright MCP and upstream test overrides; in particular it never inherits the profile token that bypasses selection. Action errors are reduced to a stable refusal so upstream Playwright call logs cannot place typed contents in Browser Audit. Existing redacted audit and developer lifecycle logs remain the owners of execution evidence.

## Verification and consequences

The fixed package's exported connector was checked against its installed build and the matching official source. The extension relay rejects an additional Browser CDP Session (`Target.attachToBrowserTarget: Not allowed`), so the adapter uses the supported Page events and document-bound handles rather than assuming managed CDP parity.

This slice supports observe, type and ref-based click on one explicitly selected daily Chrome document. It does not provide navigation, screenshots, multiple-document authority, other Browser actions or Container driver replacement. Human still operates their own tab directly; the Browser entry provides Pause, Resume and Return. The official extension has debugger, tabs, tabGroups and all-sites permissions; its installation is a stronger, separate choice from BotHarness's read-only extension.

Real Chrome extension and PersonaBot verification, independent fixture state, revocation checks and UI evidence are recorded in the issue-backed PR. Every later extension or connector update must requalify tab selection, group ownership, disconnect behavior and document fencing before changing the pins.

## Primary references

- [Pinned official extension README](https://github.com/microsoft/playwright/blob/7ad3fba1aad9471c7e46d67a11b0e710a5d77ea8/packages/extension/README.md)
- [Pinned extension connection factory](https://github.com/microsoft/playwright/blob/7ad3fba1aad9471c7e46d67a11b0e710a5d77ea8/packages/playwright-core/src/tools/mcp/extensionContextFactory.ts)
- [Official extension installation](https://chromewebstore.google.com/detail/playwright-extension/mmlmfjhmonkocbjadbfplnigmagldckm)
