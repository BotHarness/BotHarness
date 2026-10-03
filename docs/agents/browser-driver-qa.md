# Local Browser driver qualification

[Issue #767](https://github.com/BotHarness/BotHarness/issues/767) compares the existing Local driver with the optional pinned agent-browser driver. Container qualification is [#768](https://github.com/BotHarness/BotHarness/issues/768). The default remains `current`; an available binary is not evidence of completed PersonaBot qualification.

## Human rerun

Build this worktree and start an isolated DSH Profile with the [verified launcher](../../AGENTS.md#commands). Use a synthetic PersonaBot and disposable browser profile. Do not copy a daily browser profile, another DSH credential store, or a personal login.

In Bot settings choose **Local Browser → Local driver → Default / agent-browser (trial)**. Give only the QA Bot Browser Access. Keep automatic approval off and approve its native Browser request in each fresh Session. Open its Browser entry to reveal the task-owned window. Pause lets the Human edit the same page; Resume requires the Bot to observe again. Human Stop closes owned resources. Driver changes revoke Session approval and wait for prior cleanup before replacement work.

The deterministic fixture runs with:

```sh
BH_E2E_FIXTURE_PORT=32023 python3 scripts/e2e-browser-driver-fixture.py
```

Use a unique `/run/<trial-id>/one` and `/run/<trial-id>/two` for each trial. Read `/state` and inspect the unique trial ID independently after completion: each page must have exactly one save, respectively `NOTE-ONE` and `NOTE-TWO`. A Bot saying “success” is insufficient.

Before model trials, publish the route, reasoning effort, workflow, order, limits and failure policy. The protocol for this issue is [the initial declaration](https://github.com/BotHarness/BotHarness/issues/767#issuecomment-5973446095) plus [fresh Assignment Session setup](https://github.com/BotHarness/BotHarness/issues/767#issuecomment-5973505952). Same PersonaBot, fixed `deepseek-official/deepseek-flash` with High effort, and four fresh native Assignment Sessions are used in order current/candidate/candidate/current. Each trial has a 20 Browser-call / 180-second bound excluding Human approval; the first Browser failure ends the trial without automatic retries. The Orchestrator only dispatches, and its overhead is reported separately.

1. Open page one, observe identity and balance, type `NOTE-ONE`, observe, click Save using the new ref, observe the saved result.
2. Open page two in an owned new tab, observe, type `NOTE-TWO`, observe, click Save using the new ref, observe the saved result.
3. List tabs, select the owned page-one target from that list, observe `Saved: NOTE-ONE` without reloading it.
4. Report to the Orchestrator and independently read fixture state.

Retain every attempt, including dispatch/model errors and failed development regressions. Source model/provider and actual usage come from native Assignment Session events. Report Browser calls, errors, explicit retries, elapsed time and approval wait; observation string characters and UTF-8 bytes; actual input/output/cache usage; and any separately labelled token estimate. Never substitute snapshot size for model usage or call a provider failure a Browser failure. Tiny fixture results do not establish a universal driver winner.

## Automated real Chrome regressions

```sh
BROWSER_AGENT_E2E=1 pnpm exec vitest run packages/browser/test/agent-browser.e2e.test.ts
```

Set `BROWSER_E2E_PATH` to an optional dedicated Chrome executable. With `BROWSER_E2E_EVIDENCE` set to a private directory, successful fixture interactions also save actual runtime screenshots. Tests cover both drivers, exact tab/ref ownership, refreshed refs, upload read-back, screenshots, closed-target refusal, candidate queue control checks and owned cancellation cleanup. These tests exercise runtime behavior; they do not replace real PersonaBot/model comparisons or native approval QA.

Focused Provider/Host/process tests cover owning Session refusal, Pause/Resume observation fencing, target/driver disposal failure and retry, pinned binary validation and disabling independent native interaction. Run the repository's complete lint/format/type/test/build checks before review. The [ADR](../adr/0124-local-browser-drivers-share-host-authority.md) records authority and candidate limitations.

## Current execution record

- Environment: macOS arm64; Node 24.21.0; pnpm 12.4.2; pinned agent-browser 0.38.2, upstream revision `526157cfd4ec64f45939f9ba0f10d5936aa7ac33`; both drivers use Chrome for Testing 153.0.8010.36 in dedicated task-owned profiles.
- The first candidate runtime regression failed because a compact snapshot omitted static page text and the uploaded-file result. The adapter now requests full snapshots; the same regression passed. This was a development failure, not a scored model trial.
- Human window QA also verified native settings read-back, task-owned Chrome opening, Pause/Resume, Human editing and independent fixture save read-back; native model approval and post-Resume model observation still require a functioning model route.
- The first real Orchestrator dispatch returned provider `402 QUOTA: Insufficient Balance` before creating an Assignment Session. Browser calls: zero; scored comparison results and model usage: unavailable. No replacement route was silently selected and no model result was simulated.
- A proposed whole-Profile copy was rejected by automatic approval review before execution. Initialization instead used a synthetic PersonaBot's existing native Workspace Grant and fresh Assignment Sessions. No Profile/credential-store copy was performed.

The issue stays incomplete until the real comparison and native Human QA evidence exist. Keep that completion state in the issue's task outcome, rather than interpreting passing runtime tests as full acceptance.
