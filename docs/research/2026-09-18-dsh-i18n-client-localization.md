# DSH Web Client 本地化（locale / i18n）机制调研 — 面向 BotHarness `@botharness/client`

## 0. 元信息

| 项           | 内容                                                                                                                                                                                                                                                                                                                                           |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 问题         | ① DSH Web Client 的本地化服务（`dsh-client-locale`）契约是什么：语言如何选择/持久化、字典如何注册与查找、组件如何拿到 `t`？② BotHarness 客户端要中英双语，应采用什么方案（命名空间、字典文件、切换与覆盖率门禁）？③ Paraglide 是否适合作为替代/补充？                                                                                          |
| 上游仓库     | https://github.com/deepseek-ai/deepseek-harness （文档站 https://deepseek-harness.github.io/deepseek-harness/）                                                                                                                                                                                                                                |
| Pinned SHA   | `ddefc45fbc7f8e46dd73185e68295696d1297887`（2026-09-17 21:19 +0800，tag `dsh-v0.1.6-alpha.2`）。本文未加前缀的 `packages/...`、`docs/...`、`scripts/...` 路径与行号均相对该 SHA；克隆在 `/tmp/dsh-src`（上轮调研留下，sparse/只读）                                                                                                            |
| npm 快照     | 2026-09-18 查询：`@deepseek-ai/dsh-client-locale` dist-tags `latest = 0.0.1-rc.1`、`next = 0.1.5-rc.2`、`alpha = 0.1.6-alpha.2`；`@deepseek-ai/dsh-web-app@0.1.5-rc.2` 的 dependencies 显式含 `@deepseek-ai/dsh-client-locale: ^0.1.5-rc.2`（`pnpm view`，2026-09-18）                                                                         |
| 本地安装快照 | DeepSeekBot-m3 `packages/client/node_modules/@deepseek-ai/` 共 12 个包，**不含 `dsh-client-locale`**；`packages/client/package.json` 与 `pnpm-lock.yaml` 也无 locale 条目。为核对 0.1.5-rc.2，用 `npm pack @deepseek-ai/dsh-client-locale@0.1.5-rc.2` 落到 `/tmp/dsh-locale-probe/`，其 `lib/types/**` 与上游 alpha 源码逐条比对一致（见 §11） |
| 调研方法     | 一手来源优先：pinned SHA 源码 + 官方 README/子系统文档 + 上游 CI 脚本；0.1.5-rc.2 npm tarball；已安装 0.1.5-rc.2 包的 `lib/types/**/*.d.ts` 与 `lib/client.js`（符号 grep）；`pnpm view` registry 元数据。所有 URL 访问日期 **2026-09-18**。无法由一手来源确认的一律标「未验证」。本次未安装/运行任何插件，未改动工作区（唯写本文件）          |

一句话结论：DSH 自带一套**运行时 locale 服务**（`@deepseek-ai/dsh-client-locale`，随 `dsh-web-app` 组成默认装载），提供 Host 持久化偏好、浏览器语言回退、语言包目录、类型化命名空间字典与 slot 的 `t` 席位；BotHarness 只需注册一个 `botharness` 命名空间并把槽注册加上 `locale:`，**语言切换/设置 UI/持久化零代码**。Paraglide 解决的是「构建期编译 + tree-shaking + ICU 复数」这一类问题，与 DSH 的运行时席位、即时切换（无刷新）和所有权模型冲突，**不采纳**（理由见 §9）。

---

## 1. 服务在哪：包、组成与分发

| 事实                      | 证据                                                                                                                                                                                                                                                                                                             |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 本地化 = 一个包（两半侧） | `@deepseek-ai/dsh-client-locale`：Host 半 `src/index.ts`（注册 settings 命名空间），浏览器半 `src/client/index.ts`（`LocaleRuntime` 服务 + 设置行 UI）；`package.json` 的 `exports["."]`/`exports["./client"]` 同时给出两半（`packages/client/locale/package.json:16-27`）                                       |
| 默认随 `dsh web` 组成     | Web app bundle 的 Loader 清单含 `- id: locale / name: '@deepseek-ai/dsh-client-locale'`（`packages/bundle/web-app/cordis.patch.yml:204-205`）；`dsh-web-app` 直接依赖它（npm 快照），`dsh.client.immediately: true`（`packages/client/locale/package.json:28-38`）                                               |
| 一等基础设施（先于渲染）  | 文档要求「在任何需要 `t` 的首次渲染之前安装 LocaleFace；后到的 face 无法通知已挂载 outlet」（`packages/client/ui-slots/src/renderer.ts:9-21`）；渲染入口声明 `locale` 缺失时硬失败（`packages/client/ui-renderer/src/client/scoped-slots.tsx:555-563`）                                                          |
| 本地 m3 未安装            | `packages/client/node_modules/@deepseek-ai/` 无该包；因此当前源码里还没有任何 `locale` 接入。要写客户端类型需要把它加进 devDependencies（0.1.5-rc.2 已发布，见 §10.1）                                                                                                                                           |
| 上游对第三方包的做法      | 第一方客户端包统一：`devDependencies` 加 `@deepseek-ai/dsh-client-locale`（仅类型/Context merge），`inject` 数组加 `'locale'`，`package.json` 的 `dsh.client.inject` 也列它（信息性，供预检/HMR diff）——例：`packages/client/ui-sidebar/package.json:33-41`、`packages/client/ui-sidebar/src/client/index.ts:41` |

