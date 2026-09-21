# AnySoul Live2D 组合方式与动画运行时 — 对 DSH-Live2D / DSH-Avatar 的可复用设计

## 0. 元信息

| 项       | 内容                                                                                                                                                                                                                                                                                       |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 问题     | AnySoul（`DoodleBears/anysoul`）当时是如何组合 `untitled-pixi-live2d-engine` 的？LLM tool call → Live2D 行为的映射与动画 runtime 是怎么定义的？最新引擎（1.4.0）改变了什么？哪些设计值得 DSH-Live2D / DSH-Avatar 取用？                                                                    |
| 上游来源 | anysoul 源码：`reference/anysoul`（read-only clone， commit `7960a8e1cc6824043551c61d484793b9c83018f7`，2026-05-07）；`docs/prd/*live2d*`；引擎 releases/npm：<https://github.com/Untitled-Story/untitled-pixi-live2d-engine>、<https://www.npmjs.com/package/untitled-pixi-live2d-engine> |
| 日期     | 2026-09-21                                                                                                                                                                                                                                                                                 |
| 调研方法 | 只读 clone 到已 ignore 的 `reference/`，源码 + PRD 一手阅读；引擎侧读 releases 与 npm registry。**未运行 anysoul、未实测引擎升级**（标「未验证」）。行号锚定上述 commit；PRD 勾选状态与代码存在漂移，文中以代码为准并标注。                                                                |

**一句话结论**：AnySoul 把引擎当渲染原语，在其上自建了一套 application-defined 的动画运行时（Clip/Keyframe/TrackModifier + Rule + priority/weight 混合 + 虚拟参数命名空间），并用单一 `Live2DService` 把引擎隔开。可搬运的精华是 **Rule 拥有 priority、所有命中规则并行、priority 分层内 override 消耗 remaining weight、虚拟参数命名空间、文本随 reveal 时序触发、validate-before-write + self-heal**；它当时未实现的 tool-parameter-aware mapping 恰好是 DSH 事件模型可以做得更好的地方。引擎在 1.4.0（2026-09-20）原生修掉了 AnySoul 为 1.0.1 打的两个 workaround（blob 纹理识别、Cubism teardown），升级能删代码，但整套 quirk 清单要按新版本重验。

---

## 1. 组合方式快照（引擎 1.0.1，无 patch）

- **版本**：`packages/web/package.json:125` `untitled-pixi-live2d-engine: ^1.0.1`，lock 固定 `1.0.1`（2026-02-25 发布）；`pixi.js 8.17.1`、`@pixi/sound 6.0.1`、`@pixi/react 8.0.5`。只用 `/cubism`（Modern-only）入口，不引 legacy。
- **无 patch**：仓库没有 `patches/`，lock 里没有 `patchedDependencies`。PRD 曾把 `pnpm patch` 列为应急（`docs/prd/20260325-live2d-web-integration/…prd.md:129-131, 172`，对应上游 issue #11），最终选的是抽象边界方案（PRD §2.2 option A）。
- **单一引擎边界**：全仓只有 `live2d-service.ts` 两处 import 引擎——`:178` type-only、`:272` 动态 `import()`（代码分割，未启用 Live2D 时不加载 pixi/engine）。`Live2DPlugin` / `extensions.add` / `parallelMotion` / `configureCubismSDK` 全仓未使用。
- **React 接入**：`useLive2D()`（`live2d-react-bridge.ts:41`）管 canvas 生命周期，`useLive2DSetup()`（`hooks/use-live2d-setup.ts`）管模型/配置加载，HUD 与编辑器共用同一 service（module singleton `live2d-service-ref.ts`，一个屏幕一个模型）。
- **Cubism Core**：自托管 `packages/web/public/live2d/core/live2dcubismcore.min.js`（全局 `<script>`，仓库内），`cubism-loader.ts:17-43` 幂等动态注入 + 失败可重试。
- **模型资产**：自建链路——JSZip 导入 `.zip` → Dexie/IndexedDB（DB `anysoul-live2d-models`，v1→v4 schema）→ 生成 blob URL 并在内存里重写 `model3.json`（白名单扩展名、自动声明未被 model3.json 引用的 motions/expressions）。
- **规模**：`lib/live2d/` 28 个文件；`live2d-service.ts` 3102 行、`live2d-playback-engine.ts` 1975 行、编辑器 UI 组件 16 个约 2.3 万行。这份体量本身就是教训：**运行时值得抄，单体 service 不要抄**。

