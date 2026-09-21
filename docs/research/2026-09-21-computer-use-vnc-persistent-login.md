# computer_use_vnc 深挖：持久化登录、「帮它登录」的人机接管与本机/云选型

日期：2026-09-21

问题：上一份调研（`docs/research/2026-09-21-personabot-computer-and-live-view.md`）确认了「PersonaBot 的电脑」的总体形态，本报告深入三件事：① 拆解 Modal `computer_use_vnc` 这个参考实现；② 人类通过 VNC 帮 Agent 登录自己的账号，且**登录态持久化**；③ 本机隔离环境与云服务各自的可用选项。目标形态：一台真 Linux 电脑（容器或 VM），Agent 在上面工作；人类从 DSH Web UI 接入同一台电脑完成登录；**不占用、不抢占用户自己的电脑**。

## 来源基线

- 参考实现：`modal-labs/modal-examples` `13_sandboxes/cua/computer_use_vnc.py`（414 行）+ `computer_use_vnc.html`（113 行），两份文件全文读取。
- 官方 DSH 的 `ctx.computerUse` 与 Cua Driver provider、社区插件的可迁移模式见续篇 `docs/research/2026-09-21-dsh-official-computer-use-and-cua-driver.md`（官方单 provider 槽与容器路线的修正）。
- 平台事实：Modal / E2B / Fly / Cloudflare / Cua / Hyperbeam 官方 docs；容器镜像与桌面镜像是 Docker Hub / ghcr.io manifest 机检 + 官方文档。
- 安全与接管模式：OpenAI ChatGPT agent 帮助文档、Browserbase / Steel / Kernel / Hyperbrowser 官方文档、x11vnc man page、websockify / KasmVNC / Selkies 文档、本仓库 ADR-0006。
- 逐条标注证据等级；未验证项集中在 §7。

## 结论摘要

1. **`computer_use_vnc` 证明的是最小可行链路，不是产品**：约 20 行 shell（`Xvfb :99` → `x11vnc -shared` → `websockify` + Debian noVNC → iframe）就能让 agent 和人类共享同一个 X display；`readiness_probe → wait_until_ready → tunnels() → vnc.html` 是「桌面画出来才给 URL」的正确时序。但它**零持久化、零鉴权（`-nopw`）、单沙箱单任务**。
2. **登录态的本质是 Chromium profile 目录**：`Cookies`、`Login Data`、`Local Storage`/IndexedDB、`Preferences` 都在 `--user-data-dir` 里；把它放到**持久卷**、让 Chrome 常驻（不是每次 Playwright 新建），登录就能跨容器重启存活。Playwright 明确「不允许两个实例共用同一 profile 目录」（`SingletonLock`）。
3. **profile 卷必须当 secret 对待**：Linux 上 Chrome/Playwright 会 fallback 到 `--password-store=basic`（Playwright 默认参数之一），即密码/cookie 加密在无 keyring 环境下近似明文；卷加密/受控挂载、不进日志与镜像层。provider API key 走 DSH credentials service（ADR-0006）。
4. **「不抢占用户电脑」的两种含义都成立**：sandbox 路线天然分离（用户的鼠标/键盘/焦点完全不受影响，人类只是在自己浏览器里连 noVNC）；本机路线要选**容器或 VM 里的独立 X display**，而不是接管用户桌面（`dsh-click` 的 never-steals-focus、`ZRui-C` 的 click-through cursor 是「万不得已接管用户桌面」时的参考）。
5. **人类接管需要可测合同**：agent 必须真正暂停且**停止截图**——否则人类打字时 agent 截屏即泄密。唯一把这条写成产品承诺的先例是 ChatGPT agent：「While you control the browser, screenshots are not captured」。`browser-use` 只提供 `pause()/resume()` 停 loop，挡不住同机其他进程抓屏，所以 Host 侧必须关掉截图通道并拒绝 tool call。
6. **鉴权有分层现成件**：Modal 有 `create_connect_token(user_metadata=..., port=...)`（`Authorization: Bearer` 或 `_modal_connect_token` query/cookie，附 `X-Verified-User-Data`）+ `inbound_cidr_allowlist`；E2B 有 `stream.start(require_auth=True)` + 16 位随机密码（`?password=` 进 query，注意浏览器历史）；自托管有 x11vnc `-rfbauth`、websockify TokenFile、KasmVNC 爆破保护、Selkies Secure Mode。共同原则不变：**原始 stream URL 当 secret，经 Host 代理转签短 TTL 地址**。
7. **本机默认方案**：`local-docker` + `lscr.io/linuxserver/chrome`（Selkies，HTTPS 3001，**arm64 原生**，`/config` 卷即 Chrome profile），配 `-p 127.0.0.1:3001:3001` 与 `--cpus/--memory/--shm-size` 资源公平；Apple Silicon 上 `kasmweb/chrome` 与 `neko/google-chrome` 只有 amd64，需 QEMU 仿真，不作为默认。要「真 VM 内核」时：macOS 用 Lume（MIT，`lume run --display vnc`）或 Colima/Lima；Windows 用 WSL2；Linux 用 KVM/libvirt（microVM 无显示设备，做不了桌面）。
8. **云默认方案**：**Modal VM Sandbox + Volume + `snapshot_filesystem`**（真内核、官方 VNC 示例、快照默认 30 天可 `ttl=None` 永久、Volume `$0.09/GiB/月`）；硬限制是**单 Sandbox 最长 24h**，需要 BotHarness 自己做「快照滚动重建」。**E2B Desktop** 的 pause/resume 保留文件系统+内存、paused 状态官方称无限期保留，语义最贴「电脑可以睡着」，代价是同一时刻只允许 1 路 stream、Pro $150/月。**Fly Machines** 是唯一能长期常驻且便宜（约 $6–12/月），但 VNC 与鉴权全自建。

