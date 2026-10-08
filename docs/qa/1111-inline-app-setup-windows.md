# Inline app setup candidate — #1111

This record tracks a local Lark-first candidate. It does not qualify WeChat QR,
registry publication, a product release, or deployment.

## Artifact identity

- DSH: `0.2.0-rc.1`.
- Product candidate: `0.0.0-test.1111`.
- Independently versioned Provider candidate: `4.32.0-botharness.16`.
- Maintained fork input: [`35706ef94473088fa2f2fbdd98027ded19992add`](https://github.com/DoodleBears/dsh-im/commit/35706ef94473088fa2f2fbdd98027ded19992add).
- Runtime source: 412 files; SHA-256 `3e77a959cd79c84b7ca04652f574b3ea808f079b62e3ca12e569582cc12e4f39`.
- Package manifest SHA-256: `501e62d558eceb2b42ad9cd03fc0910e09581fd6531ec68e074fe5a16225ed1e`.
- Build lock SHA-256: `c7f16baaa5bb1ab3bbb607b59a10327f0af010c61e1ea1ab4a72d7d08af9ffe9`.

The candidate combines the approved QQ fork baseline with the existing product
Provider input `36da305c`, retaining checked WeChat typing and real group names.
The only source conflict was the delivery error allowlist: both QQ rate limiting
and WeChat typing refusal codes are retained. The compiled Host was rebuilt.

## Automated evidence

- Provider setup/Host/management/Delivery, WeChat typing/controller, Lark names,
  Slack and Discord consumer regressions: 177 passed.
- Provider build and package artifact verification passed.
- Product setup transport/dialog, optional capability negotiation and existing
  messaging regressions: 22 passed; TypeScript and format checks passed.
- Public setup RPC cancellation covers verification, credential reading and
  credential saving before the config commit. It verifies no account or credential
  remains after cancellation. Lifecycle logs contain fixed phases, duration and
  allowlisted reasons, without credentials or App ID.
- Delayed dialog submission retains the entered credentials while inputs are
  disabled. Expired handles permit a fresh setup. A created identity remains
  available for explicit binding after the dialog closes.

## Installed candidate evidence

The independently installed pinned CLI launched the packaged candidate in a fresh
Profile. The launcher verified the product composition and authenticated API.
The actual Chrome Client reached Bot mode, and its first real model conversation
returned `323` for `17 × 19`. The existing welcome-message Bind app control opened
the new Create app form with Lark selected, credential fields and the guide link.
The formal Client diagnostic reported `shell-ready`, no failed attempts, and one
retained initial connection-retry warning; Chrome console inspection found that
same warning and no errors at this checkpoint.

A dedicated Lark application was created in the official developer console with
Human approval. The Human also approved the three basic application message
permissions and receive event. Browser control timed out before those permissions
were submitted. Application creation is distinct from Provider account creation
and does not qualify a connected identity.

## Outstanding qualification

New Lark Provider account creation/binding, DM and mention replies, secret absence
across Host outputs, comparable baseline/after visual evidence and recording, and
the WeChat QR slice remain to be verified. Full-suite results are pending.
No existing paired QA Profile is modified by this candidate.
