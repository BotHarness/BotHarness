# DSH 设计语言、设计令牌与 COSS 对比调研 — 面向 BotHarness 客户端插件 UI

## 0. 元信息

| 项         | 内容                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 问题       | DSH Web Client 的设计语言、设计令牌、组件库分别是什么？第三方插件能否复用？BotHarness 在 shell 内的客户端 UI（`@botharness/client`）应该保持 DSH 原生视觉，还是改用 botharness.ai 落地页使用的 COSS 设计系统？                                                                                                                                                                                                                                                                                                                       |
| 上游仓库   | <https://github.com/deepseek-ai/deepseek-harness>（文档站 <https://deepseek-harness.github.io/deepseek-harness/>）                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Pinned SHA | `ddefc45fbc7f8e46dd73185e68295696d1297887`（2026-09-17，release `dsh-0.1.6-alpha.2`）。下文 `packages/...`、`docs/...` 路径除注明外均相对该 SHA 的仓库根；本仓库安装的 npm 包为 **0.1.5-rc.2** 系，差异单列（§1.4、§4.3）。                                                                                                                                                                                                                                                                                                          |
| npm 快照   | 2026-09-18 查询：`@deepseek-ai/dsh` dist-tags `latest = next = 0.1.5-rc.2`、`alpha = 0.1.6-alpha.2`；两条线均含全部客户端包。本仓库 `packages/client/package.json` 钉 `0.1.5-rc.2`。                                                                                                                                                                                                                                                                                                                                                 |
| 调研方法   | 一手来源优先：WSL 直读本仓库 pnpm store 中已安装的 `@deepseek-ai/dsh-client-ui-*`（含 `lib/types/*.d.ts`、`lib/*.css`、CJS/ESM 产物）；上游 sparse clone `/tmp/dsh-src` 读 `docs/web-styling.md`、`packages/client/AGENTS.md`、`ui-theme/src/styles/*.css`、`ui-primitives/README.md`、`web/src/platform.ts`、`tsdown.client.ts`；本仓库直读 `apps/docs`、`design/tokens.css`、`.agents/skills/coss/`。所有 URL 访问日期 **2026-09-18**。无法由一手来源确认的一律标「未验证」。本次未安装/运行任何插件，未改动工作区（唯写本文件）。 |

**一句话结论**：DSH 有一套真实且完整的设计系统（`--dsw-*` 双主题令牌 + `ui-primitives` 控件/图标目录 + CSS Modules 纪律），且 **`ui-primitives` 属于 shell 模块表基线，插件可以在运行时导入**；COSS 在本仓库只是落地页的 Tailwind v4 + Base UI 组件源码（其颜色实际桥接到 Nimbus `--nb-*`，并无独立的可移植 token 包），把它搬进 shell 会引入第二套 token/暗色机制与 Tailwind 构建链。**建议 in-harness UI 全面 DSH 原生化（`--dsw-*` + `ui-primitives`），COSS 仅保留在 botharness.ai 落地页；品牌色只做一层薄的语义映射，不做第二套组件库。**

---

## 1. DSH 的设计语言与设计令牌

### 1.1 设计语言（一句话：安静的中性系统，靠层级与发丝线，而非色彩）

- 体系名与来源：`--dsw-*` 令牌的上游是 DeepSeek 内部 design system（`base.css` 注释写明"defined upstream (deepsuite theme/global.css)"），`--ds-*` 是最底层的字体/动效变量（<https://github.com/deepseek-ai/deepseek-harness/blob/ddefc45fbc7f8e46dd73185e68295696d1297887/packages/client/ui-theme/src/styles/base.css>）。
- 核心视觉规则（权威文档 `docs/web-styling.md`，<https://github.com/deepseek-ai/deepseek-harness/blob/ddefc45fbc7f8e46dd73185e68295696d1297887/docs/web-styling.md>）：
  - 中性偏冷的灰阶（`neutral-bluish`），品牌主色在浅色/深色下分别为近黑/近白（`--dsw-alias-brand-primary`），链接与业务态才用 DeepSeek 蓝（`--dsw-alias-link` → `deepseek-400/500`）。
  - 抬升表面（菜单、弹窗、浮层、composer）`border: 0`，用 `--dsw-elevation-panel/prominent/soft`：0.5px 发丝描边作为第一层阴影 + 两层低透明度柔光（`web-styling.md:24`）。
  - 平直边框/分隔线统一 0.5px（Chromium 渲染为 1 物理像素，`web-styling.md:25`）。
  - 圆角在支持的引擎上全局 `superellipse(1.5)`（`corner-shape.css:16-25`），整圆/胶囊需成对声明 `corner-shape: round`（`web-styling.md:23`）。
  - 字号可调：`--dsh-content-font-size` 12–17px（默认 14），Markdown 标题与正文按增量联动（`ui-theme/README.md`；`gradient-shadow-text.css`）。
