# DSH_DECISION_TREE — 快速决策树

> **状态**：架构调研输入。可执行、渐进披露版本位于 `.agents/skills/dsh-plugin-dev/references/decision-tree.md`；若产品层示例与已接受 ADR 冲突，以 ADR 为准。
>
> 用途：遇到需求时，跟着问题选抽象。每个判断旁边都有例子。
> 术语：`DSH_CONTEXT.md` · 产品场景输入：`GROKBOT_ON_DSH_ARCHITECTURE.md`

怎么读：从上往下问自己「是不是这个情况？」；菱形里是白话问题，括号里是例子。

---

## 0. 总览：先选大类

```mermaid
flowchart TD
  START[我要加的这个能力…] --> A{关掉软件再打开<br/>还得能还原吗？<br/>例: 用户发过什么话<br/>Tool 调过什么}
  A -->|是| SE[用 SessionEvent 记下来]
  A -->|否| B{是不是在「请别人办事」？<br/>例: 读文件、跑命令<br/>播一段动画并等播完}
  B -->|是| SVC[用 Service<br/>例: ctx.fs / ctx.shell / ctx.avatar]
  B -->|否| C{是不是在「广播一件事」？<br/>例: Agent 开始思考了<br/>让 Live2D、字幕、灯效各自反应}
  C -->|是| EV[用 Cordis Event<br/>再去 §2 选 emit/parallel/…]
  C -->|否| D{是不是在「登记可选项」？<br/>例: 注册一把新 Tool<br/>挂一个 Subagent Provider}
  D -->|是| REG[用 Registry + Registration]
  D -->|否| E{是不是在问「现在怎样」？<br/>例: plan 模式开了没<br/>聊天界面该显示哪几条}
  E -->|是| PR[Projection 或 Conversation Assembly]
  E -->|否| F{是不是产品自己的数据？<br/>例: 用户设置、频道消息<br/>不是 Agent 对话日志}
  F -->|是| ST[Storage 或独立业务 Service]
  F -->|否| G[看下面专项：Avatar / 执行位置 / Job…]
```

一句话对照：

| 你在干嘛                       | 用           | 例子                                           |
| ------------------------------ | ------------ | ---------------------------------------------- |
| 记账，以后能回放               | SessionEvent | `user/message`、`tool/call`                    |
| 请系统做事并拿结果             | Service      | `await ctx.shell.execute(...)`                 |
| 喊一声「出事了」，别人爱听不听 | Event        | `emit('agent/status', { status: 'thinking' })` |
| 往清单里加一项能力             | Registry     | `ctx.tools.register(readTool)`                 |
| 从历史算出「现在」             | Projection   | 当前是否 plan mode                             |

---

## 1. Event / Service / Registry 怎么分

```mermaid
flowchart TD
  S[先看你的句子更像哪句] --> E1{「某某状态变了，<br/>大家自己看着办」？<br/>例: 进入 thinking}
  E1 -->|像| EV[Cordis Event]
  E1 -->|不像| E2{「帮我做一件具体的事，<br/>做完告诉我成没成」？<br/>例: 播放 wave 动画}
  E2 -->|像| SV[Service]
  E2 -->|不像| E3{「系统里现在有哪些<br/>可选实现 / 可选 Tool？」？<br/>例: 有哪些 shell provider}
  E3 -->|像| RG[Registry]
  E3 -->|不像| E4{「当时到底发生过什么，<br/>审计 / 回放要用」？<br/>例: 那次 Tool 的入参}
  E4 -->|像| SE[SessionEvent]
```

同一件事的两种写法（别混）：

| 场景                       | 别这样                           | 更合适                                       |
| -------------------------- | -------------------------------- | -------------------------------------------- |
| Agent 进入思考，角色换表情 | `await` 一个没人保证完成的 Event | `emit('agent/status', …)`，Avatar 插件自己听 |
| 必须挥完手再继续说话       | 只 `emit` 然后假设播完了         | `await ctx.avatar.playAnimation('wave')`     |
| 给 CodingBot 多一把 `bash` | 改全局硬编码 if                  | 在 CodingBot 的 Scope 里 `register`          |

---

## 2. 五种 Event：选哪一种

```mermaid
flowchart TD
  D[我已经决定用 Event] --> Q1{发完就走，<br/>不等别人处理完？<br/>例: 告诉大家「开始说话了」}
  Q1 -->|是| EM["emit<br/>例: ctx.emit('agent/status', …)"]
  Q1 -->|否| Q2{必须按顺序一个一个来？<br/>例: 先鉴权，再记日志，再执行}
  Q2 -->|是| SER["serial"]
  Q2 -->|否| Q3{只要第一个能处理的人出手？<br/>例: 谁能打开这种资源谁来}
  Q3 -->|是| BA["bail"]
  Q3 -->|否| Q4{要在中间加关卡：<br/>能拦下、能改内容？<br/>例: Tool 执行前审批}
  Q4 -->|是| WF["waterfall<br/>例: policy 里决定调不调 next()"]
  Q4 -->|否| PA["parallel<br/>例: 灯光、字幕、模型都准备好再开讲"]
```