## 2. 从 LLM 信号到 Live2D 行为（映射层）

**触发链**：`use-agent-display-trigger.ts:22-81` → `TriggerContext` → `PlaybackEngine`。

- **DisplayTrigger 优先级**：`expression`（message 轨正在播的那行，携带 emotion/action/toolName）> `tool_call`（pending 的 message toolName）> `tool_call`（当前 tool）> `processing`（后端持久状态 `status==='processing'`，刷新后仍在）> `idle`。**只有 message 轨驱动表演，thinking 不打断编排**（`:25-27`）。
- **TriggerContext**（`live2d-rule-types.ts:44-60`）：`emotion` / `action` / `text` / `textSource` / `matchedTextPatterns` / `latestTextMatch{occurrenceId, pattern, source}` / `toolName` / `isThinking` / `isIdle`。
- **规则模型**（`live2d-rule-types.ts:27-99`）：`CompoundCondition(and|or)` + 6 种原子 `emotion | action | text(pattern, source?) | thinking | tool_call(toolName) | idle`；**所有命中规则同时触发**（文件头明确 not first-match-wins），`MappingRule.priority` 决定参数所有权，`ClipGroup` 提供变体选择（random/sequential）、`weight`、`timeScale`，`chainRuleId` 做动作队列。
- **零配置自动映射**（`live2d-auto-mapper.ts`）：20 个 emotion 预设、7 个 action 预设、9 个 tool 预设（`web_search / fetch_page / search_file / read_file / write_file / edit_file / relate_file / send_message / display_content`，`:238-294`），每条 = 若干 `Param*` 目标 + 曲线；按模型实际存在的参数过滤后生成 v3 规则（tool_call 优先级 1、emotion/action 优先级 2）。
- **tool → 行为的天花板（现状）**：运行时只有 `toolName` 一个 tool 信号。PRD `20260409-live2d-tool-parameter-aware-mapping` 定义了更丰富的 `ToolTriggerEnvelope {toolName, phase: start|result, fields, flags, texts}` 与新原子 `tool_phase / tool_field_equals / tool_flag / tool_text`，**checklist 0/48，完全未实现**。
- **文本关键词**（`live2d-text-playback.ts:41-121`）：不是行首触发，而是按打字机 reveal 位置调度（`startMs`），greedy longest-match 防止短 pattern 抢先；`textSource` 作用域 `message / thinking / any`；`occurrenceId` 让重复关键词可重复播放；匹配到关键词时会反推该行需要停留的时长（`inferTimedTextStayDurationMs()`）。

## 3. 动画运行时（runtime）

**资产 vs 规则分离**：`AnimationClip` 是可复用资产（priority/blend/sections/notifies/release），`MappingRule` 只回答"何时播、播哪组"。