### 一页决策表

| 需求                             | 首选                                          | 次选                       | 关键代价                                 |
| -------------------------------- | --------------------------------------------- | -------------------------- | ---------------------------------------- |
| 只在用户本机跑，零 Docker 依赖   | Lume（Apple Silicon，`--display vnc`）        | WSL2 + Xvfb/x11vnc/noVNC   | Lume 仅 Apple Silicon；WSL2 需自建桌面栈 |
| 本机跑、最少自建                 | Docker + `linuxserver/chrome`（Selkies 3001） | OrbStack/Lima + 自建 noVNC | 需装 Docker/OrbStack；容器共享 VM 内核   |
| 云、真 Linux 内核、官方 VNC 先例 | Modal VM Sandbox + Volume + Snapshot          | Fly Machines               | 24h 上限 + 快照滚动要自建                |
| 云、电脑可「休眠」保内存         | E2B Desktop + `pause()`                       | Modal + 快照               | 单 stream + Pro 价格                     |
| 长期常驻且便宜                   | Fly Machines + 自建 noVNC                     | Modal 按需开关             | 鉴权/网关/保活全自建                     |
| 只需要浏览器身份                 | Browserbase Contexts / Kernel Profiles        | Steel/Hyperbrowser         | 没有通用 Linux 电脑                      |

## 1. `computer_use_vnc` 代码级解剖