| 需求（白话）           | API         | 例子                      |
| ---------------------- | ----------- | ------------------------- |
| 喊一声就行             | `emit`      | 状态变成 `speaking`       |
| 所有旁听者都忙完再继续 | `parallel`  | 开讲前各插件预热          |
| 排队处理               | `serial`    | 有序中间件链              |
| 谁先接单谁干           | `bail`      | 选一个 provider / handler |
| 可审批、可改写、可否决 | `waterfall` | Tool 执行前的 policy      |

---

## 3. 记下来 / 当下通知 / 给 UI 看

```mermaid
flowchart TD
  H[这条信息最后要怎样？] --> Q1{软件重启后<br/>还得能翻出来？<br/>例: 用户那句「帮我重构」}
  Q1 -->|要| SE[写入 SessionEvent]
  Q1 -->|不要| Q2{只是此刻跑着的进程<br/>互相通个气？<br/>例: 流式 token 到了}
  Q2 -->|是| CE[Cordis Event 即可]
  Q2 -->|否| Q3{要画成聊天气泡 / 轨迹？}
  Q3 -->|是| CA[Conversation Assembly]
  SE --> Q4{界面只要「现在的值」，<br/>不想每次扫全部历史？<br/>例: plan 开了没}
  Q4 -->|是| PJ[Projection]
  SE --> Q5{还要按关键字搜索历史？}
  Q5 -->|是| SQ[Session Query 做索引<br/>原文仍以 Session log 为准]
```

| 名字                  | 干什么               | 例子                                       |
| --------------------- | -------------------- | ------------------------------------------ |
| SessionEvent          | 永久事实             | `tool/call`、`turn/end`                    |
| `session/event`       | 刚写入时通知当前进程 | 投影更新、旁路监听                         |
| Projection            | 历史折成「现在」     | 当前 plan 开关                             |
| Conversation Assembly | 折成聊天 UI 结构     | 气泡、工具卡片                             |
| 动画 / 打字机效果     | 听 live Event        | `agent/status`，别拿 SessionEvent 当帧总线 |

---

## 4. Avatar / 角色反馈

```mermaid
flowchart TD
  V[要做角色 / 动画反馈] --> Q1{下一步必须等这个动作做完？<br/>例: 挥手完了才能说话}
  Q1 -->|必须等| SV["Service<br/>await ctx.avatar.playAnimation('wave')"]
  Q1 -->|不用等| Q2{很多插件各自反应就行？<br/>例: Live2D + 字幕 + 灯光}
  Q2 -->|是| EM["Event emit<br/>ctx.emit('agent/status', { status: 'thinking' })"]
  Q2 -->|否| Q3{要等这几个插件都准备好？<br/>例: 开讲前一起 preload}
  Q3 -->|是| PA["Event parallel"]
```

---

## 5. 命令跑在哪 / 要不要沙箱

```mermaid
flowchart TD
  X[和「执行」有关] --> Q1{想换运行地点？<br/>例: 本机 → Docker → 远端机器}
  Q1 -->|是| PR[换 Provider<br/>Local / Remote / Container Shell]
  Q1 -->|否| Q2{只是限制「同机子进程<br/>能动哪些文件」？}
  Q2 -->|是| SB["ctx.sandbox"]
  Q2 -->|否| Q3{你要的是「一条 shell 命令」<br/>还是「启动一个进程」？}
  Q3 -->|shell 命令| SH["ctx.shell"]
  Q3 -->|argv / 进程| SP["ctx.subprocess"]
```

注意：Docker / 远端 / microVM = **换 Provider**，不是给 `ctx.sandbox` 再加一种实现。

---

## 6. 不同 Bot、不同限制

```mermaid
flowchart TD
  K[隔离问题] --> Q1{不同 Bot 该看到不同 Tool？<br/>例: CodingBot 有 bash<br/>ResearchBot 有 web_search}
  Q1 -->|是| SC[Agent Scope<br/>按 Bot 注册不同 Registration]
  Q1 -->|否| Q2{名字都叫 ctx.shell<br/>但超时 / 实现要不同？<br/>例: A 组 5 秒、B 组 60 秒}
  Q2 -->|是| IS[Service Isolation<br/>isolate 出不同实例]
```

---

## 7. 长时间任务 vs 定时

```mermaid
flowchart TD
  T[和「时间」有关] --> Q1{现在就开跑，<br/>之后还能查进度 / 停掉？<br/>例: 跑一整套测试}
  Q1 -->|是| Q2{需要像终端一样交互输入？<br/>例: Python REPL、dev server}
  Q2 -->|要交互| PTY[Terminal / PTY]
  Q2 -->|不用| JOB[Job]
  Q1 -->|不是现在跑| Q3{到某个未来时间再做？<br/>例: 10 分钟后提醒、每天一次}
  Q3 -->|是| SCH[Schedule]
```

---