- **时间线两种数据模式**：legacy `sections` 与 keyframe-first `ParameterTrack/ParameterKeyframe`（`live2d-keyframe-types.ts`）；插值 `step | cubic-bezier（带 handle）| spring 预设`，motion3.json 导入时把 Cubism segment 转成线性/step/归一化 bezier。
- **效果层 TrackModifier**（`live2d-effect-types.ts:25-33`、`live2d-track-modifier.ts`）：AE 表达式式的后置变换 `wiggle / loop / noise-offset / clamp / drift / sine / pulse / spring`。`loop` 修改**采样时间**，其余值修改器用**绝对时间**；value noise 被重写为 lattice-hash 的 C1 平滑实现（旧的 sine-hash 肉眼可见抖动，`:208-226`）。
- **每帧管线**（`live2d-service.ts:2194-2448`，`onTick`）：引擎 `update()` 先跑（这样 snapshot 读到上一帧）→ baseline 恢复（模型快照 → part opacity 1.0 → `defaultState.params` → persona preset 覆盖）→ `applyParameterWrites` → actions/notifies。用户手动 motion 播放时**整体让出参数管道**，只保留 lip sync（`:2211-2235`）。
- **混合语义**（`live2d-playback-engine.ts:1832-1975`）：同一参数按 priority 分层；层内先 `multiply`、再 `add`、最后 `override`，override 消耗共享的 `remaining` 预算（起始 1）。release 用快照插值，支持 per-pair transition（`clipA→clipB` 各自时长）+ idle handoff 权重衰减。
- **插值**：临界阻尼 spring（`smoothTime = min(duration*0.6, curve 预设值)`）；bezier 结果缓存上限 200 条。
- **可观测性**：`resolveParameterWriteSummaries()` 输出"每个参数谁赢了、有效权重多少、controlKind"（`rule|base|shared|mixed`），编辑器用它对齐预览与运行时。
- **虚拟参数命名空间**（`types.ts:65-205`）：把引擎的非参数能力伪装成普通参数，从而复用同一套时间线/规则/优先级——`__part__*`（Part opacity 0–1）、`__focus_x/y__`、9 个 transform 参数（`__position_x/y/z__`、`__scale_x/y/z__`、`__pivot_x/y__`、`__rotation_z__`）。`position_z` 是伪 2D 深度（`depthScale = clamp(1 + z*0.15, 0.85, 1.15)`），pivot 有 anchor 补偿避免模型漂移（`live2d-service.ts:1417-1457`）。虚拟运行时参数**绝不进入持久化外观基线**（`isVirtualRuntimeParam` / `isPersistableAppearanceParameter`）。
- **Idle**：引擎内建 `Idle` motion group 被禁用，AnySoul 自己用 rule/idle-behavior 调度（`scope: idle|active`，`mode: loop_one | pick_one_per_idle_session | random_playlist`，三段过渡时长）。`IdleAnimator`（Perlin 类微动）存在但运行时未用。
- **Lip sync**：Tier 1 正弦（`isSpeaking`）、Tier 2 门控 RMS（attack/release 非对称）；V2 配置按音源路由（`tts`/`external_media`/`recorded_mic_clip`/`uploaded_audio` → 引擎原生 `speak()`；`live_mic_input` → analyser 回退），多目标嘴形（role+weight+min/max），引擎内部 gain/weight 用魔法系数直接改写（`live2d-service.ts:108-110, 883-903`）。
- **编辑器运行时**：command-pattern undo/redo（上限 50）、时间线 seek/预览与 runtime 对齐（rule seek 使用确定性的首变体）、独占播放会话控制。
- **性能默认**：30 FPS 默认、HUD 自适应 60/120；每 tick 100ms delta 上限；模型资产走 IndexedDB/blob，模型不出本地。

## 4. 生产事故级的工程对策（最该抄的部分）

1. **配置损坏恢复阶梯**（PRD `20260507-live2d-mapping-config-corruption-recovery`）：schema 校验后才允许写 → 读取端防御式迁移（缺失字段=空数组，日志只记 key 名）→ 一次性 self-heal 覆盖坏记录 → 带定向 reset 的 ErrorBoundary → 全局 Safe Mode（重置偏好/缓存/恢复出厂）。**真实事故**：把 `.exp3.json` 从"Import JSON"导入，写入了无 `version` 的坏记录，导致 `/space` 每次渲染都抛错；Electron 重装不清 IndexedDB，用户像被永久锁死。
2. **Part opacity 被引擎 motion 更新重置**：每帧在引擎 update 前后各 enforce 一次。
3. **Cubism 5 的 `CubismId` 对象字符串比较失效**：建 string→index 缓存，unwrap `_id → csmString.s`。
4. **blob URL 无扩展名**：解析 `FileReferences.Textures` 后用 `Assets.add({loadParser:'loadTextures'})` 预注册（**1.4.0 已原生修复**）。
5. **pixi v8 BatcherPipe crash**：destroy 前先 `ticker.stop()`；blob 先 teardown 模型再 revoke。
6. **模型目录未被 model3.json 声明的 motions/expressions 会被引擎忽略**：在内存里注入声明，否则出现"所有 pose 的手臂网格同时可见"的叠影。
7. **容器晚收敛**：refit 排三次（rAF / 120ms / 260ms）+ `ResizeObserver` + `data-state` MutationObserver。
8. **引擎 quirk 清单是版本相关的**——AnySoul 自己标注这些是 1.0.1 专属，移植前必须对目标版本重验（下节正是最好的例子）。