| 层            | 事实                                                                                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 镜像          | `debian_slim(py3.12)` + apt `novnc websockify x11vnc xvfb` + pip `browser-use`/`playwright` + `playwright install --with-deps chromium`           |
| 桌面          | `Xvfb :99 -screen 0 1280x720x24`；**无窗口管理器、无终端、无文件管理器**                                                                          |
| VNC           | `x11vnc -display :99 -forever -shared -nopw -listen 0.0.0.0 -rfbport 5900 -xkb`（`-nopw` = 无密码）                                               |
| 浏览器→浏览器 | `websockify --web=/usr/share/novnc/ 6080 localhost:5900`；`VNC_PORT=6080` 是唯一对外的口                                                          |
| 观看 URL      | `sandbox.tunnels()[6080].url` + `/vnc.html?autoconnect=1&resize=scale&reconnect=1`；`encrypted_ports=[6080]` 给 TLS 随机域名                      |
| 生命周期      | 一个 task 一个 Sandbox；`timeout=60min`；entrypoint（agent）退出即结束；失败 `terminate()`、所有路径 `detach()`                                   |
| 就绪判定      | readiness probe 等 `/tmp/desktop_ready`（agent 在 `browser.start()` + 载入起始页后写入）→ `wait_until_ready()` → 才取 tunnel → 再 HTTP 探测 noVNC |
| Agent 驱动    | `Browser(headless=False)` 渲染到 `:99`，所以 VNC 里可见；人类与 agent **共享同一 X 输入**，无锁无仲裁                                             |
| Web UI        | FastAPI：`POST /api/session` 建沙箱、`GET /api/session/{id}` 轮询状态；前端把 tunnel URL 直接塞进 iframe                                          |

**值得逐字照抄**：进程编排骨架；`readiness → tunnels → vnc.html` 时序；`detach`/`terminate` 卫生；「iframe 嵌 watch URL + 状态轮询」的三段式 Web UI。
**必须补掉**：`-nopw` 与「URL 即秘密」；无持久化；无多会话（全局单端口常量、无 registry）；无窗口管理器（人类登录时连地址栏都难用）；iframe 直连 tunnel URL（无法在 Host 层加访问控制）。

## 2. 持久化：让登录活过重启

### 2.1 登录态落在哪

- Chromium `--user-data-dir`（每个 profile 一个子目录，通常是 `Default`）：`Cookies`、`Login Data`、`Local Storage`、IndexedDB、`Preferences`、Service Workers。
- 官方限制：浏览器不允许两个实例共用同一 profile 目录（`SingletonLock` 记录 `<hostname>-<pid>`，换机器残留会拒启）；Playwright 的 `launchPersistentContext(userDataDir)` 就是官方入口，且**关闭 context 即关浏览器**。
- 因此：**让 Chrome 在电脑里常驻（长跑进程），profile 目录指向持久卷**；不要用「每次任务新建 context」。

### 2.2 各平台的持久化原语

| 平台        | 原语                                                                                                 | 生命周期/限制                                                                              | 备注                                                                                               |
| ----------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Modal       | Volume（`volumes={"/home/persona": vol}`，`commit()` 回写）+ `snapshot_filesystem(ttl=…)`            | Volume 长期；Sandbox 最长 **24h**；Snapshot 默认 **30 天**、`ttl=None` 永久、baseline 差分 | 官方无「列出我的 snapshot」API，需要 BotHarness 自己记账；VM Sandbox **不支持 `reload_volumes()`** |
| E2B         | `pause()`/`connect()`（**文件系统+内存**）；`create_snapshot()` 一对多 fork；Volumes（private beta） | paused 官方称无限期保留、不自动删除；连续运行 Hobby 1h / Pro 24h，pause 重置窗口           | pause 时外部 VNC 连接会断，人类需重连；同一时刻只有 1 路 stream                                    |
| Fly         | Volume（NVMe、单机单区）+ `suspend`（内存快照）                                                      | Volume 跨 stop/suspend/cold start；suspend 快照**不保证**（deploy/迁移可能丢）             | 适合常驻；鉴权/网关自建                                                                            |
| Cloudflare  | 容器无持久盘；`mountBucket`（R2/S3/GCS FUSE）                                                        | sandbox ID 稳定但**容器实例会被 replace**，本地文件消失                                    | 官方明示：用户隔离用独立 sandbox，不要用 session                                                   |
| 本机 Docker | named volume / bind mount；linuxserver 约定 `/config`                                                | 卷独立于容器；`docker rm` 不删卷                                                           | linuxserver 升级流程 = pull → stop → rm → 同参数重建，挂对 `/config` 即保留                        |
| 浏览器云    | Browserbase Contexts / Steel Profiles / Kernel Profiles / Hyperbrowser Profiles                      | 各不同：Contexts「无限期」、Steel 300MB + 30 天未用删除、Kernel 需显式 delete 才写回       | 只保 Chrome 身份，不含磁盘/进程                                                                    |

