# DSH workspace、权限与 file-first Memory 调研

日期：2026-09-21

范围：回答 BotHarness 当前设计中的三个问题：DSH 如何定义 workspace/cwd 与权限升级；一个 Session 是否支持多个 workspace；Git-backed Memory 是否必须增加模型可见的专用 tool。仅使用 DeepSeek Harness 与 Letta 的官方文档、发布源码和官方仓库。

## 来源基线

- BotHarness 当前锁定 DSH `0.1.5-rc.2`；对应官方 tag `dsh-v0.1.5-rc.2`、release commit `fb2c4b9e698e30edb738bca4cf0618587db7d203`。[DSH release](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.5-rc.2)
- 本文的 DSH 行为结论以该 tag 为准。当前官网 reference 可用于交叉验证，但不反向把更新版本的 API 当成 `0.1.5-rc.2` 已有能力。
- Letta 的 file-based Memory 结论来自当前 Letta Code prompt、MemFS 文档与官方源码；旧式 block Memory 单独标注，避免把两代接口混为一谈。

## 结论摘要

1. DSH-native **Workspace** 是 Host 侧的“目录记录 + Session 分组”，对模型不可见；真正决定 Agent 工作目录与 `workspace-write` 写边界的是 Session 创建时写入的单个 `SessionHeader.cwd`。
2. 在 Web/API 创建路径中，Session 最终总会解析出一个 cwd：`workspace.path ?? request.cwd ?? process.cwd()`。Core Session 类型允许 cwd 缺席，但正常 Web Session 是一个 immutable primary cwd。
3. `0.1.5-rc.2` 每个 Session 只有一个 primary workspace root。`SessionCreateRequest` 只接收单个 `workspaceId` 或单个 `cwd`，两者不能同时传；`SandboxExecutionPolicy` 没有额外 writable roots，ACP 也明确不支持 `additionalDirectories`。
4. DSH 没有“申请某个具体路径”这一粒度的原生 grant。沙箱只在 `read-only`、`workspace-write`、`danger-full-access` 三种模式之间切换。被拒绝的 shell 调用可以在同一 turn 用更宽模式重试，并经 Human `allowed-once` 审批；该授权只属于这一次调用，不是持久路径授权。
5. 先前“Shell 绝不能绕过 Memory Service 直接编辑”的绝对表述过强。Letta 的当前 MemFS 明确允许标准 filesystem/bash 操作、`grep` 与 Git；它同时保留小编辑用的 `memory` shorthand，但这不是 file-based Memory 成立的必要条件。
6. BotHarness 可以采用 **file-first、service-owned**：模型不新增 `memory_*` tool schema，继续使用已有文件/搜索/编辑能力；application-defined Memory Service 仍负责 repo provisioning、路径发现、校验、Git commit/reconcile、pin 编译、事件和 UI query。允许普通文件工具写入，不等于放弃 Service 的所有权。

## 1. DSH Workspace 与 Session cwd 不是同一个概念

### DSH-native Workspace

`ctx.workspaceRegistry` 保存一个 canonical directory path、展示标题和该目录下 Session 的有序账本。它是可选的 Host capability，对模型没有 tools、prompt 或 SessionEvent；删除 Workspace 记录也不会删除目录、文件或 Session。[Workspace package](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.5-rc.2/packages/workspace/workspace/README.md)；[Workspace reference](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/workspace)

因此 DSH Workspace 更接近 Web UI 的 project/session grouping，不是一个 Agent 可在运行中增删的 mount 列表。

### Session cwd

Session header 只有一个 `cwd?: string`，创建后 immutable。[SessionHeader source](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.5-rc.2/packages/core/session/src/types.ts)

Web/API 的 `SessionCreateRequest` 只提供单个 `workspaceId?` 或 `cwd?`；controller 明确拒绝两者同时出现，然后解析：

```text
cwd = workspace.path ?? request.cwd ?? process.cwd()
```

