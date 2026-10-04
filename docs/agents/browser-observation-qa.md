# Browser observation qualification — #787

[Issue](https://github.com/BotHarness/BotHarness/issues/787) · [claim](https://github.com/BotHarness/BotHarness/issues/787#issuecomment-5977715940) · [protocol](https://github.com/BotHarness/BotHarness/issues/787#issuecomment-5977754407) · [review addendum](https://github.com/BotHarness/BotHarness/issues/787#issuecomment-5977826890).

The default managed Browser observer now supplies current non-password/non-file form values (256 characters, explicitly marked when truncated) and applicable checked, disabled, readonly, expanded and selected states beside the existing exact refs. The optional Local candidate requests a full AX snapshot, removes only unnamed scaffolds and heading-child duplicates when safe, and retains semantic articles/dialogs/alerts/static content. Raw control values can contain unescaped line breaks in the pinned upstream renderer: those snapshots remain verbatim with a descriptive-only notice. Native refs in that text never become action handles.

The production seam is unchanged: Browser Provider → selected runtime → exact document observation → native Session Tool result. No new store, permission, default-driver change or Client component is introduced. Chrome Profile/daily adapters format optional fields when present; this trial qualifies managed Local observations only.

## Real PersonaBot comparison

All four scored trials ran the existing complex fixture through one new synthetic PersonaBot, DeepSeek official `deepseek-flash` with `high` reasoning, fresh Assignment Sessions and dedicated managed Chrome profiles, with Computer Access off. The scored Host was frozen at **4e1fe91e22ffa1a1aeb4b49a9afb1d0c3e6991a7**. Chrome for Testing 153.0.8010.36 / macOS arm64; pinned agent-browser 0.38.2; forced renderer accessibility for both drivers. Order: current / candidate / candidate / current. Each followed the search, identical Configure-button selection, quantity/city, alternate address, validation, review modal, exactly-once submit and independent reference-tab workflow from the declared protocol.

Independent fixture records establish one ORDER-001 per run: AUR-LIMITED, quantity 2, Tokyo Japan, street 1 QA Lane, note Leave with QA concierge, total 2700; one required-street refusal then one valid review; no server refusal; exactly one desk and one reference read. Native Browser results retain the original receipt, select its owned target and close only the reference. Final screenshot state has only the original desk tab. [All four metrics and independent states](../assets/pr/787-browser-observation/results.json).

| Trial | Driver        | Calls / observations | Errors / retries | Wall s  | Approval s | Wall excluding approval s | Browser call→result sum s | UTF-16 chars | UTF-8 bytes | Explicit wait ms |
| ----- | ------------- | -------------------- | ---------------- | ------- | ---------- | ------------------------- | ------------------------- | ------------ | ----------- | ---------------- |
| 1     | current       | 35 / 15              | 0 / 0            | 103.043 | 41.703     | 61.340                    | 51.179                    | 26962        | 27270       | 4200             |
| 2     | agent-browser | 36 / 15              | 0 / 0            | 69.182  | 1.373      | 67.809                    | 11.257                    | 48159        | 48456       | 4200             |
| 3     | agent-browser | 35 / 15              | 0 / 0            | 70.898  | 1.475      | 69.423                    | 15.746                    | 48159        | 48456       | 4200             |
| 4     | current       | 38 / 16              | 0 / 0            | 67.759  | 1.111      | 66.648                    | 10.547                    | 28289        | 28609       | 5000             |

All trials stayed within 50 calls / 300 seconds excluding approval. Candidate trial 2 additionally listed the owned tabs once (36 calls). Current trial 4 focused the city field, waited another 800ms and observed before typing (38 calls / 16 observations / 5000ms explicit waits, rather than the prescribed 4200ms). These are disclosed successful extra operations, not failed-step retries; that trial is functional evidence with a protocol deviation, not an exact fixed-script timing comparison. No sample was silently rerun or removed. Mean timing includes these differences and is descriptive.

| Trial | Actual uncached input | Actual cache reads | Actual output | Actual total tokens |
| ----- | --------------------- | ------------------ | ------------- | ------------------- |
| 1     | 17993                 | 711168             | 3810          | 732971              |
| 2     | 24760                 | 855936             | 3825          | 884521              |
| 3     | 24388                 | 834688             | 3877          | 862953              |
| 4     | 18751                 | 787840             | 4096          | 810687              |

These are native Assignment usage totals, including repeated cache reads; no cache writes were recorded. Orchestrator dispatch/Inbox work is excluded. UTF-16 characters and UTF-8 bytes count actual Tool observation text including URL/ref metadata; `chars/4` in JSON is only an estimate, not billed usage. Browser call→result sums include approval and explicit waits, so they do not isolate driver execution. Native events, not the model's self-reported call count, are the measurement authority.

Mean wall time excluding approval was **63.994s current / 68.616s candidate**. Both completed 2/2 functional trials. This tiny fixed-workflow sample does not establish a speed winner or justify changing the default.

## Information versus output cost

The same form stage now directly exposes:

```text
input Quantity [value="2"]
combobox Destination city [value="Tokyo, Japan", expanded=false]
input Ship to alternate address [checked=true]
input Street address [value="1 QA Lane"]
textarea Delivery note [value="Leave with QA concierge"]
button Confirm order [disabled]
```

Exact action refs precede these lines in the real output. Compare [default form before](../assets/pr/787-browser-observation/form-before.txt) and [after](../assets/pr/787-browser-observation/form-after.txt), and [candidate initial catalog before](../assets/pr/787-browser-observation/catalog-before.txt) and [after](../assets/pr/787-browser-observation/catalog-after.txt).

The initial candidate AX body decreased from **9463 to 6621 characters (about 30%)**, retaining all 57 product articles and their Configure association. Whole candidate observation text across the same 15 workflow stages decreased from the earlier #767 **49305** to **48159 characters (about 2.3%)**. The richer DOM state and conservative raw-value fallback offset much of the initial saving. The default's first 15-stage trial increased from **25504 to 26962 characters (about 5.7%)** because it now includes useful field/state information. Historical measurements are non-concurrent, and URL run names differ slightly; these are raw output-size comparisons, not a causal token/latency benchmark. See the preserved [#767 baseline report](browser-driver-qa.md).

## Revision and validation boundaries

The final runtime repair **0c228fb2** broadens the raw-value check to cover native editable/cursor hints before the value. Unit regression includes literal multiline `- paragraph` and `[ref=e2]` text after those hints; real Chrome covers both textarea and contenteditable values for both drivers. The final formatter reproduced all **30** recorded candidate AX outputs unchanged. Value-bearing outputs retain native raw snapshots; other outputs were already compacted. This establishes fixture output consistency and final regression coverage; it is not a claim that the four model turns ran at the final revision.

One pre-review current trial at 99ddf4d8 completed with 35 calls, zero Browser errors and correct independent state before the raw-value repair. Its successful outcome is retained in JSON as an unscored extra and excluded from means. No candidate model trial ran at that revision.

Final real-Chrome suite: **4/4**; focused model-text tests: **5/5**. The initial install lacked the native executable bit; installation permissions were repaired and real-Chrome checks rerun. An earlier complete-suite run overlapped the cursor repair and mixed the prior implementation with the new regression, producing its expected failure; it was not treated as a frozen-source result, and a full frozen-source run was started. No assertion was weakened. Final repository/CI results are recorded in the PR outcome.

In-app QA navigation returned ERR_BLOCKED_BY_CLIENT; native Allow once was applied through the existing Tool-approval RPC in this task-owned synthetic Profile. Native approval events and measured waits remain intact; approvals were not disabled. The Client Tool-inspector before/after capture is therefore unavailable. Text excerpts above are native Session Tool results. No Client layout changed.

## Real rendered evidence and Human review

[Before](../assets/pr/787-browser-observation/before-current.jpg) is the preserved #767 rendered Chrome result; [after current](../assets/pr/787-browser-observation/after-current.jpg) and [after candidate](../assets/pr/787-browser-observation/after-agent-browser.jpg) are independent actual 2400 × 1472 Browser observation frames after the new Assignment completed and its reference tab closed. They deliberately show the same completed synthetic task, not a visual redesign or reconstructed observation text. Order state plus native events establish completion; an image alone does not.

Open the isolated QA Browser entry, keep current as default, then inspect the trial's browser_observe results for the quoted form values and checked/disabled/expanded states. Real fixture reproduction uses `python3 scripts/e2e-browser-complex-fixture.py` and a new run path; real-driver regression uses `BROWSER_AGENT_E2E=1 BROWSER_E2E_PATH=<test-chrome> pnpm exec vitest run packages/browser/test/agent-browser.e2e.test.ts`. Use synthetic credentials/data only.

This qualification is for the declared macOS Local workflow. Unknown websites, autonomous planning, rapid reordered searches, iframe/shadow DOM, production logins and other platforms are not qualified by these trials. The PR is stacked on unmerged #781; #781 merge approval and #768 Container comparison remain separate. Pause for Human QA after PR publication.
