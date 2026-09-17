# DSH 插件安装机制调研 — 官方安装路径与 M3.5 安装验证门

## 0. 元信息

| 项         | 内容                                                                                                                                                                                                                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 问题       | DSH（DeepSeek Harness）插件到底怎么装？官方 `dsh plugin` CLI 的语义、profile/配置落盘位置、bundle 与客户端 UI bundle 的注册方式、内置/社区插件管理器现状，以及 M3.5「本机装我们的 bundle 并验证」应怎么走                                                                                        |
| 上游       | https://github.com/deepseek-ai/deepseek-harness（README.md:5-9 声明项目文档站 https://deepseek-harness.github.io/deepseek-harness/）                                                                                                                                                             |
| Pinned SHA | `ddefc45fbc7f8e46dd73185e68295696d1297887`（2026-09-17 21:19 +0800，release dsh-0.1.6-alpha.2）；以下 `apps/...`、`packages/...`、`docs/...` 路径均相对该 SHA 的仓库根                                                                                                                           |
| npm 快照   | `@deepseek-ai/dsh` dist-tags：`latest = next = 0.1.5-rc.2`、`alpha = 0.1.6-alpha.2`（2026-09-18 查询）；社区包 `dshmarket@1.47.0`、`@xmanrui/dsh-im@4.21.2`、`dsh-lark-link@0.5.3` 同期快照                                                                                                      |
| 调研方法   | 一手来源优先：浅克隆上游仓库逐文件读 CLI/插件管理器/客户端模块源码与官方文档；`npm view` 读 registry 元数据；`gh search`/`gh api` 只用于「存在性与 README」，不作为机制事实依据。所有 URL 访问日期 **2026-09-18**。无法由一手来源确认的说法一律标「未验证」。本次**未实际安装任何插件**（见 §7） |

一句话结论（详见 §1）：**DSH 没有自己的包管理器；`dsh plugin --profile <p> <args...>` 只是把参数原样转发给 profile 目录里的 `pnpm`。** 插件以 npm 包分发，包内用 `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }` 声明一个配置层；安装成功后 DSH 把该包名写进 `$DSH_HOME/profiles/<p>/package.json` 的 `dsh.profile.bundles` 列表。客户端 UI 是同一个包的另一半：声明 `dsh.client` 并导出构建好的 `./client`，宿主扫描 Loader 条目后经 `/plugins/...` 提供、由浏览器懒加载。官方内置了插件管理器（侧边栏 **Plugins** 页 + 只读 Settings 列表 + `plugin_manager` 工具），但**没有官方 marketplace，也没有 `/plugin` 命令**；社区有 `dshmarket` 等第三方管理器。

---

## 1. 官方安装路径：`dsh plugin` 是 pnpm 转发器

### 1.1 命令与语义

- 入口形态：`dsh plugin --profile <name> <args...>`；`plugin` 必须紧跟 `dsh`，`--profile` 是必填（`apps/cli/src/args.ts:171-181`，少了 profile 直接报错）。
- 语义：首次使用先初始化 profile（有随附模板用模板；其他名字只装 `@deepseek-ai/dsh-base`），然后**以 profile 目录为 cwd 把剩余参数转发给 pnpm**——`add`、`remove`、`why`、`update`、`outdated`、`list` 等一切 pnpm 动词照常可用，pnpm 必须在 PATH 上（`apps/cli/reference/README.md:64`）。因此：
  - 没有 DSH 自造的 `list`/`info` 子命令；「列出」就是 pnpm 的动词，或看 UI。
  - `-w`、`--ignore-scripts`、`--registry` 等全是 **pnpm 参数透传**，不是 DSH 参数（例：`-w, --workspace-root` = 作用于 workspace 根项目，本机 pnpm 12.4.2 `pnpm add --help` 原文）。
- 相对路径锚定：`.`, `../plugin` 及其 `file:`/`link:` 形式会先锚定到**调用目录**，所以插件 checkout 里执行 `add .` 装的是那个 checkout，而不是 profile（`apps/cli/reference/README.md:64`）。
- 每次成功运行后对账 `dsh.profile.bundles`：依赖解析到的包若声明了 `dsh.bundle.patch` 就加入层栈；没有声明的依赖保留为普通依赖并打一次性警告；被移除的依赖从层栈删除；`update` 后新获得声明的包立即激活（`apps/cli/reference/README.md:64`）。
- **重启边界**：bundle 成员（增/删/更新）变化后，运行中的 profile 仍用启动时的集合，必须重启；而 profile/home 的 `cordis.patch.yml` 普通编辑在启用 HMR 时热生效（`apps/cli/reference/README.md:76`）。

