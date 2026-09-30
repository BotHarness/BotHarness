# Issue #574 — current Memory file actions QA

Scope: [#574](https://github.com/BotHarness/BotHarness/issues/574), the first runnable slice of [#572](https://github.com/BotHarness/BotHarness/issues/572). Ordinary Workspace paths and message attachments remain subsequent tickets.

## Verified environment and evidence

- macOS, Google Chrome, pinned DSH **0.2.0-rc.1**, an isolated `web-dev` Profile and a fixture PersonaBot named **Memory Files QA**.
- Before screenshots ran base commit **28731e9** in a separate checkout. Before/after use the same Profile, fixture files, Chinese locale, dark theme and **1440 × 960** viewport. Light-theme fallback is an additional capture.
- The real browser operated the Memory Repository path, tree context menu, Shift+F10 and reader menu. Ordinary selection/expansion stayed usable; Escape restored focus to the tree item. Directory catalog entries and file associations came from the running Host.
- Finder's actual accessibility window was observed as **memory**, containing **Project notes**, after root launch. Nested-directory launch/reveal was observed as **Project notes**, with **你好 world.txt** selected at the same fixture location. These are OS observations in addition to acknowledged launch requests.
- The registered default editor, **TextEdit / 文本编辑**, opened **你好 world.txt** at that same location. Through the native editor, the content was changed to `Memory file QA — saved in TextEdit` and saved. Reader Refresh and authenticated download both returned the saved content; [after-external-save.png](after-external-save.png) shows the reader result. The disposable fixture was then restored for matched screenshots. Memory's existing external-change handling remains active.
- UI download retained **你好 world.txt** and matched the file byte for byte. Authenticated current-file transfers also matched SHA-256 for the Unicode text, six-byte binary sample and **5 MiB** binary file; see [e2e-result.json](e2e-result.json). Opening/downloading left Memory Git HEAD and working-tree status unchanged.
- Real `.git/config` and traversal downloads returned **400**, missing targets **404**, and an unauthenticated request **401**. Focused tests additionally reject wrong owners, absolute paths, escaping symlinks and links into `.git`, and verify cancelled transfers.
- A nonexistent native file application was refused by the real Session service (`gateway/internal`, `path open failed`). The menu offers only catalog/association results, not arbitrary executable input.
- A task-only Profile Patch disabled `session-controller.config.nativeOpen` and `open-in-app`; the running Host reported file opening unavailable. The real menu retained exactly Download and Copy Host path. Both current-file download and clipboard copy succeeded. [after-unavailable.png](after-unavailable.png) and [after-unavailable-light.png](after-unavailable-light.png) show the truthful fallback. The Patch was restored before Human QA.

These observations do not establish native window behavior on Windows/Linux or browser/Host co-location over an actual Tailscale or Cloudflare Tunnel deployment. Those environments were not run here. Native actions explicitly target the serving Host, and downloads target the browser device.

## Repeat the browser proof

Use an isolated Profile as described in `docs/client-bridge.md` §7. Save the launcher's `--json` output privately: it contains the login URL and must not be committed. With the Profile running, set `BH_E2E_INSTANCE` to that private JSON file and run:

```sh
node scripts/e2e-memory-file-actions.mjs
```

The driver creates its own Bot/DM and fixtures beneath that isolated DSH home. It stores captures/results/downloads in the ignored `.humanlayer/tasks/574-memory-files/e2e` directory. `BH_E2E_FIXTURE` may point to a private existing fixture JSON for a replay. `BH_E2E_CHROME` selects a Chrome executable. This native-handoff driver currently expects macOS Finder and an installed TextEdit/VS Code handler. Observe the OS window separately; a successful RPC alone proves dispatch only.

## Human QA

1. In the task's running DSH instance, choose **Bot 模式 → Memory Files QA**. Expand **工作区授权 → Memory Repository** and click its displayed path. Choose Finder or a reported editor and confirm the repository directory appears on the Host.
2. Expand **记忆文件 → Project notes**. Right-click the directory or use its More button; opening this menu must not toggle expansion. Open the directory in a reported application.
3. Click **你好 world.txt** normally: the reader opens. Click its header path or More button; confirm the default application, registered handlers, reveal, download and Copy Host path. Open the file in TextEdit and confirm the same file location.
4. Save a small change in TextEdit, then Refresh the Memory reader. Download from the menu and compare the current contents. This is the actual Memory file; existing Memory Git/change semantics apply.
5. Right-click **binary sample.bin** while another file is selected: opening the menu must not change the reader selection. Download it and **large file.bin**, checking their full bytes rather than a text preview.
6. Focus a tree row and press Shift+F10 (or the Context Menu key); use Escape and confirm focus returns. The More button is available by keyboard and on touch devices.
7. When checking an unavailable Host, apply the task-only Patch described above and restart that same isolated Profile. Confirm unavailable native actions are absent while download/copy remain available; restore the Patch afterwards. Do not infer that network access allows an application on the browser device to open a Host path.

Automated checks: integrated full suite **1389 passed, 1 existing skipped**; format, lint, typecheck and build passed. The existing optional Browser control test is skipped without its live-browser flag. The E2E driver uses waiting locators across live sidebar redraws; an initial post-integration replay hit a stale-node click before that driver correction. This slice awaits Human QA before the next ticket.
