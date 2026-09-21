# Workbench 插件与 Beautiful UI 调研：BotHarness Memory UI 可借鉴点

## 0. 元信息

| 项       | 内容                                                                                                                                                                                                                                                                                                                              |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 问题     | v1.1 Memory surface（#75 的 DSH-native UI IA + #115 的最小 Memory tracer：file list/read、一次 Human edit/save、accepted Memory Commit list 与 diff）需要复用哪些现成实现？`dsh-workbench-plugin` 的 file tree / git status / unstaged diff 实现与 beautifului.dev 的 Code Block 各有什么值得学？                                 |
| 样本     | ① `loadingvx/deepseek-harness-workbench-plugin` `9cb820c`（`dsh-workbench-plugin@0.1.37`，MIT，2026-09-17 最后 push，34 star）；② `slev12397/beautiful-ui` `c99a358`（beautifului.dev 站点源码，MIT © Shane Levine）；③ 本机 DSH `0.1.5-rc.2` 源码克隆 `/tmp/botharness-dsh-015rc2`（tag `dsh-v0.1.5-rc.2`，`fb2c4b9`）作原生对照 |
| 访问日期 | 2026-09-21                                                                                                                                                                                                                                                                                                                        |
| 调研方法 | `git clone --depth 1` 后只读源码；本文 `file:line` 均相对各仓库根。**没有安装、没有构建、没有运行任何插件或页面**；运行时行为一律标「未验证」。DSH 原生结论对照的是 pinned clone 源码，不是运行中的 Host。                                                                                                                        |
| 边界     | 不做 Memory Service / Repository 本体的设计（归 #114/#115）；不重复 diff 渲染库选型（见 `2026-09-21-code-diff-rendering.md`）；不重复插件构建/打包横向对照（见 `2026-09-19-dsh-client-ui-common-patterns.md`、`2026-09-19-dsh-community-plugins-survey.md`）。                                                                    |

**一句话结论：Workbench 插件是「第二套 IDE 面板」的完整样本，但它的数据层（Host 侧自行 `spawn('git')`、自建 `/git/*` HTTP 前缀、绕开 DSH execution world）恰好是 Memory Service 明确不能学的部分；值得学的是它的 UI 骨架与三个深模块——official `sidebar.right` 资源 tab 模式、Git 状态三分组的交互设计、`pending-review` 的 baseline/hunk-fingerprint Keep-Undo 模型。Beautiful UI 的 Code Block 是 MIT 单文件 copy-paste 组件，它的统一 diff 视觉语法（单 gutter 列、3px accent bar 绿实线/红 hatch、行 tint、`color-mix` 词级高亮、wrap 优先、copy 状态机）可以直接翻译成 DSH token 版本，但要与宿主 `DiffBlock` 契约和 `diff`(jsdiff) 计算层搭配使用，它本身只是「渲染 + 静态数据」。**

前提确认：用户所说的「Milestone 1.1 的 memory 界面」确实存在——#75（v1.1）第 3 条把 Memory 定义为 **file-first repository surface**（file list/read/edit、pin state/budget、accepted Memory Commit history 与 diff，Client 只经 Typert read model/commands 消费，不直接读 filesystem/raw Git）；最小可验收面在 #115（v1.0）的 Slice 1；#114 锁定 info architecture。

---

## 1. 样本形态：0.1.37 已经换过一次骨架

插件在 DSH `0.1.5` 引入官方右侧栏后做了一次迁移：**旧的三栏 Workbench 里，FileTree 与 EditorPane 已不再挂载**，活的 UI 是官方 `ui-sidebar-right` 的 tab。

- `FileTree.tsx`（1271 行）在 `src/` 内没有任何 importer（只有它的 CSS 被 `TreeContextMenu.tsx:8` 借用）——是参考实现，不是活代码。
- `EditorPane.tsx`（1114 行）被 `Workbench.tsx:44` import 但全文没有渲染点。
- `GitSidebar.tsx`（1402 行）是活的：由 `sidebar-right/GitPane.tsx:3,40` 挂载；diff 由 `sidebar-right/diff/DiffBody.tsx` 渲染。