**推荐落盘布局**（容器/VM 通用）：`/home/<user>/.config/google-chrome`（或 `chromium`）→ 持久卷；其余根文件系统可随镜像升级重建。Modal 上同时保留「Volume（日常写入）+ 定期 `snapshot_filesystem(ttl=None)`（跨 24h 与灾难恢复）」双保险。

## 3. 人类接管：帮它登录，且不泄漏给 Agent

### 3.1 产品先例

- **OpenAI ChatGPT agent（唯一写明防泄漏承诺的先例）**：「If a task requires a login, ChatGPT agent will pause and prompt you to take control of the virtual browser… **While you control the browser, screenshots are not captured**, which helps protect passwords and other sensitive data you enter.」
- Browserbase 官方 human-in-the-loop 场景明确包含「delegate credentials – give control to the end user」；Kernel 有 hosted UI / React 组件 + 1Password 凭据来源的 Managed Auth；Steel 明确 debug URL 无鉴权、只读用 `?interactive=false`；E2B 有 `view_only` 与 `require_auth`。
- 协调原语：`browser-use` 的 `agent.pause()/resume()`；Playwright CDP detach 只是断开连接（Kernel 文档明确 `browser.close()` 不保存 profile）——**「暂停」必须由 Host 保证，CDP 层没有免截屏语义**。

### 3.2 建议的接管合同（可测断言）

1. 默认 `view_only`（或只读 iframe/`pointer-events:none`）；人类点「接管」后升格为 controller。
2. 接管期间：agent loop 进入 paused/gated，**任何 tool call 被拒绝**；截图/screencast 通道关闭或返回固定遮挡帧。
3. 控制权唯一：同一时刻一个 controller，`request / give / release / take` 四动词（Neko 语义），断开自动释放。
4. 登录完成后：controller 交还 agent，恢复截图与 loop；profile 变更由卷自动持久化。
5. 全程写审计事件（谁在何时接管、动作类型），不记录击键内容。

### 3.3 鉴权分层（不要把裸 stream URL 给浏览器）

| 层              | 手段                                                                                                                                                                                                                                          |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Modal           | `sb.create_connect_token(user_metadata={...}, port=6080)` → `Authorization: Bearer` 或 `?_modal_connect_token=`；服务端可读 `X-Verified-User-Data`；`inbound_cidr_allowlist` 限源；或自建 VNC 密码                                            |
| E2B             | `stream.start(require_auth=True)` → 16 字符随机密码写 `~/.vnc/passwd`（`x11vnc -usepw`），`get_url(auth_key=…)` 拼 `?password=`（注意进浏览器历史）；另有平台级 `e2b-traffic-access-token`（浏览器 noVNC 发不出自定义 header，仅对 API 有用） |
| 自托管 VNC      | x11vnc `-rfbauth`/`-passwdfile`（**文件只是混淆、非加密**）；websockify `--token-plugin`（TokenFile/Redis）；KasmVNC Basic Auth + 爆破保护；Selkies Secure Mode（master/session token，viewer/controller 区分）                               |
| BotHarness Host | 同源短 TTL 签名代理是统一兜底：浏览器只拿 Host 发的地址，Host 校验 DSH 会话后再转发 WS/挑帧；DSH cookie 是 host-only + `SameSite=Strict`，跨端口 iframe 不会自动带，必须自带认证或反代                                                        |