再用该 cwd 创建 Agent/Session；如果使用 Workspace，创建后才把 Session attach 到 Workspace 账本。[Session request type](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.5-rc.2/packages/api/session-controller/src/types.ts)；[Session create implementation](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.5-rc.2/packages/api/session-controller/src/commands.ts#L82-L120)

这给出两个不同层次：

| 层次                                               | DSH 分类                            | 作用                                                              |
| -------------------------------------------------- | ----------------------------------- | ----------------------------------------------------------------- |
| `ctx.workspaceRegistry`                            | DSH-native Host Service             | 保存/展示一个目录及其 Session 分组                                |
| `SessionHeader.cwd`                                | DSH-native durable Session metadata | 决定 Agent 的 primary cwd，并被 sandbox policy 用作 writable root |
| Bot workspace / Memory repo / Assignment workspace | application-defined                 | BotHarness 决定哪种业务对象使用哪个 cwd                           |

### 是否一定要有主 workspace

- Core API 层面：`SessionHeader.cwd` 是 optional，理论上可创建无 cwd Session。
- 当前 Web/API 产品路径：会从 Workspace、显式 cwd 或 Host `process.cwd()` 中选出一个，因此实际会有一个 primary cwd。
- 这个 cwd 不能在 Session 生命周期中改成另一个目录；需要不同 cwd 时应创建另一个 Session，而不是修改原 Session 身份。

## 2. 多 Workspace 与路径权限

### 当前没有 multi-root Session

三个独立证据指向同一个边界：

1. `SessionHeader` 只有单值 `cwd`。[Session source](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.5-rc.2/packages/core/session/src/types.ts)
2. Sandbox Policy 的已知限制写明“one primary workspace root per session”；额外 writable roots 不在 `SandboxExecutionPolicy` 中。[Sandbox Policy `0.1.5-rc.2`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.5-rc.2/packages/sandbox/sandbox-policy/README.md#known-limitations-and-deferred-work)
3. ACP adapter 明确拒绝 `additionalDirectories`，并将 “one primary workspace” 列为限制。[ACP `0.1.5-rc.2`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.5-rc.2/packages/acp/acp/README.md#known-limitations-and-deferred-work)

因此“给一个 Assignment Session 配多个平级 workspace root”不是当前 DSH-native 能力。BotHarness 若需要这种产品概念，必须做 application-defined orchestration；不能把它描述成现有 DSH Workspace 配置。

### 权限模型的真实粒度

DSH 的两个独立 knob 是：

- `SandboxMode`: `read-only | workspace-write | danger-full-access`，只约束 file effects；网络和进程可见性不在该 vocabulary 内。
- `ApprovalPolicy`: `ask | never`，决定敏感操作能否向 Human/Machine answerer 请求一次性批准。

`workspace-write` 允许写 Session cwd 所代表的 workspace root 及 backend 规定的临时区；`danger-full-access` 绕过 DSH file sandbox。[Sandbox reference](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/sandbox)；[Sandbox Policy `0.1.5-rc.2`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.5-rc.2/packages/sandbox/sandbox-policy/README.md)

这里还要避免把 DSH sandbox 误读成通用文件 ACL：官方 contract 只承诺约束 **file effects**，`read-only` 的含义是阻止写入，不是只允许读取 cwd。当前 seam 没有“批准读取某个路径”的 path-scoped capability；若产品需要把外部目录的读取也隔离起来，应换成容器/远端等完整 Execution World Provider，而不是依赖 `workspace-write`。

被 sandbox 拒绝的 bash 调用可以在同一 turn 重试同一命令，并传更宽的 `sandbox_permissions` 与理由。审批通过只允许该 request 一次；不形成“以后可写 `/some/path`”的 grant，也不会给 Session 添加第二个 root。[Bash tool `0.1.5-rc.2`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.5-rc.2/packages/shell/tool-bash/README.md#sandboxed-execution-and-escalation)；[User approval `0.1.5-rc.2`](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.5-rc.2/packages/interaction/user-approval/README.md)

所以当前 DSH 对“访问另一个 cwd”的准确回答是：

| 需求                             | 当前 DSH 能力                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------ |
| 在 primary cwd 内读写            | `workspace-write`                                                                    |
| 一次命令需要在 root 外写入       | 实际 denial 后请求 `danger-full-access` 的 one-shot approval；授权粒度比具体路径更宽 |
| 长期把另一个路径加入可写集合     | **没有 path-scoped / additional-root grant**                                         |
| 让后续工作稳定地以另一个项目为根 | 创建一个以该目录为 cwd 的新 Session                                                  |
| 把 Workspace 权限授予模型        | 不成立；Workspace Registry 对模型不可见，它不是 permission object                    |

## 3. Letta：旧 block tools 与当前 MemFS 要分开看

### 旧式 / server-side block Memory

Letta 的传统 core memory 是结构化 blocks，官方实现提供 `memory_insert`、`memory_replace`、`memory_rethink`、`memory_apply_patch` 等专用函数。这些工具直接操作 server-side Agent memory objects，而不是普通工作目录文件。[Letta memory function set](https://github.com/letta-ai/letta/blob/main/letta/functions/function_sets/base.py)；[official memory architecture reference](https://github.com/letta-ai/skills/blob/main/letta/agent-development/references/memory-architecture.md)

这解释了“Letta 也有 memory tool set”这一印象，但它不是当前 Git-backed MemFS 的全部答案。

### 当前 Git-backed MemFS

Letta 当前文档把 MemFS 定义为 Git-backed filesystem：Memory 存在 Markdown 文件中；`system/` 下文件每轮进入 system prompt，其他文件只暴露树和 description、按需读取；默认没有 semantic/vector index，Agent 直接用普通 file search/read tools 检索。[MemFS docs source](https://github.com/letta-ai/letta-docs-md/blob/main/concepts/memfs/index.md)

Letta Code 自己的 system prompt 更明确：

- Memory 被投影到 `$MEMORY_DIR`；
- 可以用标准 filesystem/bash 操作管理；
- 可以用 `grep` 搜索；
- 可以用 Git 查看演化历史；
- 小型定点编辑可选用 `memory` shorthand，由它自动提交；
- 大型调整直接改文件再 `git commit`；
- pre-commit hook 校验 frontmatter、未知字段和 `read_only` 文件。[Letta Code prompt](https://github.com/letta-ai/letta-code/blob/main/src/agent/prompts/letta.md)

官方 reflection subagent 甚至被限定为 `Bash, Edit`，明确禁止 memory tools，却仍直接在 `$MEMORY_DIR` 上维护 Memory 并提交 Git。这证明专用 Memory schema 不是 file-based Memory 的必要条件。[Reflection subagent](https://github.com/letta-ai/letta-code/blob/main/src/agent/subagents/builtin/reflection.md)

结论不是“Letta 完全没有 memory tools”，而是：

| Letta 路径                            | 模型接口                                                              |
| ------------------------------------- | --------------------------------------------------------------------- |
| 传统 block Memory                     | 专用 memory tool set 是主要接口                                       |
| 当前 MemFS 小编辑                     | 可用 `memory` / `memory_apply_patch` shorthand，自动处理格式和 commit |
| 当前 MemFS 复杂编辑、重构、检索、历史 | 普通 Bash/Edit/Read/grep/Git 是正式支持的接口                         |

## 4. Facts 与 BotHarness 推荐设计

### 已验证事实

- DSH Session 只有一个 primary cwd / writable root。
- DSH 的权限升级是 mode-level、one-shot，不是 path-level grant。
- Letta MemFS 支持普通文件与 Shell 操作；专用 Memory tool 只是一个可选的便利入口，不是唯一持久化入口。
- Git commit 才是 Letta file Memory 的保存/同步边界；raw edit 可以暂时留下 dirty tree，因此需要 hook、提醒或 reconcile。

### 推荐：file-first、service-owned

BotHarness V1 不必增加任何模型可见的 `memory_*` tool。建议把边界定义为：

```text
existing Bash / FS tools
        │
        ▼
known Memory directory (Git worktree)
        │
        ▼
application-defined Memory Service
provision · validate · reconcile/commit · pin compile · events · query/UI
```

这里的 Memory Service 是 Cordis Service Definition/Provider seam；它不等于一个模型 tool。Bash、文件工具、Conversation Assembly、Client UI 与其他 Plugins 都可以是 Consumer。模型通过普通文件能力读写，而 Service 保持 repo 生命周期和 durable authority。

这会修正先前的绝对禁令：允许 Shell 直接编辑是合理的。需要守住的 invariant 不是“所有字节必须从 Memory tool 经过”，而是“所有被接受的 Memory 变更最终进入同一个受校验的 Git authority，并在 commit 后才对 prompt compilation、历史和事件消费者生效”。

### 推荐：Orchestrator 与 Assignment 的 cwd 分工

V1 最稳的布局是：

| Session              | 推荐 primary cwd                                                                      | 原因                                                           |
| -------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Orchestrator Session | PersonaBot 自有的 Bot/Memory Git repo；Memory Provider 缺席时用 Bot runtime workspace | DM 主 Agent 可以用普通文件工具维护长期 Memory；不需要额外 root |
| Assignment Session   | 该 Assignment 被 Human 授予的一个具体 project directory                               | DSH 的 `workspace-write` 边界与实际项目写入保持一致            |

当 Orchestrator 需要修改另一个项目时，默认应开一个以该项目为 cwd 的 Assignment，而不是把 Orchestrator 长期切到 `danger-full-access`。当一个正在运行的 Assignment 需要另一个平级项目时，也优先新开 Assignment；只有一次性、已发生实际 denial 的狭窄命令，才考虑使用 DSH 的 one-shot wider-mode approval。

这不是因为“新建 Assignment 自动获得路径权限”——DSH 没有这种自动继承。是 BotHarness 在创建 Assignment 时显式选择 cwd，让 DSH 的现有 sandbox boundary 与业务授权对齐。

### Memory Service 在无专用 tool 情况下仍需做的事

1. 创建/定位每个 PersonaBot 的 Git repo，并把稳定路径提供给 Orchestrator 的 Execution World。
2. 用 system prompt / runtime context 告知 `$BOTHARNESS_MEMORY_DIR` 或等价确定路径、文件格式、pin 规则和提交语义。
3. 在 commit 前校验 Markdown/frontmatter、pin budget、protected metadata；拒绝无效提交。
4. 对 raw file edits 在 Agent quiescence/turn boundary 做 dirty-tree reconcile，形成一个可审计 commit；不要把每个 filesystem syscall 当成 durable MemoryEvent。
5. commit 成功后再发 Cordis Event，供 UI、prompt compiler、indexer 或其他 Plugin 消费；Cordis Event 不是 durable authority。
6. Client 通过 Host Memory Service 查询文件、commit 和 diff；不要让浏览器直接读取 repo。

### 需要明确接受的 trade-off

- 优点：不增加模型 tool schema/token 负担；`grep`、编辑器、Git 等现有能力可复用；复杂重构比 block-oriented tool 自然。
- 代价：raw edit 可能留下 dirty/invalid state，不能天然带 actor/cause，也不具备单次 API 调用的原子性。必须用 repo-local validation、quiescence reconcile、commit metadata 与冲突检测补齐。
- DSH 当前没有细粒度多 root；如果未来要求一个 Assignment 同时长期写多个外部目录，需要等待/扩展 execution Provider，而不是用 symlink 或永久 `danger-full-access` 假装成 path grant。

## 最终建议

采纳用户提出的方向：Memory 是一个明确 folder/repository，Agent 通过既有文件与 Shell 能力操作，system context 告诉它位置和规则；V1 不新增专用 Memory tools。

同时保留 application-defined Memory Service，但把它定位为 **repo lifecycle + validation + commit/event + prompt/UI adapter**，不是字节编辑的唯一入口。Orchestrator 的 primary cwd 放 Bot/Memory repo，外部项目写入由一个以该项目为 cwd 的 Assignment 承担。这样既顺着 DSH 的单 root/one-shot approval 现实，也吸收了 Letta MemFS 的 file-first 设计。
