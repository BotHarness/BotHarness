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
- Human window QA verified native settings read-back, task-owned Chrome opening, Pause/Resume, Human editing and independent fixture save read-back. The separate real-model authority probe below subsequently verified native approval and post-Resume observation/input.
- The first real Orchestrator dispatch returned provider `402 QUOTA: Insufficient Balance` before creating an Assignment Session. Browser calls: zero; scored comparison results and model usage: unavailable. No replacement route was silently selected and no model result was simulated.
- A proposed whole-Profile copy was rejected by automatic approval review before execution. Initialization instead used a synthetic PersonaBot's existing native Workspace Grant and fresh Assignment Sessions. No Profile/credential-store copy was performed.

The same model route became available on the later explicit dispatch check. All four real comparisons and the separate native authority probe completed on the frozen implementation below. Product Human QA and merge approval remain pending; Container qualification remains #768.

## Real PersonaBot comparison — 2026-10-04

Implementation revision: `9e60ceffa069f0ec7e4a2984251f2e43ea5eb4cd` (the subsequent change adds this report and evidence only). Both native request headers verified provider `deepseek-official`, model `deepseek-flash`, reasoning effort `high`. One synthetic PersonaBot, the same Workspace Grant and fresh native Assignment Sessions followed the previously declared current/candidate/candidate/current order. Each Session's first Browser call was approved through **Allow once**, with automatic Browser approval off and Computer Access off. No personal browser profile or credential store was used.

Each trial opened its unique two-page fixture, read QA Reader / 42 synthetic credits, saved `NOTE-ONE` and `NOTE-TWO`, listed its owned tabs and selected the original page without reloading. Independent `/state` read-back showed exactly those two saves in order for every trial. Each trial used 15 Browser calls and 7 observations, had zero Browser errors and zero retries, and completed within 20 calls / 180 seconds excluding approval wait. The model's self-report was corroborated by native tool results and independent fixture state.

| Trial | Local driver  | Independent result                              | Total wall s | Approval wait s | Wall excluding approval s | Browser call→result sum s | Observation UTF-16 chars | Observation UTF-8 bytes | chars/4 token estimate |
| ----- | ------------- | ----------------------------------------------- | ------------ | --------------- | ------------------------- | ------------------------- | ------------------------ | ----------------------- | ---------------------- |
| 1     | current       | Two required saves; original tab state retained | 66.966       | 39.645          | 27.321                    | 43.435                    | 2309                     | 2323                    | 577                    |
| 2     | agent-browser | Two required saves; original tab state retained | 44.268       | 12.645          | 31.623                    | 19.496                    | 4064                     | 4078                    | 1016                   |
| 3     | agent-browser | Two required saves; original tab state retained | 77.535       | 36.610          | 40.925                    | 52.533                    | 4064                     | 4078                    | 1016                   |
| 4     | current       | Two required saves; original tab state retained | 49.721       | 11.354          | 38.367                    | 26.274                    | 2309                     | 2323                    | 577                    |

Times come from native Session events: `turn/start` → `turn/end`, summed `approval/asked` → `approval/decided`, and each Browser `tool/call` → its matching `tool/result`. The tool sum includes approval wait; it is not pure backend execution time. Observation counts include only the returned text blocks of `browser_observe`, including the URL/title/interactive-ref wrapper. UTF-16 code units and UTF-8 bytes are distinct. The chars/4 estimate is not actual model usage and does not include system instructions, tool definitions, other messages, reasoning or cache.

Actual Assignment usage is the sum of each recorded `assistant/message.usage`, counted once per message; streaming usage is not counted again. Cache reads are repeated model-request usage, not unique context size. This provider records uncached input separately from cache reads; total equals uncached input + cache reads + output. No cache writes were recorded.

| Trial | Actual uncached input tokens | Actual cache-read tokens | Actual output tokens | Actual total tokens |
| ----- | ---------------------------- | ------------------------ | -------------------- | ------------------- |
| 1     | 14006                        | 221440                   | 1727                 | 237173              |
| 2     | 7072                         | 233472                   | 1773                 | 242317              |
| 3     | 7147                         | 234496                   | 2039                 | 243682              |
| 4     | 6612                         | 229632                   | 1814                 | 238058              |