客户端与服务端的关系：**服务端不本地化 UI 文案**。Host 半只做一件事——把 `locale.preference` 注册为可持久化的 settings 命名空间（`packages/client/locale/src/index.ts:16-23`，schema 见 `src/locale-settings.ts:29-55`），再无其它 host 侧翻译设施（全仓 `packages/` 非 client 命中均为 `localeCompare` 等误匹配）。桌面端 electron 静态页仍是 `<html lang="en">`（如 `apps/desktop/renderer/mandatory-update.html:2`），不走此服务——那是 DSH 自己的覆盖问题，不是客户端插件的。

---

## 2. 语言是怎么选的（优先级、持久化、作用域）

优先级（`LocaleRuntime` 构造与 adopt，`packages/client/locale/src/client/index.ts:162-193,285-307`；README `### Choosing a language` / `### Preference resolution`，`README.md:30-33,80-83`）：

1. **Host 持久化偏好**：`$DSH_HOME/settings.yaml` 里的 `locale.preference`（settings 命名空间 `locale`，字段 `preference`，schema 校验 BCP 47 风格：`src/locale-settings.ts:29-55`）。浏览器启动时先给一个 provisional 值，**在插件激活后**读取 settings scope；读到就 live 替换（A stored external locale 未注册时保持等待）。
2. **浏览器语言**：`navigator.languages` 顺序逐个匹配——先完整 tag（如 `zh-Hant-TW` 对 `zh` 不完整匹配，回退主语言子标签 `zh`），再主语言子标签；命中第一个**已注册**语言即用（`src/client/index.ts:500-528`；测试 `tests/locale.client.spec.ts:321-339,341-349`）。非浏览器运行（node boot）不读 `navigator`，直接默认。
3. **缺省 `en`**：`FALLBACK_LOCALE = 'en'`（`src/client/index.ts:107`），既是无匹配时的开屏语言，也是字典查找的兜底。

持久化细节：

- **loopback 页面**经 settings 服务写入 `$DSH_HOME/settings.yaml`；**非 loopback 页面**客户端刻意不交出 settings scope，选择只保留在当前进程（README `### What the Host half does`，`README.md:62-66`）。对按 DSH Home（profile）隔离的部署，即「同一 DSH Home 的所有浏览器共享语言选择」。
- `setLocale(id)` 是**唯一写入口**：未注册 id 抛错；即便选的就是当前生效值也照写（该值可能只是 provisional，需变成显式选择以跨浏览器生效）；只有真实切换才发 `locale/change`（`src/client/index.ts:236-242`；测试 `:141-158,160-171`）。
- `<html lang>` 随快照同步：`zh` → `zh-CN`，其余用 id 原样（`src/client/index.ts:146-150`）。
- **语言包（外部语言）**：`addLanguage({ id, label, fallback })` 注册可选语言，fallback 必须已注册且链**必须以 `en` 终止**；字典可先于/后于定义注册；卸载活动语言回退到可用/浏览器默认，但不清除已存 id（`src/client/index.ts:256-278,314-334`；README `### Registering a language pack`，`README.md:38-60`）。
- 上游已知限制：**没有复数规则、没有 bidi 布局**；不在 slot 渲染路径上、注册时取词的文案（如命令注册表的描述）不会随切换更新（`README.md:121-131`）。

设置入口：locale 包**自己**把「语言」行注册进 Settings → General 的 `settings.general.item` 槽（`src/client/index.ts:549-581`；槽由 `ui-settings-general` 声明，`packages/client/ui-settings-general/src/client/index.ts:193`）。用户路径：Settings → General → Language，选项 label 用语言自身写法（`中文` / `English`）。

---

## 3. 运行时服务契约（`ctx.locale`）

`LocaleRuntime` 同时是 slot 系统的 `LocaleFace`（`packages/client/ui-slots/src/renderer.ts:22-32`），即：

