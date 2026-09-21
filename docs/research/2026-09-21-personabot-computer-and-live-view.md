# PersonaBot 的「电脑」：live view、sandbox 方案与分配模型调研

日期：2026-09-21

问题：BotHarness 设想「PersonaBot 拥有一台电脑，用户能在 DSH Web UI 里看到 Agent 的画面并操作它」。需要回答三件事：① DSH 生态里有没有现成实现；② 除「用户自己装 Docker」之外，还有哪些能预装 Chrome、提供 VNC 类直播的 sandbox 路线；③ 一台电脑如何分配给一个/多个 PersonaBot，本机与 sandbox 怎么统一。本报告只做调研，不产生设计决议。

## 来源基线

- DSH 侧以 pinned `0.1.5-rc.2`（tag `dsh-v0.1.5-rc.2`，commit `fb2c4b9e`）的源码与仓库内 docs 为准；`0.1.6-alpha.2` 线的新包单独标注为「蓝本，不在 pinned 版本」。
- 生态仓库用 `gh api` 做 metadata/README/源码级核查；外部方案以官方 docs/README 为准。逐条标注验证等级；未验证项集中在 §7。
- 相关既有文档：`docs/research/2026-09-21-awesome-dsh-ecosystem-survey.md`（生态扫描）、`docs/client-bridge.md`（`/api` 传输）、`.agents/skills/dsh-dev/SKILL.md`（pitfall log）。
- 续篇：`docs/research/2026-09-21-computer-use-vnc-persistent-login.md` — `computer_use_vnc` 代码级解剖、登录态持久化（profile 卷 / Modal Snapshot / E2B pause）、人类接管防泄漏合同、本机与云 provider 选型。

## 结论摘要

1. **生态现状：有「控制」，没有「画面」**。DSH 社区 13+ 个 `computer-use` 插件、多个 desktop control 插件（`dsh-click`、`computer-control`、`ZRui-C/dsh-computer-use`）都只把截图送给**模型**（attachment/vision/OCR），人类在 Web UI 里没有任何实时画面；全生态搜索 VNC/noVNC/WebRTC/RDP 零命中（`imroc/dsh-embedded-browser` 的 `DESIGN.md` 甚至专门写了「Why screencast instead of VNC」否决 VNC 路线）。
2. **最接近「看到并操作」的是浏览器/设备级 live view**，且已跑通完整链路，共有 4 种可抄的像素通道：CDP screencast→WebSocket→`<canvas>`（`imroc/dsh-embedded-browser`）、MJPEG→签名 URL→`<img>`（`ZSeven-W/dsh-ios` / `dsh-android`）、SSE→`<img>`（`Fisfzy/dsh-ego-browser`）、轮询 PNG→`<img>`（`guo6x/dsh-pilot`，2s）。它们都不是整机桌面。
3. **真正的缺口是两个**：① **frame producer**——上述通道都依赖目标自己会抓帧（Chrome CDP、模拟器 MJPEG、adb screencap），一个 Xvfb/VM 桌面没有，必须自建（容器内 x11vnc/Selkies/ffmpeg x11grab 或内置 noVNC）；② **PersonaBot 作用域**——现有 live view 全是 session-scoped（`conversation.view` 的 `inject(sessionId)`、per-session tab），PersonaBot 的电脑是**跨 session 的身份资产**，映射表必须 BotHarness 自建。
4. **平台侧可行，且不必造平台级新机制**：pinned DSH 有「替换 capability Provider」的完整先例（E2B 家族替换 `ctx.fs`/`ctx.subprocess`）、插件自有认证 HTTP/WS 路由（`webServer.register` / `registerUpgrade` + `connection.requestRejection`）、以及 `sidebarRightTabs` / keyed `main` / `shell.overlay` / `tool.call.toolview` 等嵌入位；DSH Web shell 无 CSP，iframe 到 localhost/远端不被 DSH 阻止。**但 `/api/remote.mux` 明确 text-only（二进制帧直接 close 1003）**，像素流必须走自有 WS/HTTP，不能走 Gateway stream。
5. **Docker 之外最现实的两条免 Docker 路线**：**E2B Desktop**（Ubuntu+XFCE+noVNC，SDK 返回带 `auth_key` 的 stream URL、支持 `viewOnly`、pause/resume 保状态，按秒计费，Firecracker 隔离）与 **browser-only live view 服务**（Browserbase / Steel / Kernel / Hyperbrowser：一次 session 一个隔离 Chromium + 官方 iframe 直播 URL + readOnly 开关，最便宜但只有一个浏览器，没有 OS）。要「多 bot 共享 + 人类接管」则有 **Neko**（Apache-2.0，WebRTC，room 模型 + 控制权交接）。
6. **本机路线需要一个 native companion**：纯浏览器客户端无法自动推 Host 屏幕（`getDisplayMedia()` 需要用户手势且捕获的是观看者所在机器）；DSH 的 desktop 插件已经证明可行形态是「捆绑 native helper（PowerShell / 签名 macOS app）+ OS 权限（Accessibility、Screen Recording）」，而「不抢焦点、可急停、有审计」是它们的共同设计约束。
7. **分配模型有成熟参照，但没有一个直接可用**：默认应是「1 PersonaBot ↔ 1 computer 的独占租约」（E2B「sandbox is not session-scoped」、Cloudflare「每用户一个 sandbox ID」、Fly「per-user app」、Modal「同名只允许一个在跑」都是这个方向）；共享场景抄 **Neko 的 room 语义**（多 viewer、同一时刻一个 controller、request/give/release/admin 强夺）；观看/控制权限的工程惯例是「viewer / controller / owner / admin 四角色 + 默认 viewOnly」。
8. **安全红线**：Anthropic demo 的 `x11vnc -nopw`、linuxserver 镜像默认无认证、各家 live view URL 明文即能力（Steel 自述 debug URL 无鉴权）——stream URL 必须当 secret，经 Host 代理 + 短 TTL 签名地址；容器凭据沿 ADR-0006 走 DSH credentials。