最小官方示例（`docs/user/develop/basic/publish.md:77-110`）：

```sh
dsh plugin --profile demo add ./hello-plugin   # 首次会初始化 profile
dsh --profile demo --dump-config               # 不启动，先看组合层
dsh --profile demo                             # 启动
dsh plugin --profile demo remove dsh-hello-plugin
```

社区实践中常见的 `-w` 变体（如 `dsh plugin --profile web add -w @xmanrui/dsh-im`）因为 profile 自带 `pnpm-workspace.yaml`（见 §1.3）而显式指向 workspace 根；官方教程不写 `-w`。两种写法在 pnpm 11/12 下的具体差异**未验证**。

### 1.2 安装源形态

| 源       | 形态                                      | 是否构建                              | 备注                                                                                                                                                                                           |
| -------- | ----------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| npm 包   | `add <pkg>[@<version>]`                   | 装预构建产物                          | 最省事；注意镜像 `dist-tags` 可能滞后（§5）                                                                                                                                                    |
| 本地路径 | `add ./hello-plugin` / `add .`            | 需要目录里已有构建产物                | pnpm 记录为 `link:`（`publish.md:90` 的 profile 示例），即链接到 checkout；改动无需重装                                                                                                        |
| tarball  | `add ./pkg-0.1.0.tgz`（`pnpm pack` 产出） | 装打包产物                            | 无需构建许可                                                                                                                                                                                   |
| git 源   | `add github:you/hello-plugin[#<sha>]`     | 拉**源码**，靠包内 `prepare` 脚本构建 | pnpm ≥10 默认拦截构建脚本，首次 `add` 报 `allowBuilds` 提示，需写进 profile 的 `pnpm-workspace.yaml` 后重跑（`apps/cli/reference/README.md:84`；`docs/user/develop/basic/publish.md:153-178`） |

「symlink 还是 copy」：本地目录走 pnpm `link:`（链接，非复制）；npm/tarball/git 安装进 profile 的 `node_modules`（profile 配置 `nodeLinker: hoisted`）。Windows 上是 junction 还是 symlink 由 pnpm 决定，**未验证**。

### 1.3 profile 与磁盘布局

`$DSH_HOME` 未设置时默认 `~/.dsh`（`docs/config-catalog.md:61,563`）。一个 profile 目录由 `initProfile()`（`packages/boot/app-boot/src/profile.ts:197-216`）创建，包含且仅包含：

```text
$DSH_HOME/
├── cordis.patch.yml            # home 级 patch，所有 profile 共享，优先级高于 profile 级
├── .credentials.yaml           # 凭据（只写）
├── settings.yaml               # 模型等设置
├── logs/                       # 启动诊断：startup-<timestamp>-<uuid>.log
├── profiles/
│   ├── node_modules/           # 安装级模块 fallback（缺失 peer 落到这里，共享一个 cordis 实例）
│   └── <name>/                 # 一个 profile
│       ├── package.json        # 依赖 + dsh.profile.bundles 有序列表
│       ├── cordis.patch.yml    # 本 profile 的用户 patch 层（初始为 `[]`）
│       ├── pnpm-workspace.yaml # packages: [.] / nodeLinker: hoisted / autoInstallPeers: false
│       ├── pnpm-lock.yaml      # pnpm 精确解析（首次 add 后出现）
│       ├── node_modules/
│       └── .plugin-manager/logs/   # 插件管理器操作诊断日志
```

profile 初始化写入的 `pnpm-workspace.yaml`（`packages/boot/app-boot/src/profile.ts:183-188`）：

```yaml
packages:
  - .
nodeLinker: hoisted
autoInstallPeers: false
```

注意：`dsh plugin --profile <非随附名>` 初始化出来的 profile **只有 `@deepseek-ai/dsh-base`，不含 web-app**——想验证 UI 必须让它先有 web 组合（见 §6.2）。随附模板为 `web` / `headless` / `sdk` / `sdk-minimal` / `acp`（`apps/cli/reference/README.md:13`）；自定义 profile 可用 `dsh --profile <name> --from-default-profile web` 从模板复制一份（`apps/cli/reference/README.md:15-17`）。

### 1.4 bundle vs 普通依赖；`cordis.patch.yml` 做什么

