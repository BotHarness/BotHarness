# DSH 自定义皮肤 / 主题插件调研 — 官方机制、Discussions 讨论与 GitHub 生态

## 0. 元信息

| 项       | 内容                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 问题     | DSH 官方仓库的 Discussions 与 GitHub 上有哪些**自定义皮肤 / 主题**插件？它们分别**如何实现**？DSH 平台本身给插件暴露了哪些换肤接缝（token 覆盖？CSS 注入？品牌包替换？），哪些是官方认可、哪些是 hack？                                                                                                                                                                                                                                                                                                                                                                             |
| 一手来源 | ① 本地 DSH checkout `/Users/doodlebear/Documents/code/deepseek-harness`（fork of `deepseek-ai/deepseek-harness`，只读）；② `deepseek-ai/deepseek-harness` 的 GitHub Discussions（GraphQL 检索 + 逐帖读正文与评论）；③ 第三方仓库源码（`gh api contents` / `git trees`）；④ 官方文档站 <https://deepseek-harness.github.io/deepseek-harness/develop/basic/publish.md>；⑤ npm registry 元数据；⑥ <https://dsh-market.com>（社区皮肤市场站点） |
| 本地基线  | `git describe --tags` = **`dsh-v0.1.7-rc.2-1-gaa43257`**，HEAD `aa43257`（分支 `feat/desktop-window-contribution`，2026-09-28）；`packages/client/ui-theme/package.json` `version = 0.1.7-rc.2`。**下文所有 `packages/...:行号` 均以此 SHA 为准**，与 `docs/research/2026-09-18-dsh-design-tokens-vs-coss.md`（0.1.6-alpha.2）的令牌计数已不同，差异单列。 |
| 日期     | 2026-09-29；所有 URL / API 访问日期 **2026-09-29** |
| 调研方法 | 一手来源优先。本轮**未安装、未运行**任何皮肤插件；未修改 DSH checkout；未修改 BotHarness 除本文件外的任何文件。repo 元数据（star / push / license）逐仓库 `gh api repos/<owner>/<repo>` 核对；实现机制读 `package.json` 的 `dsh.client.inject`、`cordis.patch.yml` 与 client 源码；**未读源码的条目明确标注**。 |
| 已知边界 | ① 本轮不覆盖桌面壳（Tauri/Electron）自带的换肤，只在需要区分时提及；② 头像 / 图标包、桌宠 / Live2D、组件库一律**排除**并交叉引用既有笔记（见 §3.6）；③ 395 个检索命中的仓库只逐个核对了其中约 25 个的源码，其余仅元数据核对。 |

**一句话结论**：**DSH 有一条官方认可、文档化、但极窄的换肤接缝——`ctx.theme.overrideTokens(source, tokens)`（令牌层）＋ 插件自己 `<style>` 注入（表现层）＋ 品牌槽位替换（logo）**；除此之外没有 user CSS、没有 Tailwind、没有主题市场 API、没有主题选择 UI。**官方 Discussions 里 8098 帖中与皮肤/主题直接相关的约 30 帖，维持者对全部技术提案零回复**（唯一署名 `@deepseek-harness` 的账号 `Gniy7Ga` 只发社区公告），所以「官方认可」只能从**源码契约**推断，不能从讨论推断。而 GitHub 上的第三方皮肤生态**远比 Discussions 显示的大**：GitHub 检索命中 395 个相关仓库（≥5★ 54 个、≥100★ 5 个），其中 `zhu1090093659/dsh-web`（8131★）已经建成了**带正式 `skin.json` v2 契约 + 单一 loader（`@linxin666/dsh-client-ui-skin-center`）+ 市场（dsh-market.com）+ 200+ 皮肤**的完整体系——它不 patch DSH，但用一个自建 loader 把所有皮肤 CSS 强制 scope 到 `html[data-dsh-skin="<id>"]`，这是目前社区最成熟的形态，也是 BotHarness 最值得抄的参考。

---

## 1. 平台侧 ground truth：DSH 自己的主题机制

### 1.1 `BRAND_GUIDELINES.md` 不定义任何视觉规范

`BRAND_GUIDELINES.md` 与 `BRAND_GUIDELINES.zh.md` 各 12 行，内容**全部是商标与命名规则**（可写「基于 DeepSeek Harness 构建」；建议用 `DSH` 缩写命名；**禁止**把完整商标「DeepSeek Harness」放进项目名；不要用官方素材造成官方背书印象）。**没有颜色令牌、没有字体、没有圆角、没有间距**。

> 含义：DSH 的「设计语言」完全落在 `--dsw-*` 令牌与组件行为里，不在品牌文档里。这与 `docs/research/2026-09-18-dsh-design-tokens-vs-coss.md` §1.1 的结论一致，本轮在 0.1.7-rc.2 上复核仍成立。

### 1.2 令牌体系（`packages/client/ui-theme/src/styles/`）

权威文档是 `docs/web-styling.md`（仓库内，**未发布到文档站**，见 §1.7）。令牌定义在 `packages/client/ui-theme/src/styles/` 的 8 张 sheet 里，由 `packages/client/ui-theme/src/client/styles.ts:13-22` 以 `?inline` 方式在插件 `apply()` 时逐张 `<style>` 注入 `<head>`（`styles.ts:28-39`，每个标签带 `data-plugin` / `data-plugin-css` 属性，dispose 时移除）。

`design-platform.css` 在本基线上的规模（`grep` 实测）：

| 层                       | 命名空间              | 本基线唯一名数 | 声明位置                                     |
| ------------------------ | --------------------- | -------------- | -------------------------------------------- |
| 静态色板                 | `--dsw-static-*`      | 77             | `design-platform.css:4-84`（`body`）与 :85+（`body[data-ds-dark-theme]`，值相同） |
| 语义别名                 | `--dsw-alias-*`       | **93**         | `design-platform.css:167-369`（`body`）与深色覆盖块 |
| 组件专属                 | `--dsw-specific-*`    | 11             | 同上                                         |
| 圆角刻度                 | `--dsw-radius-*`      | 6              | `base.css:16-21`，**声明在 `:root`，不在 `body`** |
| 焦点环 / 内容字号 / 动效 | `--dsw-focus-*`、`--dsh-content-font-size`、`--ds-*` | — | `focus.css`、`gradient-shadow-text.css`、`base.css:6-15` |

> 与 2026-09-18 那份笔记的差异：alias 唯一名从 81 涨到 **93**，static 从 73 到 77。这半年令牌面在扩，**这直接放大了第三方主题的维护成本**（见 §5）。

暗色机制：所有 alias 在 `body` 上声明，深色在 `body[data-ds-dark-theme]` 覆盖（`design-platform.css:85`）。**插件不需要写任何主题选择器**就能跟随明暗——前提是你用 `overrideTokens`（它按 `active.colorScheme` 自动挑值）。

### 1.3 主题运行时 `ThemeRuntime` 与 DOM 呈现 `ThemePresenter`

服务实现 `packages/client/ui-theme/src/client/index.ts:159-360`（class `ThemeRuntime`），核心 API：

| 成员                                                | 位置        | 语义                                                                                                                                   |
| --------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `getTheme(): ThemeSnapshot`                        | `:203-205`  | 读不可变快照（`preference` / `fontSize` / `active` / `themes` / `revision`）                                                          |
| `setTheme(id)`                                      | `:232-240`  | **唯一**的用户偏好写入口。`id` 必须是已注册 id 或 `'system'`，否则 throw                                                                 |
| `setFontSize(px)`                                   | `:248-256`  | 12–17 整数 px，越界/小数 throw                                                                                                         |
| `register(definition): disposer`                    | `:276-291`  | 注册一个第三方主题（`{id, colorScheme, tokens}`）。重复 id throw；`'system'` 是偏好不是可注册 id；dispose 时若它是当前偏好则回落默认 |
| `overrideTokens(source, tokens): disposer`         | `:309-318`  | **在当前激活主题之上叠一层 token 覆盖**。同 source 重复调用 = 整层替换并重新置顶；dispose 精确移除自己那一层                       |
| `exportInspectTokens(): ThemeTokenInspection[]`     | `:211-224`  | 导出令牌目录（14 个内建 + 注册主题与覆盖层中出现过的名字），**不读 DOM、不执行代码**，供 Cordis pre-definition 检查                  |

`overrideTokens` 的运行时校验只检查**值的形状**（必须 `{light: string, dark: string}`，传裸字符串会抛一个带教学信息的 `TypeError`，`:384-404`）。**它不校验 token 名是否存在**——写错名字会静默无效。

事件的 DOM 投影由 **ui-layout** 的 `ThemePresenter` 独家完成（`packages/client/ui-layout/src/client/theme-presenter.ts:53-70`），它只写五样东西：

1. `document.documentElement.style.colorScheme`
2. `html[data-ds-theme-source]`（`light` / `dark` / `system`，`:26`）
3. `body[data-ds-dark-theme]`（`DARK_ATTRIBUTE`，`:15`、`:59-60`）
4. `--dsh-content-font-size`
5. **`body` 上的内联 CSS 变量 = `active.tokens`**（`:64-67`）

第 5 条是插件换肤的全部着力点：`overrideTokens` 的值最终以**内联 style 写在 `<body>` 上**，特异性高于任何样式表，所以第三方主题不会被官方 CSS 覆盖，也不需要 `!important`。

### 1.4 内置主题只有两个；第三方主题**不会**出现在设置 UI

