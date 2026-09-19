# 头像与图标素材调研 — blobatar / bloub / 图标库对比（ADR-0032 依据）

## 0. 元信息

| 项       | 内容                                                                                                                                                                                                                                                                                                       |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 问题     | Bot 模式的默认头像用什么生成？自定义头像与动效要不要现在做？DSH `ui-primitives` 缺的字形（hash / 群聊等）从哪里补？Grok Bot 的视觉身份能不能参考/复刻？                                                                                                                                                    |
| 上游来源 | blobatar：<https://github.com/Alain00/blobatar>（站 <https://blobatar.dev>）；bloub：<https://github.com/jeremy-prt/bloub>；xAI 文章：<https://x.ai/bot/guides/designing-grok-bot-with-grok-bot>；图标库：Lucide / Bootstrap Icons / HugeIcons / Solar / Phosphor                                          |
| 日期     | 2026-09-19                                                                                                                                                                                                                                                                                                 |
| 调研方法 | 一手来源优先：上游仓库 README/LICENSE、本仓库已安装的 `blobatar@^2.7.0` / `@blobatar/react@^2.7.0`（`packages/client/node_modules/`）、本仓库 `packages/client` 现状、ADR-0028 与 dsh-ui 原生实测契约。所有 URL 访问日期 **2026-09-19**。无法由一手来源确认的说法一律标「未验证」；本轮不做动效/人眼评审。 |

**一句话结论**：默认头像用 **blobatar 字符串生成器**（MIT，确定性，无网络）——同一 slug 永远同一张脸；自定义头像与动效/表情留 v1.1。DSH 缺的字形 **vendored Lucide（ISC）** 首方组件补齐（hash / 群聊先行，必要时 hash 手绘）。**不复刻 Grok / x.ai 视觉身份**：bloub 的 MIT 只覆盖代码，不覆盖设计；仓库根 `LICENSE` 缺失，复制任何 MIT 代码前先补票。

---

## 1. blobatar（默认头像生成器）

- **许可**：MIT（仓库 LICENSE，`Copyright (c) 2026 Alain`；本仓库已装包并可在 `packages/client/node_modules/blobatar/LICENSE` 核对）。署名义务：保留版权与许可声明（vendored 代码同样如此，字符串生成器是 npm 依赖，不复制源码）。
- **生成器**：`blobatar(name)` 返回 SVG 字符串，`blobatar/uri` 包 data URI；无运行时依赖。上游 README 标称 **~4.4KB gz**；本轮口径「只打包字符串生成器」约 **4–6KB gz**（不含 motion / gaze 入口）。
- **确定性**：同一字符串恒同图；上游以 **generation（gen1/gen2）** 管理轮廓词表变更，我们的 seed 固定走当前 major，不 pin generation（未出现跨 major 升级需求）。
- **动效层（本轮不用，v1.1 再评）**：
  - `motion.css` + 根类 + 十几个 seeded 自定义属性，提供 breathe / bob / blink / glance；`animate: "hover" | "always"`；`prefers-reduced-motion` 已尊重。
  - **14 个 expression pose**：静态可烘焙进几何（字符串 API 也支持），pose 之间是 CSS morph。
  - **gaze**：单独入口 `blobatar/gaze.css` + JS（`useGaze`），是动效系统里唯一需要 JS 的一层。
  - **集成约束（未解决）**：motion.css / gaze.css 需要样式交付，而我们的 bundle 走 `styles.ts` 注入（lazy-CJS factory 契约），两种机制如何合并未验证——这是 v1.1 票的前置问题。
- **平台边界**：上游明确 React Native 无 `animate`（样式表机制不适用）；静态图在 web 是 `<img>`，动画模式是 inline SVG，切换渲染模式。
- **未验证 / 风险**：Safari 下动效**未验证**；本轮只做静态生成器，头像观感**未经人眼评审**（「not eye-reviewed」标记）；blobatar 的 shadcn 组件（presence-avatar / agent-list / group-chat 等）是另一层组合件，不在本方案内。

## 2. bloub（x.ai 头像复刻，仅方法参考）

- **许可与边界**：MIT，README 明确 "The MIT licence covers the code in this repository, not the design it imitates."；仓库声明与 x.ai 无关联。**代码可学的许可，不等于设计可用。**
- **技术形态**：Vue + Tailwind（仓库主要语言 TypeScript），无动画库；「one filled black shape morphing between 14 states, two white shapes for the eyes that morph independently, measured off the reference video frame by frame」。
- **可借鉴的方法（只借思路，不抄代码/资产）**：
  - radial-profile morph：单路径按径向轮廓插值，天然适合 blob 形变；
  - mask-hole eyes：眼睛是形状上的遮罩孔洞，避免两组图形对不齐；
  - 纯 `sample(t)` 求值：无动画库，时间驱动纯函数。
- **为什么不能直接用**：Vue/Tailwind 与我们的 React + `styles.ts` 不同构，没有可搬运件；更重要的是视觉身份属于 x.ai。

## 3. grokbot 文章事实核查（更正此前引用）

- URL：<https://x.ai/bot/guides/designing-grok-bot-with-grok-bot>，2026-08-24，作者 John Bai，标题 "Designing Grok Bot with Grok Bot"。
- 实际内容：设计师用常开 design agents（Figma Bro / Motion God / Experiments / Devbot）做设计工作的**工作流文章**；提到围绕「实际动画 spec 文件」做动效调参，但**没有任何 bot 身份 / 头像的设计规范、配色、几何字段或资产**。
- 结论：此前笔记把它当作头像设计依据属于**引用错误**，本文件纠正；头像决策的真实依据是 blobatar（生成器）+ bloub（方法边界），并在 ADR-0032 记录。

