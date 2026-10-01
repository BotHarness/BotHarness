---
Status: Accepted
Date: 2026-10-01
---

# Isolated IM Profiles pin a qualified temporary provider fork

The optional local development path may install the minimal public-contract fork of dsh-im at an immutable Git SHA, while upstream review and release remain pending. BotHarness stays a separate Bundle and consumes the public same-Host Service; it does not copy provider SDKs, credentials, stores or connection lifecycle. This qualifies ADR-0011's no-fork default for isolated development only and leaves ADR-0101's production enablement gate intact.

The first qualified source is [DoodleBears/dsh-im at `19d88f14bf85d74d4abf035a0c749d0b4a640257`](https://github.com/DoodleBears/dsh-im/commit/19d88f14bf85d74d4abf035a0c749d0b4a640257), against DSH `0.2.0-rc.1`. It provides authenticated account description and conditional sends, plus the proposed exclusive inbound consumer used by #78's provider qualification. Installing it does not deliver #12's Bot Inbox consumer. Its unchanged package version `4.32.0` is not sufficient identity and the ordinary npm release remains incompatible.

The #612 qualification advances that development artifact to [`13869c30294af3d03d2ebc2d987d6e0765e0fcf2`](https://github.com/DoodleBears/dsh-im/commit/13869c30294af3d03d2ebc2d987d6e0765e0fcf2), still against DSH `0.2.0-rc.1`. It includes the compiled checked history reader for the bound Bot identity. The launcher verifies 386 runtime files with SHA-256 `4aed4a5ca637357dea0a8074e54e9dfd80af3c6a2e84381b803398b6050caf42`. Real Lark qualification covers bounded Chat and Thread reads and source-bound replies; application permission remains a separate platform gate. See [#612](https://github.com/BotHarness/BotHarness/issues/612) for evidence.

The launcher requires explicit `--im-provider`, composes the existing Profile's optional Bundle, and uses the Profile package manager's Git dependency mechanism. It checks the complete SHA dependency, Bundle membership, package entrypoints and a fixed digest of `lib`, `plugin-src`, `src` and `cordis.patch.yml` before launching the Host. Unexpected runtime files or nested symbolic links fail closed. The digest identifies these runtime trees, not the entire package archive or its transitive dependencies. No local provider checkout or source build is required; this Git revision ships its compiled Bundle. Default Profiles do not install it.

## Why

A one-off linked source patch proves behavior but cannot give another tester the same provider. Waiting for upstream publication blocks the next real tracer; treating the legacy npm version as compatible bypasses the verified account and route boundary. An explicit immutable development artifact keeps the evidence reproducible without claiming an upstream release.

## Ownership and exit

- dsh-im owns platform connections, SDKs, credentials and settings. BotHarness owns Binding, Grant and Outbox in its canonical database.
- The fork is temporary. Maintain only the public contract delta; do not create a parallel platform integration roadmap. [Upstream PR #293](https://github.com/xmanrui/dsh-im/pull/293) is pending, not accepted or released.
- Once an upstream release provides the required public contract, qualify its exact artifact on the project's pinned DSH version with the same account/target, lifecycle and real send proof, then replace the Git pin and retire the fork dependency. Inbound qualification is a separate gate for #12.
- A new provider or DSH revision requires deliberate requalification and a reviewed digest change; package names, display names and version strings never substitute for that proof.
- Removing the Bundle and dependency after stopping the owning isolated Host disables future provider operations. Binding and Outbox history remains; accepted platform messages cannot be undone by reverting this change. Historical in-flight outcomes retain ADR-0101's no-retry rules.

## References

- [#117](https://github.com/BotHarness/BotHarness/issues/117), [#78](https://github.com/BotHarness/BotHarness/issues/78), [#12](https://github.com/BotHarness/BotHarness/issues/12).
- [Local verification guide](../client-bridge.md#qualified-optional-im-provider).
- [Pinned DSH CLI reference](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.0-rc.1/apps/cli/reference/README.md).