| 成员                                            | 语义                                                                                                                                                                     | 证据                                                      |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| `getLocale()` / `getSnapshot()`                 | 返回不可变 `LocaleSnapshot { active, locales[], revision }`；引用在两次变更间稳定，uSES 安全；`revision` 在「切换」与「字典注册/卸载」时都自增                           | `src/client/index.ts:71-79,199-210`                       |
| `subscribe(fn)`                                 | 快照变更订阅；`locale/change` 事件**仅**在 active 切换时 emit，字典注册不发（避免 boot 风暴）                                                                            | `src/client/index.ts:81-96,219-222,466-493`               |
| `register(ns, { zh, en })`（typed）             | 一次注册一个命名空间的两个内置字典；键类型对照 `LocaleNamespaceMap` 的并集检查，**zh/en 必须齐全**；`(ns, locale)` 重复抛错（命名空间文案单一所有者）；返回幂等 disposer | `src/client/index.ts:358-418`（含 d.ts `:168-185`）       |
| `register(ns, locale, dict)`（untyped）         | 语言包/动态组合的单语言形式；locale 必须匹配 BCP 47 风格 pattern                                                                                                         | `src/client/index.ts:371-380`；`locale-settings.ts:34-35` |
| `addLanguage({ id, label, fallback })`          | 扩充可选择语言目录；链终止 `en`、环检测、重复 id 抛错；重估浏览器匹配与未决偏好                                                                                          | `src/client/index.ts:244-278`                             |
| `bind(ns)`                                      | 返回**按命名空间稳定**的 `t`（调用时读取当前 active locale）；适合 `apply` 内、store、RPC 层等无 props 的消费方                                                          | `src/client/index.ts:420-445`                             |
| `setLocale(id)`                                 | 切换 + 持久化（见 §2）                                                                                                                                                   | `src/client/index.ts:224-242`                             |
| `FALLBACK_LOCALE` / `COMMON_NS` / `SETTINGS_NS` | `'en'` / `'common'` / `'settings.locale'` 三个常量                                                                                                                       | `src/client/index.ts:107-113`                             |
| 需要注入的服务                                  | `inject = ['slots', 'remote', 'settingsScope']`（插件未激活前没有该服务；`ui-slots`/`ui-renderer` 提供服务面）                                                           | `src/client/index.ts:530-547`；Content merge 见 `:81-96`  |

服务由 locale 插件在 `apply` 中 `ctx.provide('locale', locale)` 并提供基础字典（`common` + `settings.locale`），随后 `ctx.slots.installLocale(locale)`（boot-once，`packages/client/ui-renderer/src/client/registry.ts:290-301`，live getter `:535-536,565`）。snapshot 结构（`src/client/index.ts:71-79`）：

```ts
interface LocaleSnapshot {
  active: LocaleId; // 当前生效 id
  locales: readonly LocaleDefinition[]; // 可选语言（含 label 与 fallback）
  revision: number; // 单调计数器
}
```

---

## 4. 字典形状与查找链

- **形状**：扁平 `Record<string, string>`，值是模板串，占位符为 `{name}`；无嵌套、无数组、无 ICU（`LocaleDict`，`src/client/index.ts:48-49`）。
- **键集合的单一事实源是 `zh`**：上游约定 `zh` 用 `satisfies Record<string, string>`，`type Key = keyof typeof zh`，`en` 用 `satisfies Record<Key, string>` 做**编译期完整性检查**（`src/locales/index.ts:1-9`、`src/locales/en.ts:12-50`；第一方范例 `packages/client/ui-sidebar/src/client/locales.ts:1-22`）。
- **查找链**（`translate` / `lookup`，`src/client/index.ts:447-464`）：

  1. 当前 active 语言的 **fallback 链**（`zh → en`；外部语言如 `ja → en`）在**本命名空间**逐语言查；
  2. 整条链在 **`common` 命名空间**重来一遍；
  3. 都没有 → **原样返回键**（fail loud，而不是空串）；
  4. 若调用带了 params，再对最终模板做 `{name}` 替换，`params` 里没有的占位符原样保留（`src/client/index.ts:452-454`；测试 `tests/locale.client.spec.ts:39-51,53-71,73-79`）。

