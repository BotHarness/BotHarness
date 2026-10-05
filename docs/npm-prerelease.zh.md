# 准备首个 npm prerelease

这是 #866 的发布操作路径，承接 [#823](https://github.com/BotHarness/BotHarness/issues/823)
的打包安装验收和 [#824](https://github.com/BotHarness/BotHarness/issues/824) 的真实 Lark 引导。
准备产物不等于公开发布，也不部署网站。

## 首轮版本提案

建议审阅 `0.1.0-alpha.1`，使用 npm `next` 标签。版本在 Human 发布批准前仍是提案。
四个预编译包按以下顺序发布：

1. `@botharness/im-provider@4.32.0-botharness.3`，保留独立 Provider 版本；
2. `@botharness/core@0.1.0-alpha.1`；
3. `@botharness/ui@0.1.0-alpha.1`；
4. `deepseekbot@0.1.0-alpha.1`，通过精确依赖组合一个产品 Bundle。

首轮不发布可选 Computer／Browser Bundle。维持已验收 Provider 的固定源码；上游 PR
合并不代表替换版本已经资格验证。DSH 支持范围仍以 `0.2.0-rc.1` 为准。

源码包保留 private／0.0.0；已有打包器在独立暂存目录产生公开 manifest 和预编译入口，
保留 MIT、Provider attribution 和 `PROVENANCE.json`，不打包账号、凭据、Binding 或 Grant。

## 正式版本

`0.1.0-alpha.1` 已发布。同一组 workflow 现在也可以发布 `1.0.0` 这样的正式 SemVer：
正式版本的计划记录 dist-tag `latest`，alpha、beta、RC 版本记录 `next`；发布时需要输入
字面确认 `publish <version> to <tag>`（例如 `publish 1.0.0 to latest`）。正式版本发布后，
还会把 Core、Client 与产品包的 `next` 移到同一版本，避免 `deepseekbot@next` 落后于
`deepseekbot`。Provider 保持独立版本；字节完全一致的已发布版本会被跳过。

## 无凭据准备

在 main 手动运行 **npm prerelease preparation**，填写拟发布版本。它检查、构建精确版本，
下载并验证不可变 Provider 输入，产生四个 tarball。涉及发布代码的 PR 会生成独立的
`0.1.0-alpha.1-preview.<PR>.<run>` 版本，避免与公开的不可变版本冲突；PR run 不能成为公开发布来源。

下载 `npm-prerelease-<version>`，审阅 `release-plan.json`、`artifacts.json` 和 tarball。
记录 run ID、main SHA、版本和 summary 中的 plan SHA-256。plan 绑定源码、DSH、Provider、
发布顺序和清单摘要；清单绑定每个 tarball 的 SHA-512。验证器核对包内 manifest、精确产品
依赖、入口、原生 Bundle Patch、Provider 来源和 registry 依赖，并在无 token 下执行四包
`npm publish --dry-run --ignore-scripts`。本地有未提交修改的准备结果会明确标记，不能发布。

安装锁定依赖并完成构建后，本地演练：

```sh
node scripts/npm-prerelease.mjs prepare --version 0.1.0-alpha.1 \
  --provider-source /path/to/qualified-provider --output /path/to/fresh-artifacts
node scripts/npm-prerelease.mjs verify --artifacts /path/to/fresh-artifacts
```

输出目录必须全新。Provider 需要通过禁止安装脚本的方式安装锁定依赖，暂存时重建 managed
Host／Client 入口。打包不占用其他 session 的 Provider checkout，也不重启共享 receiver。

## 发布前审阅

审阅实际产物、首轮功能范围、兼容与升级风险、release notes 和证据限制。#824 新增群选择器
仍缺最终窄屏／浅色／英文复查，历史截图和自动检查不能替代这项验收。确定版本并获得 Human
发布批准后再触发 publisher。

BotUI 的 repository secret 不会自动共享给 BotHarness。需要在 **BotHarness/BotHarness**
提供 `NPM_TOKEN`，或显式授权组织 secret。它应具备四个包名的发布权限（包括无 scope 的
`deepseekbot`），以及 npm 要求的非交互 2FA 权限；存在 token 不证明能发布。
凭据值只放 GitHub secret，不放源码、产物、命令、日志或 issue；不读取 BotUI 本地 token 文件。

## 明确发布与读回

Human 批准后，从 main 手动运行 **publish reviewed npm prerelease**，输入成功的 main 手动
preparation run、源码 SHA、版本、审阅过的 plan SHA-256，以及 `publish <version> to <tag>`（正式版本为 `latest`，预发布为 `next`）。
首次发布的 SHA 必须仍是当前 main；main 前进后重新准备、审阅。
已部分发布的版本适用下方显式恢复例外，保留原已批准的 source 和字节，不重建不可变版本。

publisher 核对 preparation 的 workflow、事件、分支、成功状态和 SHA，下载原产物并在无
发布凭据下校验、演练。只有最后发布步骤收到 `NPM_TOKEN`。不重建，不因 push、tag、merge
自动发布。依赖先于产品，使用 public access 和计划中的 dist-tag。每包发布后读回
registry integrity；权限或网络失败立即停止，不盲目重试结果不明的发布。

宣称 prerelease 可用前，独立核对四包版本、integrity 和 `next` 标签，再从公开 registry
使用原生 `dsh plugin --profile <name> add deepseekbot@<version>` 安装到全新隔离 Profile。
检查唯一 Provider、真实 Client、初始未连接账号、可用模型和已授权 Lark 收件／同话题回复。
这项**公开 registry 安装验证仍待后续执行**，之前的本地 tarball 替换不算公开发布证据。

根据[发布规则](agents/changelog.md)将公开产物与验收、发布说明写入双语 Release Ledger。
具体版本获准前保持 `Unreleased`；tag／GitHub Release 另行授权，prerelease ledger 必须引用
真实 tag 和可下载产物。本 workflow 不创建 tag／GitHub Release，也不部署网站。

## 部分发布恢复

发布到一半后若 main 已推进，从当前 main 手动运行同一 publisher，设置 `resume_partial=true`，
沿用原已批准的准备 run、source、版本、plan 摘要和 confirmation。仅接受成功的手动 main
准备记录，其 source 必须是当前 main 的祖先，原 plan 必须标记干净，且已公开至少一个
Core、Client 或产品包，并与审阅产物的 SHA-512 完全匹配。可复用的独立 Provider 本身不能
证明某个产品版本已部分发布。所有已有版本都必须匹配；registry 不可读或任一字节冲突，
都会在提供发布凭据前拒绝恢复。workflow 检出原审阅 source，使用其验证／发布脚本，
不重新构建。当前 main 的新功能留给后续版本。

npm 多包发布不是原子的。首次发布前检查全部已有版本及直接运行依赖。中断后先查 registry，
再用同一组审阅过的产物恢复；已有版本仅在完整性完全一致时跳过。同版本不同字节会停止整轮，
应改用新的已审阅版本，不覆盖。产品最后发布，避免内部依赖失败却已公开产品。
宣布完成前另行检查标签；跳过已有匹配版本不会偷偷修改标签或降级。

回退代码使用之前验收的产品组合和获准的 Profile 备份流程；不能撤销外部已发送消息，也不能
通过包回退降级 canonical database generation。修复安装不删除凭据／历史。启用产品前移除
冲突的 standalone Provider／Core／Client Bundle，切换产物前停掉精确归属的 Host。

参考：[DSH Bundle 发布](https://deepseek-harness.github.io/deepseek-harness/develop/basic/publish)、
[npm publish](https://docs.npmjs.com/cli/v11/commands/npm-publish/)、
[BotUI release 参考](https://github.com/BotHarness/BotUI/blob/dee41211aca0da71fe60206b5099283361fdb75a/scripts/release.mjs)、
[产品验收](product-im-installation.md)。
