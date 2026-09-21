# DSH 官方 computer-use、Cua Driver 与社区插件实现调研

日期：2026-09-21

问题：官方 DSH 在 `0.1.6-alpha.x` 引入了 `ctx.computerUse` 与 Cua Driver provider；社区已有 13+ 个 `dsh-computer-use` 插件。本文回答：官方做了什么/没做什么、Cua Driver 到底是什么、社区有哪些可迁移的工程模式，以及对 BotHarness 容器化 computer-use 插件计划的修正。只做调研，不产生决议。

## 来源基线

- 官方基线：`deepseek-ai/deepseek-harness` tag `dsh-v0.1.6-alpha.2`（commit `ddefc45f`，master 与之一致）；`0.1.5-*` 及更早**不存在** `packages/computer-use/`。
- 上游基线：`trycua/cua` tag `cua-driver-rs-v0.28.0`（DSH 精确 pin `@trycua/cua-driver@0.28.0`）。
- 社区：对 8 个最高信号仓库做 clone 级源码阅读（结论标注代码级 / README 级）。
- 相关文档：`docs/research/2026-09-21-computer-use-vnc-persistent-login.md`（VNC/持久化/接管）、`docs/research/2026-09-21-personabot-computer-and-live-view.md`（生态与平台 seam）。

## 结论摘要

1. **官方 `ctx.computerUse` 只做一件事：独占一个 provider 注册槽**。`register(name)` 返回 Cordis effect disposer；第二次注册（即使同名）直接抛错；provider 必须先停工具准入、关资源、等自有工作结束，再释放注册。**没有任何通用 action API、Session broker、桌面所有权、模型可控的 provider 选择器**——官方 note 明确把 observe-act-verify 工作流协调留给 caller（"Concurrent Sessions remain caller-coordinated"）。
2. **工具面完全由 provider 透传**：DSH 自己一个 computer tool 都不定义。官方两个 provider 都是把上游 Cua Driver 的完整工具目录注册成 DSH tools；`mcp` 版走 MCP stdio 连外部可执行文件，`native` 版把 `@trycua/cua-driver@0.28.0` 同进程加载。provider 的安装、平台权限、版本、平台限制**都归上游/部署**。
3. **截图路径值得直接复用**：MCP/native 共用 `createMcpToolDefinition`，把 image block 经「attachment store 挂载 + 当前路由 `inputModalities` 含 image」双重能力门控后落成 `{type:'image', attachment}`；**base64 永不进 Session 事件**；失败降级为 `[image unavailable: …]` 文本诊断，不伪装成功。spill 只服务文本，不用于图片。
4. **取消是"停止等待 + 向下游透传"，官方明确不承诺回滚**：`tools/execute` waterfall 把 caller signal 与 provider lifetime signal 用 `AbortSignal.any` 融合，卸载顺序是「摘工具 → abort → 等 pending 结算 → 关 SDK → 释放注册」。取消后已投递的桌面输入不会撤销，重试前必须重新观察。
5. **官方没有任何 Client/UI**：VNC 观看、人类接管面板、per-PersonaBot 归属全部空缺；连 Electron 桌面版 note 都写着上线前需要"认证 broker"。**我们计划中的"人看 VNC 画面"部分在官方零先例，必须自建**。
6. **Cua Driver 是"背景式桌面驱动"**：MCP/CLI/Python/TS 四种入口共享同一 Rust typed contract；工具词汇表的核心是 `get_window_state`（AX 树 + PNG 同帧、`element_token` 绑定快照）、`delivery_mode: background|foreground`、`verify_state`（satisfied/unsatisfied/unknown）、`zoom`、`invoke_menu`、`clipboard_*`、录制/回放、`health_report`；**没有独立 screenshot、没有 shell/文件**（后者在 `cua-computer-server`）。
7. **Linux X11 是正式支持目标，容器路线有官方镜像但非正式 validation lane**：`libs/xfce-cua` 提供 XFCE+TigerVNC+noVNC+Firefox+Driver 的 Docker 镜像（pin 还是 0.12.4）；**Xvnc/Xvfb 无 `/dev/uinput`，背景 raw-pixel（MPX）不可用**，必须走 AT-SPI 语义或 `foreground`；AT-SPI 需要 session bus + a11y bus + 以桌面用户运行；npm 平台二进制只有 glibc（无 musl）。
8. **最轻的集成长这样**：DSH 的 MCP provider 用 `command`+`args` 启动 stdio 子进程且不经 shell，因此可以直接 `docker exec -i … cua-driver mcp` 指向容器（未端到端实测）；`cua-computer-server --backend vnc` 还能直接以 RFB 驱动远端桌面（仅 screen/pointer/scroll/keyboard），是更轻的候选。
9. **对我们计划的硬约束（来自官方单槽语义）**：`ctx.computerUse` 全局只能有一个 provider，**"每个 PersonaBot 一台电脑"无法用它直接表达**。合理做法是 BotHarness 注册**一个 router provider**（内部持有 PersonaBot→容器注册表），把并发/归属/租约留在我们自己的层——这正好符合官方"provider 不拥有 workflow"的边界。
10. **社区插件的最高价值模式**（可迁移到容器路线）：observation lease + 新鲜度校验（TTL + window/pid + tree hash + pixel hash）、**人类输入使观察失效**、截图能力门控与 attachment、审计 SessionEvent + turn 生命周期清理、`tools/pre-execute` 分类器式审批、canvas↔物理坐标契约、e-stop、overlay"人可见、模型不可见"、settle loop + 诚实 effect 报告、渐进暴露 + Skill 门控。**要避免**：把宿主 OS 私有输入通道当核心、外部驱动版本耦合、spawn-per-call、无 approval、自建 confirm 绕过 `ctx.approval`、为 parity 复刻整套私有协议。

