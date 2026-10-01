# Qualified optional IM provider — real Profile evidence

The qualified provider was installed through the Profile package manager from
`github:DoodleBears/dsh-im#19d88f14bf85d74d4abf035a0c749d0b4a640257`, without
linking a local provider checkout. Its 385-file runtime digest matched before every
Host boot. DSH was `0.2.0-rc.1`.

- `before.jpg`: actual PersonaBot Profile before installing the optional provider;
  the connection is unavailable. Base was #607's merge `bdecd0da167e450e1ac65da981f22dcce0bd7204`.
- `after.jpg`: native screenshot crop of the real Recent sends card after the final
  Host restart. The crop excludes the account's personal display name; it shows
  two actual accepted sends, with no fixture or image alteration. Both captures
  used the same 586 × 827 dark English viewport.
- `e2e.json`: public-safe artifact provenance, source-file hashes, final code
  revision, durable-state comparisons and verification limits. The final send and
  restart used feature commit `63c7708e431b42cb4514f1710654b29cb1d9477b`, integrated
  on main `962c7921`. Later evidence-only commits do not change these source bytes.

The Human interaction was exercised through the real UI: create PersonaBot,
choose the authenticated account and saved/tested private group destination,
authorize, send a unique text, then restart the same Profile. After integration,
repeat one Human send and restart. Canonical Binding, Grant, two Outbox Intents
and exactly two accepted attempts were byte-for-byte unchanged across the final
restart. There was no automatic replay. The preliminary target test is a separate
provider-owned setup send, outside these two BotHarness Outbox attempts.

The validated outcome is **platform accepted**. Bot group-history access returned
`230027`; the Human CLI lacked its group-history scopes, and the available native
client required renewed account verification. No scope was expanded. Group-visible
receipt, delivered and read remain **unverified**, not implied by acceptance.
Human credentials were not used by BotHarness.

Automated verification: lint (existing warnings), format, typecheck, build and
docs build passed. The integrated suite passed 1569 tests with 1 skip at four
workers; all six new pin regressions passed. Preserve the earlier pre-integration
full-suite failure: one unchanged source-policy test exceeded its existing
15-second timeout; an isolated rerun passed all 15 tests. No assertion or timeout
was weakened and no fix to that unrelated test is claimed.

Reproduction and removal follow [the guide](../../../client-bridge.md#qualified-optional-im-provider).
This is an explicitly unreleased development fork; upstream release, production
enablement and #12's integrated Bot Inbox are separate gates.