## 5. 引擎版本 delta：1.0.1 → 1.4.0（AnySoul 当年的 workaround 是否还成立）

| 版本        | 日期       | 关键变化（对 AnySoul 的含义）                                                                                                            |
| ----------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 1.0.2       | 2026-04-17 | 复杂模型 mask buffer 分配修复（PR #14），无 API 变化                                                                                     |
| 1.1.0       | 2026-04-29 | 纹理 LOD：`textureOptions.lod: full / single-auto / false` + threshold/level/filter 调参——**AnySoul 未使用，大图集小尺寸渲染的免费收益** |
| 1.2.0       | 2026-05-16 | **Breaking：移除 `ZipLoader`**（AnySoul 自己用 JSZip 解压，不受影响）；导出 `Live2DPlugin` 显式注册 render pipe                          |
| 1.2.1/1.2.2 | 2026-06    | auto blink 参数初始化修复；`Meta.Loop` 生效；model3 layout 对齐官方 SDK                                                                  |
| 1.3.0       | 2026-07-08 | motion loop override `model.motion(g, i, ?, {loop})`、`from(..., {eyeBlink:false})`、`@pixi/sound` 变为可选、layout 修复                 |
| 1.3.1       | 2026-07-08 | `parallelMotion` 支持逐条 loop 覆盖                                                                                                      |
| 1.3.2–1.3.5 | 2026-07-19 | filter/culling/anchor/bounds 一系列修复                                                                                                  |
| 1.4.0       | 2026-09-20 | **Cubism teardown 生命周期修复**（经 `CubismMoc.deleteModel()`，消除 `_modelCount == 0` 断言）；**无扩展名/blob URL 纹理自动识别**       |

结论：

- **`1.4.0` 原生修掉了 AnySoul 的两个 workaround**（第 4 节 #4 blob 纹理、以及 teardown 相关的 destroy 隐患），升级可删代码；LOD 还能降显存。
- 其余 workaround（CubismId、part opacity、ticker/destroy 顺序、目录注入、refit 时序、用户 motion 让权）**仍需自持**，尚未见上游覆盖。
- 升级路径注意：`^1.0.1` 到 `1.4.0` 跨了 `ZipLoader` 移除与 render pipe 显式注册两个行为变化；AnySoul 不使用这两处，但任何新集成应按 1.4.0 的 `extensions.add(Live2DPlugin)` 写法起步。

## 6. 对 DSH-Live2D / DSH-Avatar 的设计输入

优先级从高到低：