- 品牌规范 `BRAND_GUIDELINES.md` 只约束商标措辞，不定义视觉语言——即 DSH 的"设计语言"完全落在 token 与组件行为里。

### 1.2 令牌清单（以下以上游 0.1.6-alpha.2 源码为准；本仓库未安装主题包，抽样核对已安装 0.1.5-rc.2 的 CSS 消费者可见相同令牌名）

| 层        | 前缀/文件                                                                                     | 规模                                                                      | 示例                                                                                                                                                                     |
| --------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 静态色板  | `--dsw-static-*`（`design-platform.css`）                                                     | 73 个唯一名（浅/深两套值；深色重声明但值相同，个别语义位在 alias 层区分） | `--dsw-static-neutral-bluish-850: rgb(44,44,46)`、`deepseek-500`、`red-400`                                                                                              |
| 语义别名  | `--dsw-alias-*`（同文件 :156-346）                                                            | 81 个唯一名，浅/深各一套                                                  | `--dsw-alias-bg-base`、`bg-layer-1/2/3`、`border-l1..l4`、`label-primary/secondary/tertiary`、`state-success/warn/error/business-*`、`link`、`scrollbar-*`、`markdown-*` |
| 特定场景  | `--dsw-specific-*`                                                                            | 11 个                                                                     | `--dsw-specific-sidebar-fill`、`sidebar-nav-item-active/hover`、`bubble`                                                                                                 |
| 排版      | `--dsw-font-*`（`gradient-shadow-text.css`）                                                  | 181 个（复合 + 原子：family/weight/size/line-height）                     | `--dsw-font-markdown-h1`、`--dsw-font-markdown-base` 等                                                                                                                  |
| 阴影/抬升 | `--dsw-shadow-lv1..3`、`--dsw-elevation-*`                                                    | 10 个                                                                     | `--dsw-elevation-panel`、`--dsw-elevation-stroke-color`                                                                                                                  |
| 滚动条    | `--dsh-scrollbar-*`（`scrollbar.css:16-26`）                                                  | 6 个（thumb/hover/border/track-margin/width）                             | `--dsh-scrollbar-thumb`                                                                                                                                                  |
| 基础      | `--dsw-font-family`、`--ds-font-family-code`、`--ds-ease-in-out`、`--ds-transition-duration*` | `base.css:6-15`                                                           | —                                                                                                                                                                        |

暗色机制：所有 `--dsw-alias-*` 在 `body` 上声明，深色在 `body[data-ds-dark-theme]` 覆盖（`design-platform.css:4,80,156,253`）。**插件不需要自己写任何主题选择器**。

### 1.3 主题机制（插件如何读取/参与主题）