这一点很重要：**读这个仓库时要区分「保留但已死的参考实现」和「正在工作的官方 seam 示例」**。下面的 file tree/editor 分析按参考实现读（交互设计仍值得学），git/diff/sidebar 分析按活代码读。

清单与打包（简）：`package.json` 里 `dsh.client = { platform: 'web', inject: ['@deepseek-ai/dsh-client-ui-tool', '…ui-conversation', '…dsh-client-locale', '…ui-input-trigger', '…ui-sidebar-right'] }`；`cordis.patch.yml` 只 insert host 半一行；client 半由 `dsh.client` 发现。构建是自包含 tsdown 双 config（host ESM / client 单文件 CJS + `__ModuleLoader__` banner + lightningcss CSS Modules + node builtin shim + 构建期 guard），与 `2026-09-19-dsh-client-ui-common-patterns.md` 已记录的路线一致，此处不展开。

---

## 2. Host 侧 Git 层（`src/host/git-service.ts` / `git-exec.ts`）

### 2.1 进程与安全底座

- 所有 git 走 `spawn('git', argv)`，不经 shell；环境写死 `GIT_TERMINAL_PROMPT: '0'`、`GIT_OPTIONAL_LOCKS: '0'`（`git-exec.ts:59-70`）——读操作不抢占 index lock、绝不弹凭据。默认 30s 超时 + AbortSignal kill（`git-exec.ts:82-90`）；fetch/pull/push 90s（`git-service.ts:587,608,627`）。
- stderr 按正则映射成 typed `GitError` code（`INDEX_LOCKED`/`NOT_A_REPO`/`AUTH_FAILED`/`DIVERGED`/`REMOTE_AHEAD`…，`git-exec.ts:25-56`），detail 先 `redactSecrets` 再截 400 字符。
- 写操作走 `GitMutex`（`mutex.ts:4-16`），但它**不是队列，是 fail-fast 抛 `BUSY`**；读操作不加锁。客户端把 `BUSY` 静默吞掉（`client/workbench/git-live.ts:55-57`）。这是「面板轮询 + 用户点击」能接受、但并发写不可依赖的方案。

### 2.2 porcelain 解析里三个必需的正确性细节

`parsePorcelain`（`git-service.ts:264-294`）用 porcelain v1：

1. `x`（index）/`y`（worktree）两列各产出一条 file entry——同一文件可同时出现在 staged 与 unstaged；`?` 单独判 untracked；`!!` 忽略。
2. **C-quoted 路径的 UTF-8 八进制解码**（`unquoteToken`，`git-service.ts:124-186`）：`core.quotePath` 默认把非 ASCII 字节写成 `\344\275\277…`，不解码的话中文文件名（记忆文件几乎必然是中文名）后续 git 命令会 `fatal: Invalid path '/344'`。注释里直接写了这个故障。
3. rename 行 `R  old -> new` 的 quote-aware 箭头切分（`parsePath`，`:188-207`）。

另外两个 diff 相关的合成技巧：空的新文件用 `emptyNewFileDiff()` 造一个带 header 的假 diff，避免被当成「无改动」（`:209-217`）；untracked 单文件 diff 用 `git diff --no-index -- /dev/null <path>` 合成（`:695-722`）。

### 2.3 命令面与「按需取 diff」

- `probe`：`rev-parse --is-inside-work-tree` → `--show-toplevel` → `status --porcelain=v1 -b` → `remote` → `rev-parse --verify HEAD`（`:373-411`）。`status()` 再跑一次 `status`——**每次 `/git/status` 实际约 6 个 git 进程，无缓存**（`git-live.ts` 每 8s 轮询一次）。这是反面教材：Memory 面板应做单次 `status --porcelain=v2 --branch` + 去抖缓存。
- status 只返回三组列表 + probe，**不预计算 per-file diff**；diff 点开时才 `GET /git/diff?path&staged=1`，返回原始 unified text（`GitDiffSnapshot {path?, staged, text, empty}`，`shared/types.ts:120-125`），客户端自己解析（`sidebar-right/diff/diff-parse.ts:3-21`）。
- `log` 用 `--format=%H%x1f%h%x1f%an%x1f%ad%x1f%s%x1f%D%x1f%P` + `--topo-order`，自解析 decorations / parents（`:65-118,446-479`）。