### 一页矩阵

| 路线                                                  | 预装 Chrome                                      | 直播方式                                                      | 可嵌入 DSH Web UI              | 隔离/持久化                                 | 本机/云                                        | 许可证/成本                  | 证据          |
| ----------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------- | ------------------------------ | ------------------------------------------- | ---------------------------------------------- | ---------------------------- | ------------- |
| 自托管容器桌面（linuxserver/chrome、kasmweb/chrome）  | ✅                                               | Selkies WS / KasmVNC                                          | iframe（Kclient/自带前端）     | 每容器；`/config` 持久                      | 本机 Docker                                    | GPL-3.0 系 / 免费            | 代码级 README |
| Neko                                                  | ✅（`ghcr.io/m1k1o/neko/google-chrome`）         | WebRTC                                                        | README 明示可嵌                | 每容器；room 内共享                         | 本机/云                                        | Apache-2.0                   | 代码级        |
| E2B Desktop Sandbox                                   | ✅（desktop 模板，可 `launch('google-chrome')`） | x11vnc+noVNC，`stream.get_url(viewOnly, auth_key)`            | URL 可 iframe                  | Firecracker microVM；pause/resume 保状态    | 云，可自托管                                   | Apache-2.0 Runtime；按秒计费 | 官方 docs     |
| Modal Sandboxes                                       | 需自装（官方示例 Playwright/Chromium）           | 官方 computer_use_vnc 示例：Xvfb+x11vnc+noVNC 经 tunnels 暴露 | 是（示例即网页内嵌）           | 容器；snapshot/Volume；最长 24h             | 云                                             | 闭源平台                     | 官方 example  |
| Browser-only（Browserbase/Steel/Kernel/Hyperbrowser） | ✅                                               | 官方 live view URL / WebRTC                                   | ✅ 官方 iframe 示例 + readOnly | 每 session 独立浏览器；profile/context 私有 | 云（Steel 可自托管）                           | 闭源/混合；最便宜            | 官方 docs     |
| Guacamole / xpra                                      | ❌（接已有桌面）                                 | VNC/RDP→浏览器；xpra 影子桌面                                 | ✅                             | 网关，无桌面生命周期                        | 本机/云                                        | Apache-2.0 / MPL-2.0         | 官方 docs     |
| dockur/windows                                        | Edge（Chrome 自装）                              | 内建 web VNC @8006                                            | ⚠️ 未验证                      | QEMU/KVM，`/storage` 持久                   | 仅 Linux + `/dev/kvm`（Docker Desktop 不支持） | MIT；Windows 授权自负        | 官方 README   |
| 本机电脑 + native helper                              | 用户自己的                                       | 截图推流 / xpra shadow                                        | 需自建面板                     | 无隔离                                      | 本机                                           | —                            | DSH 插件证据  |