- **bundle** = 携带配置层的 npm 包：`package.json` 声明 `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`，patch 文件用**包名**引用插件行（`docs/user/develop/basic/publish.md:9-16,56-64`）。
- **profile** = 组合描述：`package.json` 的 `dsh.profile.bundles` 按顺序列出 bundle（`publish.md:66-73`）。
- 层叠顺序（后者按行覆盖前者，patch 替换整段 `config` 而非深合并）：`dsh.profile.bundles` 顺序 → profile 的 `cordis.patch.yml` → home 级 `$DSH_HOME/cordis.patch.yml` → 各 `--patch` overlay（`apps/cli/reference/README.md:9`；`docs/architecture.md:27`）。
- 空 patch 文件会让启动失败，要禁用该层必须写 `[]`（`packages/boot/app-boot/README.md:55`）。
- bundle-less 的包仍可安装，只作为普通依赖，不激活任何层（`publish.md:64`）。

### 1.5 版本固定、更新、卸载

- 固定：`add <pkg>@<exact-version>`；profile 的 `pnpm-lock.yaml` 锁精确解析；git 源用 `#<sha>` 钉住（`publish.md:173`）。
- 更新：`dsh plugin --profile <p> update <pkg>`（或 pnpm 的 `--latest`/`outdated`）；更新后 bundle 声明变化会重新对账层栈，但运行的 profile 要重启。
- 卸载：`dsh plugin --profile <p> remove <pkg>`，同时移除依赖与层（`publish.md:110`）。
- in-box bundle（`@deepseek-ai/dsh-base`、`@deepseek-ai/dsh-web-app` 等）永远从 dsh 安装本体解析，不随 profile 的 pnpm 版本走（`apps/cli/reference/README.md:11`）——因此「插件跟哪个 DSH 版本匹配」取决于你安装的 `dsh` 本身。
- 兼容声明：官方字段是 `engines.dsh`（SemVer range，与 `engines.node` 并列），但 `packages/util/package-manifest/README.md:91` 明说**当前安装器/加载器不强制 `engines.dsh` 或 `dsh.manifestVersion`**，声明不等于拒绝。注意本仓库 `packages/core/package.json` 目前用的是非官方键 `dsh.compatibility.dsh`，不会被任何官方 reader 读取（本仓库自查结论）。

---

## 2. DSH 内置插件管理（官方 manager）

官方包 `@deepseek-ai/dsh-plugin-manager` 随 base-backed profile 提供（`docs/architecture.md:31`；`packages/boot/plugin-manager/README.md:31`），三个面：

1. **Web 侧边栏 Plugins 页**（`ui-plugin-manager`）：列出 installation 自带（Official，含 Beta 标签）与 Installed 的 bundle；开关 bundle / 单行 row；**Add plugin** 接受「包名+版本 / Git 地址 / tarball / 绝对本地路径」，先 `inspect` 再安装，可看 pnpm 输出、取消、安装后 Enable now；卸载二次确认；安装脚本被 pnpm 拦时提供 **Allow these scripts and retry**（`packages/client/ui-plugin-manager/README.md:28-44`）。
2. **Settings → Plugins**：只读清单（`ui-settings-plugin-inventory`），插件自己的配置页由插件通过 `plugins.item` / `plugins.bundle.config` / `plugins.row.config` 三个 slot 注册到 Plugins 页（`ui-plugin-manager/README.md:48-58`）。
3. **`plugin_manager` 工具**（模型面）：与 UI 同一服务，Creator 模式下启用；每个动作要求 `danger-full-access` 或逐次审批（`plugin-manager/README.md:31-33`）。

机制要点：单行开关只改 profile `cordis.patch.yml` 中最后一条匹配覆盖项的 `disabled`（或追加）；bundle 开关改 `package.json` 的 `dsh.profile.bundles` 列表（停用保留依赖；启用追加到列表末尾，可能改变优先级）；安装默认启用新 bundle（`plugin-manager/README.md:40`）。已知限制：只管理 bundle；一次一个安装；没有版本选择器；**替换包代码要重启进程**；启动期 profile 不能删除正在使用的包（`plugin-manager/README.md:102-108`）。

**没有官方 marketplace**；也没有发现 `/plugin` 式斜杠命令——命令注册表（`packages/interaction/commands`）里 plugin-manager 没有注册任何命令（对其 `src/` 的负向 grep）。官方对生态的「官方动作」只有 README 里的一句：给插件仓库加 GitHub topic **`dsh-plugin`** 以便发现（DSH `README.md:46`）。

---

## 3. 社区插件管理器与生态现状

`gh search repos --topic dsh-plugin` 与关键词查询（2026-09-18）显示管理类插件不止一个：

