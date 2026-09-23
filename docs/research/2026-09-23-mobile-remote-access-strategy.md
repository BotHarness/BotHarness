# 移动端接入调研 — OpenBot 远程架构 · DSH 生态手机方案 · BotHarness 分阶段决策

## 0. 元信息

| 项       | 内容                                                                                                                                                                                                                                                                                                                                       |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 问题     | OpenBot 的 Expo App 如何连接桌面？DSH 插件生态有没有现成手机 App？我们「家里电脑部署、出门手机连回」场景怎么做？是否自研 Expo App，还是 WebView 嵌入？                                                                                                                                                                                     |
| 日期     | 2026-09-23                                                                                                                                                                                                                                                                                                                                 |
| 上游来源 | [nightly-labs/openbot](https://github.com/nightly-labs/openbot)（浅克隆 commit `252df2a`，`reference/openbot/`，gitignored）；DSH 生态为 2026-09-23 实时检索（GitHub / deepseek-plugin.org / dsh.fish / marketplace）；本地对照 `docs/research/2026-09-21-awesome-dsh-ecosystem-survey.md`、`2026-09-19-dsh-community-plugins-survey.md`。 |
| 结论     | **Phase 1 用 Tailscale（或 Cloudflare Tunnel）+ 手机浏览器/PWA 验证「出门连回家」场景，零自研代码；Phase 2 有日常需求再立项 Expo 壳 App（WebView 主体 + 原生只做推送/相机/密钥/生命周期）。不自研 Signal/coturn/WebRTC，不做纯原生协议客户端。**                                                                                           |

**一句话**：OpenBot 为「公网多设备桌面产品」自建了 Signal+coturn+WebRTC 控制面；DSH 生态对同一问题的共识答案是 **loopback 官方姿势 + 前置鉴权网关 + 出站隧道**——我们直接采用后者先验证，Expo 只在验证通过后作为薄壳出现。

## 1. OpenBot：Expo App 如何连接桌面

桌面是 host、手机是远程客户端；数据面**不是** HTTP 直连，而是 WebRTC P2P：

```text
手机 Expo App ──① 登录──► Cloudflare Worker (auth-api) + D1（账号/成员/逻辑会话）
     │                        ② 一次性 ES256 ticket（绑定 host、role、protocol、authEpoch）
     ▼
  Signal (Bun WSS, remote/api) ◄──③ 桌面也连上；只转发 SDP/ICE + 发 resume token + 限时 coturn 凭据
     │                        （无数据库：不存 token/SDP/消息；room/presence 仅进程内存）
     ▼
  WebRTC DataChannels ×3：rpc / events / files（Team API v3）——直连 p2p 或经 coturn relay
  文件/聊天/命令/视频永不过 Cloudflare/Signal
```

- **Expo 的关键取巧**（`docs/ARCHITECTURE.md:424-430`）：Expo Go 中一个 **DOM component 藏在隐藏 WebView 持有 `RTCPeerConnection`**，只把可序列化、校验过的命令/事件桥给原生 React UI——**不需要原生 WebRTC 模块、不需要 dev build**。连接/恢复/framing 共享于 `packages/team-client`（桌面↔手机同码）。
- **配对**：桌面二维码 = 一次性链接，绑定 host ID + SHA-256 公钥指纹，手机兑换时校验并 pin（`:450-455`）。
- **部署**（`remote/README.md:3-40`）：Docker Compose（Signal + coturn + nginx）；要求静态公网 IPv4、DNS-only 记录、TCP 443/3478/5349 + UDP 49152-65535。
- **为什么他们这么重**：产品形态是「个人桌面在 NAT 后 + 手机在公网」的**多租户**远程控制，所以要打洞/TURN/云端身份三件套。**我们是单用户、答案不同（§3）。**

## 2. DSH 侧的硬约束与生态现状

### 2.1 硬约束：官方拒绝暴露端口

`dsh web --host 0.0.0.0` 被官方直接拒绝——`/api` 等效远程代码执行，内置 browser-trust fence 不是鉴权层。因此任何远程方案的正确形状都是：

```text
dsh web 只绑 127.0.0.1 ──► 前置鉴权网关（第二个 listener / 反代）──► 出站隧道 ──► 手机
```

社区的 `cordis.patch.yml` 改 `0.0.0.0` 的 LAN 补丁**只能同网段用，绝不出门**（DSH Mobile 文档自己也写明 LAN 模式「认证但不加密，同网任意人可直达端口」）。

### 2.2 生态现成件（2026-09-23 检索）

| 需求                              | 现成方案                                                                                             | 备注                                                                                                                                                 |
| --------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 鉴权网关                          | [sorsama/deepseek-harness-relay](https://github.com/sorsama/deepseek-harness-relay)（**dsh-relay**） | TLS + QR/passcode 配对 + 密码 + 按设备吊销；harness 保持 loopback，relay 起不来则对外不可达（fail-closed）；`dsh plugin --profile web add dsh-relay` |
| 出门连回套件                      | [hadan8977/dsh-remote](https://github.com/hadan8977/dsh-remote)                                      | QR 一次性配对 + HMAC 会话 + **出站 cloudflared 隧道**（不开公网入站）+ PWA，手机零安装                                                               |
| Tailscale/CF 一键                 | [tyouter/dsh-remote-access](https://github.com/tyouter/dsh-remote-access)                            | Tailscale + Cloudflare tunnel QR 启动器                                                                                                              |
| Android 原生客户端                | [sorsama/deepseek-harness-mobile](https://github.com/sorsama/deepseek-harness-mobile)（DSH Mobile）  | Kotlin/Compose，镜像 harness 核心（session/审批/目标/轨迹）；**Relay 模式即出门模式**；LAN 模式同网用；MIT；钉 baseline（协议未版本化）              |
| iOS 协议客户端                    | [dshmobile.app](https://dshmobile.app/)                                                              | 明说支持 LAN / Cloudflare Tunnel / Tailscale；bearer + HTTPS/WSS；beta                                                                               |
| 插件式 mobile layout + WebView 壳 | [saya-ch/dsh-mobile](https://github.com/saya-ch/dsh-mobile)                                          | mobile layout 注入 + 独立 HTTPS 网关 + 配对 + mDNS 发现 + Android Kotlin WebView 薄壳；远程可选 Tailscale Funnel / cpolar                            |
| 移动控制台插件                    | blank-not-black **dsh-remote-plugin**                                                                | LAN/Tailscale、token 鉴权、附 Android App + 响应式 WebUI                                                                                             |
| 原生双端（无 npm 一键）           | `orbis-remote-dsh`（marketplace）                                                                    | iOS/Android、e2e 加密；源码仓发布                                                                                                                    |
| 零网络兜底                        | 我们自己的 Feishu/Lark Channel（dsh-im 路线）                                                        | 出站连接，手机飞书即客户端，零暴露                                                                                                                   |

关键分化佐证：**sorsama 纯原生 App 只镜像 harness 核心，插件 UI 不在里面**；而选 WebView 薄壳的方案（saya-ch 等）恰恰为了**不丢插件生态**。

### 2.3 插件生态为什么绑死 web 平台

- DSH 插件 client 代码是 TypeScript 打进 web client bundle、跑在浏览器 DOM（`docs/research/2026-09-19-dsh-plugin-authoring-client.md`：client 包必须 `platform === 'web'`）。
- RN **没有 DOM**：原生界面不会执行、也渲染不了任何插件 client 代码——**包括 BotHarness 自己的 roster / Activity / Channel / 设置面**。

## 3. 我们的主场景：家里电脑 + 出门手机连回

场景与 OpenBot 相同（host 在 NAT 后、手机在外网），但我们是**单用户、常开主机**——不需要 Signal/coturn/WebRTC。正确形状（两条等价主路线）：

**路线 A：Tailscale（推荐起步）**

```text
家里: dsh web (loopback) ← 鉴权网关（dsh-relay 或 Caddy basic-auth 等）← tailscaled
手机: Tailscale App 入同一 tailnet → https://家里机器.tailnet.ts.net → 浏览器/PWA/生态 App
```

- 出站 WireGuard，路由器零配置，蜂窝数据可连，tailnet 内自带 TLS。
- 同网在家：生态的 mDNS/Scan 直接可用，作为补充。

**路线 B：Cloudflare Tunnel（手机零安装）**

```text
家里: dsh web (loopback) ← QR 配对网关（HMAC session）← cloudflared 出站
手机: 扫码 → 隧道域名 → 存 PWA 主屏
```

**运维注意**：家里电脑常开（防休眠 / WoL）；隧道账号（Tailscale/Cloudflare）成为新单点；登录凭证 = 该机 shell 权限，密码/配对要强（DSH Mobile SECURITY 同款警告）。

## 4. Expo 判断：不是「要不要 Expo」，是「插件 UI 要不要」

| 路线                                                           | 插件生态（含 BotHarness 自有 UI）                                   | 代价                                                       |
| -------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------- |
| A. WebView 壳（Expo + `react-native-webview` 装 dsh web 页面） | ✅ 全部免费获得                                                     | 原生感依赖 web 响应式；推送/相机需桥接                     |
| B. 纯原生协议客户端（RN 直连 `/api` 重写 UI）                  | ❌ 一个都吃不到；每个插件面二次原生实现或等插件长出 mobile contract | 追逐**未版本化内部协议**；UI 永远追第二遍                  |
| C. 混合（原生壳/导航/通知 + WebView 内容区）                   | ✅ 主体全有                                                         | 复杂度居中；OpenBot 的 Expo DOM-in-hidden-WebView 即同思路 |

**判断**：要插件生态 ⇒ Expo ≈ WebView 壳，这不是缺陷而是正确答案；Expo 的原生预算只花在 WebView 做不好的地方——**推送通知（审批/完工唤醒）、QR 配对相机、Keychain/Keystore 存 token、前后台生命周期（Android foreground service 保连接）**。不走路线 B。

## 5. 分阶段决策（本次结论）

```text
Phase 1 — 验证（零/低自研）
  Tailscale（或 cloudflared）+ 鉴权网关（优先 dsh-relay 等现成件）
  手机浏览器 / PWA 直接操作完整 web GUI + BotHarness 插件面
  我们唯一的自研投入：web 侧小屏 responsive（roster/composer/pin grid）——
    这笔钱无论将来写不写 App 都要花，且浏览器与未来 WebView 壳共享收益
  可并行：Feishu Channel 作为零暴露的对话式控制面
  验证目标：出门场景是否真的日常高频到值得立项 App

Phase 2 — 有需求再立项 Expo（薄壳）
  WebView 主体承载 dsh web（含全部插件 UI）
  原生只做：推送、QR 相机、安全存储、生命周期/前台服务
  连接沿用 Phase 1 的网关 + 隧道，不发明新传输

明确不做
  - OpenBot 式自建 Signal + coturn + WebRTC 控制面（多租户产品才需要）
  - 纯原生协议客户端（丢失插件生态 + 协议未版本化）
  - 0.0.0.0 裸奔补丁出门用
```

## 6. 未验证 / 待确认

1. dsh-relay 的「从外网访问」需自行转发端口或配合 Tailscale IP 绑定——其 marketplace 文案与 README 的部署细节未逐文件实测。
2. dshmobile.app（iOS）与 `orbis-remote-dsh` 尚未实机验证其对 BotHarness 插件面的渲染完整度。
3. DSH web GUI 在手机浏览器的真实可用性（触摸目标、软键盘、pin grid 断点）未做人工走查——即 Phase 1 的验证内容本身。
4. 推送通知在 WebView 壳下的可行方案（FCM + 注入桥 / 生态已有做法）未调研；Phase 2 立项时补。
5. Tailscale 免费档设备数/ACL 对单用户是否足够：按当前条款可用，但未核对 2026-08 之后的变更。

## 7. 一手来源与访问日期

- OpenBot：`reference/openbot/`（commit `252df2a`）——`docs/ARCHITECTURE.md`（workspace、Team API、mobile 段）、`remote/README.md`、`packages/team-client/`、`apps/mobile/`。访问 **2026-09-23**。
- DSH 生态：`github.com/sorsama/deepseek-harness-mobile`（README 全文）、`github.com/sorsama/deepseek-harness-relay`、`github.com/hadan8977/dsh-remote`、`github.com/tyouter/dsh-remote-access`、`dshmobile.app`、`github.com/saya-ch/dsh-mobile`（deepseek-plugin.org / dsh.fish 条目）、`dshmarketplace.dev/plugins?category=remote`。访问 **2026-09-23**。
- 本地关联调研：`docs/research/2026-09-23-openbot-architecture.md`（OpenBot 架构/头像）、`2026-09-21-awesome-dsh-ecosystem-survey.md`、`2026-09-19-dsh-community-plugins-survey.md`、`2026-09-19-dsh-plugin-authoring-client.md`。
