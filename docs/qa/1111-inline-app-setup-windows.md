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
  messaging regressions: 22 passed; artifact regressions: 33 passed. TypeScript,
  lint, format, bilingual Release Ledger and build checks passed.
- Public setup RPC cancellation covers verification, credential reading and
  credential saving before the config commit. It verifies no account or credential
  remains after cancellation. Lifecycle logs contain fixed phases, duration and
  allowlisted reasons, without credentials or App ID.
- Both review axes closed the original findings and found no actionable issue in
  the final integration/pin increment. Independent review recomputed the runtime
  digest and verified the preserved typing and group-name paths.
- Windows full-suite attempts were stopped after widespread failures. The Bridge
  RPC cleanup failures also reproduce on the unchanged `fe08fd92` baseline. This
  does not classify every failed test as pre-existing; Linux qualification of the
  same source is recorded below.
- Linux (`Node 24.21.0`, locked pnpm 12.4.2), reviewed runtime source `b49fbf15`:
  full run with four workers finished with 415 files passed, 5 skipped, and 2
  files containing one 15-second timeout each (3361 tests passed, 9 skipped).
  The two files passed all 12 tests on both the candidate and unchanged
  `fe08fd92` baseline when run serially with the original timeout. The complete
  one-worker run finished with 416 files passed, 5 skipped and one file containing
  a 15-second usage-filter-query timeout (3362 tests passed, 9 skipped). No
  full-suite pass is claimed; neither timeout nor assertions were relaxed.
- Integration with main `672e5024` preserves optional setup and reaction contracts
  and both snapshot projections. TypeScript and six focused files passed (44
  tests), including setup, messaging feedback and onboarding. Both incremental
  review axes found no actionable integration regression. Provider `.16` does not
  declare reaction capability, matching the earlier product pin; this record does
  not qualify Lark reactions.
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

Installed evidence above belongs to product source `b49fbf15`; the main
integration requires a freshly packaged runtime before further visual acceptance.

New Lark Provider account creation/binding, DM and mention replies, secret absence
across Host outputs, comparable baseline/after visual evidence and recording, and
the WeChat QR slice remain to be verified. The full-suite timeout remains an
explicit qualification limitation.
No existing paired QA Profile is modified by this candidate.