| 项目                                                                   | 说明（README 口径）                                                                                                                                                                     | 类型             |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `dsh-market/dsh-market`（npm 包 `dshmarket@1.47.0`）                   | 「设置 → Plugin Market」浏览/搜索/一键安装；数据来自 awesome-dsh-plugin registry（2300+）；热停用/启用写 profile patch；备份恢复、更新、卸载、加载顺序、诊断；要求 dsh web ≥ 0.1.0-rc.6 | 完整市场+管理器  |
| `Noob-stupid/dsh-plugin-gating-hub`（原 `dsh-plugin-hub`）             | 插件管理面板 + 市场 + 自定义索引，一键启停；dsh-market README 明说其热启停机制「ported from dsh-plugin-hub」                                                                            | 管理器+市场      |
| `awesome-dsh-plugin/awesome-dsh-plugin`                                | 人工 curated 插件清单（`awesome-dsh-plugin.com/plugins.json`），dsh-market 的数据源；官方 README 认可 topic 发现法                                                                      | registry（清单） |
| `liqichen` / `webkong` / `imissthecat` 等一批同名 `dsh-plugin-manager` | 在 Settings/WebUI 内管理 MCP/Skills/内置或三方插件、启停安装卸载                                                                                                                        | 第三方管理器     |

**对我们 AGENTS.md 里点名的三个生态插件（一手 README 核对）：它们都只管自己的设置/凭据，不管理别的插件。**

- `xmanrui/dsh-im`：`dsh plugin --profile web add -w @xmanrui/dsh-im`，重启 `dsh web` + 刷浏览器，入口在「设置 → IM机器人」；凭据写 DSH credentials。
- `amlyczz/dsh-lark-link`：`dsh plugin --profile web add dsh-lark-link@latest --ignore-scripts`；桥自身命令 `/lark ...`；无插件管理面。
- `imetn/dsh-lark-bridge`：自带 `pnpm dlx github:imetn/dsh-lark-bridge setup --project "$PWD"` 安装器，写独立 `lark` profile 的 patch；README 标注 **tested with DSH 0.1.0-rc.6**；无插件管理面。

---

## 4. 客户端 UI bundle 的注册与加载

### 4.1 声明与构建

- 包在 `package.json` 声明 `"dsh": { "client": { "platform": "web", ... } }`，并导出构建好的 `./client`；`inject` 只是信息性包名边（预检/HMR diff），**不参与激活顺序**；`external` 声明非 baseline 的模块请求（`packages/util/package-manifest/src/types.ts:63-77`；`packages/client/AGENTS.md:142`）。
- 宿主半 `ctx.clientModules`（`@deepseek-ai/dsh-client-modules`）扫描**存活的 Loader entries** 中声明了 `dsh.client` 的包，组合 `window.__DSH_BOOT__` entry 图，经 `/plugins/??<pkg>/client.js&rev=<rev>` 提供 bundle；浏览器用 lazy-CJS 模块表加载，bundle 执行 `window.__ModuleLoader__.load({ id, factory })`（`docs/subsystems/client-modules.md:77-85`；`packages/client/modules/README.md:32-50`）。
- 共享模块 baseline 只有 React、Cordis 和静态 UI 库；第三方依赖必须打进 bundle（`packages/client/AGENTS.md:74-99`；也对应 `docs/botharness.md` §6 的「客户端事实」）。
- 构建契约：官方共享 tsdown preset 在 `packages/client/tsdown.client.ts`，但它 import `./modules/src/client/manifest.ts`、`./web/src/platform.ts`、`../../scripts/...`，是**仓库内部文件，不是已发布包**（pinned SHA 下的结论）；第三方只能照契约自建。`npm view @deepseek-ai/dsh-client-modules` 虽然能查到 0.0.1-rc.1，但那是模块系统本体，不是给第三方用的构建 preset。**未验证**是否存在别的官方发布渠道。
- 宿主服务的是**构建产物**（`lib/client.js` 之类），不会为 out-of-tree 包做构建；bundle 缺失会在激活时大声失败（`packages/client/modules/README.md:48-50`）。

### 4.2 UI 入口（panel）

- 插件在 root 作用域的 **`sidebar.panellist`** list 注册条目：`id`、可选 `order`、`label`（字符串或 locale-aware）；**同一个 `id` 寻址 layout root 作用域 `main` keyed slot 的组件**。选不存在的 main 条目会抛错。没有注册项时不渲染（`packages/client/ui-sidebar/README.md:36`）。
- `main` 树下另有官方插件管理器/设置用的具名 seat：`plugins.item`、`plugins.bundle.config`、`plugins.row.config`（`docs/subsystems/slots.md:131-134`）。
- Settings 域是 `sidebar.settings` / `settings.section` 等 seat；`settings.plugins.tab` 在树里（`slots.md:120-130`）。
- 注册用 `ctx.slots.register` / `ctx.slots.inject`（声明感知、随插件 fiber 回收），不要在模块级做副作用（`packages/client/AGENTS.md:143`）。

