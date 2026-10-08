# Channel text purge: first-slice QA

This is the first working slice of [#897](https://github.com/BotHarness/DeepSeekBot/issues/897), not completion of that issue or the #886 prerequisite. Use a disposable Profile with synthetic content only. The UI follows the Channel sidebar's secondary metadata and information-button pattern, using native Modal, Button and Tooltip primitives.

## Run

```sh
pnpm build
node scripts/dev-instance.mjs --home .humanlayer/tasks/897-channel-purge/qa-verified --port 31987
node scripts/e2e-channel-purge.mjs after
```

Open the launcher's local login URL without publishing it. In Bot mode, create a local Group, send two disposable text messages, then end the Group from its management menu. In the sidebar's More menu, open **Ended Channel history**, open the Group and select only one message. Nothing is selected by default. Preview lists the selected body and all affected placements; Cancel must leave both bodies intact. Information icons support hover, click and keyboard focus for scope, identifiers and surviving-copy boundaries. Confirm permanently removes the selected body while retaining a tombstone and the unselected message. Create another Group with the same name: it must have a fresh identity and empty history, while the ended Group remains readable.

The automated path uses the real Client composer, deletion confirmation and purge controls. It checks cancellation against the canonical Host result, captures light/dark evidence at 1440 × 900 and a compact 390 × 620 viewport, checks the wide dialog's measured bounds and verifies Escape dismissal. Images and synthetic scene identifiers are saved under the ignored task directory. The script refuses Profiles outside that task directory and refuses to end any active Group not named `Purge synthetic QA`.

Stop only the exact Host PID printed by the launcher, then launch the same Profile again and run:

```sh
node scripts/e2e-channel-purge.mjs restart
```

The selected body must remain absent after cold restart; the tombstone and unselected history must remain readable.

## Owning-module checks

```sh
pnpm test packages/core/test/content-purge.test.ts packages/client/test/channel-history.test.ts
pnpm lint
pnpm format:check
pnpm typecheck
pnpm build
```

The tests use real SQLite snapshots and independent ledger files. They exercise interrupted ledger acceptance/application, fail-closed Messaging, destination/package checkpoint union, missing/corrupt/unsupported restore data, persistent duplicate/admission fences, shared placements, file-bearing source refusal and restored Outbox outcome preservation. The shared-file refusal test uploads an actual managed file and verifies its bytes survive restart; it does not implement or claim reference-aware file cleanup. On the Windows QA host, the existing attachment upload's read-only `fsync` fails with EPERM, also reproduced in unchanged main's `real-attachment-files` tests; Linux CI must run this test. Unchanged main also reproduces the existing `bridge-rpc` teardown's Windows directory-removal EPERM failures.

## Remaining #897 scope

Only text from ended local Groups is eligible, and the Human must have continuous read access from creation in every shared placement. File bindings, external sources, running Admissions, Assignment dependencies, causal descendants and existing linked Outbox intents are refused before ledger acceptance. Stale previews require new consent. The source, not a placement, owns the removed body.

Still required: reference-aware current/legacy file cleanup and failure recovery; external ingress/reconciliation and started-effect qualification; broader access/dependency policy; real DSH interrupted-cleanup/shared-file restore scenarios; and coordination with the future asynchronous Profile Backup Barrier. The exported checkpoint and cold restore union are production owning-module contracts, not a complete Profile Backup/Restore UI. Existing ledger facts must always survive operational snapshot replacement. DSH Session content, Human-managed Memory/Workspace/exports, provider copies, Git remotes and offline backups are outside this operation.