### 3.4 无法工程化的现实

- **2FA 必有人**：Browserbase 的官方路线是「关 2FA / 用 app password」或「把 live view 交给终端用户」；Kernel 无凭据或遇 OTP 即 `NEEDS_AUTH`。
- **profile 有时效**：Steel 官方明说 auth snapshot「今天采的可能下周就失效，下个月基本不行」，并建议 profile + **Dedicated IP** 成对使用（「Profiles preserve browser identity. Dedicated IPs preserve network identity.」）。
- **站方主动拒绝**：OpenAI 官方承认网站可能封 cloud browser；Google 的 trusted device 实质是 cookie/风控策略——跨机、换 IP、profile 老化都可能触发重新验证。这些只能靠固定出口 + profile 一致性 + 人类兜底缓解。

## 4. 本机隔离路线（macOS / Windows / Linux）

### 4.1 推荐默认：Docker + `linuxserver/chrome`

```bash
docker run -d --name persona-bot1 \
  --shm-size=1g --cpus=2 --memory=2g --pids-limit=512 \
  -p 127.0.0.1:3001:3001 \
  -v persona-bot1-config:/config \
  lscr.io/linuxserver/chrome:latest
```

- 为什么是它：**arm64 原生**（Apple Silicon 不仿真）、镜像自带 Chrome + Selkies 直播（`https://localhost:3001`，WebCodecs 需要 HTTPS/secure context）、`/config` 卷即用户 home 与 Chrome profile。
- 只绑 `127.0.0.1`；默认无认证 + web 终端带 passwordless sudo，**必须** Host 代理/自加 basic auth，不直接暴露端口。
- 资源公平：`--cpus/--cpu-shares/--cpuset-cpus/-m/--memory-reservation/--memory-swap/--pids-limit/--blkio-weight/--shm-size`；磁盘配额单容器基本拿不到（`--storage-opt size` 需要 overlay2+xfs+pquota），按 VM 层卡（Colima `disk`、OrbStack `disk_bytes`、Docker Desktop `Disk usage limit`、WSL `defaultVhdSize`）。
- 宿主：macOS 用 Docker Desktop（全局 CPU/内存/磁盘上限 + Resource Saver 空闲关 VM）或 OrbStack（空闲 ~0.1% CPU、动态内存回收，但**商用需付费许可**，共享 kernel 不是安全边界）；Windows 用 WSL2 backend；Linux 直接 Docker/Podman（rootless 需一次性 subuid/pasta 配置）。
- 已知镜像差异：`kasmweb/chrome` 仅 amd64、默认会话 2768MB/2 核，Kasm 文档不建议跑在 WSL；`neko/chromium` arm64 可用但走 WebRTC（需 UDP 端口段与 ICE 配置），是多观看者/控制权交接场景才值得。

### 4.2 要独立内核时

| 平台                   | 方案               | 说明                                                                                                                                             |
| ---------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| macOS（Apple Silicon） | **Lume**（MIT）    | `lume create --os linux` + `lume run --display vnc` 自带 VNC server 并返回 `vncUrl`；真 VM、真内核、免费；宿主限 Apple Silicon                   |
| macOS                  | Colima / Lima      | 独立 kernel VM；Colima `nestedVirtualization` 仅 M3+ 且 `vmType: vz`；Lima 默认 vz + localhost 端口转发                                          |
| macOS                  | UTM                | 有图形能力但无 CLI、无 localhost 转发、无动态内存，自动化成本高                                                                                  |
| Windows                | WSL2               | `systemd=true` + 自建 Xvfb/x11vnc/noVNC；`localhostForwarding` 默认开；`.wslconfig` 限 memory/processors；Win11 `nestedVirtualization` 默认 true |
| Linux                  | KVM/QEMU + libvirt | QEMU `-vnc` / libvirt `<graphics type='vnc' websocket>` 是成熟解；microVM（Firecracker/Cloud Hypervisor）**无显示设备**，做不了桌面              |