- 服务：`ctx.theme`（`ThemeRuntime`，`ui-theme/src/client/index.ts:158-317`）发布不可变 `ThemeSnapshot`（`preference`/`fontSize`/`active`/`themes`/`revision`，:80-95），提供 `getTheme()`、`setTheme(id)`、`setFontSize(px)`、`register(definition)`、`overrideTokens(source, tokens)`（:308）与 `theme/change` 事件。
- 应用：`ui-layout` 的 `ThemePresenter` 负责所有 DOM 写入——`html{color-scheme}`、`body[data-ds-dark-theme]`（`DARK_ATTRIBUTE`，`theme-presenter.d.ts:13`）、把激活主题的 alias 覆盖写成 body 内联 CSS 变量、`--dsh-content-font-size` 与 `theme-color` meta（同文件 :3-9）。
- 第三方主题：`ctx.theme.register()`/`overrideTokens()` 明确允许注册/叠加 alias 层（`ui-theme/README.md`「Registering a theme」）；覆盖要求 light/dark 成对提供（`ui-theme/src/client/index.ts:51-64`）。
- 结论：**插件消费主题只需要读 CSS 变量 + 跟随 `body[data-ds-dark-theme]`；想影响主题才需要 `ctx.theme`。**

### 1.4 `ui-primitives` 实际导出什么（0.1.5-rc.2 已安装版）

`packages/client/node_modules/@deepseek-ai/dsh-client-ui-primitives/lib/types/index.d.ts:4-65`：

| 类别     | 导出                                                                                                                                                                                                                                                                                        |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 控件     | `Button`(`primary/ghost/outline/toolbar`)、`Switch`(36×20)、`Input`、`Menu`(子菜单/键盘导航)、`Pill`、`Tag`(8 色调)、`StateDot`(done/warning/ongoing/error/idle)、`DisclosureRow`、`Modal`、`RiskConfirmation`、`OnboardingSurface`、`Tooltip`、`HoverCard`、`Toast`、`ConnectionIndicator` |
| 工具函数 | `useAnchoredPosition`、`useAnchoredMaxHeight`、`useDismissOnOutsidePointer`、`fileSizeText`、`writeClipboard`、`relativeTime`、`rankByName`、`projectUserText`                                                                                                                              |
| 图标     | `FishLogo`/`BrandWordmark`/`ReferenceIcon`/`LinkIcon`/`FileTypeIcon` + `export * from './icons/index.tsx'`（`ic_ds_*` 集合；上游源文件 86 处 export）                                                                                                                                       |
| 输出卡片 | `JsonTree`/`JsonBlock`/`MarkdownText`/`CodeBlock`/`TerminalBlock`/`ReadBlock`/`DiffBlock`/`SearchBlock`/`WebBlock`                                                                                                                                                                          |

版本差异（**注意**）：上游 0.1.6-alpha.2 的 catalog 已含 `Checkbox`（<https://github.com/deepseek-ai/deepseek-harness/blob/ddefc45fbc7f8e46dd73185e68295696d1297887/packages/client/ui-primitives/README.md#component-catalog>），但本仓库安装的 0.1.5-rc.2 中 `Checkbox` 计数为 0（`lib/types/index.d.ts` 无该导出）；`Pill`/`Input` 是自造件、无设计稿来源（README「Known Limitations」）。组件零 Cordis、文案必须由调用方通过 label props 提供，无语言回退（README:87）。

### 1.5 第三方（插件）样式规则

权威规则集中在两处：

- `docs/web-styling.md`：所有权在 `ui-theme`（全局 sheet）与 `ui-layout`（应用快照），feature 包只消费语义别名、不自建全局主题（:9-11）；**「Use CSS Modules and `clsx`; do not add a component library or Tailwind.」**（:16）；只用 `--dsw-alias-*`，不写字面色（:17）；feature CSS 里不得出现主题选择器（:18）；控件先复用 `ui-primitives` 目录，跨 feature 包不能互相导组件（:15）。
- `packages/client/AGENTS.md`「Styling and localization」：同义复述（:113），并补充 `pnpm run verify-client-ui-i18n` 强制文案归 locale 字典所有（:115）；「New component checklist」第 1 条要求先查 `ui-primitives` catalog，第 5 条「Tokens only in CSS」。

---

## 2. 插件能否复用 DSH 的令牌与 primitives？

**能，机制上是一等公民。**