### 4.3 安装后如何验证 UI

- 重启 `dsh web`（bundle 成员变化不热生效）+ **刷新浏览器**（生产下客户端图由 index 注入，重载总是对实时组合）。社区安装文档（dsh-im）同样是「重启 + 刷新」。
- 查看：`window.__DSH_BOOT__.entries` 是否含我们的包名；Network 里 `/plugins/...` 是否 200；页面侧边栏/面板是否出现注册的 `sidebar.panellist` 条目。
- 失败姿态：客户端 bundle 声明畸形/缺失时，激活扫描聚合为 `AggregateError` 并让 fiber FAILED，boot 的 fail-loud sweep 上报（`docs/subsystems/client-modules.md:79`）；`$DSH_HOME/logs/startup-*.log` 落盘完整诊断（`apps/cli/reference/README.md:56`）；Settings → Plugins → Plugin list 显示浏览器侧同步失败并提供重试（`packages/client/modules/README.md:42`）。
- 热更新：HMR receiver 常驻但对已安装静态产物没用；只有开 HMR 的 profile 编辑 `cordis.patch.yml` 才热生效；`pnpm run dev:web` 只重建**本仓库源码**里的 client 插件（`apps/cli/reference/README.md:88`；DSH Web 系统提示也声明这一点）。改 out-of-tree 插件要重建该包再刷新/重启。
- `dsh --profile <p> --dump-config` 是安装后**不启动**的第一道验证：能看到 `# == <bundle 名>` 层与插入的行（`publish.md:106`）。

---

## 5. 安装验证的坑（含预览期破坏性变更）

1. **预览期无兼容承诺**：DSH README 原文「developer preview … THERE WILL BE COMPATIBILITY-BREAKING CHANGES」，且 `engines.dsh` 声明不强制（§1.5）。生态包已出现版本门：dsh-market 要求 ≥0.1.0-rc.6（自管理页需 rc.7）、dsh-lark-bridge 注明 tested with 0.1.0-rc.6。**验证门必须钉死一个 `@deepseek-ai/dsh` 版本。**
2. **Node/pnpm 要求**：DSH 本体 `engines.node = ^22.19.0 || >=24.0.0`，仓库 `packageManager: pnpm@11.7.0`（仓库根 `package.json`）；生态包有的要求 Node ≥24（dsh-lark-link）。我们 AGENTS.md 记录 WSL 用 fnm node + `corepack pnpm`（pnpm 12.4.2）。
3. **pnpm 构建脚本拦截**：git 源插件靠 `prepare` 构建，pnpm ≥10 默认拦；要在 profile 的 `pnpm-workspace.yaml` 写 `allowBuilds` 再重跑。`--ignore-scripts` 是绕行手段之一（dsh-lark-link 用它跳过 protobufjs 的 postinstall）。
4. **镜像 dist-tags 滞后**：`@latest` 可能因 npmmirror 等镜像 tag 未刷新而假「Already up to date」；显式 `@<version>`（必要时 `--registry https://registry.npmjs.org`）最可靠（dsh-lark-link README）。同类问题对 `dsh` 本身也可能成立。
5. **重启边界**：bundle 增删/更新后运行中 profile 不生效，必须重启；patch 编辑在 HMR profile 下才热生效（§1.1）。「安装成功 ≠ 能激活」（`ui-plugin-manager/README.md:34`）。
6. **bundle 列表顺序有语义**：启用新 bundle 追加在末尾，可能覆盖先前层；排查加载失败先看 `--dump-config` 的行来源注释。
7. **本地 link 的错觉**：`link:` 指向 checkout，改源码「看起来」即时，但宿主的 Node 侧 import 与客户端产物都不保证 freshness——源模式启动器明确说「不检查新鲜度，陈旧 bundle 会跑旧浏览器代码」（`apps/cli/reference/README.md:119`）；客户端产物必须重构建。
8. **日志位置**：启动失败看 `$DSH_HOME/logs/startup-<timestamp>-<uuid>.log`（含失败插件、原始栈、pending/missing services、Node/DSH 版本；报告含未脱敏配置值，勿直接外发）；插件管理操作看 profile 下 `.plugin-manager/logs/`；浏览器侧同步失败在 Settings 插件列表。
9. **monorepo/本地 workspace**：相对 spec 锚定调用目录，要从**声明 `dsh.bundle` 的那个包目录**安装；直接 `add .` 装到的是仓库根（无 bundle 声明 → 只会得到「bundle-less dependency」警告，不会激活）。profile 自带 `pnpm-workspace.yaml`，`-w`（pnpm 的 `--workspace-root`）语义**未实测**。
10. **安全**：安装脚本以宿主用户权限、在 agent 沙箱之外执行；M8 规则（never commit secrets）同样适用于插件配置与凭据。