## 1. DSH 生态现状（一手核查）

### 1.1 有画面 → 已有可抄的四种像素通道

| 仓库                                                                         | 呈现方式                                                              | 控制方式                                                                            | 关键实现                                                                                                                                                          | 与 BotHarness 的关系                                                                                                        |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `imroc/dsh-embedded-browser`（原 `dsh-external/dsh-browser-panel`，★0，MIT） | CDP `Page.startScreencast` / 轮询 JPEG → 自研 RFC6455 WS → `<canvas>` | 鼠标/键盘/IME 回放到同一 CDP target；`browser_panel_ask_human` 阻塞式接管；不抢前台 | `webServer.register` + `registerUpgrade`；`connection.requestRejection` 鉴权；自研 WS；backlog >3 MiB 丢帧；坐标按 canvas intrinsic size 映射                     | **传输/输入/面板机制的最佳模板**；但它是 tab 级，且 identity 是「全宿主共享 profile」——与 PersonaBot 需要「一人一身份」相反 |
| `ZSeven-W/dsh-ios`（★298）/ `dsh-android`（★155），MIT                       | MJPEG 或进程内抓帧 → `multipart/x-mixed-replace` → 签名 URL → `<img>` | 面板内 tap/drag 归一化坐标 → POST `/control`                                        | **HMAC-SHA256 签名 capability（10 分钟过期）+ loopback peer/Host + Fetch-Metadata/Origin 校验**；`#root` margin-right workbench dock；帧从不为 image block 进会话 | 安全模型与「帧生产者」骨架可直接照抄：把帧源换成 VNC framebuffer 抓帧即可                                                   |
| `Fisfzy/dsh-ego-browser`（原 `dsh-external/ego-browser`，★185）              | SSE 推帧 → `<img>`                                                    | 点击/输入 `/api/ego/input`；可弹出有头窗口                                          | better-sidebar Tab 或浮动球双形态；曾修过无认证 `/api/ego/*` 漏洞                                                                                                 | 「副屏观察窗」产品形态参考；同样是浏览器 tab 级                                                                             |
| `guo6x/dsh-pilot`（★22，MIT）                                                | 2s 轮询 PNG → `<img>`（`shell.overlay` cockpit）                      | 仅 start/stop + 地址栏，不注入键鼠                                                  | headless only、零依赖、per-session 浏览器                                                                                                                         | 最小 tracer bullet（只观看）的最低成本模板                                                                                  |

### 1.2 无画面但有价值

- `GHJIVHIDD/dsh-plugin-vm-sandbox`（★3，Apache-2.0）：唯一「per-session OrbStack VM + `conversation.view`『虚拟机』页签」的现成宿主，页签内是 xterm.js 终端（SSE + POST）——**正是 PersonaBot 电脑该挂的位置，但必须自建像素帧生产者**；OrbStack 实质 macOS-only。
- `strukto-ai/mirage`（★3645，Apache-2.0）：替换 DSH `FileSystem`/`Shell` provider 的虚拟工作区，per-command sandbox routing（docker/e2b/daytona）——「电脑只跑命令」形态的参考。
- `STARDUSTLC666/dsh-docker`（★3，MIT）：走官方 `subprocess` 服务、argv 无注入、破坏性操作默认审批——Docker-in-DSH 的正确写法。
- `zzh-learner/dsh-sidebar-browser`（★0，无 license）：`/proxy/<url>` 反代 + 剥离 `X-Frame-Options`/CSP + 重写绝对链接，`<iframe>` 侧栏——**「把外部 origin 塞进 DSH Web UI」的唯一先例**，未来若走独立 noVNC 端口要读它。
- `dsh-computer-use` 家族（13+ 仓库）：只有「给模型的截图」；唯一有 client half 的 `Anionex/dsh-computer-use` 也只注册 `settings.section`。安全设计可借：审批 freshness（`basedOn` + pixel hash + max-age）、进程身份校验、e-stop、脱敏审计事件（`dsh-click` 最完整）。
- 命名提醒：`dsh-external/dsh-browser-panel`、`dsh-external/ego-browser` 等不是 canonical 名，实际仓库见上表；`dsh-external/browser4-dsh` 404（真实为 `platonai/dsh-browser4`）；`wqty123/dsh-browser`、`anweat/dsh-browser`、`omdsh-dev/dsh-browser` 是三个不同项目。

