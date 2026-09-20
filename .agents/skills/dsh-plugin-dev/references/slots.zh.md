# Slot 目录（固定上游 SHA `ddefc45…`）

源码 declaration 才是 authoritative；已发布 docs tree 有滞后：缺少 `sidebar.toggle.badge`、`sidebar.right.tab.document`、`tool.view.cordis`，而 cookbook 中的 `settings.plugin.item` 并不存在。使用 `cordis_inspect what:"client"` 检查 live tree。

Registration pattern：

```tsx
export const inject = ['slots']
export function apply(ctx: Context): void {
  ctx.slots.inject('<key>', () => ctx.slots.register({ name: '<key>', id: 'my-entry', order: 50 }, MyComponent))
}
```

Kind：`single`（exclusive cell；同 priority duplicate 会 throw）、`list`（需要 `id`；按 `order` 排序）、`keyed`（owner 提供 `entryKey`；重复 key 表示替换，新 key 表示追加）、`chain`（entry 提供 `select(owner)`，最低 priority 胜出）。Scope：`root`、`session-maybe`、`session`。

## Framework / layout — `ui-layout/src/client/index.ts`、`ui-renderer/src/client/registry.ts`

| Slot | Kind/scope | 用途 |
| --- | --- | --- |
| `root` | single/root | 内建 root hole（已被 AppFrame 占用；不要注册） |
| `sidebar` | single/root | 整个左栏（替换后整栏消失） |
| `main` | keyed/root | 由 sidebar row `id` 寻址的中央 panel；`conversation` 是保留 key |
| `rightbar` | single/root | 右栏 container |
| `shell.overlay` | list/root | frame-level overlay（badge/toast/status），click-through |

## Sidebar — `ui-sidebar/src/client/contract/slots.ts`

| Slot | Kind/scope | 用途 |
| --- | --- | --- |
| `sidebar.toggle.badge` | single/root | 折叠按钮上的 notification dot |
| `sidebar.brand.mark` / `sidebar.brand.name` | single/root | Brand mark / name |
| `sidebar.panellist` | list/root | 全局 panel icon row；`id` 寻址 `main` key |
| `sidebar.workspaces` | single/root | Workspace/Session browser（已占用） |
| `sidebar.settings` | single/root | Settings 入口（已占用） |
| `sidebar.footer.action` | list/root | Settings 旁的 action |

## Conversation / composer — `ui-conversation/src/client/contract/slots.ts`

| Slot | Kind/scope | 用途 |
| --- | --- | --- |
| `main.conversation` | single/session-maybe | Conversation shell |
| `conversation.session` | single/session | Session body |
| `conversation.session.header` | single/session | Title / action / view navigation |
| `conversation.session.header.lineage` | single/session | Breadcrumb title |
| `conversation.session.header.actions` | list/session | Title 旁的快捷 action |
| `conversation.session.header.utilities` | list/session | 右对齐 utility |
| `conversation.session.header.leading` / `.corner` | single/session | Header 最左 / 最右位置 |
| `conversation.view` | list/session | Session target view（Chat/Trajectory） |
| `conversation.composer` | chain/session | Composer takeover chain（question/approval 使用） |
| `conversation.hero.workspace` | single/root | 空 Session 的 Workspace picker |
| `conversation.hero.brand.mark` | single/root | 空 Session 的 brand mark |
| `conversation.hero.agentPreset` | single/session-maybe | 新 Session preset control |
| `conversation.input.dock` | list/session | Composer card 上方的整行区域 |
| `conversation.input.overlay` | list/session | Composer card 内 overlay |
| `conversation.composer.dock` | list/session | Composer card 下方 ambient row |
| `conversation.input.left` / `.right` | list/session | 紧凑 toolbar control |
| `conversation.composer.bar` | single/session-maybe | Composer body |
| `conversation.input.attachments` | single/session-maybe | Attachment strip |
| `conversation.input.plan` / `.permission` / `.model` | single/session | 具名 toolbar control |
| `conversation.content` | factory/session-maybe | 可嵌入其他 host 的 reusable Conversation Assembly |

## Chat / Tool / Trajectory — `ui-chat`、`ui-tool`、`ui-trajectory`、`extensions/ui-cordis`

| Slot | Kind/scope | 用途 |
| --- | --- | --- |
| `conversation.chat.node` | keyed/session | 每种 ChatNodeKind 的 renderer；重复 key 替换，未使用 key fallback |
| `conversation.message.images` | single/session | Message image group |
| `conversation.chat.commandview` | keyed/session | Command lifecycle row |
| `conversation.chat.turnTail` | list/session | Finished turn 后的 pre-action entry |
| `conversation.chat.assistant-actions` | list/session | Assistant message action bar |
| `tool.call.toolview` | keyed/session | 按 Tool name 选择的 tool-call card；key space 开放，需自行绘制 Tool |
| `tool.call.images` | single/session | Tool image gallery |
| `tool.view.cordis` | keyed/session | `cordis_run` card 内的 self-drawn area |
| `conversation.trajectory.images` | single/session | Trajectory image group |

## Approval / question — `ui-approval`、`ui-user-questions`

| Slot | Kind/scope | 用途 |
| --- | --- | --- |
| `conversation.approval.detail` | single/session | 替换 approval request 中的 Tool detail |
| `conversation.plan-review.actions` | list/session | Plan review action |

## Settings — `ui-settings`、`ui-settings-general`、`ui-settings-models`、`ui-settings-plugins`

| Slot | Kind/scope | 用途 |
| --- | --- | --- |
| `settings.trigger` | single/root | Sidebar settings trigger content |
| `settings.header` / `settings.close` | single/root | Panel title / close a11y name |
| `settings.action` | list/root | Content column header action |
| `settings.section` | list/root | 一页 Settings（`id` = section key） |
| `settings.plugins.tab` | list/root | Plugins 页内的 tab |
| `settings.onboarding` | list/root | Onboarding step |
| `settings.general.item` | list/root | General preference row |
| `settings.models.provider-card` | keyed/root | 每个 provider card 的 extension area（按 settings namespace keyed） |
| `settings.models.footer` | list/root | Models 页 footer |

## Right bar / Workspace — `ui-sidebar-right`、`ui-sidebar-documentpreview`、`ui-workspace`

| Slot | Kind/scope | 用途 |
| --- | --- | --- |
| `rightbar.session` | single/session | Right-bar Session content |
| `sidebar.right.pane.tab` | keyed/session | 按 tab-type id 选择 tab body（`TabHookContext`） |
| `sidebar.right.pane.tab.title` | keyed/session | Tab title |
| `sidebar.right.tab.guide` | chain/session | 替换 guide tab content |
| `sidebar.right.tab.guide.entry` | keyed/session | Guide card |
| `sidebar.right.tab.menu.item` | list/session | Tab action menu item |
| `sidebar.right.tab.document` | keyed/session | 按 id 选择 document preview implementation |
| `sidebar.workspaces.directoryFlow` / `conversation.hero.workspace.directoryFlow` | single/root | Workspace directory-picker interaction hole |

## Plugin manager — `ui-plugin-manager/src/client/slot-contract.ts`

| Slot | Kind/scope | 用途 |
| --- | --- | --- |
| `plugins.item` | list/root | Official group 中的一页 Plugin（summary/page view） |
| `plugins.bundle.config` | keyed/root | 每个 Bundle 的 config page（以 Bundle package name 为 key） |
| `plugins.row.config` | keyed/root | 每个 row 的 config（`<pkg>#<row id>`） |
