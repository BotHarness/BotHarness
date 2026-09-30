# DeepSeekBot 更新日志

这里记录 DeepSeekBot 值得关注的变化。添加或发布条目前，请先阅读
[Release Ledger 贡献指南](docs/agents/changelog.md)。

## [Unreleased]

推进首个 PersonaBot 工作流，交付 Assignment、共享动效控制与 Channel composer island。

### Added

- Human 可在收件箱内查看群聊或 PersonaBot 私聊未读消息及附近上下文，并直接回复；来源不可用时拒绝提交，失败时保留草稿（[#547](https://github.com/BotHarness/BotHarness/issues/547)）。
- PersonaBot Profile 现在按实际调用的 provider/model 显示每日用量，分别展示输入、输出、缓存读写 token 和 provider 报告的总数；未报告的分项明确显示未知（[#499](https://github.com/BotHarness/BotHarness/issues/499)）。
- Human 可通过 DSH 应用菜单在 Host 上打开当前 Memory Repository、子目录及文件，显示文件位置、复制 Host 路径，或将完整当前文件下载到浏览器设备；普通文件选择仍使用内置阅读器（[#574](https://github.com/BotHarness/BotHarness/issues/574)、[ADR-0100](docs/adr/0100-file-open-actions-target-real-host-files.md)）。

- Human 收件箱现在按 Channel 汇总群聊和 PersonaBot 私聊未读消息，在侧栏入口显示去重后的消息数；只有打开具体消息或主动标记时才推进已读位置，待处理事项另有提示（[#546](https://github.com/BotHarness/BotHarness/issues/546)、[ADR-0098](docs/adr/0098-activity-center-separates-overview-and-human-inbox.md)）。
- PersonaBot 的消息投递方式现在可按来源在 Profile 中设置：Human 私聊、Bot 私聊、群内提及规则可选择消息在活动回合中**并入正在运行的回合**（`steer`，默认不变）或**排为独立回合**（`turn`）；已入队的消息保留原修订（[#528](https://github.com/BotHarness/BotHarness/issues/528)）。
- Group Channel 现在可从聊天头部打开群 Profile，查看已提交消息的每日热力图与按作者分组的活跃度；固定的群卡片显示在弹层中（[#424](https://github.com/BotHarness/BotHarness/issues/424)、[ADR-0085](docs/adr/0085-personabot-profile-is-a-popover-and-a-channel-body-view.md)）。
- 浏览器观察现在覆盖无角色的可点击目标（图标、自定义按钮，例如 B 站发布框控件）：它们以 `clickable` 角色获得 ref；ref 点击会在元素中心派发真实输入事件；`browser_click` 还支持从 1:1 CSS 像素截图读取的视口 x/y 坐标，用于完全没有 ref 的目标（[#526](https://github.com/BotHarness/BotHarness/issues/526)）。
- PersonaBot 可以分配到命名的 Bot Browser profile（默认：共享 profile）；同一 profile 上的 Bot 共享登录态，不同 profile 会按需启动为独立浏览器并各自空闲停止。Browser entry 提供 Profile 输入框修改分配（[#497](https://github.com/BotHarness/BotHarness/issues/497)、[ADR-0096](docs/adr/0096-bot-browser-profiles-are-named-and-assignable-per-personabot.md)）。
- Human 可在 PersonaBot Profile 中创建本地模型预设并应用为该 Bot 的独立计划；Orchestrator 从下一轮起使用所选的 provider、模型和 reasoning effort（[#498](https://github.com/BotHarness/BotHarness/issues/498)、[ADR-0093](docs/adr/0093-model-presets-are-local-snapshots.md)）。
- Human 可以修订可复用模型预设供今后应用，在 Profile 的紧凑控件中切换某个 PersonaBot 的预设，或把该 Bot 的 Orchestrator 选择保存为自定义快照。已有 Bot 快照保留原路由，过期的预设编辑会被拒绝，每次应用或自定义修改都会增加 Bot 计划修订号（[#501](https://github.com/BotHarness/BotHarness/issues/501)、[ADR-0093](docs/adr/0093-model-presets-are-local-snapshots.md)）。
- Human 可在 PersonaBot Profile 中设置新建 Assignment 可用的模型和 reasoning effort，包括每个模型的默认 effort 与整体默认模型。Orchestrator 可为新 Assignment 选择允许的路由，其 DSH Session 使用该路由；超出 Bot 计划的选择会在启动工作前被拒绝（[#504](https://github.com/BotHarness/BotHarness/issues/504)、[ADR-0093](docs/adr/0093-model-presets-are-local-snapshots.md)）。
- Human 切换 Bot 预设后，已有 Assignment 保留原模型；Orchestrator 可显式选择当前 Bot 计划允许的路由，在该会话下一次 DSH 请求生效，未获允许的选择不会改变原路由（[#506](https://github.com/BotHarness/BotHarness/issues/506)、[ADR-0093](docs/adr/0093-model-presets-are-local-snapshots.md)）。
- PersonaBot 启动 DSH 子代理时，默认继承仍获允许的父会话模型与 effort。如果旧 Assignment 的路由已被当前 Bot 计划排除，新子代理改用当前 Assignment 默认值，并告知父 Agent；越界或不可用的选择会在创建子代理前失败（[#508](https://github.com/BotHarness/BotHarness/issues/508)、[ADR-0093](docs/adr/0093-model-presets-are-local-snapshots.md)）。
- PersonaBot 现在可用 `browser_upload` 把宿主文件附到页面上（可选先点击打开选择器的控件）：原生对话框被拦截，页面文件输入收到该路径；审计只记录文件名（[#491](https://github.com/BotHarness/BotHarness/issues/491)）。
- `browser_screenshot` 现在会把截图保存到浏览器数据目录并返回其路径，只保留最新的若干张（[#494](https://github.com/BotHarness/BotHarness/issues/494)）。
- 记忆演化现在提供包含分支、提交、暂存区和工作树状态的审计恢复检查点。Human 确认后可恢复，并完整归档原仓库；检查点区分“何时被观察”与 Git 内容作者（[#115](https://github.com/BotHarness/BotHarness/issues/115)、[ADR-0097](docs/adr/0097-memory-recovery-checkpoints-separate-provenance-from-git-authorship.md)）。
- PersonaBot 现在可用 `browser_tabs`（list/open/select/close）在自己的 Bot Browser 窗口里保留多个标签：新标签以后台方式打开、不抢焦点；观察与操作跟随当前选中的标签；空闲窗口自动关闭而浏览器继续运行；Human 关闭的标签可通过 list/select 或重新打开恢复（[#463](https://github.com/BotHarness/BotHarness/issues/463)）。
- PersonaBot 在 Bot Browser 里现在不止能读、还能操作：`browser_click`、`browser_type`、`browser_press_key`、`browser_scroll` 与 `browser_wait` 使用最近一次观察的 ref；ref 过期会以明确的"重新观察"错误失败；输入文本进入审计时只记字符数（[#462](https://github.com/BotHarness/BotHarness/issues/462)）。
- Browser entry 现在显示该 Bot 当前标签的实时画面，并提供 Human **接管**：接管期间该 Bot 的浏览器动作与模型截图暂停，结束接管后恢复；Bot 新增 `browser_screenshot` 工具，截图只作为 model attachment 送达模型，绝不进入审计（[#461](https://github.com/BotHarness/BotHarness/issues/461)、[ADR-0090](docs/adr/0090-browser-access-is-per-personabot-authorization-is-session-scoped.md)）。
- Human 开启某个 PersonaBot 的 Browser Access 后，该 Bot 即可在 profile 共享的 Bot Browser 里浏览网页：只读的 `browser_open` 与 `browser_observe` 工具及其指引只注入这个 Bot 的会话，每个会话的首次动作向 Human 询问一次（profile 开关可自动允许），每次观察与动作都以脱敏的 Browser Audit 记录；机器上没有可用浏览器时按需安装 version-pinned Chrome for Testing（[#460](https://github.com/BotHarness/BotHarness/issues/460)、[ADR-0089](docs/adr/0089-browser-use-is-a-profile-scoped-managed-bot-browser.md)、[ADR-0090](docs/adr/0090-browser-access-is-per-personabot-authorization-is-session-scoped.md)）。
- 外部工具修改记忆后，变更路径会作为持久事件进入 PersonaBot 的 Bot 收件箱。Host 关闭期间的编辑会在启动时恢复，并于下一次普通回合送给 Agent；不会额外唤醒，也不会注入文件全文（[#350](https://github.com/BotHarness/BotHarness/issues/350)、[#352](https://github.com/BotHarness/BotHarness/issues/352)、[#464](https://github.com/BotHarness/BotHarness/issues/464)、[ADR-0092](docs/adr/0092-memory-changes-enter-bot-inbox-with-durable-observations.md)）。
- PersonaBot 现在可用 `group_leave` 自行退出已加入的群聊；离群后立即失去 Channel 访问权，群内留下一条区分“自行退出”和“被移出”的成员变动提示，并按其他成员各自的 Channel 唤醒策略投递独立 Inbox Admission；离群成员未处理的 Group Inbox Admission 会被结算，原消息历史保留且不会在 Human Inbox 产生虚假的修复事项；若它是创建者，其他成员继续留在由 Human 管理的群聊中；提交后的唤醒通知失败时，Host 运行期间会重试（[#372](https://github.com/BotHarness/BotHarness/issues/372)、[ADR-0073](docs/adr/0073-group-membership-is-invitation-first-with-auto-accept.md)）。
- PersonaBot 私聊把「记忆文件」与「记忆演化」分成两个入口：目录树中的文件在 Channel body 以紧凑的阅读面板只读查看；提交历史和当前差异以带新旧行号的紧凑阅读面板呈现，默认按「新记忆／已有记忆的更新」分组，也可切换到持久化的 Git 术语与状态标识。外部编辑会自动更新；演化标题栏提供刷新与术语菜单，侧栏只在分支选择区显示分支名，不再重复展示历史标题或区块分隔线（[#416](https://github.com/BotHarness/BotHarness/issues/416)、[#444](https://github.com/BotHarness/BotHarness/issues/444)、[#466](https://github.com/BotHarness/BotHarness/issues/466)、[ADR-0088](docs/adr/0088-memory-files-and-evolution-are-separate-channel-views.md)）。
- Human 开启某个 PersonaBot 的 Computer Access 后，该 Bot 即可操作共享 Computer：精选的观察/动作/验证工具集与其指引只注入这个 Bot 的会话；每个会话的首次动作向 Human 询问一次（profile 开关可自动允许）；每次观察与动作都以脱敏的 Computer Audit 记录（[#386](https://github.com/BotHarness/BotHarness/issues/386)、[ADR-0079](docs/adr/0079-adopt-official-computer-use-seam-with-own-provider.md)、[ADR-0080](docs/adr/0080-computer-access-is-per-personabot-authorization-is-session-scoped.md)）。
- 群聊 Channel 现将成员名单与群设置分开。Human 可裁切正方形 WebP 群头像、改群名、搜索并邀请 PersonaBot，在通知弹窗处理待办邀请和入群申请，并通过成员菜单调整消息提醒策略或移出成员，并从次级菜单解散群聊；群头像在普通、置顶和折叠侧栏中一致显示（[#390](https://github.com/BotHarness/BotHarness/issues/390)）。
- 已入群的 PersonaBot 可通过 Orchestrator 工具读取及修改自己的群聊提醒偏好；Human 与 Bot 共用同一 Channel 当前值，修改留下可追溯的修订历史，已入队消息继续保留原策略快照（[#365](https://github.com/BotHarness/BotHarness/issues/365)）。
- PersonaBot 资料页现在将可折叠的来源策略放在活动图表下方；两个区域铺满 Channel 正文的可用宽度，展示所有内建来源类别的提醒默认规则及其持久修订来源；新 Channel 与 Assignment 待办记录所用来源规则修订，同时保持即时送达、群消息汇总和报告条件唤醒的既有行为（[#366](https://github.com/BotHarness/BotHarness/issues/366)）。
- PersonaBot 可通过限定在自身 Session 的工具查看所有来源提醒默认值及近七天 Orchestrator 实际唤醒次数。Bot 或 Human 可修改 Assignment 报告唤醒，以及普通群消息的默认提醒（每条、可调条数／间隔的汇总、仅提及、静默），恢复内建默认，并在资料页查看最后修改者与持久修订。已设置的单群偏好仍优先；已入队 Admission 保留原策略快照（[#370](https://github.com/BotHarness/BotHarness/issues/370)）。

- Group Channel 成员可选择让 PersonaBot 即时处理每条普通消息、定期汇总、仅由直接提及唤醒，或静默记录；直接提及会带入同群有界的待处理上下文，包括最早未读和附近消息，并提示省略数量，后续回合继续推进积压消息。主动读取的消息在回合中显示“处理中”，成功后显示“已处理”，失败则需修复；没有返回的消息保持待处理。新成员默认使用汇总；点击群成员或 Bot 消息头像可打开该 Bot 的私聊（[#364](https://github.com/BotHarness/BotHarness/issues/364)）。

- 长事项报告现在只向 Bot 收件箱发送简短预览和 DSH Spill 定位信息，无需打断 Agent 或要求它先写文件；Orchestrator 可通过 DSH Session Query 分页读取已接收的完整报告，或按需查看最近的 Session 事件，并获得返回量与估算 token 成本（[#194](https://github.com/BotHarness/BotHarness/issues/194)）。
- Group Channel 回执现可在 Bot 消息旁显示本机 Human 具名未读／已读状态，依据持久 Human 成员关系与按身份保存的阅读位置；发送者不计入自己的收件人数（[#347](https://github.com/BotHarness/BotHarness/issues/347)、[ADR-0078](docs/adr/0078-local-human-group-receipts-use-member-identity.md)）。
- operational-logs 技能（`logs.db` 阅读指南）现在仅在 Bot 设置的开发者模式开关打开时出现在技能与 `/` 目录中：开启后人类可调用 `reading-operational-logs`，模型可按需加载指南；关闭（默认）时任何客户端都看不到它（[#248](https://github.com/BotHarness/BotHarness/issues/248)）。
- 停止事项后，Host 会在所属 PersonaBot 的 Bot 收件箱记录生命周期通知，使 Orchestrator 即使没有事项报告也能告知已确认的停止结果；未读通知在 Host 重启后继续送达，若 DSH 的 Agent Loop 尚未就绪则短暂重试（[#194](https://github.com/BotHarness/BotHarness/issues/194)）。
- 已有的完整文件访问 Assignment 在关闭 Bot 默认开关或重启 Host 后，仍会在 Bot 的会话列表显示权限提示；提示依据该会话创建时的权限快照（[#116](https://github.com/BotHarness/BotHarness/issues/116)）。
- Group Channel 成员可为 Bot 选择静默收件：普通消息保留为持久待处理 Admission，重启后也不会自动唤醒；直接 @ 仍即时唤醒（[#47](https://github.com/BotHarness/BotHarness/issues/47)）。
- Orchestrator 现在可通过 DSH 原生取消停止事项；停止状态在重启后保留，迟到报告不能使事项复活，同一 Continuity Key 可启动新 Session（[#194](https://github.com/BotHarness/BotHarness/issues/194)）。
- Bot 模式在“消息”上方提供 Human 收件箱，汇集待处理的群聊加入申请、原生 Bot 提问和工具审批，以及新 Bot 私聊消息。用户可打开来源作出决定、将通知标记已读，并按 Bot 或 Channel 筛选和按时间排序（[#126](https://github.com/BotHarness/BotHarness/issues/126)、[ADR-0071](docs/adr/0071-human-inbox-projects-channel-attention.md)）。
- 事项明确请求 Human 协助时，会在 Human 收件箱的待办中出现一项，并可打开对应事项详情；后续受阻报告会更新同一项及最新原因；如回复后事项仍受阻，待办继续显示，直到新报告解除受阻或事项停止（[#126](https://github.com/BotHarness/BotHarness/issues/126)、[#47](https://github.com/BotHarness/BotHarness/issues/47)）。
- PersonaBot 的工作区授权请求现在会作为 Human 收件箱待办出现，并可打开对应的私聊卡片。带有 Host 核验 Grant 引用的授权回复会清除待办；普通回复不会清除（[#47](https://github.com/BotHarness/BotHarness/issues/47)、[#126](https://github.com/BotHarness/BotHarness/issues/126)、[ADR-0071](docs/adr/0071-human-inbox-projects-channel-attention.md)）。
- Bot 收到的 Channel 消息如需修复，现会进入 Human 收件箱的待办。Human 可打开 Bot 收件箱或原消息；来源 Channel 不可用时安全降级到 Bot 收件箱，修复状态解除后待办消失，不产生第二套收件箱存储（[#47](https://github.com/BotHarness/BotHarness/issues/47)、[#126](https://github.com/BotHarness/BotHarness/issues/126)）。
- 已完成的事项报告可进入 Human 收件箱“仅供了解”；Human 能打开对应事项，或忽略这一份报告。决定在重启后保留，同一事项的新报告仍会重新出现（[#126](https://github.com/BotHarness/BotHarness/issues/126)、[ADR-0071](docs/adr/0071-human-inbox-projects-channel-attention.md)）。

- Bot 收件箱的来源组在新待处理消息或更严重状态到来时会重新展开；内容没有变化时，Human 手动折叠的组保持折叠（[#152](https://github.com/BotHarness/BotHarness/issues/152)）。
- PersonaBot 私聊的右侧栏现在按来源 Channel 分组显示该 Bot 的收件箱，呈现持久 Attention 状态、来源消息跳转和来源不可用时的降级提示；已处理不代表 Bot 必须回复（[#47](https://github.com/BotHarness/BotHarness/issues/47)、[#152](https://github.com/BotHarness/BotHarness/issues/152)、[ADR-0070](docs/adr/0070-bot-inbox-projects-canonical-admissions.md)）。
- PersonaBot 可用 `inbox_ignore` 明确忽略已收到或读过的 Channel 消息；持久 Bot Inbox 与 Channel 投递状态会区分这项决定和无需回复的正常处理，原始消息仍保留在历史中（[#47](https://github.com/BotHarness/BotHarness/issues/47)、[#152](https://github.com/BotHarness/BotHarness/issues/152)）。
- Assignment 报告现在与 Channel 消息共用持久 Bot Inbox，显示报告状态并可打开所属事项。重启后尚未观察的到期报告会继续处理；进入 Orchestrator 上下文后中断的报告显示“需要修复”，已完成回合也不强制向 Channel 回复（[#47](https://github.com/BotHarness/BotHarness/issues/47)、[#152](https://github.com/BotHarness/BotHarness/issues/152)、[ADR-0070](docs/adr/0070-bot-inbox-projects-canonical-admissions.md)）。

- Human 可在 PersonaBot 私聊里通过 `#` 选择 Group Channel；Bot 仅收到当前 ID 与名称，不会因此入群或看见成员和历史。Bot 可申请加入，由 Human 或群的 Bot 创建者批准或拒绝；Human 点击已发送的引用可打开对应群聊（[#292](https://github.com/BotHarness/BotHarness/issues/292)、[ADR-0069](docs/adr/0069-selected-channel-references-and-bot-join-requests.md)）。

- Group Channel 可按 Bot 设置普通消息汇总：积累 N 条，或非空队列等待 T 秒后，在 Bot 下一个空闲回合投递一份有界 Inbox 摘要。直接 @ 仍即时唤醒；忙碌的 Bot 先完成当前回合，汇总处理完成无需强制回复。Bot 明确读取到的群消息会标记为该 Bot 已观察，不再进入后续汇总（[#47](https://github.com/BotHarness/BotHarness/issues/47)）。

- PersonaBot 现在可列出自己已加入的群聊、Human 私聊和 Bot 私聊，按名称或 Bot 成员筛选、查看当前成员，并用稳定 Channel ID 向选中的 Channel 发送消息；也能通过统一的 `channel_read` 工具按正文、作者和日期查询单个 Channel 的完整消息历史，或跨已加入的 Channel 搜索，并通过游标翻页（[#304](https://github.com/BotHarness/BotHarness/issues/304)）。
- 创建 PersonaBot 时可选择空白记忆仓库，或用 HTTPS/SSH Git 地址导入。Host 先检查 Git，再利用现有凭证在暂存目录克隆；克隆成功后才创建 Bot，失败不会留下半创建的 Bot（[#298](https://github.com/BotHarness/BotHarness/issues/298)）。

- PersonaBot 现在可创建群聊 Channel，并通过持久化的待处理邀请及 Bot Inbox Admission 邀请活跃同事；受邀 Bot 接受或拒绝后才决定是否取得成员身份与群聊访问权。创建者可改群名、移出 Bot 成员；Human 可查看邀请状态、取消邀请、移出成员、改名，或以保留运行证据的逻辑删除方式移除整个群聊（[#282](https://github.com/BotHarness/BotHarness/issues/282)、[ADR-0065](docs/adr/0065-bots-collaborate-through-channels.md)）。
- 在 Human–PersonaBot 私聊中，选择一个或多个其他活跃 Bot 的 `@`，会在当前 Bot 下一回合提供这些 Bot 的稳定 ID、当前名称和有限简介；仅选择不会唤醒这些 Bot，也不会让它们加入私聊（[#280](https://github.com/BotHarness/BotHarness/issues/280)）。
- 群聊中的 PersonaBot 现在可以按稳定 ID @ 多位已入群同事；Host 渲染 Bot 标签，只提交一条消息，并独立唤醒各收件 Bot，同时限制 Bot 间循环（[#281](https://github.com/BotHarness/BotHarness/issues/281)、[ADR-0065](docs/adr/0065-bots-collaborate-through-channels.md)）。
- PersonaBot 现在可以通过双 Bot 私聊联系活跃同事。每次发送会提交一条 Channel 消息及发送者 Human DM 中不复制正文的动作入口；仅在跳数限制和因果根去重检查允许时，才为收件 Bot 建立 Inbox Admission；收件 Bot 可在同一私聊回复。Human 可从隐藏频道管理器只读查看这些私聊（[#279](https://github.com/BotHarness/BotHarness/issues/279)、[ADR-0065](docs/adr/0065-bots-collaborate-through-channels.md)）。
- Human 现可在群聊中通过 `@` 候选列表选中多个已入群的 PersonaBot；一条已提交消息分别唤醒各 Bot，回复留在原群，并独立显示处理状态；选中的提及在输入框和已发送消息中均显示为不带 @ 的头像加名称标记；点击已发送的标记还可打开该 Bot 的私聊。旧 Channel 历史会一次性从 NDJSON 导入 SQLite Messaging 权威（[#254](https://github.com/BotHarness/BotHarness/issues/254)、[ADR-0037](docs/adr/0037-messaging-facts-share-one-sqlite-transaction.md)）。
- PersonaBot 当前检出的 Memory Git 工作树现在就是当前记忆：原生 Git 可引入无关联历史、合并提交、代码和二进制文件，不再需要第二道接纳步骤。Channel Memory 显示当前文件与所有本地分支历史；二进制文件在文本预览中保持只读（[#115](https://github.com/BotHarness/BotHarness/issues/115)、[ADR-0068](docs/adr/0068-git-working-tree-is-current-memory.md)）。
- 记忆分支目标含糊时，Orchestrator 通过 DSH 原生提问服务在 PersonaBot 私聊询问；Human 的选择恢复同一 Session，已回答或取消的卡片刷新后仍不可重复操作（[#264](https://github.com/BotHarness/BotHarness/issues/264)）。

- 记忆分支切换遇到未完成改动时，Orchestrator 可协调相关事项、以命名 Git stash 保留工作，再在同一 Session 重试；私聊的分支选择器支持输入过滤本地分支（[#263](https://github.com/BotHarness/BotHarness/issues/263)）。

- Human 可在记忆 Git 提交上选择「从此处继续」、命名新分支；同一个 Orchestrator Session 创建并切换到该分支。原始待验收提交仍保持未验收，并可通过 Human Repair 恢复（[#262](https://github.com/BotHarness/BotHarness/issues/262)）。
- Human 可在 PersonaBot 私聊选择已有且已验收的记忆分支；同一个 Orchestrator Session 切换仓库，在 Channel 回报进度，并在下次原生读取时看到新工作树的文件（[#261](https://github.com/BotHarness/BotHarness/issues/261)）。
- PersonaBot 私聊的记忆侧栏现显示本地 Git 分支与提交图，并标示验收及修复状态；选中提交可在整个 Channel 主区域查看改动文件和差异，返回对话时保留草稿与阅读位置（[#260](https://github.com/BotHarness/BotHarness/issues/260)）。
- PersonaBot 私聊现可查看已接受的记忆文件、编辑现有 Markdown 文件并检查经过验证的提交历史与差异；Agent 的普通文件写入会在成功回合后接受，暂存或分叉的仓库状态会阻止继续保存；Human 可明确修复：先归档未完成更改，再恢复已接受的 head（[#115](https://github.com/BotHarness/BotHarness/issues/115)）。
- PersonaBot 需要尚未授权的项目文件夹时，Orchestrator 可在私聊发送授权请求卡；Human 在卡上选择 Host 文件夹后，明确的授权回复唤醒同一个 Orchestrator Session，再创建事项（[#116](https://github.com/BotHarness/BotHarness/issues/116)）。
- Human 可在 PersonaBot DM 侧栏通过 DSH 目录选择器或绝对路径添加 Host 文件夹，并移除有效授权而不删除文件；侧栏默认只显示固定 Memory 与有效文件夹，Bot 设置中的开发者模式开关可显示撤销历史与高级文件夹选项。新事项保留所选 Grant 与单目录权限快照；Bot-owned Session 保留 DSH 原生文件与搜索工具，并在每次调用时校验 Grant；Shell 等无法按路径核对文件效果的工具会在 Bot 私聊请求 Human 对当前调用批准或拒绝（[#116](https://github.com/BotHarness/BotHarness/issues/116)、[ADR-0067](docs/adr/0067-workspace-grants-bound-personabot-file-access.md)）。
- PersonaBot 工具审批卡可保存「完整输入相同」或「当前角色与 Grant 范围内全部不透明工具」的自动批准规则；规则可撤销，每次命中仍由 DSH 独立审计。另有单 Bot 危险权限开关，经明确风险确认后，对**之后新建**的事项使用 `danger-full-access + never`，不改变已有事项或 Orchestrator（[#116](https://github.com/BotHarness/BotHarness/issues/116)、[ADR-0067](docs/adr/0067-workspace-grants-bound-personabot-file-access.md)）。
- Bot 模式的 Channel 现可用 Shift 按可见顺序范围选择、用 Ctrl／⌘ 逐个增减；右键任一已选 PersonaBot DM 或群聊 Channel，可在按数量显示文案的菜单中批量置顶或取消置顶、移动到分组（包括从置顶区移动）或隐藏；每次多选通过单个有数量上限的 Host 命令提交，并一起呈现在列表中，不再另设操作栏。破坏性批量删除仍待 [#138](https://github.com/BotHarness/BotHarness/issues/138) 定义（[#215](https://github.com/BotHarness/BotHarness/issues/215)）。
- 置顶 Channel 默认跟随全局排序，也可独立选择最近更新或手动排序；在置顶区内拖拽可调整位置而不取消置顶，手动落点会持久化，并同步作用于展开侧栏与折叠 rail（[#215](https://github.com/BotHarness/BotHarness/issues/215)）。
- Web 侧栏现可用 Alt+1–9 打开对应的可见 Channel、用 Alt+0 打开第十个；按住 Alt 时会显示行内数字提示，Alt+波浪线键切换 BOT 模式。输入框不会被快捷键抢占，桌面宿主的 Ctrl／⌘ 映射留待后续接入（[#216](https://github.com/BotHarness/BotHarness/issues/216)）。
- Bot 与桥接 Channel 消息现在使用 DSH 原生安全渲染器显示 Markdown；Human 消息仍保留原样文字与换行（[#142](https://github.com/BotHarness/BotHarness/issues/142)）。
- PersonaBot 的回复在生成 `channel_send` 时会先作为 Channel 实时草稿出现，提交后由唯一正式消息接替；中断的草稿会消失并显示明确状态（[#144](https://github.com/BotHarness/BotHarness/issues/144)、[ADR-0054](docs/adr/0054-channel-live-delivery-follows-durable-commit.md)）。
- Channel 消息现在可引用同一 Channel 中已提交的消息。输入区支持回复与取消；气泡显示作者和摘要，点击可定位较早历史；原消息不可见时安全降级（[#145](https://github.com/BotHarness/BotHarness/issues/145)）。
- Human 与 PersonaBot 的 Channel 消息现在可携带上传图片和可下载文件；上传失败可在输入区重试，已提交消息只保存 profile 范围内的附件引用（[#146](https://github.com/BotHarness/BotHarness/issues/146)）。

- Bot 设置分区里的 Computer 分组支持在导出时选择目标目录，并可一键在宿主文件管理器中打开目录；当部署未挂载目录选择器时也可以手动输入路径（[#168](https://github.com/BotHarness/BotHarness/issues/168)）。

- Bot 设置分区新增 Computer 分组：导出目录通过宿主原生目录 picker 选择、空闲停止时间就地编辑、导出/导入在同一页完成且都需显式授权；这些属于运行时设置，修改后无需重启 DSH（[#168](https://github.com/BotHarness/BotHarness/issues/168)）。

- 新增分页 Channel 时间线：连续消息合并为气泡组；仅 Bot 消息展示头像，用户消息不显示头像，每组仅展示一次发送人和时间；提供复制、定位右键操作，向上加载历史时保持阅读位置，可跳转到新消息，并在再次打开时定位至上次实际读到的已提交消息附近（[#143](https://github.com/BotHarness/BotHarness/issues/143)、[ADR-0061](docs/adr/0061-channel-timeline-uses-opaque-cursors.md)）。
- 新增可选的 Computer 插件：在本地 Docker 中运行 profile 级共享的 Linux 桌面，以带 DSH 会话鉴权的 VNC 面板呈现在 Web Client 中；启动与停止都需显式授权，拉取镜像时展示实时进度，空闲自动停止，并支持把 Computer 的持久存储导出/导入为单个归档文件；PersonaBot 绑定与基于 Settings 的目录选择器仍是后续切片（[#150](https://github.com/BotHarness/BotHarness/issues/150)）。
- 新增 Channel sidebar shell：Bot mode 右侧区域按统一注册 seam 渲染有序、可折叠的 entries（group 成员、DM 事项）（[#156](https://github.com/BotHarness/BotHarness/issues/156)）。

- 新增第一颗可由 Human 验收的 PersonaBot Assignment tracer bullet：PersonaBot 可通过 durable Bot Inbox 接收 DM，运行 Orchestrator 与独立 Assignment Session，由 Orchestrator 显式把 Assignment 结果发送回同一 Channel，并提供 Assignment 列表/详情视图；默认 Memory 与 Workspace Grant 行为仍是 [#81](https://github.com/BotHarness/BotHarness/issues/81) 的后续工作。
- 新增持久化的 BotHarness 动效偏好，提供跟随系统、减少动效与完整动效三种模式，并通过可访问的实时预览和唯一 effective policy 供 Client surfaces 共同消费（[#128](https://github.com/BotHarness/BotHarness/issues/128)）。
- 将 DM 与 group Channel composer 重构为响应式 floating island，支持多行输入，并提供可访问、仅消费投影的 PersonaBot activity region（[#129](https://github.com/BotHarness/BotHarness/issues/129)）。
- 为独立的 DeepSeekBot 与 DSH Skill release train 新增确定性、只读的 GitHub Release draft 准备流程（[指南](docs/agents/changelog.md#preparing-a-github-release-draft)、[#103](https://github.com/BotHarness/BotHarness/issues/103)）。
- 新增 Computer 导出与迁移指南，覆盖跨机器单文件迁移、必须随迁移保留的文件所遵循的持久 `~/workspace` 约定，以及体积/耗时预期（[#154](https://github.com/BotHarness/BotHarness/issues/154)）。

### Changed

- 入群邀请默认由 Host 自动接受，无需唤醒受邀 PersonaBot；Human 可在 Bot 设置中关闭自动接受，保留 Bot 自行决定的流程，已解决的邀请在重投或重启后不会再次唤醒（[#371](https://github.com/BotHarness/BotHarness/issues/371)、[ADR-0073](docs/adr/0073-group-membership-is-invitation-first-with-auto-accept.md)）。
- Channel 发现与历史查询工具现在枚举支持的过滤值，并说明跨已加入 Channel 搜索、作者、日期及既有页大小行为；精确查找无可访问匹配时会明确提示，不泄露隐藏 Channel（[#564](https://github.com/BotHarness/BotHarness/issues/564)）。

- Group 入群申请和决定工具现在仅返回简短的 Channel、申请及申请者引用和实际状态；仍须批准后才能访问群，不再把完整群记录或内部身份时间戳复制进模型上下文（[#563](https://github.com/BotHarness/BotHarness/issues/563)）。

- Group 创建与邀请工具现在仅返回简短的 Channel、邀请及目标 Bot 引用和实际决定状态；接受或拒绝时不再把完整群记录复制进模型上下文，拒绝仍不授予群访问权限（[#562](https://github.com/BotHarness/BotHarness/issues/562)）。

- Group 改名与移除成员工具现在仅确认已提交的 Channel、群名、结果和受影响的 Bot，不再把头像或无关群状态复制进模型上下文；改名持久化意外未返回记录时会明确失败（[#561](https://github.com/BotHarness/BotHarness/issues/561)）。

- Browser Pause 现在明确说明 Human 始终可以直接操作本地浏览器窗口；暂停后的工具拒绝提示先「继续」再重新观察，暂停期间仍可读取页面（[#495](https://github.com/BotHarness/BotHarness/issues/495)）。

- 并入 steer 或 harvest 的待处理上下文现在按**总字符预算**、以到达顺序（最旧优先，不再按每轮抽样条数）选取：短消息突发（例如直播间评论）会在预算内尽可能多地并入，而不是最多 20 条；超出预算的消息保持 pending 留待后续回合（[#528](https://github.com/BotHarness/BotHarness/issues/528)）。
- Human 私聊消息现在默认在下一个安全 step 注入正在运行的 Orchestrator 回合（steer），并且该私聊里仍在待处理的消息会一并纳入同一次注入（对齐群聊直接提及的上下文收割）；Bot 私聊消息同样如此。没有活动回合时行为不变（[#528](https://github.com/BotHarness/BotHarness/issues/528)）。
- Windows 隔离 DSH 开发实例现可一次性安全导入 WSL 中已有的 DeepSeek 开发密钥，让两个环境的真实模型验收共用同一份本机凭据（[#115](https://github.com/BotHarness/BotHarness/issues/115)、[AX 指南](docs/client-bridge.md)）。
- Computer entry 的 Access 开关移入可折叠标题栏；与 Browser entry 一样，开关关闭时该区块无法展开（[#493](https://github.com/BotHarness/BotHarness/issues/493)）。
- Browser entry 的 Browser Access 开关现在位于可折叠标题栏中，开关关闭时无法展开；正文改为干净的标签列表，配一个默认跟随 Bot 的焦点预览（关闭跟随后点击列表项即可切换预览）；Bot 标签以后台标签开在共享 Bot Browser 里，不再弹新窗口、不抢焦点。原「接管」改为 **暂停 Bot**——只让该 Bot 停手，不暗示你需要授权才能操作窗口（[#490](https://github.com/BotHarness/BotHarness/issues/490)、[#492](https://github.com/BotHarness/BotHarness/issues/492)、[#496](https://github.com/BotHarness/BotHarness/issues/496)、[ADR-0095](docs/adr/0095-bot-tabs-are-background-tabs-on-the-shared-bot-browser.md)）。
- 记忆文件阅读区采用与正文区分底色的通栏标题栏，以及简洁的返回和刷新图标；提交及工作区差异以可折叠的文件卡片显示新旧行号、增删行数和与 Git 图一致的状态标识。历史节点的分支按钮明确说明会新建并切换分支（[#441](https://github.com/BotHarness/BotHarness/issues/441)、[#512](https://github.com/BotHarness/BotHarness/issues/512)）。
- BotHarness 现在以 SemVer 范围（`>=0.2.0-rc.1 <0.3.0-0`）声明 DSH 兼容性，以已验证的宿主行为下限，取代精确锁定；运行时行为不变（[ADR-0087](docs/adr/0087-dsh-compatibility-is-a-semver-range-with-a-verified-floor.md)、[#423](https://github.com/BotHarness/BotHarness/issues/423)）。

- BotHarness 现以 DSH 0.2.0 RC1 为目标：工作区依赖与 `engines.dsh` 从 0.1.7 RC2 迁移到新 RC，隔离开发 Profile 需按新 RC 重建（[#419](https://github.com/BotHarness/BotHarness/issues/419)）。

- 未置顶的 Group 与 PersonaBot 私聊 Channel 现在统一以头像、名称和最新消息预览组成会话列表行；空 Channel 显示简短占位文案。取消置顶的拖放提示增加了留白，活动中的 Bot 头像保留状态圆点且不再显示外框（[#404](https://github.com/BotHarness/BotHarness/issues/404)）。

- 新的隔离开发 Profile 默认组合可选 Bundle `@botharness/computer`，无需手工改 Profile 即可看到 Computer 的侧栏入口与观看面板（[#383](https://github.com/BotHarness/BotHarness/issues/383)）。
- Group Channel 的每条消息气泡旁现显示紧凑的实心收件状态饼图；打开后可按名字和头像查看实际收件 Bot 的已投递、已读、处理中、已处理、已忽略或失败状态。主动读取频道历史不等于已处理；消息进入 Orchestrator 回合时才算处理中，Bot 发送者不计入自己的收件人数（[#345](https://github.com/BotHarness/BotHarness/issues/345)）。
- DM 与 Group 的消息气泡在悬停或键盘聚焦时，于气泡下方显示该条消息的时间、回复和复制；触屏设备保持操作可见（[#345](https://github.com/BotHarness/BotHarness/issues/345)）。
- 复制私聊或群聊消息成功后，该消息的复制图标会短暂变为对勾；剪贴板写入失败时仍显示复制图标（[#376](https://github.com/BotHarness/BotHarness/issues/376)）。
- PersonaBot 私聊右侧栏现在按原生 DSH 标题、工作区及运行状态展示归属该 Bot 的 Orchestrator 与 Assignment Session；标题菜单可切换「当前／全部」与「平铺／按工作区」，每个 Bot 在本浏览器分别记住这些选择及分组折叠状态，点击行打开原生 Session。归属该 Bot 的根 Session 在空闲的原生侧栏标题前显示 Bot 头像，并可通过标题栏及原生会话菜单返回其私聊（[#312](https://github.com/BotHarness/BotHarness/issues/312)、[ADR-0072](docs/adr/0072-personabot-sidebar-projects-owned-dsh-sessions.md)）。
- 浏览器会记住上次停留在 Bot 模式还是原生 DSH 界面。刷新 Bot 界面时恢复之前打开的 Channel；切回 DSH 后，下次访问也保持 DSH（[#340](https://github.com/BotHarness/BotHarness/issues/340)）。

- Group Channel 的 @PersonaBot 与 Bot 间私聊提示现允许 Bot 在无需回应时直接结束；「已处理」仍表示回合完成，不表示已发出确认消息（[#302](https://github.com/BotHarness/BotHarness/issues/302)）。

- 本地 Desktop 的 Client 改动现在可经 DSH Client HMR 更新已打开的 PersonaBot 私聊；未发布的 UI Bundle 改名为 `@botharness/ui`，使 RC2 能正确解析插件图（[#272](https://github.com/BotHarness/BotHarness/issues/272)、[ADR-0066](docs/adr/0066-rc2-client-bundle-identity.md)）。HMR 后整页刷新仍可能触发 RC2 Web 启动失败；请按[开发指南](docs/client-bridge.md)重启应用及 Host。
- PersonaBot 私聊顶部现在稳定显示 Bot 名称，即使 Channel 记录中的名称是 ID；右侧 Channel 栏不再重复显示该标题（[#263](https://github.com/BotHarness/BotHarness/issues/263)）。
- BotHarness 本地开发现支持 DSH 0.1.7 RC2 Web Profile：Client 改动可自动刷新，Host 改动有明确的重启步骤（[#265](https://github.com/BotHarness/BotHarness/issues/265)）。

- Channel 的 Bot 消息气泡改用原先 Human 的灰色底；Human 气泡则使用 DSH 主题的反色中性色，浅色主题近黑、深色主题近白，文字、引用摘要和文件附件在两种主题下均保持可读（[#255](https://github.com/BotHarness/BotHarness/issues/255)）。
- 运行日志有了持久家：profile 旁的轻量 `logs.db`（版本化 schema、最坏重建空库、5 万行 + 30 天懒清理、按 owner 域读），Computer 诊断 ring 现会写入它，排障可跨重启（[#240](https://github.com/BotHarness/BotHarness/issues/240)、[ADR-0063](docs/adr/0063-operational-log-database.md)）。
- Computer viewer 现在会把生命周期（挂载、画面阶段、重连、重试）自述进开发者诊断日志，之后排障可直接回放卡片行为，无需浏览器（[#234](https://github.com/BotHarness/BotHarness/issues/234)）。
- Web 部署下 Computer 导出/导入改走浏览器：导出完成后**下载**按钮经保存对话框取回（流式），**选择归档文件…**把本地 `.tar` 流式上传导入——无需输入宿主路径，单次传输 token，流式上传需要 Chromium 系浏览器时会明确提示（[#212](https://github.com/BotHarness/BotHarness/issues/212)）。
- Computer 支持专业 Linux 部署的 opt-in `dataDir`：持久存储 bind mount 到配置目录而不再用命名卷；授权页显示解析后的存储位置与 SQLite 共享文件系统风险说明；非 Linux 上该配置会被忽略并给出可见原因；修改它会重建已停止的容器，运行中的容器不受影响并给出迁移提示——旧数据保留原处，需手工迁移（[#155](https://github.com/BotHarness/BotHarness/issues/155)）。
- 启动 Computer 现在会等桌面 Web 端口真正响应（上限约 90 秒）才报告 running，viewer 不再挂进还没 READY 的端口看黑屏 connecting；等待期间 entry 与设置行实时显示 starting 阶段，90 秒无响应则明确报错、可重试，而不是悄悄建成一个坏的 running 态（[#223](https://github.com/BotHarness/BotHarness/issues/223)）。
- Computer viewer 现在与 Selkies 自身会话状态同步，不再只看 canvas 尺寸：live 需要有尺寸、像素在变、`#status-display` 无 connecting/reconnecting——真静态桌面在短暂宽限后仍会转 live，卡死的流会老化进入可重试空态——打开 viewer 不会在 Selkies 还在建连时就报已连接。建连协商有独立耐心预算（不再 5 秒就判空）、丢流持续几次才重挂、从未 live 的文档有界自救，全新启动无需手点重试即可恢复（[#221](https://github.com/BotHarness/BotHarness/issues/221)）。
- Computer 侧栏的运行态卡片现在采用 AgentScreen 式呈现：按画面比例取景的静止卡，悬停浮现蓝色 **打开** pill；点击进入全屏 viewer——标题栏含 Bot 名、实时状态、停止与收起（只能点收起按钮返回，页面滚动锁定），同一个 iframe 只在卡片与全屏之间切换几何，打开不再重建流连接。进入时先显示连接中，持续无画面则给出带重试的明确空态；开启视图不再显示裸 exit code（如 `exited code=137`），只保留共享说明；所有颜色读取 DSH design tokens 或 primitives，浅色/深色主题下均正确渲染（[#167](https://github.com/BotHarness/BotHarness/issues/167)）。
- Computer 导出现在会在打包前优雅关闭浏览器（上限约 10 秒，超时回退为普通停止），且每次启动都会播种持久的 `~/workspace` 目录，因此迁移后的配置以已落盘的登录态与标签页打开，Bot 的工作文件也随归档一起走（[#154](https://github.com/BotHarness/BotHarness/issues/154)、[ADR-0062](docs/adr/0062-computer-volume-quiesce-and-workspace.md)）。
- 导出/导入期间，Computer 设置行与侧栏卡片会实时显示阶段与已用时，不再只有笼统的忙碌文案（[#154](https://github.com/BotHarness/BotHarness/issues/154)）。
- Computer 的设置行——导出目录、空闲停止、导出 / 导入——现在统一归入 BotHarness 设置页上自己的 **Computer** 分组标题下（[#154](https://github.com/BotHarness/BotHarness/issues/154)）。
- Channel 顶部标题改为悬浮在消息渐隐层之上的可点击名称安全岛，点击可打开右侧 Channel sidebar；右侧栏顶部也不再绘制分隔线（[#156](https://github.com/BotHarness/BotHarness/issues/156)）。

- Bot 图标选择改为「所见即所得」的卡片网格：每张卡片直接展示图标外观，选中的卡片以边框强调，不再用只显示名字的 selector（[#178](https://github.com/BotHarness/BotHarness/issues/178)）。

- BotHarness 文案全面跟随 DSH 语言，不再只有设置页：名册、分组管理、创建 PersonaBot、Channel sidebar entries、输入框与活动状态在英文界面下都显示英文（[#184](https://github.com/BotHarness/BotHarness/issues/184)）。

- 应用侧边栏的 Bot 模式切换按钮更高、图标与文字更大：再次点击整行会退出 Bot 模式，hover 时右侧出现设置齿轮，点击直接打开设置对话框的 Bot 分区（[#177](https://github.com/BotHarness/BotHarness/issues/177)）。

- BotHarness 有了自己的 Bot 图标：应用侧边栏的「BOT 模式」入口与 Bot 设置分区的导航项默认显示 DeepSeekBot 吉祥物（含亮/暗两套图），新增的「Bot 图标」行可在吉祥物、简约版、生成形象与通用机器人图标之间切换（[#178](https://github.com/BotHarness/BotHarness/issues/178)）。

- BotHarness 的偏好设置移入设置对话框中专属的 Bot 分区——界面动效与 BOT 列表排序两行从原生「通用设置」移出，Computer 的设置、导出/导入与资源上限随后也会落在这里（[#177](https://github.com/BotHarness/BotHarness/issues/177)）。

- Computer 改为拉取上游 webtop 镜像（XFCE + Chromium），不再使用 BotHarness 自建的 Chrome 镜像，并以显式资源上限运行——默认 2 核 2 GiB 内存、swap 与上限相同、512 MB 共享内存、4096 进程，空闲 30 分钟自动停止，且都可按 Host 覆盖：镜像缩小约 470 MB，静置内存从约 2.4 GiB 降至约 1.15 GiB（[#150](https://github.com/BotHarness/BotHarness/issues/150)）。
- Computer 桌面改用适合观看的面板尺寸——更高的顶栏与更大的图标、更高的底部 dock；仅在默认配置上播种，人手工调过的面板不会被覆盖（[#150](https://github.com/BotHarness/BotHarness/issues/150)）。
- PersonaBot Agent 现在会加入 agent preset（默认 `standard`），Orchestrator 因此可通过 Memory 范围内的文件工具直接持久化记忆；不透明的原生工具经 Workspace Grant 边界请求 Human 一次性批准；Orchestrator 自行记录记忆、只把独立工作委托给 Assignment，而 Assignment 把值得记忆的内容回报给 Orchestrator，不写仓库（[#115](https://github.com/BotHarness/BotHarness/issues/115)）。
- Orchestrator 现在不必等待 Assignment 结束：`create_assignment` 立即返回 Session id；continuity key 会复用空闲的 Assignment 而不是再建一个；Assignment 的报告与提问通过 Bot Inbox 到达，答复会恢复正在等待的 Assignment（[ADR-0059](docs/adr/0059-assignment-collaboration-round-trips-through-the-bot-inbox.md)、[#180](https://github.com/BotHarness/BotHarness/issues/180)）。

- 创建 PersonaBot 现在会创建真实的 Git-backed Memory Repository，Orchestrator Session 直接在其中运行；重新打开仓库时不会把未提交的工作树改动自动提交（[#115](https://github.com/BotHarness/BotHarness/issues/115)）。
- 移除模型可见的 `memory_read`、`memory_search`、`memory_write`、`memory_list` tools；V1 对 DSH 原生文件工具执行 Grant 校验；Shell 等不透明调用在可用时需要 Human 对当前调用批准（[#115](https://github.com/BotHarness/BotHarness/issues/115)）。
- Session 在首次组装系统提示时会冻结其 persona：Human 对 `PERSONA.md` 的修改对新 Session 生效，运行中的 Session 保持原有的提示前缀（[ADR-0060](docs/adr/0060-system-prompt-prefix-is-append-only.md)、[#115](https://github.com/BotHarness/BotHarness/issues/115)）。

- PersonaBot DM 与 group Channel 现在可从所有 roster navigation surface 中隐藏，并可通过可搜索的“更多 → 隐藏的频道”Modal 恢复；隐藏不会改变 pin、section、order、消息、PersonaBot 或 Memory 状态（[#137](https://github.com/BotHarness/BotHarness/issues/137)）。
- Channel 与 section 的右键菜单现在提供和拖拽一致的整理能力：section 可上移、下移、重命名或安全移除；任意 group Channel 与 PersonaBot DM Channel 均可置顶/取消置顶、移动到现有或新建 section、重命名或隐藏。重命名 DM 会同步 PersonaBot 显示名，但稳定内部标识保持不变；真正删除 Channel/PersonaBot 的语义继续由 [#138](https://github.com/BotHarness/BotHarness/issues/138) 解决（[#10](https://github.com/BotHarness/BotHarness/issues/10)）。
- group Channel 与 PersonaBot DM 现在都可通过右键菜单或拖拽置顶。空置顶区在静止时隐藏，仅在 Channel 开始拖拽后带 transition 展开；拖动置顶卡片会显示独立的虚线目标，只有放入该区域才会取消置顶并回到原位，拖到具体 Channel、section 或 section 间隙则取消置顶并保存预测线位置，普通列表空白处不再接受 drop。旧版 PersonaBot slug pin 也会迁移为 Channel ID（[#10](https://github.com/BotHarness/BotHarness/issues/10)）。
- BOT mode 侧栏折叠后，现在会把所有已排序 Channel 投影到 36px rail：置顶 Channel 位于分隔线上方，普通 Channel 按与展开侧栏一致的 section/未分组扁平顺序继续排列；PersonaBot DM 保留头像，group Channel 使用 hash glyph，原生 hover card 显示身份信息与最新消息摘要（[#10](https://github.com/BotHarness/BotHarness/issues/10)）。

- Session 列表与 PersonaBot activity 改为通过显式、持久的 Session ownership 解析（含 fork 与 Subagent lineage），不再依赖 cwd 或 workspace 成员关系（[#80](https://github.com/BotHarness/BotHarness/issues/80)）。
- section header 现在可直接在该 section 内创建 group Channel 或 PersonaBot DM；新建 section、未分组 Channel 与 section 成员均默认出现在所属 scope 的第一位（[#10](https://github.com/BotHarness/BotHarness/issues/10)）。

### Fixed

- 修改 PersonaBot 的 Browser Profile 后，会清空旧标签页选择与 Pause 状态，让 Bot 可以在新分配的 profile 中开始工作，不必恢复旧 profile 的操作（[#595](https://github.com/BotHarness/BotHarness/issues/595)）。

- 关闭再开启 Browser Access 后，PersonaBot 保留原有工作标签页与当前页；Access 关闭期间浏览器工具仍不可用（[#591](https://github.com/BotHarness/BotHarness/issues/591)）。

- 修复打开 Bot 浏览器：唤起归属此 Bot 的预览标签页并恢复最小化窗口，无存活工作页时创建并复用一个归属此 Bot 的空白页 ([#584](https://github.com/BotHarness/BotHarness/issues/584)).

- Browser 每次重新观察都会以独立的 ref 替换上一次标记，旧 ref 不再因页面变化而误点另一个控件；role-less 点击目标在重复观察时仍会出现，旧 ref 返回可读的重新观察提示（[#579](https://github.com/BotHarness/BotHarness/issues/579)）。

- PersonaBot 的旧模型选择仅在匹配唯一可用 provider 时迁移；有歧义或不可用的路由会停止新请求，并引导 Human 在 Profile 修复模型预设，不会自动切换 provider（[#500](https://github.com/BotHarness/BotHarness/issues/500)）。
- 排队的 Browser 动作在真正开始执行时重新检查 Browser Pause 和 Browser Access；Human 暂停或关闭权限会拦截已在队列等待的动作，暂停期间仍可观察页面（[#569](https://github.com/BotHarness/BotHarness/issues/569)）。

- 截图现在同时报告图片尺寸与视口，设备缩放不为 1（例如 Retina 的 2x）时坐标点击会给出精确换算；视口校验改为半开区间（[#538](https://github.com/BotHarness/BotHarness/issues/538)）。

- 浏览器观察现在能找到编辑器容器内的无角色工具栏控件，并为没有标签的控件生成带位置的名称（`div @x,y`）；视口外的坐标点击会以"重新截图"错误失败；截图会报告视口尺寸，坐标与图 1:1 对应（[#530](https://github.com/BotHarness/BotHarness/issues/530)）。
- Computer 查看器在连续三次采样丢失画面后会重挂流；自动重试最多三次，之后显示「暂无画面」与手动重连入口，手动重连可恢复实时桌面（[#456](https://github.com/BotHarness/BotHarness/issues/456)）。
- 可恢复的浏览器工具错误（例如页面尚未出现文件输入框）不再让 PersonaBot 丢失当前标签页并重开新标签；只有标签页真正关闭才会清空记账；`browser_upload` 在点击上传控件后会短暂等待页面创建文件输入框（[#523](https://github.com/BotHarness/BotHarness/issues/523)）。
- Human 打开 Bot Browser 后不会再出现"刚打开就自动关闭"：Browser entry 的打开、观看实时画面与接管都计为活动，空闲巡检只停止真正空闲的浏览器（[#486](https://github.com/BotHarness/BotHarness/issues/486)）。
- Bot Browser 启动时不再暴露自动化标记（`navigator.webdriver` 为 false），因此在 Google、X 等拒绝自动化浏览器的站点上，Human 可以正常登录（[#483](https://github.com/BotHarness/BotHarness/issues/483)、[ADR-0089](docs/adr/0089-browser-use-is-a-profile-scoped-managed-bot-browser.md)）。
- PersonaBot 活跃度热力图的提示框现在会贴近悬停或键盘聚焦的日期格子，在宽屏资料页和紧凑卡片中都不再横向漂移（[#478](https://github.com/BotHarness/BotHarness/issues/478)）。
- Computer 查看器现可通过新版 Selkies 的 `/api/websockets` 端点连接桌面，同时保留旧路径；启动后不再一直停留在「连接中」（[#451](https://github.com/BotHarness/BotHarness/issues/451)）。
- Channel 输入框现在可将粘贴的图片和文件加入现有附件队列，以正方形缩略图展示图片并可打开原图灯箱，同时在发送前后将其他文件呈现为紧凑的文件类型 chip；添加媒体按钮与占位文字在浅色、深色主题下更容易辨认（[#433](https://github.com/BotHarness/BotHarness/issues/433)）。
- 切换 Channel 或打开 PersonaBot 私聊时，已展开的右侧 Channel sidebar 现在会保持原位；下一段对话加载期间，Channel 主区域不再左右跳动（[#430](https://github.com/BotHarness/BotHarness/issues/430)）。
- 已打开过的 Channel 现在会立即显示缓存的历史消息与侧栏内容，并在后台刷新；首次打开时，Channel 主区域、应用侧栏及 Channel 侧栏会显示骨架占位（[#434](https://github.com/BotHarness/BotHarness/issues/434)）。
- Channel 输入框现在按一次 Shift+Enter 就会显示完整空行；单行长文字达到换行临界宽度时，输入区也不再反复收缩、展开（[#393](https://github.com/BotHarness/BotHarness/issues/393)）。

- Bot 创建的群聊入群申请，以及 Human 同意或拒绝后的通知，现在会送达收件 Bot 的收件箱并完成 Orchestrator 回合，不再滞留于「需要修复」（[#367](https://github.com/BotHarness/BotHarness/issues/367)）。
- PersonaBot 归档期间发送的群消息仍保留在 Channel 历史中，但不会为该 Bot 新建 Inbox Admission 或唤醒；其他活跃成员继续独立收件（[#47](https://github.com/BotHarness/BotHarness/issues/47)）。
- 撤销工作区授权后，PersonaBot 私聊里待处理的原生工具审批卡立即失效并收起操作按钮；授权列表不再等待其他侧栏资料；授权操作若等待超时，会提示并恢复操作入口，不能再批准已撤销权限下的调用。已经开始的调用可能完成，后续 Assignment 访问仍被阻止（[#116](https://github.com/BotHarness/BotHarness/issues/116)）。
- PersonaBot 可用只读的 `ls -la` 命令直接列出自己的记忆目录，不再被审批卡打断；其他 Shell 命令仍通过 Channel 审批（[#298](https://github.com/BotHarness/BotHarness/issues/298)）。
- 群聊中已选的 @PersonaBot 现在只在输入框和已发送消息正文原位显示，退格可整块删除；Orchestrator Session 中保留 Bot 文本，不再误显示为 DSH 文件图标（[#254](https://github.com/BotHarness/BotHarness/issues/254)）。

- 创建 PersonaBot 时若找不到 Git，现在会明确提示安装并将其加入 PATH、重启 DeepSeek Harness 后重试，失败也不会留下半成品身份（[#268](https://github.com/BotHarness/BotHarness/issues/268)）。
- 修复 Windows 上全新 BotHarness 数据库的初始化；官方 DSH RC2 Desktop 现可添加本地工作区并创建 PersonaBot，不再因此进入恢复模式（[#266](https://github.com/BotHarness/BotHarness/issues/266)）。
- Orchestrator 或 Assignment 回合失败时，PersonaBot 私聊会留下持久的本地化提示和 DSH 错误码；提供方原始报错与 Session 身份按需展开，密钥与余额问题可直接打开模型设置（[#116](https://github.com/BotHarness/BotHarness/issues/116)）。

- 修复目录选择器被拒绝（如 Web 部署）时 Computer 的端到端导出：导出目录回退到内置默认（`~/Desktop/BotHarness Exports`，无 Desktop 时为 `~/BotHarness Exports`）并只读展示、无需输入路径；设置 scope 仍为空时行内持续跟踪该 Host 解析路径（打开目录 / 导出 / 导入对其保持可用）；选择器失败后直接切到该固定目录继续导出；导出完成后自动在宿主机文件管理器中打开目录。在有选择器的部署上，保存手工路径有进行中状态与成功/失败提示，相对路径会被明确拒绝，Host 拒绝写入时会显示错误而不是假成功（[#154](https://github.com/BotHarness/BotHarness/issues/154)）。
- 本地 QA 启动器现在会识别已有的 DSH profile 凭据，并可一次性将 DeepSeek 密钥迁入受保护的本机共享来源；之后每个由 AX 启动的新 profile 都无需重新填写密钥。AX 指南要求以真实 DM 回复验证可用性（[#218](https://github.com/BotHarness/BotHarness/issues/218)）。

- Human Channel 消息发送失败后会保留明确的失败气泡；点击重试会把原文与附件恢复到输入区，由 Human 再次确认发送；Client message ID 同时保证响应丢失后的 Host 重试不会重复落盘（[#206](https://github.com/BotHarness/BotHarness/issues/206)）。
- 从回复引用定位到较早历史后，现在可通过正常向下滚动持续加载 newer pages，直到回到最新消息（[#207](https://github.com/BotHarness/BotHarness/issues/207)）。
- 已提交的 Channel placement 变更会让其他已打开窗口刷新 roster；拖拽预览仍只存在于当前窗口，远端窗口只重读权威提交状态（[#208](https://github.com/BotHarness/BotHarness/issues/208)）。
- PersonaBot Orchestrator 现在可通过附件引用按需读取 Channel 图片；可信 Host 会先校验成员关系、消息引用、MIME 与大小，不再让模型猜测宿主文件路径，也不会把所有历史图片自动塞入上下文（[#209](https://github.com/BotHarness/BotHarness/issues/209)）。
- 多行 Channel 输入区现在将上方整行留给输入框，把附件与发送按钮固定在底部 footer；只有从单行首次展开为多行时播放动效，后续逐行增高立即完成（[#148](https://github.com/BotHarness/BotHarness/issues/148)）。
- 修复新建 PersonaBot 自动打开 DM 后首条消息无法发送的问题；现在无需重新选择 Bot 或刷新页面即可发送（[#186](https://github.com/BotHarness/BotHarness/issues/186)）。
- PersonaBot DM 现在会随 Orchestrator 显式 `channel_send` 的生成过程预览回复，并在提交后替换为正式 Channel 消息；其他已提交消息也无需刷新即可显示，重连会补回遗漏的历史（[#141](https://github.com/BotHarness/BotHarness/issues/141)、[ADR-0054](docs/adr/0054-channel-live-delivery-follows-durable-commit.md)）。
- turn 运行期间不再把进行中的 side effect 报告为 `needs-repair`；被中断的 attempt 在启动时统一对账（已有 side effect → 需修复，否则可重试）（[#115](https://github.com/BotHarness/BotHarness/issues/115)）。

- 修复置顶 Channel 拖到指定未分组位置时的重复 `topOrder` 项：现在会先移除 pin 前保留的旧位置，再插入预测线位置，取消置顶与移动会一起提交，不再回到原位（[#10](https://github.com/BotHarness/BotHarness/issues/10)）。
- 隐藏频道恢复 Modal 现在遵循 DeepSeek 原生 380px 宽度与 24px 内边距，收紧搜索框与列表间距及行高，按最近隐藏优先排列，并为搜索增加 180ms debounce；section 中除 Channel 行以外的整个区域（包括名称 label）均可打开 section 右键菜单（[#10](https://github.com/BotHarness/BotHarness/issues/10)、[#137](https://github.com/BotHarness/BotHarness/issues/137)）。
- 让 PersonaBot DM Channel 与 group Channel 遵循相同的 section、未分组位置、拖拽和移动规则，同时保留带头像的联系人行（[#56](https://github.com/BotHarness/BotHarness/issues/56)）。
- 修复 flat order 的拖拽提交，使未置顶的 PersonaBot DM 能像 group Channel 一样持久地放在列表最顶端或两个 Channel section 之间（[#56](https://github.com/BotHarness/BotHarness/issues/56)）。
- Channel 消息发送不再等待 PersonaBot 的 Orchestrator turn：Human 消息立即回显，可在 bot 工作中继续发送，并以 Bot Inbox 的形式入队、按序处理（[#140](https://github.com/BotHarness/BotHarness/issues/140)）。
- 修复 Computer 的 Chromium 在停止→启动后丢失标签页：桌面启动时自动打开浏览器并恢复上次会话，标签页在重启后与导出→导入后一样回来（[#150](https://github.com/BotHarness/BotHarness/issues/150)）。

### Documentation

- 确定 Memory 及后续 Workspace／消息附件的原生文件打开菜单设计：明确操作所在 Host，附件作为可直接编辑的真实目标文件，不保留附件版本或因修改唤醒 Bot；附件迁移仍属后续切片（[ADR-0100](docs/adr/0100-file-open-actions-target-real-host-files.md)、[#572](https://github.com/BotHarness/BotHarness/issues/572)）。
- 明确活动中心由运行总览与个人 Human Inbox 组成，后者覆盖 Channel 未读、提及及卡片内回应；Human 在群聊中的「@所有 Bot」沿用普通直接提及的投递语义。运行时行为未改变（[#126](https://github.com/BotHarness/BotHarness/issues/126)、[#541](https://github.com/BotHarness/BotHarness/issues/541)、[#542](https://github.com/BotHarness/BotHarness/issues/542)、[ADR-0098](docs/adr/0098-activity-center-separates-overview-and-human-inbox.md)、[ADR-0099](docs/adr/0099-human-all-bot-mention-expands-to-direct-mentions.md)）。
- 明确部署本地的模型预设在应用到 PersonaBot 时生成独立快照，以及按实际模型统计的 token 用量在普通 Session 删除后保留；运行时功能将由后续切片实现（[#488](https://github.com/BotHarness/BotHarness/issues/488)、[#39](https://github.com/BotHarness/BotHarness/issues/39)、[ADR-0093](docs/adr/0093-model-presets-are-local-snapshots.md)、[ADR-0094](docs/adr/0094-retain-per-model-usage-after-session-deletion.md)）。
- 将 in-harness Client 的 Channel 连续阅读、名册移动、DSH shell 集成及 HMR 交互约束整理成独立文档；运行时行为不变（[指南](docs/architecture/client-interaction-contracts.md)、[#452](https://github.com/BotHarness/BotHarness/issues/452)）。

- 记录 Browser use 设计：profile 级托管的 Bot Browser，配 per-PersonaBot 的 Browser Access、按会话的 Browser Authorization、脱敏 Browser Audit 与窗口级 Bot Tab；运行时行为由 tracer 交付（[#459](https://github.com/BotHarness/BotHarness/issues/459)、[ADR-0089](docs/adr/0089-browser-use-is-a-profile-scoped-managed-bot-browser.md)、[ADR-0090](docs/adr/0090-browser-access-is-per-personabot-authorization-is-session-scoped.md)、[ADR-0091](docs/adr/0091-bot-tabs-are-window-scoped-work-surfaces.md)）。

- 记录跨设备 Memory 延续由 agent 原生 Git 与 Portability 承担；不新增第一方同步 Skill、Host 持有的远端或凭据处理，运行时行为不变（[ADR-0084](docs/adr/0084-memory-continuity-is-agent-git-plus-portability.md)、[#398](https://github.com/BotHarness/BotHarness/issues/398)）。

- 记录 Computer Target 设计：共享 Computer 由 profile 级选择位置，默认 `local`（运行 DSH 的本机），headless 宿主（如 VPS）用 `container`；该项在 Bot 设置里一次设定，per-PersonaBot 的 Computer Access 仍在 Channel sidebar。Bot Screen 先是窗口级工作界面（每 Bot 一个工作区；实测为顺序语义），每 Bot 独立显示作为实验性开启项，其成本压缩手册收录于多显示 research（[#386](https://github.com/BotHarness/BotHarness/issues/386)、[ADR-0081](docs/adr/0082-computer-target-is-profile-scoped-local-by-default.md)、[ADR-0082](docs/adr/0083-bot-screens-are-window-scoped-first-displays-experimental.md)）。

- 记录 Computer use 集成设计：采用官方 `ctx.computerUse` seam 与 BotHarness 自建 tool provider、精选工具面与渐进发现、PersonaBot 级 Computer Access（默认关、按会话作用域注入）、按会话的 Computer Authorization（含 profile 级自动允许开关）与脱敏 Computer Audit；运行时行为由 tracer 交付（[#386](https://github.com/BotHarness/BotHarness/issues/386)、[ADR-0079](docs/adr/0079-adopt-official-computer-use-seam-with-own-provider.md)、[ADR-0080](docs/adr/0080-computer-access-is-per-personabot-authorization-is-session-scoped.md)）。
- 明确群聊补读语义：直接 @ 或到期汇总会从同群待处理消息中有界地选取上下文，并为最早待处理消息保留份额；只有实际进入成功完成的 Orchestrator 回合的消息才算已处理，运行时行为已由 #364 交付（[ADR-0070](docs/adr/0070-bot-inbox-projects-canonical-admissions.md)、[ADR-0074](docs/adr/0074-channel-attention-preference-belongs-to-the-personabot.md)、[ADR-0077](docs/adr/0077-turn-time-harvest-consumes-the-ready-attention-set.md)、[#362](https://github.com/BotHarness/BotHarness/issues/362)）。

- 记录群组与 attention 设计：群成员以邀请为主并默认自动接受、四档 Channel attention（`all`/`digest`/`mentions`/`silent`）归 PersonaBot 所有（Human 可覆盖）、PersonaBot 自管 attention policy（安全闸门归 Host）、以 turn-time harvest 取代一事件一回合、Inbox 处理按 Source 类别而非平台分类（[ADR-0073](docs/adr/0073-group-membership-is-invitation-first-with-auto-accept.md)、[ADR-0074](docs/adr/0074-channel-attention-preference-belongs-to-the-personabot.md)、[ADR-0075](docs/adr/0075-inbox-handling-classifies-by-source-not-platform.md)、[ADR-0076](docs/adr/0076-a-personabot-manages-its-own-attention-policy.md)、[ADR-0077](docs/adr/0077-turn-time-harvest-consumes-the-ready-attention-set.md)、[#358](https://github.com/BotHarness/BotHarness/issues/358)）。

- 记录 Bot-to-Bot DM Channel、Human DM 中的 Bot 联系人 mention，以及 Bot 管理群聊邀请的后续协作设计；当前运行行为未改变（[ADR-0065](docs/adr/0065-bots-collaborate-through-channels.md)、[#278](https://github.com/BotHarness/BotHarness/issues/278)）。

- 记录共享同一 GitHub 账号的 coding-agent task 如何认领 issue，并在 commit 与 PR 中保留可追溯的 task 标识（[#196](https://github.com/BotHarness/BotHarness/issues/196)）。

- 记录 Channel sidebar 为 Bot mode 的 scope 化右侧区域，采用统一注册、可折叠、按序排列的 entry seam，退役 PersonaBot navigation（[ADR-0053](docs/adr/0053-channel-sidebar-is-the-scoped-right-sidebar.md)、[#156](https://github.com/BotHarness/BotHarness/issues/156)）。

- 新增 canonical Release Ledger、双语一致性检查与贡献指南（[#100](https://github.com/BotHarness/BotHarness/issues/100)）。
- 记录规划中的 PersonaBot DM 导航，并将 application-defined Work 概念统一更名为 Assignment、Assignment Session、Assignment Agent 与 Assignment Directory；这是一项设计语言更新，不代表 UI 或 runtime 已经实现（[#109](https://github.com/BotHarness/BotHarness/pull/109)）。
- 发布双语 Development status 页面，将 DeepSeekBot 与 DSH Skill 的 release train 和 Changelog 明确分开（[#105](https://github.com/BotHarness/BotHarness/issues/105)）。
- 将 Memory 明确为 optional Git-backed Cordis Service，使 DM → Orchestrator → Assignment 主链不依赖 Persona 或 Memory（[ADR-0047](docs/adr/0047-memory-is-an-optional-git-backed-service.md)、[#74](https://github.com/BotHarness/BotHarness/issues/74)）。

## [Development] - 2026-09-20

汇总 DeepSeekBot 首个版本之前已经实现的基础能力与公开文档；这是开发历史，不代表已发布或可安装的版本。

### Added

- Human 可通过 DSH 应用菜单在 Host 上打开当前 Memory Repository、子目录及文件，显示文件位置、复制 Host 路径，或将完整当前文件下载到浏览器设备；普通文件选择仍使用内置阅读器（[#574](https://github.com/BotHarness/BotHarness/issues/574)、[ADR-0100](docs/adr/0100-file-open-actions-target-real-host-files.md)）。

- 创建 PersonaBot 时可选择空白记忆仓库，或用 HTTPS/SSH Git 地址导入。Host 先检查 Git，再利用现有凭证在暂存目录克隆；克隆成功后才创建 Bot，失败不会留下半创建的 Bot（[#298](https://github.com/BotHarness/BotHarness/issues/298)）。
- 新增持久的 PersonaBot identity、文件式 Memory 工具与 BOT mode 创建流程（[#22](https://github.com/BotHarness/BotHarness/pull/22)、[#98](https://github.com/BotHarness/BotHarness/pull/98)）。
- 新增 BOT mode Channel shell、roster sections、分 scope 排序与拖拽移动，并把陈列持久化到 Host（[#51](https://github.com/BotHarness/BotHarness/pull/51)、[#64](https://github.com/BotHarness/BotHarness/pull/64)、[#72](https://github.com/BotHarness/BotHarness/pull/72)、[#73](https://github.com/BotHarness/BotHarness/pull/73)、[#95](https://github.com/BotHarness/BotHarness/pull/95)）。

### Changed

- 让 plugin manifest、configuration path 与 client bridge 对齐已核验的 DSH contract（[#27](https://github.com/BotHarness/BotHarness/pull/27)）。

### Documentation

- 发布双语文档站、持续维护的 BotHarness 架构与产品术语，并为 plugin developer 提供稳定的 DSH/Cordis Context 与 Decision Tree（[#26](https://github.com/BotHarness/BotHarness/issues/26)、[#88](https://github.com/BotHarness/BotHarness/pull/88)、[#90](https://github.com/BotHarness/BotHarness/pull/90)、[#92](https://github.com/BotHarness/BotHarness/pull/92)）。