## 2. DSH 平台侧可行性（pinned `0.1.5-rc.2`）

### 2.1 可以做

- **远程/容器执行有先例**：E2B 家族（`dsh-e2b` + `dsh-fs-e2b` + `dsh-subprocess-e2b`）整体替换 `ctx.fs` / `ctx.subprocess` Provider，所有适配器 await 同一个 `getSandbox()` handle。注意它是**组合级单例**（一个 sandbox、ephemeral、默认 300s），**没有 per-session/per-agent 的 provisioning seam**——「每 bot 一台电脑」的分配表是 application-defined。
- **长驻进程可挂接**：`ctx.subprocess.spawn()` 的 `stdout: 'pipe'` 直接给插件原始 `Readable`（无缓冲）——VNC server/ffmpeg 这类进程可以自己消费字节流；`ctx.shell.start()` 提供增量文本；`ctx.terminals` 是真 PTY 但**按 exact Agent 授权、只到有界文本**，不能当作共享电脑的底座；`ctx.jobs` 的 `JobKindMap` 可 declaration-merge 扩展。
- **插件自有流式路由**：`ctx.connection.fetch.register({path:'/api/...'})` 在 `/api` 前缀内，**先过 Host/Origin 检查与 cookie 鉴权**，支持 `requestBody:'streaming'` 与 chunked 响应；`ctx.webServer.register({kind:'exact'|'prefix'})` 可挂 SSE（官方 `dsh-client-hmr` 有样例）；二进制/WS 用 `ctx.webServer.registerUpgrade()` ——但该 API 自身不鉴权，handler 第一件事必须 `ctx.connection.requestRejection(req)`（照抄 api-gateway 的拒绝模式）。
- **嵌入位齐备**：右栏 `sidebarRightTabs.register` + keyed `sidebar.right.pane.tab`、全局面板 keyed `main` + `ctx.layout.selectPanel`、浮层 `shell.overlay`、会话内 `tool.call.toolview`。官方 HTML 预览已用 `<iframe sandbox="allow-scripts">`，PDF 用 `<canvas>`；**DSH Web shell 没有 CSP**，因此 iframe 指向 localhost/远端不被 DSH 阻止（真正的限制来自目标页的 `X-Frame-Options`/浏览器策略，未实测）。

### 2.2 不能做 / 必须自建

- **不能把像素流走 Gateway**：`/api/remote.mux` 明确 text-only（binary → `close(1003)`，item 必须 JSON 序列化），base64 帧的成本未验证。
- **没有 VNC/远程桌面/端口转发/tunnel seam**；没有插件静态资源目录 API（noVNC 资源要内联进 bundle 或自建 fetch route）。
- **没有 per-bot 的 sandbox 生命周期/配额/分配**；`ctx.sandbox` 只是文件效果限制（`confine`），不是 provider。
- **pinned 版本没有浏览器交互终端**（`api-terminal-controller`、`ui-sidebar-terminal`、`ui-sidebar-browser` 都在 `0.1.6-alpha.2` 线，只能当蓝本）。
- **鉴权约束**：cookie 是 host-only、`SameSite=Strict`、`HttpOnly`、无 `Secure`；token 只允许在 `GET /` 交换。同源 iframe/WS 自动带 cookie；跨源/跨端口必须自带一次性 token。不要 `connection.rpc.intercept('/api')`（pitfall #1）。

### 2.3 推荐 seam stack（实现时核对）

```
BotHarness ComputerRegistry（application-defined 全局服务；durable 分配表落 storage domain 或 workspace 文件）
  → provider 实现：local-docker / cloud-desktop / browser-cloud / local-host
  → 观看：同源认证 route 提供 viewer HTML/JS + iframe；或 canvas + 插件自有 WS（VNC/RFB 二进制，registerUpgrade + requestRejection）
  → 控制面 JSON（状态/活动/输入 ack）：Typert Remote stream（注意改 descriptor 要重启 DSH，pitfall #11）
  → UI：右栏 keyed tab（推荐）或 main 面板；人类接管按钮走同一条认证 route
```

