# Container Browser driver qualification (#768)

## Result

Both current and pinned agent-browser completed **2/2** actual PersonaBot Container trials with **35 Browser calls, 15 observations, no failed calls and no retries in every trial**. Each independently saved exactly one correct synthetic ORDER-001, rejected the empty alternate street once, selected the correct identical Configure button and Tokyo Japan option, retained the receipt across owned-tab switching, and closed only its reference tab. These four synthetic runs do not justify changing the default; both Local and Container still default to `current`.

The candidate uses the existing managed Container execution and authenticated shared RemoteViewer. No new debugger exposure, Computer permission, native interactive stream or model loop is introduced. Native action refs still come from the shared exact DOM observer.

## Declared comparison

The [protocol](../assets/pr/768-container-driver/protocol.txt) was saved before the first scored dispatch: same PersonaBot, `deepseek-official/deepseek-flash` (configured high reasoning), fresh Assignment/profile/fixture per trial, current / candidate / candidate / current, 50 calls and 300 seconds excluding native Human approval, first failure stops without retry. The complex fixture and requested steps match [Local observation qualification](browser-observation-qa.md), except the Container-reachable fixture origin and run namespace. Provider/model were verified in actual request/context events. Computer Access stayed off. Startup is included; screenshots were outside model input.

macOS arm64 Host, Docker 29.1.2 linux aarch64, actual Google Chrome **153.0.8010.52**, agent-browser **0.38.2**. Pinned image: `lscr.io/linuxserver/chrome@sha256:0614c258b65fa8acbc86d0f674efec942958b94dc341d710d27126ea3bad848c`. Local image ID: `sha256:aa1a9c21242c34fd25557f79141ed80c505228acec4b097c2ef6c67094d91a70`. This qualifies only this tested pair, not Windows/Linux Hosts or another image. The candidate runs natively on the Host and attaches through the existing loopback relay.

[Sanitized native metrics and independent fixture states](../assets/pr/768-container-driver/results.json) retain every scored trial; no private prompts, credentials or raw logs are published.

| Trial | Driver        | Calls / observations | Errors / retries | Wall excluding approval s | Browser call-result sum s | UTF-16 chars | UTF-8 bytes | Wait ms |
| ----- | ------------- | -------------------- | ---------------- | ------------------------- | ------------------------- | ------------ | ----------- | ------- |
| 1     | current       | 35 / 15              | 0 / 0            | 72.849                    | 12.513                    | 27082        | 27390       | 4200    |
| 2     | agent-browser | 35 / 15              | 0 / 0            | 70.324                    | 12.228                    | 48279        | 48576       | 4200    |
| 3     | agent-browser | 35 / 15              | 0 / 0            | 127.125                   | 69.808                    | 48279        | 48576       | 4200    |
| 4     | current       | 35 / 15              | 0 / 0            | 70.806                    | 13.566                    | 27082        | 27390       | 4200    |

| Trial | Actual uncached input | Actual cache reads | Actual output | Actual total tokens |
| ----- | --------------------- | ------------------ | ------------- | ------------------- |
| 1     | 25628                 | 708224             | 4136          | 737988              |
| 2     | 24445                 | 840704             | 4255          | 869404              |
| 3     | 24234                 | 832512             | 3935          | 860681              |
| 4     | 18189                 | 712064             | 3623          | 733876              |

Usage is the actual native Assignment total across model calls, including repeated cached context; Orchestrator dispatch and Inbox work are excluded. Cache writes were explicitly reported as zero in these trials. Missing fields would stay unknown. Character counts measure returned Tool text, including URL/ref metadata; `chars/4` in JSON is only an estimate, not billed snapshot tokens. Browser call-result sums include approval and explicit waits and are not pure driver execution time. The model self-reported 34 calls in one report; persisted events establish 35, which is the table authority.

Candidate observations contained about **78% more text** than current (48279 versus 27082 characters); AX preserves additional semantic/static context. Both succeeded without retry. Trial 3 had two 28.864s/29.785s observations while a live watch-only fullscreen Viewer was open; its 127.125s includes these delays. No causal explanation was established. Concurrent repository regression also ran during part of these trials. Timing is descriptive rather than a controlled speed benchmark.

Trial 1 preceded the graceful-close correction; trials 2–4 used corrected runtime behavior. That correction affects shutdown outside the scored Turn, with no observation/action change between trials. The later Stop/idle authorization repair also changes cleanup/approval invalidation rather than the scored workflow; final Host authority smoke is reported separately below. No sample was silently rerun or excluded.

## Failures and corrections

1. Both first unscored Container contracts failed to resolve `host.docker.internal` because this Docker Desktop uses custom DNS. A disposable preflight resolved Docker's Host gateway and read the same synthetic fixture; subsequent tests explicitly supplied `BROWSER_CONTAINER_FIXTURE_HOST`. Product networking was not changed.
2. Both next contracts reached the page, uploaded successfully, then failed immediate localStorage read-back after restart. The existing desktop shutdown could lose fresh writes. The base runtime now sends `Browser.close`, bounded to two seconds, before closing transport and ownership-checked container cleanup. Both original persistence assertions passed; disconnected and never-acknowledged close also have focused regression.
3. Code review found Stop/idle kept old Session grants and pending approvals. Stop now invalidates registrations/grants for all Bots sharing that profile before cleanup; a separate profile retains authorization. The native approval scope includes the exact current registration; late old grants are refused. Idle tabs revoke their Bot; idle runtime shutdown invalidates its profile. Idle and Tool work share the cleanup barrier, and late Human open/preview replies are fenced by Bot invalidation revision.
4. CUA bulk text insertion through Selkies only delivered its first character; discrete key presses completed the Human note. This is disclosed automation behavior; no clipboard/paste/IME claim is made. Container clipboard and file-transfer capabilities remain disabled.