- **`common` 命名空间确实存在**，由 locale 包随服务注册：`ok/cancel/close/copy.*/retry/loading/delete/save/search/back/truncated/number.thousand/number.million/...` 约 40 个通用词（`src/locales/en.ts:12-50`、`src/locales/zh.ts:52-90`）。每个命名空间的 `t` 键类型 = **自身键 ∪ `common` 键**（`packages/client/ui-slots/src/index.ts:56-79`）——所以 `t('cancel')` 在业务命名空间直接可用。
- **复数**：服务无 `Intl.PluralRules` 集成；第一方惯例是**手工成对键** `*.one` / `*.other`，由调用代码按 `n === 1` 选键（例：`packages/client/ui-conversation/src/client/locales.ts:118,280`；`packages/client/ui-schedule/src/client/ScheduleCatalogAction.tsx:34-49,141`）。
- **数字/日期格式化**：大多数走字典模板（如 `date.ymd` + 手工补零，`packages/client/ui-workspace/src/client/rows/Rows.tsx:55-73`，明确拒绝 `toLocaleString` 以免跟随浏览器语言而不是应用 locale）；需要原生格式化时直接用 `Intl` 并传入 active locale（`ui-schedule/src/client/ScheduleCatalogAction.tsx:62-66`）；也有偷赖写死 `Intl.NumberFormat('en-US')` 的反例（`ui-deliverables/src/client/ChangedFiles.tsx:14`）。
- 相对时间：`ui-primitives` 只产出结构化 bucket（`now/minutes/hours/...`），词条留在各插件字典里（`packages/client/ui-primitives/src/relative-time.ts:1-38`；用法 `Rows.tsx:55-60`）。

---

## 5. 字符串如何到达组件：`LocaleNamespaceMap` → `locale:` → `t` 席位

1. **声明命名空间（编译期合并）**：在插件入口 `declare module '@deepseek-ai/dsh-client-ui-slots' { interface LocaleNamespaceMap { botharness: BotharnessKey } }`。这就是 `PropsLocale`/`bind`/`register` 的类型来源（空接口声明于 `packages/client/ui-slots/src/index.ts:36-39`；第一方范例 `ui-sidebar/src/client/index.ts:26-31`、`ui-input-trigger/src/client/index.ts:41-46`）。
2. **注册字典**：`ctx.effect(() => ctx.locale.register(NS, { zh, en }), '...: dictionaries')`（第一方写法 `ui-sidebar/src/client/index.ts:46-48`、`ui-input-trigger/src/client/index.ts:59-61`）。
3. **槽注册声明 `locale: NS`**：`BaseOptions.locale` 的可选字段；`register(..., Component)` 时把组件 props 精确化为「五份 share + `PropsLocale<N>`」（`packages/client/ui-slots/src/index.ts:826-832,91-99,597-610`）。
4. **渲染机合成 `t`**：`standardKit` 看到 `entry.locale` 就从已安装的 `LocaleFace` 取 `t` 放进 props；没有 face 或未声明 `locale:` 的条目没有 `t`（`packages/client/ui-renderer/src/client/scoped-slots.tsx:555-563`；Factory 同 `:867-873`）。类型上：

```ts
// packages/client/ui-slots（类型）
export type PropsLocale<N> = N extends keyof LocaleNamespaceMap & string
  ? { t: TranslateNS<N> }
  : object;
```

5. **切换驱动重渲染**：`localeSeat` 按 `(face, ns, revision)` 缓存——语言切换会**生成新的函数引用**，`React.memo` 组件靠浅比较自然重渲染；同一 revision 内引用稳定，不抖动（`scoped-slots.tsx:294-315`）。所有 outlet 还订阅 revision（`useLocaleRevision`，`:345-369`）。
6. **列表标签**：label 支持 thunk，每次读取时求值，因此语言切换后无需重新注册（`SlotLabel`，`ui-slots/src/index.ts:745-758`）。`apply` 里 `const t = ctx.locale.bind(NS)`，`label: () => t('panel')`；并且 `ui-sidebar` 自身订阅 locale 快照，重新收集面板标签（`ui-plugin-manager/src/client/index.ts:59,98`；`ui-sidebar/src/client/index.ts:63-64`）。
7. **纪律**：组件永远拿不到 `ctx`，文案必须走 props 的 `t` 或已本地化的 prop；纯组件（无 Cordis 依赖）要求调用方传全 label，自己不兜底（`packages/client/AGENTS.md:111-115`；`docs/subsystems/slots.md:70,93`）。

---

## 6. 一等方范例（可直接抄的形状）