| 证据                                                                                                                                                            | 说明                                                                                             |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `PLATFORM_MODULES` 含 `@deepseek-ai/dsh-client-ui-primitives` 与 `ui-dockkit`（上游 `packages/client/web/src/platform.ts:8-14`；本地 `tsdown.config.ts:24-34`） | shell 静态种子模块表，动态插件的 `require()` 直接命中                                            |
| 本仓库 `tsdown.config.ts:33,47` 已把它列入 `external`                                                                                                           | 插件产物不内联 primitives，运行时由 shell 提供（`docs/client-bridge.md:67` 同步记录基线）        |
| `packages/client/package.json:31` 已声明 devDependency `@deepseek-ai/dsh-client-ui-primitives@0.1.5-rc.2`                                                       | 本地已有类型与实现，可直接 `import { Button } from '@deepseek-ai/dsh-client-ui-primitives'`      |
| 上游纯净门禁只禁止**跨 feature 插件**值导入；基线包是显式例外（`tsdown.client.ts` 的 `dsh-client-bundle-purity`，:528-545）                                     | `AGENTS.md:78`：「Baseline externals are implicit for every dynamic bundle」                     |
| primitives 的样式由 shell 的静态 Vite 构建合并（README:28），组件内已 `import css from './X.module.css'`                                                        | 插件不需要为 primitives 附带任何 CSS，也就没有样式注入负担                                       |
| `ctx.theme` 是 shell 一侧的运行时服务（ui-theme 随 web app 装载）                                                                                               | 插件只有需要 `register/overrideTokens` 时才需在 `inject` 加 `theme`；纯消费 CSS 变量无需依赖该包 |

注意两点：① 本仓库 `packages/client/node_modules/@deepseek-ai/` 下**没有** `dsh-client-ui-theme`（安装集只有 12 个包：connection/store/session/conversation/dockkit/input-trigger/layout/primitives/renderer/sidebar/slots/cordis），主题包是 shell 的依赖，不随插件安装；② 第三方插件消费 `ui-primitives` 虽机制上允许，但规范文字（`AGENTS.md`「Slot and props discipline」等）面向 `packages/client/*` 第一方，第三方复用属于**事实支持、文档未显式背书**（见 §6）。

---

## 3. 本仓库的 COSS 现状（botharness.ai 落地页）

| 维度       | 事实                                                                                                                                                                                                          | 引用                                                                                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 组件库存   | 54 个组件源码复制在 `apps/docs/src/components/coss/`（dialog/menu/select/combobox/field/form/toast/tabs/sidebar/table 等；注册表见 skill）                                                                    | `docs/changelog/2026-09-17-coss-landing.md:8`；`.agents/skills/coss/references/component-registry.md:10-80`；`apps/docs/src/components/coss/`（54 文件） |
| 技术栈     | coss = **shadcn 式 registry + Base UI + Tailwind v4**；组件用 Tailwind 工具类 + `cva` + `cn()`（clsx/tailwind-merge），图标用 lucide-react；文档站 React 19                                                   | `.agents/skills/coss/SKILL.md:4,10-12`；`apps/docs/src/components/coss/button.tsx:10-49`；`apps/docs/package.json:22,33,39,43,47`                        |
| Token 链   | COSS 组件消费 shadcn 语义名（`bg-primary`/`text-muted-foreground`/`border-input`…），这些在 `@theme` 块桥接到 **Nimbus `--nb-*`** 令牌；dark 由 Nimbus 的 `[data-mode="dark"]` 驱动；没有独立的 COSS token 包 | `apps/docs/src/styles/globals.css:175-236`（含 :221-236 coss 桥）、`:5,119`                                                                              |
| 品牌令牌   | 落地页另有一层极小的 `--bh-*` 品牌令牌（`--bh-brand: #16a34a` 绿、`--bh-accent: #2563eb` 蓝、radius 12px；dark 仅覆盖边框），由落地页页面导入                                                                 | `design/tokens.css:1-19`；`apps/docs/src/pages/index.astro:7`                                                                                            |
| 实际使用面 | 只有落地页 `Landing.tsx` 用了 7 个 coss 组件（badge/button/card/frame/group/separator），其余是整包复制备用；文档页用 Nimbus UI；落地页纯 SSR、零 hydration                                                   | `apps/docs/src/components/landing/Landing.tsx:3-13`；`AGENTS.md:33`；changelog「pure SSR, zero hydration」                                               |
| 样式调和   | 与 Nimbus「只做加法」：仅补 `dark:` 变体与少量颜色映射，不改任何 `--nb-*` 值                                                                                                                                  | `docs/changelog/2026-09-17-coss-landing.md:9`                                                                                                            |

