# 2026 年代码 Diff 渲染调研：计算层、渲染库、最佳实践与 `@botharness/client` 选型

## 0. 元信息

| 项       | 内容                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 问题     | 现在（2026-09）code diff 的最佳渲染实践是什么？用哪些包？对 DSH host（`0.1.5-rc.2`）里的 React 插件 `@botharness/client`（会话内 diff / 未来整页评审）应该怎么选？                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 样本     | 计算层：`diff`(jsdiff)、`diff-match-patch`、`fast-diff`、`gitdiff-parser`、`parse-diff`、`unidiff`、`@vscode/diff`、difftastic。渲染层：`react-diff-view`、`diff2html`、`react-diff-viewer-continued`（含已死的原版）、`@git-diff-view/react`+`@git-diff-view/shiki`、`@pierre/diffs`、Monaco `DiffEditor`（`@monaco-editor/react`）、`@codemirror/merge`、`shiki`+`@shikijs/transformers`+`@shikijs/stream`、`highlight.js`/`refractor`/`prismjs`。对照产品：GitHub、GitLab、VS Code/Monaco、Sourcegraph、Zed、Pierre/DiffsHub                                                                                                                                                                                                                       |
| 版本     | 全部以 2026-09-21 当天 npm registry 的 latest 为准：`diff@9.0.0`(2026-04-13) · `diff-match-patch@1.0.5` · `fast-diff@1.3.0` · `gitdiff-parser@0.3.1` · `parse-diff@0.12.0` · `unidiff@1.0.4` · `@vscode/diff@0.0.2-0` · `react-diff-view@3.3.3`(2026-03-30) · `diff2html@3.4.56`(2026-01-31) · `react-diff-viewer-continued@4.4.0`(2026-07-14) · `@git-diff-view/react@0.1.7`(2026-07-13) · `@pierre/diffs@1.4.3`(2026-09-16) · `monaco-editor@0.56.0`(2026-07-20) · `@monaco-editor/react@4.7.0`(2025-02-13) · `@codemirror/merge@6.12.2`(2026-06-09) · `shiki@4.4.3`(2026-08-10) · `@shikijs/stream@4.4.3` · `highlight.js@11.12.0`(2026-08-12) · `refractor@5.0.0`(2025-03-11) · `prismjs@1.30.0`(2025-03-10) · difftastic `0.71.0`(2026-09-18)    |
| 访问日期 | 2026-09-21                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 调研方法 | ① `npm view` 拉 registry 元数据（版本 / 发布时间 / license / dependencies / `dist.unpackedSize`，一手）；② `git clone --depth 1` 到 `/var/folders/.../T/opencode/diffresearch/` 读源码与 package.json（pierre `b39ca57` 2026-09-18、git-diff-view `29ea072` 2026-08-13、react-diff-view `776e11d` 2026-03-30、diff2html、react-diff-viewer-continued、jsdiff `9.0.0`）；③ `npm pack` 下载 tarball 实测体积；④ 官方文档 / 工程博客 / GitHub PR 与 issue；⑤ 读取本机 DSH `0.1.5-rc.2` 源码克隆（`/tmp/botharness-dsh-015rc2`，tag `dsh-v0.1.5-rc.2`，`fb2c4b9`，2026-09-10）与 BotHarness 自身构建配置。**没有跑构建、没有把任何库真正装进插件、没有实机验证运行时行为**，涉及运行时的推断一律标「未验证」。bundle 体积除 bundlephobia 数据外均标方法。 |
| 边界     | 不含：AI 生成 patch 的服务端 diff 算法（tree-sitter 语义 diff 只做可行性判断）、终端 diff 渲染（`@git-diff-view/cli`、`delta`）、非 Web 平台。Monaco/CodeMirror 的「编辑器 diff」只在「可编辑/合并」场景里比较，不作为内联 diff 的候选。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

**一句话结论：2026 年的 diff 渲染已经分成三层——计算层几乎被 `diff`(jsdiff) 与各语言官方算法垄断，高亮层实质被 Shiki/TextMate 统一（GitHub/GitLab 之外的新库基本都在 Shiki 上），而真正的分水岭在渲染层：传统 React diff viewer（`react-diff-view`/`git-diff-view`/`react-diff-viewer-continued`）是「DOM 行 + 可选高亮 + 可选虚拟化」的展示件，新一代 `@pierre/diffs`（Shiki 原生、自带虚拟化/worker/SSR/流式/编辑入口）和产品侧（GitHub 的 TanStack Virtual + O(1) 状态、GitLab 的 SSR + `content-visibility` + HTTP 流）都在证明一件事：大 diff 的性能来自「按需渲染 + 状态扁平化 + 把高亮移出主线程」，而不是来自选哪个 viewer 组件。对 `@botharness/client`，最划算的路径是先复用宿主已有的 `DiffBlock` 契约、只补 `diff`(jsdiff) 做真行级/词级计算，全页评审再引入 `@pierre/diffs/react`；宿主 Shiki 单例存在但没有对插件暴露高亮 API（export 面已核实，通道未验证）。**

---

## 1. 需求拆解：三种 diff 场景，技术栈不同

BotHarness 的未来需求至少横跨下面三类，混用一套方案会两头不讨好：

| 场景                                 | 典型尺寸                  | 交互                                                           | 适合                                                                                  |
| ------------------------------------ | ------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| ① 会话内联 diff（工具调用 / patch）  | 1 行 ~ 几百行，单文件为主 | 只读、折叠、复制、点开某行、随消息流插入                       | 自绘轻量行渲染（`DiffBlock` 式），计算用 jsdiff，高亮可延后                           |
| ② 整页评审 UI（work session 变更集） | 数千 ~ 数十万行，多文件   | hunk 展开、文件树、viewed、评论/注解、跳转、split/unified 切换 | 虚拟化 viewer（`@pierre/diffs`、`@git-diff-view/react`）或 SSR + `content-visibility` |
| ③ 可编辑 / 合并（接受-拒绝、三方）   | 任意                      | 编辑、撤销、接受/拒绝块、冲突解决、保存                        | 编辑器栈（Monaco `DiffEditor`、`@codemirror/merge`）；`@pierre/diffs/edit` 仍标实验   |

BotHarness 当前只有场景① 的真实缺口（会话里渲染 agent 的文件改动），场景② 是「未来」，场景③ 目前没有信号。

---

## 2. 计算层：diff 算法与 patch 解析

这一层不要自己写 LCS。以下均已核对 npm registry（2026-09-21）：