## 1. 官方子系统（`0.1.6-alpha.2`）

### 1.1 服务契约（`packages/computer-use/computer-use/src/index.ts`）

```ts
export class ComputerUseRegistry extends Service {
  private registration: ComputerUseProviderName | undefined;
  get providerName(): ComputerUseProviderName | undefined {
    return this.registration;
  }
  register(name: ComputerUseProviderName): () => Promise<void> {
    if (this.registration !== undefined)
      throw new Error(`computer use provider "${this.registration}" is already registered`);
    return this.ctx.effect(() => {
      this.registration = name;
      return () => {
        this.registration = undefined;
      };
    }, 'computerUse.register()');
  }
}
```

- 服务"无配置、无不变式伴生对象"，只有一个权威字段；不依赖任何 provider。
- 卸载失败（provider shutdown 抛错）会让注册永久占用，官方建议重启 host 再切 provider。
- 官方同时提供 `docs/subsystems/computer-use.md` 与 note `2026-09-12-computer-use-provider-registration.md`，其中 Alternatives 明确拒绝：统一 action API、只做外部 MCP、只做内嵌 native、Session ownership broker。

### 1.2 两个 provider 的差异

|                 | `computer-use-cua-driver-mcp`                                                              | `computer-use-cua-driver-native`                               |
| --------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| 运行时          | 外部 `cua-driver` 可执行文件，MCP stdio（`failOnStartupError: true`）                      | `@trycua/cua-driver@0.28.0` 同进程（UniFFI）                   |
| 配置            | `command`（默认 `cua-driver`）、`args`（默认 `['mcp']`）、`toolCallTimeoutMs`、`reconnect` | 无配置字段                                                     |
| 注册时机        | 先占槽，再起子进程（重复 provider 不会启动第二个进程）                                     | 先占槽，再动态 import（占用时不加载）                          |
| 工具名          | `mcp__cua-driver-mcp__<rawName>`                                                           | `cua_driver_native__<rawName>`（校验 `^[A-Za-z0-9_-]{1,64}$`） |
| 崩溃影响        | 独立进程，隔离较好                                                                         | 崩溃可能带走 DSH Host 进程                                     |
| 适合 BotHarness | ✅ `docker exec` 指向容器                                                                  | ❌ 只能操作运行 DSH 的机器                                     |

native provider 额外注入一段 guidance 系统提示（先 `get_window_state`、旧 `element_token` 失效、拒绝不等于授权 foreground 重试、取消不回滚），且**不自动加载上游 skill**。

### 1.3 工具与截图

