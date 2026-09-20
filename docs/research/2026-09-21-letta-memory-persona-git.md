# Letta memory、persona 与 Git 设计调研

日期：2026-09-21

范围：当前 Letta Code 的 agent 创建、Persona/Memory 归属、MemFS、Git 历史和公开 API/UI。仅使用 Letta 官方文档与官方 GitHub 源码。

## 来源基线

- Letta Code：6fa735994a46f1162f7c974ceed2a7fc95d62bb7
- 官方文档镜像：65d875ed773a22ee54abde3032c61fd589c5a013
- 旧 Python 仓库已明确把当前实现指向 letta-code：[官方 README](https://github.com/letta-ai/letta/blob/main/README.md)

## 结论

### 1. 没有 Persona 或 MemFS，agent/chat 仍可成立

当前 Letta Code 的统一创建请求只有在指定 personality 或 memoryBlocks 时才发送 memory_blocks；enableMemfs 可以关闭并切到 standard prompt。subagent 路径还会强制关闭 MemFS、忽略 memory blocks/block IDs。这说明「模型 + system/base prompt + 输入消息」在实现上可独立于 Persona 和文件 Memory 运行。[create-agent-request.ts](https://github.com/letta-ai/letta-code/blob/6fa735994a46f1162f7c974ceed2a7fc95d62bb7/src/agent/create-agent-request.ts)；[无 MemFS prompt](https://github.com/letta-ai/letta-code/blob/6fa735994a46f1162f7c974ceed2a7fc95d62bb7/src/agent/prompts/letta_no_memfs.md)

不过，普通 Letta Code agent 默认启用 MemFS，官方文档也把 MemFS 描述为当前产品默认。因此 Letta 证明的是「技术上可分离」，不是「产品默认无 Memory」。[MemFS 文档](https://github.com/letta-ai/letta-docs-md/blob/65d875ed773a22ee54abde3032c61fd589c5a013/concepts/memfs/index.md)

对 BotHarness：首条主链可以只含 Channel chat UI → Bot Inbox → Orchestrator Session → Assignment Session → report → DM reply。Persona 和 Memory 都不应是必需依赖。

### 2. Letta 把 Persona 放在 Memory 内；BotHarness 只借鉴内容归属，不让它定义 Bot 身份

Letta 的标准非 MemFS agent 默认 memory labels 是 persona 与 human；personality preset 通过替换这些 blocks 的值实现。[memory.ts](https://github.com/letta-ai/letta-code/blob/6fa735994a46f1162f7c974ceed2a7fc95d62bb7/src/agent/memory.ts)；[personality-presets.ts](https://github.com/letta-ai/letta-code/blob/6fa735994a46f1162f7c974ceed2a7fc95d62bb7/src/agent/personality-presets.ts)

在 MemFS 中，system/persona 会投影为 system/persona.md；system 下的文件每轮进入 system prompt，其余文件延迟读取，但文件树和 description 可被发现。Markdown 文件带小型 YAML frontmatter。[MemFS 文档](https://github.com/letta-ai/letta-docs-md/blob/65d875ed773a22ee54abde3032c61fd589c5a013/concepts/memfs/index.md)

可借鉴：Markdown 投影、description、热/冷路径、可发现文件树。

不应照搬：整个 agent identity 和生命周期必须属于一个 Git 仓库。

对 BotHarness：Persona 也是 optional。即使 Persona 与 Memory 都不存在，Bot 仍可聊天和执行 Assignment；PersonaBot 的 Host-owned identity 不由 Persona 文件定义。Memory Provider 存在时，Persona 内容就是普通 Markdown Memory：约定名为 `persona.md`、创建时默认 pin，但没有特殊文件类型或写保护，Agent 与 Human 都可修改、unpin、改名或删除。

### 3. Letta 有 capability-like seam，但不是 Cordis Service

个人 MemFS 可在创建时启停；同时 Letta 还有独立于单个 agent 创建、可 attach/detach、可由多个 agent 共用的 shared memory repository。[MemFS 同步实现说明](https://github.com/letta-ai/letta-code/blob/6fa735994a46f1162f7c974ceed2a7fc95d62bb7/src/skills/builtin/syncing-memory-filesystem/SKILL.md)；[shared memory 实现说明](https://github.com/letta-ai/letta-code/blob/6fa735994a46f1162f7c974ceed2a7fc95d62bb7/src/skills/builtin/managing-shared-memory/SKILL.md)

官方 Agent SDK 将 repository CRUD、文件读写和版本查询作为独立 API，并支持 session-scoped 或持久 agent attachment。[Cloud repositories](https://github.com/letta-ai/letta-docs-md/blob/65d875ed773a22ee54abde3032c61fd589c5a013/agent-sdk/repositories/index.md)

但 Letta runtime 仍直接负责 checkout、prompt compilation、tools、hooks、commit/push 和 sync；公开资料不能证明它是一个可替换的独立 service。

对 BotHarness：定义 application-owned Memory Service Definition，Provider 可缺席。Bot Runtime、Orchestrator、Assignment Runtime、Client 和其他 Plugin 都作为 Consumer 做 capability detection。Provider 缺席时，移除 memory context、tools 和 UI，但主聊天/Assignment 链仍运行。Service Definition 放稳定 contracts/core package；Git Provider、tools 与 UI adapter 放独立 memory package。是否再拆成独立 Plugin/Bundle，应由独立安装和生命周期需求决定。

### 4. Git/commit 语义值得直接学习

Letta MemFS 是真实 Git repository。接受的 memory edit 会形成 commit；小型 memory tool 自动提交，大型直接编辑显式提交。Cloud agent 再同步到 hosted remote；local backend 可保持本地。提交后的内容影响后续 recompile/new conversation，不会倒改当前已经编译的 turn。[MemFS 文档](https://github.com/letta-ai/letta-docs-md/blob/65d875ed773a22ee54abde3032c61fd589c5a013/concepts/memfs/index.md)；[当前 prompt 规则](https://github.com/letta-ai/letta-code/blob/6fa735994a46f1162f7c974ceed2a7fc95d62bb7/src/agent/prompts/letta.md)

Shared repository API 中，每次文件 mutation 都创建 commit；更新支持 contentSha256 optimistic precondition，版本 API 可按路径列 commit，并读取指定 commit/ref 的文件。[Cloud repositories](https://github.com/letta-ai/letta-docs-md/blob/65d875ed773a22ee54abde3032c61fd589c5a013/agent-sdk/repositories/index.md)

对 BotHarness V1：

- 一次被接受的语义变更尽量对应一个 commit；
- Human edit 必须带 base commit 或 content hash，拒绝静默覆盖；
- commit metadata 记录 Human、Orchestrator Session、Assignment Session、migration/maintenance 等 actor/cause；
- 明确「当前 turn 不变，未来 Conversation Assembly 生效」；
- 先做单写者，再考虑 Letta 用于并发 memory maintenance 的 worktree 方案。

### 5. UI/API 可借鉴的范围

公开 viewer 实现会扫描 Markdown tree、读取最多 500 个 first-parent commits、为最近 50 个 commit 收集 patch，并限制单个和总 diff payload，最后生成本地只读 HTML snapshot。[generate-memory-viewer.ts](https://github.com/letta-ai/letta-code/blob/6fa735994a46f1162f7c974ceed2a7fc95d62bb7/src/web/generate-memory-viewer.ts)

可借鉴的最小 UI/API：文件树、当前文件、commit list、commit detail/diff、带并发前置条件的编辑，之后再加 revert。不要一次向 Client 暴露无界 Git history 或 checkout。

未确认：讨论截图中的 Letta Cloud graph、直接编辑和 recent-memory UI 的具体闭源实现/算法，公开源码不足以验证。Graph 应继续 defer。

## 建议的第一颗 Memory tracer bullet

在 Chat/Orchestrator/Assignment 主链通过后：

1. 为一个 PersonaBot 安装 Git-backed Memory Provider。
2. 通过 Memory Service Definition 创建、读取、更新一个 Markdown 文件。
3. 产生带 actor/cause 和 optimistic concurrency 的一个 commit。
4. Orchestrator 获得一个明确的 read tool；Provider 缺席时不注入任何 memory。
5. DM-only Memory view 显示文件、允许一次 Human edit，并显示该 commit/diff。
6. 禁用 Provider，验证 Channel chat → Orchestrator Session → Assignment Session 仍可运行。

Shared repository、graph、vector search、dreaming/reflection、多 writer worktree、restore UI 和 Assignment memory scope 后置。