### 2.4 路径 jail 与限额（可直接照抄的数值）

两层：词法 `assertSafeWorkspacePath`（拒绝 `-` 开头、`..` 段，`workspace-fs.ts:54-64`）+ 物理 realpath `resolveInside`（含 macOS `/var`→`/private/var`、WSL、Windows 跨盘处理，`workspace-fs.ts:66-114`）。限额一栏表：单目录 400 项、文件 1.5 MB、图片/媒体 8 MB、搜索 200 hits/4000 visits、二进制 NUL 嗅探前 8 KiB、HTTP body 1 MB、commit prompt 60k 字符、untracked 最多 20 个×8k（`workspace-fs.ts:8-12`、`http.ts:47-63`、`commit-message.ts:6`）。这些数字对「记忆目录只有几十个 Markdown」而言是宽松上界，但分层思路值得保留。

### 2.5 HTTP 面与错误信封

单个 `server.register({kind:'prefix', path:'/git', handler})`，手写 route 字符串 switch（`http.ts:155-170`）；统一 `GitResult<T> = {ok:true,value} | {ok:false,code,messageZh,hintZh}`，ok=200、fail=400，`cache-control: no-store`（`types.ts:63-75`、`http.ts:39-45`）。**没有自己的 auth/CSRF**——信任本机 `dsh web` 边界。错误码到中英双语文案 + hint 的映射在 `shared/errors.ts:4-237`，这块是产品级细节，值得照抄格式。

### 2.6 模型工具与审批

`ctx.tools.register(defineTool({...}))`（`tools.ts:22-145`）注册 `git_status`/`git_diff`/`git_log`/`git_branch`/`git_commit`；`git_diff` 带 `presentCall: {card:'diff'}` 直接复用宿主 diff 卡片。唯一的审批在 `tools/pre-execute` 拦截 `git_commit` 返回 `{kind:'ask'}`（`tools.ts:147-151`）。工具面刻意不含 delete/reset/clean/push。

对 Memory 的提示：#115 明确 **V1 不注册任何模型可见 `memory_*` tools**，所以这段只作为「未来若开放受限写入」的 seam 参考，现在应保持不注册。

---

## 3. Git 侧边栏的交互设计（`GitSidebar.tsx`，活代码）

- **信息架构**：staged / unstaged / untracked 三组，每组带计数与批量动作（全部 stage / 全部 unstage）；行上 `+`/`−`，destructive 的 `⟲` restore 只在有意义的地方出现（`:968-1030,102-193`）。kind 字母 M/A/D/R/U/C。
- **destructive 一律 `alertdialog` 二次确认**，untracked 的文案从「discard」切换为「delete」（`:1003-1029,1166-1197`）。
- **每个按钮为什么 disabled 是一条可测试的纯函数链**：哪些按钮出现由 `shared/sync-actions.ts:2-16` 决定（dirty→commit、behind→pull、ahead→push…），为什么灰由组件内分级 reason 决定并做 tooltip（`:469-518`）。这比「一个 busy 布尔糊全部按钮」可维护得多。
- **diff 打开方式**是这次最值得抄的 seam：行点击 → 构造资源地址 `dsh-resource://git-diff/w/<ws>/f/<path>/<staged|unstaged>`（`diff/address.ts:33-41`）→ `sidebar.openResource(address, {kind, revealIfOpened, paneId})`，并顺手 `sidebar.split(paneId)` 让 git 列表与 diff 并排（`diff/open-git-diff.ts:28-92`）；commit diff 是同型地址 `/c/<hash>`。tab 类型定义用 `patterns: ['dsh-resource://git-diff/**']` + `canOpen` + `title`（`diff/definition.ts:14-30`），body 注册在 keyed slot `sidebar.right.pane.tab`（`sidebar-right/install.ts:55-68,103-111`）。
- **diff 本体是 30 行的自绘 `<pre>`**：`parseDiff` 把统一 diff 分 meta/hunk/add/del/ctx 五类（`diff/diff-parse.ts`），渲染成 `data-kind` 的 div 行（`DiffBody.tsx:80-88`）。无行号、无高亮、无 split/hunk 展开、无虚拟化——对会话内小 diff 足够，与 `2026-09-21-code-diff-rendering.md` 的建议（DiffBlock + jsdiff 计算）是同一档定位。
- 提交框：autogrow textarea、Ctrl/Cmd+Enter、`commitAll` 在无 staged 但 dirty 时切换语义（`:394-401,466,835-840`）；AI commit message 走 **NDJSON 流**（`POST /git/commit-message/stream`，`content-type: application/x-ndjson`；host `http.ts:105-143`，client `api.ts:54-122`），不是 SSE/WebSocket——小插件免基建的实用选择。Prompt 只送 staged diff（否则 unstaged + ≤20 untracked），总量 60k 截断（`commit-message.ts:208-231`）。
- Git graph 是手写 lane 算法（`graph-lanes.ts:61-121`）+ 每行内联 SVG；行高用 `ResizeObserver` 同步（`GitGraph.tsx:258-269`）。Memory 的 accepted commit history 用不上 graph，但「行高同步 + 懒加载 commit 文件列表」仍可参考。