---

## 6. 对 M3.5 安装验证门的建议

### 6.1 推荐方式与前置

- **方式**：用 **npm 安装的 DSH（钉 `0.1.5-rc.2`，与 `packages/core` 的 devDeps/peer 对齐）** + **独立 `DSH_HOME`** + **本地路径 `link:` 安装我们的包**，装进一个**从 `web` 模板派生**的专用 profile（不要占用日常 `web` profile，也不要只 `dsh plugin` 直接建 profile——那只有 base，没有 UI）。
- **前置**：WSL 里 fnm node（≥22.19，建议 24.x）+ `corepack pnpm`；仓库先 `pnpm install && pnpm build`（`packages/core` 的 `main` 指向 `dist/`，`files` 含 `dist`，不构建则 boot 时 import 失败）；装的是 `packages/core`（当前唯一声明 `dsh.bundle` 的包），M3 之后换成 `deepseekbot` bundle 包。

### 6.2 精确命令（WSL，bash）

```bash
# 0) 隔离环境与版本钉死
export DSH_HOME="$HOME/.dsh-m35"
node --version                          # >= 22.19（建议 24.x）
npm i -g @deepseek-ai/dsh@0.1.5-rc.2    # 或 npx @deepseek-ai/dsh@0.1.5-rc.2 ...
dsh --version

# 1) 建一个带 Web 的专用 profile（复制随附 web 模板：base + web-app）
cd ~/project/DeepSeekBot                # 插件仓库 checkout
dsh --profile botharness --from-default-profile web
dsh botharness --dump-config | head     # 确认 base/web-app 层已就位

# 2) 安装我们的 bundle（相对路径锚定当前目录；官方形式，无需 -w）
pnpm build                              # 仓库自身构建（产物进 packages/core/dist）
dsh plugin --profile botharness add ./packages/core
dsh plugin --profile botharness list    # pnpm 透传：看 @botharness/core link:...
dsh --profile botharness --dump-config | grep -A2 botharness   # 看到 "# == @botharness/core" 层

# 3) 启动与验证
dsh botharness                          # 等价 dsh --profile botharness；默认 http://127.0.0.1:3080
# 浏览器验证（见 6.3 c）

# 4) 升级 / 重装路径（验证 link 与重启边界）
pnpm build && dsh plugin --profile botharness update @botharness/core || true
# 或换 npm/tarball 分发形态：pnpm pack && dsh plugin --profile botharness add ./botharness-core-*.tgz
```

> 若坚持复用 `web` profile：`dsh plugin --profile web add ./packages/core && dsh web`，步骤等价，但污染日常 profile，不推荐作为 gate 环境。`packages/core` 目前 `private: true`，本地 `link:` 不受影响；将来走 npm 发布需去掉 private 并补 `publishConfig`。

### 6.3 检查点（a）–（d）

**(a) 本机跑起 DSH** —— 建议首次成功即记录为 gate 基线。

- `npx @deepseek-ai/dsh web --no-open`（或上面的专用 profile）起服务，`http://127.0.0.1:3080` 可打开；`$DSH_HOME/profiles/botharness/` 出现 `package.json` / `cordis.patch.yml` / `pnpm-workspace.yaml`。
- 证据：URL、截图、`dsh --version`、`node --version`、pnpm 版本。

**(b) 安装插件** —— 命令侧证据先于 UI。

- `dsh plugin --profile botharness add ./packages/core` 退出码 0，无「bundle-less dependency」警告。
- `package.json`：`dependencies["@botharness/core"] = "link:..."`，`dsh.profile.bundles` 含 `@botharness/core`。
- `--dump-config` 出现 `# == @botharness/core` 层注释与 `id: botharness-core` 行。

**(c) 插件加载 + UI 显示** —— 重启后验证。