## Viewer and lifecycle evidence

On the candidate's real scored trial-3 Chrome, the existing Viewer displayed Connected / Watch only in fullscreen. Enable interaction first changed Host takeover/Pause; the UI then exposed Resume / Disable interaction. Human edited the actual Delivery note to `human` through remote key events. Resume returned to Watch only. A separate real Assignment made one fresh browser_observe and read `textarea Delivery note [value="human"]`, while the original ORDER-001 receipt retained the submitted note. No second order was submitted. The [takeover image](../assets/pr/768-container-driver/viewer-takeover.png) and [fresh model observation frame](../assets/pr/768-container-driver/trial-5.jpg) show this sequence.

Real Docker contracts cover both drivers: exact owned targets and refusal of cross-tab/stale refs; actual file staging and screenshot; Viewer URL availability and release; immediate profile-storage persistence after stop/restart. Existing ownership and upload-limit regressions cover foreign container/volume refusal, unavailable Docker, 64 MiB per file / 128 MiB runtime staging and no Host filesystem mounts. Native driver interactive streaming remains disabled. Upload staging is retained until the container stops, as in current execution. Host crash/machine loss cannot guarantee unflushed writes.

Final runtime authority checks used revision `f1dbbccfc38771a50274b9eec9926b0fdc9baa6c`. A new real Assignment reached its native Browser approval; Human Stop cancelled it before opening the page. A late allowed-once decision was rejected, the persisted Tool result was `Error: Human approval was cancelled`, Browser stayed stopped, and independent fixture read-back confirmed the page was never read. See [native Stop proof](../assets/pr/768-container-driver/stop-proof.json).

After restarting that revision, a separate fresh Assignment obtained new native allowed-once approval and completed the final candidate QA preparation with **19 Browser calls, zero errors and no retries**. Its final observation and independent fixture events agree on AUR-LIMITED, quantity 2, Tokyo Japan, total 2700, empty street/note, required-street validation and **zero orders**. The actual shared Viewer is Connected / Watch only in fullscreen. See [final native and fixture proof](../assets/pr/768-container-driver/final-qa-proof.json) and [final Viewer screenshot](../assets/pr/768-container-driver/final-qa.png).

The settings [Before](../assets/pr/768-container-driver/settings-before.png) is the merged base `6321b615d60e4f5faa9995d4652af63e83d7ec20`; [After](../assets/pr/768-container-driver/settings-after.png) is the tested runtime above. Both use the same isolated Profile, Bot data, 1280×720 viewport, English, light theme and end-of-settings state. The added row naturally shifts preceding rows upward. A separate [dark-theme check](../assets/pr/768-container-driver/settings-dark.png) verifies token contrast; the original system theme was restored.

Final checks passed: lint (one unchanged warning in Client bridge), typecheck, format, docs build (306 pages), full repository regression (**2285 passed / 9 skipped**), both Release Ledger checks and ADR numbering. The opt-in real Docker contracts separately passed **2/2**; these are not included in the default skipped count. Two review axes found no remaining implementation or evidence issues.

## Reproduce and Human QA

Build the worktree with its pinned Node/pnpm and launch an isolated Profile using `scripts/dev-instance.mjs` per [the dev-loop guide](../client-bridge.md). Open Bot settings → Browser Target → Docker Browser → Container driver → agent-browser (trial). Local driver is an independent choice; neither default changes. Enable Browser Access on a synthetic QA Bot, keep Computer Access off, and grant a disposable Assignment workspace. Ask that Bot to run the complex fixture workflow using `scripts/e2e-browser-complex-fixture.py`; choose an explicit fixture Host address reachable from the Docker private network. Approve the new native Browser request.

Open Browser in that Bot DM sidebar. Click Open fullscreen, Enable interaction, edit a synthetic field, and Resume; ask the Bot to observe again and report the new field value. Stop should close the Viewer and owned container; another Bot operation must obtain fresh approval. Switching target or driver revokes the old scope and awaits disposal. The final ready state on the task-local preview is the Container Driver QA Bot, profile `container-human-qa-final`, AUR-LIMITED quantity 2 / Tokyo Japan / total 2700 with required-street validation and zero orders.

For real Docker regression:

```bash
BROWSER_CONTAINER_E2E=1 BROWSER_CONTAINER_FIXTURE_HOST=<verified-fixture-host> \
  pnpm exec vitest run packages/browser/test/container-agent.e2e.test.ts
```

The fixture Host is test configuration only. Docker Desktop's usual `host.docker.internal` default failed on this machine; use a verified reachable address instead. The test operates only its unique owned temporary profile/container. Named profile volumes are intentionally retained by production cleanup; no foreign resources are removed.