- 官方不定义工具；工具目录 = 上游 `listToolsJson()` 全集（上游文档 ~56–60 个，`contract/manifest.json` 的 portable subset 为 28–29 个，两处不一致，标注未验证）。
- 截图：`get_window_state`（默认返回 AX 树 + PNG，`include_screenshot` 是性能开关）、`get_desktop_state`（整屏）、`zoom`（区域 JPEG）、`verify_state(include_screenshot)`；**没有独立 `screenshot` 工具**（上游 CLI reference 原文："no standalone screenshot tool"）。
- 图片准入链（`packages/mcp/mcp-client/src/tools.ts`）：MIME 白名单（png/jpeg/webp/gif）→ canonical base64 校验 → `ctx.attachments` 存在 + 路由 model 声明 image 输入 + 未 abort → `attachments.saveImages()` → `{type:'image', attachment}`。默认限制：单图 20 MiB、单消息 20 张 / 200 MiB、单图 64M px / 8192 长边；入库规范化到 2048² 与 ~4 MiB 目标。上游另有 1568 px 长边默认降采样。
- 取消：`tools/execute` waterfall 融合 signal + `pending` 集合；卸载顺序「摘工具 → abort → allSettled(pending) → shutdown → uniffiDestroy → 释放注册」。

### 1.4 发行与边界

- 两个 provider 属于 `packages/experimental/*`，默认公开（denylist 为空）、`publishConfig.access: public`，已发 npm alpha；**release 包禁止依赖实验包**。
- 官方明确 deferred：运行时切换 driver、统一 action 抽象、macOS cursor overlay 托管、专用桌面权限 UI、VNC/屏幕面板、"authenticated broker"（Electron 版）。

## 2. Cua Driver 上游（`cua-driver-rs-v0.28.0`）

- **定位**：只负责"操作某台机器的桌面"，不提供 shell/PTY/文件（那些在 `cua-computer-server`）；MIT（native `.node` 为 MPL-2.0）；默认开启 PostHog EU 无内容 telemetry 与 GitHub 更新检查（可用 `CUA_DRIVER_RS_TELEMETRY_ENABLED=false` / `CUA_DRIVER_RS_UPDATE_CHECK=false` 关闭）；**Driver 本身不需要云账号**。
- **词汇表精华**：`get_window_state`（树 + 截图 + `element_token`）→ 动作携带 token 或坐标 → `delivery_mode: background|foreground` → `verify_state`（unknown ≠ 成功）→ 结构化 refusal（`background_unavailable` 等是契约不是失败）→ `health_report` 做 preflight。
- **平台**：macOS 14+（TCC Accessibility + Screen Recording，按 responsible app identity 授予）；Windows 10/11（需交互式桌面会话，SSH/Session 0 有坑）；**Linux X11 Supported with limits**（AT-SPI over D-Bus、必须以桌面用户运行；背景 raw pixel 需要 real Xorg + `/dev/uinput`）；Wayland 需 opt-in 且按 compositor 分级。
- **容器路线**：官方 `libs/xfce-cua` 镜像（XFCE + TigerVNC `:1` + noVNC 6901 + Firefox ESR + ffmpeg + Driver，`ENV DISPLAY=:1`、`VNC_PW`、uid 1000），README 明说 Driver 不自动启动、生命周期归 client；镜像 pin 0.12.4（落后）。**Xvnc 下 MPX/背景像素不可用 → AT-SPI 语义或 foreground**；AT-SPI 需要 session bus + a11y bus + 同用户，空树会诚实报 `degraded`。npm 平台包只有 linux x64/arm64 glibc。
- **两条更轻的旁路**：`cua-computer-server --backend vnc --vnc-host …`（以 RFB 驱动远端桌面，仅 screen/pointer/scroll/keyboard）；`--backend cua-driver`（同进程委托）。
- **对比 Anthropic demo**：后者是「单个 `computer` 工具 + action 枚举 + Docker 内 xdotool + VNC」，只有 foreground、无 AX/token/verify；Cua 的差异化（no-foreground）在**私有容器里价值最低**，因为不需要保护用户桌面。

## 3. 社区插件：可迁移模式与反模式

### 3.1 可迁移（按价值排序）