| 包 / 文件                                                | 抄什么                                                                                                                                                                                                            |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ui-sidebar/src/client/{index.ts,locales.ts}`            | 最小完整闭环：namespace 合并、`export const NS`、`inject` 含 `locale`、`ctx.effect(register)`、槽注册 `locale: NS`、面板标签随 locale 重收集                                                                      |
| `ui-input-trigger/src/client/{index.ts,locales.ts}`      | 子命名空间命名法 `'slash.menu'`；`MENU_NS` 常量；带 aria 文案（`drill.aria` 等）的字典（已安装 d.ts：`packages/client/node_modules/@deepseek-ai/dsh-client-ui-input-trigger/lib/types/client/locales.d.ts:1-32`） |
| `ui-plugin-manager/src/client/index.ts:35-99`            | `main` keyed + `sidebar.panellist` 同时注册、`locale: NS`、`label: () => t('panel')`——与 BotHarness M3 面板同构                                                                                                   |
| `ui-settings-general/src/client/index.ts:49-71,193`      | `settings` 命名空间与 `settings.general.item` 槽的声明方                                                                                                                                                          |
| `ui-schedule/src/client/ScheduleCatalogAction.tsx:34-66` | 手工复数键对 + `Intl.DateTimeFormat(locale)` 的写法（需要原生格式化时）                                                                                                                                           |
| 语言行本体 `locale/src/client/LanguageRow.tsx:147-183`   | 设置行的组件形状；`PropsLocale<'settings.locale'>` + store + inject 的 props 组合                                                                                                                                 |

命名空间命名惯例：功能名（`sidebar`、`pluginManager`、`slash.menu`）、共享词表 `common`、设置面 `settings.*`（`settings.locale` 归 locale 插件）。**一个命名空间一个 owner**（重复注册抛错）。

---

## 7. Host 侧与工程约束

- Host 半（`packages/client/locale/src/index.ts:16-23`）只在存在 `settings` 服务时注册 `locale` 命名空间；没有 settings provider 时客户端选择退化为进程内（构造器 `host?` 可选，`src/client/index.ts:176-193`）。
- 客户端**类型导入**是第三方插件拿到 `ctx.locale` Context merge 的正规姿势：`import type {} from '@deepseek-ai/dsh-client-locale/client'`（`ui-sidebar/src/client/index.ts:6-7`）。上游 bundle 纯净门禁拒绝跨插件**值**导入，但类型导入被明确允许（`packages/client/AGENTS.md`「Shared modules」，另见 `docs/cookbook/adding-a-settings-card.md:54-66`）。BotHarness 自己复刻 bundle 格式，同样按「类型可导入、运行期走服务」执行。
- 上游 CI 有两道与文案相关的门，BotHarness 不在 DSH 仓库里跑它们，但应对齐精神：
  - `pnpm run verify-client-ui-i18n`：拒绝 Client 源码里硬编码产品文案（JSX 文本、`aria-label`/`title`/`placeholder` 等属性、常见数据/helper 形式），只放行 `locales.ts`/`locales/` 目录与键名（`scripts/verify-client-ui-i18n.ts:1-14,33-35`；`package.json:138`；gate 接入 `scripts/run-gates.ts:311`）。
  - `locale-dictionary-parity.spec.ts`：全仓扫描 zh/en 字典，要求**键集对称**，否则漏键的一侧会把裸键渲染给用户（`scripts/locale-dictionary-parity.spec.ts:1-19`）。
- DSH 仓库里的 `*.i18n.yaml` 是**文档双语配对记录**（源码/译文 git blob hash，供 `verify-translation-pairing`），与运行时 locale 无关（例：`packages/client/locale/README.i18n.yaml:1-7`）。不要把它误解成字典。

---

## 8. Paraglide 评估

Paraglide JS 2.x（`@inlang/paraglide-js`，MIT，2026 年主线为 v2；React 富文本适配器 `@inlang/paraglide-js-react` v1）是**编译期 i18n**：inlang project 声明语言，编译器把消息编译成 ESM 函数（`m.greeting({name})`），bundler 树摇未用消息，键与参数都有类型；策略（url/cookie/localStorage/preferredLanguage）负责语言解析，`setLocale()` 默认**整页导航/刷新**；`Intl.PluralRules`（variants）、number/datetime/relativetime formatter、ICU 插件齐全（来源：https://paraglidejs.com/ 、/comparison、/changelog、GitHub `docs/basics.md`、`docs/compiling-messages.md`，访问 2026-09-18）。

| 维度        | DSH locale 服务                                                                  | Paraglide JS 2.x                                                                             |
| ----------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 架构        | 运行期注册表 + `t` 席位（slot 派生）                                             | 构建期编译 message 函数（`m.*` ESM），bundler tree-shaking                                   |
| 类型        | 命名空间键并集 + zh/en 完整性编译期检查；参数是 `Record<string, unknown>` 无类型 | 键与**参数**均生成类型；`LocalizedString` 品牌类型                                           |
| 切换语义    | `setLocale()` 即时生效、SPA 无刷新，revision 驱动重渲染，`<html lang>` 同步      | `setLocale()` 默认整页刷新；`{reload:false}` 是「自行驱动重渲染与文档状态」的逃生舱          |
| 语言来源    | Host 设置（loopback 持久化）+ 浏览器检测 + 运行期语言包                          | 构建期消息文件 + 策略（可自定义 `defineCustomClientStrategy`）                               |
| 复数/格式化 | 无复数规则、无 bidi；`{name}` 模板；手工 `*.one/*.other`；`Intl` 自行接入        | `Intl.PluralRules`/variants、number/datetime/relativetime formatter、ICU 插件                |
| 打包        | 随 `dsh-web-app` 组成，`immediately` 基础设施；`t` 由渲染机合成                  | Vite/Rollup 优先（编译插件）；按 message 分模块的 ESM；对 CJS closure-factory 产物需自行集成 |
| 与 DSH 关系 | 已有设置行、持久化、语言包、字典所有权与 CI 模型                                 | 需另建语言选择 UI、持久化、策略；`m.*` 绕过 `t` 席位与 `verify-client-ui-i18n` 的所有权模型  |

**结论（不采纳/Reject）**：

1. **重复造轮子**：语言选择、持久化、浏览器回退、语言包、`<html lang>`、切换重渲染，`dsh-client-locale` 已全带且随标准 Web 组成默认装载；Paraglide 省下的只是「字典查找函数」，而这正是 DSH 想统一掌控的部分。
2. **切换模型冲突**：Paraglide 默认 `setLocale()` 刷新页面；DSH 的卖点是即时切换、保留会话内状态（revision 驱动重渲染），且它已经管理了 `<html lang>`。用 `{reload:false}` + 自定义策略把两者桥起来，需要同步 DSH snapshot、自己驱动所有重渲染——等于重新实现一遍 `LocaleFace`，还要维护 Paraglide 编译器配置。
3. **构建链不匹配**：Paraglide 的定位是 Vite/现代 ESM 应用；DSH 客户端产物是 `window.__ModuleLoader__` 的 CJS closure-factory、含 bundle 纯净门禁，第三方要自行复刻该格式。为 BotHarness 十来个界面的文案引入一套编译器/配置文件，维护面大于收益（几条消息的 tree-shaking 收益可忽略）。
4. **真正想要的能力可零成本替代**：参数类型化由 DSH 的 `TranslateNS` 已提供大半；复数用 `*.one/*.other` 键对（上游惯例）；数字/日期用原生 `Intl.*` 并传 active locale（§4）。这些都不需要新依赖。
5. **可组合点（若未来真需要 ICU 级复数/性别变体）**：只把 Paraglide 当**构建期消息目录生成器**，或干脆在字典值上调 `Intl.PluralRules`；但当前 zh/en 产品不需要，保持与 DSH 一致更值钱。

---

## 9. 对 BotHarness 的方案建议

### 9.1 命名空间与字典文件

| 项          | 决定                                                                                                                                                                                |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 命名空间    | **`botharness`**（一个插件一个命名空间）。未来若加设置卡片再单独开 `settings.botharness`（对齐 `settings.locale`、`settings.<plugin>` 惯例）。                                      |
| 文件        | `packages/client/src/client/locales.ts`（键不多，单文件足够；超过 ~100 键再拆 `src/client/locales/{index,zh,en}.ts`）。                                                             |
| 形状        | `zh` 为键集合事实源（`satisfies Record<string, string>`），`export type BotharnessKey = keyof typeof zh`，`en` 用 `satisfies Record<BotharnessKey, string>` 让缺键变成编译错误。    |
| 键分组      | 前缀分组：`panel.*`（侧栏/名册）、`panel.aria`、`dashboard.*`、`bot.*`、`state.*`（五态 + blocked）、`mode.*`（切回 DSH / 打开 PersonaBots）、`inbox.*`、`workspace.*`、`chart.*`。 |
| 复用 common | 能用 `common` 的键（`cancel`/`retry`/`loading`/`truncated`/`number.thousand`…）就不要自己重定义。                                                                                   |

### 9.2 接入步骤（有顺序依赖）

1. `packages/client/package.json`：devDependencies 加 `"@deepseek-ai/dsh-client-locale": "0.1.5-rc.2"`（与其它 DSH 包同钉法）；`dsh.client.inject` 数组加 `"@deepseek-ai/dsh-client-locale"`（信息性边）。
2. `src/client/locales.ts`：按 9.1 建字典。
3. `src/client/index.ts` 顶部：`import type {} from '@deepseek-ai/dsh-client-locale/client'`（拉 `ctx.locale` Context merge）+ 声明合并：

   ```ts
   import { en, zh, type BotharnessKey } from './locales.js';

   declare module '@deepseek-ai/dsh-client-ui-slots' {
     interface LocaleNamespaceMap {
       botharness: BotharnessKey;
     }
   }
   export const NS = 'botharness';
   export const inject = ['slots', 'connection', 'inputTriggers', 'layout', 'locale'];
   ```

4. `apply()` 内：`ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'botharness: dictionaries')`；`const t = ctx.locale.bind(NS)` 供 `label` 等注册期文案。
5. 每个需要文案的槽注册加 `locale: NS`（`sidebar.panellist`、`sidebar.footer.action`、`main` keyed、`sidebar.workspaces` 影子、`main/conversation` 影子）。
6. 组件 props 加 `PropsLocale<typeof NS>`（或 `PropsLocale<'botharness'>`），把硬编码文案换成 `t('...')`；`labels.ts` 的 `STATE_LABELS` 改为**键映射**（`STATE_KEYS[state]`），`stateLabel(t, state)` 或直接 `t('state.' + state)`。
7. 更新测试：`packages/client/test/bot-chart.test.ts:15-17` 现在断言中文（`进行中`/`阻塞`）；改造后应断言传 `t` 后的输出或改为不依赖具体语言。

### 9.3 组件 ↔ `t` 的映射

| 注册点                                 | 组件                                    | 拿 `t` 的方式                                                                                                                                                   |
| -------------------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sidebar.panellist`（id=`botharness`） | `BotPanelIcon`                          | 图标无文案；`label` 用 `apply` 里 `bind` 的 `t('panel')`（`ui-sidebar` 订阅 locale 后重读标签）                                                                 |
| `sidebar.footer.action`                | `BotModeToggle`                         | 注册 `locale: NS`，props 加 `PropsLocale`；`title`/可见文本走 `t('mode.*')`                                                                                     |
| `main`（key=`botharness`）             | `BotPanel`（→`BotMain`）                | 注册 `locale: NS`；`BotMain` props 加 `t` 并向下传（`Dashboard`/`BotView`/`Kpi` 是纯组件，label 全部作为 props 传入）                                           |
| `main`（key=`conversation`，影子）     | `BotMain`                               | 同上（`locale: NS`）                                                                                                                                            |
| `sidebar.workspaces`（影子）           | `BotSidebar`                            | 注册 `locale: NS`；`placeholder`/`title`/`aria`/空态文案全部走 `t`                                                                                              |
| 非槽组件                               | `StateDistributionChart`（`bot-chart`） | 作为纯组件接收**已本地化的 `ariaLabel`/`ariaDescription`/图例 label props**（对齐「primitive 不拥有 fallback 文案」规则），或由 `Dashboard` 传 `t` 调好的字符串 |

注意组件现在多为无 props 或 `{wide}` 的形状（`bot-sidebar.tsx:28,152-176`、`bot-main.tsx:161-177`），需要补类型；`BotSidebar` 用的 `SidebarPanelIconOwnerProps` 等 owner props 与 `PropsRuntime` 组合时放一起即可。

### 9.4 语言选择与切换

- **零代码**：Settings → General → Language（locale 包自带）即可在 `中文`/`English` 间即时切换；`<html lang>`、面板标签、组件文案、aria 全部跟随，刷新后（loopback）保持。
- 未显式选择时按浏览器 `navigator.languages` 自动匹配；无法匹配用 `en`。
- 非 loopback（局域网/远程访问）语言选择仅进程内——若 M3.5/M4 的演示方式是 `localhost` 无影响；若计划远程/局域网演示，需在验收标准里写明此限制或后续申请上游放宽。
- 第三方语言包（如将来有 `ja`）会经 `addLanguage` 进入选择器并按键回退 `en`；BotHarness 不用改。

### 9.5 zh/en 覆盖与 CI

| 门            | 做法                                                                                                                                                                              |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 编译期        | `en` 的 `satisfies Record<BotharnessKey, string>`：漏键/多键在 `pnpm typecheck` 直接失败（与上游同款）                                                                            |
| 运行时/键对齐 | 新增 `packages/client/test/locales.test.ts`：`Object.keys(zh).sort()` 与 `en` 完全相等（对齐上游 `scripts/locale-dictionary-parity.spec.ts` 的不变量）                            |
| 硬编码防线    | 可选：轻量扫描测试，禁 `bot-*.tsx`/`index.ts` 直写 CJK/产品文案，白名单 `locales.ts`（对齐上游 `verify-client-ui-i18n` 的精神，不移植其脚本——它依赖 DSH 仓库布局与 450 文件阈值） |
| 组件测试      | 传 `t` stub 或经真实 `LocaleRuntime` 的测试夹具断言渲染文本；移除对中文硬编码的断言（`bot-chart.test.ts`）                                                                        |
| 认证（M3.5）  | 在 `web-dev` profile 里跑 `dsh web`，验收：切 English 后名册/侧栏/图例/aria 即时切换；刷新保持；浏览器语言为 `zh-CN` 时首开为中文                                                 |

### 9.6 文档影响

- `docs/client-bridge.md` 增一节「UI 语言」：命名空间 `botharness`、`t` 席位、语言切换路径、非 loopback 限制。
- PRD 的 M3 名册验收项补一条「中英双语，文案不硬编码」。
- 仓库 `AGENTS.md` 客户端约定可加一句「产品文案必须进 `src/client/locales.ts` 并经 `t` 席位」。
- 区分两套「翻译」：docs 站（英文主根 + `/zh/**` 机翻）是**文档 i18n**；本次是**产品 UI locale**，互不影响。

### 9.7 版本与验收节奏

钉 `0.1.5-rc.2`（本项目全部 DSH 包的线），locale 包在该线已发布且与 `0.1.6-alpha.2` 源码契约一致（§11）；`dsh-web-app` 已把它列入 composition，正常 profile 一定能 `inject: ['locale']`。运行时验收放到 M3.5 安装门（本地 bundle 装进 `web-dev` profile）。

---

## 10. 存疑与待验证

1. **运行时未跑通**：本机尚无 DSH profile 安装，未实际启动 `dsh web` 验证切换；结论基于源码 + 0.1.5-rc.2 类型/README/npm 元数据。
2. **0.1.5-rc.2 与 0.1.6-alpha.2 的 locale 包是否逐行一致**：`lib/types/**`、README 行为描述已比对一致；`lib/client.js` 未逐行 diff（实现差异风险低）。
3. **上游 `verify-client-ui-i18n` 能否直接移植**：未验证，且它假设 DSH 仓库文件布局；建议自建轻量等价物（§9.5）。
4. **非 loopback 持久化限制**对 BotHarness 的部署形态有何影响（远程/局域网使用）未做产品决策。
5. **第三方语言包的装载路径**：语言包本身也是 client 插件，需作为 Loader entry 启用；BotHarness 没有消费方，暂不验证。
6. **Host/CLI/桌面端的文案本地化**：全仓未发现对应机制（桌面静态页写死 `lang="en"`）；是否在 DSH 路线图内未知。
7. **`common` 键的具体数量与稳定性**：以 pinned SHA 为准（约 40 键）；跨版本升级时需关注是否新增/更名。

---

## 11. 附录：复现命令

```bash
# 上游源码（若 /tmp/dsh-src 不在，可按 SHA 重新 sparse clone）
cd /tmp/dsh-src
git log -1 --format='%H %cI'          # => ddefc45... 2026-09-17T21:19:19+08:00
find packages/client/locale -type f | sort
sed -n '1,142p' packages/client/locale/README.md
grep -n 'installLocale' packages/client/ui-renderer/src/client/registry.ts

# 0.1.5-rc.2 npm 包核对
mkdir -p /tmp/dsh-locale-probe && cd /tmp/dsh-locale-probe
npm pack @deepseek-ai/dsh-client-locale@0.1.5-rc.2
tar xzf deepseek-ai-dsh-client-locale-0.1.5-rc.2.tgz
diff -u package/lib/types/client/index.d.ts \
  <(sed -n '1,250p' /tmp/dsh-src/packages/client/locale/src/client/index.ts)  # 结构对照（非逐行 diff）

# 已安装线核对（m3 worktree）
node -e "console.log(require('/home/doodlebear/project/DeepSeekBot-m3/packages/client/node_modules/@deepseek-ai/dsh-client-ui-slots/package.json').version)"
grep -o 'installLocale\|localeSeat' \
  /home/doodlebear/project/DeepSeekBot-m3/packages/client/node_modules/@deepseek-ai/dsh-client-ui-renderer/lib/client.js | sort | uniq -c
grep -o 'locale\.subscribe' \
  /home/doodlebear/project/DeepSeekBot-m3/packages/client/node_modules/@deepseek-ai/dsh-client-ui-sidebar/lib/client.js | sort | uniq -c

# registry 元数据
pnpm view @deepseek-ai/dsh-client-locale dist-tags --json
pnpm view @deepseek-ai/dsh-web-app@0.1.5-rc.2 dependencies --json | grep locale
```

本调研未运行 `pnpm install/build/test`，未安装或启动任何 DSH profile；除本文件外未改动工作区。