### 4.3 本机 iframe 的浏览器现实

- DSH 无 CSP（源码事实），`http://localhost:3080` 嵌 `https://localhost:3001` **不是** mixed content（规则只针对 secure 页面的 insecure 子资源）；localhost 是 secure context。
- PNA 已废弃、由 Local Network Access 取代：Chrome 142 起 LNA 只拦 `public → local/loopback`，`localhost → localhost` 暂不受影响；未来扩展时嵌入页需要 `allow="loopback-network"`。
- 但 DSH cookie 是 host-only + `SameSite=Strict`，跨端口 iframe 不带，所以 viewer 端必须自带认证（容器 basic auth）或走 Host 同源反代。

## 5. 云服务深层对照

| 供应商                | 桌面/VNC                                                                                       | 人类登录与鉴权                                                                                                                   | 登录持久化                                                                   | 最长存活                                              | 价格                                                                                              | 证据          |
| --------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------- |
| **Modal** VM Sandbox  | 无托管桌面，官方 `computer_use_vnc` 自建；真内核（`vm_runtime` Beta，CPU-only）                | tunnel URL（随机但公开）+ **connect token**（`user_metadata`/`X-Verified-User-Data`）+ `inbound_cidr_allowlist`；或自设 VNC 密码 | Volume + `snapshot_filesystem`（30 天/永久）；`mount_image` 可挂进运行中沙箱 | **24h**（超时靠快照重建）                             | Sandbox 档 CPU ≈$0.142/core·h、内存 ≈$0.024/GiB·h（2 vCPU/4 GiB 约 $5.7/天）；Volume $0.09/GiB/月 | A             |
| **E2B**               | 官方 Desktop 模板：Ubuntu 22.04 + XFCE + x11vnc + noVNC + Chrome/VSCode/LibreOffice            | `stream.get_url(view_only, auth_key)`；`require_auth=True` 才生成密码；**单 stream**                                             | `pause()` 保 fs+memory，官方称无限期；Volumes private beta                   | Pro 24h / Hobby 1h，pause 重置窗口                    | Pro $150/月 + 按量；Hobby 免费/1h                                                                 | A             |
| **Fly Machines**      | 无托管桌面，自建 noVNC 经 fly-proxy 暴露                                                       | 无内建鉴权，自建反代/密码或 Tailscale                                                                                            | Volume + suspend（快照不保证）                                               | 无上限                                                | shared-cpu-1x/1GB ≈$5.9/月、2x/2GB ≈$11.8/月，Volume $0.15/GB/月                                  | A             |
| **Cloudflare**        | 无桌面，自建 VNC + `wsConnect()`                                                               | `exposePort()` preview URL **默认公开**（token 只稳定 URL），鉴权自建                                                            | 容器替换即丢本地文件；只能靠 R2/S3 挂载                                      | 无硬上限；`sleepAfter` 默认 10m，`keepAlive` 可不睡   | Workers Paid $5/月 + Containers 按 10ms 计费                                                      | A             |
| **Scrapybara**        | Ubuntu/Windows/Browser 实例 + `get_stream_url()`                                               | API key + URL token                                                                                                              | Auth States 跨实例复用                                                       | pause/resume                                          | **无公开价格页；官网已转向 Capy，高风险**                                                         | A（风险）     |
| **Cua Fleets / Lume** | Fleets：KubeVirt 桌面 + 认证 service proxy（VNC 需自建 bridge）；Lume：本地 VM `--display vnc` | Fleet token/OAuth client credentials                                                                                             | **0.7.0 明确 snapshot 未实现**；持久化靠预发布 image                         | pool/claim TTL                                        | Fleets ≈$0.0446/vCPU·h + $0.0223/GiB·h；Lume MIT 免费                                             | A             |
| **Hyperbeam**         | 只有 Chromium / Android / NES，无通用 Linux 桌面                                               | `embed_url` + `admin_token`，有参与者认证指南                                                                                    | Chrome profile 存 S3，**3 个月未访问删除**                                   | 会话级 timeout                                        | 10k 免费 participant-minutes，超出 $0.007/分钟                                                    | A（能力局限） |
| 浏览器型云            | 仅 Chrome 身份：Contexts / Profiles / Vaults                                                   | Live View 可交互/可 iframe；Kernel 的 Managed Auth + 1Password 最完整                                                            | cookies/localStorage 等                                                      | Contexts 无限期、Steel 30 天/300MB、Kernel 无文档 TTL | 见各家定价                                                                                        | A/B           |

