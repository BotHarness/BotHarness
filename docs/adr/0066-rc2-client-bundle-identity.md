---
Status: Accepted
Date: 2026-09-25
---

# The RC2 Client Bundle has an unambiguous package identity

## Decision

The independently linked BotHarness Client package is `@botharness/ui`. Its source directory remains `packages/client`, and its Cordis plugin name remains `botharness-client`. The Bundle manifest, loader registration, dependency links, development event filter, and current guides use the package ID `@botharness/ui`.

The Client preserves only the active Bot or Channel selection during an in-document DSH Client HMR replacement. Host-owned PersonaBots, Channels, messages, and drafts retain their existing authorities; the handoff creates no second durable store. Web development may continue using its page-refresh fallback.

## Why

In DSH 0.1.7 RC2, Client Modules normalizes a specifier ending `/client` as an export subpath. The old package name `@botharness/client` therefore resolves to `@botharness` during graph prefetch and the built-in plugin page reports `not a graph entry`. An RC2 Windows Desktop test with the new package ID received the linked Bundle `rebuilt` event and updated the open DM in place. Without a selection handoff, Fiber replacement returned the UI to the native session page.

## Consequences

- Existing local profiles linked to the unpublished package must reinstall/relink the umbrella Bundle to use the new dependency ID. No public registry package is migrated.
- The generated Client Bundle ID must never end `/client` while this RC2 normalization applies; the bundle regression test enforces that constraint.
- An installed RC2 Desktop may still inject an old boot graph after a later full document reload: the old Bundle URL returned 404 while the current graph URL returned 200. This occurs before plugin import and remains an upstream Desktop limitation. Stop the build watcher, build, then cold-restart Desktop and Host to recover; see `docs/client-bridge.md` §7.

This decision updates the package identity described in ADR-0023 without changing its Host/Client bridge boundary.