| 包                 | 最新版本（发布）      | License      | 用途与关键事实                                                                                                                                                                                                                                                        |
| ------------------ | --------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `diff` (jsdiff)    | 9.0.0（2026-04-13）   | BSD-3-Clause | JS 生态事实标准：`diffLines`/`diffWordsWithSpace`/`diffChars`/`createTwoFilesPatch`/`parsePatch`。v9 起支持 Git extended headers（rename/new/delete/mode）、无 hunk 的 patch、`isGit` 字段；ES5 已弃；10.0.0 仅在 prerelease。`unpackedSize` 616 KB                   |
| `diff-match-patch` | 1.0.5（2020-05 发布） | Apache-2.0   | Google 的字符级 diff/patch，npm 上实质停更；仍被 `react-diff-view` 作为依赖（3.3.3 的 deps 里可见）。bundlephobia：19.1 KB / 6.2 KB gzip                                                                                                                              |
| `fast-diff`        | 1.3.0（2023-05-19）   | Apache-2.0   | 轻量字符级 diff，`@git-diff-view/react` 用它做 intra-line。bundlephobia：7.7 KB / 3.0 KB gzip                                                                                                                                                                         |
| `gitdiff-parser`   | 0.3.1（2023-03-14）   | MIT          | 纯 unified/git diff 解析（13.7 KB unpacked），`react-diff-view` 的输入解析器                                                                                                                                                                                          |
| `parse-diff`       | 0.12.0（2026-04-17）  | MIT          | 另一个仍在维护的 unified diff 解析器（34 KB unpacked）                                                                                                                                                                                                                |
| `unidiff`          | 1.0.4（2023-06-02）   | MIT          | 解析 + 生成统一 diff；2023 年后未再发版                                                                                                                                                                                                                               |
| `@vscode/diff`     | 0.0.2-0（2026-05-14） | MIT          | **新**：VS Code 内部 diff 算法移植，TS 默认后端 + Rust→wasm-pack 的 WASM 后端（README 自述大输入快 ~1.5–3×），`computeDiff` 返回 edits/moves/hitTimeout，带 `ignoreTrimWhitespace`/`maxComputationTimeMs`。README 明写「Experimental，勿用于生产」（438 KB unpacked） |
| difftastic         | 0.71.0（2026-09-18）  | MIT          | tree-sitter 结构 diff，CLI；`--display json` 存在但需 `DFT_UNSTABLE=yes` 且格式不稳定；无 web/WASM 库形态                                                                                                                                                             |

要点：

