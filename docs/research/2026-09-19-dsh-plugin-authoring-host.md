# DSH 插件开发官方规范调研 — host 侧（后端半场）

## 0. 元信息

| 项         | 内容                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 问题       | DSH（DeepSeek Harness）插件开发的 **host 侧官方一手规范**是什么：官方教程/参考文档的全图、插件包 `package.json` 契约、`cordis.patch.yml` 语法与语义、host 插件 API（插件形态、services、tools、events、settings、credentials、system prompt、session seam）、生命周期，以及发布/校验/坑位——供随后编写「DSH 插件全栈开发」Skill 使用                                                                                                                                                                                        |
| 上游       | https://github.com/deepseek-ai/deepseek-harness（public）；文档站 https://deepseek-harness.github.io/deepseek-harness/（`llms.txt` 索引，页面 URL 去斜杠 + `.md` 即原文）                                                                                                                                                                                                                                                                                                                                                  |
| Pinned SHA | `ddefc45fbc7f8e46dd73185e68295696d1297887`（2026-09-17 21:19:19 +0800，release **dsh-0.1.6-alpha.2**）。本文所有 `packages/...`、`docs/...`、`apps/...`、`website/...`、`vendor/...` 路径均相对该 SHA 的仓库根（WSL 克隆于 `/tmp/dsh-src-host`）                                                                                                                                                                                                                                                                           |
| 版本快照   | 根 `package.json` / `apps/cli/package.json` version 均为 `0.1.6-alpha.2`；`engines.node = ^22.19.0 \|\| >=24.0.0`；仓库 `packageManager: pnpm@11.7.0`。npm `@deepseek-ai/dsh` dist-tags（既有调研快照）：`latest = next = 0.1.5-rc.2`、`alpha = 0.1.6-alpha.2`                                                                                                                                                                                                                                                             |
| 调研方法   | 一手来源优先：WSL 浅克隆上游后逐文件读源码与官方中文文档（`.zh.md` 与 `.md` 双语对，行号以 `.zh.md` 为准并标注）；`website/docs.ts` 为文档站发布清单。**未安装/运行任何 DSH 组件、未改上游**；无法由一手来源确认的标「未验证」；由既有调研覆盖的安装机制不重复，只在引用处标明出处。访问日期 **2026-09-19**                                                                                                                                                                                                                |
| 分工/边界  | ① 安装机制（`dsh plugin` 是 pnpm 转发器、profile 磁盘布局、层栈、客户端 UI 装箱与加载）见 `docs/research/2026-09-18-dsh-plugin-installation.md`，本文不重复；② M2 `packages/core` 的对齐审计见 `docs/research/2026-09-18-dsh-authoring-conformance.md`，本文只引用其结论并在 §8 更新现状；③ 客户端扩展点/文档站 IA 见 `docs/research/2026-09-18-dsh-client-ui-and-docs-ia.md`；④ 社区样本见 `docs/research/2026-09-19-dsh-community-plugins-survey.md`。本文**只覆盖 host（后端）半场**，client 半场仅在与包契约相关处带过 |

一句话结论：**DSH 的 host 插件就是「导出 `apply(ctx, config)` 的模块」，一切能力经 `ctx` 注册且随 fiber 自动回收；插件的分发单元是「bundle = npm 包 + 一个 `cordis.patch.yml` 配置层」，由 Loader 按包名导入行引用的模块。** 官方为此提供了三层文档（`basic` 教程 → `framework` 语汇 → `cookbook` 参考 + 自动生成的子系统/Cordis API 目录）和两种等价实现路径：patch 行声明（composition，推荐）与代码内 `ctx.plugin()`（动态挂载）；工具用 `@deepseek-ai/dsh-tools` 的 `defineTool` + 自有 schema DSL 注册，策略挂 `tools/pre-execute`/`ctx.tools.guard()`，审批走 `ctx.approval`，沙箱走 `ctx.sandbox`；版本兼容只有声明性的 `engines.dsh`/`dsh.manifestVersion`（加载器不强制），发布前的官方校验手段只有 `--dump-config` 级别的静态组合检查（没有官方 doctor/market 校验器）。

---

## 1. 官方插件开发文档地图与教学结构

### 1.1 开发向文档清单（docs 站 `/develop` + `/reference` 的源码位置）

