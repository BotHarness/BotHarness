# Inline app setup candidate — #1111

This record separates earlier Lark native qualification from the later WeChat QR candidate. It does not qualify a new WeChat native pairing,
registry publication, a product release, or deployment.

## Earlier Lark-qualified artifact identity

- DSH: `0.2.0-rc.1`.
- Earlier installed product candidate: `0.0.0-test.1111.2`, source `9889ada5907fa281ca8dc9e1f53c7adf44d3ccac`.
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
  full-suite pass is claimed for that earlier source; neither timeout nor assertions were relaxed.
- Integration with main `672e5024` preserves optional setup and reaction contracts
  and both snapshot projections. TypeScript and six focused files passed (44
  tests), including setup, messaging feedback and onboarding. Both incremental
  review axes found no actionable integration regression. Provider `.16` does not
  declare reaction capability, matching the earlier product pin; this record does
  not qualify Lark reactions.
- Current integration head `9889ada5` passed both [GitHub verify](https://github.com/BotHarness/DeepSeekBot/actions/runs/37824538622) and [package preparation](https://github.com/BotHarness/DeepSeekBot/actions/runs/37824538627): each full suite passed 3423 tests across 422 files, with 9 tests and 5 files skipped. Lint, format, types and build also passed. The earlier local timeout results above belong to `b49fbf15`.
- Delayed dialog submission retains the entered credentials while inputs are
  disabled. Expired handles permit a fresh setup. A created identity remains
  available for explicit binding after the dialog closes.

## Later main integration

After the native qualification, main `271e056a` was merged into the PR branch.
The only conflicts were the bilingual Release Ledgers: main's complete `1.2.0`
release record is preserved, and the unmerged `#1111` entry remains in Unreleased.
Both incremental review axes found no actionable integration regression.
TypeScript, lint, format, bilingual ledgers and build passed. Nine focused files
ran 73 tests: 72 passed and one message-feedback test hit its original 15-second
timeout while checks were concurrent. With the build finished, that entire file
passed all 11 tests with one worker and the unchanged timeout. The original
failure is retained; this is not a new full-suite pass. Native evidence below
still belongs to installed runtime `9889ada5`, not the later main integration.

## Installed candidate evidence

The packaged `0.0.0-test.1111.2` candidate was installed into the same isolated
Profile using its pinned CLI. Authenticated native and BotHarness APIs passed.
The actual Chrome Client returned `667` for `23 × 29`, opened the inline Lark
creation form, and submitted the dedicated application's credentials directly to
the Provider. The resulting Lark identity was created and bound to the QA Bot in
that dialog. The persisted account is in `external-consumer` mode.

With Human approval, the dedicated official application enabled Bot capability,
`im:message.p2p_msg:readonly`, `im:message.group_at_msg:readonly`, and
`im:message:send_as_bot`, plus `im.message.receive_v1` over a long connection.
The Human published test version `0.0.1`. The official developer console visibly
confirmed **Published**, **Approved**, and an availability scope containing only
the current Human account. This is distinct from package registry publication.

An exact-value read-only check resolved the actual App Secret from the native
credential store and compared it against public `list` / `messagingSnapshot`,
Provider config, Host log, and task-owned BotHarness durable/session files.
Across 64 scanned files outside the credential store, there were zero matches;
public snapshots also contained no match. Only counts and boolean results were
saved. The same checks passed again after the native DM reply: 64 files, zero exact App Secret matches outside the credential store, and no match in public snapshots. Two additional Host-log token/header patterns also had zero matches. This is not exhaustive unknown-secret detection and does not qualify QR tokens.

The current Client diagnostic reported `shell-ready`. Earlier document failures
remain in bounded history; the fresh successful document does not establish a fix
for those failures. The first installed `b49fbf15` candidate's local `323` reply
and form capture remain historical evidence, not proof for the current runtime.

## Visual evidence and runnable review path

[Current screenshots](https://github.com/BotHarness/DeepSeekBot/pull/1231#issuecomment-6066859407)
show the original empty binding entry point, current inline Lark form with empty
credential fields, and actual bound-identity result. All were inspected at
1559 × 865, Chinese, dark theme. The fixed `fe08fd92` baseline uses its original
Provider. The candidate background additionally contains a second model turn and
main's updated welcome layout; those differences are not attributed to this feature.

To reproduce: package and launch an isolated candidate, complete a Bot DM, open
**Bind app → Create app**, choose Lark, submit a dedicated application's credentials,
and verify the identity appears ready in the same dialog. Send that application a
native Lark DM and group mention; check Source Event, Bot Inbox and native replies.

Chrome control recovered long enough to verify publication and save evidence,
then both the existing Lark messenger page and a fresh page timed out. Native
messages and continuous recording have not been captured through that blocked
connection. The Human found the app and sent `31 × 41`, but received no reply. Read-only durable evidence confirms one Source Event, one Inbox Admission, model output `1271`, and an Outbox settled as `unknown-outcome` / `provider-result-unknown`. The Host platform summary identifies `99991672`: original-message GET requires `im:message:readonly` or `im:message`. The preserved checked reply path performs this GET before any reply call. The Human enabled the additional read permission and published a new test version. A fresh `37 × 43` DM then completed with `1591`: one Source Event, one Inbox Admission, one send attempt, `provider-accepted`, and a version-1 native message receipt whose conversation matches the original DM. The Human confirmed the reply. The original `1271` unknown request remains unchanged and is not replayed.

## Outstanding qualification

The native Lark DM and group mention passed on the same application in distinct conversations. The group request `41 × 47` returned `1927`: one Source Event, one Inbox Admission, one send attempt, `provider-accepted` and a version-1 receipt matching the original group; the Human confirmed it. Post-group exact App Secret comparison again found zero matches across 64 files outside the credential store. Remaining comparable visual states and recording, and native WeChat pairing remain open. The earlier integration full suite is green; later candidate checks are recorded separately below. No existing paired QA Profile
is modified by this candidate. This record does not qualify registry publication,
a product release, deployment, or Lark reaction capability.

## Later WeChat QR candidate (not native-pairing qualified)

The binding dialog now starts and resumes Provider-owned WeChat QR setup, accepts
an optional pairing code, and binds only the authenticated account description.
Closing the dialog retains the live attempt; explicit cancellation fences late
poll results. The Provider stores external-consumer mode before the first runtime,
refuses an already configured account without replacing its token or runtime, and
retires an old setup Registration even when its native poll resolves late.

The candidate uses Provider `4.32.0-botharness.17`, maintained source
`b4603eadcbc752b77396ecccdf05ee459dc63ba2`, 412 runtime files, SHA-256
`c2047738952dc155f95eb1b23cd56ba96bb7585a7e343e3916ee7da63b282548`.
Manifest and lock digests remain as recorded above. No registry release is claimed.
The previous `.4` package (product `476221a0`, Provider `e3c7f6d`) started but its
actual setup RPC returned `setup-failed`: production workspace decoration makes
registration status asynchronous. The public RPC regression now uses the real
workspace wrapper and async catalogs: old code failed, awaiting status passed.

- Provider setup/controller regressions: 69/69 passed after the final fix; package
  build and artifact verification passed. Both incremental review axes reported
  no new actionable finding, separately from native-platform acceptance.
- Product focused transport/dialog/capability/artifact/style regressions: 56/56
  passed on `476221a0`. Later pin/documentation checks are recorded in the PR.
- The Windows product full run started on `5f655a95` and overlapped subsequent
  review fixes. It finished with 2799 passed, 648 failed, 29 skipped tests; 316
  passed, 108 failed, 6 skipped files. Numerous original-timeout and filesystem
  cleanup failures occurred. This is neither a clean final-head qualification
  nor proof that every failure is pre-existing; the log is retained locally.
- The authorized Windows Provider full run finished with 3718 passed, 41 failed,
  7 skipped tests before the final fixes. Update-service state failures dominate;
  its independent diagnostic still fails. Those files were not changed here, but
  a complete baseline comparison has not been performed. No full pass is claimed.
- Earlier main integration `fab781c8` passed GitHub verify and package preparation
  (runs 37830302149 / 37830302156). Those results do not qualify the new QR head.

Chrome control of both the old candidate tab and a fresh tab failed (debugger
unattached / timeout), preventing new QR screenshots and continuous recording.
The earlier embedded screenshots show the actual Lark `.2` runtime only.
Runnable QR review: Bind app → Create app → WeChat → generate QR; close and reopen
to resume, then cancel. A dedicated account is required before scan → owner DM →
original WeChat reply acceptance. The Human has only the currently paired account
and explicitly asked to preserve that pairing; no scan, reset or account switch
was performed. Native WeChat qualification remains pending.
