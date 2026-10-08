# DSH 桌面窗口 seam fork 基线（Live2D 独立窗口的前置）

## 0. 元信息

| 项       | 内容                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 问题     | 桌面产品（Live2D 伙伴）需要独立于 DSH 主窗口的置顶/透明/可穿透窗口；DSH 插件 API 做不到，官方又暂不接受外部 PR。这个能力以什么形态维护，产品怎么接？                                                                                                                                                                                                                                                               |
| 上游来源 | `deepseek-ai/deepseek-harness` 讨论 [#8044](https://github.com/deepseek-ai/deepseek-harness/discussions/8044)（提案与进展同步）；实现分支 `BotHarness/deepseek-harness` → `feat/desktop-window-contribution`（commit `aa43257`，基于 dsh `0.1.7-rc.2` / upstream `477b4f4`）；上游 `CONTRIBUTING.zh.md`（暂不接受外部 PR）与 GitHub “An owner of this repository has disabled the ability to open pull requests”。 |
| 日期     | 2026-09-28                                                                                                                                                                                                                                                                                                                                                                                                         |
| 方法     | 在浅克隆上实现 seam，本地 `dev:desktop` 拉起 Electron 实测（两个窗口目标、surface 渲染、`/api` 状态联动），并跑 `apps/desktop` + `apps/desktop-host` + `apps/web` 单测、oxlint、翻译配对与根构建；本文区分「已验证」与「待补」。                                                                                                                                                                                   |

**一句话结论**：独立窗口能力做成 **fork 分支基线**（`BotHarness/deepseek-harness#feat/desktop-window-contribution`）——seam 必须改 shell，无法做成插件；示例仓库 `BotHarness/dsh-companion-example` 证明纯插件 API 只能到主窗口 Slot，并作为第一个 consumer 验证 fork；上游开放 PR 后按 `dsh-companion-example/docs/window-seam-pr-draft.md` 提交。

## 1. 基线是什么

- **分支**：`BotHarness/deepseek-harness` → `feat/desktop-window-contribution`（commit `aa43257`）。
- **内容**（相对 upstream `477b4f4`）：
  - `apps/desktop-host/src/windows.ts`（新）：`ctx.desktopWindows` 服务（`open(spec)` / `close(id)` / `desktop-window/closed`），私有 IPC 请求/应答 + 超时。
  - `apps/desktop/src/window-contributions.ts`（新）：建窗/校验/放置/点击穿透/销毁，最多 8 个窗口。
  - `apps/desktop/src/preload-surface.ts`（新）：surface 专用 preload（surface id + boot readiness）。
  - `apps/desktop/src/main.ts`、`host-process.ts`：接线、WebSocket 放行、退出清理、surface boot 失败容忍；`host-protocol.ts` 代际 4 → 5。
  - `apps/web/src/surface-boot.ts`（新）+ `apps/web/src/main.ts`：`?dsh-surface=<package>` 时把 boot graph 裁剪到该包依赖闭包（示例 66 → 10 条目）。
  - 文档：`apps/desktop/README(.zh).md` "Contributed windows"；测试：3 个 spec / 13 用例。
- **已验证**（2026-09-28，macOS arm64，dev 构建）：1306 tests passed、oxlint 0 errors、翻译配对 1134 pairs、根构建通过；Electron 中出现 `dsh-app://app/?dsh-surface=dsh-companion-example` 独立窗口，`#root` 渲染 surface，Host 状态经 `/api` 联动（idle → thinking）。
- **上游状态**：讨论 #8044 已同步实现进展；官方暂不接受 PR，GitHub API 也拒绝创建（与仓库设置一致）。

## 2. 为什么以 fork 分支维护

- seam 必须改 **shell 层**（`apps/desktop` 的窗口创建/权限/WS 放行）与 **client boot**（roster 过滤），都不是插件 API 能触达的边界；做成插件在结构上不成立。
- 官方明确暂不接受外部 PR；示例仓库（纯插件 API）证明了插件天花板是主窗口 Slot，正好作为需求证据与消费者。
- 代价可控：改动集中在 4 个文件 + 3 个新文件，冲突面小（见 §4）。

## 3. 本地构建与验证

```sh
cd BotHarness/deepseek-harness            # fork 浅克隆
git checkout feat/desktop-window-contribution
pnpm install
pnpm run build                            # 首次；之后可跳过
pnpm run start:desktop                    # 或 dev:desktop（含构建）
```

验证点：

1. 插件页安装 `BotHarness/dsh-companion-example`（本地路径或 `github:`）→ 开发菜单 **Restart App and Host**。
2. 出现两个渲染目标：`dsh-app://app/`（主窗口）与 `dsh-app://app/?dsh-surface=dsh-companion-example`（独立窗口，透明置顶）。
3. surface 窗口只激活 10 个 client 条目（modules / ui-renderer / ui-session / connection / api-gateway / api-remotes / session-controller / file-upload / typert-registry / 示例插件）。
4. 点 `cycle mood` 或经 `/api/companion/setMood` 改状态，两个形态同步更新。

## 4. 与上游同步策略

- fork 的 `master` 定期 merge upstream `master`；功能分支随基线 rebase/merge，并重跑 §3 的检查（`vitest` 三目录 + `lint:contracts-ready` + `verify-translation-pairing` + `build`）。
- 预期冲突面：`apps/desktop/src/main.ts`（接线点）、`host-process.ts`（消息联合）、`tsdown.config.ts`（preload 清单）、`apps/web/src/main.ts`（boot 入口）——都是小改动，按上游现状重接即可。
- 上游一旦开放 PR（或回复其他接收方式）：按 `dsh-companion-example/docs/window-seam-pr-draft.md` 提交，正文与验证命令已备好。
- 产品若先于上游落地：Live2D 版本直接基于该分支构建/打包（与 Orb 的路线相同：产品壳 fork + 持续 merge 上游）。

## 5. Live2D 产品怎么接

- **Host 插件**：`ctx.inject(['desktopWindows'], ...)` → `open({ id, surface: '<产品包名>', width, height, anchor, margin, alwaysOnTop, transparent, clickThrough })`；关闭用 `close(id)`，窗口被用户关闭时监听 `desktop-window/closed`。
- **Client 插件**：`dsh.client.inject` 声明 `@deepseek-ai/dsh-client-ui-renderer`、`@deepseek-ai/dsh-client-ui-session`、`@deepseek-ai/dsh-client-connection`（`ui-session` 提供 renderer 需要的 scope adapter），surface 模式在 `apply` 里检测 `?dsh-surface=<包名>` 并 shadow `root` slot；主窗口保留 `shell.overlay` 回退。
- **状态通道**：沿用示例的 Typert Remote + `/api`（`companion/getState` / `setMood` 换成产品服务），或用流式 Remote 替代轮询。
- **窗口行为**：`data-window-drag` 提供拖动区域；`clickThrough` 适合纯展示形态；尺寸/锚点按产品定。

## 6. 已知缺口（做产品前要补）

- 初始 combo 脚本仍整段下载（激活已按闭包过滤）；服务端按 surface 组合可再省流量。
- `excludeFromCapture` 与 Computer Use 的窗口 id 注册未接（桌面宠物的截图排除需要它）。
- 暂无 per-window preload API（关闭 / 切换输入模式 / 位置记忆）。
- 主窗口徽章与独立窗口并存的产品策略未定（示例目前两者都在）。
- 测试覆盖：manager/service/filter 已有独立 spec；`main-startup.spec.ts` 的 FakeWindow 尚未覆盖窗口贡献路径。