## 3. Docker 之外的 sandbox/电脑方案

### 3.1 容器桌面直播（自托管）

| 方案                   | 说明                                                                                                                | 许可                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| **noVNC + websockify** | 事实标准浏览器 VNC 客户端 + WS 代理；Anthropic/E2B/Modal/OpenHands 都在用                                           | MPL-2.0                    |
| **KasmVNC**            | 浏览器原生 VNC（WebCodecs H.264/265/AV1，可选 WebRTC UDP）；linuxserver 的 `kclient` 是 iframe wrapper              | GPL-2.0                    |
| **Selkies**            | GStreamer WebRTC，默认 WS、可开 WebRTC；README 明示可嵌任意 HTML5 界面；`linuxserver/chrome` 即基于它（HTTPS 3001） | MPL-2.0（含 GPL 组件清单） |
| **Neko**               | 容器内 Chrome/桌面 + WebRTC；**唯一原生支持多观看者 + 控制权交接**                                                  | Apache-2.0                 |
| **Guacamole**          | VNC/RDP/SSH → 浏览器网关；分享链接可给无账号访客、连接级 `read-only`、owner 断开即失效                              | Apache-2.0                 |
| **xpra HTML5**         | `sharing=`（多客户端共存）/ `steal=`（抢断）/ `action=shadow`（影子现有桌面，Wayland 不支持）                       | MPL-2.0                    |

注意：linuxserver 系默认**无认证**（Basic auth 官方自称只能「keep the kids out」），`linuxserver/chrome` 的 web 终端带 passwordless sudo；Anthropic demo 甚至用 `x11vnc -shared -nopw`。自托管必须由 Host 反代 + 会话 token 兜住。

### 3.2 云 desktop sandbox（免 Docker）

- **E2B Desktop**（首选）：Ubuntu+XFCE+noVNC；`stream.get_url(viewOnly, auth_key)`；同一时间只能一个 stream，可按 `window_id` 只播某个窗口；pause/resume 保留内存+磁盘（**sandbox 不是 session-scoped**），volume 独立；Firecracker 隔离；Hobby 连续 1h 上限、Pro $150/mo；可自托管（Apache-2.0 Runtime）。
- **Modal Sandboxes**：官方 `computer_use_vnc` 示例给出 Xvfb+x11vnc+noVNC 经 `sandbox.tunnels()` 暴露的完整路径，可作自建云 desktop 的最小蓝图；`vm_runtime=True` 可拿到 KVM（社区有 Windows + noVNC 例子）。
- **Daytona**：有 VNC access + `computer_use`（鼠标/键盘/截图/窗口）配对设计，但**开源仓库 2026-06 起归档、核心转私有**，长期风险高。
- **Fly Machines**：裸 microVM，无内建直播，需自带 VNC/Selkies；per-user app blueprint 可直接当「每 bot 一台机」参考。
- **Cloudflare Sandbox SDK**：`getSandbox(env.Sandbox, 'user-123')` 稳定 ID（官方明确：**用独立 sandbox 隔离用户，不要用 sandbox 内的 session 隔离**）；`exposePort()` 出预览 URL、`wsConnect()` 接 WebSocket、`sandbox.terminal()` 出浏览器终端；无桌面示例，VNC 要自建，预览 URL 默认 public 需自行鉴权。
- **Scrapybara**：Ubuntu desktop instance + `get_stream_url()`，pause/resume；鉴权与角色语义未验证。
- **Cua + Lume**（MIT）：macOS 本地 VM（Apple Virtualization）与云 Fleets；直播协议未验证；是唯一严肃的「macOS 电脑」路线。

### 3.3 Browser-only live view（只有浏览器，成本最低）

**Browserbase**（iframe + `pointer-events:none` 做只读，`debuggerUrl` per tab）、**Steel**（WebRTC H.264 25fps，`debugUrl` iframe + `interactive=true/false`，**Apache-2.0 可自托管**）、**Kernel**（`browser_live_view_url` + iframe + CSP 要求 + `readOnly`，还有 kiosk 模式）、**Hyperbrowser**（`liveUrl` 12h token、`viewOnlyLiveView`）、**Notte / Anchor**（文档较弱）。