---

## 4. 最值得移植的深模块：`pending-review`（Agent 写 → Human Keep/Undo）

这是插件里与「记忆写入需确认」（M7）与「Human edit / Agent 写走同一 accepted 边界」（#115）最同构的一段：

- 在 `tools/pre-execute` 对写类工具抓 baseline，在 `tools/result` 成功后 `noteSuccess`；**任何 capture 失败都不 veto Agent 写入**（`pending-review.ts:368-420`）。
- hunk 数学是纯函数（`shared/review-hunks.ts`）：`structuredPatch(baseline, current, {context: 3})` 重算，逐 hunk 生成 `sha1(path + index + oldText + newText)` 前 12 位的稳定 id（`:28-57`），支持 keep/undo 的 file / hunk / all 三个粒度，错误码 `REVIEW_STALE` / `REVIEW_AMBIGUOUS` 显式暴露，并用「唯一 needle 替换」实现 `applyHunkToBaseline` / `reverseHunkOnCurrent`（`:69-111`）。
- 语义上它解决的是「Agent 已落盘、Human 事后接受/回退」的 reconciliation；与 #115「只有经 Service validation 接受的 commit 才是 Memory Commit」不同——**它的机制可借，authority 不能借**：Memory 场景应由 Memory Service 在 accepted commit 边界做同样的 hash/stale 校验，Keep/Undo 只是 UI 侧的接受/拒绝入口。

---

## 5. 参考实现里的 FileTree / Editor 交互清单

FileTree 虽已不挂载，但实现完整（`FileTree.tsx`）：

- 展开才加载的单目录 RPC + `branches: Record<dir, {entries,truncated,loading,error}>` 缓存、`openDirs` map（`:35-40,167-180,358-364`）；刷新保留展开态（`:186-190`）。
- 搜索：180ms 去抖，一个 `searchFiles` RPC 返回平铺 hits，客户端 `buildFilterTree` 重组为目录树并按 `localeCompare('zh')` 排序（`shared/file-filter.ts:39-88`）；generation ref 丢弃过期响应（`:253-258`）。
- `.gitignore` 标记：host `git check-ignore -z --stdin` 批量标注（`git-ignore.ts:18-35`），客户端 `data-ignored` 置灰 + tooltip。
- 截断（>400 项）与 per-branch 错误 banner + retry、inline rename/create 的 Enter/Escape/blur、`FS_EXISTS` 撞名自动换 unique name、DnD（自定义 MIME 拖到 chat / 拖到文件夹即 move）。
- 反面：**没有 `role="tree"`、无 roving tabindex/方向键**，只是 `<button>` 列表；如果 BotHarness 自建记忆树，无障碍要自己补。

Editor（`EditorPane.tsx` + `CodeEditor.tsx`）是干净的 CodeMirror 6 深模块：`value/onChange/onSave/mode`，`Compartment` 切 plain/emacs/vim 不重挂（`CodeEditor.tsx:108-109,149-154`），`applyingRef` 防「外部 value 写回 → onChange 回声」，`drawSelection()` 注释解释了 vim 可视模式为什么需要它（`code-editor-extensions.ts:26-51`），dirty 模型就是每文件 `{original, draft}` + 关闭确认。**如果 Memory 面板要做「一次 Human edit/save」，这段是现成的**（配合 M5 的 mtime/hash 冲突拒绝，而不是它的 last-write-wins）。