Orchestrator dispatch is excluded from these Assignment totals. Its four successful creation turns respectively took 6.412 / 6.296 / 5.449 / 5.383 seconds and recorded total tokens 71,027 / 78,943 / 85,614 / 92,062 (uncached input 22,166 / 1,072 / 1,107 / 1,147; cache reads 48,128 / 77,184 / 83,840 / 90,240; output 733 / 687 / 667 / 675). Its subsequent Inbox-processing turns and the unscored authority probe are not comparison usage.

The earlier dispatch at 2026-10-03 21:13 UTC failed with provider `402 QUOTA: Insufficient Balance` before creating any Assignment or executing a Browser call. One explicit dispatch retry on the same route at 2026-10-04 05:41 UTC succeeded; there were no Browser-step retries or route replacements. Missing usage for that failed dispatch is unavailable, not zero. All four scored trials are shown; none was discarded. Trial 3's self-report incorrectly said no Human approval was needed; native events show its approval wait of 36.610 seconds, which is the measurement used here.

The candidate returned more observation text on this fixture (4,064 versus 2,309 UTF-16 characters), including current input values in its read-only AX text. Its safe action handles also require the shared DOM read. Both drivers completed 2/2 trials; latency varied, and this tiny cached/local sample establishes neither a universal winner nor a reason to change the default. Platform qualification is macOS arm64 only; binary discovery on other platforms is not E2E evidence.

## Separate native authority probe

A fresh candidate Assignment opened `/run/authority/one` with native approval. Human Pause remained visible in the existing Browser entry; the Human used the task-owned Chrome window to save `Human pause marker`. Read-only observation during Pause correctly remained available. An attempted `browser_type` was refused with **Browser Pause is active**. After Human Resume, another input using the previous observation was refused with **Resume requires a fresh browser_observe**. A fresh model observation read the Human marker, then fresh-ref input/click saved `BOT-RESUMED`. Independent state contained exactly the Human marker followed by `BOT-RESUMED`; neither refused `BOT-MUST-NOT-WRITE` input was saved. This probe is excluded from scored metrics.

The settings switches between scored trials stopped the prior owned runtime and changed Session authorization scope. Human Stop after candidate trial 2 returned `running: false` and an empty owned-tab list before the next dispatch. Automated real-Chrome regressions additionally covered replaced-document refs (including a same-URL reload between AX and DOM reads), owned tab closure without neighbor fallback, upload read-back, screenshot capture and cancellation cleanup. Provider/Host/process regressions cover foreign Session, Access removal, driver/target switching with failed-cleanup barriers, in-flight Pause/Resume, private native IPC and independent stream refusal; these additional edges are automated evidence, not claims of separate real-model trials.

The final frozen implementation passed lint, format, typecheck and build; the final default suite passed **2,238 tests**, with **7 skipped** (277 files passed / 4 skipped). The opt-in real Chrome suite separately passed all **4** cases. Development checks also caught an authoring mismatch where expected save requests had not been submitted, an initially ungated real-Chrome test, and a suite started during ongoing edits; all were retained as development failures, corrected, and rerun against frozen source. Review findings concerning editable-field checks, same-name native ref fallback, document coherence, content-safe errors, readiness and failed native startup cleanup were addressed before these trials.

Evidence: [current model trial](../assets/pr/767-local-driver/current-model-window.png), [candidate model trial](../assets/pr/767-local-driver/agent-model-window.png), [Human Pause](../assets/pr/767-local-driver/human-pause.png), [task-owned window before Human edit](../assets/pr/767-local-driver/human-window-before-edit.png), [model after Resume](../assets/pr/767-local-driver/resumed-model-window.png). The settings before/after pair shows the existing entry point and the saved optional driver selection. Screenshots are real synthetic QA; fixture state, not a screenshot alone, establishes completion.
