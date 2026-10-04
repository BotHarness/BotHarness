# Container Computer first-start verification (#797)

Status: runtime and regression checks passed; final Viewer visual evidence is pending. This record does not establish completed visual acceptance.

## Before and current result

The base `abf6d9db6d28b05b10136fd4513f1ad075ffcfed` was run on a never-used named volume through an isolated DSH Host and the authenticated Computer start route. One start preceded the 1280 × 720 English/light fullscreen watch-only capture in `before.png`. XML read-back was icon-size 16 / panel size 26 (`before-proof.json`).

The implementation revision in `after-proof.json` started a separate never-used named volume exactly once through the same owning Host. Independent read-back confirms icon-size 32 / panel size 52, all upstream channel defaults, ownership by the runtime desktop user, and directory/panel write access as that user. These assertions ran before any test restart. This is configuration proof, not a final rendered Viewer screenshot or a model observation.

A subsequent real stop/start preserved custom icon-size 45 / panel size 73, the window-manager XML hash and an unrelated custom user file (`custom-proof.json`). Only this QA fixture's panel was then restored for Human inspection. The retained QA runtime is now restarted and must not be described as still on its first boot.

## Fixed conditions

- macOS arm64 Host, Docker Engine 29.1.2, Linux arm64 container; pinned DSH 0.2.0-rc.1.
- Same upstream image digest `lscr.io/linuxserver/webtop@sha256:c4ceafc1c48ed9a61771345c74568d3bff6438802f0d89e9ebd9846e8404f696`; image ID appears in both proofs. This does not qualify the current latest image.
- Same Bot, Profile target, 1280 × 800 desktop, English/light shell, watch-only Viewer; before/after home stores are independent.
- No model-driven screenshot consumption was tested. Linux bind storage is covered by the actual-shell regression and argv contract, not by a real Linux Host run.

## Failures and pending capture

- The initial QA setup precreated a Profile directory before the repository launcher created its manifest. The CLI refused that setup; the task-only precreated directory was preserved separately and the standard launcher then created a valid Profile. No production workaround was introduced.
- The baseline behavioral test failed four cases before the fix. A subsequent macOS run exposed BSD versus GNU `sed -i` differences in the test harness; the harness now adapts the host identity and Darwin sed while executing the production initialization shell. Five new cases plus 57 existing Provider cases pass.
- An intermediate rendered desktop had corrected sizes but root-owned seeded XML and an incomplete desktop. That attempt was rejected as successful evidence; new-path ownership was fixed, rebuilt and independently verified using another fresh home.
- Disk exhaustion interrupted final Docker QA and caused four unrelated test fixture ENOSPC failures. After the Human cleared space, the full suite passed: 2309 passed / 9 skipped. Docker's normal restart hung waiting for its old processes; after terminating only the verified Docker processes, the engine recovered. The post-recovery first-start proof uses a new volume, not an automatically restarted one.
- Final in-app Browser capture remains blocked: the Channel remained loading and Computer controls disabled, then reload, focus and fresh-tab navigation timed out. No final After screenshot exists. The small black intermediate capture is not published as success.

## Repeat the pending visual verification

Use `scripts/dev-instance.mjs` and an isolated DSH home. Configure Container target with the same pinned image and a never-used container/volume name; enable the QA Bot's Computer Access through the existing interface. Start once, wait for running, open Computer fullscreen in watch-only mode, and capture the actual fully rendered desktop before any restart. Read back the panel XML and verify desktop-user write access. Match the Before viewport/theme/locale and inspect the pair. Publish the After capture beside `before.png` before removing Draft status or declaring #797 complete.

Validation already passed: lint, format check, typecheck, 2309 tests / 9 skipped, package build, and docs build (306 pages). Independent Spec review found zero implementation issues and one pending visual acceptance requirement; Standards review found zero violations or reportable smells.