- **行级 diff 与词级 diff 是两个调用**：行级用 `diffLines` / `createTwoFilesPatch`，配对后的删/增行再跑 `diffWordsWithSpace`（或 `diffChars`）。`@pierre/diffs` 正是这么做的——`parseDiffFromFile` 调 `createTwoFilesPatch` 出行级结果，`renderDiffWithHighlighter` 里对配对行调 `diffChars`/`diffWordsWithSpace`（[源码](https://github.com/pierrecomputer/pierre/blob/main/packages/diffs/src/utils/renderDiffWithHighlighter.ts)）。
- **whitespace 处理在计算层而不是渲染层**：jsdiff 提供 `ignoreWhitespace`/`newlineIsToken` 等选项；VS Code 的 `ignoreTrimWhitespace`、`maxComputationTime`、`maxFileSize` 是 diff 计算器选项（[源码](https://github.com/microsoft/vscode/blob/main/src/vs/editor/browser/widget/diffEditor/diffEditorOptions.ts)）。
- **rename/binary 不要指望计算库**：jsdiff v9 能解析 git extended headers（`isGit`），但 UI 侧的「重命名/二进制/图片」是产品层分派（见 §4.4）。
- 语义/结构 diff（difftastic 路线）在 web 里没有可用的库形态；Zed 试过「用 Dijkstra 复刻 difftastic」的 syntax diff PR（[#45671](https://github.com/zed-industries/zed/pull/45671)），最终因 buffer 架构依赖而关闭/搁置。**结论：浏览器内不要考虑 tree-sitter 语义 diff。**

---

## 3. 渲染层包 landscape

先给总表（体积：bundlephobia 主入口 min+gzip，2026-09-21；失败的标「未验证」；`unpackedSize` 来自 registry，含 sourcemap/类型，不是运行时体积）：

| 包                                            | 最新版本（发布）                          | License           | 渲染方式                                                                   | 高亮                                                                  | split/unified | 虚拟化                                                                                                                 | React 适配                                            | 结论                                                                                                                                                                                                |
| --------------------------------------------- | ----------------------------------------- | ----------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `react-diff-view`                             | 3.3.3（2026-03-30）                       | MIT               | git unified diff → 解析成 hunks → React DOM 行                             | `refractor`（Prism AST）可插拔；`tokenize` 可在 worker                | ✅ 两种       | ❌ 核心无；demo 有「lazy load」                                                                                        | 纯 React，peer `react>=16.14`；70.8 KB / 23.3 KB gzip | 老牌、稳定、体积小；需要自己接虚拟化/hunk 展开；高亮要自己写 adapter                                                                                                                                |
| `diff2html`                                   | 3.4.56（2026-01-31）                      | MIT               | **输出 HTML 字符串**（`Diff2Html.html()` + 手动 `innerHTML`）              | `highlight.js`（可选，含/不含两种 bundle）                            | ✅ 两种       | ❌                                                                                                                     | 无 React 组件，需 `dangerouslySetInnerHTML`           | 静态页/服务端最省事；嵌进 React 树做交互（评论/选择）会很别扭                                                                                                                                       |
| `react-diff-viewer-continued`                 | 4.4.0（2026-07-14）                       | MIT               | `diff` + `refractor`，React DOM 行；emotion CSS-in-JS                      | `refractor` 内置 + `renderContent` 自定义                             | ✅ 两种       | ✅ `infiniteLoading: {pageSize, containerHeight, overscan}`（v4.4）                                                    | React 组件，peer 15–19                                | 开箱即用、文档友好；交互偏「展示型」（无 hunk 展开/评论模型），依赖 emotion 双包                                                                                                                    |
| `react-diff-viewer`（原版）                   | 3.1.1（2020-05-22）                       | MIT               | 同上                                                                       | 同上                                                                  | ✅            | ❌                                                                                                                     | peer 到 React 17 时代                                 | **已死**，被 continued fork 取代（npm 最后 publish 2020，元数据 2022 后未动）                                                                                                                       |
| `@git-diff-view/react`                        | 0.1.7（2026-07-13）                       | MIT               | git diff / 文件对比 → core 解析 + HAST 高亮 → 框架组件                     | 可换 `lowlight`(highlight.js)/`@git-diff-view/shiki`(Shiki 3)/`lezer` | ✅ 两种       | ❌ 无内置列表虚拟化（核心/React 包里未发现 virtualizer；README 的 worker 支持体现在示例 `ui/*-example/src/worker.ts`） | React/Vue/Solid/Svelte 多套；peer React 16.8–19       | 功能最全的传统 viewer（widget、extend data、SSR/RSC、FastDiff 模板）；主入口 330 KB gzip，偏重                                                                                                      |
| `@pierre/diffs`                               | 1.4.3（2026-09-16）                       | Apache-2.0        | 原生 DOM/HAST 渲染 + 自研 Virtualizer；vanilla + React + SSR + worker 入口 | **Shiki 原生**（自动适配主题、双主题）                                | ✅ 两种       | ✅ `CodeView`/`VirtualizedFileDiff`（已脱 beta）                                                                       | React 18/19 peer；另有 web components                 | 2026 年最「为大 diff/评审而生」：annotations、accept/reject、gutter utility、merge-conflict UI(beta)、`loadDiffFiles` 懒加载上下文、edit 入口（实验）。7.4 MB unpacked（unbundle，按需 tree-shake） |
| Monaco `DiffEditor`（`@monaco-editor/react`） | 0.56.0（2026-07-20）/ 4.7.0（2025-02-13） | MIT               | 完整编辑器双视图                                                           | Monaco/TextMate                                                       | ✅            | ✅ 编辑器窗口化 + `hideUnchangedRegions`                                                                               | `@monaco-editor/react` 只是 loader；React 只是容器    | 「可编辑/合并」场景的成熟答案；分发体积 `monaco-editor` 97.9 MB unpacked（含全部语言/worker），内联 diff 不划算                                                                                     |
| `@codemirror/merge`                           | 6.12.2（2026-06-09）                      | MIT               | CM6 `MergeView`（split）+ `unifiedMergeView`（inline）                     | CM6 Lezer（需另装 language 包）                                       | ✅ 两种       | ✅ CM6 视口渲染                                                                                                        | 无官方 React 封装；社区 wrapper 或手写                | 有 `acceptChunk`/`rejectChunk`（合并工具用），移动端/无障碍好；代价是必须接受 CM6 编辑器栈                                                                                                          |
| `shiki` + `@shikijs/transformers`             | 4.4.3（2026-08-10）                       | MIT               | 生成 HAST/HTML，不负责 diff                                                | TextMate 语法，Oniguruma(WASM) 或 JS RegExp 引擎                      | —             | —                                                                                                                      | 框架无关，官方 React 示例                             | diff-aware 装饰的事实标准（见 §4.7）；`@shikijs/transformers` 只加 class，样式自理                                                                                                                  |
| `@shikijs/stream`                             | 4.4.3（2026-08-10）                       | MIT               | 流式 token（`CodeToTokenTransformStream`，支持 recall）                    | 复用 Shiki                                                            | —             | —                                                                                                                      | 官方 React/Vue/Solid/Svelte 子入口（React peer ^19）  | LLM 边写边高亮的现成方案                                                                                                                                                                            |
| `highlight.js` / `refractor` / `prismjs`      | 11.12.0 / 5.0.0 / 1.30.0                  | BSD-3 / MIT / MIT | 传统高亮，逐 token 生成 HTML                                               | 各自语法                                                              | —             | —                                                                                                                      | refractor/prism 需要自己接进 React                    | `refractor` 5（38.5 KB gzip）是 `react-diff-view` 的默认搭配；`highlight.js` 5.5 MB unpacked                                                                                                        |

体积说明（方法标注）：

- bundlephobia（第三方但基于真实打包）：`react-diff-view` 70.8 KB→23.3 KB gzip；`react-diff-viewer-continued` 155 KB→51.4 KB gzip；`diff2html` 44.7 KB→12.7 KB gzip；`@git-diff-view/react` 1.11 MB→330 KB gzip；`shiki` 208.7 KB→64.8 KB gzip；`monaco-editor` 167 KB→25 KB gzip（**只是主入口，不含语言/worker，勿当作实际成本**）；`refractor` 113 KB→38.5 KB gzip；`prismjs` 18.9 KB→7.1 KB gzip；`diff-match-patch` 19.1 KB→6.2 KB；`fast-diff` 7.7 KB→3.0 KB。`diff`、`gitdiff-parser`、`parse-diff`、`highlight.js`、`@codemirror/merge`、`@shikijs/*` 因 bundlephobia 限流未取到，**未验证**。
- `npm pack` tarball 实测（包含所有子包/类型/map）：`@pierre/diffs` 1.9 MB tgz / 9.6 MB 解压；`@git-diff-view/react` 203 KB tgz；`diff2html` 541 KB tgz（其中 `bundles/` 1.5 MB 是带 highlight.js 的预打包）。

---

## 4. 最佳实践

### 4.1 行级 vs 词/字符级 intra-line

- 实践共识：**行级 diff 决定布局，词/字符级只做「配对行内」的强调**，不要用字符级 diff 决定行结构。
- 实现范式（有源码）：行级用 `createTwoFilesPatch`（jsdiff）→ 配对相邻的 -/+ 行 → 在「高亮后的 token 序列」上跑 `diffWordsWithSpace` / `diffChars`，只给变化片段加背景（pierre `renderDiffWithHighlighter.ts:284-285`）。
- VS Code/Monaco 用 `computeMoves` + `renderIndicators` 表达块移动；Zed 的 word diff 把「计算、缓存、后台线程」作为三个硬要求，并限制「只在展开的 hunk 且行数 < 5 时」计算（[PR #43269](https://github.com/zed-industries/zed/pull/43269)，2025-11-21）——这是很值得抄的成本门槛。
- 反面：`react-diff-viewer-continued` 的 `disableWordDiff` 默认开启词 diff（README 参数表），对长行/大 diff 是隐性开销。

### 4.2 unified vs split

- 两种视图都是标配；2026 的关键是**切换不能触发整页刷新/重取数据**（GitHub changelog：切换 split/unified 不再刷新页面，[2026-01-22](https://github.blog/changelog/2026-01-22-improved-pull-request-files-changed-page-on-by-default/)；GitLab Rapid Diffs 用服务端 HTML 重放整列表，[docs](https://docs.gitlab.com/development/fe_guide/rapid_diffs/)）。
- 数据模型上要支持「一份行数据、两种渲染」（GitLab 早年就从「inline/side-by-side 两种请求」改成一份标准行数据，[frontend 文档](https://docs.gitlab.com/development/merge_request_concepts/diffs/frontend/)）。
- VS Code 与 Zed 的默认都是 split；GitHub 保持两者；内容密集的窄栏（会话内嵌）用 unified 更实际。

### 4.3 展开上下文 / hunk 折叠 / 懒加载全文

- GitHub：`Expand Up`/`Expand Down`、`Expand all`、`Collapse expanded lines`（我在公开 PR 页面 HTML 里实测到这些 `aria-label`，[样本页](https://github.com/kpdecker/jsdiff/pull/697/files)，2026-09-21）。
- GitLab：hunk header 点击展开上下隐藏行，服务端渲染，客户端只做交互（[Rapid Diffs](https://docs.gitlab.com/development/fe_guide/rapid_diffs/)）。
- `@pierre/diffs`：`hunkSeparators: 'line-info'` 点击展开 + `loadDiffFiles` 按需拉取全文来「补齐 patch 之外的上下文」（[release notes v1.3.0](https://github.com/pierrecomputer/pierre/releases)）。
- 会话内联 diff 的通用形态不是「展开上下文」，而是**中段折叠**：只留头尾（DSH `DiffBlock` 的 `headLines/tailLines` 就是这种；GitHub 的 `Collapse added diff lines` 同理）。

### 4.4 空白、重命名、二进制

- 空白：VS Code 暴露 `ignoreTrimWhitespace` / `maxComputationTime` / `maxFileSize`（[源码](https://github.com/microsoft/vscode/blob/main/src/vs/editor/browser/widget/diffEditor/diffEditorOptions.ts)）；Zed 的 side-by-side 第一版直接把 whitespace 模式列进「缺失功能」（[PR #40014](https://github.com/zed-industries/zed/pull/40014)）。做法：把空白模式做成用户设置，默认隐藏纯空白变更。
- 重命名/模式变化/二进制/图片：产品层分派，不要挤进 diff 组件。GitLab 的 Vue 渲染图里有 `isRenamed`/`isModeChanged`/`isImage`/`download`/`no_preview` 五类 viewer，并且「重命名/模式变化」不渲染行 diff（[frontend 文档](https://docs.gitlab.com/development/merge_request_concepts/diffs/frontend/)）；GitHub 给 markdown/`.svg` 提供 source↔rich 切换、图片给 2-up/swipe/onion-skin（[changelog 2025-07-31](https://github.blog/changelog/2025-07-31-pull-request-files-changed-public-preview-experience-july-31-updates/)）。
- 大文件降级：GitLab `Gitlab::Highlight.too_large?` 时直接 plain（[lib/gitlab/highlight.rb](https://gitlab.com/gitlab-org/gitlab/-/raw/master/lib/gitlab/highlight.rb)）；GitHub 新 Files changed 只显示前 300 个文件，超出请回经典视图（changelog 同前）；DSH `DiffBlock` 用 `maxLines` 折叠。

### 4.5 性能：虚拟化、组件粒度、状态扁平化

GitHub 2026-04 的工程博客给了一组罕见的完整数字与方法（[blog](https://github.blog/engineering/architecture-optimization/the-uphill-climb-of-making-diff-lines-performant/)，2026-04-03）：

- v1 → v2：每条 diff 行的 React 组件 8→2；unified 每行 ~10 个 DOM 元素、split ~15 个（不含高亮 span）；每行 20+ 事件处理器 → 单个顶层委托 handler + `data-attribute`；评论/菜单状态下移到条件渲染的子组件；`useEffect` 只允许出现在文件顶层；全局状态改 `Map` 做 O(1) 查询（`commentsMap[path]['L8']`）。
- 效果（10,000 行 split diff）：INP ~450 ms → ~100 ms，内存 ~150-250 MB → ~80-120 MB，渲染组件数 ~183,504 → ~50,004。
- p95+ 大 PR：**引入 TanStack Virtual**，JS heap/DOM 节点 ~10× 下降，INP 275-700+ ms → 40-80 ms；**只在最大的 PR 上开虚拟化**（[changelog 2026-02-05](https://github.blog/changelog/2026-02-05-improved-pull-request-files-changed-february-5-updates/)）。
- 服务端：只 hydrate 可见 diff 行。

GitLab 走了反方向但同样有据：放弃虚拟滚动，改**服务端渲染 + `content-visibility: auto` + HTTP 流式**（首屏 HTML 直出，其余 diff 文件流式补；`content-visibility` 用「服务端给行数」预留空间），理由是虚拟滚动伤害 Command+F / 全选 / 打印 / 扩展（[Rapid Diffs 文档](https://docs.gitlab.com/development/fe_guide/rapid_diffs/)、[handbook 设计文档](https://handbook.gitlab.com/handbook/engineering/architecture/design-documents/rapid_diffs/)）。

对 BotHarness 的翻译：**内联 diff 不需要虚拟化（有 `maxLines` 折叠就够）；整页评审必须有虚拟化或 SSR 二选一**，并且要预先设计「浏览器查找/选择被破坏」的替代方案。

### 4.6 流式：agent 还在写的时候

- Shiki 官方给了 `@shikijs/stream`：`CodeToTokenTransformStream` 把文本流变成 token 流，`allowRecalls: true` 时发「recall」token 让消费端回退 N 个 token 再重绘（因为高亮上下文会变），并带 React/Solid/Vue/Svelte 的 `ShikiStreamRenderer`（[docs](https://shiki.style/packages/stream)，2026-08-10 版）。
- `@pierre/diffs` 用同一思路自建：`FileStream` + 内部 `shiki-stream`，先渲染纯文本、高亮由 worker pool 异步回填（[On Rendering Diffs](https://pierre.computer/writing/on-rendering-diffs)，2026-05-29；[FileStream 源码](https://github.com/pierrecomputer/pierre/blob/main/packages/diffs/src/components/FileStream.ts)）。
- 关键实践：**diff 不要等流结束再算**——行级 diff 只对「已闭合的行」增量算；未闭合的尾行先纯文本/中性色，闭合后再定性并且要允许「撤销上一帧」（recall/重算）。
- DSH 宿主里已有同类先例：`StreamingHighlightSession`（`packages/client/ui-primitives/src/markdown/highlight.ts`），说明「边流边高亮」在宿主环境是已验证可行的。

### 4.7 高亮选型：Shiki/TextMate vs Prism vs CodeMirror/Lezer vs Monaco

| 方案             | 语法来源                   | 成本                                                                                          | 适合                                               |
| ---------------- | -------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Shiki            | TextMate（VS Code 语法）   | Oniguruma WASM（默认引擎）或 JS RegExp 引擎（浏览器推荐，无 WASM）；按语言动态 import grammar | 静态/服务端/流式高亮，主题一致性最好；新库默认选它 |
| Prism/refractor  | Prism                      | 极轻（`prismjs` 7.1 KB gzip），但语法质量与主题生态落后                                       | 只需要「大致着色」且预算极紧                       |
| highlight.js     | 自带语法                   | 语言包体积大（5.5 MB unpacked），子集打包可行                                                 | `diff2html` 传统搭配                               |
| CodeMirror/Lezer | 增量解析器（Lezer）        | 需要编辑器运行时；解析质量靠 language 包                                                      | 已经用 CM6（或要合并/编辑）时顺带复用              |
| Monaco/TextMate  | TextMate（VS Code worker） | 97.9 MB 分发 + worker；语言按需加载                                                           | 已经上 Monaco 时                                   |

Shiki 的关键机制（官方文档核实）：

- 两个引擎，**默认是 Oniguruma WASM**；浏览器/控体积场景用 `createJavaScriptRegexEngine()`，代价是严格模式（无法转换的语法会抛错，可 `forgiving`）；截至 3.9.1 内置语言全部支持 JS 引擎（[RegExp Engines](https://shiki.style/guide/regex-engines)、[Best Performance](https://shiki.style/guide/best-performance)）。
- diff 相关装饰都在 `@shikijs/transformers`：`transformerNotationDiff`（`// [!code ++]`/`[!code --]` → `.line.diff.add/.remove`，`pre.has-diff`）、`transformerNotationHighlight`、`transformerNotationWordHighlight`、`transformerNotationFocus`、`transformerNotationErrorLevel`、`transformerRenderWhitespace`、`transformerRenderIndentGuides`、`transformerRenderLineNumber`、`transformerMetaHighlight`、`transformerStyleToClass`（把内联 style 变成可复用 class → 便于 CSP/缓存）；transformers 只加 class，不提供样式（[文档](https://shiki.style/packages/transformers)）。
- **先 diff 还是先高亮**：两种都成立，但主流是「先高亮（整文件/两边），再在已高亮的 token 上算行级+词级 diff，最后合并 token 与 diff 区间」（pierre、git-diff-view 的 HAST 管线都是这个序）；`transformerNotationDiff` 那条路是「用注释标记 → 一次 codeToHtml」，适合服务端一次性把带 +/- 的代码块渲成高亮 HTML，不适合已解析的 git patch。
- 主题：Shiki 支持双主题（CSS 变量 `--shiki-dark/--shiki-light`）与 `transformerStyleToClass`；DSH 宿主已用 CSS 变量主题 + JS 引擎 + 白名单 grammar，这是可以对齐的现成范式。

### 4.8 交互与可访问性

- GitHub 在静态 code view 里的做法（[Crafting a better, faster code view](https://github.blog/engineering/architecture-optimization/crafting-a-better-faster-code-view/)，2023-06-21）：一个**不可见、含全文的 `<textarea>`**（可键盘导航/可选中/可被浏览器查找，屏幕阅读器友好）+ 一层虚拟化高亮覆盖层（对鼠标和 find 不可见）。文字用 `data-` 属性 + 伪元素逐字符注入来避免被 find 命中。这个方案同时解决了「虚拟化和 Command+F / 全选」的矛盾，代价是滚动同步与多浏览器适配（[a11y 复盘](https://github.blog/engineering/user-experience/accessibility-considerations-behind-code-search-and-code-view/)）。
- 老一代把代码/表格当 `<table>` 的语义对屏幕阅读器很不友好（同上 a11y 文章）；GitHub 现在 diff 行不是 table 语义——我在公开 PR 页实测不到 `role="table"/"grid"`，只有大量带 `aria-label` 的按钮（`Collapse added diff lines`、`Expand Up/Down`、`Diff settings`…）与文件树 `role="tree"/"treeitem"`（[样本页](https://github.com/kpdecker/jsdiff/pull/697/files)，未登录状态，单样本）。
- 行级操作：复制行/范围、按行评论（GitHub「comment on any line」+ 评论状态 O(1) 查询，changelog/blog 同前）、拖拽多选（`data-attribute` 委托）、键盘 `P`/`N` 在提交间跳转、行号点击选择。
- GitHub 新 Files changed 明确列入的可访问性项：键盘导航、屏幕阅读器 landmark、行距设置（[changelog 2026-01-22](https://github.blog/changelog/2026-01-22-improved-pull-request-files-changed-page-on-by-default/)）。
- 移动端：GitHub 2026-02 专门修小屏溢出/布局；CodeMirror 6 的移动端支持是它取代 Monaco 的理由之一（[Replit 迁移博客](https://replit.com/blog/codemirror)）。

### 4.9 上限与降级

统一模式：**不试图渲染一切**。

| 产品/库         | 降级策略                                                                |
| --------------- | ----------------------------------------------------------------------- |
| GitHub          | 最大 PR 才开虚拟化；新页面上限 300 文件；提示可回经典视图               |
| GitLab          | 服务端 `too_large?` → 不做高亮；文件数上限 + 「one file at a time」偏好 |
| DSH `DiffBlock` | `maxLines`（默认 16，chat 行 8）折叠中段，头尾各半                      |
| pierre          | 纯文本先出 + 后续高亮回填 + `loadDiffFiles` 懒加载上下文                |

---

## 5. 谁在用什么（证据）

| 产品            | 渲染                                                                                                                                         | 高亮                                                                                                               | 虚拟化                                          | 证据（一手）                                                                                                                                                                                                                                                                                                                                                                           |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub          | React（从 Rails 经典视图移植）；v2 后每行 2 个组件、顶层事件委托、`Map` O(1) 状态、服务端只 hydrate 可见行                                   | 自建 syntax highlighting service，输出「每行 HTML / 只含位置+class 的片段」（引擎未披露，**未验证**是否 TextMate） | TanStack Virtual，只在 p95+ 大 PR 开            | [blog 2026-04-03](https://github.blog/engineering/architecture-optimization/the-uphill-climb-of-making-diff-lines-performant/) · [changelog 2026-02-05](https://github.blog/changelog/2026-02-05-improved-pull-request-files-changed-february-5-updates/) · [code view blog 2023-06-21](https://github.blog/engineering/architecture-optimization/crafting-a-better-faster-code-view/) |
| GitLab          | **Rapid Diffs**：服务端 ViewComponent 渲染 HTML 表行 + Web Components（`<diff-file>`）+ HTTP 流式；客户端只做交互（adapter），不再用虚拟滚动 | 服务端 **Rouge**（`Rouge::Formatters::HTMLGitlab`）；客户端不做高亮                                                | 反虚拟化：`content-visibility: auto` + 行数预留 | [Rapid Diffs 文档](https://docs.gitlab.com/development/fe_guide/rapid_diffs/) · [highlight.rb](https://gitlab.com/gitlab-org/gitlab/-/raw/master/lib/gitlab/highlight.rb) · [frontend 文档](https://docs.gitlab.com/development/merge_request_concepts/diffs/frontend/)                                                                                                                |
| VS Code/Monaco  | `DiffEditor`（双编辑器 + unchanged regions 折叠）；diff 计算在 worker                                                                        | TextMate（Monaco）                                                                                                 | 编辑器视口渲染                                  | [diffEditorViewModel.ts](https://github.com/microsoft/vscode/blob/main/src/vs/editor/browser/widget/diffEditor/diffEditorViewModel.ts) · [adopt @vscode/diff #316990](https://github.com/microsoft/vscode/issues/316990)                                                                                                                                                               |
| Sourcegraph     | 2022 起从 Monaco 迁 **CodeMirror 6**（file viewer 用 CM6 视口渲染）；新 compare page（GA 2026-07-20）                                        | CM6 Lezer                                                                                                          | CM6 内置                                        | [迁移博客](https://sourcegraph.com/blog/migrating-monaco-codemirror) · [compare page GA](https://sourcegraph.com/changelog/compare-page-ga)                                                                                                                                                                                                                                            |
| Zed             | Rust/GPUI 原生；`buffer_diff` 用 `git2` patch 出行级 hunk；side-by-side 用双 Editor + 自定义 paint 层                                        | 编辑器自身 Tree-sitter/语法层；语法感知 diff 仍是实验                                                              | 编辑器窗口化；大文件是原生 buffer               | [Native Git support](https://zed.dev/blog/git) · [buffer_diff.rs](https://github.com/zed-industries/zed/blob/main/crates/buffer_diff/src/buffer_diff.rs) · [word diff PR #43269](https://github.com/zed-industries/zed/pull/43269) · [side-by-side PR #40014](https://github.com/zed-industries/zed/pull/40014)                                                                        |
| Pierre/DiffsHub | 用自家 `@pierre/diffs` 把 `github.com` 换成 `diffshub.com` 渲染任意公开 PR/commit/compare                                                    | Shiki                                                                                                              | 自家 CodeView/Virtualizer                       | [DiffsHub](https://diffshub.com/) · [diffs.com/docs](https://diffs.com/docs)                                                                                                                                                                                                                                                                                                           |

补充观察：GitLab 正在删除旧 Vue diff app 与 HAML partial（[issue #602721](https://gitlab.com/gitlab-org/gitlab/-/work_items/602721)），说明「SSR + 渐进增强」是他们下注的方向；Sourcegraph 的「Monaco → CodeMirror」和 Replit 的同款迁移（[Replit 博客](https://replit.com/blog/codemirror)）都提到 Monaco 的全局状态、移动端与体积问题。

---

## 6. DSH 宿主与 BotHarness 现状（源码级核查）

对照的是本机 DSH `0.1.5-rc.2` 源码克隆（tag `dsh-v0.1.5-rc.2`，`fb2c4b9`，2026-09-10）。以下都读了源码：

1. **插件能拿到什么模块**：宿主 web shell 的冻结模块表只有 9 个 specifier——`react`、`react/jsx-runtime`、`react-dom`、`react-dom/client`、`@deepseek-ai/cordis`、`@deepseek-ai/dsh-client-store`、`@deepseek-ai/dsh-client-ui-slots`、`@deepseek-ai/dsh-client-ui-primitives`、`@deepseek-ai/dsh-client-ui-dockkit`（`packages/client/web/src/seed.ts:29-44`，`PLATFORM_MODULES` 在 `platform.ts`）。**没有 `shiki`。**
2. **宿主已经有 `DiffBlock`**（`packages/client/ui-primitives/src/DiffBlock.tsx`，206 行）：
   - 输入是 `DiffHunk { path, oldText: string|null, newText: string }`；
   - 渲染是「先整块旧文本（`del` 行）再整块新文本（`add` 行）」——**没有行级 LCS**，也没有行号、没有词级高亮、没有语法高亮；
   - 有 `maxLines` 中段折叠（默认 16，`FoldToggle`）、复制整卡（`-`/`+`/path/`⋯` 前缀）、`diffTotals()` footer（`+A -R · N files`）。
   - `ui-tool` 已经有消费方：`diff-card-model.ts` 从 `write`/`edit`/`str_replace_editor` 参数与 `meta.diffs` 派生 `DiffHunk`，chat 行用 `CHAT_DIFF_MAX_LINES = 8`。
3. **宿主 Shiki 单例存在但未对插件导出**（`ui-primitives/src/markdown/highlight.ts`）：`createHighlighterCoreSync` + `createJavaScriptRegexEngine`（无 WASM）、启动只装 TS/shell/JSON 三个 grammar、其余 23 个语言 `@shikijs/langs` 动态 import（注释自述懒加载集 ~1.6 MB）、CSS 变量主题；文件导出 `highlightToHtml` / `highlightLines` / `StreamingHighlightSession` / `supportsHighlighting` 等，**但这些都没有出现在包根 `index.ts` 的 export 列表里**（`index.ts` 只导出组件与工具；`package.json` 有 `./src/*` 子路径）。插件通过模块表只能 `require('@deepseek-ai/dsh-client-ui-primitives')`（包根），因此**「插件复用宿主 Shiki」目前没有官方通道——未验证是否有可用的绕过方式**。
4. **BotHarness 的构建把其余依赖全部内联**：根 `tsdown.config.ts` 的 `PLATFORM_MODULES` 与上表一致作为 `external`，`lib/client.js` 是 CJS factory，其余全部打进 bundle；`packages/client/package.json` 已 pin `@deepseek-ai/dsh-client-ui-primitives: 0.1.5-rc.2`（devDependency + 构建期类型）。
5. **结论：会话内 diff 的真实缺口是**——① 真行级 diff（现在是 old/new 两块照贴，`edit` 工具的 `old_string`/`new_string` 经常只是片段，贴出来会误导）；② 行号与词级高亮；③ 语法高亮；④ 单文件大 patch 的按需展开（现在只有中段折叠）。

---

## 7. 推荐（给 `@botharness/client`）

### 7.1 决策矩阵

| 场景                              | 首选                                                                                                      | 次选                                                            | 不建议                                                                         |
| --------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| ① 会话内联 diff（现在就要）       | **`DiffBlock`（宿主已给，0 新增包）+ `diff`(jsdiff) 只做计算**；把 `DiffHunk` 当渲染契约                  | 自己绘行 + `@shikijs/transformers` 的 `transformerNotationDiff` | `@pierre/diffs` 整套（体积/worker 与内联场景不匹配）、diff2html（HTML 字符串） |
| ② 整页评审 UI（未来）             | **`@pierre/diffs/react`**（Shiki 原生、虚拟化、annotations、accept/reject、SSR、worker pool、Apache-2.0） | `@git-diff-view/react` + `@git-diff-view/shiki`                 | Monaco（太重）、`react-diff-viewer-continued`（无 hunk 展开/评论模型）         |
| ③ 可编辑/合并（如果真要做）       | `@codemirror/merge`（`acceptChunk`/`rejectChunk`，移动端好）或 Monaco `DiffEditor`                        | `@pierre/diffs/edit`（实验）                                    | 自研                                                                           |
| 服务端/静态生成（docs、导出报告） | `diff2html` + highlight.js（或 Shiki 预渲染）                                                             | Shiki + `transformerNotationDiff`                               | —                                                                              |

### 7.2 推荐路径（分三步）

1. **第一步（今天可落地，零新增大包）**：用 `diff`（jsdiff，BSD-3）做 `diffLines` + `diffWordsWithSpace`，二选一落地：**(a) 零渲染改动**——把 `edit`/`str_replace_editor` 的 `old_string`/`new_string` 先用 jsdiff 归一成「只含变化块的最小 old/new 片段」，再喂给宿主 `DiffBlock`（它本来就是「先旧后新」的渲染，喂对了片段视觉立刻变准）；**(b) 自绘行组件**——若要行号/词级高亮/hunk 分块，就沿 `DiffBlock` 的 props 形状自己绘行，把 `DiffHunk` 当数据契约。两者都不破坏宿主卡片视觉、不新增 React peer。
2. **第二步（补高亮，先走「确定性最高」的路）**：先向 DSH 上游要一个公开的高亮 API（宿主已经有单例与 grammar 白名单，缺的只是 `index.ts` 导出或一个 service；这是最小上游改动，也避免插件各自打包 Shiki）。在此之前，若必须自带，选 `shiki` 的 **JS RegExp 引擎 + 按语言动态 import + 进程内 LRU**，只允许 BotHarness 关心的语言白名单，并对「未加载完/未知语言」回退纯文本——**完全对齐宿主已有实现**，这样未来切换到宿主单例时行为不变。
3. **第三步（等真有整页评审需求再引）**：`@pierre/diffs/react` + `@pierre/diffs/worker`（worker 是否能在 DSH module-loader/CSP 下加载**未验证**）。若 worker 不可用，就用它的 SSR 入口在 host 侧预渲染，或退回「无虚拟化 + `content-visibility` + 上限」。

### 7.3 集成风险

| 风险                          | 说明                                                                                                                                                                                                            | 缓解                                                                                                         |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 插件 bundle 无额外 externals  | BotHarness 只 external 宿主那 9 个模块，其他全部内联；`@git-diff-view/react` 330 KB gzip、Shiki+grammar 数百 KB 会直接进 `lib/client.js`                                                                        | 内联场景只用 `DiffBlock` + jsdiff；高亮走宿主 API；整页评审单独做 lazy 子包或要求宿主提供 Shiki              |
| Shiki 版本重复                | 宿主在 `ui-primitives` 的 devDependencies 里锁 `shiki ^4.3.1` + `@shikijs/langs ^4.3.1`（随客户端 bundle 打包）；`@pierre/diffs` 依赖 `shiki ^3 \|\| ^4`；`@git-diff-view/shiki` 依赖 `shiki ^3.23`（会拉 3.x） | 选 `shiki ^4` 兼容的库；避免同时装多个 shiki 主版本；用 `pnpm.overrides` 或宿主单例                          |
| 宿主契约漂移                  | `DiffBlock`/`DiffHunk` 是 `0.1.x` 的包内契约，BotHarness 只 pin 了 `0.1.5-rc.2`；DSH 升级可能改签名                                                                                                             | 在 `@botharness/client` 内做一层「DiffCardModel → 行模型」的适配层（类似 `ui-tool` 的 `diff-card-model.ts`） |
| 私有 API / 未导出面           | 宿主 Shiki 与 `StreamingHighlightSession` 现在不可从包根拿到；`./src/*` 子路径是否能在模块表下解析**未验证**                                                                                                    | 不要依赖未导出面；向 DSH 提 issue 要求公开 highlighter API（或接受自己打包）                                 |
| Worker/CSP/module-loader 限制 | `@pierre/diffs` 的 worker 入口是 ESM worker；DSH 插件是 CJS factory + `__ModuleLoader__`，能否 `new Worker(...)`/`importShikiWasm` 取决于宿主 CSP 与 origin                                                     | 做最小 spike 验证；失败则用 SSR/主线程 + 上限                                                                |
| React 版本                    | 宿主与 BotHarness 都是 React 18；`@pierre/diffs` peer 支持 18/19；`@shikijs/stream/react` peer 要求 React **^19**（若用官方 React 流式渲染器需自行封装）                                                        | 内联流式沿用宿主 `StreamingHighlightSession` 思路自绘；不引 `@shikijs/stream/react`                          |
| License                       | 候选都在宽松许可：Apache-2.0（pierre、diff-match-patch、fast-diff）、MIT（多数）、BSD-3（jsdiff、highlight.js）；无 GPL/AGPL 风险                                                                               | 记录进 `THIRD_PARTY_NOTICES.md`                                                                              |
| a11y / 浏览器查找             | 虚拟化会破坏 Command+F、全选、打印（GitHub 与 GitLab 都踩过）                                                                                                                                                   | 内联 diff 不虚拟化；整页评审若虚拟化，提供「打开原始 patch/复制」逃生口                                      |

---

## 8. 未验证清单（诚实边界）

- DSH 宿主 **打包产物**里 Shiki 的真实版本与 chunk 布局（只核对了源码依赖 `^4.3.1` 与 `highlight.ts`，没有读 `dist`）。
- 插件能否通过 `@deepseek-ai/dsh-client-ui-primitives/src/markdown/highlight.ts` 拿到宿主 highlighter —— 模块表只含包根 specifier，**未实测**；这是本次最关键的未知项。
- `@pierre/diffs` 在 DSH module-loader（CJS factory + `require`）下的 ESM/worker 兼容性：完全未测。
- GitHub diff 的语法高亮引擎（TextMate/其他）未在任何一手材料中披露。
- bundlephobia 未取到的体积：`diff`、`gitdiff-parser`、`parse-diff`、`highlight.js`、`@codemirror/merge`、`@shikijs/transformers`、`@shikijs/stream`（限流），只有 `unpackedSize`。
- `monaco-editor` 主入口 25 KB gzip 不代表可用体积（不含语言、worker、编辑器 CSS）。
- Zed side-by-side diff（PR #40014）是否已合并进 stable 版本；Zed 的 `diff_viewer` crate 我只通过 PR 与源码片段了解，未跑过。
- 各候选库在 React 18 + tsdown/rolldown CJS 打包下的真实表现（tree-shaking、CSS 注入、`sideEffects` 标记）——本次没有做构建验证。
- `react-diff-view` 的 React 19 兼容性与 `react-diff-viewer-continued` 的 emotion 在 DSH 宿主 CSP 下的行为。

---

## 9. Sources

包与 registry：

- <https://www.npmjs.com/package/diff>（v9 release notes 见 <https://github.com/kpdecker/jsdiff/blob/master/release-notes.md>）
- <https://www.npmjs.com/package/diff-match-patch> · <https://www.npmjs.com/package/fast-diff> · <https://www.npmjs.com/package/gitdiff-parser> · <https://www.npmjs.com/package/parse-diff> · <https://www.npmjs.com/package/unidiff>
- <https://www.npmjs.com/package/@vscode/diff>（README 与 <https://github.com/microsoft/vscode/issues/316990>）
- <https://www.npmjs.com/package/react-diff-view> · <https://github.com/otakustay/react-diff-view>
- <https://www.npmjs.com/package/diff2html> · <https://github.com/rtfpessoa/diff2html>
- <https://www.npmjs.com/package/react-diff-viewer-continued> · <https://www.npmjs.com/package/react-diff-viewer>
- <https://www.npmjs.com/package/@git-diff-view/react> · <https://github.com/MrWangJustToDo/git-diff-view> · <https://www.npmjs.com/package/@git-diff-view/shiki>
- <https://www.npmjs.com/package/@pierre/diffs> · <https://diffs.com/docs> · <https://github.com/pierrecomputer/pierre> · <https://pierre.computer/writing/on-rendering-diffs> · <https://diffshub.com/>
- <https://www.npmjs.com/package/monaco-editor> · <https://www.npmjs.com/package/@monaco-editor/react> · <https://microsoft.github.io/monaco-editor/typedoc/>
- <https://www.npmjs.com/package/@codemirror/merge> · <https://codemirror.net/docs/ref/#merge>
- <https://www.npmjs.com/package/shiki> · <https://shiki.style/packages/transformers> · <https://shiki.style/packages/stream> · <https://shiki.style/guide/regex-engines> · <https://shiki.style/guide/best-performance> · <https://shiki.style/blog/v4>
- <https://www.npmjs.com/package/highlight.js> · <https://www.npmjs.com/package/refractor> · <https://www.npmjs.com/package/prismjs>
- <https://github.com/Wilfred/difftastic>（0.71.0 CHANGELOG 与 `src/options.rs` 的 JSON 输出开关）
- <https://bundlephobia.com/>（体积数据，2026-09-21 抓取）

产品与最佳实践：

- GitHub：[Crafting a better, faster code view](https://github.blog/engineering/architecture-optimization/crafting-a-better-faster-code-view/)（2023-06-21）· [Accessibility considerations behind code search and code view](https://github.blog/engineering/user-experience/accessibility-considerations-behind-code-search-and-code-view/)（2023-07-06）· [The uphill climb of making diff lines performant](https://github.blog/engineering/architecture-optimization/the-uphill-climb-of-making-diff-lines-performant/)（2026-04-03）· [Files changed 默认开启](https://github.blog/changelog/2026-01-22-improved-pull-request-files-changed-page-on-by-default/)（2026-01-22）· [2026-02-05 更新](https://github.blog/changelog/2026-02-05-improved-pull-request-files-changed-february-5-updates/) · [2025-07-31 更新](https://github.blog/changelog/2025-07-31-pull-request-files-changed-public-preview-experience-july-31-updates/)
- GitLab：[Merge request diffs frontend overview](https://docs.gitlab.com/development/merge_request_concepts/diffs/frontend/) · [Rapid Diffs](https://docs.gitlab.com/development/fe_guide/rapid_diffs/) · [Reusable Rapid Diffs 设计文档](https://handbook.gitlab.com/handbook/engineering/architecture/design-documents/rapid_diffs/) · [highlight.rb（Rouge）](https://gitlab.com/gitlab-org/gitlab/-/raw/master/lib/gitlab/highlight.rb) · [移除旧 diff 渲染的 issue #602721](https://gitlab.com/gitlab-org/gitlab/-/work_items/602721)
- VS Code：[diffEditorViewModel.ts](https://github.com/microsoft/vscode/blob/main/src/vs/editor/browser/widget/diffEditor/diffEditorViewModel.ts) · [diffEditorOptions.ts](https://github.com/microsoft/vscode/blob/main/src/vs/editor/browser/widget/diffEditor/diffEditorOptions.ts) · [quickDiffModel.ts](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/scm/browser/quickDiffModel.ts)
- Sourcegraph：[Migrating from Monaco Editor to CodeMirror](https://sourcegraph.com/blog/migrating-monaco-codemirror)（2022-10-25）· [新 compare page GA](https://sourcegraph.com/changelog/compare-page-ga)（2026-07-20）· [CodeMirror 默认 blob viewer（PR #50915）](https://github.com/sourcegraph/sourcegraph-public-snapshot/pull/50915)
- Zed：[Native Git support](https://zed.dev/blog/git)（2025-03-12）· [Git 文档](https://zed.dev/docs/git) · [buffer_diff.rs](https://github.com/zed-industries/zed/blob/main/crates/buffer_diff/src/buffer_diff.rs) · [word diff PR #43269](https://github.com/zed-industries/zed/pull/43269)（2025-11-21）· [side-by-side diff PR #40014](https://github.com/zed-industries/zed/pull/40014)（2025-10-11）· [syntax diff PR #45671](https://github.com/zed-industries/zed/pull/45671)
- Replit：[Betting on CodeMirror](https://replit.com/blog/codemirror)（2022-03-09）
- 本机对照：DSH `dsh-v0.1.5-rc.2`（`fb2c4b9`）`packages/client/web/src/seed.ts`、`platform.ts`；`packages/client/ui-primitives/src/DiffBlock.tsx`、`src/markdown/highlight.ts`；`packages/client/ui-tool/src/client/tool/models/diff-card-model.ts`；BotHarness 根 `tsdown.config.ts`、`packages/client/package.json`。

---

## 10. 追加核查（2026-09-21）：文件编辑与历史 commit 查看，DSH 原生给了什么

问题来自审阅 §7 之后的两条功能设想：①「文件编辑」能不能用 DSH 原生 editor？②「历史 commit 查看（diff 查看）」怎么做。以下结论全部来自本机 DSH `dsh-v0.1.5-rc.2`（`fb2c4b9`）源码，路径相对 clone 根。

### 10.1 结论：没有原生编辑器，也没有 git 集成

| 能力               | DSH 0.1.5-rc.2 现状                                                                                                                               | 证据（源码）                                                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 浏览器内代码编辑器 | **不存在**：全仓 `rg -i "monaco                                                                                                                   | codemirror"` 0 命中；唯一的内容 UI 是只读文档预览                                                                                                             | 全仓搜索；`packages/client/ui-sidebar-documentpreview/` |
| 文件内容预览       | 只读：Text / Code / Markdown / HTML / Image / PDF；RPC 只有 `workspaceFiles.read`                                                                 | `ui-sidebar-documentpreview/src/client/rpc.ts`；`packages/api/workspace-files/src/index.ts:2`（自述 read-only）                                               |
| 人在哪里改文件     | 委托给本地 IDE：Session 头部「Open In...」用宿主探测到的已安装应用拉起 workspace 目录                                                             | `packages/client/ui-open-in-app/` + `packages/host/open-in-app/`（catalog 含编辑器/IDE/Git Bash）                                                             |
| Agent 改文件       | 工具链：`tool-str-replace-editor`、`tool-fs`（写），写前有 `fs/write-intent` 钩子可拦截                                                           | `packages/fs/tool-str-replace-editor/`、`packages/fs/fs/src/index.ts`（`readText`/`writeText`）                                                               |
| git                | **无任何 git service / 客户端面板**：只有 `.git` 作为项目根标记、搜索排除、Open In 目录项；session `checkpoint` 是持久化 durability，不是文件快照 | `rg -i "\bgit\b" packages apps`：仅 `context/agent-instructions`、`fs/tool-fs-search`、`host/open-in-app`、`session/session-checkpoint-policy`（JSONL flush） |

### 10.2 但有两个可用的扩展缝（比「自己造面板」更划算）

1. **文档预览注册表**：`ctx.documentPreviews.register({ id, extensions, priority, title, loading, wrap? })` + 以同一 `id` 向 keyed、session 作用域 slot `sidebar.right.tab.document` 注册正文；`priority: 'extension'`（默认）**高于 builtin**。正文拿到 `resourceAddress`、准备好的 `content`、`wrap`、`scrollportRef` 和标准 `useTabInfo`/`useResource`。宿主内置 Text/Code/Markdown 也走同一注册。→ BotHarness 可以注册一个「diff / 历史」预览实现，占住右边栏文档 tab，不改宿主一行。证据：`ui-sidebar-documentpreview/README.md:33`、`src/client/document/registry.ts`、`src/client/document/contract.ts`。
2. **右边栏 tab 类型注册表**：`ctx.sidebarRightTabs.register(...)`（kind / id / band / patterns + guide entry）可新增整类 tab（宿主 `ui-sidebar-files` 就是这么挂的）。→ 「History / Changes」整页视图有官方 seat，不必 portal 宿主 DOM。证据：`ui-sidebar-right/src/client/index.ts:18,83,108`、`ui-sidebar-files/README.md:27`。

配套的宿主侧能力（host 插件可直接 `inject`）：`fs.readText/writeText`（写走 `fs/write-intent`）、`ctx.shell`（bash 执行，`packages/shell/shell/src/index.ts:39-64`）、`ctx.subprocess`（`packages/subprocess/subprocess/src/index.ts:80-91`）、`workspaceFiles.read`（**只读**，无写入远端）。注意 `CodeBlock` 是 `ui-primitives` 包根 **有导出** 的（`src/index.ts`: `export { CodeBlock } from './markdown/CodeBlock.tsx'`），插件经模块表可拿到——与 §6.3 说的「Shiki 单例未导出」不矛盾：能拿到只读高亮块，拿不到高亮函数。

### 10.3 推荐

| 需求                                   | 推荐                                                                                                                                                                                                                                                                                                                                             | 不推荐                                                                                 |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| ① 文件编辑（默认口径：agent 改、人审） | 不引编辑器。agent 仍用 DSH 工具改；人审用宿主 `DiffBlock` + jsdiff（§7.2 第一步）；真要手改走「Open In...」本地 IDE                                                                                                                                                                                                                              | 为了「改一行」把 Monaco 拉进来                                                         |
| ① 文件编辑（浏览器内可改）             | **CodeMirror 6**（`@codemirror/merge` 顺带给出 diff + `acceptChunk`/`rejectChunk`；视口渲染、移动端/a11y 有据），以自定义 `documentPreviews` 实现落地；写入用 BotHarness 自己的 host 路由调 `fs.writeText`（宿主没有面向插件的写 RPC）                                                                                                           | Monaco（体积/worker/移动端，仅当要 LSP 级 IDE 才值）；`@pierre/diffs/edit`（仍标实验） |
| ② 历史 commit 查看                     | BotHarness 自建 host 侧 git 适配器：`ctx.shell`/`ctx.subprocess` 跑 `git log`/`git show`/`git diff`，用 jsdiff v9 `parsePatch`（已支持 git extended headers）或 `gitdiff-parser` 解析；UI 小 patch 用宿主 `DiffBlock`，整页历史注册 `sidebarRightTabs` 新 tab / `documentPreviews` 实现；多文件+虚拟化确认需要后再 lazy 引 `@pierre/diffs/react` | 等 DSH 提供 git（无此承诺）；`@pierre/diffs` 直接内联进主 bundle                       |

Memory 场景（PRD FR-4 的记忆编辑器、M6 每 PersonaBot 一个 git repo）与上表同构：编辑走 CodeMirror 6，历史就是该 repo 的 commit diff，渲染同一套。风险照旧：DSH `0.1.5-rc.2` 的注册表 API 是宿主内部契约，BotHarness 需 pin 版本并留适配层（§7.3「宿主契约漂移」）。