| 模式                                       | 出处（代码级）                                                                                                                                                                                                                                                                                      | 容器/VNC 路线的映射                                                                                 |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **observation lease + 多重新鲜度校验**     | `PerryLink/dsh-click`（TTL 30s + window identity + tree hash + pixel hash + 动作前后 pid/exe 比对）；`Anionex/dsh-computer-use`（`observationId` + `expiresAt` + generation + rebind）                                                                                                              | VNC 下人与 bot 共用桌面：动作前必须证明"我看到的还是现在"；哈希/身份校验可直接照抄语义              |
| **人类输入使观察失效**                     | `wushi2333`（low-level hook 区分注入/真人输入，真人一动 lease 变 dirty）；`Anionex`（read grant 持久 Session、control grant 仅当前 turn）                                                                                                                                                           | 我们的"人类接管"信号：VNC 侧收到人类输入事件（或 takeover 按钮）→ 作废当前 observation + 暂停 agent |
| **截图 → attachment + 能力门控**           | 官方 `createMcpToolDefinition`；`PerryLink`、`Anionex`、`988hj7tczd`、`AzaiSakura` 同款                                                                                                                                                                                                             | 直接复用 DSH 的 attachment/llm seam；无 image 能力时降级为路径/文本                                 |
| **审计 SessionEvent + turn 生命周期清理**  | `PerryLink`（`dsh-click/observed                                                                                                                                                       / `dsh-click/action` + known-type 门控）；`AzaiSakura`/`wushi2333`（`turn/end` 释放 daemon session/overlay） | "turn 结束 → 释放观察 lease / 光标 overlay / VNC 写入权"                                            |
| **`tools/pre-execute` 分类器式审批**       | `SamXiaBing/dsh-adb`（纯函数分类 → `{kind:'ask'}`，无 approval 服务时天然 fail-closed）                                                                                                                                                                                                             | 比在每个工具里写 approval 更集中、可测；危险动作（删除/支付/密码框）走 `ctx.approval`               |
| **canvas↔物理坐标契约 + snapshot_id 防呆** | `JohnXu22786/computer-control`（截图统一缩放，模型只在 canonical canvas 给坐标；旧 snapshot_id 直接 stale）                                                                                                                                                                                         | 容器截图必然缩放，坐标契约必须显式                                                                  |
| **e-stop 三重 + 画面内 STOP 角标**         | `JohnXu`（全局热键 / 协议 panic / panic file + banner）                                                                                                                                                                                                                                             | 容器版 = 宿主侧 pause/kill + VNC 画面角标 + 工具内检查                                              |
| **overlay「人可见、模型不可见」**          | `wushi2333`（compositor mask 从截图剔除光标 overlay）                                                                                                                                                                                                                                               | 我们的"接管中"提示可以只给人看（VNC 叠加层不进模型截图）                                            |
| **settle loop + 诚实 effect 报告**         | `Anionex`（动作后按 `settleMs` 重观察直到 stateHash 变化或超时；明确"pixel-only/远程/瞬态不在证明范围")                                                                                                                                                                                             | 与官方 `verify_state` 同一精神：unknown ≠ 成功                                                      |
| **渐进暴露 + Skill 门控**                  | `Anionex`（bootstrap 工具 → 检测 Skill 加载后才注册执行工具并 `tools.restrict` 隐藏 bootstrap）                                                                                                                                                                                                     | 避免 computer 工具常驻污染所有 PersonaBot 的上下文                                                  |
| **虚拟光标"可见过程"**                     | `988hj7tczd`（glide 弧线动画让人类在画面上看到 bot 的操作轨迹）                                                                                                                                                                                                                                     | 容器里 bot 侧渲染 cursor overlay，VNC 可见                                                          |
| **helper 协议版本握手 + 完整性清单**       | `AzaiSakura`（`ping` 版本握手）；`Anionex`（sha256 manifest 校验 helper）；`PerryLink`（helper 协议版本）                                                                                                                                                                                           | 容器内 helper 或镜像的版本/完整性校验                                                               |

### 3.2 反模式

1. **把宿主 OS 私有输入通道当核心资产**：SkyLight、UIA `PostMessage`、WGC/D3D overlay、`SendInput`/`SetCursorPos`——容器里等价物是 XTest/xdotool/AT-SPI/CDP，这些代码一行都不该搬。
2. **外部驱动版本耦合**：`988hj7tczd` 自记坐标语义随 cua-driver 版本变化；`Anionex` 把 861 KB 预编译二进制提交进仓库。要抄的是版本校验思路，不是把二进制带进仓库。
3. **spawn-per-call**：每次动作 fork 一个 CLI（988）在 VNC 容器里会放大延迟；应做常驻 helper/daemon。
4. **模块级单例快照**：`988` 的 snapshot 是全局单例，注释自认单会话单窗口——多 PersonaBot 必然撞车。
5. **无 approval / 自建 confirm**：`ZRui-C` 全目录无 approval；`JohnXu` 自建 `session.confirm` 而不走 `ctx.approval`（会丢 DSH 权限预设的复用）。
6. **为 parity 复刻整套私有协议**：`wushi2333`/`AzaiSakura` 的 Codex/OpenAI 逆向实现体量与再分发风险都不适合照抄。

## 4. 对 BotHarness 插件计划的修正

### 4.1 关键决策：用不用官方 seam

- `ctx.computerUse` 与两个 provider 都只在 **`0.1.6-alpha.x` 起**存在；本仓库当前 pin 的是 `0.1.5-rc.2`（`engines.dsh`）。**采用官方 seam 需要先升 DSH**，且官方包是 experimental。
- 若升级：BotHarness 注册**一个** provider（如 `botharness-computer`），内部做 PersonaBot→容器的路由与租约；这既满足单槽约束，也把官方明确留给 caller 的 workflow 协调接住。
- 若不升级（保持 0.1.5-rc.2）：自建一个同形的 `ctx.computerUse` 风格服务（独占注册 + provider 透传），把接口形状做成将来可以自然迁移成官方 provider 的样子。

### 4.2 Provider 形态选择（容器路线）

| 选项                                                            | 判定                            | 说明                                                                                                                                        |
| --------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 官方 MCP provider + `docker exec -i … cua-driver mcp`           | **第一条 tracer bullet 的候选** | 零 adapter；但容器内需装 0.28.x、glibc 基础镜像、关 telemetry/更新检查；Xvnc 下 MPX 不可用，`delivery_mode` 实际走 foreground；未端到端实测 |
| 自建轻量 provider（xdotool/AT-SPI + X11 截图 + 自建 verify 层） | **中期主线**                    | 容器里不需要防"抢用户桌面"，可去掉 Cua 最复杂的一半；坐标契约/snapshot 失效/verification 词汇表照抄即可                                     |
| `cua-computer-server --backend vnc`                             | 备选                            | RFB 驱动远端桌面，能力面小（screen/pointer/scroll/keyboard），但最贴合"只管 VNC 桌面"的场景                                                 |

### 4.3 我们仍要自建的部分（官方零先例）

1. **VNC 观看/接管面板**（Client plugin + 认证路由 + WS 代理；官方只有 iframe Browser tab 的先例）。
2. **容器生命周期与 PersonaBot 归属**（分配表、租约、profile 卷、快照）。
3. **人机互斥**：人类输入使 observation 失效、agent 暂停、截图通道关闭（ChatGPT agent 的 "screenshots are not captured" 是唯一产品先例）。
4. **容器内桌面栈**：XFCE/openbox + TigerVNC/noVNC + Chrome + xdotool/AT-SPI + ffmpeg；镜像 pin 与完整性校验。
5. **guidance 文本**：照抄官方的 snapshot-before-act / token 失效 / 取消不回滚，但删掉 macOS/foreground 特有措辞，改成容器语义。

### 4.4 对既有 TB1–TB4 的增量建议

- **TB1（看得见）保持不变**，但把 provider 接口做成两层：`computerUse` 风格注册 + BotHarness 内部 router，为将来接官方 seam 留位。
- **TB2（BOT 能操作）优先写成"常驻 helper + 一次调用多动作 + settle 后重观察"**，避开 spawn-per-call；工具输出沿用 attachment + 能力门控。
- **TB3（接管）加入"人类输入使 observation 失效"断言**，并把审计写成 SessionEvent（含 known-type 门控），turn 结束释放 overlay/写入权。
- **TB4（归属）**在 router 里实现；注意官方单槽意味着**整个 Host 只有一个 provider 实例**，多容器复用同一 provider 的路由，而不是多注册。

## 5. 未验证 / 下一步

1. `docker exec -i … cua-driver mcp` 的端到端可用性（stdio 管道 + EOF 生命周期）未实测；`cua-computer-server --backend vnc` 同。
2. native provider 运行时工具目录 = ~56–60 全集还是 28–29 portable subset（上游文档与 contract manifest 不一致）。
3. 容器内 AT-SPI 树质量（官方 validation lane 是 Xvfb/Openbox 与 Sway，xfce-cua 的 AX 覆盖无公开证据）；Xvnc 下 foreground 输入在 Chrome/XFCE 的稳定性。
4. 官方 `0.1.6-alpha.x` 之后的 seam 是否变化（本文只核到 alpha.2）；BotHarness 要不要升 DSH 需要单独评估（影响 `engines.dsh`、全部 peer 版本与既有 ADR）。
5. 社区其他未展开仓库（`geohotstan`、`qphotoai`、`Altairpaca`、`beijingwahw` 的 SoM grounding + Planner-Actor）可能还有补充模式，留待需要时再扫。
6. 合规：Cua Driver 的 MPL-2.0 native binding 与 telemetry 默认值、以及镜像内 Driver 版本升级路径需要单独确认。
