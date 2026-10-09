# Window Companion: five-companion performance checkpoint

[Issue #1167](https://github.com/BotHarness/DeepSeekBot/issues/1167), part of [specification #1135](https://github.com/BotHarness/DeepSeekBot/issues/1135). Recorded 2026-10-09 UTC. **Partial qualification: no performance budget or overall performance acceptance is claimed.**

This checkpoint records three foreground repetitions each of idle, roaming and drag/release, plus paired post-GC heap snapshots around ten pin/unpin cycles. It extends the earlier lifecycle-only observations to the later composed spring, anchor, approval, question and candidate-mouth implementation. It introduces no runtime change, pin cap or +N fold.

## Sources and controls

| Control                | Parent                                                                                                              | Candidate                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Host source            | `75a236a56942f75c3ebbbe84b88bde2e6fc3abcb`                                                                          | Composition `fc356883152ac5d86b11993216084dbda60be4d4`, integrating main `66d2767a`                         |
| Pixel Avatar           | Published 0.1.0                                                                                                     | Local packed 0.10.1, owner `ac9e25740e7ef33d1409b124d9bab23d16732ced`; unpublished                          |
| Installed Host changes | Clean parent checkout                                                                                               | Uncommitted QA-only packed dependency and Companion-only `speechMouthVersion: 2`; not a released Host build |
| Browser                | Chrome 154.0.8037.98, isolated headless                                                                             | Chrome 154.0.8037.98, isolated headless                                                                     |
| DSH / profiler         | Official 0.2.0-rc.1 / Chrome DevTools MCP 1.10.1                                                                    | Same                                                                                                        |
| Viewport / scale       | 960 × 640 / DPR 1                                                                                                   | Same                                                                                                        |
| Theme / locale         | Native dark / Chinese                                                                                               | Same; dark setting and native body attribute explicitly checked                                             |
| Test state             | 5 visible real PersonaBots, 0 message cards, all live and idle before workload; idle activity labels remain visible | Same companion/message-card state; candidate hides idle activity labels                                     |
| Other page state       | Roster 5; 4 saved test messages per DM                                                                              | Roster 6; 1 saved test message per DM; newer onboarding screen                                              |

Five canonical seeded recipes and their static portrait SHA-256 values match exactly across revisions; the per-Bot hashes are in [measurements.json](../assets/pr/1167-companion-performance/measurements.json). Both browser runs reported 16 logical processors and navigator.deviceMemory=32 GiB, a coarse browser value rather than physical RAM. Machine baseline: Windows 11 Pro 10.0.26200, Intel i5-12600KF, 63.8 GiB physical RAM. Other desktop workloads were not controlled. Three sequential repetitions per scenario are not randomized experiments, statistical equivalence or low-end-device qualification.

The candidate's original light-theme collection is retained privately and excluded from these tables. Inspection of its actual screenshot caught the mismatch; the candidate was repeated through the native dark-theme control. The parent screenshot verifies its dark theme. Candidate setup opened/closed native General settings; the parent was already dark. This additional setup difference, native-shell content, Channel histories, roster sizes, upstream application changes and Avatar versions prevent attribution of absolute listener or whole-page differences to a single Companion feature.

## Actual measured page state

These are state records, not a controlled visual before/after comparison: shell content differs as disclosed above. Screenshots were captured outside the timed traces; recording a screencast during profiling would add workload.

![Parent: five idle companions, native dark, 960 × 640](../assets/pr/1167-companion-performance/parent-five-idle.png)

![Candidate: five idle companions, native dark, 960 × 640](../assets/pr/1167-companion-performance/candidate-five-idle.png)

## Frame observations

Each cell contains **parent / candidate**. Durations below come from trace bounds, not total CLI wall time. Full per-run counts, min/mean/p50/p95/p99/max and threshold counts are in the numerical artifact.

| Scenario |   Trace seconds | AnimationFrames | Frame wall p95 ms | Presentation interval p95 ms | Frame wall >50 ms |
| -------- | --------------: | --------------: | ----------------: | ---------------------------: | ----------------: |
| idle 1   | 15.423 / 15.460 |     1629 / 1633 |     9.671 / 9.624 |                9.801 / 9.752 |             0 / 0 |
| idle 2   | 15.087 / 15.086 |     1592 / 1594 |     9.686 / 9.664 |                9.809 / 9.784 |             0 / 0 |
| idle 3   | 15.083 / 15.098 |     1588 / 1594 |     9.704 / 9.705 |                9.848 / 9.864 |             0 / 0 |
| roam 1   | 15.081 / 15.103 |     1575 / 1578 |     8.875 / 8.952 |               9.697 / 16.180 |             0 / 0 |
| roam 2   | 15.102 / 15.891 |     1571 / 1577 |     9.010 / 8.905 |               9.720 / 16.253 |             0 / 0 |
| roam 3   | 15.086 / 15.092 |     1573 / 1577 |     8.921 / 8.864 |               9.703 / 16.189 |             0 / 0 |
| drag 1   | 14.820 / 15.244 |     1554 / 1601 |     9.705 / 9.740 |                9.844 / 9.887 |             0 / 0 |
| drag 2   | 14.845 / 15.182 |     1558 / 1587 |     9.720 / 9.704 |                9.832 / 9.817 |             0 / 0 |
| drag 3   | 14.792 / 14.950 |     1556 / 1572 |     9.730 / 9.715 |                9.876 / 9.839 |             0 / 0 |

The official DevTools AnimationFrames handler pairs actual begin/end frame IDs on the main-frame renderer thread. Partial boundary frames are excluded; duplicate presentation timestamps are collapsed. Quantiles use nearest rank independently for each run. Frame wall duration includes elapsed pipeline time: **it is neither CPU execution cost nor display FPS**. Presentation intervals are reported separately. There is no video-derived FPS or injected requestAnimationFrame measurement loop. Thresholds in the JSON are descriptive references, not agreed budgets.

Idle and roaming traces request 15 seconds with no page evaluation during the timed interval. Drag traces each contain three native MCP element drags, each followed by two seconds of settling; snapshot/input overhead is included. MCP's public drag tool does not provide a calibrated fast throw, held-direction reversal or controlled release velocity, so these traces do not qualify those physical edge cases. No sampled frame wall duration exceeded 50 ms in these runs; that bounded observation does not establish sustained-load performance or exclude regressions in unmeasured scenes.

**Cadence difference requiring follow-up:** roaming presentation-interval p95 is 9.697–9.720 ms in the parent and 16.180–16.253 ms in the candidate, despite similar AnimationFrame wall p95. Candidate roaming has 4 / 9 / 7 presentation intervals above 16.667 ms, compared with 0 / 0 / 0 in the parent; neither has an interval above 50 ms. These event intervals do not measure physical display FPS. The repeated difference is an observation to isolate, not evidence of statistical equivalence or an attributable Companion regression: shell/setup/history and upstream application changes differ. A controlled owning-feature comparison is still needed before deciding whether a correction is required.

## Post-GC heap and resources

Both revisions use the same official take_heapsnapshot procedure, which collects garbage before capturing the graph. Chrome also documents snapshot GC in its [heap snapshot guide](https://developer.chrome.com/docs/devtools/memory-problems/heap-snapshots). Each snapshot follows a 2.5-second settle, with all five live companions paused and no cards. Ten real existing pin/unpin button handlers observed mounted counts 5 → 4 → 5 per cycle, with 150 ms after each transition and a live-stream check before the second snapshot. This tests lifecycle disposal, not mouse usability.

| Observation, before → after ten cycles |                  Parent |               Candidate |
| -------------------------------------- | ----------------------: | ----------------------: |
| Whole-page graph bytes                 | 79,948,678 → 80,078,111 | 81,045,615 → 81,227,788 |
| V8 heap bytes                          | 29,200,884 → 29,350,928 | 28,988,144 → 29,223,976 |
| WindowCompanions                       |                   1 → 1 |                   1 → 1 |
| WindowCompanion                        |                   5 → 5 |                   5 → 5 |
| CompanionMotion                        |                   5 → 5 |                   5 → 5 |
| CompanionBubbles                       |                   1 → 1 |                   6 → 6 |
| Native EventSource                     |                   5 → 5 |                   5 → 5 |
| Native EventListener                   |               550 → 550 |               719 → 719 |
| Native V8EventListener                 |               493 → 493 |               637 → 637 |
| Detached nodes named bh-companion      |                   0 → 0 |                   0 → 0 |

Whole-page graph delta: parent **129,433 bytes**, candidate **182,173 bytes**. These graphs include native DOM and shell objects. They are not Companion-only retained bytes. Object self sizes and cross-snapshot IDs are not used as retained-memory evidence; capture disables HeapProfiler between snapshots. Absolute heap or graph growth alone does not establish a leak.

Candidate CompanionBubbles count reflects the current composition: one shared owner and five local per-view owners (`window-companions-view.tsx` and `window-companion-view.tsx`). Bounded official retaining-path queries inspect one WindowCompanions, WindowCompanion, CompanionMotion and CompanionBubbles instance per revision, at depth 16 / 50 nodes / 3 siblings. Observed paths include mounted React props/state and current DOM event handlers. The candidate bubble query initially returned no path at depth 16; a bounded depth 32 / 100-node follow-up returned a React hook-state path while still reaching depth, node and sibling caps. This is a partial path inspection, not an exhaustive retaining-root analysis. The detached Companion query returned no matches. Counts did not accumulate over these ten cycles; the narrow class queries and one-instance paths do **not** establish that every resource or the whole application is leak-free.

## Asset costs, separate from frame and heap costs

| Rebuilt client.js | Parent bytes | Candidate bytes | Delta bytes |
| ----------------- | -----------: | --------------: | ----------: |
| JavaScript        |    2,582,922 |       2,903,626 |    +320,704 |
| gzip level 6      |      654,047 |         726,168 |     +72,121 |

Bundle SHA-256 values are recorded in the JSON. This comparison includes intervening application and Avatar changes; the delta is not the isolated cost of spring physics, mouth shapes or any one feature PR. The earlier #1166-only delta (+5,070 JavaScript / +1,193 gzip bytes) remains a separate baseline in the issue.

## Repeatable protocol and remaining qualification

1. Build the exact sources and dependencies above, install through the repository's isolated DSH launcher, and verify the real authenticated Host. Keep the candidate packed package local; it is not npm release approval.
2. Create five real QA PersonaBots and DMs through the owning Host APIs; save canonical seeded appearances named companion-performance-1 through companion-performance-5. Confirm matching recipes and portraits, then pin through the actual Channel header controls.
3. Select the native dark theme. Set 960 × 640 / DPR 1 and Chinese locale. Confirm all five streams live, no work in progress and no cards. Pause walking via existing controls, clear reading focus, settle, and capture the first GC snapshot.
4. Run ten pin/unpin cycles as described above, verify mounted counts and live streams, pause/clear reading again, settle identically, and capture the second GC snapshot. Release analyzer caches between graphs.
5. Record three idle traces, enable walking for three roaming traces, then pause walking and record three native three-drag traces. Capture state and console observations outside the timed interval. Parse actual frame events and heap graphs, inspect bounded retainers, then close the task-owned browser and tabs.

Both final collectors and the retaining-path inspector closed their owned browsers; both final collectors recorded zero console errors. Raw traces, heaps, authentication links and runtime logs remain private because they can contain profile data. The committed numerical artifact is an explicit allowlist of non-secret summaries, not a raw dump.

| #1167 acceptance area                                          | Checkpoint status                                                                                                                                            |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Sources, device, repeated idle/roam/drag, separate asset costs | Recorded, subject to the disclosed whole-page comparison limits                                                                                              |
| Same-procedure ten-cycle heap and bounded resource inspection  | Recorded for this foreground load; not a leak-free guarantee                                                                                                 |
| Concurrent real message reveal and expanded reading cost       | Still to measure against both revisions                                                                                                                      |
| Actual hidden/background → visible                             | Still unqualified: official MCP forces focused-page emulation; selecting another tab left visibilityState=visible. No synthetic hidden state was substituted |
| Bounded reconnect return, cold-start no-replay cost            | Still to measure; functional evidence alone does not qualify cost                                                                                            |
| Larger/sustained loads and supported-device envelope           | Not established by these short five-companion runs                                                                                                           |
| Human agreement on measured budgets                            | Pending; no threshold is accepted by this report                                                                                                             |

#1167 remains open. Follow-up measurements or a measured owning-module correction belong to their own reviewable change; this checkpoint does not authorize merging feature drafts or publishing the candidate Avatar package.