---

## 6. Beautiful UI Code Block（beautifului.dev）

站点 MIT（© Shane Levine），但**没有 npm 包、没有可用的 registry**（`/r/` 实测 404，搜索结果只找到第三方 Vue/Svelte 移植）；源码在 `slev12397/beautiful-ui`，`components/primitives/CodeBlock.tsx` 单文件 233 行，copy-paste 形态。它是「一个卡片里 Code / Diff 两个变体」的展示件，`diff` props 是**已算好的 `DiffRow[]`**（`{old, cur, type, pieces}`），组件本身不做 diff 计算。

### 6.1 视觉语法（可逐条翻译成 DSH token）

| 细节         | 实现                                                                                                  | 说明                                           |
| ------------ | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 头部         | 44px 高，文件图标 + mono 文件名；diff 变体右侧 `+N -M`，code 变体右侧 Copy 按钮                       | 计数用 tabular-nums（`CodeBlock.tsx:162-190`） |
| 单 gutter 列 | 20px 宽一列：删除行用旧行号、新增/上下文用新行号（`:200-211`）                                        | unified 视图只留一列，比双列省一半宽度         |
| accent bar   | 行左 3px：add 实心绿；**del 是 45° 红斜纹 hatch**（repeating-linear-gradient，`:53,208-210`）         | 色盲/灰度下仍可区分增删，比纯色条更稳          |
| 行 tint      | add 用 `bg-green-tint`，del 用 `bg-red-tint`（`:206`）                                                | 与 token 层分离，主题化容易                    |
| 词级高亮     | `color-mix(in srgb, green/red 18%, transparent)` + `box-decoration-break: clone`（换行时背景连续）    | 只对 `change` 片段上色，`:79-105`              |
| 换行策略     | `break-words whitespace-pre-wrap`，不做横向滚动（`:212,225`）                                         | 窄面板/移动端友好；代价是代码软换行            |
| 复制状态机   | `copied` 1.5s 复位，图标在 check/copy 间切换；`raw = lines.join('\n')` 保证复制不带行号（`:146-154`） | 细节正确：行号不在复制内容里                   |
| 「高亮」     | 单个正则 + 4 种颜色（字符串/数字 orange、关键字 accent、函数调用 500 weight）（`:56-77`）             | 故意极简；不是语法高亮的正确实现，是低保真示意 |

### 6.2 取舍

- **适合**：会话内联 / 记忆面板里的小 diff（几十行、单文件），尤其是窄栏里的 unified 视图；视觉文法与我们现有 `DiffBlock`（旧/新两块照贴）可以互补——把 `diff`(jsdiff) 算出的行 + `diffWordsWithSpace` 词级片段映射成 `DiffRow`，就能直接套这套样式。
- **不适合**：大 diff（无虚拟化、无 hunk 展开、无行选择/评论）、需要语法正确的高亮（regex 只认 JS 关键字白名单）、需要 split 视图（它只有 unified）。
- 与 `2026-09-21-code-diff-rendering.md` 的结论一致：**计算层用 jsdiff，渲染层先用宿主 `DiffBlock`/自绘行；Beautiful UI 提供的是视觉参考，不是一个依赖**。落地时把它的 oklch token 换到 `--dsw-alias-*` 与宿主 add/del 色，并保持 `data-kind` 之类的状态钩子。

---

## 7. 原生 DSH 0.1.5-rc.2 已有的 seam（插件在重复造，BotHarness 可优先复用）

对照 `/tmp/botharness-dsh-015rc2` 源码（**内部契约，落地前需按 pinned 版本再核实**）：