**要点：本仓库里并不存在一套可直接搬走的 "COSS 设计令牌"** —— 视觉值来自 Nimbus（`--nb-*`），品牌值来自 `--bh-*`，coss 提供的是组件行为/结构与 Tailwind class 约定。

---

## 4. 对比

### 4.1 令牌与机制对照

| 维度              | DSH（`--dsw-*` + ui-primitives）                                          | COSS（coss + `--nb-*`/`--bh-*`）                                                        |
| ----------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Token 命名        | `--dsw-static/alias/specific/font/elevation/shadow-*`，约 73+81+11+181+10 | shadcn 语义类（`primary/muted/input/...`）→ Tailwind `@theme` → `--nb-*`；`--bh-*` 品牌 |
| 暗色开关          | `body[data-ds-dark-theme]`（shell 自动写）                                | `[data-mode="dark"]`（Nimbus/Astro 属性；与 DSH 不同）                                  |
| 主题运行时        | `ctx.theme`（快照/注册/覆盖层，shell 装载）                               | 无（静态 CSS + 构建期 Tailwind）                                                        |
| 组件分发          | npm 包基线 `ui-primitives`，shell 已装载、样式已注入                      | 源码复制进 app（shadcn registry），需自建 Tailwind 编译                                 |
| React 版本        | 18.2（shell 基线）                                                        | 文档站 19；Base UI peer 支持 17/18/19（未实测 18 组合）                                 |
| 语言/文案         | 组件零文案、label 必填；插件自持 locale 字典                              | 文案散在组件默认（skill 未强制）；与 DSH i18n 纪律不接轨                                |
| 视觉基调          | 中性冷灰、发丝线、安静；品牌色近黑/近白                                   | 落地页品牌绿 `#16a34a` + 蓝；偏营销视觉                                                 |
| 在 DSH 内的合法性 | 官方规则要求（`web-styling.md:16`「no component library or Tailwind」）   | 与规则直接冲突                                                                          |

### 4.2 「与 DSH 一致」到底要求什么

不是像素级复刻，而是**遵守 token 与所有权边界**：语义别名取色、无字面色、无 feature 级主题选择器、控件优先复用 primitives、抬升/发丝线/圆角/链接遵循既有惯例（§1.1、§1.5）。做到这些，插件外观自动与 shell 协调，且浅深两套主题免费获得。

### 4.3 采纳成本

| 方案                           | 改动面                                                                                                                        | 代价/风险                                                                                                                                                                             |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **DSH 原生化（推荐）**         | `styles.ts` 换 token 映射（一个文件）+ 逐控件替换为 primitives + labels；`tsdown.config.ts` 已就绪（:33），无需改构建         | 低；版本钉 0.1.5-rc.2，primitives 由 shell 供给，本地 bundle 不增重（当前 `lib/client.js` ≈ 300KB）                                                                                   |
| **移植 COSS（不推荐）**        | 插件构建加入 Tailwind v4 编译 + CSS 注入、内联 Base UI/cva/clsx/tailwind-merge/lucide、重写 dark 选择器、重建 Nimbus token 链 | 高：两套 token 与暗色机制并存；Tailwind preflight 会泄漏进 shell（需禁用）；与上游样式规则冲突；bundle 显著变大（`@base-ui/react` 源 18MB 级、按需仍可观）；品牌绿与 shell 中性色冲突 |
| **混合（COSS 行为 + DSH 皮）** | 保留 Base UI 无头行为，把所有 Tailwind 类改写成 `--dsw-*` 的 CSS Modules                                                      | 等价于重写全部 coss 组件，收益仅剩 Base UI 的 a11y 实现（primitives 已覆盖常用控件）                                                                                                  |

---

## 5. 推荐