1. **单一 engine boundary + renderer 可替换**：任何渲染器（Live2D / 视频 / 静态图）都走一个 service façade；对插件而言按能力拆分（lifecycle / parameters / lip-sync / preview），不要 3100 行上帝类。
2. **Rule/Clip 运行时直接照搬语义**：可复用 Clip 资产 + 复合条件 + **所有命中并行** + priority 由规则（触发方）拥有 + 分层混合（multiply→add→override + remaining weight）+ 快照 release。这是"LLM 行为 → 身体表演"最成熟的一块。
3. **触发上下文归一化 seam**：DSH 有 `session/event` 与 tool call 生命周期事件，比 AnySoul 轮询 store 结构化得多。建议定义 application-defined `Avatar Trigger Context`，并把 tool 触发做成 **envelope（toolName + phase + fields/flags/texts）**——AnySoul 想清楚但没做的那一步，在 DSH 上反而容易。
4. **虚拟参数命名空间**：`__part__` / `__focus__` / `__transform__` 让引擎非参数能力进入同一套规则/时间线/优先级，且明确排除在持久化外观之外。
5. **文本随 reveal 时序匹配**：只在用户真正看到那个词时触发，且反推停留时长；这是文字型 agent 与 Live2D 的最佳接口。
6. **TrackModifier 程序化效果层**：小、纯函数、可单测，让关键帧"活起来"。
7. **配置持久化纪律**：validate-before-write、防御式读取、一次性 self-heal、定向 reset、Safe Mode——客户端用户可导入的 JSON 一定会坏。
8. **Lip sync 与 Output 事件边界**：AnySoul 用 `speak()` + 音源路由；对 BotHarness 应只消费 **`PersonaBot Output Committed`**（#125）这类已提交、允许公开的内容，并复用多目标/路由配置思路。
9. **资产与持久化位置**：AnySoul 放 IndexedDB、Core 自托管；DSH 插件要先按 ADR-0034 的 persistence map 决定模型与 Core 放 host 文件还是 client 存储，以及分发许可。
10. **许可**：AnySoul 只做产品策略（Free 非商用 / Starter / Pro，Phase 4 收入分成协议 deferred），**无运行时 gating**；DSH 若分发 Live2D 渲染，Cubism 商业条款要先落许可策略（见 `docs/research/2026-09-21-desktop-pet-and-live2d.md` §5）。

## 7. 未验证与边界

- 未运行 AnySoul，未在其环境实测渲染/性能；未实测 1.4.0 升级后 workaround 的删除（表中"可删"是依据 release notes 的推断）。
- PRD 勾选状态与代码漂移（多个 PRD 未打勾但代码已在；`20260409` 确认未实现）。
- 行号锚定 clone `7960a8e`；上游随时演进。
- DSH 侧尚未做任何设计决策；本文件是设计输入，采纳需要 ADR 与票据（#58、ADR-0032 的 v1.1 边界同样适用）。

## 8. 参考

- AnySoul：`reference/anysoul`（commit `7960a8e`，2026-05-07）
  - 引擎边界与参数管道：`packages/web/src/lib/live2d/live2d-service.ts`
  - 运行时：`live2d-playback-engine.ts`、`live2d-clip-types.ts`、`live2d-keyframe-types.ts`、`live2d-effect-types.ts`、`live2d-track-modifier.ts`
  - 规则与触发：`live2d-rule-types.ts`、`live2d-text-playback.ts`、`live2d-text-match.ts`、`packages/web/src/hooks/use-agent-display-trigger.ts`
  - 预设映射：`live2d-auto-mapper.ts`；虚拟参数：`types.ts`
  - 恢复与迁移：`live2d-config-migration.ts`、`live2d-mapping-config-schema.ts`、`packages/web/src/hooks/use-live2d-setup.ts`
  - PRD：`docs/prd/20260325-live2d-web-integration/`、`20260326-live2d-parameter-keyframe-timeline/`、`20260329-live2d-procedural-effect-layer/`、`20260413-live2d-lip-sync-optimization/`、`20260422-live2d-text-match-source-scoping/`、`20260423-live2d-rule-priority-and-weight-semantics/`、`20260426-live2d-virtual-transform-parameters/`、`20260507-live2d-mapping-config-corruption-recovery/`、`20260409-live2d-tool-parameter-aware-mapping/`、`20260328-live2d-legal-commercial-policy-update/`
- 引擎：<https://github.com/Untitled-Story/untitled-pixi-live2d-engine/releases>、npm 版本史（1.0.0-rc.1 → 1.4.0）
- 相关：`docs/research/2026-09-21-desktop-pet-and-live2d.md`（BongoCat 窗口工程、引擎许可闸门、桌面端 pet 现状）