## 8. 子 Agent 怎么传话

```mermaid
flowchart TD
  M[Agent 之间要说话] --> Q1{是不是父子直接对话？<br/>例: Root ↔ 它拉起的 Child}
  Q1 -->|是| BUILTIN[用内置 messaging]
  Q1 -->|否| Q2{可以让中间人传话？<br/>例: Root → Child → Grandchild}
  Q2 -->|可以| RELAY[逐层转发]
  Q2 -->|不行，要任意互聊| BUS[自己做 Agent Bus Service<br/>带权限、送达确认、可持久化]
```

隔着 Session 传重要消息：**别**只靠进程内的 `emit`。

---

## 9. 数据放哪

```mermaid
flowchart TD
  D[有一坨数据] --> Q1{是 Tool 吐出来的超大结果，<br/>不能整份塞进模型？<br/>例: 20MB 日志}
  Q1 -->|是| SPILL[Spill：存外面，模型只看摘要]
  Q1 -->|否| Q2{是这次 Agent 对话里的事实？<br/>例: 模型当时看到的那句用户话}
  Q2 -->|是| SE[SessionEvent]
  Q2 -->|否| Q3{是聊天产品本身的消息？<br/>例: 某个频道里所有人的发言}
  Q3 -->|是| MSG[独立 messaging Service + 数据库]
  Q3 -->|否| Q4{中小规模的设置 / 业务记录？}
  Q4 -->|是| ST["ctx.storage"]
  Q4 -->|否| OWN[单独做业务 Service]
```

---

## 10. UI 插槽与怎么打包发布

```mermaid
flowchart TD
  U[UI 或发行] --> Q1{好几个插件都要往<br/>同一个界面位置塞东西？<br/>例: 侧边栏多块面板}
  Q1 -->|是| SLOT[Slots<br/>再选 single / list / keyed / chain]
  Q1 -->|否| Q2{Host 和网页客户端要远程调接口？}
  Q2 -->|是| TY[Typert / API Gateway]
  Q2 -->|否| Q3{决定开机加载哪些功能包？}
  Q3 -->|是| PF[Bundle → Profile → Patch]
```

| Slot 类型 | 白话                   | 例子             |
| --------- | ---------------------- | ---------------- |
| `single`  | 只显示优先级最高的一个 | 默认主题         |
| `list`    | 大家并排都显示         | 工具栏按钮列表   |
| `keyed`   | 按 key 对号入座        | 按消息类型选卡片 |
| `chain`   | 按优先级问「你要接吗」 | 自定义渲染器     |

---

## 11. 一页速查

| 你想…                    | 用                     | 例子                       |
| ------------------------ | ---------------------- | -------------------------- |
| 喊一声，不等             | Event `emit`           | `agent/status = thinking`  |
| 等所有人准备好           | Event `parallel`       | 开讲前预热                 |
| 谁先接谁干               | Event `bail`           | 选 handler                 |
| 中间加审批 / 可改写      | Event `waterfall`      | Tool policy                |
| 请系统做事并拿结果       | Service                | `ctx.avatar.playAnimation` |
| 往清单加能力             | Registry               | 注册 Tool                  |
| 永久记下对话事实         | SessionEvent           | `tool/result`              |
| 问「现在开没开 plan」    | Projection             | 当前 plan 状态             |
| 不同 Bot 不同 Tool       | Agent Scope            | CodingBot + bash           |
| 同名 Service 不同配置    | Isolation              | 两个 `ctx.shell`           |
| 换本机 / 容器 / 远端     | 换 Provider            | Remote Shell               |
| 少打 LLM 来回批量干活    | Code Runtime           | 循环读 100 个文件          |
| 产品数据（非对话日志）   | Storage / 业务 Service | 用户设置                   |
| 搜历史对话               | Session Query          | FTS 索引                   |
| 大输出别撑爆上下文       | Spill                  | 大日志                     |
| 长任务 / 交互终端 / 定时 | Job / PTY / Schedule   | 测开、REPL、每天跑         |
| IM + Bot                 | messaging ≠ Session    | 频道消息 vs 模型所见       |
| UI 同一位置多插件        | Slots                  | 侧栏                       |
| 开机装哪些功能           | Profile / Bundle       | 发行组合                   |

---

## 12. 默认偏好（拿不准时按这个）

1. 「能做什么」用 Service/Tool；「准不准做」用 policy / waterfall / sandbox。
2. 要留档用 SessionEvent；当下通气用 Cordis Event。
3. 真源和搜索索引 / Projection 分开存。
4. 「在哪跑」换 Provider；「同机限文件」才用 sandbox。
5. 聊天产品消息和 Agent 对话日志分开。
6. 别什么协作都塞进 Event。
7. 插件卸掉时，它注册的东西应一起消失。
8. Profile 是功能组合，不是「用户账号」。
9. 「谁看得见哪些 Tool」和「同名 Service 用哪套实例」是两件事。
10. UI：远程边界用 Typert，聊天结构用 Conversation Assembly，插槽用 Slots。