**在 shell 内采用 DSH 原生：`--dsw-*` 语义令牌 + `ui-primitives` + 自写布局 CSS（CSS Modules 或现有注入样式表）；COSS 只服务 botharness.ai 落地页，不进入插件。** 品牌表达收敛为一层薄的语义映射（品牌色映射到 `--dsw-alias-state-business-primary` 或经 `ctx.theme.overrideTokens` 注入 1–3 个 alias 覆盖），不引入第二套组件库。

理由：① shell 视觉一致性由 token 保证；② 暗色自动生效（当前手写 CSS 硬编码 `#fff` 等，仅浅色可用，`packages/client/src/client/styles.ts:3-17`）；③ 插件零 CSS 体积负担（primitives 样式由 shell 注入）；④ 不违反上游 `web-styling.md:16` 的「无组件库/Tailwind」；⑤ 避免两套 token、两套暗色属性、两套文案体系的长期维护债；⑥ 若要品牌绿，`overrideTokens`/local alias 一层即可，不影响 shell 其他区域。

### 落地步骤（按序）

1. **ADR 固化边界**：新增 `docs/adr/00xx-in-harness-ui-follows-dsh.md`——in-harness 视觉遵循 DSH；COSS 仅用于 `apps/docs` 落地页；`--bh-*` 品牌令牌不进入插件命名空间（注意现有插件 `styles.ts` 的 `--bh-*` 与 `design/tokens.css` 的 `--bh-*` 同名不同义，恰好说明该收口）。
2. **`styles.ts` 重构**：删除全部字面色，建立 `--bh-*` → `--dsw-alias-*`/`--dsw-specific-*` 映射（如 `--bh-side` → `--dsw-specific-sidebar-fill`，`--bh-line` → `--dsw-alias-border-l2`，六态 → `--dsw-alias-state-*`）；用 `rg '#[0-9a-fA-F]{3,8}|rgb\('` 自检零字面色；双主题下人工验收。现有 `--dsw-elevation-*`、0.5px 发丝线、`corner-shape` 惯例一并照做。
3. **替换自绘控件**：`Button`/`Input`/`Menu`/`Tooltip`/`Tag`/`Pill`/`StateDot`/`Toast`/`Modal` 改用 `@deepseek-ai/dsh-client-ui-primitives`（已 external，直接 import）；`icons.tsx` 优先换 `ic_ds_*`；所有文案从 `labels.ts` 注入（primitives 无 fallback）。
4. **验证**：`pnpm build` 后按 `docs/client-bridge.md` §7 在 `web-dev` profile 跑 `dsh web --profile web-dev`，对浅/深/系统三种偏好核对；跑 `pnpm lint && pnpm typecheck && pnpm test`；确认 `lib/client.js` 体积无显著增长。
5. **可选（后续）**：若需要主题内省或品牌 alias 注入，再把 `@deepseek-ai/dsh-client-ui-theme` 加进 devDependencies 并在 `inject` 声明 `theme`，用 `ctx.theme.getTheme()/overrideTokens()`；不需要则保持纯 CSS 消费。

---

## 6. 未验证与风险

- **第三方插件导入 `ui-primitives` 未被官方文档显式背书**：模块表机制与基线列表（`web/src/platform.ts:8-14`）保证运行时可用，但规范文字面向仓库内 `packages/client/*`；若上游调整基线，插件需随版本重新验证（当前钉 0.1.5-rc.2）。
- **两发行线差异**：0.1.5-rc.2 的 primitives 无 `Checkbox`，0.1.6-alpha.2 有；`Pill`/`Input` 无设计稿来源；升级前应比对 catalog。
- **COSS 在 React 18 下的兼容性未实测**：Base UI peer 声明支持 18，但本仓库组件在 React 19 下开发；若未来真要移植需先做最小验证。
- **Tailwind preflight / `@property` 与 shell 的冲突未实测**：本方案不触及，仅作为"若改走 COSS"的风险记录。
- **主题覆盖的视觉审查**：`overrideTokens` 不做完整性校验（`ui-theme/README.md`「Known Limitations」），品牌覆盖层需自行保证 light/dark 成对。