它们的共同代价：不能装/跑任意桌面软件、没有通用文件系统（持久化落在 vendor 的 profile/context 语义里）、无法做系统级身份/代理/剪贴板。共同安全事实：live view URL 明文即能力（Steel 自述 debug URL 无鉴权；Hyperbrowser 自述拿到 URL 即可交互）。

### 3.4 其他 OS 与本机

- **dockur/windows**：Docker 里跑 QEMU Windows + web VNC @8006；**需要 Linux host + `/dev/kvm`，明确不支持 Docker Desktop（macOS/Windows）**；Windows 授权用户自负。不适合做默认档位。
- **redroid**（Android 容器）：官方 WebRTC streaming 仍在 plan，现实做法是 adb + `ws-scrcpy`。
- **本机屏幕直播**：Sunshine 的 Web UI 只做配置（客户端是 Moonlight，浏览器播放是社区项目 moonlight-web-stream）；RustDesk Web client 需自建 server + WSS 反代（AGPL-3.0）；浏览器 `getDisplayMedia()` 必须用户手势触发且捕获的是观看者所在机器——**纯 DSH 插件无法自动推 Host 屏幕**。
- **Anthropic computer-use demo** 是最小可复制模式：Ubuntu 22.04 + Xvfb + mutter + tint2 + `x11vnc -shared -nopw`(5900) + noVNC/websockify(6080) + 组合页(8080)；预装的是 firefox-esr；自述 weakly separated、同时只支持一个 session。**照抄它的镜像结构、替换掉它的鉴权**。

## 4. 分配模型与「看到并操作」UX 参考

### 4.1 分配模型

**推荐先做「独占租约 + attach by reference」**：`Computer` 是 Host 侧实体（`id/kind/providerRef/lease`），`PersonaBot --owns--> Computer` 默认 1:1，`Session --attaches--> Computer` 是引用 + TTL 租约，而不是每次创建。先例：E2B「sandbox is not session-scoped」、Cloudflare 稳定 sandbox ID、Modal named sandbox「同名只允许一个在跑」、Fly per-user app、OpenHands「1 conversation ↔ 1 workspace/container」（后者最接近 per-session，但它是 workspace 级复用）。

**共享场景抄 Neko 的 room 语义**：任意多 viewer、**同一时刻只有一个 controller**（源码里 `state.id`），控制权通过 `request / release / give / admin-give` 显式转移；`implicit_hosting` 让「点一下就接管」（单用户场景最佳实践），`control_protection` 要求房间内有 admin 才能被授予控制，`locked_controls` 一键锁输入。注意 Devin 官方对 shared VM 的警告（资源竞争、并发上限低、无隔离、并行写必须不重叠文件）与 Fly 的「同 app 内扁平私网互通」警告——**共享必须是显式 opt-in**。

### 4.2 观看/控制权限惯例

**viewer / controller / owner / admin 四角色 + 默认 viewOnly** 是跨产品的最小公共集：Browserbase 用 `pointer-events:none`（权限即 CSS，链接即能力令牌）；Kasm 默认发起者控制、`shared_session_full_control` 默认 False；Guacamole 分享链接可给无账号访客、连接级 `read-only` 完全不接受输入、**owner 断开链接立即失效**；RustDesk 有 `view-only`；xpra 用 `sharing`/`steal` 表达共存与抢断。

E2B（`viewOnly`）、Kernel（`readOnly`）、Hyperbrowser（`viewOnlyLiveView`）、Steel（`interactive=false`）都在 API 层提供只读开关——BotHarness 的默认档应是「可看不可操作」，人类显式接管再升级。

### 4.3 人机同屏与接管

- Browserbase Live View 是「嵌入式面板」成品：`navbar=false` 融入自有 UI、断开时 iframe post 消息供宿主清理；官方列出的 human-in-the-loop 场景（人处理 iframe / 代客凭据 / 手动上传）与 PersonaBot 的接管场景高度重合。
- Anthropic demo 的 `:8080` 页面同时是「聊天 + 桌面」，人可随时抢鼠标（无仲裁）；OpenHands/E2B 则是「容器自带 noVNC，Host 只暴露一个 URL」，观看通道随机器销毁。
- 本机场景：`dsh-click` 的「never steals foreground focus」、`ZRui-C/dsh-computer-use` 的 click-through software cursor（不动物理指针）应写成**可测合同**；`computer-control` 的三重 e-stop（全局热键、协议命令、panic file + STOP banner）与 `neko` 的 `private_mode`（观看也可关）是「人随时能拔电源」的参考；审计沿用 `dsh-click` 的脱敏 `observed/action` 事件形状。

