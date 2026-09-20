export const CSS =
  `
.bh-root {
  /* @bh-brand-aliases:start — thin BotHarness brand map onto DSH semantic
     tokens (ADR-0028): at most three entries, no second design system. */
  --bh-accent: var(--dsw-alias-state-business-primary);
  --bh-hover: var(--dsw-alias-interactive-bg-hover);
  --bh-selected: var(--dsw-specific-sidebar-nav-item-active);
  /* @bh-brand-aliases:end */
  font: 13px/1.5 var(--dsw-font-family);
  color: var(--dsw-alias-label-primary);
}
.bh-root *,
.bh-root *::before,
.bh-root *::after {
  box-sizing: border-box;
}
.bh-root button,
.bh-root input {
  font: inherit;
}

.bh-region {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  /* 原生 WorkspaceBrowser 的 root 约定：右侧内衬 = --dsh-session-list-edge-inset
     （= --dsh-sidebar-inline-padding，12px）。外层 regionArea 已抵消 sidebar 的右
     侧 padding 并给 4px 左衬（见 hHd-Xa_regionArea）；顶层内容再补 4px 左衬即与
     原生 sectionHeader / 新会话行（20px）对齐。 */
  padding: 0 var(--dsh-sidebar-inline-padding) 4px 0;
}
.bh-region-rail {
  padding: 0;
}

/* 原生 工作区 sectionHeader 模式（ui-workspace WorkspaceBrowser.module.css）：
   36px 高、gap 4、左衬 4、上下 margin 2/4；原生 header 还向内容右缘外挂 4px
   （margin-right: -4px），但最右侧按钮仍停在内容右缘（实测 280px 侧栏里
   添加按钮右缘 268），因为原生 header 尾部还有一个占掉 gap 的调用流锚点。
   这里用 padding-right: 4px 复现同一条可见边，不再多一个尾部节点。 */
.bh-header {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  height: 36px;
  box-sizing: border-box;
  padding: 0 4px;
  margin: 2px -4px 4px 0;
  border-radius: 12px;
  overflow: hidden;
  color: var(--dsw-alias-label-tertiary);
}
.bh-header-label {
  flex: none;
  max-width: 45%;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  font-size: 14px;
  line-height: 20px;
  transition:
    max-width 180ms var(--ds-ease-in-out),
    margin-right 180ms var(--ds-ease-in-out),
    opacity 120ms var(--ds-ease-in-out),
    transform 180ms var(--ds-ease-in-out),
    visibility 0s linear;
}
.bh-header-label-hidden {
  max-width: 0;
  margin-right: -4px;
  opacity: 0;
  transform: translateX(-4px);
  visibility: hidden;
}
.bh-search-slot {
  flex: 1;
  max-width: 28px;
  min-width: 0;
  display: flex;
  align-items: center;
  margin-left: auto;
  box-sizing: border-box;
  transition: max-width 180ms var(--ds-ease-in-out);
}
.bh-search-slot-open {
  max-width: 100%;
}
.bh-search {
  flex: none;
  display: flex;
  align-items: center;
  width: 100%;
  height: 28px;
  box-sizing: border-box;
  border: none;
  border-radius: 50%;
  background: transparent;
  cursor: text;
  color: var(--dsw-alias-label-secondary);
  overflow: hidden;
  transition:
    width 180ms var(--ds-ease-in-out),
    padding 180ms var(--ds-ease-in-out),
    border-color 180ms var(--ds-ease-in-out);
}
.bh-search-open {
  width: calc(100% + 4px);
  height: 30px;
  margin-inline: -2px;
  padding-right: 4px;
  border: 0.5px solid var(--dsw-alias-border-l4);
  border-radius: 10px;
  color: var(--dsw-alias-label-caption);
}
.bh-search-btn {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 50%;
  padding: 0;
  background: transparent;
  cursor: pointer;
  color: inherit;
}
.bh-search-open .bh-search-btn {
  height: 30px;
}
.bh-search-btn:hover {
  background: var(--bh-hover);
}
.bh-search-open .bh-search-btn:hover {
  background: transparent;
}
.bh-search-input {
  flex: 1;
  width: 0;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  opacity: 0;
  pointer-events: none;
  font: inherit;
  font-size: 13px;
  line-height: 18px;
  color: var(--dsw-alias-label-primary);
  transition: opacity 120ms var(--ds-ease-in-out);
}
.bh-search-open .bh-search-input {
  margin-left: -2px;
  opacity: 1;
  pointer-events: auto;
}
.bh-search-input::placeholder {
  color: var(--dsw-alias-label-tertiary);
}
.bh-clear-btn {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 50%;
  padding: 0;
  background: transparent;
  cursor: pointer;
  color: var(--dsw-alias-label-secondary);
}
.bh-clear-btn:hover {
  background: var(--bh-hover);
}
.bh-header-actions {
  flex: none;
  display: flex;
  align-items: center;
  gap: 4px;
  max-width: 60px;
  overflow: hidden;
  transition:
    max-width 180ms var(--ds-ease-in-out),
    opacity 120ms var(--ds-ease-in-out),
    transform 180ms var(--ds-ease-in-out);
}
.bh-header-actions-hidden {
  max-width: 0;
  opacity: 0;
  transform: translateX(4px);
  visibility: hidden;
  pointer-events: none;
}
.bh-icon-btn {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 50%;
  padding: 0;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
}
.bh-icon-btn:hover {
  background: var(--bh-hover);
}

/* 原生侧栏面板行占满内容盒（ui-sidebar .panelRow width:100%），而原生
   新会话行每侧内收 2px（.newSession margin: 0 2px 8px）。面板行由外壳渲染，
   我们只注入图标，因此用 :has() 认领带本插件图标的行并对齐同一组
   horizontal insets；active 时同一条行内命中层把再次点击变成退出模式。 */
button:has(.bh-panel-glyph) {
  position: relative;
  width: auto;
  margin-inline: 2px;
}
.bh-panel-glyph {
  display: inline-flex;
}
.bh-panel-glyph-hit {
  position: absolute;
  inset: 0;
}

.bh-pinned-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 8px;
  margin-bottom: 12px;
  padding: 0 4px;
}
.bh-pinned {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 4px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  position: relative;
  font: inherit;
}
.bh-pinned:hover {
  background: var(--bh-hover);
}
.bh-pinned.bh-selected {
  background: var(--bh-selected);
}
.bh-pinned .bh-name {
  font-size: 12px;
  font-weight: 600;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bh-blob {
  display: inline-flex;
  flex: 0 0 auto;
}
.bh-blob svg {
  width: 100%;
  height: 100%;
  display: block;
}

/* 原生 .flatList/.groupSection 行距：同一 scope 内相邻行 2px。 */
.bh-list-area > * + * {
  margin-top: 2px;
}
/* 区块距（PM 定稿）：section 之间、平铺列表与首个 section 之间 12px ——
   外壳自身的块节奏（logoRow / panelList 的 margin-bottom 8px，收起态 12px）
   里最小且仍是明确视觉断点的取整；` +
  ` 选择器保证首个 section 不吃这个
   间距，末尾也不留悬空（bottom-margin 反而要在 :last-child 上打补丁）。 */
.bh-list-area + .bh-section,
.bh-section + .bh-section {
  margin-top: 12px;
}

/* 原生 .projectRow/.sessionRow 共同几何：8px 圆角、0 8px 内衬、悬停 alias
   token。行盒落在 root 内容右缘（280px 侧栏 = x12..268），与原生行同表一致。 */
/* .bh-root 前缀压过表单控件的 font: inherit 重置，让行盒与原生行同为
   14px/20px（可见文本各自声明字号）。 */
.bh-root .bh-section-head,
.bh-root .bh-channel-row {
  display: flex;
  align-items: center;
  box-sizing: border-box;
  width: 100%;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  cursor: pointer;
  text-align: left;
  font-size: 14px;
  line-height: 20px;
  user-select: none;
}
.bh-channel-row:hover,
.bh-channel-row.bh-selected {
  background: var(--bh-hover);
}

.bh-contact {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 7px 8px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
  font: inherit;
}
.bh-contact:hover {
  background: var(--bh-hover);
}
.bh-contact.bh-selected {
  background: var(--bh-hover);
}
.bh-contact .bh-body {
  min-width: 0;
  flex: 1;
}
.bh-contact .bh-top {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.bh-contact .bh-name {
  min-width: 0;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bh-role-badges {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  overflow: hidden;
}
.bh-role-badges > * {
  flex: 0 0 auto;
}
.bh-pinned .bh-role-badges {
  max-width: 100%;
  justify-content: center;
}
.bh-topbar .bh-role-badges {
  flex-wrap: wrap;
  overflow: visible;
}
.bh-contact .bh-msg {
  color: var(--dsw-alias-label-tertiary);
  font-size: 11.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bh-unread {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--bh-accent);
  flex: 0 0 auto;
}
.bh-state {
  flex: 0 0 auto;
}

.bh-channel-mark {
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  background: var(--dsw-alias-button-elevated-fill);
  color: var(--dsw-alias-label-secondary);
  font-weight: 600;
}
.bh-channel-mark-sm {
  width: 22px;
  height: 22px;
  border-radius: 7px;
  font-size: 12px;
}

/* 原生 .sessionRow：32px、gap 0（标题自带 margin）、无额外缩进；标题 14/20。 */
.bh-channel-row {
  height: 32px;
  gap: 0;
  padding: 0 8px;
  transition: opacity 120ms var(--ds-ease-in-out);
}
/* 拖拽源行原位淡出：标示来处，不占位、不推动任何布局（native 无此态，
   系刻意偏离：overlay 插入线之外唯一的拖拽中视觉）。 */
.bh-channel-row.bh-drag-source {
  opacity: 0.4;
}
.bh-channel-slot {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 20px;
  color: var(--dsw-alias-label-tertiary);
}
.bh-channel-title {
  flex: 1;
  min-width: 0;
  margin: 0 6px 0 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  line-height: 20px;
}
.bh-channel-meta {
  flex: none;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 20px;
}

/* 原生 ui-workspace sessionRow 的拖拽插入线（ADR-0031）：伪元素绝对定位，
   不占布局；箭头 + 2px 规则线，起点在行内 4px、右缘留 4px。行是 button，
   伪元素在 .bh-root .bh-channel-row 下同样生效。 */
.bh-channel-row.bh-drop-before,
.bh-channel-row.bh-drop-after {
  position: relative;
}
.bh-channel-row.bh-drop-before::before,
.bh-channel-row.bh-drop-after::after {
  content: '';
  position: absolute;
  z-index: 1;
  left: 0;
  right: 4px;
  height: 12px;
  background:
    linear-gradient(
      55deg,
      transparent calc(50% - 1px),
      var(--dsw-alias-state-business-primary) calc(50% - 1px) calc(50% + 1px),
      transparent calc(50% + 1px)
    ) 0 0 / 5px 7px no-repeat,
    linear-gradient(
      125deg,
      transparent calc(50% - 1px),
      var(--dsw-alias-state-business-primary) calc(50% - 1px) calc(50% + 1px),
      transparent calc(50% + 1px)
    ) 0 5px / 5px 7px no-repeat,
    linear-gradient(
      var(--dsw-alias-state-business-primary) 0 0
    ) 4px 5px / calc(100% - 4px) 2px no-repeat;
  pointer-events: none;
}
.bh-channel-row.bh-drop-before::before {
  top: -7px;
}
.bh-channel-row.bh-drop-after::after {
  bottom: -7px;
}

/* 原生 .groupSection 的 workspace 拖动插入线：section 头的重排和 flat
   gap 的松散落点把同一条渐变画在区块上下边界（-8px 落在 12px 间距带内）。
   伪元素绝对定位，不占布局，拖拽中没有任何区块改变高度。 */
.bh-section.bh-drop-before,
.bh-section.bh-drop-after {
  position: relative;
}
.bh-section.bh-drop-before::before,
.bh-section.bh-drop-after::after {
  content: '';
  position: absolute;
  z-index: 1;
  left: 0;
  right: 0;
  height: 12px;
  background:
    linear-gradient(
      55deg,
      transparent calc(50% - 1px),
      var(--dsw-alias-state-business-primary) calc(50% - 1px) calc(50% + 1px),
      transparent calc(50% + 1px)
    ) 0 0 / 5px 7px no-repeat,
    linear-gradient(
      125deg,
      transparent calc(50% - 1px),
      var(--dsw-alias-state-business-primary) calc(50% - 1px) calc(50% + 1px),
      transparent calc(50% + 1px)
    ) 0 5px / 5px 7px no-repeat,
    linear-gradient(
      var(--dsw-alias-state-business-primary) 0 0
    ) 4px 5px / calc(100% - 4px) 2px no-repeat;
  pointer-events: none;
}
.bh-section.bh-drop-before::before {
  top: -8px;
}
.bh-section.bh-drop-after::after {
  bottom: -8px;
}

/* Row-less section body 的投放线（空 / 折叠 / 过滤无行）：画在 body 顶部
   下方——空 body 下即紧贴 header 的位置。伪元素绝对定位，不占布局；
   取布局的旧空区方案已退役（它在 dragstart 内同步改变高度会掐断手势）。 */
.bh-section.bh-drop-scope > .bh-list-area {
  position: relative;
}
.bh-section.bh-drop-scope > .bh-list-area::before {
  content: '';
  position: absolute;
  z-index: 1;
  left: 0;
  right: 4px;
  top: 100%;
  height: 12px;
  background:
    linear-gradient(
      55deg,
      transparent calc(50% - 1px),
      var(--dsw-alias-state-business-primary) calc(50% - 1px) calc(50% + 1px),
      transparent calc(50% + 1px)
    ) 0 0 / 5px 7px no-repeat,
    linear-gradient(
      125deg,
      transparent calc(50% - 1px),
      var(--dsw-alias-state-business-primary) calc(50% - 1px) calc(50% + 1px),
      transparent calc(50% + 1px)
    ) 0 5px / 5px 7px no-repeat,
    linear-gradient(
      var(--dsw-alias-state-business-primary) 0 0
    ) 4px 5px / calc(100% - 4px) 2px no-repeat;
  pointer-events: none;
}

/* Section 头（Discord 式 PM 定稿）：24px 紧凑条、gap 6、padding 0 8px；
   无背景 fill（与 channel 行悬停区分）；标签默认 tertiary、悬停提亮到
   primary（原生 projectRow 悬停不提亮，此处按 PM 走 Discord 语言）；
   右侧 chevron 随标签同色、150ms 旋转指示折叠；整行可点击折叠
   （aria-expanded 留在行上）。未分组沿用同一标签色（无折叠态，不带
   chevron、不跟随提亮）。 */
.bh-section-head {
  height: 24px;
  gap: 6px;
  padding: 0 8px;
}
.bh-section-name {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  line-height: 20px;
  color: var(--dsw-alias-label-tertiary);
}
.bh-section-head:hover .bh-section-name,
.bh-section-head:hover .bh-section-chevron {
  color: var(--dsw-alias-label-primary);
}
.bh-section-chevron {
  flex: none;
  color: var(--dsw-alias-label-tertiary);
  transition: transform 150ms var(--ds-ease-in-out);
}
.bh-section-chevron.bh-chevron-collapsed {
  transform: rotate(-90deg);
}
.bh-section-count {
  flex: none;
  margin-left: auto;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 20px;
}

/* 原生 .rowActions：16px 字形、gap 12、仅悬停显示（菜单打开时的常显由
   row 组件的 menu-open 变体在交互接线时补上）。 */
.bh-row-actions {
  flex: none;
  display: none;
  align-items: center;
  gap: 12px;
  height: 20px;
}
.bh-section-head:hover .bh-row-actions,
.bh-section-head:focus-within .bh-row-actions,
.bh-section-head.bh-menu-open .bh-row-actions {
  display: inline-flex;
}
.bh-row-action {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border: none;
  border-radius: 4px;
  padding: 0;
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  cursor: pointer;
}
.bh-row-action:not(:disabled):hover {
  color: var(--dsw-alias-label-primary);
}
.bh-row-action:disabled {
  cursor: default;
}

@media (prefers-reduced-motion: reduce) {
  .bh-section-chevron {
    transition: none;
  }
}

/* 右键「移动到」菜单的锚点：JsonTree 的 proxy-rect 方案 —— fixed 定位的
   0 尺寸代理，Menu 用 getAnchorRect 读它的 rect 并把列表 portal 到 body，
   从而跟随光标且不被侧栏的 overflow 裁切（Menu 自身再钳制到视口边距）。 */
.bh-menu-anchor {
  position: fixed;
  z-index: 3;
  display: inline-flex;
}

/* 子菜单当前 scope 的尾部对勾：primitives 的 Menu 只为主行渲染 check，
   子菜单的选中标记因此放在 label 内（菜单 portal 到 body，类不依赖 .bh-root）。 */
.bh-move-checked {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}
.bh-move-checked-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 原生 WorkspaceBrowser .deleteAction：Modal 确认按钮走 error 色描边文本。
   双类提升特异性，压过 Modal 外挂载顺序下 primitives 的 outline 规则。 */
.bh-danger-action.bh-danger-action:not(:disabled) {
  color: var(--dsw-alias-state-error-primary);
}

/* 原生 WorkspaceBrowser 的 .renameInput（shipped dialog 用的是 feature-local
   普通 input，不是 primitives Input）：类自身拥有完整盒模型，Modal 在 body
   下也不依赖 .bh-root 前缀。几何逐项对齐原生：高 44、内衬 7/14、圆角 22、
   border-l4、透明底、14/22 label-primary、outline none。 */
.bh-name-input {
  box-sizing: border-box;
  width: 100%;
  height: 44px;
  padding: 7px 14px;
  border: 0.5px solid var(--dsw-alias-border-l4);
  border-radius: 22px;
  outline: none;
  background: transparent;
  font-size: 14px;
  font-weight: 400;
  line-height: 22px;
  color: var(--dsw-alias-label-primary);
}
.bh-name-input::placeholder {
  color: var(--dsw-alias-label-dimmed);
}
.bh-name-input:disabled {
  color: var(--dsw-alias-label-dimmed);
}

/* PersonaBot creation is portaled with the native Modal, so these form styles
   intentionally do not depend on the .bh-root surface. */
.bh-personabot-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}
.bh-personabot-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.bh-personabot-label {
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  font-weight: 500;
  line-height: 18px;
}
.bh-personabot-hint {
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
}
.bh-role-editor {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.bh-role-editor-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.bh-role-edit-badge {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
.bh-role-edit-badge button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  margin-left: -2px;
  border: 0;
  border-radius: 50%;
  padding: 0;
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  cursor: pointer;
}
.bh-role-edit-badge button:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.bh-role-edit-badge button:disabled {
  cursor: default;
  color: var(--dsw-alias-label-dimmed);
}

/* 创建失败提示留在 Modal 体内；Modal 在 body 下，不能依赖 .bh-root 前缀。 */
.bh-modal-error {
  margin-top: 8px;
  border: 1px solid var(--dsw-alias-state-error-secondary);
  background: var(--dsw-alias-interactive-bg-hover-danger);
  color: var(--dsw-alias-state-error-primary);
  border-radius: 8px;
  padding: 6px 8px;
  font-size: 12px;
}

.bh-note {
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  padding: 6px 4px;
}
.bh-empty-create {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  padding: 12px 4px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
}
.bh-error {
  margin: 4px 4px 10px;
  border: 1px solid var(--dsw-alias-state-error-secondary);
  background: var(--dsw-alias-interactive-bg-hover-danger);
  color: var(--dsw-alias-state-error-primary);
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 12px;
}

.bh-main {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  background: var(--dsw-alias-bg-base);
}
.bh-topbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 18px;
  border-bottom: 1px solid var(--dsw-alias-border-l2);
  flex: 0 0 auto;
  min-height: 0;
}
.bh-topbar .bh-title {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bh-pill {
  margin-left: auto;
  flex: 0 0 auto;
}
.bh-content {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.bh-placeholder {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--dsw-alias-label-tertiary);
  flex-direction: column;
  gap: 6px;
  text-align: center;
  padding: 24px;
}
.bh-placeholder .bh-big {
  font-size: 15px;
  color: var(--dsw-alias-label-secondary);
}
.bh-dim {
  color: var(--dsw-alias-label-tertiary);
}

.bh-chat-layout {
  display: flex;
  flex: 1;
  min-height: 0;
}
.bh-chat-pane {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.bh-chat-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 18px;
}
.bh-chat-empty {
  height: 100%;
}
.bh-bubble-row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  max-width: 100%;
}
.bh-bubble-row-me {
  justify-content: flex-end;
}
.bh-bubble {
  max-width: min(560px, 78%);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 12px;
  background: var(--dsw-alias-button-elevated-fill);
  padding: 8px 10px;
}
.bh-bubble-me {
  background: var(--dsw-alias-interactive-bg-active);
  border-color: transparent;
}
.bh-bubble-author {
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary);
  margin-bottom: 2px;
}
.bh-bubble-body {
  white-space: pre-wrap;
  word-break: break-word;
}
.bh-bubble-time {
  margin-top: 3px;
  font-size: 10.5px;
  color: var(--dsw-alias-label-tertiary);
  text-align: right;
}

.bh-composer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-top: 1px solid var(--dsw-alias-border-l2);
  flex: 0 0 auto;
}
.bh-composer-input {
  flex: 1;
  min-width: 0;
}

.bh-side-pane {
  width: 320px;
  flex: 0 0 320px;
  min-height: 0;
  display: flex;
  border-left: 1px solid var(--dsw-alias-border-l2);
}
.bh-side-pane-inner {
  display: flex;
  flex-direction: column;
  min-height: 0;
  width: 100%;
}
.bh-side-pane-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px 8px;
  border-bottom: 1px solid var(--dsw-alias-border-l2);
  font-weight: 600;
}
.bh-side-pane-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 8px 10px 12px;
}
.bh-session-row {
  padding: 8px;
  border-radius: 8px;
}
.bh-session-row:hover {
  background: var(--bh-hover);
}
.bh-session-title {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bh-session-meta {
  display: flex;
  gap: 8px;
  margin-top: 2px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
}
.bh-session-cwd {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bh-member-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
}

/* Native General-row cell rhythm (ui-theme FontSizeRow / ui-chat
   TranscriptViewRow): title + description left, selector pill right, hairline
   separator the General section strips on its last child. */
.bh-sort-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 0;
  border-bottom: 0.5px solid var(--dsw-alias-border-l2);
}
.bh-sort-row-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-right: 48px;
}
.bh-sort-row-title {
  font-size: 14px;
  font-weight: 400;
  line-height: 22px;
  color: var(--dsw-alias-label-primary);
}
.bh-sort-row-desc {
  font-size: 12px;
  font-weight: 400;
  line-height: 18px;
  color: var(--dsw-alias-label-tertiary);
}
.bh-sort-selector {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  height: 36px;
  padding: 0 14px;
  border: none;
  border-radius: 18px;
  background: var(--dsw-alias-bg-module-platform);
  font: inherit;
  font-size: 14px;
  line-height: 22px;
  color: var(--dsw-alias-label-primary);
  cursor: pointer;
}
.bh-sort-selector:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.bh-sort-chevron {
  flex: none;
}
`;
