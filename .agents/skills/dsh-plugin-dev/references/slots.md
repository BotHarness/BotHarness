# Slot catalog (pinned upstream SHA `ddefc45…`)

Source declarations are authoritative; the published docs tree lags (missing `sidebar.toggle.badge`, `sidebar.right.tab.document`, `tool.view.cordis`; the cookbook's `settings.plugin.item` does not exist). Inspect the live tree with `cordis_inspect what:"client"`.

Registration pattern:

```tsx
export const inject = ['slots']
export function apply(ctx: Context): void {
  ctx.slots.inject('<key>', () => ctx.slots.register({ name: '<key>', id: 'my-entry', order: 50 }, MyComponent))
}
```

Kinds: `single` (exclusive cell; same-priority duplicate throws), `list` (needs `id`; ordered by `order`), `keyed` (owner supplies `entryKey`; reuse = replace, new key = append), `chain` (entry provides `select(owner)`, lowest priority wins). Scopes: `root`, `session-maybe`, `session`.

## Framework / layout — `ui-layout/src/client/index.ts`, `ui-renderer/src/client/registry.ts`

| Slot | Kind/scope | Use |
| --- | --- | --- |
| `root` | single/root | built-in root hole (occupied by AppFrame; do not register) |
| `sidebar` | single/root | whole left column (replace = column gone) |
| `main` | keyed/root | central panel addressed by sidebar row `id`; reserved key `conversation` |
| `rightbar` | single/root | right column container |
| `shell.overlay` | list/root | frame-level overlays (badges/toasts/status), click-through |

## Sidebar — `ui-sidebar/src/client/contract/slots.ts`

| Slot | Kind/scope | Use |
| --- | --- | --- |
| `sidebar.toggle.badge` | single/root | notification dot on collapse button |
| `sidebar.brand.mark` / `sidebar.brand.name` | single/root | brand mark / name |
| `sidebar.panellist` | list/root | global panel icon row; `id` addresses `main` key |
| `sidebar.workspaces` | single/root | workspace/session browser (occupied) |
| `sidebar.settings` | single/root | settings entry (occupied) |
| `sidebar.footer.action` | list/root | actions beside settings |

## Conversation / composer — `ui-conversation/src/client/contract/slots.ts`

| Slot | Kind/scope | Use |
| --- | --- | --- |
| `main.conversation` | single/session-maybe | conversation shell |
| `conversation.session` | single/session | session body |
| `conversation.session.header` | single/session | title / actions / view nav |
| `conversation.session.header.lineage` | single/session | breadcrumb title |
| `conversation.session.header.actions` | list/session | actions next to title (quick entries) |
| `conversation.session.header.utilities` | list/session | right-aligned utilities |
| `conversation.session.header.leading` / `.corner` | single/session | far-left / far-right header seats |
| `conversation.view` | list/session | session target views (Chat/Trajectory) |
| `conversation.composer` | chain/session | composer takeover chain (questions/approvals use it) |
| `conversation.hero.workspace` | single/root | empty-session workspace picker |
| `conversation.hero.brand.mark` | single/root | empty-session brand mark |
| `conversation.hero.agentPreset` | single/session-maybe | new-session preset control |
| `conversation.input.dock` | list/session | full row above the composer card |
| `conversation.input.overlay` | list/session | overlay inside the composer card |
| `conversation.composer.dock` | list/session | ambient rows below the composer card |
| `conversation.input.left` / `.right` | list/session | compact toolbar controls |
| `conversation.composer.bar` | single/session-maybe | composer body |
| `conversation.input.attachments` | single/session-maybe | attachment strip |
| `conversation.input.plan` / `.permission` / `.model` | single/session | named toolbar controls |
| `conversation.content` | factory/session-maybe | reusable conversation assembly embedded in other hosts |

## Chat / tools / trajectory — `ui-chat`, `ui-tool`, `ui-trajectory`, `extensions/ui-cordis`

| Slot | Kind/scope | Use |
| --- | --- | --- |
| `conversation.chat.node` | keyed/session | renderer per ChatNodeKind (reuse key = replace; unused keys fall back) |
| `conversation.message.images` | single/session | message image group |
| `conversation.chat.commandview` | keyed/session | command lifecycle rows |
| `conversation.chat.turnTail` | list/session | pre-action entries after a finished turn |
| `conversation.chat.assistant-actions` | list/session | assistant message action bar |
| `tool.call.toolview` | keyed/session | tool-call card per tool name (open key space; draw your own tool) |
| `tool.call.images` | single/session | tool image gallery |
| `tool.view.cordis` | keyed/session | self-drawn area inside `cordis_run` cards |
| `conversation.trajectory.images` | single/session | trajectory image group |

## Approval / questions — `ui-approval`, `ui-user-questions`

| Slot | Kind/scope | Use |
| --- | --- | --- |
| `conversation.approval.detail` | single/session | replace tool detail in approval requests |
| `conversation.plan-review.actions` | list/session | plan review actions |

## Settings — `ui-settings`, `ui-settings-general`, `ui-settings-models`, `ui-settings-plugins`

| Slot | Kind/scope | Use |
| --- | --- | --- |
| `settings.trigger` | single/root | sidebar settings trigger content |
| `settings.header` / `settings.close` | single/root | panel title / close a11y name |
| `settings.action` | list/root | content column header actions |
| `settings.section` | list/root | one settings page (`id` = section key) |
| `settings.plugins.tab` | list/root | a tab inside the Plugins page |
| `settings.onboarding` | list/root | onboarding steps |
| `settings.general.item` | list/root | a General preferences row |
| `settings.models.provider-card` | keyed/root | extension area per provider card (keyed by settings namespace) |
| `settings.models.footer` | list/root | Models page footer |

## Right bar / workspace — `ui-sidebar-right`, `ui-sidebar-documentpreview`, `ui-workspace`

| Slot | Kind/scope | Use |
| --- | --- | --- |
| `rightbar.session` | single/session | right-bar session content |
| `sidebar.right.pane.tab` | keyed/session | tab body by tab-type id (`TabHookContext`) |
| `sidebar.right.pane.tab.title` | keyed/session | tab title |
| `sidebar.right.tab.guide` | chain/session | replace guide tab content |
| `sidebar.right.tab.guide.entry` | keyed/session | guide cards |
| `sidebar.right.tab.menu.item` | list/session | tab action menu items |
| `sidebar.right.tab.document` | keyed/session | document preview implementation by id |
| `sidebar.workspaces.directoryFlow` / `conversation.hero.workspace.directoryFlow` | single/root | workspace directory-picker interaction holes |

## Plugin manager — `ui-plugin-manager/src/client/slot-contract.ts`

| Slot | Kind/scope | Use |
| --- | --- | --- |
| `plugins.item` | list/root | one plugin page in the Official group (summary/page views) |
| `plugins.bundle.config` | keyed/root | per-bundle config page (keyed by bundle package name) |
| `plugins.row.config` | keyed/root | per-row config (`<pkg>#<row id>`) |