**结论**：要「真 Linux 电脑 + 人类 VNC 登录 + 登录持久化」，云上首选 **Modal（VM Sandbox + Volume + Snapshot + connect token）**；要「电脑能睡着再醒来且内存都在」选 **E2B Desktop**；要「便宜常驻」选 **Fly** 但接受全部自建；Cloudflare 不适合放持久 profile；Scrapybara 商业风险高，仅作参考。

## 6. 建议的落地骨架（实施时核对）

```
ComputerRegistry（BotHarness application-defined 全局服务）
  botId → computer { providerRef, profileVolumeRef, snapshotRef, lease, takeoverState }
  ├─ provider: local-docker | local-vm(Lume/Colima/WSL2) | modal | e2b | fly
  ├─ 启动：Xvfb + x11vnc(带密码或 Host 代理) + websockify/noVNC + Chrome --user-data-dir=卷内路径
  ├─ 观看/接管：Host 同源短 TTL 签名路由 → iframe/canvas；viewOnly 默认，接管走四动词状态机
  ├─ 登录：人类在 VNC 的 Chrome 里登录；agent paused + 截图通道关闭；完成后 release
  ├─ 持久化：profile 卷 + 定期快照（Modal 24h 滚动 / E2B pause / Docker volume）
  └─ 审计：接管、动作、错误事件写 session/审计流；击键内容不落盘
```

参考成本量级（Modal，24/7 概念估算，仅算力）：0.125 core + 1 GiB ≈ $30/月；1 core + 2 GiB ≈ $137/月；2 core + 4 GiB ≈ $274/月。Fly 常驻小机约 $6–12/月。本机 Docker 接近零边际成本。

## 7. 未验证 / 待实测

1. **Modal 计费口径**：Sandbox 是「按请求量还是按实际使用」两处文档表述不一致，影响「挂着空闲桌面」的账单。
2. **Modal Connect Token 与 noVNC/WebSocket 长连接的兼容性**（token 注入 query/cookie、WS 升级是否被接受）无实测；VM Sandbox 的 `reload_volumes` 不支持、nested KVM 默认关闭、Memory Snapshot 白名单。
3. **E2B `?password=` 是否真的被其 fork 的 noVNC 消费**；pause 期间是否计费（两轮调研口径不一致）；Volumes private beta 的挂载限制。
4. **人类接管期间「截图关闭」在自托管路线没有现成开关**，需要我们在 Host/agent 层实现并写测试。
5. **容器内 Selkies/KasmVNC 的 iframe 实测**（X-Frame-Options、自签证书首帧交互）、LNA 未来对 `localhost → localhost` 的收紧。
6. **Chrome profile 跨大版本升级的兼容性**无官方承诺；`--password-store` 与 keyring 的确切回退行为未取到 `os_crypt` 源码。
7. **Lume Linux guest 的桌面/串流细节**（官方教程偏 macOS guest）；Cua Fleets 的 VNC bridge 为官方 recipe 而非产品化鉴权网关。
8. **Cloudflare/R2 FUSE 挂载承载 Chrome profile 小文件密集 IO 的性能**未实测。