- 内置：`BUILTIN_THEMES = [{id:'light', colorScheme:'light', tokens:{}}, {id:'dark', colorScheme:'dark', tokens:{}}]`（`index.ts:126-129`）。加上偏好值 `'system'`，用户可选的**只有三个**。
- 设置 UI 是 `AppearanceRow.tsx:31-35` 里**硬编码的三个立方按钮**（`CUBES` 常量：Light / Dark / System），注册进 `settings.general.item` 槽（`index.ts:455-462`）。`register()` 出来的第三方主题 id **不会**自动渲染出第四个按钮。
- 持久化：`setTheme` 里 `if (isThemePreference(id)) void this.host.set(...)`（`index.ts:238`）——**只有内置三值会落盘**。第三方主题 id 是**纯进程内扩展，刷新即失**。
- 存储位置：Host 设置 API 的 `ui-theme` 命名空间，字段 `preference` / `fontSize`（`theme-settings.ts:9-15`），schema 默认 `system` / `14`（`:41-44`）。插件 README 声明持久化落在 `$DSH_HOME/cordis.patch.yml`（`packages/client/ui-theme/README.md`「Preference persistence」段）。**非 loopback 页面不落盘**——见 discussion #5430 与 `README.md` 同一段。
- 首屏防闪：Host 在每个 index 响应里嵌入 head CSS + body script，在任何脚本之前设好 `color-scheme` 与 `body[data-ds-dark-theme]`（`packages/client/ui-theme/src/boot-theme.ts:45-53`）。

> **本轮最关键的负面结论**：`register()` 这条「把新主题加进 Appearance 行」的路径**事实上是死的**——没有 UI、没有持久化。社区里**没有找到任何一个插件使用 `ctx.theme.register()`**；全部走 `overrideTokens` 或自己写 `<style>`。`register()` 与 `overrideTokens` 两条接缝的官方文档都在 `packages/client/ui-theme/README.md`「Registering a theme」一节，但该 README **未发布到文档站**（§1.7）。

### 1.5 插件可用的四条换肤接缝（逐条核实）

| # | 接缝                                | 是否官方文档化                                   | 机制                                                                                                    | 核实来源                                                             |
| - | ----------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 1 | `ctx.theme.overrideTokens(source, tokens)` | ✅ `ui-theme/README.md` + 源码注释               | 声明 `inject: ['theme']`；`ctx.effect(() => ctx.theme.overrideTokens(PKG_NAME, {token: {light, dark}}))`；值经 presenter 写成 body 内联变量 | `index.ts:309`；`theme-presenter.ts:64-67`                          |
| 2 | 插件自带 `<style>`                   | ✅ 事实标准，但**无面向第三方的文档**             | 在 `apply()` / `ctx.effect()` 里 `document.createElement('style')` + `head.appendChild`，dispose 时 `remove()` | `ui-theme/src/client/styles.ts:28-39`；`ui-brand-official` 同样模式 |
| 3 | 品牌槽位替换                         | ✅ `ui-brand-official/README.md` 明写             | 不装 `ui-brand-official`，另写一个包占用 `sidebar.brand.mark` / `sidebar.brand.name`（可选 `conversation.hero.brand.mark`） | `packages/client/ui-brand-official/README.md`「Replacing the brand」；`src/client/index.ts:16-23` |
| 4 | 关闭官方插件 + 重新声明同名槽位      | ⚠️ 可行但属 patch 性质                            | 在 bundle patch 里 `- id: ui-sidebar / disabled: true` 再 `- insert:` 自己的行 | 反例见 `MichengAI/dsh-codex-ui` 的 `cordis.patch.yml`（§3.3）      |

关于 #2 的构建侧：官方共享预设 `packages/client/tsdown.client.ts` 提供三条 CSS 通道——`dsh-css-modules-inline`（`x.module.css` → 哈希类名映射 + 注入）、`dsh-css-global-inline`（`x.css` 副作用导入 → 注入）、`dsh-css-text-inline`（`x.css?inline` → 导出编译后字符串，`:573-590`），三者都写 `data-plugin-css` 属性并被模块系统记账（`.agents/notes/implemented/architecture/2026-07-23-client-plugin-loading-model.md` 第 91 行「Remove owned `<style data-plugin>` tags」）。

> **但这个预设没有 `package.json`**（`packages/client/` 目录下不存在该文件），因此**不是可安装的 npm 包**。第三方插件无法 `import { clientBundle }`——这解释了为什么社区里每个皮肤插件都自带 esbuild / tsdown / vite 构建（见 §3.3 各仓库 `package.json` 的 `devDependencies`）。

### 1.6 明确**不存在**的接缝（负面结果，含检索词）

在本地 checkout 全树（`--include=*.ts,*.tsx,*.md`）检索 `custom css` / `user stylesheet` / `userCss` / `customCss` / `unsafe-inline` / `userStyle`：

- **唯一命中**是 `packages/client/ui-sidebar-documentpreview/src/client/html/basic-document.ts:19` 的 CSP `style-src 'unsafe-inline'`，那是文档预览 iframe 的沙箱策略，**与用户换肤无关**。
- → **DSH Web Client 没有「用户自定义 CSS / user stylesheet」入口**。这是社区里所有「自由换肤」插件必须自己注入 `<style>` 的根本原因。
- 也没有 Tailwind 集成点：`docs/web-styling.md:17` 明写 "Use CSS Modules and `clsx`; do not add a component library or Tailwind."
- 没有主题枚举 / 校验 API（社区在 #3166 提过，见 §2.2）。`exportInspectTokens()` 只覆盖**令牌**，不覆盖**主题**。
- `ui-primitives` 在 shell 种子模块表 `PLATFORM_MODULES` 里（`packages/client/web/src/platform.ts:8-15`），所以第三方插件**可以**运行时 import 控件；但控件自带 CSS Modules，**不能靠换 token 改它的几何**。

### 1.7 官方文档站对主题/品牌/客户端定制的覆盖：**零**

`website/docs.ts` 的 `route:` 清单共 19 条（`index` / `guide/*` 6 条 / `develop/basic/*` 5 条 / `develop/framework/*` 3 条 / `develop/practice/*` 2 条 / `reference/cordis-primer`），**没有任何一条是主题、品牌、样式或客户端插件**。对已发布的 `publish.md` / `config.md` / `framework/*.md` 逐文件检索 `theme|主题|skin|皮肤|brand|品牌`：**全部 0 命中**。

- `docs/web-styling.md`、`docs/ui-radius.md`、`packages/client/ui-theme/README.md`、`packages/client/ui-primitives/README.md` 都**只存在于仓库**，文档站不发布。
- 我实际访问过的文档站 URL：<https://deepseek-harness.github.io/deepseek-harness/>（首页，JS 渲染，正文仅返回标题「DeepSeek Harness」）、<https://deepseek-harness.github.io/deepseek-harness/develop/basic/publish.md>（bundle manifest 与安装，全文读过）。`sitemap-index.xml` / `sitemap-0.xml` 均 404。

> **含义**：一个第三方作者只看官方文档站，**根本学不到怎么写主题**。所有可用知识都在源码 README 与 `docs/web-styling.md` 里。这是 §5 里「值得提 issue」的第一条。

---

## 2. 官方仓库 Discussions

### 2.1 检索方法与负面结果

- 上游 `deepseek-ai/deepseek-harness` **Discussions `totalCount = 8098`**（2026-09-29，GraphQL）。全量枚举不现实，改用 GitHub Discussion 搜索（`type: DISCUSSION`）跑 25 个查询：`theme` / `主题` / `皮肤` / `skin` / `custom CSS` / `自定义样式` / `dark mode` / `深色` / `配色` / `color` / `brand` / `品牌` / `dsw-alias` / `overrideTokens` / `appearance` / `white-label` / `rebrand` / `restyle` / `UI 皮肤` / `主题插件` / `换肤` / `icon pack` / `dsh theme` / `theme plugin`。
- **负面结果 1**：搜索的 `issueCount` 恒为 **0**（GitHub 讨论搜索不返回计数），只能用返回条数判断相关性；返回条数超过 20 的查询存在明显噪声（`深色`、`品牌` 会召回大量 Windows 沙箱 / ACL bug 帖）。
- **负面结果 2**：**fork `BotHarness/deepseek-harness` 的 Discussions `totalCount = 0`**，与上游无差异可查。
- **负面结果 3**：与皮肤/主题**直接相关**的帖子约 30 帖（下列两表），其中**平台接缝类提案 8 帖全部 0 回复或仅社区回复**。

### 2.2 平台接缝类讨论（最高信号价值）