1. **`ui-sidebar-right`**：slot `sidebar.right.pane.tab`（keyed，body）/ `sidebar.right.pane.tab.title` / `sidebar.right.tab.menu.item`；`sidebarRightTabs.register({id, kind, priority, title, guide?, patterns?, canOpen?})`；运行时 tab info 提供 `contentId` + `navigation.address/revision`；导航面 `openTab(kind,{paneId,replaceTab})`、`openResource(address,{kind,revealIfOpened,paneId})`、`split(paneId)`（`packages/client/ui-sidebar-right/src/client/contract/slots.ts:50-64,117-127`）。Workbench 的 `git-diff` tab 就是这个 API 的完整样例。
2. **`ui-sidebar-documentpreview`**：可扩展文档预览注册表 `DocumentPreviewRegistry.register({id, extensions, priority:'extension'|'builtin', title, loading:'text-pages'|'bytes-complete', wrap?})`，**extension 优先于 builtin**（`document/registry.ts:8-21,29-46,75-97`）；keyed slot `sidebar.right.tab.document`，owner 给 `{resourceAddress, content, wrap, scrollportRef}`（`document/contract.ts:21-44`）；自带 Markdown / code / image / pdf / html / text 六种 renderer。Memory 文件（Markdown + front-matter）可直接复用 Markdown renderer，只需提供内容。
3. **`ui-sidebar-files`**：官方文件树 tab（kind `files`），数据来自 Client Remote `remote.workspaceFiles.list(sessionId, path, signal)`（`ui-sidebar-files/src/client/face.ts:41-55`），点击文件走 `openResource` 交给 `dsh-resource://file` viewer（`definition.tsx:1-7`）。它读的是 raw workspace fs —— 与 #75「Client 不直接读 filesystem、不把 raw fs 当 authority」冲突，因此**可以借树组件，不能借数据源**。
4. **`resources`**：统一资源模型 `dsh-resource://<protocol>/…`，`protocolOf(address)`（`resources/src/client/resources.ts:43-65`），客户端包用 `ctx.resources.register(provider)` 注册协议 provider（`contract.ts:70-100`），消费端用标准 `useResource` hook。**这是 Memory surface 最干净的 seam**：声明一个 application-defined 协议（如 `dsh-resource://memory/…`），provider 背后接 Typert read model；文件/commit 地址可以被 sidebar tab、document preview、chat 引用共用。

---

## 8. 给 Memory UI（#75 / #115）的推荐

### 8.1 复用清单

| 需求（#115 Slice 1）    | 复用                                                                                                                     | 来源                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| Memory 文件 list/read   | 自建轻量树（lazy per-dir + debounce 搜索 + ignored/truncated 状态），数据来自 Memory Service read model                  | FileTree 交互（`FileTree.tsx`）+ 官方 files tab 的 tab 形态 |
| 文件内容渲染            | 复用 `ui-sidebar-documentpreview` 的 Markdown renderer；差异化注册一个 memory 协议 provider                              | `document/registry.ts`、`resources`                         |
| 一次 Human edit/save    | CodeMirror 6 深模块 + `{original,draft}` dirty 模型；保存用 hash/mtime 校验，冲突拒绝并展示 diff（不是 last-write-wins） | `CodeEditor.tsx`；M5 规则                                   |
| accepted commit history | 自己渲染即可：`log` 数据换成 read model 的 accepted lineage；借鉴「懒展开 commit 文件 + 点开 commit diff」的交互         | GitGraph 交互（不必借 lane 算法）                           |
| accepted diff           | 行渲染可套 Beautiful UI Code Block 视觉；计算用 jsdiff；不引入第三方 viewer                                              | §6 + `2026-09-21-code-diff-rendering.md`                    |
| Agent 变更的接受/拒绝   | baseline capture + `structuredPatch` + hunk sha1 指纹 + `STALE/AMBIGUOUS` 错误码                                         | `pending-review.ts` + `review-hunks.ts`（机制）             |
| 刷新                    | 优先订阅 Memory Service 的 Cordis accepted-commit 事件；轮询只做 fallback（不要学 8s×6 git 进程的轮询）                  | #115「accepted state commit 后通知」                        |
| 错误呈现                | `{code, messageZh, hintZh}` 三件套 + 纯函数「按钮出现/禁用原因」链                                                       | `shared/errors.ts`、`sync-actions.ts`                       |
| 危险动作                | `alertdialog` 二次确认 + danger 文案随语义切换                                                                           | GitSidebar                                                  |

### 8.2 明确不要复用

