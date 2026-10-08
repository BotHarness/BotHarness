# Channel Content Purge QA

This completes the remaining acceptance of [#897](https://github.com/BotHarness/DeepSeekBot/issues/897), supplying the Purge authority contract required by #886. Use a disposable Profile with synthetic content only. The separate Human-only history/purge UI retains the Channel sidebar's secondary metadata and information-button pattern, native primitives, a 760 px wide dialog and compact-screen scrolling.

## Real DSH path

```sh
pnpm build
node scripts/dev-instance.mjs --home .humanlayer/tasks/897-complete-purge/qa-completion --port 31990
node scripts/e2e-channel-purge-completion.mjs after
```

Open the launcher's private local login URL. The script uploads two actual files through the Client composer, creates another source referring to the shared file through the authenticated Channel API, sends unselected text, and ends the first Group through its management menu. It refuses to end Groups other than its named synthetic fixture. Ending the Group preserves history and the other active Channel.

In **More → Ended Channel history**, select the two file-bearing messages. Preview shows all affected placements, Admissions, file names and exclusive/shared dispositions. The derivative info button reports Memory commits linked by the owning module and possible Workspace grant locations, including retained deleted-identity repositories; untracked files/exports remain explicitly unknown. Identifiers, dependent-effect details, expiry and surviving-copy boundaries are behind accessible information buttons. Cancel leaves both bodies and files intact. Review again and confirm: only the selected source bodies are erased globally, shared attachment bytes and the unselected source remain. Nothing is selected by default; a changed scope requires fresh consent.

The script deliberately substitutes a task-owned managed-file directory with a symlink/junction to another directory inside the same disposable Profile. Cleanup refuses that unsafe directory, while accepted source bodies remain erased and the Client explicitly reports pending attachment cleanup. The script removes its junction and restores the real directory, then stops: it never adds a production testing backdoor. Its pre-purge SQLite snapshot and file archive remain under the ignored evidence directory.

Stop only the exact Host PID printed by the launcher, restart the same Profile, and run:

```sh
node scripts/e2e-channel-purge-completion.mjs restart
```

Startup reapplies the independent ledger before mounting Messaging, finishes the exclusive-file cleanup and retains the shared file, other Channel body, unselected history and causal tombstones. No pending cleanup remains. For the old-snapshot scenario, stop that exact Host, replace only this disposable Profile's `botharness.db` (removing its WAL/SHM) and managed attachments with `evidence/older.db` and `evidence/older-attachments`, leaving `botharness/purge/ledger.db` intact. Restart and run:

```sh
node scripts/e2e-channel-purge-completion.mjs restore
```

The same assertions must pass even though the restored operational snapshot contained the old bodies and exclusive file. This tests the destination-ledger startup path; package/checkpoint union is exercised separately against real SQLite and files in the owning-module tests. It does not claim full Profile Backup/Restore UI.

The E2E records actual light/dark screens at 1440 × 900, a 390 × 620 compact screen, measured wide-dialog bounds, tooltip disclosure and Escape dismissal. Images and scene identifiers stay in the ignored task directory. The `before` mode runs against a separately built main checkout on port 31991 with `qa-base`; it demonstrates main's file-bearing-source refusal. Its attachment is a valid synthetic managed-file receipt supplied to the actual Channel API because unchanged main's read-only record fsync fails on Windows. The after path exercises actual Client upload and fixes that cross-platform fsync mode.

## Owning-module checks

```sh
pnpm exec vitest run packages/core/test/content-purge.test.ts packages/core/test/content-purge-completion.test.ts packages/core/test/dsh-bot-agent-adapter.test.ts packages/client/test/channel-history.test.ts --maxWorkers=3
pnpm exec vitest run packages/core/test/messaging-inbound.test.ts --maxWorkers=2
pnpm lint
pnpm format:check
pnpm typecheck
pnpm build
```

Coverage includes real current files, migration bindings and reachable legacy CAS; shared references; changed-scope consent; independent destination/package union on existing and fresh destinations; asynchronous checkpoint success/failure serialization; missing/corrupt/unsupported checkpoints and ledgers; interrupted acceptance/application/file cleanup and cold restart; duplicate external ingress; shared active placements and Inbox reception; running tool fences; and actual settlement of an already-issued provider request without restoring Outbox text. Required Linux CI runs the full suite. On this Windows host, pre-existing tests that leave SQLite handles open can fail during temporary-directory teardown with EPERM; distinguish those teardown failures from test assertions.

## Boundaries to verify with the Human

Ordinary deletion ends only the local Channel's membership, routes and future effects, preserving history, other Channel/Inbox routes and the external conversation. Hidden Channels remain reversible. A running turn with another live reception path remains authorized until purge or until its last route ends. Purge invalidates content-dependent native and application tools; a provider request already issued settles to its actual receipt/failure or interrupted unknown outcome, without automatic retry or fabricated cancellation.

Preview and tombstone information disclose surviving DSH prompts/results, independent Assignment/causal derivatives, Human Memory/Workspace/exports, provider copies, Git remotes and offline backups. These copies are not silently rewritten. Standalone old backup files guarantee only their contained checkpoint. No automatic backup catalog, deletion scheduler, shared filesystem sweep or online recall is introduced.

The Host's `withCheckpoint` holds the purge barrier until an asynchronous snapshot callback settles. Cold restore validates the package first, unions it monotonically with the destination's independent ledger, then applies the result before Messaging is readable. Existing required ledgers cannot be silently recreated after loss or corruption. Checkpoint v1 remains readable; v2 retains managed-file selectors and external authors without source bodies, filenames, provider credentials or user-copy locations.

Pause the PR for Human QA after required checks and genuine screenshots are available; do not merge or release automatically.