- 重启 `dsh botharness`；启动无 FAILED fiber；`$DSH_HOME/logs/` **没有**新增 `startup-*.log`；Settings → Plugins 清单含该 bundle。
- 浏览器：`window.__DSH_BOOT__.entries` 含 M3 的客户端包名（M3 前 core 无 `dsh.client`，此步只验宿主；M3 后必须验）、Network `/plugins/...` 200、侧边栏/面板出现注册条目（`sidebar.panellist` + `main`）、console 无报错。
- 反向验证：在官方 Plugins 页把该 bundle 关掉再开，确认行消失/恢复（`disabled` 写入 profile patch）。

**(d) 装完/重装后可用** —— 跑 M3 验收路径并覆盖重启。

- 创建/列出 PersonaBot、跑一次委派（M3 scope），重启 `dsh botharness` 后 bot.json/记忆仍在。
- 重装/升级一次（重新 `add`/`update` 或换 tarball），重复 (c) 的关键断言——证明「安装态」而不是「源码态」可用。
- 记录偏差：若 `--from-default-profile` 模板清单随 DSH 版本漂移，记 DSH 版本与 profile bundle 列表快照。

### 6.4 当前仓库需先补齐的差距（gate 之前）

1. `packages/core` 的 `dsh.compatibility.dsh` 是自造键，官方 reader 不读；若要声明兼容性应改为官方 `engines.dsh`（当前反正不强制，可先记 issue）。
2. `deepseekbot` bundle 包尚不存在；M3 的 `@botharness/client` 将需要 `dsh.client` + `exports["./client"]` 构建产物。M3.5 的安装对象建议确定为一个 `deepseekbot` bundle（内部依赖 core/client），避免逐包安装的顺序与层叠问题。
3. 安装前必须有本仓库构建（`dist/`），且客户端产物必须提交进包或随 tarball 分发——宿主不会为插件构建。

---

## 7. 未验证 / 待确认

1. **本次未实测安装**：以上机制来自 pinned SHA 的源码/官方文档与生态 README；「重启+刷新后 UI 必然出现」属文档推导，等 M3.5 实测。
2. `-w` 在 pnpm 11/12、Windows/WSL 下对 profile workspace 的确切必要性未实测；官方教程不带 `-w`。
3. out-of-tree（profile `node_modules` 里）客户端包是否与 in-tree 一样被 `dsh.client` 扫描：文档说「扫描存活 Loader entries」，dsh-im/dsh-market 的成功实践可作旁证，但上游文档没有专门断言 out-of-tree 情形。
4. 第三方 client bundle 是否有官方发布的构建 preset：pinned SHA 下 `packages/client/tsdown.client.ts` 为仓库内部文件；registry 上 `@deepseek-ai/dsh-client-modules@0.0.1-rc.1` 不代表 preset 可用。
5. 社区管理器（dshmarket、dsh-plugin-gating-hub 等）只读了 README，未审计源码与更新/回滚路径；不应直接用于 gate。
6. `link:` 在 Windows 上是 symlink 还是 junction、pnpm 版本差异，未验证。
7. DSH 官方 marketplace/斜杠命令的**不存在**是负向 grep 结论（commands registry + plugin-manager 源码），随预览期演进可能变化。

---

## 8. 一手来源与访问日期