| 路径（pinned SHA）                                | 标题 / 主题                               | 教学结构与要点                                                                                                                                                                  |
| ------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/user/develop/basic/index.zh.md`             | 第一个 Harness 插件                       | 「插件是什么」→ 建文件 → `--patch` 注册 → 自动清理 → `inject` → 三种形态（函数/对象/类）；最小形态即 `export function apply(ctx)`（`:15-27`）                                   |
| `docs/user/develop/basic/tool.zh.md`              | 开发一个工具                              | `defineTool` 最小示例、`inject: ['tools']`、`execute`/`output.render` 职责（`:11-36`）                                                                                          |
| `docs/user/develop/basic/config.zh.md`            | 插件配置                                  | 导出 `Config`（Schemastery/Standard Schema）+ `apply(ctx, config)`；schema 默认值与加载时校验；「无硬编码可调参数」「配置错误要响亮」；HMR 热替换（`:7-100`）                   |
| `docs/user/develop/basic/publish.zh.md`           | 打包与安装插件                            | 外部作者的官方权威页：bundle/profile 两种 manifest、`dsh plugin add`、加载顺序、应用自有命令行、GitHub 安装的 `prepare`/`allowBuilds` 门槛、npm/tarball 分发（`:9-178`）        |
| `docs/user/develop/framework/index.zh.md`         | 插件与生命周期                            | Fiber 状态机、依赖驱动加载、自动清理/`ctx.effect`、嵌套上下文、`dispose` 语义、HMR（`:9-107`）                                                                                  |
| `docs/user/develop/framework/service.zh.md`       | 服务与依赖                                | `inject` 消费、`Service` 基类 + `declare module` 类型合并、必需/可选依赖、服务隔离（`isolate`）（`:9-141`）                                                                     |
| `docs/user/develop/framework/events.zh.md`        | 事件系统                                  | `emit`/`bail`/`serial`/`waterfall` 四种模式、声明合并类型化、`namespace/action` 命名、`session/event` 与 `agent/*` 的分工（`:10-138`）                                          |
| `docs/user/develop/practice/index.zh.md`          | 能力的三种角色设计                        | Service Definition / Provider / Consumer 三角色、Bash 三包样例、「不要预防性拆分」（`:9-151`）                                                                                  |
| `docs/user/develop/practice/llm-adapter.zh.md`    | LLM 适配器                                | `ctx.llm.registerAdapter` 完整实现路径（未细读，路径存在）                                                                                                                      |
| `docs/user/develop/practice/dynamic-cordis.zh.md` | 通过提示词配置持久化插件                  | 创造模式 + Plugin Manager 的「写组合包 → 安装 → 生效」闭环（`:5-15`）                                                                                                           |
| `docs/cordis-tutorial/01..07.*.zh.md`             | Cordis 框架教程（7 课）                   | 01 第一个插件 / 02 生命周期与 effect / 03 服务 / 04 事件 / 05 配置 / 06 组合与 HMR / 07 进入 Harness（`website/docs.ts:261-278`）                                               |
| `docs/cordis-primer.zh.md`                        | Cordis 入门                               | 五个核心概念、五种分发模式表、waterfall 语义、Loader `!!js` 配置（`:9-45`）                                                                                                     |
| `docs/cookbook/adding-a-tool.zh.md`               | 工具编写参考（工具定义真源）              | 最小形态、`execute` 约定、后台任务、执行策略与观测、PTC mode、UI 卡片、Web Client 展示（`:9-99`）                                                                               |
| `docs/cookbook/adding-a-package.zh.md`            | 添加 workspace 包（**仓库内**逐文件清单） | package.json 不变式、tsconfig/references 注册、角色命名表、README 契约；对外部包仅作参考（`:9-119`）                                                                            |
| `docs/cookbook/adding-a-settings-card.zh.md`      | 新增设置卡片                              | Host 半 `ctx.settings.installSection()` + 软注入；browser 半 `settings.plugin.item`；打包要求（`:5-102`）                                                                       |
| `docs/cookbook/adding-an-llm-adapter.zh.md`       | 新增 LLM Adapter                          | `ctx.llm.registerAdapter`（未细读）                                                                                                                                             |
| `docs/cookbook/adding-a-remote-api.zh.md`         | 新增 Remote API                           | Typert Remote（未细读）                                                                                                                                                         |
| `docs/cookbook/extension-cookbook.zh.md`          | 扩展插件形态总览                          | 钩子插件（权限门禁）示例、UI 插件、协议驱动、**功能→机制映射表**（记忆=section+工具、cron、审批、subagent 等）（`:7-136`）                                                      |
| `docs/subsystems/core.zh.md` 等生成页             | 每个服务的 Cordis 接口面                  | 由 `scripts/gen-cordis-catalog.ts` 从源码生成的 `cordis-surface` 区块，**插件作者应以此和 `.d.ts` 为准，不维护静态清单**（`docs/user/develop/framework/service.zh.md:143-145`） |
| `docs/capability-seams.zh.md`                     | 能力 Seams 与核心服务                     | 服务（`ctx.llm`/`ctx.settings`/`ctx.credentials`/`ctx.tools`/`ctx.approval`/`ctx.agents` 等）的 Definition/Provider/Consumer 归属表（`:552-619`）                               |
| `apps/cli/reference/README.zh.md`                 | CLI 行为参考                              | profile 启动、patch 层序、`--dump-config`、`dsh plugin` 转发、诊断日志（`:11-116`，安装机制见并行调研）                                                                         |

### 1.2 文档站上的组织（`website/docs.ts`）

- 开发侧四个 sidebar 分组：`基础`（basic 四页）→ `框架能力`（framework 三页）→ `实战`（practice）→ `Cordis 框架教程`（`website/docs.ts:175-278`）；参考侧有 `概念`（architecture/capability-seams/agent-lifecycle/tool-execution-pipeline）、`生成参考`（config-catalog/tool-catalog/persistence-catalog）、`Cordis API`（context/events/fiber/registry/service）、`开发手册`（cookbook 五页）（`:375-452`）。
- 子系统参考按主题分组（内核、会话、模型、执行、策略、平台）（`:296-358`）；**中文根树 / 英文 `/en` 对偶，无版本化**（`website/docs.ts:91-105`；IA 细节见客户端/IA 调研）。

### 1.3 教学结构三条主线（写 Skill 时可按此组织）

1. **能力注册线**（做什么）：插件 = `apply` + `ctx.*` 注册（工具/提示词/命令/事件/服务），一切注册自动回收。
2. **组合配置线**（何时装/怎么配）：bundle `cordis.patch.yml` 插入行 + 行内 `config` → Cordis 校验 schema → `apply(ctx, config)`。
3. **策略与观测线**（怎么拦截）：事件 waterfall（`tools/*`、`agent/*`、`system-prompt/*`、`session/*`、`approval/*`）做拦截与观测，服务方法做直接调用（`docs/cordis-primer.zh.md:47-51`）。

---

## 2. 包解剖：bundle 插件的 `package.json` 契约

### 2.1 `dsh` 字段（`DshManifest`）

官方公共字段只有四个，定义在 `packages/util/package-manifest/src/types.ts:27-77`；`README.zh.md:46` 明说类型只描述字段，**不提供校验/默认值**：

| 字段                     | 类型/取值                                               | 含义与读取方                                                                                                      |
| ------------------------ | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `dsh.manifestVersion`    | `1`（可选，字面量）                                     | manifest 格式标识，独立于 npm 版本与 Session 格式版本（`types.ts:29-30`）；当前**不强制**（`README.zh.md:90-91`） |
| `dsh.bundle.patch`       | 相对包根的路径                                          | bundle 配置层文件；profile 启动器读取（`types.ts:51-55`；`packages/boot/app-boot/src/profile.ts:890-895`）        |
| `dsh.profile.bundles`    | 有序包名数组                                            | **profile 目录**（非发布包）的组合声明；本地 profile 可 `Partial`（`types.ts:57-61`）                             |
| `dsh.client.platform` 等 | `platform`（必填）、`inject`、`immediately`、`external` | client 模块扫描与构建元数据（`types.ts:63-77`）；宿主扫描存活 Loader entries（客户端细节见并行调研 §4）           |

内部专用键（`configTrees`、`sessionFormatMigration`、生成的 `moduleFallback`）**不在公共类型中**，外部作者不得依赖（`types.ts:55`；`.agents/notes/implemented/architecture/2026-09-10-public-package-manifest.zh.md:14-17`）。

### 2.2 `engines` / 兼容声明

- 官方字段是**顶层 `engines.dsh`**（SemVer range，可写精确预发布版），与 `engines.node`/`engines.npm` 并列（`types.ts:39-49`；`package-manifest/README.zh.md:52-54`）。官方给出的示例：`engines: { node: '>=24', dsh: '0.1.5-alpha.1' }`（`README.zh.md:34-43`）。
- **当前安装器与加载器不强制检查** `dsh.manifestVersion` 或 `engines.dsh`——声明不会拒绝不兼容宿主，也不校验 SemVer 语法（`package-manifest/README.zh.md:90-91`；Agent Note 同口径 `2026-09-10-public-package-manifest.zh.md:15`）。这是「作者意图 + 生态工具（如 testkit/compat-guard）自行消费」的字段。
- 官方自己发布的两个 bundle（`@deepseek-ai/dsh-base`、`@deepseek-ai/dsh-sdk-minimal`）**都没有写 `manifestVersion`，也没有 `engines.dsh`**，只有 `dsh.bundle.patch`（`packages/bundle/base/package.json:31-35`；`packages/bundle/sdk-minimal/package.json:31-35`）。

### 2.3 `exports` / `files` / `main` / `type` 与构建产物

两种官方写法：

| 维度      | 仓库内发布包（强约束）                                                                               | 外部教程包（`publish.zh.md:26-43`）     |
| --------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `type`    | `"module"`                                                                                           | `"module"`                              |
| `main`    | `lib/index.js`                                                                                       | `index.js`（或构建产物）                |
| `types`   | `lib/types/index.d.ts`                                                                               | 未要求                                  |
| `exports` | `"."` = `{ types, default }`；另暴露 `./src/*`、`./package.json`；bundle 还暴露 `./cordis.patch.yml` | 未要求（示例不写）                      |
| `files`   | `lib/index.js`、`lib/types/**/*.d.ts`、门禁认可产物；**bundle 必须含 patch 文件**                    | `["index.js", "cordis.patch.yml"]`      |
| 构建产物  | `tsc -b` + tsdown（`tsconfig.host.json` / `packages`）；仓库外自行构建                               | 直接分发已构建 JS；git 安装靠 `prepare` |
| 示例      | `packages/bundle/base/package.json:13-29`；`packages/context/time-context/package.json:13-32`        | `publish.zh.md:35-44`                   |

要点：**宿主只加载构建产物**（`main`/`exports` 指向的运行入口）；patch 文件通过磁盘路径读取（`join(packageDir, declared)`，`packages/boot/app-boot/src/profile.ts:894`），因此 `files` 必须包含它。仓库内 `adding-a-package.zh.md:25-27` 的 `private:true`、版本与根同步、`exports.types` 等属于**仓库不变式**，不是外部作者义务；外部包从 npm 发布时保留 `publishConfig.access`（内建包写法 `packages/bundle/base/package.json:5-7`）。

### 2.4 依赖归属

- 官方内建包的不变式（`docs/cookbook/adding-a-package.zh.md:25`，仓库门禁 `pnpm run constraints` 强制）：`@deepseek-ai/cordis` 同时进 `peerDependencies` 与 `devDependencies`（同范围）；每个 dsh 对等依赖都要在 devDependencies 镜像；`@deepseek-ai/schemastery` 放 `dependencies`（运行时校验器）。
- 官方样本：`packages/context/time-context/package.json:39-64`（6 个 peer + dev 镜像）；`packages/bundle/base/package.json:36-131`（bundle 把整套行依赖进 `dependencies`）。
- **`@deepseek-ai/*` 的运行时值导入无法跨插件保证**：插件之间只允许 `import type` + `declare module` 合并（服务 seam），运行时通过 `ctx.<key>` 获取。仓库内这条由 client bundle 纯净度门禁和类型约定保障；外部包同样应遵守。
- 纯类型包（如 `dsh-package-manifest`）只 import type 时可用 devDependency；发布了引用这些类型的 `.d.ts` 时才转 dependencies（`package-manifest/README.zh.md:28`）。

### 2.5 谁在读取（loader / resolver / 校验代码位置）

- **Loader**：`vendor/loader/src/index.ts`（`Loader` 类、`unwrapExports` `:188-196`）、`vendor/loader/src/config/entry.ts`（Entry 生命周期与 `EntryOptions` `:9-22`）。
- **配置层合成**：`vendor/include/src/index.ts:57-127`（`applyEntryPatches`——启动与 `--dump-config` 共用的唯一 patch 算法）；`packages/boot/app-boot/src/index.ts:279-362`（patch 文件加载/解析/路径锚定）、`:944-951`（`composeEntries`）。
- **profile/bundle 解析**：`packages/boot/app-boot/src/profile.ts:879-902`（`loadProfileDirectory`：按 `dsh.profile.bundles` 解析每个 bundle 的 patch，缺 `dsh.bundle` 直接 fail loud）、`:918-934`（`loadProfile`）；运行时模块解析 generation 在 `packages/boot/app-boot/src/profile-resolution/`（resolver/service）。
- **没有集中式 manifest 校验器**：每个读取方只取自己需要的字段并各自处理错误/默认值（`package-manifest/README.zh.md:90`；Agent Note `2026-09-10-public-package-manifest.zh.md:19`）。`plugin-manager` 在安装时拒绝 `not-a-bundle`（`packages/boot/plugin-manager/src/index.ts:263,291`）。

### 2.6 最小合法 bundle 包（官方 `publish.zh.md:26-64` 原样）

```text
hello-plugin/
├── package.json       # declares dsh.bundle
├── cordis.patch.yml   # the layer applied when a profile lists this bundle
└── index.js           # plugin modules the patch rows reference
```

```json
{
  "name": "dsh-hello-plugin",
  "version": "0.1.0",
  "type": "module",
  "main": "index.js",
  "files": ["index.js", "cordis.patch.yml"],
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
}
```

```yaml
- insert:
    - id: hello
      name: dsh-hello-plugin
```

---

## 3. `cordis.patch.yml`：格式、语义与层叠

### 3.1 文件形态与解析

- 文件是**顶层 YAML 数组**，每项是一个「loader patch entry」（`PatchOptions`）。解析用 Include 的 entry-list 方言：`yaml.JSON_SCHEMA` + `!!js` 自定义 tag（`vendor/include/src/index.ts:9-25`）；非法/非数组/非 mapping 在启动时抛错（`packages/boot/app-boot/src/index.ts:344-362`）。
- **空文件或只有注释会启动失败**；要禁用该层必须写 `[]`（`packages/boot/app-boot/README.zh.md:55`；安装调研 §1.4 已记录）。
- 插入行里的**绝对路径 / `./`、`../` 相对路径**会被转成 file URL，相对路径以 patch 文件所在目录为基准；按包名的引用保持字面值（`packages/boot/app-boot/src/index.ts:319-330`；`publish.zh.md:56-62` 强调用包名才能让 Node 解析到已安装代码）。

### 3.2 三种 patch 形状（`applyEntryPatches`，`vendor/include/src/index.ts:76-124`）

| 形状                 | 语法                                                                      | 语义                                                                             |
| -------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **插入（顶层）**     | `- insert: [ {id, name, ...}, ... ]`                                      | 把行追加到 entry 列表末尾；同层后续 patch 可再命中它（`:92-100`）                |
| **插入（进 group）** | `- id: <group 行 id>` + `insert: [...]`                                   | 目标必须是 `group: true` 的行，否则 warn 跳过（`:79-91`）                        |
| **按 id 覆盖/禁用**  | `- id: <行 id>` + `config: {...}` / `disabled: true` / `inject: [...]` 等 | 按 `id` 定位已有行（含 group 子行，索引递归构建 `:65-74`）；命中不到则 warn 跳过 |

补充语义：

- 可选的 `name` 字段是**断言**：与目标 `name` 不一致时 warn 并跳过（`:115-118`）。
- 非 insert patch 必须有 `id`（`:104-107`）。
- patch 输入不被原地修改（structuredClone），保证重复应用（HMR/config reload）可回退（`:43-56`）。

### 3.3 行选项（`EntryOptions` / `PatchOptions`）

`vendor/loader/src/config/entry.ts:9-22` + `vendor/include/src/index.ts:129-141`：

| 键                      | 含义                                                                                                 |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| `id` / `name`           | 行标识 / 模块说明符（包名、绝对路径、file URL）                                                      |
| `config`                | 传给插件的配置；由 Cordis 用插件导出的 `Config` 校验（见 §4.1）                                      |
| `disabled`              | 阻止该行及其子树运行；可为 `!!js` 表达式（`:84-92`）                                                 |
| `inject`                | 该行的必需服务或 intercept 配置（Loader 层等待注入后再评估该行 `!!js`，`cordis-primer.zh.md:41-45`） |
| `group`                 | 行是嵌套 group（`group: true` 时可被 `insert` 追加子行）                                             |
| `isolate` / `intercept` | 服务隔离/拦截，见 `framework/service.zh.md:111-141` 与 `vendor/loader/src/config/isolate.ts`         |

### 3.4 层叠顺序与覆盖语义

生效顺序（后层按行覆盖前层）：**profile 的 `dsh.profile.bundles` 列表顺序（内建 bundle 从 dsh 安装目录解析）→ profile 自己的 `cordis.patch.yml` → home 级 `$DSH_HOME/cordis.patch.yml` → 各 `--patch` overlay（argv 顺序）**（`apps/cli/reference/README.zh.md:11`；`publish.zh.md:112-128`）。

两个关键语义（组合包作者必须知道）：

1. **patch 替换目标行的整个 `config`，不做深合并**——覆盖行必须重述要保留的每个键（`publish.zh.md:123-126`；`packages/boot/app-boot/README.zh.md:179`）。
2. 用户可以在其 profile patch 里覆盖你的行，无需改你的包；所以默认值应尽量交给 schema 承担（`publish.zh.md:126`）。

另：profile 根 `cordis.yml` 永远是一份**空 entry 列表 `[]`**，启动器每次 boot 都会重写（防止 Loader 写回把合成结果固化导致重复插入），profiles 的完整配置树只由 patch 层组成（`apps/cli/src/profile-boot.ts:82-90,154-174`）。

### 3.5 `!!js` 表达式

- `!!js <expr>` 在 Include 的 YAML 方言里解析为表达式节点；Loader 在**行的注入激活后**基于该行插件上下文插值 `config`，每次挂载决策时求值 `disabled`；嵌套行表达式延后到目标行激活（`vendor/include/src/index.ts:9-15`；`docs/cordis-primer.zh.md:44-45`）。
- dump 时表达式原样打印不求值（`apps/cli/reference/README.zh.md:51`）。
- 官方 bundle 大量使用，例如 `config: { mode: !!js process.env.DSH_TOOLS_MODE }`（`packages/bundle/web-app/cordis.patch.yml:32-38`）、`port: !!js ctx.webStartup.port ?? 3080`（同文件 `:134-139`）。启动器提供 `ctx.dshHomePath` 与 `ctx.cmdlineArgs` 给表达式使用（`packages/boot/app-boot/src/index.ts:29-34`；`apps/cli/reference/README.zh.md:28`）。

### 3.6 与代码内 `ctx.plugin(...)` 的关系

- **patch 行 = 声明式组合**：Loader 按 `name` import 模块，`unwrapExports` 归一 default/named 导出后，以 `options.config` 挂载插件（`vendor/loader/src/config/entry.ts:175-189`；`vendor/loader/src/index.ts:188-196`）。这是推荐路径：可 dump、可被用户覆盖、可被 plugin-manager 管理。
- **`ctx.plugin()` = 代码内动态挂载**：在 `apply` 里创建子 fiber，继承父上下文、独立生命周期，父卸载时递归卸载（`docs/user/develop/framework/index.zh.md:65-97`；`docs/cordis-api/registry.md:35-56`）。适合「由配置/运行时条件决定的子插件」，如 `practice/index.zh.md:104-109` 的 Provider 挂载 `ctx.plugin(MyCapLocal)`。
- 二者**可叠加**：官方 bundle 的 patch 可以只插入一个「载体插件」，再由它 `ctx.plugin` 挂载一批内部实现；也可以每个实现各占一行。判断标准是「用户是否需要单独启用/配置/覆盖这一行」。
- 配置变更时 Loader 对行做部分重挂：`config` 变化触发 `fiber.update(config)`（重建实例、旧注册随 effect 撤销），`disabled` 变化直接 dispose（`vendor/loader/src/config/entry.ts:98-149`）。

### 3.7 常见误用/失败姿态

- 找不到目标的 patch → 启动时 stderr 警告、该 patch 跳过（不是失败；`packages/boot/app-boot/src/index.ts:331-337`）。
- `insert` 目标不是 group → warn 跳过；`name` 断言不符 → warn 跳过。
- patch 文件缺失/不可读/格式错 → **启动失败**（overlay 由调用方指名，缺失是误配置；`packages/boot/app-boot/src/index.ts:300-317`）。
- 只装了包但没把行写进任何 patch → 包是普通依赖，不激活任何层（`publish.zh.md:64`）。

---

## 4. host 插件 API 全图

### 4.1 插件形态与元数据

```ts
import type { Context } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';

export const name = 'my-plugin';
export const inject = ['tools'];
export interface Config {
  greeting: string;
}
export const Config: Schema<Config> = Schema.object({
  greeting: Schema.string().default('Hello'),
});
export function apply(ctx: Context, config: Config) {
  // ctx.tools is ready here.
}
```

- 模块导出函数 `apply(ctx, config)` 即完整插件；`name` 供 fiber 诊断/日志；`inject` 声明必需服务（`docs/user/develop/basic/index.zh.md:15-27,87-103`）。
- 三种形态：函数 / 对象（`export default { name, inject, apply }`）/ 类（`export default class extends Service`，`static inject`，构造函数 `super(ctx, 'key')`）；「需要对外提供服务时用类」（`basic/index.zh.md:105-138`）。
- `Config` 必须是 **Standard Schema**（Schemastery、zod 均可）：`packages/util/cordis-api` 的 `Plugin.Base.Config?: StandardSchemaV1`（`docs/cordis-api/registry.md:62-80`）；导出普通对象不行，加载时校验、schema 默认值自动填充（`basic/config.zh.md:45,49-74`）。
- Loader 归一 ESM/CJS/default 导出形状（`unwrapExports`，`vendor/loader/src/index.ts:188-196`），因此 `export function apply` 与 `export default { apply }` 等价。

### 4.2 服务与依赖注入

- 消费：`inject = ['tools']`，apply 运行时保证就绪；服务消失自动卸载、恢复自动重载（`docs/user/develop/framework/service.zh.md:19-32,102-109`）。
- 可选依赖：不写 inject，用 `ctx.get('metrics')` 在使用点查询（`:91-99`）；或在 `apply` 内 `ctx.inject(['settings'], cb)` 动态注入（官方 cookbook 用法，`adding-a-settings-card.zh.md:33-44`）。
- 提供服务：函数插件用 `ctx.provide(name, value)`（Cordis 一等 API，随 fiber 撤销；M2 已用，见并行 conformance 调研 §2 第 2 行）；`Service` 子类在构造函数中 `super(ctx, name)` 即完成 provide（`framework/service.zh.md:36-64`）。
- 类型面要做 `declare module '@deepseek-ai/cordis' { interface Context { myService: MyService } }` 声明合并，消费方才有 `ctx.myService` 类型（`framework/service.zh.md:65-85`；`docs/cordis-api/registry.md:58-80`）。
- 服务隔离：`cordis.yml` 的 `isolate` 让不同插件组各看各的实例（`framework/service.zh.md:111-141`）。

### 4.3 工具（tools）

注册（host 侧最重要扩展点）：

```ts
import { defineTool } from '@deepseek-ai/dsh-tools';

ctx.tools.register(
  defineTool({
    name: 'read_file',
    description: 'Read a file from disk.',
    parameters: {
      path: { type: 'string', required: true, description: 'Absolute path' },
      limit: { type: 'number' }, // 默认 optional
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args, exec) {
      return readFile(args.path, { encoding: 'utf8', signal: exec.signal });
    },
  }),
);
```

（`docs/cookbook/adding-a-tool.zh.md:9-36`；注册即副作用、随 fiber 注销 `:38`。）

- **schema 库**：`@deepseek-ai/dsh-tools` 自有的统一 JSON 值 DSL（`ParameterSchemaSpec` / `ValueSchemaSpec`，`src/schema.ts`），不是 zod/JSON Schema 库；支持 string/number/integer/boolean/null/array/object/`json`/`oneOf`，显式对象节点必须声明 `additionalProperties`（`packages/core/tools/README.zh.md:60`；`adding-a-tool.zh.md:42`）。`ctx.tools.register()` 也接受原始 JSON Schema `ToolDefinition`（MCP 来源工具即如此，`extension-cookbook.zh.md:9`）。
- **返回值/错误约定**：`execute` 只返回 `output.schema` 声明的规范 JSON 值（根可为标量/数组/对象）；基础设施故障抛异常（注册表转为 `isError`），成功但「结果不理想」也要写规范值；`output.render` 把人话给模型（`adding-a-tool.zh.md:45-46`；`packages/core/tools/README.zh.md:30-58`）。
- **身份与取消**：`exec` 携带不可变的 `callId/name/arguments/agent/token/signal`；必须观察 `exec.signal`；`args` 只读（`adding-a-tool.zh.md:44,47`）。
- **审批与沙箱的关系**：工具本身不内建部署策略，而是挂执行流水线的扩展点——`tools/pre-execute`（allow/deny/**ask** waterfall；返回 `ask` 后由 `ctx.approval` 应答者裁决）、`ctx.tools.guard()`（单调最终拒绝）、`tools/execute`（超时/重试/指标包装）、`tools/post-execute`（替换结果/附加上下文）、`tools/result`（只读观测）（`adding-a-tool.zh.md:57-61`；`packages/core/tools/README.zh.md:83-85,132-135`）。沙箱是另一条正交轴：`ctx.sandbox`（`confine(argv, policy)`，fail-closed）+ `ctx.sandboxPolicy.resolve()` 按会话解析模式（`docs/subsystems/sandbox.zh.md:23,67,156`）；权限预设把「沙箱模式 + 审批策略」捆成具名组合（`docs/subsystems/permission-presets.zh.md:5`）。
- **后台任务**：`ctx.jobs.start({ kind, label, owner: exec.agent, run })`，producer 提供 `cancel`/`done`/可选 `readOutput`；`ctx.jobs.start()` 之后用任务自有信号而不是 `exec.signal`（`adding-a-tool.zh.md:51-55`）。
- **PTC mode**：工具自动成为 `run_code` 程序里的 `await tools.<name>(args)`，无需集成（`adding-a-tool.zh.md:63-67`）。
- **UI 卡片**：`presentCall`/`presentResult` + `output.presentationMeta` 是 host 侧纯函数投影；内置 Web Client 实际通过 keyed slot `tool.call.toolview` 从 wire 值派生卡片（host 侧只需提供持久 metadata）（`adding-a-tool.zh.md:69-99`）。

### 4.4 事件、waterfall 与钩子

- 五种分发模式：`emit` / `waterfall` / `parallel` / `serial` / `bail`（`docs/cordis-primer.zh.md:17-27`）。waterfall 是环绕中间件：监听器 `(...args, next)`，**必须调用 `next()` 才能到达下游**，不调用即短路（有意设计，用于拦截/网关）（`framework/events.zh.md:64-81`；`cordis-primer.zh.md:31-39`）。
- 类型安全：`declare module '@deepseek-ai/cordis' { interface Events { 'my-plugin/ready': (p: {...}) => void } }`（`framework/events.zh.md:83-100`）。
- 命名规范 `namespace/action`；**`turn/*`、`step/*`、`tool/call`、`tool/result`、`compaction/*` 是持久化 Session 事件类型，不是 Cordis 事件**——要观察就监听 `session/event` 并检查 `event.type`（`framework/events.zh.md:102-106`）。
- 事件家族与扩展点（一手清单）：
  - **工具**：`tools/pre-execute`（waterfall, allow/deny/ask）、`tools/execute`（waterfall 包装分发）、`tools/post-execute`（waterfall）、`tools/result`（emit 只读）、`tools/change`、`tools/ptc-dispatch-log`（`docs/event-producer-consumer.zh.md:73-78`）。
  - **agent 实时协调**：`agent/created`（serial）、`agent/status`、`agent/pre-step`（waterfall，可拒绝/替换进入步骤的消息）、`agent/request`、`agent/request-error`、`agent/turn-stopping`（serial）、`agent/assistant-stream`（瞬态 token 帧）、`agent/inbox/*`、`agent/disposed`、`agent/error`（`event-producer-consumer.zh.md:14-25`；`packages/core/agent/README.zh.md:67`）。
  - **Session 持久事实**：`session/created`、`session/event`、`session/flush`、`session/disposed`（`event-producer-consumer.zh.md:60-63`）。
  - **提示词/审批/命令/设置/凭据**：`system-prompt/assemble`（waterfall，权威装配）、`system-prompt/change`、`approval/request`（waterfall）、`commands/change`、`settings/updated`、`settings/document-updated`、`credentials/reference-updated`、`credentials/record-updated`（`event-producer-consumer.zh.md:31,42-43,64-65,71-72`）。
  - **工作流/子代理/技能/fs**：`workflow/*`、`subagent/*`、`skills/change`、`fs/write-intent`/`fs/edit-intent`/`fs/observed`（同表 `:46-48,66-70,81-86`）。
- 监听器也是 effect：`ctx.on(...)` 注册随 fiber 自动移除（`framework/events.zh.md:108-117`）。
- 钩子插件范例（权限门禁，waterfall 返回类型化决策）：

```ts
ctx.on('tools/pre-execute', async (exec, next): Promise<PreToolDecision> => {
  if (!(await isAllowed(exec))) return { kind: 'deny', reason: 'Denied by policy.' };
  return next();
});
```

（`docs/cookbook/extension-cookbook.zh.md:13-35`。）

### 4.5 settings 命名空间

- 服务 seam：`ctx.settings`（Definition: `@deepseek-ai/dsh-settings`；Provider: `dsh-settings-file`）（`docs/capability-seams.zh.md:571`）。
- **已有 `cordis.yml` entry 的消费方应 `ctx.settings.installSection()`**：以组合 `config` 为 base 注册 namespace，无 settings provider 时回退组合配置；`ctx.inject(['settings'], cb)` 软注入，不阻塞无 provider 的组合（`docs/cookbook/adding-a-settings-card.zh.md:9-44`；`packages/settings/settings/README.zh.md:46-58`）。
- 语义要点：解析层 = schema 默认值 → 组合 `base` → 用户文档分节；写只进用户层（`replace({})` 真重置）；`get()` 返回深冻结快照；`watch` 异常隔离；`update/mutate` 带 revision 栅栏；`role('secret')` 字段在协议面脱敏为 `{ path, set }` slot（`settings/README.zh.md:60-76`；`adding-a-settings-card.zh.md:46`）。
- 命名空间字面量按小写字母/数字/连字符文法编译期校验（`settings/README.zh.md:58`）；实现入口 `packages/settings/settings/src/index.ts:472`。
- M2 曾用 owner 路径 `ctx.settings.register` 且丢弃返回 scope——conformance 调研判定应改为 consumer 路径（见 `docs/research/2026-09-18-dsh-authoring-conformance.md` §3.2；现状已移除，§8）。

### 4.6 credentials

- seam：`ctx.credentials`（abstract `CredentialProvider`；Provider: `dsh-credentials-local`）。**配置只携带引用**（POSIX 风格环境变量名 `CredentialRef`），值由 provider 拥有；消费方**每个操作重新 resolve、绝不跨操作缓存**——这是凭据轮换无需重启的机制（`docs/subsystems/credentials.zh.md:5,20-31,127-144`）。
- API：`resolve(ref)`、`describe(ref)`（不暴露值）、`set/unset`、以及面向授权落盘的 record 半边 `readRecord/describeRecord/listRecords/modifyRecord/deleteRecord`（`:135-215`）。
- 插件配置惯例：settings 字段用 `role('secret')`，或改为经 credentials 寻址一个凭据引用（`adding-a-settings-card.zh.md:46`）。
- 平台规则 M8（secret 不进 config/repo）与此 seam 一致；BotHarness 飞书 App Secret 走 credentials。

### 4.7 systemPrompt 注入

- `ctx.systemPrompt.section({ name, order, text })` 注册提示词段；`text` 可为静态或 `(context) => string`（每次 assembly 求值）；section 名唯一、重复抛错；按 order 升序 + 名称代码单元序排序（`docs/subsystems/system-prompt.zh.md:46-72`；`packages/core/system-prompt` 为 Definition）。
- 动态上下文用 `ctx.systemPrompt.context(...)`（缓存安全的 durable user-role 快照），工具 schema 用 `ctx.systemPrompt.tools(provider)`，变量用 `variable(name, provider)`；`suppressRuntimeContext()` 可压制调用者作用域内的动态上下文（`:74-88,100-174`）。
- `system-prompt/assemble` waterfall 的返回值具有权威性；`complete: true` 段会被恢复为唯一段，监听器不得绕过（`:44,186-201`）。
- M2 已用 `ctx.systemPrompt.section`（`packages/core/src/plugin.ts:64-77`），命名/排序合规（conformance §2 第 16 行）。

### 4.8 session / projection / agent / 记忆类 seam

- **记忆的官方机制映射**：`docs/cookbook/extension-cookbook.zh.md:130` 一行写死——「记忆 = section 提供方 + 工具」。DSH 不提供 memory 服务；`ctx.memory` 并不存在（负向 grep 于 capability-seams 表）。community 的 memento 只是把 SQLite 选择包装成自有 seam（见社区调研 §4.5）。
- `ctx.sessions`：内存中的 append-only Session store；`session/event` 是唯一持久事实源（`docs/capability-seams.zh.md:556`；`docs/subsystems/session.md:5`）。冷读/查询走 `sessionPersistence`/`sessionQuery`（包 `session-query`），不是 live session。
- `ctx.sessionProjections`：各领域注册「状态折叠单元」，由 `session/event` 驱动（eager）；注册是 effect，随 fiber 卸载该 key 从快照消失；注册后可惰性 fold 历史（`docs/subsystems/session-projection.zh.md:205`）。这是 host 插件向 UI/其他插件暴露「会话维度派生状态」的官方路径。
- `ctx.agents`：实时 Agent 句柄的创建/恢复与协调。`agent.followup(msg)` 排队下一个轮次的提示词并唤醒驱动器；`agent.steer(msg)` 提交下一步输入并唤醒；`agent.inject(msg)` 只加面向模型的持久上下文、不唤醒（落在下一个被接纳步骤）；`cancel(cause)`、`whenIdle()`（`packages/core/agent/README.zh.md:47`）。
- 向模型动态注入上下文的两种官方姿势：持久化 `agent.inject(...)`（user message，带 `source`）或在 `agent/pre-step`/`system-prompt` 层贡献（`time-context`/`agent-instructions` 样本即这两种，见 §5）。
- 工具内异步通知：`exec.agent.inject({ content, source: { kind: 'plugin', plugin: name } })`（`adding-a-tool.zh.md:49`）。

### 4.9 生命周期：dispose、HMR、重启边界、错误隔离

- Fiber 状态机：`PENDING → LOADING → ACTIVE`，apply 抛异常进 `FAILED`；`ACTIVE → UNLOADING → DISPOSED`（`framework/index.zh.md:9-24`）。
- 自动清理：`ctx.on`、`ctx.tools.register`、`ctx.llm.registerAdapter` 等注册全部随 fiber 撤销；自定义资源用 `ctx.effect(() => cleanup)`；disposer 逆序调用但异步 disposer 并发，有序清理要放进同一个 effect（`framework/index.zh.md:40-63`）。
- `dispose` 保证：移除全部注册、递归卸载子插件、Promise 在所有异步清理后兑现（`framework/index.zh.md:78-97`）。
- HMR：启用 `dsh-hmr` 后，改源码触发「卸载旧插件（清注册）→ 加载新代码 → 新 apply」；config 变更触发插件热替换（`framework/index.zh.md:99-107`；`basic/config.zh.md:98-100`）。HMR 监视 profile manifest 与两份用户 patch；**包安装/替换走另一条队列，替换已安装包版本仍要重启进程**（`packages/boot/hmr/README.zh.md:56-63,84-89`）。
- 错误隔离（app-boot 失败矩阵，`packages/boot/app-boot/README.zh.md:76-90`）：optional 行 apply 抛错 → 警告继续；required 行（`agent-loop`/`webserver`/`modules`/`connection` 等）失败 → 拆应用非零退出；schema 校验失败 → 该行不激活、兄弟插件保留；**apply 之外的未处理 Promise rejection 一律致命**。
- 失败诊断：`$DSH_HOME/logs/startup-*.log`（安装调研 §4.3/§5.8）。

---

## 5. 官方在库黄金样本

### 5.1 `@deepseek-ai/dsh-time-context`（推荐全文走读，222 行）

`packages/context/time-context/`。为什么是黄金样本：一个文件里覆盖 host 插件的大半 API——`name`/`inject`/`Config`、`sessionProjections.register`、`agent/pre-step` waterfall、`ctx.effect`、动态 user message 注入、`prepend: true` 监听器。

- 插件头：`name = 'time-context'`、`inject = ['agents', 'sessionProjections']`、`Config`（可选 `timeZone`/`refreshIntervalMs`）（`src/index.ts:23-60`）。
- 注册投影单元（持久化折叠状态 + zod 校验）（`:153-179`）。
- `agent/pre-step` waterfall：先 `await next()` 让下游决策，再在 `decision.messages` 尾部追加一条 `createUserMessage({ source: { kind: 'plugin', plugin: name, ... } })`；`{ prepend: true }` 让本监听器先于普通注册运行（`:181-221`）。
- 插件生命周期用 `ctx.effect(() => () => ...)` 收尾（`packages/context/agent-instructions/src/index.ts:94-100` 同款）。
- 包契约参考：`package.json:13-46`（`main/types/exports/files`、6 个 peer + dev 镜像、`schemastery`/`zod` 在 dependencies）。

### 5.2 `@deepseek-ai/dsh-message-feedback`（Service 子类 + 持久化日志）

`packages/feedback/message-feedback/src/index.ts`（313 行）。

- `class MessageFeedbackService extends TypertRemoteService`，`static inject = ['sessionPersistence', 'sessions']`，构造函数 `super(ctx, 'messageFeedback')`；`static Config = s.object({ maxNoteBytes: ...required() })` + 构造时二次校验（`:118-139`）。
- `declare module '@deepseek-ai/cordis'` 同时合并 `Context.messageFeedback` 与 `Events['feedback/committed']`，用 JSDoc `@mode parallel` 标注分发模式（`:45-60`）。
- 领域状态从 Session 事件折叠（`currentItems`），写路径受 `operationTails` 串行化 + admission 门控制（`:96-128`）。
- 适合学：Service 类形态、服务命名、配置必填项、事件声明合并、持久化写的串行化。

### 5.3 `@deepseek-ai/dsh-agent-instructions`（可选服务 + 持久上下文注入）

`packages/context/agent-instructions/src/index.ts`（360 行）。AGENTS.md 读取器。

- `inject = ['sessionProjections']`（`:34`），对 `ctx.fs` 用**可选服务**：`const fileSystem = ctx.get('fs'); if (fileSystem === undefined) return undefined`——providerless 组合里自动退化为 no-op（`:119-120`）。
- 通过 `agent/pre-step` 与 `sessionProjections` 把基线指令作为 `user/message`（`source.kind = 'agent-instructions'`）投递，并用 `ctx.effect` 管生命周期（`:84-106`）。
- 适合学：可选依赖、按会话幂等的上下文注入、文件服务 seam 的消费方式。

### 5.4 bundle 三件套（组合层样本）

- `@deepseek-ai/dsh-base`（`packages/bundle/base/`）：110+ 行的最大插入层，core 全部领域包以 `insert` 进入空根；行 id 就是后续层覆盖的锚点（`cordis.patch.yml`）。
- `@deepseek-ai/dsh-web-app`（`packages/bundle/web-app/cordis.patch.yml:1-516`）：教科书级的「bundle 覆盖 base 行 + 插入 Web 专属行」样本——按 id 覆盖 `system-prompt`/`tools` 整段 config（`:16-38`）、插入 host 行与 client roster 行（`:44-375`）、把 agent plane 行 `disabled: true` 后交给 agent preset（`:377-516`）。
- `@deepseek-ai/dsh-sdk-minimal`（`packages/bundle/sdk-minimal/`）：**不用 base 的独立 bundle**，一行 `dsh.bundle.patch` 携带完整配置树；适合学最小组合与「bundle 依赖即运行时依赖」的写法（`package.json:31-72`）。

### 5.5 建议走读顺序

`basic/index.zh.md`（30 行读懂插件）→ `basic/tool.zh.md` → `basic/config.zh.md` → `time-context/src/index.ts`（API 全景）→ `web-app/cordis.patch.yml`（组合层）→ `message-feedback/src/index.ts`（服务类）→ `docs/subsystems/core.zh.md`（按需查服务签名）。

---

## 6. 发布、校验与版本兼容

### 6.1 三种发布形态（官方 `publish.zh.md:153-178`）

| 形态    | 作者要做                                                                 | 用户门槛                                                                                                               |
| ------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| npm 包  | `pnpm publish` 前构建好入口（`files` 含 patch）                          | `dsh plugin add <pkg>` 即装预构建产物                                                                                  |
| tarball | `pnpm pack`                                                              | `dsh plugin add ./x-0.1.0.tgz`（无需构建许可）                                                                         |
| git 源  | 提供自包含 `prepare` 脚本（不能假设 monorepo checkout，建议专用 tsdown） | 首次 `add` 会被 pnpm ≥10 拦截，用户把包键写进 profile 的 `pnpm-workspace.yaml` `allowBuilds` 后重跑；作者应锁定 commit |

安装与层栈的全部机制见 `docs/research/2026-09-18-dsh-plugin-installation.md`（不重复）。

### 6.2 官方校验能力

- **安装前静态验证**：`dsh --profile <p> --dump-config` 打印合成后的行列表 + 每行来源注释、`!!js` 原样、未命中 patch 报 stderr；`--dump-default-config` 只看 bundle 层。dump 不启动应用、不跑应用参数（`apps/cli/reference/README.zh.md:47-53`）。这是官方唯一面向插件作者的「组合检查」。
- **安装/激活时校验**：Cordis 用导出 `Config` 校验配置（不合法 → 该行加载失败，响亮报错）；profile 解析缺 `dsh.bundle`/patch 文件缺失 → 启动失败（`packages/boot/app-boot/src/profile.ts:890-895`；`profile-boot`）。
- **Plugin Manager 的安装检查**：`inspect` 预检（含「declares no dsh.bundle」拒绝）与安装后启用（`packages/boot/plugin-manager/src/index.ts:263,291`；UI 细节见安装调研 §2）。
- **没有官方 doctor / 插件合规校验器 / marketplace 审核**：pinned SHA 全仓 grep `doctor` 未命中任何官方命令或文档（仅一处测试文件）；社区 `dsh-doctor`/`dsh-vet`/`dsh-testkit` 是第三方（见社区调研 §2.5/§4.10，未审计）。

### 6.3 兼容声明方式

- 声明：`engines.dsh` + `dsh.manifestVersion`（§2.2），**仅声明**。
- 事实上的推荐做法（官方示例）：`engines: { node: '>=24', dsh: '0.1.5-alpha.1' }`；生态普遍写精确/窄范围（社区调研 §4.1/§4.3，如 `>=0.1.5-rc.1 <0.1.6`）。
- 宿主侧防线是 profile 的 `pnpm-lock.yaml` + `autoInstallPeers: false` + 运行时模块解析 generation（`packages/boot/app-boot/src/profile.ts:183-188`；`apps/cli/src/profile-boot.ts:206-215,312-315`）——兼容性最终在「挂载/import」时暴露，而不是在声明检查时。

### 6.4 预览期已知破坏性变化

- 官方 README 明示 developer preview「**THERE WILL BE COMPATIBILITY-BREAKING CHANGES**」（README.md:11-15）。
- `dsh.manifestVersion` 是格式号（当前 1），Session 格式版本独立演进（当前 3）并有持久化回溯目录 `docs/persistence-changes/releases/`（manifest.json 记录每个 tag 的 `sessionFormatVersion`；`dsh-v0.1.5-rc.2.zh.md` 等）；**这不是插件 API 的 changelog**。
- 插件 API 的破坏性变化没有集中 changelog；只能靠 pin 宿主版本 + 逐版本读文档/源码（生态样本：dsh-lark-bridge 自述 tested with 0.1.0-rc.6、dsh-testkit 写死 rc.6；见社区调研 §5.7）。

---

## 7. 坑位清单

1. **peer 版本与 `autoInstallPeers: false`**：profile 不自动装 peer；缺失模块由启动器解析 generation / `$DSH_HOME/profiles/node_modules` fallback 兜底（安装调研 §1.3/§6.1）。插件把 `@deepseek-ai/*` 写成 `dependencies`（内建 bundle 的做法）时，用户装包即得到可解析的运行时依赖；写成 peer 时宿主安装的版本说话。**声明 `engines.dsh` 不会被强制**（§2.2）。
2. **层顺序有语义**：后层按行胜出、config 整段替换（§3.4）。覆盖内建行必须重述所有键；用户级 patch 永远在你的 bundle 之后，因此不要把「必须生效」的行为放在会被覆盖的 config 里。
3. **编译/发布 ≠ 注册**：包被安装只意味着依赖存在；行必须由某个 patch `insert` 才激活；client 半还必须在**已启用**的 Loader entry 集合里（`adding-a-settings-card.zh.md:82`；社区 `dsh-contrib-topology` 的「能编译但 UI 静默不出现」是同一机制，见社区调研 §4.7，属社区自述）。
4. **TS5055 类跨包类型冲突**：官方仓库内没有针对该错误的公开说明（pinned SHA grep `TS5055` 零命中；仅内部 `scripts/doc-typecheck.ts` 涉及 `tsBuildInfoFile`）。社区样本报告：双面包共享 `src/types.ts` 双侧输出互相覆盖，需各自 `tsBuildInfoFile` 并用相对路径共享类型（社区调研 §4.7，**社区自述、未验证**）。
5. **构建许可（allowBuilds）**：git 源安装时 pnpm ≥10 默认拦截 `prepare`；这是「让包代码在你机器上执行」的授权，官方要求锁定 commit（`publish.zh.md:164-173`）。
6. **patch 失败姿态**：空 patch 文件 → 启动失败（用 `[]` 禁用层）；找不到 target / name 断言不符 → 只 warn 跳过；patch 文件缺失 → 启动失败（§3.7）。
7. **服务依赖不要硬编码**：可选服务一律 `ctx.get()` / `ctx.inject([...], cb)`；把 provider 写进静态 `inject` 会让插件在无 provider 的组合里永久 PENDING（M2 审计 §3.2；cookbook 同款要求）。
8. **`turn/*` 等不是 Cordis 事件**：它们是 `session/event` 的 `event.type`（§4.4），监听错对象是常见空转原因。
9. **apply 之外的未处理 rejection 致命**：app-boot 失败矩阵把「脱离 apply 的未处理 rejection」列为全局致命（`packages/boot/app-boot/README.zh.md:87`）。
10. **仓库内包不变式 ≠ 外部包要求**：`private:true`、版本同步、`exports`/`files` 门禁等是 monorepo 内部规则（`adding-a-package.zh.md:25`）；外部作者以 `basic/publish.zh.md` + `package-manifest` 类型为准。

---

## 8. 对 BotHarness 的落点

现状（本仓库，2026-09-19 工作区）：`packages/core` 已按 M2 conformance 结论修正——`package.json:28-37` 有官方 `engines.dsh`/`engines.node` 与 `dsh.manifestVersion`，`plugin.ts:53-54` 的 `apply(ctx, config)` 真正消费 config、`inject` 已移除 `settings`，`ctx.provide('botharness', core)` + `tools.register` + `systemPrompt.section` 均为合规路径（conformance §2）。以下只列 host 侧仍需处理的点：

1. **类型面**：补 `declare module '@deepseek-ai/cordis' { interface Context { botharness: BotHarnessCore } }`（consumer 类型安全；conformance §4.1 建议，仍未做）。
2. **exports.types**：`packages/core/package.json:12-15` 的 `"."` 只有 `default`；外部消费方（M3 的 client/app 包）拿不到类型，建议 `".": { "types": "./dist/index.d.ts", "default": "./dist/index.mjs" }`（conformance §4.5）。
3. **engines.node 对齐**：当前 `>=22`，上游运行时要求是 `^22.19.0 || >=24.0.0`（§0 元信息）。
4. **M3 组装形态**：按官方「一个包两个半侧」约定做 `deepseekbot` bundle 包（host 半 `src/`、client 半 `src/client/` + `dsh.client` + `exports['./client']`），bundle patch 插入我们的行并依赖 `@botharness/core`；安装/验证走并行安装调研 §6 的 M3.5 门。不要逐包安装（层叠顺序与 bundle 声明问题）。
5. **settings 卡片的正确形态**：若 M3 要把 `enabled` 等暴露到 Settings → Plugins，按 `adding-a-settings-card.zh.md` 的 `installSection` + `ctx.inject(['settings'])` 写（M2 已删除错误用法）；不需要 UI 就保持纯 `apply(ctx, config)`。
6. **工具补强**：只读记忆工具可加 `isConcurrencySafe`（`defineTool` 可选字段）；若要 Web 卡片，用 `output.presentationMeta`（别指望 `presentCall/presentResult` 自动出 Web 卡）。
7. **测试/验证落点**：官方有 `dsh-loader-smoke`/`app-boot` 组装测试与 `--dump-config`；我们的 M3.5 gate 直接复用（`dsh --profile botharness --dump-config` 看 `# == @botharness/core` 层），外部生态的 `dsh-testkit` 可作为阶段链对照（社区调研 §4.10，未审计）。
8. **记忆 seam 定性**：官方没有 `ctx.memory`；我们的「section 提供方 + 工具 + 文件真源」正是官方映射口径（`extension-cookbook.zh.md:130`）。如需被第三方消费/替换，可参考 memento 的做法另立 `botharness` 服务 seam（社区调研 §4.5），但不属于 DSH 官方 seam。

---

## 9. 未验证 / 存疑

1. **未运行 DSH**：本文所有运行时行为（HMR 替换、waterfall 决策、`installSection` 回退、投影注册时序）来自源码/文档推导；M3.5 安装门应实测。
2. **行选项的运行时校验强度**：`EntryOptions` 的未知键是否会被 Loader 拒绝未逐一验证（`parsePatchList` 只做 YAML JSON 方言 + array/mapping 检查；字段语义由消费方负责）。
3. **`import type` 跨包值导入的外部边界**：官方文档只对仓库内 client bundle 与 monorepo 约定有硬门禁；外部 host 包是否被同等约束未明确（推断：Node ESM 下运行时值导入能工作，但会破坏「服务经 ctx」的隔离设计）。
4. **TS5055 是否有官方立场**：pinned SHA 无公开说明；只能引社区样本并标注（§7.4）。
5. **`engines.dsh` 的比较行为**：不被强制，SemVer 预发布比较语义未实测（包 manifest README 明说读取方不校验）。
6. **npm 包 `prepare` 只对 git 源运行**、npm registry 装包默认运行哪些脚本（`postinstall` 等）对插件的影响未在本文展开；以 pnpm 行为与安装调研 §5.3 为准。
7. **`docs/user/develop/practice/llm-adapter`、`adding-a-remote-api`、`adding-a-session-format-version`** 未细读，仅在清单中登记路径。

---

## 10. 一手来源与访问日期

| 来源（pinned SHA `ddefc45…` 仓库根或文档站）                                                                                                              | 支撑内容                                                                                              | 访问日期   |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------- |
| `docs/user/develop/basic/{index,config,tool,publish}.zh.md`                                                                                               | 插件定义/三形态/inject/自动清理；Config 与 apply；defineTool 最小形态；bundle/profile manifest 与层序 | 2026-09-19 |
| `docs/user/develop/framework/{index,service,events}.zh.md`                                                                                                | Fiber 状态机/effect/dispose/HMR；服务与隔离；五种事件模式与事件族分工                                 | 2026-09-19 |
| `docs/user/develop/practice/index.zh.md`、`dynamic-cordis.zh.md`                                                                                          | 三角色拆分与三包样本；动态配置闭环                                                                    | 2026-09-19 |
| `docs/cordis-primer.zh.md`                                                                                                                                | 五个核心概念、分发模式表、waterfall、Loader `!!js`                                                    | 2026-09-19 |
| `docs/cordis-tutorial/`、`website/docs.ts:175-278,296-452`                                                                                                | 教程全 7 课与文档站四个开发分组/参考分组                                                              | 2026-09-19 |
| `docs/cookbook/adding-a-tool.zh.md`                                                                                                                       | 工具定义真源：execute 约定、策略/观测、PTC、UI 卡片                                                   | 2026-09-19 |
| `docs/cookbook/adding-a-package.zh.md`                                                                                                                    | 仓库内包逐文件清单与 package.json 不变式                                                              | 2026-09-19 |
| `docs/cookbook/adding-a-settings-card.zh.md`                                                                                                              | `installSection` + 软注入；client 半打包                                                              | 2026-09-19 |
| `docs/cookbook/extension-cookbook.zh.md`                                                                                                                  | 钩子范例、功能→机制映射表（含「记忆=section+工具」）                                                  | 2026-09-19 |
| `docs/event-producer-consumer.zh.md:10-86`                                                                                                                | 全部 harness 事件的生产/消费矩阵与声明位置                                                            | 2026-09-19 |
| `docs/agent-lifecycle.zh.md:8-91`                                                                                                                         | followup→turn/step→tool→settle 的完整时序与持久/实时分工                                              | 2026-09-19 |
| `docs/capability-seams.zh.md:552-619`                                                                                                                     | 核心/seam 服务表（settings/credentials/tools/approval/agents/jobs/subagents 等）                      | 2026-09-19 |
| `docs/subsystems/system-prompt.zh.md`                                                                                                                     | section/context/tools/variable API 与 assemble waterfall                                              | 2026-09-19 |
| `docs/subsystems/credentials.zh.md:5,20-31,127-215`                                                                                                       | 凭据 seam：引用而非值、按操作 resolve、record 半边                                                    | 2026-09-19 |
| `docs/subsystems/approval.zh.md:5,13-46,84-88`                                                                                                            | 审批 seam：闭合结果、fail-closed、按会话策略、审计事件                                                | 2026-09-19 |
| `docs/subsystems/sandbox.zh.md:5,23,67,156`                                                                                                               | 沙箱 seam 与 `sandboxPolicy`；与工具策略的正交关系                                                    | 2026-09-19 |
| `docs/subsystems/session-projection.zh.md:205`                                                                                                            | 投影单元注册/折叠/随 fiber 卸载语义                                                                   | 2026-09-19 |
| `packages/util/package-manifest/src/types.ts:8-77`、`README.zh.md:12,34-55,90-91`                                                                         | `DshManifest` 四字段、`engines.dsh`、声明不强制                                                       | 2026-09-19 |
| `vendor/include/src/index.ts:9-25,43-141`                                                                                                                 | patch 算法与 `PatchOptions`、`!!js` 方言                                                              | 2026-09-19 |
| `vendor/loader/src/config/entry.ts:9-22,72-96,108-189`、`vendor/loader/src/index.ts:184-196`                                                              | `EntryOptions`、`disabled` 求值、`update`/`init`、`unwrapExports`                                     | 2026-09-19 |
| `packages/boot/app-boot/src/index.ts:279-362,364-403,944-951`、`README.zh.md:48-90,169-179`                                                               | patch 文件加载/解析/锚定、dump、失败矩阵、config 整段替换                                             | 2026-09-19 |
| `packages/boot/app-boot/src/profile.ts:183-188,879-934`                                                                                                   | profile/bundle 解析、`autoInstallPeers:false`、缺 bundle 声明 fail loud                               | 2026-09-19 |
| `apps/cli/src/profile-boot.ts:82-90,154-215,296-322`                                                                                                      | 空根 `cordis.yml`、层合成、runtime 解析 generation                                                    | 2026-09-19 |
| `apps/cli/reference/README.zh.md:11,13,15-19,28,47-53,64-66,76,84,88,116`                                                                                 | 层序、profile 模板、`--dump-config`、pnpm 转发、HMR/重启边界                                          | 2026-09-19 |
| `packages/bundle/base/package.json:13-35`、`sdk-minimal/package.json:13-35`、`bundle/README.zh.md:12,23-32`                                               | 官方 bundle 包解剖与两种组合形态                                                                      | 2026-09-19 |
| `packages/bundle/web-app/cordis.patch.yml:1-12,16-38,44-53,129-168,377-516`                                                                               | 覆盖/插入/禁用行的官方式样与 `!!js` 用法                                                              | 2026-09-19 |
| `packages/context/time-context/{src/index.ts:23-221,package.json:13-64}`                                                                                  | 黄金样本 1：最小 host 插件全 API                                                                      | 2026-09-19 |
| `packages/feedback/message-feedback/src/index.ts:39-139`                                                                                                  | 黄金样本 2：Service 子类 + 事件声明 + 持久化写串行                                                    | 2026-09-19 |
| `packages/context/agent-instructions/src/index.ts:32-120`                                                                                                 | 黄金样本 3：可选服务与持久上下文注入                                                                  | 2026-09-19 |
| `packages/core/tools/README.zh.md:30-89,103,119-135`                                                                                                      | 工具注册/模式/限制/守卫/流水线与 schema DSL                                                           | 2026-09-19 |
| `packages/settings/settings/{README.zh.md:46-76,src/index.ts:472}`                                                                                        | settings namespace 注册与 `installSection`                                                            | 2026-09-19 |
| `packages/boot/hmr/README.zh.md:27-47,56-63,84-89`                                                                                                        | HMR 配置、串行队列、安装包替换仍需重启                                                                | 2026-09-19 |
| `packages/core/agent/README.zh.md:47,67`                                                                                                                  | `followup/steer/inject/cancel/whenIdle` 与 `agent/*` 事件                                             | 2026-09-19 |
| `docs/cordis-api/registry.md:8-80`                                                                                                                        | `ctx.inject`/`ctx.plugin` 与 `Plugin` 类型面（Standard Schema Config）                                | 2026-09-19 |
| `.agents/notes/implemented/architecture/2026-09-10-public-package-manifest.zh.md`、`2026-08-05-profile-plugin-bundles.zh.md`                              | 公共 manifest 字段范围；profile/bundle 设计决策                                                       | 2026-09-19 |
| `README.md:11-15`；`docs/persistence-changes/releases/manifest.json`                                                                                      | developer preview 破坏性变化警告；Session 格式版本回溯（非插件 API changelog）                        | 2026-09-19 |
| 本仓库 `packages/core/{package.json,cordis.patch.yml,src/plugin.ts}`                                                                                      | 现状核对（§8）                                                                                        | 2026-09-19 |
| `docs/research/2026-09-18-{dsh-plugin-installation,dsh-authoring-conformance,dsh-client-ui-and-docs-ia}.md`、`2026-09-19-dsh-community-plugins-survey.md` | 本文引用/不重复的既有结论                                                                             | 2026-09-19 |