| 帖号  | 标题（节选）                                                                 | 作者 / 日期   | 评论 | 核心诉求 | 本轮一手核实结果 |
| ----- | ---------------------------------------------------------------------------- | ------------- | ---- | -------- | ---------------- |
| [#3166](https://github.com/deepseek-ai/deepseek-harness/discussions/3166) | ui-theme: stable third-party theme manifest and listing API | yohurm / 08-18 | 1（社区） | 要一份**不执行代码即可读**的静态主题清单（id / wiring id / `--dsw-alias-*` 明暗调色板 / 对比度声明）+ 注册表枚举 API，理由是主题市场无法在不执行插件代码的前提下校验 | **部分已被上游悄悄做了**：`ThemeRuntime.exportInspectTokens()`（`ui-theme/src/client/index.ts:211`）已提供「不读 DOM、不执行代码」的令牌目录，但覆盖的是**令牌**不是**主题**；主题清单仍无 |
| [#3916](https://github.com/deepseek-ai/deepseek-harness/discussions/3916) | Extension point for third-party theme providers in Settings → Appearance | daeshawnballard / 08-21 | **0** | 加一个 `settings.appearance.provider` **list 槽**（owner = `ui-theme`），让主题提供方把 UI 渲染在原生 Appearance 行下方；作者已备好未应用的 patch 与 18 个测试 | **槽至今不存在**。核实：`AppearanceRow.tsx:31-35` 的 `CUBES` 仍是硬编码三项；`packages/client/ui-settings/lib/types/client/contract/slots.d.ts:120` 的 `settings.general.item` 是当前唯一相邻席位。该帖也是 `DexThemes` 的推广帖 |
| [#7780](https://github.com/deepseek-ai/deepseek-harness/discussions/7780) | Let a profile set the default theme preference (ui-theme composition base) | Nemuritor01 / 09-24 | **0** | 让 `ui-theme` 注册行接受 `config: {preference, fontSize}` 作为 composition `base`，这样「暗色优先」的部署不必改用户设置文档 | 核实 `theme-settings.ts:41-44`：`ThemeSettingsSchema` 只有 `preference` / `fontSize` 且带 `.default()`，**未接入 composition base**。现状默认恒为 `system` |
| [#7778](https://github.com/deepseek-ai/deepseek-harness/discussions/7778) | Theme tokens for corner radii, so a design system can set them through `theme.overrideTokens` | Nemuritor01 / 09-24 | **0** | 要 `--dsw-alias-radius-field/-card/-panel/-pill` 一类的角色化圆角令牌 | **部分过时 / 部分成立**：圆角令牌**已存在**但命名空间不同——`base.css:16-21` 有 6 个 `--dsw-radius-xs/sm/md/lg/xl/panel`（4/8/12/16/20/28px），本基线 client CSS 里 `var(--dsw-radius-*)` 出现 **297 次**；但仍有 **92 处**手写 `border-radius: <N>px` 字面量（999px×19、1px×11、2px×10、4px×8、10px×8、16px×7、8px×6、12px×5、18px×4、28px×3…）。且 `--dsw-radius-*` 声明在 `:root` 而非 `body`，**不在 `exportInspectTokens` 的 14 个内建清单里** |
| [#7859](https://github.com/deepseek-ai/deepseek-harness/discussions/7859) | White-label gap: the hero mark is replaceable, the hero tagline isn't | shen-laminagrid / 09-25 | **0** | 白标方能换 hero 品牌标记（是声明槽），但换不了 hero 标题文案（硬编码产品文案，无槽、无 locale override）。希望 locale 运行时有一个 `overrideTokens` 式的接缝 | 核实成立：`conversation.hero.brand.mark` 是声明槽（`docs/subsystems/slots.md:174`），标题文案确实无接缝 |
| [#8116](https://github.com/deepseek-ai/deepseek-harness/discussions/8116) | [Bug] `--dsw-alias-bg-layer-4` 被引用但从未定义 | jordan-liu-494 / 09-28 | 1（作者自查） | 令牌阶梯 `bg-layer-1/2/3` 有定义、`bg-layer-4` 缺失，浅色主题下 hover/active 不可读 | **本轮在一手源码上完全证实**：`grep -rn "dsw-alias-bg-layer-4" packages/client/*/src` 命中 2 个一方 CSS（`ui-primitives/src/settings-form/fields.module.css:58`、`ui-settings-subagent/src/client/SubagentModelSelectionFields.module.css:111`），`design-platform.css` 中**定义数为 0** |
| [#7951](https://github.com/deepseek-ai/deepseek-harness/discussions/7951) | [Proposal] 为桌面版 Welcome / 登录窗口提供官方扩展点 | XiaoLaoLv / 09-26 | **0** | 企业/白标场景要换 Welcome 页 logo、文案、帮助链接、配色；给出 A 声明式 overlay / B Host 侧加载 / C 首启策略开关三档 | 与 Web 主题无关，但同属「白标接缝」问题簇；本轮**未核实** Desktop 侧源码（超出本轮范围） |
| [#5756](https://github.com/deepseek-ai/deepseek-harness/discussions/5756) | Settings: merge the Appearance section into General (or allow hiding sections) | johndfowler / 09-05 | **0** | 0.1.2-rc.1 时 Appearance 是独立导航分区，只有三个立方按钮；建议并入 General 或提供隐藏分区开关 | **已过时**：`ui-theme/src/client/index.ts:455-471` 现在把 Appearance 行与字号行一起注册进 `settings.general.item`（General 分区），不再是独立分区。但「无法按分区隐藏」这一点仍成立 |
| [#5430](https://github.com/deepseek-ai/deepseek-harness/discussions/5430) | 非 loopback origin 上 Appearance 改动不持久 | panw2046 / 09-02 | 2（社区） | 主题/字号写入被硬门在 loopback | 核实方向成立：`ui-theme/README.md`「Preference persistence」段明写 "Non-loopback pages do not create that Host-backed scope"。同帖 Nemuritor01 补充 memory 模式下**连读都不走 Host**，导致非 loopback 页面上「先渲染已存值再翻回 system」的闪烁，其变通是插件自己把存储值读出来再 `theme.setTheme()` |

**维护者口径（关键负面结果）**：以上 8 帖**没有任何一帖有 DeepSeek 维护者的技术回复**。唯一署名 `@deepseek-harness` 的账号是 `Gniy7Ga`（`gh api users/Gniy7Ga` → `company: "@deepseek-harness"`，name `Ag`），但它只发了置顶的社区公告帖 [#1797](https://github.com/deepseek-ai/deepseek-harness/discussions/1797)（53 条评论全部来自社区用户），**未在任何主题帖下发言**。#1797 的官方口径只有一条与本主题相关：「分享第三方项目、插件、社群或活动时，请在显著位置注明『非官方』」。

> 因此：「这个接缝官方认可吗」只能从**源码契约**判断（§1.5 全部四条都写在官方 README / 源码里 = 事实支持），**不能**从 Discussions 判断。社区里对「overrideTokens 是官方机制」这一点**没有分歧**。

### 2.3 皮肤 / 主题插件发布帖

以下帖子的共同点：**作者自述机制，无一由维护者确认**。star 数为 2026-09-29 `gh api` 快照。

| 帖号 | 标题 | 作者 / 日期 | 帖中声明的机制 | 仓库（★ / license / 最后 push） |
| ---- | ---- | ----------- | -------------- | ------------------------------ |
| [#6776](https://github.com/deepseek-ai/deepseek-harness/discussions/6776) | dsh-neubrutalism-theme | MoriTang / 09-15 | 原文：「主题通过两个 Cordis effect 持有 token 覆盖和 `<style>` 元素。Loader 卸载插件时，两者都会被清理」 | `MoriTang/dsh-neubrutalism-theme`（0★ / Apache-2.0 / 09-16） |
| [#4632](https://github.com/deepseek-ai/deepseek-harness/discussions/4632) | E-Ink Retro 纸墨风主题 | exoticknight / 08-26 | Balanced（保语义状态色）/ Immersive（单色化）两档 | `exoticknight/dsh-theme-eink-retro`（1★ / Apache-2.0 / 09-24） |
| [#4497](https://github.com/deepseek-ai/deepseek-harness/discussions/4497) | dsh-skin-lab 皮肤作者工作台 | soarGuo / 08-25 | 官方 `--dsw-*` 全目录（帖中称 169 项）浏览器 + 实时试穿 + 「保存为皮肤（override 层）」/「固化为主题（可选主题）」+ JSON 导出 | `soarGuo/dsh-skin-lab`（0★ / 未声明 license / 09-27） |
| [#1737](https://github.com/deepseek-ai/deepseek-harness/discussions/1737) | dsh-yelan-skin 夜兰皮肤 | oevon364-ship-it / 08-15 | 17 张壁纸轮换，选择持久化 | `oevon364-ship-it/dsh-yelan-skin`（0★ / MIT / 08-15，未发过 08-15 之后） |
| [#4576](https://github.com/deepseek-ai/deepseek-harness/discussions/4576) | DSH Skin Studio | daboge-beach / 08-26 | 18 皮肤 × 5 档，档位联动**官方 `sessions.selectModel` 改推理等级**；后续更新自称做了「宿主适配层」（所有 DOM 探测集中一处）、`?safe-theme=1` 安全模式 | `daboge-beach/dsh-skin-studio`（2★ / MIT / 09-10） |
| [#5295](https://github.com/deepseek-ai/deepseek-harness/discussions/5295) | Neonforge 后朋克控制台皮肤 | Liyuk / 09-01 | 「通过 DSH Web 的插件和主题扩展点加载，使用限定作用域的选择器和语义 token」 | `Liyuk/dsh-neonforge`（0★ / MIT / 09-01） |
| [#2986](https://github.com/deepseek-ai/deepseek-harness/discussions/2986) | dsh-skin-chatlab 飞书风格聊天皮肤 | Liyuk / 08-18 | 自建 `ctx.chatlab.registerSkin` 皮肤注册表 + `core` / `skin-feishu` / `skin-dingtalk` / `skin-slack` 多包；「纯皮肤层，不碰 DSH 聊天逻辑」 | `Liyuk/dsh-skin-chatlab`（1★ / MIT / 08-22；npm `@liyuk/dsh-skin-chatlab` latest 2.1.1） |
| [#1594](https://github.com/deepseek-ai/deepseek-harness/discussions/1594) | Abyss 深海曜石（完整界面重制） | douyamv / 08-14 | 重铸 `--dsw-*` 色板 + 加 `accent-*` / `ring` 语义 + 重做阴影档 + 重画 shiki；作者主动说「令牌层可以拆成独立 bundle 提 PR」 | `douyamv/deepseek-harness-studio`（2★ / MIT / 09-18；**`fork: false` 但整棵 DSH 树**，包名 `@deepseek-ai/dsh-root` → 实为改源码的再发布，非插件） |
| [#3115](https://github.com/deepseek-ai/deepseek-harness/discussions/3115) | dsh-bloom-theme 莫兰迪玻璃主题 | webkubor / 08-18 | 10 套 OKLCH 配色 × 明暗，顶栏下拉切换，**选择存 localStorage**；`dsh.client.inject: []` + `immediately: true` | `webkubor/dsh-bloom-theme`（46★ / MIT / 09-29；npm latest 0.15.1） |
| [#1819](https://github.com/deepseek-ai/deepseek-harness/discussions/1819)（另见 [#1796](https://github.com/deepseek-ai/deepseek-harness/discussions/1796) / [#4353](https://github.com/deepseek-ai/deepseek-harness/discussions/4353)） | dsh-ui-appearance | TQSY114514 / 08-15, 08-24 | 主题色、图片/视频背景、透明度、Blur、独立侧栏透明度、配置 JSON 导入导出 | `TQSY114514/dsh-ui-appearance`（18★ / MIT / 09-27；npm latest 0.1.12） |
| [#1902](https://github.com/deepseek-ai/deepseek-harness/discussions/1902) | dsh-beautify | lieve-c / 08-15 | 关键词生成整套主题 + Bing 壁纸抓取 + 4 区独立壁纸 + 色相滑块 + AI 头像；**提供「动态插件」版（`cordis_define` + `cordis_run` 粘 `dynamic/host.js` / `dynamic/client.js`）** | `lieve-c/dsh-beautify`（6★ / MIT / 08-15，未更新） |
| [#4719](https://github.com/deepseek-ai/deepseek-harness/discussions/4719) | dsh-theme-tuner 配色小插件 | shawnlone / 08-27 | 「挂在官方那个主题切换下面」，调强调色/背景/前景/对比度/渐变度 | `shawnlone/dsh-theme-tuner`（2★ / MIT / 09-03） |
| [#1639](https://github.com/deepseek-ai/deepseek-harness/discussions/1639) | dsh-theme-cyberpunk2077 | Tommy00748 / 08-15 | 赛博朋克夜之城主题 | `Tommy00748/dsh-theme-cyberpunk2077`（31★ / 无 license 文件 / 08-16） |
| [#7536](https://github.com/deepseek-ai/deepseek-harness/discussions/7536) | 宋代主题（明暗）+ 八席 agent 看板 | yefengliu1 / 09-22 | 原文：「neither patches host source (they only consume official surfaces: **design tokens for the theme, slot registration for the board**)」 | 该帖未给主题仓库名（帖中被截断）；同作者 `yefengliu1/dsh-agent-grid`（1★ / 无 license / 09-24）**未核实主题包** |
| [#1388](https://github.com/deepseek-ai/deepseek-harness/discussions/1388) | dsh-skin-claude-code | lucasx001 / 08-14 | Claude Code 审美移植 | `lucasx001/dsh-skin-claude-code`（2★ / MIT / 09-11；`peerDependencies: {"@deepseek-ai/dsh-client-ui-theme": "^0.1.0-rc.6"}`） |
| [#3043](https://github.com/deepseek-ai/deepseek-harness/discussions/3043) | 炒股佬专用皮肤 | wangxingjun778 / 08-18 | 仅贴图 + 一个 `plugins-export.zip`，**无说明文字** | 未能核实（附件 zip 未下载） |
| [#3794](https://github.com/deepseek-ai/deepseek-harness/discussions/3794) | dsh-cornell-classic-theme 康奈尔笔记 | leamonac0823 / 08-21 | 「不修改 DSH 的原生对话、轨迹页与输入框」 | `leamonac0823/dsh-cornell-classic-theme`（0★ / MIT / 08-21） |
| [#2794](https://github.com/deepseek-ai/deepseek-harness/discussions/2794) | dsh-interface-settings | Qiongkura / 08-17 | 「不修改 DSH 源码：所有外观都通过注入 CSS 变量与规则实现」；壁纸用 `body::before` 负 z-index，玻璃用 `backdrop-filter` | `Qiongkura/dsh-interface-settings`（2★ / MIT / 08-17） |
| [#5079](https://github.com/deepseek-ai/deepseek-harness/discussions/5079) | Armory（Prompt/Skill/MCP/**Theme** 管理） | Qian-Ning / 08-30 | 一个设置面板统一管；壁纸/毛玻璃/透明度实时调；web 与 desktop **分别配置** | `Qian-Ning/prompt-skill-armory`（18★ / MIT / 09-12） |
| [#2032](https://github.com/deepseek-ai/deepseek-harness/discussions/2032) / [#1086](https://github.com/deepseek-ai/deepseek-harness/discussions/1086) / [#769](https://github.com/deepseek-ai/deepseek-harness/discussions/769) | 桌面壳自带换肤（发条屋 / Harness Desktop） | fatiaowu-desktop / baiyuscc13724-max | 皮肤**依赖 DSH 内部类名**（#2032 作者原话：「目前适配 0.1.0-rc.6，升级后可能需要微调」） | `fatiaowu-desktop/fatiaowu-desktop`（0★ / MIT / 09-19）、`baiyuscc13724-max/deepseek-harness-desktop`（10★ / MIT / 09-24） |

**与皮肤相关的故障帖**（说明生态已经在生产环境踩坑）：

- [#2944](https://github.com/deepseek-ai/deepseek-harness/discussions/2944)（wusai2333 / 08-18，0 回复）：home 层 patch 是全局的、包解析是 per-profile 的，第三方皮肤 `@linxin666/dsh-client-ui-skin-ths` 的 `insert` 会在错误的 profile 上**硬崩**（`duplicate loader entry id`）或刷启动噪声。
- [#5789](https://github.com/deepseek-ai/deepseek-harness/discussions/5789)（Xu-ziteng / 09-06，2 条社区回复）：用户装了皮肤插件后对话区无法滚动 → 卸载重装 Node → 让 AI 自行修复 → DSH 起不来。两条回复都指向 profile 配置被改坏。**无官方回复**。

### 2.4 官方 Discussions 的净结论

1. **Discussions 不是皮肤的发现渠道**。约 30 帖相关，而 GitHub 检索命中 395 个仓库——**九成以上的皮肤从未在官方仓库发帖**。
2. **没有任何一帖得到维护者技术确认或否决**。想找「官方态度」只能读源码。
3. 社区自己在讨论里已经形成了共识口径（#7536 作者原话）：「只消费官方 surface：主题用 design tokens，布局用 slot registration，不 patch 宿主源码」。

---

## 3. GitHub 上的第三方皮肤 / 主题项目

### 3.1 检索方法与规模

`gh search repos` 跑 14 个查询（`dsh-theme` / `dsh skin` / `deepseek-harness theme` / `dsh ui theme` / `dsh-plugin theme` / `dsh 主题` / `dsh 皮肤` / `deepseek harness skin` / `dsh skins` / `dsh 皮肤包` / `dsh 换肤` / `dsh appearance` / `dsh wallpaper` / `dsh theme plugin`），去重后 **395 个仓库**。

| 阈值     | 数量 |
| -------- | ---- |
| ≥0★      | 395  |
| ≥5★      | 54   |
| ≥10★     | 31   |
| ≥20★     | 19   |
| ≥50★     | 7    |
| ≥100★    | 5    |
| ≥300★    | 3    |

2026-09-01 之后仍有 push 的：**154 / 395**。逐仓库 `gh api repos/<owner>/<repo>` 核对了其中约 25 个的 star / license / `dsh.client.inject` / 源码结构。

**注意检索噪声**：`DSH-EAC/DSH-Desktop-EAC`（1789★）是桌面壳整体，不是皮肤；`elysia395/dsh-wallpaper-engine`（384★）是动态壁纸桥，属相邻类别（§3.6）。

### 3.2 四档实现机制（本轮读源码归类）

| 档位                                  | 做法                                                                                                                                                  | 断上游风险 | 代表项目 |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | -------- |
| **A. 纯令牌（token-only）**           | `inject: ['theme']` + `ctx.effect(() => ctx.theme.overrideTokens(PKG, {name: {light, dark}}))`，可选再加一张自己的 `<style>` 做描边/圆角/字体等令牌外的表现 | **低**。令牌消失只会让该条覆盖变成死变量（`overrideTokens` 不校验名字），不抛错、不白屏 | `MoriTang/dsh-neubrutalism-theme`、`lucasx001/dsh-skin-claude-code`、`shawnlone/dsh-theme-tuner`、`exoticknight/dsh-theme-eink-retro` |
| **B. 令牌 + hash 类名选择器**         | A 之上用 `[class*="_sessionRow"]` / `[class*="_themeCube"]` 这类**子串选择器**打 DSH 的 CSS Modules 哈希类名，再自己切 `body[data-ds-dark-theme]`、驱动宿主按钮 | **高**。DSH 每次发版哈希都可能变；作者一旦没跟上就是「点了没反应」或白屏 | `webkubor/dsh-bloom-theme`、`Tommy00748/dsh-theme-cyberpunk2077`、`Liyuk/dsh-skin-chatlab`、`leamonac0823/dsh-cornell-classic-theme` |
| **C. 独立 loader + 契约（资产包）**   | 一个 npm 包做**唯一** loader/renderer，皮肤是**纯资产目录**（`skin.json` + `skin.css` + `assets/`），loader 用 lightningcss 把所有选择器**强制 scope** 到 `html[data-dsh-skin="<id>"]`，并维护官方令牌快照给未映射令牌生成 `color-mix()` 回退 | **中**。契约显式版本化、官方令牌快照可重生成、换肤失败 fail-closed；但依赖 loader 自己的 DOM 适配层 | `zhu1090093659/dsh-skins`（skin-center）、`whyihaveyou/dsh-themes`、`Small-tailqwq/dsh-deepcel`（作为市场条目） |
| **D. 改 / patch DSH 源码**           | 覆盖 `packages/client/ui-theme/**` 或打 `patches/*.patch` 改一方组件加 `data-*` 钩子，然后整棵重编前端                                                          | **极高**。绑定单一旧版本，升级即失效 | `HeiGeAi/deepseek-harness-skin`（绑 `0.1.0-rc.5`）、`douyamv/deepseek-harness-studio`（整棵 DSH 树） |

**档位 D 的实证**（`HeiGeAi/deepseek-harness-skin`，52★ / MIT / push 09-23）：README 明写「需要一份 `deepseek-harness` 源码检出（版本 `0.1.0-rc.5`）…从 npm 直接跑的 `npx @deepseek-ai/dsh` 装不了，因为这套皮肤要跟着前端一起构建」；仓库内含 `patches/host-integration.patch`（给 `ui-conversation` 的 `MessageItem.tsx` / `ConversationRoot.tsx` / `ConversationSession.tsx` 加 `data-message-bubble` / `data-conversation-panel` / `data-skin-tab` 钩子）与一整份被改写的 `tree/packages/client/ui-theme/`（`AppearanceRow.tsx` 10KB vs 上游 1.6KB、新增 `skin-store.ts` / `custom-skin.ts`）。`scripts/install.sh` 先备份再覆盖。**这是最不可维护的一档。**

### 3.3 重点项目逐个（★ / license / 最后 push 均为 2026-09-29 核对）

| 仓库 | ★ | license | push | 类别 | 实现机制（读源码结论） |
| ---- | - | ------- | ---- | ---- | ---------------------- |
| [`zhu1090093659/dsh-web`](https://github.com/zhu1090093659/dsh-web) | **8131** | Apache-2.0 | 09-29 | 生态 + 市场 | 16 个功能插件的 monorepo + 皮肤中心 + 市场站。皮肤子集见下行 |
| [`zhu1090093659/dsh-skins`](https://github.com/zhu1090093659/dsh-skins) = npm `@linxin666/dsh-client-ui-skin-center` | — | Apache-2.0 | 09-29 | **档位 C，最成熟** | 见 §3.4 详解 |
| [`yonglun/deepseek-harness-themes`](https://github.com/yonglun/deepseek-harness-themes) | 0 | — | 09-05 | 档位 C | 自述「74 non-invasive themes generated from awesome-design-」，**未读源码** |
| [`d-dev0101/open-sea-skin`](https://github.com/d-dev0101/open-sea-skin) | **380** | MIT | 09-11 | 档位 B 变体 | npm `open-sea-skin@1.2.4`；`dsh.client.inject: []`。**同一份代码同时是 DSH 插件、Chrome/Edge 扩展、静态站**（`extension/` 目录 + `cordis.patch.yml`），WebGPU 实时海洋背景。插件侧无 `src/`（只提交构建产物），机制未逐行核实 |
| [`kingOfSoySauce/dsh-skin-market`](https://github.com/kingOfSoySauce/dsh-skin-market) = npm `dsh-skin-market@0.1.56` | **166** | MIT | 09-29 | 档位 B 的**皮肤市场** | `dsh.client.inject: [dsh-client-runtime, dsh-client-locale, dsh-client-ui-settings]`（**不 inject `ui-theme`**）；自带 1.2MB `data/catalog.json`，自述「已收录 200+ DSH 皮肤」+ 人工审核 + 评分。**未逐行核实其应用机制** |
| [`ymh0000123/dsh-theme-endfield`](https://github.com/ymh0000123/dsh-theme-endfield) | **106** | MIT | 09-27 | 档位 A/B | `dsh-theme-endfield@1.1.5`；inject 含 `ui-theme`。**未读源码** |
| [`rison114514/dsh-endfield-ui`](https://github.com/rison114514/dsh-endfield-ui) | 74 | 无 | 09-03 | — | 自述「industrial UI **shell**」（不是主题），无 `dsh` manifest，**未读源码** |
| [`HeiGeAi/deepseek-harness-skin`](https://github.com/HeiGeAi/deepseek-harness-skin) | 52 | MIT | 09-23 | **档位 D** | 见 §3.2 |
| [`NoNameLeGo/dsh-catppuccin-theme`](https://github.com/NoNameLeGo/dsh-catppuccin-theme) = npm `@nonamelego/dsh-catppuccin@0.5.8` | 49 | MIT | 09-28 | 档位 A | Catppuccin Latte/Mocha 移植；inject 含 `ui-theme` + `ui-settings` + `ui-renderer` + `connection` + `dsh-api-remotes`（走 Host 设置持久化）。**未逐行读源码** |
| [`webkubor/dsh-bloom-theme`](https://github.com/webkubor/dsh-bloom-theme) | 46 | MIT | 09-29 | **档位 B（最脏）** | **不走 `ctx.theme`**：`dsh.client.inject: []` + `immediately: true`，`src/client.ts:56-73` 在 IIFE 里直接 `injectCSS(buildBloomCSS(), 'bloom.css')` 三张大 sheet（`tokens.ts` 26KB / `component.ts` 46KB / `glass.ts` 23KB），用自造 `body[data-bloom-variant]` 切 10 套配色。**深浅切换靠代点宿主按钮**——`src/appearance.ts:65-120` 找 `[class*="_themeCube"]`、必要时**开一次设置面板把按钮"叫醒"再点再关**。作者自己在 `DEV_NOTES.md` 记录了踩坑 |
| [`oil-oil/dsh-theme`](https://github.com/oil-oil/dsh-theme) | 43 | MIT | 09-09 | 档位 A/B | `dsh-theme@0.2.0`；自述「Live theme editor」；有 `src/client/theme-tokens.ts` + 预设 + 持久化测试。**未逐行读源码** |
| [`niiang/dsh-kimino-theme`](https://github.com/niiang/dsh-kimino-theme) | 40 | MIT | 09-29 | — | `inject: []`，版本号 `67.0.1`（异常）。**未核实** |
| [`yoli-mi/dsh-client-ui-custom`](https://github.com/yoli-mi/dsh-client-ui-custom) = npm `@ha-na-bi/dsh-client-ui-cust…` | 37 | MIT | 09-28 | 档位 A/B | 壁纸 + 磨砂玻璃，16 个 CSS 文件，`inject: ['@deepseek-ai/dsh-client-ui-theme']`。**未逐行读源码** |
| [`FeatherHunter/dsh-opencode-palette`](https://github.com/FeatherHunter/dsh-opencode-palette) | 37 | MIT | 09-28 | — | 38 款 opencode 护眼配色，**无 `dsh` manifest**。**未核实** |
| [`TQSY114514/dsh-ui-appearance`](https://github.com/TQSY114514/dsh-ui-appearance) = npm `dsh-ui-appearance@0.1.12` | 18 | MIT | 09-27 | **档位 A + 自己的背景层（工程最规范的一个）** | 见 §3.3.1 |
| [`Qian-Ning/prompt-skill-armory`](https://github.com/Qian-Ning/prompt-skill-armory) | 18 | MIT | 09-12 | 混合 | 主题只是四个 tab 之一。**未读源码** |
| [`KinGao294/dsh-skin`](https://github.com/KinGao294/dsh-skin) | 19 | — | 08-18 | — | 皮肤切换器 + 自定义壁纸。**未核实** |
| [`tpmoonchefryan/dsh-joi-channel-theme`](https://github.com/tpmoonchefryan/dsh-joi-channel-theme) | 19 | — | 09-24 | — | 自述非商用同人。**未核实** |
| [`nevertoday/dsh-theme-plugin`](https://github.com/nevertoday/dsh-theme-plugin) | 25 | MIT | 09-16 | 档位 A | `inject: ['ui-theme', 'ui-settings', 'locale']`。**未逐行读源码** |
| [`10086ggqq/dsh_theme_terraria`](https://github.com/10086ggqq/dsh_theme_terraria) | 28 | MIT | 08-26 | — | 无 `dsh` manifest，只提交 `lib/`。**未核实** |
| [`Liu-ZA-81/dsh-theme-firefly`](https://github.com/Liu-ZA-81/dsh-theme-firefly) | 27 | MIT | 09-21 | 档位 A | `inject: ['@deepseek-ai/dsh-client-ui-theme']`，只提交 `lib/client.js`。**未逐行读源码** |
| [`chouxiaohuai/dsh-uiskin-theme`](https://github.com/chouxiaohuai/dsh-uiskin-theme) | 33 | NOASSERTION | 09-15 | — | `inject` 含 `ui-theme` + `ui-slots`。**未读源码** |
| [`whyihaveyou/dsh-themes`](https://github.com/whyihaveyou/dsh-themes) | 12 | 无 | 08-30 | **档位 C** | 151 套皮肤，自述「迁移自 aionui-themes」；每套一个自包含插件目录，明暗令牌挂在 `body[data-dsh-<id>]` / `body[data-dsh-<id>][data-ds-dark-theme]`，有 `tests/apply.spec.ts` 契约测试（apply 写的一切 dispose 时全部收回）。**未逐行读源码** |
| [`LvvUP/dsh-themes-skills`](https://github.com/LvvUP/dsh-themes-skills) | 0 | Apache-2.0 | 09-07 | **元工具** | 自述「Open skills for creating and managing **verified** DeepSeek Harness themes」，含 `scripts/plugin-recommendation-contract.mjs`、`release-state.json`、`docs/verification/*.json`、rc2 认证 CI。**未读源码**——但对本仓库 `dsh-plugin-dev` 的「如何把一个领域知识固化成可复用流程」有参考价值 |
| [`SamizuHM/dsh-client-ui-theme-xp`](https://github.com/SamizuHM/dsh-client-ui-theme-xp) | 7 | MIT | 08-16 | 档位 A | Windows XP Luna 主题，无 `dsh` manifest、无 CSS 文件（只提交 `lib/`）。**未读源码** |
| [`Douyamv/deepseek-harness-studio`](https://github.com/douyamv/deepseek-harness-studio) | 2 | MIT | 09-18 | **档位 D** | `fork: false`，但整棵 DSH 树 + `docs/` + `python/` + `vendor/`，包名 `@deepseek-ai/dsh-root`，基于 `47f9438`（0.1.0-rc.5）。**改源码再发布，不是插件** |

#### 3.3.1 `dsh-ui-appearance` 值得单独抄（工程最规范）

读了它的 `package.json` / `src/client/index.ts` / `src/client/applier.ts` / `src/client/tokens.ts`：

- `package.json` → `dsh.client.inject: [store, locale, ui-settings, **ui-theme**, primitives, slots]`；`peerDependencies` 里 `@deepseek-ai/dsh-client-ui-theme: "*"`。
- `src/client/index.ts:50` → `export const inject = ['slots', 'locale', 'theme']`。
- `src/client/applier.ts:88` → `this.ctx.theme.overrideTokens(OVERRIDE_SOURCE, tokens)`，disposer 由插件自己留着，dispose 时精确撤回。
- `src/client/tokens.ts:16` → `OVERRIDE_SOURCE = '@deepseek-ai/dsh-client-ui-appearance'`（**一个 source 一层**，符合 `overrideTokens` 的 source 语义）；`tokens.ts` 里 166 处 `--dsw-alias-*` / `--dsw-specific-*` 名，全部成 `{light, dark}` 对，注释里标注对应的 `neutral-bluish-*` 静态色阶。
- `applier.ts` 另自有**一张** `<style id="dsh-appearance-styles">` + **一个**固定背景层 `<div id="dsw-appearance-bg">`（`z-index: -1`、`inset: -48px` 给 blur 留余量），全部在 dispose 里移除。
- 持久化**不用 Host settings**：`index.ts:12-16` 注释解释「harness settings gateway 只把硬编码的产品命名空间暴露给浏览器客户端，第三方命名空间写不进去」，所以整节配置落 `localStorage`（`STORAGE_KEY = 'dsh-ui-appearance.settings'`），背景媒体走 IndexedDB blob。
- 有一段**极有价值的工程注释**（`applier.ts:28-47`）：解释为什么**不能**给 `#root` 加 `backdrop-filter` / `z-index`——那会让 `#root` 变成所有 fixed 后代（菜单、tooltip、toast）的包含块并把它们困在 stacking context 里，导致第三方 fixed 面板盖住 DSH 设置对话框（`z-index: 1000`）。这是踩过坑的人才写得出的约束。
- 有 17 个测试文件（`tests/`，含 `tokens.client.spec.ts` 30KB / `applier.client.spec.ts` 13KB）。

### 3.4 皮肤契约与市场：目前最成熟的形态

**`@linxin666/dsh-client-ui-skin-center`（npm latest 0.4.4，Apache-2.0，modified 2026-09-29；仓库 [`zhu1090093659/dsh-skins`](https://github.com/zhu1090093659/dsh-skins)）**。它的 `contracts/README.md` 把自己定义为「皮肤（纯资产目录）与 skin-center（唯一 loader/renderer）之间的权威契约面」，并说明「Skins couple to these contracts only; the skin-center absorbs every official-DSH coupling behind them」。要点（本轮逐条读过）：

1. **皮肤不是插件**：`skin.json` + `skin.css`（可选 `patches.css` / `hooks.mjs`）+ `assets/` + `preview/`，无 `package.json`、无 npm 发布、无 cordis 接线。装到 `$DSH_HOME/skins/<id>/`。
2. **强制作用域**：*「All skin CSS is force-scoped under `html[data-dsh-skin="<id>"]` by the loader (lightningcss transform); skins never declare `bodyAttr`」*——这一条正面解决了档位 B 的哈希类名脆弱问题。
3. **CSS 白名单**：禁 `@import`、远程/协议相对 URL、越界路径、内联 JS；**依赖 CSS Modules 哈希类名（`[class*=...]`）会告警**。只允许目录内相对资源。
4. **三级覆盖契约**：
   - **L1** 重映射官方 `--dsw-*` 令牌（正解）
   - **L2** 覆盖语义属性 `data-dsh-surface` / `data-dsh-part` / `data-dsh-plugin`（枚举见 `contracts/semantic-attrs-v1.md`），由一个 compat adapter 从 `data-slot` 出口等稳定锚点**打到官方 shell DOM 上**
   - **L3** `patches.css` 任意选择器，README 自陈「runs with full page styling power and is **not** a security boundary」
5. **官方令牌快照 + 自动回退**：`contracts/official-tokens-v1.json` 快照官方发布的每个 `--dsw-*`（静态色板除外），由 `scripts/official-tokens-snapshot.mjs` 在前端变动时重生成；**皮肤没映射的令牌，loader 用 `color-mix()` 从皮肤自己的主色推导半透明染色**，让新出的官方 surface 保持皮肤观感而不是弹回默认色板。**这是整个生态里最关键的一条抗上游漂移设计。**
6. **fail-closed 校验**：`contracts/skin-manifest-v2.schema.json` + `src/core/manifest-v2/validate.ts`（运行时的权威检查，schema 只是镜像），未知字段硬错；v1 的 `package` / `wiring` / `bodyAttr` 是显式白名单，带迁移警告忽略。
7. **首屏不闪**：host 半侧注册一个 index.html transform（`webServer.tapIndex`），在每份被服务的文档里打上 `html[data-dsh-skin]` 并插入 stylesheet link；任何问题 fail-closed 回落原生。**注意：这一条是 Host 插件能力（`webServer` + index tap），不是 `ctx.theme` 能力**——官方 `ctx.theme` 的对应物只是 `ui-theme` 自己的 `boot-theme.ts` 内联脚本。
8. **切换原子性**：`src/client/runtime/skin-controller.ts` 的 effect ledger，一次切换 = 一个新激活身份，append-only 幂等拆除，最新请求必胜，失败/被取代的切换**保留上一个皮肤完整**。免落盘试穿 = 同一引擎去掉持久化。
9. **hooks 信任模型**：`hooks.mjs` 只对「内置皮肤」与「可执行身份经 sha256 逐字节校验过的官方市场安装」开放（`dsh-market.provenance.json` / 生成的 `src/reviewed-hooks.generated.ts`），本地手放的目录永远拒绝 hooks，但声明式部分照常加载（issue #1073）。
10. **`skin.json` schema**（v2）：`skinManifestVersion`（文件结构版本，**不是**兼容协商轴）、`id`（`^[a-z][a-z0-9-]{0,31}$`）、`name` / `nameEn` / `version` / `author` / `contributes`（必需），可选 `tagline` / `description` / `tags` / `accent`（`^#[0-9a-fA-F]{6}$`）/ `order` / `license` / `licenseUrl` / `noticeUrl` / `sourceUrl` / `attribution`；`facets.client.apiVersion` 是**独立协商**的 hooks 运行时版本；`requires.contracts[]` 声明契约依赖（`optional: true` = 有降级路径）。
11. **已知限制（README 自陈）**：插件运行时写的 inline style 只能被 L3 `!important` 覆盖；不产语义属性的插件只有 L1 覆盖。

**市场**：[`https://dsh-market.com`](https://dsh-market.com)（本轮实际抓取，站点通过 `Accept: text/markdown` 提供 agent 可读表示，并给出 `/.well-known/api-catalog` 与 `openapi.json`）。分类是 **皮肤 / 宠物 / 插件** 三类，**皮肤是一等分类**，本轮抓到的皮肤条目约 50 条（`porco-rosso`、`verdandi`、`whale-song`、`blue-fantasy`、`last-exile`、`harbor`、`white-snake`、`blueprint`、`xp`、`dragon-heir`、`cafe-roastery`、`minecraft`、`trading`、`miku`、`whale-mom`、`matrix`、`maid-atelier`、`summer-liquid-glass`、`phoebe-atelier`、`island-life`、`ice-princess`、`observatory`、`stellar-diva`、`hive-maw`、`starry-nocturne`、`ember-fall`、`hologram-sanctum`、`abyssal-serenade`、`astral-choir`、`pixel-anime`、`black-gold`、`shangmei-jinbi`、`mid-autumn`、`whale-fantasy`、`claude`、`furina`、`mint`、`remiel-starlit`、`cyber-night`、`deep-current`、`pink-sakura`、`war-thunder`、`wallpaper-exclusive`、`future-window`、`orca-link`、`catppuccin`、`tokyo-night`、`blue-throated-bee-eater`、`whalechan-harness`、`whale-maid`），每条带 `实时试穿: https://dsh-market.com/tryon/?skin=<id>`。`mint` 被标为「官方锚定的范例皮肤……社区作者复制本目录、改颜色、改 id 即可发布一个永远安全的皮肤」。

**第二个市场**：[`kingOfSoySauce/dsh-skin-market`](https://github.com/kingOfSoySauce/dsh-skin-market)（166★）自述「已收录 200+ DSH 皮肤」，带评分与人工审核，独立实现。
**第三个**：[`LivXue/dsh-plugin-shop`](https://github.com/LivXue/dsh-plugin-shop)（npm `dsh-plugin-shop@0.8.3`，见 discussion [#5867](https://github.com/deepseek-ai/deepseek-harness/discussions/5867)）——全量抓取 npm 上带 `dsh-plugin` / `deepseek-harness` 关键字的包与 GitHub topic，帖中称 2026-09-06 那版「9,753 listed plugins and 11,614 filtered out」；**它是插件市场，不分类主题，本轮未核实其皮肤条目**。

> **没有找到任何 DeepSeek 官方维护的插件注册表 / 主题市场。** 上游仓库里 `.agents/notes/implemented/architecture/2026-09-18-plugin-install-registries.md` 存在（本轮未读），但那讲的是「安装来源」，不是「市场/分类」。

### 3.5 生态规模的一句话

**Discussions 只露出约 30 个项目，GitHub 实际有 395 个相关仓库、54 个 ≥5★、5 个 ≥100★、154 个本月还在动。** 换句话说：**「DSH 没有皮肤生态」是错误结论；正确结论是「皮肤生态已经跑在 `ctx.theme.overrideTokens` + 自注入 CSS 这条事实上标准路径上，并且已经自发出了一套比官方更完整的皮肤契约与市场」。**

### 3.6 明确排除在「皮肤」之外（按文件名交叉引用既有笔记，不重研）

| 类别                    | 例子                                                                              | 归属笔记 |
| ----------------------- | --------------------------------------------------------------------------------- | -------- |
| 头像 / 图标包           | blobatar、vendored Lucide、grok bot 视觉复刻                                     | `docs/research/2026-09-19-avatar-and-icon-references.md` |
| 桌面宠物 / Live2D       | BongoCat、AnySoul、Live2D 引擎、dsh-pet                                          | `docs/research/2026-09-21-desktop-pet-and-live2d.md`、`2026-09-21-anysoul-live2d-runtime.md`、`2026-09-21-personabot-computer-and-live-view.md` |
| 组件库 / 设计系统对比   | coss、Nimbus、`ui-primitives` catalog                                              | `docs/research/2026-09-18-dsh-design-tokens-vs-coss.md` |
| 通用社区插件生态扫描    | dsh-im / dsh-lark-link / dsh-agent-team / dsh-memento 等                          | `docs/research/2026-09-19-dsh-community-plugins-survey.md`（该文抽样约 70 帖，**theme / skin 命中 0**，故本文件不与其重复） |
| 生态综述 / awesome 清单 | awesome-dsh-* 系列、Multica                                                      | `docs/research/2026-09-21-awesome-dsh-ecosystem-survey.md`、`2026-09-27-multica-survey.md` |
| 相邻但不同的类别        | `elysia395/dsh-wallpaper-engine`（384★，动态壁纸桥，**不是换肤**）、`DSH-EAC/DSH-Desktop-EAC`（1789★，桌面壳整体）、`rison114514/dsh-endfield-ui` / `MichengAI/dsh-codex-ui`（102★，**替换侧栏/设置页的 shell 插件**，自建 `--dcu-*` / `--sp-*` 私有 token 并在 patch 里 `disabled: true` 官方 `ui-sidebar` / `ui-settings-general`，不是主题） | 本文件 §3.1/§3.3 |

---

## 4. 对比表：官方接缝 vs 社区做法

| 维度                     | DSH 官方（`ctx.theme`）                                                     | skin-center 契约（社区最成熟）                                  | 单插件 overrideTokens（社区主流）                                 | hash 类名选择器（档位 B）                    | 改 DSH 源码（档位 D）        |
| ------------------------ | --------------------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------ | ---------------------------- |
| 声明方式                 | `inject: ['theme']`                                                         | 一个 loader 包 + `skin.json` 资产目录                            | `inject: ['theme']`                                               | `inject: ['theme']` 或 `[]`                | 覆盖文件 / 打 patch          |
| 换肤落点                 | `body` 内联 CSS 变量（`theme-presenter.ts:64-67`）                          | `html[data-dsh-skin="<id>"]` 强制 scope + 官方令牌重映射          | 同官方                                                             | 自己 `<style>` + `body[data-*]` 属性        | 改 `design-platform.css`     |
| 明暗处理                 | 自动（presenter 按 `active.colorScheme` 挑值）                               | `body[data-ds-dark-theme]` 由官方驱动；皮肤可强制 dark-only       | 手动（大部分插件自己写两套）                                     | 手动                                          | 手动                          |
| 卸载清理                 | disposer + `ctx.effect` 自动                                                | effect ledger 原子拆除                                           | 手写 disposer                                                     | 手写，且哈希失配时**清不掉**                | 无                           |
| 抗上游漂移               | 令牌名不被校验（写错静默失效）；令牌数量 6 周内 81→93                          | `official-tokens-v1.json` 快照 + 未映射令牌 `color-mix()` 自动回退  | 无                                                               | 无（且随发版漂移）                            | 无（锁死旧版本）              |
| 首屏不闪                 | `ui-theme` 自己的 `boot-theme.ts` 内联（**只对内置三值有效**）               | host 半侧 `webServer.tapIndex` 注入 link                          | 多数不处理                                                       | 多数不处理                                    | N/A                          |
| 失败模式                 | 未注册 id → `setTheme` throw；缺 `{light,dark}` → 教学式 TypeError            | schema 校验 fail-closed，坏皮肤被排除并报诊断                     | 静默半生效                                                       | 静默半生效 / 交互失效                        | 升级即崩                      |
| DSH 依赖                 | 官方包，版本敏感                                                             | `dsh.engines.dsh: ">=0.1.7-rc.1"`                                | 多数不声明（bloom 甚至 `inject: []`）                            | 多数不声明                                     | 锁 `0.1.0-rc.5`              |
| 生态规模                 | —                                                                            | 1 loader + ~50 市场皮肤                                          | 395 仓库 / 54 个 ≥5★                                              | 同上（含在内）                                | 2 个                         |

---

## 5. 对 BotHarness 的启示

### 5.1 官方认可的做法是什么

**唯一一条被官方 README 与源码同时背书的换肤路径是：**

```ts
// package.json
"dsh": { "bundle": { "patch": "./cordis.patch.yml" },
         "client": { "inject": ["@deepseek-ai/dsh-client-ui-theme"], "platform": "web" } }

// cordis.patch.yml
- insert:
    - id: botharness-theme
      name: '@botharness/client'

// src/client/index.ts
import type { ThemeTokenOverrides } from '@deepseek-ai/dsh-client-ui-theme/client'  // type-only，取 Context merge
export const inject = ['theme']
export const TOKEN_OVERRIDES: ThemeTokenOverrides = {
  '--dsw-alias-brand-primary': { light: '#…', dark: '#…' },
  // 只写语义别名；成对提供 light/dark；不写主题选择器
}
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.theme.overrideTokens('@botharness/client', TOKEN_OVERRIDES))
  ctx.effect(() => {                       // 令牌管不到的（描边/圆角/字体/插画）放自己的一张 sheet
    const tag = document.createElement('style')
    tag.dataset.plugin = '@botharness/client'
    tag.dataset.pluginCss = '@botharness/client/brand.css'
    tag.textContent = BRAND_CSS
    document.head.append(tag)
    return () => { tag.remove() }
  })
}
```

配套：品牌 logo 走**槽位替换**（不装 `ui-brand-official`，自己写一个包占 `sidebar.brand.mark` / `sidebar.brand.name`，见 `packages/client/ui-brand-official/README.md`「Replacing the brand」）；设置 UI 走 `settings.general.item` 槽加一行（这是**声明过的**槽，参照 `ui-theme` 自己的 `index.ts:455-462` 与 `dsh-ui-appearance` 的做法），**不要**指望 `register()` 的主题自动出现在 Appearance 行（§1.4）。

**这与 BotHarness 已有的 `dsh-ui` 规范是一致的**（只用 `--dsw-*` 语义别名 + `ui-primitives` + `clsx`/CSS Modules）。本轮的新增约束只有两条：(a) 品牌色如果要做，只做 `overrideTokens` 一层薄的语义映射，且**必须成对提供 light/dark**（裸字符串会 throw）；(b) 自己注入的 `<style>` 一定要带 `data-plugin` / `data-plugin-css` 属性并随 `ctx.effect` 拆除，否则 HMR 与卸载会残留。

### 5.2 什么算 hack

| 做法                                                                 | 判定 | 依据 |
| -------------------------------------------------------------------- | ---- | ---- |
| 用 `[class*="_sessionRow"]` 打 DSH 的 CSS Modules 哈希类名                  | **hack** | 哈希随发版变。`webkubor/dsh-bloom-theme` 为此专门写了 `[class*="_themeCube"]` + 「开一次设置面板把按钮叫醒」的兜底（`src/appearance.ts:65-120`），并在 `DEV_NOTES.md` 记坑 |
| 改自己复制一份 `data-ds-dark-theme` 来切明暗                             | **半 hack** | 可以工作（属性在 `body` 上、可被外部读写），但会与官方 presenter 争夺真源。bloom 这么做了（`body[data-bloom-variant]`），且作者明确解释「深浅状态由 DSH 自己持有……自己 removeAttribute 能立刻变色，但刷新就回退」 |
| 代点宿主按钮来改宿主状态（`button.click()`）                            | **hack** | 同上，是 DOM 代理而非服务调用 |
| 用 `setTheme('my-theme')` 激活自定义主题 id                              | **半 hack** | 能跑（`register()` 后 id 在注册表里），但**不落盘**（`index.ts:238` 只写内置三值），刷新丢失 |
| 覆盖 / patch DSH 源码                                                   | **hack** | `HeiGeAi/deepseek-harness-skin` 锁 `0.1.0-rc.5`；`douyamv/deepseek-harness-studio` 整棵再发布 |
| 在 bundle patch 里 `disabled: true` 官方插件再自插同名槽位               | **hack（但常见）** | `MichengAI/dsh-codex-ui` 的 `cordis.patch.yml` 就是这样；属于「与上游并行维护一份 UI」 |
| 自己算一套 `--dsw-alias-*` 值塞进 `<style>` 而不走 `overrideTokens`        | **可接受但次优** | chatlab 这么干（`packages/core/src/theme.js:buildCss`）；值最终不是 body 内联变量，优先级要靠选择器打架 |
| 直接写 `body { --dsw-alias-x: … }`                                      | **危险** | 见 discussion #8116 作者自查：令牌声明在 `body`，`var()` 在**声明它的元素上**解析，所以在 `:root` 上定义会解析不到 `bg-layer-3` / `label-primary` 而回落到 fallback。可行写法是 `:where(body) { … }`（零特异性，官方定义可覆盖） |

### 5.3 按可维护性 / 升级风险排序（BotHarness 视角）

1. **最优：`ctx.theme.overrideTokens` + 一张自注入 `<style>` + `settings.general.item` 一行 + 品牌槽替换。** 升级风险最低——令牌改名只会让个别变量失效，不会崩。要抄的具体形态是 `dsh-ui-appearance`（`applier.ts` / `tokens.ts` 结构最干净）。
2. **次优：抄 skin-center 的「令牌快照 + 未映射令牌 `color-mix()` 回退」这**一条**。** 这是本轮读到的最有价值抗漂移设计：不用 fork loader，只要在 `overrideTokens` 之外，对**我们不覆盖**的 `--dsw-alias-*` 补一层 `color-mix(in srgb, var(--our-accent) 6%, var(--dsw-alias-…))`，新出的官方 surface 就不会弹回默认灰。成本几乎为零。
3. **可用但要设闸：把 UI 放进 slot 而不是覆盖 shell。** `ui-brand-official` 已经给出「换品牌 = 换一个占同样槽位的包」的官方范式，DeepSeekBot 若要自己的 logo/名字，这是唯一被背书的路线。
4. **要避免：任何形式的 `[class*=]` hash 选择器与代点宿主按钮。** 生态里已经有用户因此把 DSH 搞到起不来（#5789）与 boot 崩溃（#2944）。
5. **绝对避免：patch / fork DSH 源码。**

### 5.4 值得提 DSH issue / discussion 的问题（可直接照抄去开帖）

> 以下四条均基于本轮确认的**源码事实**，不是猜测。

1. **Appearance 行的第三方主题接缝**：能否在 `ui-theme` 拥有的 `settings.general.item` 行内提供一个 `list` 席位（提案草案见 discussion #3916），让主题提供方把 UI 渲染在原生 Light/Dark/System 三个立方按钮下方？现状：`ctx.theme.register()` 存在但无任何 UI 入口（`AppearanceRow.tsx:31-35` 硬编码三项），`setTheme` 只持久化内置三值（`ui-theme/src/client/index.ts:238`），所以第三方主题刷新即失。
2. **composition base**：能否让 `ui-theme` 注册行接受 `config: {preference, fontSize}` 作为 settings 的 composition `base`？现状 `ThemeSettingsSchema`（`theme-settings.ts:41-44`）只有带 `.default()` 的字段，暗色优先的部署无法在 profile 层声明，只能写用户设置文档（见 discussion #7780）。
3. **令牌自省 API**：能否为**主题**（而不只是令牌）提供一个「不执行代码即可枚举」的静态清单 + 枚举 API，配套一份 JSON Schema（可参考 `zhu1090093659/dsh-skins` 的 `contracts/skin-manifest-v2.schema.json`）？`exportInspectTokens()` 已覆盖令牌，缺主题侧（见 discussion #3166）。
4. **令牌完整性 + 角色化圆角**：
   - a. `--dsw-alias-bg-layer-4` 被 `ui-primitives` 与 `ui-settings-subagent` 引用但从未定义（已在 discussion #8116 报告，本轮在 `dsh-v0.1.7-rc.2-1-gaa43257` 上复核仍成立）；是否考虑加一条 CI 门禁「所有被引用的 `--dsw-*` 必须有定义」？
   - b. `--dsw-radius-*` 6 个令牌声明在 `:root` 而非 `body`，也不在 `exportInspectTokens` 清单里，client CSS 仍有 92 处手写 `border-radius` 字面量；是否考虑把它们规范化进 `--dsw-alias-radius-*` 命名空间使其可被 `overrideTokens` 覆盖（见 discussion #7778）？

---

## 6. 未验证 / 存疑

1. **未安装、未运行任何皮肤插件**；所有机制判断来自**读源码 + 读 `package.json` 的 `dsh` manifest + 读 `cordis.patch.yml`**，未做运行时验证。「实际渲染是否正确」一律未验证。
2. **395 个命中仓库中只逐行读了约 8 个**（`dsh-ui-appearance`、`dsh-neubrutalism-theme`、`dsh-bloom-theme`、`dsh-skin-lab`、`dsh-skin-chatlab`、`dsh-theme-eink-retro`、cyberpunk/claude-code/cornell 的构建产物 grep、`dsh-skins` 的 contracts + README）。其余在表格里已逐条标注「未读源码 / 未核实」，**其机制分类是从 `dsh.client.inject` 推断的，可能不准确**。
3. **`kingOfSoySauce/dsh-skin-market` 自述「200+ 皮肤」未核实**；`dsh-market.com` 的皮肤条目数（本轮抓到约 50 条）取决于该站的 markdown 表示是否完整。
4. **discussion #7536 的宋代主题仓库名未能确定**（帖中被截断），只核实了同作者的 `dsh-agent-grid`。
5. **discussion #3043 的附件 zip 未下载**（炒股佬皮肤内容完全未知）。
6. **`docs/subsystems/slots.md` 只读到与品牌相关的 4 个槽名**（`sidebar.brand.mark` / `sidebar.brand.name` / `conversation.hero.brand.mark`），完整槽表未通读。
7. **未读 `.agents/notes/implemented/architecture/2026-09-18-plugin-install-registries.md`**，因此「上游是否有官方插件注册表」这一点只覆盖了「市场/分类」维度，未覆盖「安装来源注册表」维度。
8. **未核实 `zhixun-dai/Catppuccin-dsh-theme`（10★）等未入表的 ≥5★ 项目**。
9. **Desktop（Electron）侧的换肤接缝未调研**（`DSH_CLIENT_TITLE` / `DSH_CLIENT_BUILD_PROFILE` 只从 `scripts/client-build-environment.ts:21-22` 与 `ui-brand-official/README.md` 读到，未验证实际行为）。

---

## 7. 一手来源与访问日期

全部访问日期 **2026-09-29**。

| 来源 | 用途 |
| ---- | ---- |
| 本地 `/Users/doodlebear/Documents/code/deepseek-harness` @ `aa43257`（`dsh-v0.1.7-rc.2-1-gaa43257`） | `BRAND_GUIDELINES.md` / `.zh.md`；`docs/web-styling.md`；`packages/client/ui-theme/`（`src/client/index.ts`、`styles.ts`、`theme-settings.ts`、`boot-theme.ts`、`src/styles/{design-platform,base}.css`、`README.md`）；`packages/client/ui-layout/src/client/theme-presenter.ts`；`packages/client/ui-brand-official/{README.md,src/client/index.ts,src/client/Brand.tsx}`；`packages/client/web/src/platform.ts`；`packages/client/tsdown.client.ts`；`packages/client/modules/lib/types/client/manifest.d.ts`；`packages/client/AGENTS.md`；`packages/client/ui-settings/lib/types/client/contract/slots.d.ts`；`docs/subsystems/slots.md`；`scripts/client-build-environment.ts`；`website/docs.ts` |
| `deepseek-ai/deepseek-harness` Discussions（`totalCount = 8098`） | 25 个搜索查询 + 逐帖读正文/评论：#3166 #3916 #7780 #7778 #7859 #8116 #7951 #5756 #5430 #1797 #6776 #4632 #4497 #1737 #4576 #5295 #2986 #1594 #3115 #1819 #1796 #4353 #1902 #4719 #1639 #7536 #1388 #3043 #3794 #2794 #5079 #2032 #1086 #769 #1430 #2944 #5789 #5867 #4456 |
| `BotHarness/deepseek-harness` Discussions | 确认 fork 侧 `totalCount = 0` |
| `gh search repos`（14 个查询） | 395 个命中仓库的清单与 star/push |
| `gh api repos/<owner>/<repo>` | 逐仓库 star / license / default_branch / `fork` / `pushed_at` |
| `gh api repos/<r>/git/trees/<b>?recursive=1` + `contents` | 读 20+ 个仓库的文件树、`package.json`、`cordis.patch.yml`、client 源码与 contracts |
| npm registry | `@linxin666/dsh-client-ui-skin-center@0.4.4`、`dsh-bloom-theme@0.15.1`、`dsh-ui-appearance@0.1.12`、`@liyuk/dsh-skin-chatlab@2.1.1`、`dsh-skin-market@0.1.56`、`dsh-plugin-shop@0.8.3` |
| <https://dsh-market.com> | 皮肤 / 宠物 / 插件三分类与皮肤条目 |
| <https://deepseek-harness.github.io/deepseek-harness/> 与 `/develop/basic/publish.md` | 文档站路由清单与发布教程（**无主题/品牌内容**） |
| `gh api users/Gniy7Ga` | 确认唯一署名 `@deepseek-harness` 的账号身份（`company: "@deepseek-harness"`） |
| 交叉引用（不重研） | `docs/research/2026-09-18-dsh-design-tokens-vs-coss.md`、`2026-09-19-dsh-community-plugins-survey.md`、`2026-09-19-avatar-and-icon-references.md`、`2026-09-21-desktop-pet-and-live2d.md`、`2026-09-21-awesome-dsh-ecosystem-survey.md`、`2026-09-27-multica-survey.md` |