## 5. 本机 vs sandbox

| 维度      | 本机（用户自己的机器）                                                        | sandbox                                                                                 |
| --------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 开机/常驻 | 天然 always-on，无 create/pause/快照                                          | 生命周期能力齐全（E2B pause 无限期保留、Modal 最长 24h、Cloudflare 实例会换但 ID 稳定） |
| 权限      | 需 OS 授权（macOS Accessibility + Screen Recording），必须有 native companion | 无 OS 权限门槛；但需要 Provider 凭据                                                    |
| 观看通道  | Host 端 xpra shadow / x11vnc+noVNC / native helper 推流；纯浏览器插件做不到   | 容器内自带流，Host 只暴露一个代理 URL                                                   |
| 安全      | 操作的是真实账号/文件；必须 e-stop、审计、默认 viewOnly                       | 隔离好，但 stream URL/凭据是新的 secret 面                                              |
| 产品语义  | 「PersonaBot 的电脑」= 我的电脑，隐私预期不同                                 | 「PersonaBot 的电脑」= 它的电脑，可销毁/重建                                            |

## 6. 建议的落地切片（仅建议，不是决议）

1. **Slice 1 观看**：`ComputerRegistry`（bot→computer 独占租约）+ `local-docker` provider（`linuxserver/chrome` 或 `kasmweb/chrome`，每 PersonaBot 一个容器 + `/config` volume）+ Host 侧短 TTL 签名 viewer URL（同源认证 route）+ 右栏 keyed tab iframe（默认 `viewOnly`），另加 2s 级截图 `<img>` 作为 no-Docker 降级档。
2. **Slice 2 接管**：四角色 + `request/give/release/take` + 「controller 断开自动释放」+ e-stop；单用户场景用 `implicit_hosting` 式「点一下就接管」。
3. **Slice 3 免 Docker 档**：`browser-cloud` provider（Kernel/Browserbase/Steel）先行，`desktop-cloud` provider（E2B Desktop）跟进；两者都用厂商 stream URL 但**经 Host 代理转签**，不把原 URL 交给浏览器。
4. **Slice 4 本机档**：native companion（截图/输入/xpra shadow）+ OS 权限引导，默认「观察 + approval-gated 动作」。

### 待决策（open decisions）

1. computer 归属粒度：PersonaBot / Session / Workspace？session 是租约还是创建者？
2. 共享默认：独占 vs 允许共享；并发写的约束如何表达（文件锁 / worktree）。
3. 控制权默认归谁；人接管是抢占还是排队；是否需要 `locked_controls`。
4. 持久化语义：本机常驻 vs sandbox pause/snapshot；snapshot 是否包含记忆/浏览器 profile。
5. local kind 的观察范围：全屏 / 单窗口 / 单进程（影响隐私与回滚）。
6. 直播传输选型（截图轮询 / VNC / WebRTC）与录制、审计保留策略。
7. 观看鉴权：短期签名 URL、可分享性、是否随 controller 断开失效。
8. 多 bot 竞争同一 controller 令牌的仲裁（Neko 用 admin 兜底）。

## 7. 未验证 / 下一轮要补

- DSH Web Client 的 iframe/Shadow DOM/CSP 实测（DSH 无 CSP 是源码事实，浏览器侧混合内容/Private Network Access/`sandbox` 与 cookie 的交互未测）。
- 插件自有 WS upgrade 与传输背压、帧率、延迟实测；base64 经 Gateway mux 的实际代价。
- E2B Desktop 生产模板是否显式预装 Google Chrome（README 示例可 `launch('google-chrome')`，模板 apt 清单未列）。
- Hyperbrowser/Scrapybara/Cloudflare/Fly/Modal 的具体单价；kasmweb 镜像的许可条款；Cua Fleets 的直播与 iframe 能力。
- macOS ScreenCaptureKit / Windows Desktop Duplication 的授权与网页嵌入可行性。
- `0.1.6-alpha.2` 线 `api-terminal-controller` / `ui-sidebar-terminal` / `ui-sidebar-browser` 的 API 形状——若 DSH 升级，可显著简化终端与 iframe 浏览器的接入。