| 来源                                                                                | 支撑内容                                                                                                                                                                                                              | 访问日期   |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| https://github.com/deepseek-ai/deepseek-harness                                     | 项目定位、`npx @deepseek-ai/dsh web`、developer preview 警告、topic `dsh-plugin`（README.md）                                                                                                                         | 2026-09-18 |
| https://deepseek-harness.github.io/deepseek-harness/develop/basic/ 及 `/publish`    | 官方文档站（与仓库 `docs/user/develop/basic/*.zh.md` 同源）：插件三形态与 patch overlay、bundle/profile 两种 manifest、`dsh plugin add` 示例与 `--dump-config`、层序、git 安装的 `allowBuilds` 门槛、npm/tarball 分发 | 2026-09-18 |
| 同上 · `apps/cli/reference/README.md:9,13,15,56,64,76,84,88,119`                    | profile boot、`dsh plugin` 转发/对账、模板、启动诊断日志、git 构建拦截、重启边界、HMR                                                                                                                                 | 2026-09-18 |
| 同上 · `apps/cli/src/args.ts:171-181`                                               | `plugin` 命令与强制 `--profile`                                                                                                                                                                                       | 2026-09-18 |
| 同上 · `apps/cli/src/plugin.ts:1-22`                                                | `dsh plugin` 复用 plugin-manager operations、allowBuilds 提示                                                                                                                                                         | 2026-09-18 |
| 同上 · `docs/user/develop/basic/publish.md:9-16,56-64,66-73,77-110,114-126,153-178` | bundle/profile 两套 manifest、安装示例、层序、GitHub 安装与构建许可                                                                                                                                                   | 2026-09-18 |
| 同上 · `packages/boot/app-boot/src/profile.ts:183-216`                              | profile 初始化文件与 `pnpm-workspace.yaml`/`cordis.patch.yml` 内容                                                                                                                                                    | 2026-09-18 |
| 同上 · `packages/boot/app-boot/README.md:50-63`                                     | profile 位置、patch 层语义（空文件失败/`[]` 禁用）                                                                                                                                                                    | 2026-09-18 |
| 同上 · `packages/boot/plugin-manager/README.md:31-46,102-108`                       | 官方管理器三面、开关/安装机制、重启与限制                                                                                                                                                                             | 2026-09-18 |
| 同上 · `packages/client/ui-plugin-manager/README.md:28-58,80`                       | Web Plugins 页安装/切换/配置 slot、客户端半随 Loader 行生命周期                                                                                                                                                       | 2026-09-18 |
| 同上 · `packages/client/ui-sidebar/README.md:36`                                    | `sidebar.panellist` + root `main` keyed slot 注册机制                                                                                                                                                                 | 2026-09-18 |
| 同上 · `docs/subsystems/slots.md:107-135`                                           | slot 层级（`main`/`plugins.*`/`settings.*`）                                                                                                                                                                          | 2026-09-18 |
| 同上 · `docs/subsystems/client-modules.md:5-11,77-85,101`                           | `dsh.client` 扫描、`__DSH_BOOT__`、`/plugins` 路由、HMR `rebuilt()`                                                                                                                                                   | 2026-09-18 |
| 同上 · `packages/client/modules/README.md:32-50`                                    | 客户端声明、bundle 构建要求、共享模块 baseline、Settings 同步失败                                                                                                                                                     | 2026-09-18 |
| 同上 · `packages/client/AGENTS.md:74-99,136-145`                                    | 客户端新包清单、三方依赖必须内联、`dsh.client.inject/external` 语义                                                                                                                                                   | 2026-09-18 |
| 同上 · `packages/util/package-manifest/src/types.ts:28-77` + `README.md:91`         | `dsh.bundle/profile/client`、`engines.dsh`、声明不强制                                                                                                                                                                | 2026-09-18 |
| 同上 · `docs/architecture.md:19,27,31,53`                                           | profile 定义、层序、内置管理器、Desktop 保留 profile                                                                                                                                                                  | 2026-09-18 |
| 同上 · `docs/config-catalog.md:61,563`                                              | `$DSH_HOME` 默认 `~/.dsh`                                                                                                                                                                                             | 2026-09-18 |
| `npm view @deepseek-ai/dsh version dist-tags engines`                               | 0.1.5-rc.2 (latest/next) / 0.1.6-alpha.2 (alpha)；Node/pnpm 要求                                                                                                                                                      | 2026-09-18 |
| 上游仓库根 `package.json`（pinned SHA）                                             | version 0.1.6-alpha.2、engines.node、packageManager pnpm@11.7.0                                                                                                                                                       | 2026-09-18 |
| https://github.com/xmanrui/dsh-im                                                   | 安装命令（`add -w`）、重启+刷新、设置入口、仅管自身设置/凭据                                                                                                                                                          | 2026-09-18 |
| https://github.com/amlyczz/dsh-lark-link                                            | npm/`--ignore-scripts` 安装、镜像 tag 风险、升级与重启                                                                                                                                                                | 2026-09-18 |
| https://github.com/imetn/dsh-lark-bridge                                            | 自带安装器、独立 lark profile、tested with DSH 0.1.0-rc.6                                                                                                                                                             | 2026-09-18 |
| https://github.com/dsh-market/dsh-market（`gh api` 校验）                           | 第三方市场/管理器能力、dsh ≥ rc.6/rc.7、数据源 registry、热启停机制来源                                                                                                                                               | 2026-09-18 |
| https://github.com/Noob-stupid/dsh-plugin-gating-hub（`gh api` 校验）               | 社区管理器/市场与热停用来源（原 dsh-plugin-hub）                                                                                                                                                                      | 2026-09-18 |
| https://github.com/awesome-dsh-plugin/awesome-dsh-plugin                            | curated 插件清单/registry（dsh-market 数据源）                                                                                                                                                                        | 2026-09-18 |
| `gh search repos --topic dsh-plugin` / `"dsh plugin manager"`                       | 社区管理器与生态规模（存在性证据；未审计源码）                                                                                                                                                                        | 2026-09-18 |