## 4. 图标库对比（补 DSH primitives 缺口）

现状：`ui-primitives` 提供 `Icon*Outline16` 等字形，但 **hash（#）/ 群聊没有对应件**；候选对比：

| 库              | 许可      | 网格 / 描边            | @16 观感                   | 体积 / 工程事实                 | 结论                                     |
| --------------- | --------- | ---------------------- | -------------------------- | ------------------------------- | ---------------------------------------- |
| Lucide          | ISC       | 24 stroked 2px round   | ≈1.33px（2/24×16），最接近 | 本轮 vendored 9 字形 gz ≈2KB    | **选用**：许可义务最轻，描边系谱接近 DSH |
| Bootstrap Icons | MIT       | 16 实心 / fill         | 原尺寸即 16，实心          | 全量按需均可                    | 备选：实心风格与 DSH 16px 线性图标不一致 |
| HugeIcons       | MIT       | 24 stroked 1.5         | ≈1.0px，偏细               | 全量解包约 80MB（不适合全量装） | 弃：@16 线重不足 + 体积                  |
| Solar           | CC BY 4.0 | 多风格套件             | `hashtag-chat` 可用        | 署名义务 + CC BY 分享条款       | 弃：ISC/MIT 够用时不必引入 CC BY         |
| Phosphor        | MIT       | 24 stroked / fill 双套 | 可选 weight（含 2px 级）   | 体积中等                        | 备选：若 Lucide 个别字形不合再取         |

- 本轮实测口径：**vendored 9 个字形 ≈2KB gz**（只打用到的 SVG path，不带图标库运行时）。
- **hash 特殊**：DSH 原生 hash 字形是 4 bars、16px 下 ≈1.3px 线宽；若 Lucide 的圆角描边观感不符，按 DSH 几何**手绘**，不引入整包风格妥协。

## 5. 决策与许可义务

- **默认头像**：blobatar 字符串生成器，seed = bot slug；DM Channel 行显示对应 Bot 头像，群 Channel 行显示字形。静态优先，动效/表情 opt-in 且后置（v1.1）。
- **图标**：vendored **Lucide（ISC）** 作为首方组件（`{size, className}` + `currentColor` + 文件头 ISC 署名）；hash / 群聊先行，users / move / sort / bot / image 按需补。**不引入运行时图标依赖、不引入组件库**（ADR-0028 增补）。
- **许可义务清单**：
  - blobatar：MIT → 保留版权与许可声明（作为 npm 依赖随包；notices 登记）。
  - Lucide：ISC → 在 vendored 文件保留许可与版权声明（ISC 要求许可文本随副本）。
  - 后续素材（Bootstrap/Phosphor 等若启用）：逐条登记，CC BY 类需额外评估。
  - **仓库根 `LICENSE` 缺失**（MIT 只出现在 docs landing 口径里）：先落地 LICENSE 票（issue-H），再复制任何 MIT 代码（含 bloub）。
- **不做的事**：不复刻 Grok / x.ai 视觉身份；不整包安装 HugeIcons/Solar；不为几个字形引入 icon 组件库。

## 6. 未验证 / 待确认

1. blobatar `motion.css` / `gaze.css` 与 `styles.ts` CSS 注入的合并方式（v1.1 前置）。
2. blobatar 动效在 Safari 的表现未验证。
3. 静态生成器头像观感未经人眼评审（not eye-reviewed）。
4. Lucide hash 与 DSH 原生几何是否一致；不一致则手绘 4 bars ≈1.3px @16。
5. 仓库根 LICENSE 文本与 landing/README 口径由 owner 最终确认。
6. 自定义头像（预设/上传/裁剪）需要设计稿；存储与 SoulSnapshot 语义待定（v1.1）。

## 7. 一手来源与访问日期

| URL                                                                                     | 内容                                                     | 访问日期   |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------- | ---------- |
| <https://github.com/Alain00/blobatar>                                                   | blobatar 仓库：MIT、~4.4KB gz、motion/gaze/expression 层 | 2026-09-19 |
| <https://blobatar.dev>                                                                  | 站点与 HTTP 端点（本轮不采用远程端点）                   | 2026-09-19 |
| <https://github.com/jeremy-prt/bloub>                                                   | bloub 仓库：MIT 仅代码、14 态复刻自参考视频              | 2026-09-19 |
| <https://x.ai/bot/guides/designing-grok-bot-with-grok-bot>                              | 事实核查：工作流文章，无头像/身份规范                    | 2026-09-19 |
| <https://lucide.dev>（仓库 <https://github.com/lucide-icons/lucide>）                   | Lucide 许可 ISC、24px/2px 网格                           | 2026-09-19 |
| <https://icons.getbootstrap.com>                                                        | Bootstrap Icons：MIT、16px 实心                          | 2026-09-19 |
| <https://hugeicons.com>（仓库 <https://github.com/hugeicons/hugeicons-react>）          | HugeIcons：MIT、24px/1.5 网格                            | 2026-09-19 |
| <https://solar-icons.vercel.app>（仓库 <https://github.com/480-Design/Solar-Icon-Set>） | Solar：CC BY 4.0、`hashtag-chat`                         | 2026-09-19 |
| <https://phosphoricons.com>（仓库 <https://github.com/phosphor-icons/core>）            | Phosphor：MIT、多 weight                                 | 2026-09-19 |
| 本仓库 `packages/client/node_modules/blobatar/LICENSE`                                  | MIT 文本与版权人核对                                     | 2026-09-19 |
| 本仓库 `packages/client/package.json`                                                   | `blobatar` / `@blobatar/react` 依赖与 bundle 外置契约    | 2026-09-19 |