- Host 侧自行 `spawn('git')`/PTY/child_process：与 `dsh-plugin-dev` 的 Execution World 决策以及 #115「Memory Service 拥有 repository create/open/validation」冲突。
- `/git/*` 前缀 HTTP + client 直读 fs/git：Memory 的 authority 是 Service + accepted records；UI 走 Typert read model/commands（#75）。
- fail-fast `BUSY` mutex 与无缓存轮询：Memory 写路径应在 Service 内串行化并去抖。
- 官方 file tree 的 raw workspace 列表当 Memory 列表：仅当 DM session cwd 恰为 repository 时视觉上重合，也不能作为 authority。

---

## 9. 未验证清单

- 插件未安装/未构建/未运行；所有 UI 行为（轮询节奏、split pane、Keep/Undo 交互）只来自源码阅读。
- `FileTree.tsx` / `EditorPane.tsx` 在 0.1.37 已无挂载点（静态 import 检查），但未验证其是否有运行时动态引用或后续版本会恢复。
- DSH 内部契约（`sidebar.right.*` slot、`DocumentPreviewRegistry`、`resources.register`、`remote.workspaceFiles`）来自 pinned `0.1.5-rc.2` 源码，**不是官方稳定 API 文档**；实现前需按 `dsh-plugin-dev` 规则对本机 Host 复核。
- beautifului.dev 的 `/r/` registry 实测 404；组件可用性以 MIT 仓库源码为准。CodeBlock 的 `DiffRow` 输入契约是展示型，未验证与我们 `DiffHunk`/jsdiff 输出映射时的边界（换行、超长行、多 hunk）。
- Workbench 插件对非 ASCII 路径的处理（`unquoteToken`）来自其注释与测试（`tests/git-service.spec.ts` 等未逐条阅读），未在真实中文记忆目录上复现。

---

## 10. Sources

- Workbench 插件：<https://github.com/loadingvx/deepseek-harness-workbench-plugin>（pinned `9cb820c675e9aabe3421f2f52aecc15698aec6c3`，`dsh-workbench-plugin@0.1.37`，MIT）；文件：`src/host/git-exec.ts`、`git-service.ts`、`workspace-fs.ts`、`git-ignore.ts`、`http.ts`、`tools.ts`、`pending-review.ts`、`commit-message.ts`、`src/shared/{types,review-hunks,sync-actions,errors}.ts`、`src/client/workbench/{git-live,GitSidebar,FileTree,EditorPane,CodeEditor}.tsx`、`src/client/workbench/sidebar-right/{install.ts,diff/*}`；README（界面与功能矩阵）。
- Beautiful UI：<https://www.beautifului.dev/>（MIT，© 2026 Shane Levine）、<https://www.beautifului.dev/license>、源码 <https://github.com/slev12397/beautiful-ui>（pinned `c99a3586cf4fc093091feb47d3c066da1fb2e342`），`components/primitives/CodeBlock.tsx`、`app/globals.css`。
- 本机 DSH `0.1.5-rc.2`（`/tmp/botharness-dsh-015rc2`，tag `dsh-v0.1.5-rc.2`，`fb2c4b9`）：`packages/client/ui-sidebar-right/src/client/contract/slots.ts`、`packages/client/ui-sidebar-documentpreview/src/client/document/{registry,contract}.ts`、`packages/client/ui-sidebar-files/src/client/{definition.tsx,face.ts}`、`packages/client/resources/src/client/{contract,resources}.ts`。
- BotHarness 议题：<https://github.com/BotHarness/BotHarness/issues/75>（Memory surface IA，v1.1）、<https://github.com/BotHarness/BotHarness/issues/115>（Memory Repository / accepted commit tracer，v1.0）、<https://github.com/BotHarness/BotHarness/issues/114>（Workspace Grant / Assignment cwd）、<https://github.com/BotHarness/BotHarness/issues/76>（Export/Backup UX，v1.1）；`docs/botharness.md` §4 记忆规则 M1–M12。
- 站内交叉引用：`docs/research/2026-09-21-code-diff-rendering.md`（diff 计算/渲染选型）、`docs/research/2026-09-19-dsh-client-ui-common-patterns.md`（插件构建/槽位横评）、`.agents/skills/dsh-plugin-dev/`（seam 词汇与决策树）、`.agents/skills/dsh-ui/`（原生 inset 契约与 token）。
