import { DEEPSEEKBOT_TRANSPARENT_DATA_URI } from './bot-icon-assets.js';

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
.bh-root input,
.bh-root textarea {
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
  align-items: center;
  gap: 0;
  scrollbar-width: none;
}
.bh-region-rail::-webkit-scrollbar {
  display: none;
}
.bh-rail-group {
  display: flex;
  width: 36px;
  flex: none;
  flex-direction: column;
  gap: 8px;
}
.bh-rail-channel {
  position: relative;
  display: flex;
  width: 36px;
  height: 36px;
  align-items: center;
  justify-content: center;
  padding: 2px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
}
.bh-rail-channel:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.bh-rail-channel.bh-selected {
  background: var(--dsw-specific-sidebar-nav-item-active);
  color: var(--dsw-alias-label-primary);
}
.bh-rail-channel:focus-visible {
  outline: 2px solid var(--dsw-alias-label-primary);
  outline-offset: -2px;
}
.bh-rail-channel-icon {
  display: inline-flex;
  width: 32px;
  height: 32px;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--dsw-alias-button-elevated-fill);
}
.bh-rail-divider {
  width: 28px;
  flex: none;
  margin: 10px 4px;
  border-top: 0.5px solid var(--dsw-alias-border-l3);
}

/* HoverCard portals this preview to body, so these rules intentionally do
   not depend on the bh-root ancestor or its three local brand aliases. */
.bh-rail-preview {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 5px;
  color: var(--dsw-alias-label-primary);
}
.bh-rail-preview-head {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}
.bh-rail-preview-icon {
  display: inline-flex;
  width: 24px;
  height: 24px;
  flex: none;
  align-items: center;
  justify-content: center;
  border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: 50%;
}
.bh-rail-preview-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 15px;
  font-weight: 600;
  line-height: 20px;
}
.bh-rail-preview-meta,
.bh-rail-preview-description,
.bh-rail-preview-summary {
  display: -webkit-box;
  overflow: hidden;
  line-height: 18px;
  -webkit-box-orient: vertical;
}
.bh-rail-preview-meta,
.bh-rail-preview-description {
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  -webkit-line-clamp: 2;
}
.bh-rail-preview-summary {
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  -webkit-line-clamp: 3;
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
  overflow: hidden;
  width: auto;
  margin-inline: 2px;
}

/* The Bot row keeps its native shape and simply stands taller than the other
   sidebar rows, with a larger mark and label to match. */
button:has(.bh-panel-glyph[data-wide='true']) {
  min-height: 44px;
}

button:has(.bh-panel-glyph[data-wide='true']) .bh-panel-glyph > .bh-bot-icon {
  width: 24px;
  height: 24px;
}

button:has(.bh-panel-glyph[data-wide='true']) > span:not(.bh-panel-glyph):not(.bh-panel-glyph-hit):not(.bh-panel-gear) {
  font-size: 16px;
  line-height: 24px;
}

/* The Bot mode switch: the button keeps its own background, the transparent
   mascot is scaled to twice the fitted size and anchored bottom-left as a
   texture layer, and the chosen mark sits above it. */
button:has(.bh-panel-glyph)::before {
  content: '';
  position: absolute;
  left: 0;
  bottom: 0;
  width: 200%;
  height: 200%;
  background: var(--bh-bot-texture, url(${DEEPSEEKBOT_TRANSPARENT_DATA_URI})) left bottom / contain
    no-repeat;
  opacity: 0.1;
  pointer-events: none;
}

.bh-panel-glyph {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.bh-panel-glyph-hit {
  position: absolute;
  inset: 0;
}

/* Settings gear on the active Bot row: hidden until the row is hovered, then
   it opens the Bot section of the Settings dialog. */
.bh-panel-gear {
  position: absolute;
  top: 50%;
  right: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  color: var(--dsw-alias-label-secondary);
  opacity: 0;
  pointer-events: none;
  transform: translateY(-50%);
  transition:
    opacity 120ms var(--ds-ease-in-out),
    background 120ms var(--ds-ease-in-out);
}

button:has(.bh-panel-glyph):hover .bh-panel-gear {
  opacity: 1;
  pointer-events: auto;
}

.bh-panel-gear:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}

.bh-pin-zone {
  flex: none;
  overflow: hidden;
  margin-bottom: 0;
  border-radius: 12px;
  transition:
    height 150ms var(--ds-ease-in-out),
    min-height 150ms var(--ds-ease-in-out),
    margin-bottom 150ms var(--ds-ease-in-out),
    opacity 120ms var(--ds-ease-in-out),
    background 120ms var(--ds-ease-in-out),
    border-color 120ms var(--ds-ease-in-out),
    box-shadow 120ms var(--ds-ease-in-out);
}
.bh-pin-zone-empty {
  display: grid;
  place-items: center;
  height: 96px;
  min-height: 96px;
  margin-bottom: 12px;
  margin-inline: 4px;
  border: 1px dashed var(--dsw-alias-border-l3);
  background: var(--dsw-alias-button-elevated-fill);
  opacity: 1;
}
.bh-pin-zone-empty.bh-pin-zone-hidden {
  height: 0;
  min-height: 0;
  margin-bottom: 0;
  border-width: 0;
  opacity: 0;
  pointer-events: none;
}
.bh-pin-zone-filled {
  margin-bottom: 12px;
  padding: 4px;
}
.bh-pin-zone-active {
  background: var(--bh-hover);
  box-shadow: inset 0 0 0 1px var(--bh-accent);
}
.bh-pin-zone-empty.bh-pin-zone-active {
  border-color: var(--bh-accent);
}
.bh-pin-zone-hint {
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  font-weight: 500;
  pointer-events: none;
}
.bh-unpin-zone {
  display: grid;
  flex: none;
  place-items: center;
  box-sizing: border-box;
  height: 72px;
  min-height: 72px;
  margin: 0 4px 12px;
  border: 1px dashed var(--dsw-alias-border-l3);
  border-radius: 12px;
  background: var(--dsw-alias-button-elevated-fill);
  opacity: 1;
  transition:
    height 150ms var(--ds-ease-in-out),
    min-height 150ms var(--ds-ease-in-out),
    margin-bottom 150ms var(--ds-ease-in-out),
    opacity 120ms var(--ds-ease-in-out),
    background 120ms var(--ds-ease-in-out),
    border-color 120ms var(--ds-ease-in-out),
    box-shadow 120ms var(--ds-ease-in-out);
}
.bh-unpin-zone-hidden {
  height: 0;
  min-height: 0;
  margin-bottom: 0;
  border-width: 0;
  opacity: 0;
  pointer-events: none;
}
.bh-unpin-zone-active {
  background: var(--bh-hover);
  border-color: var(--bh-accent);
  box-shadow: inset 0 0 0 1px var(--bh-accent);
}
.bh-unpin-zone-hint {
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  font-weight: 500;
  pointer-events: none;
}
.bh-pinned-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(76px, 1fr));
  gap: 6px 8px;
}
.bh-pinned-header {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 20px;
  padding: 0 4px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  font-weight: 600;
}
.bh-pinned-header .bh-row-action {
  width: 20px;
  height: 20px;
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
.bh-pinned.bh-drag-source {
  opacity: 0.4;
}
.bh-pinned.bh-pin-drop-before::before,
.bh-pinned.bh-pin-drop-after::after {
  content: '';
  position: absolute;
  z-index: 1;
  top: 6px;
  bottom: 6px;
  width: 2px;
  border-radius: 2px;
  background: var(--bh-accent);
  pointer-events: none;
}
.bh-pinned.bh-pin-drop-before::before {
  left: 0;
}
.bh-pinned.bh-pin-drop-after::after {
  right: 0;
}

.bh-pinned .bh-name {
  font-size: 12px;
  font-weight: 600;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bh-pinned-channel-icon {
  display: inline-flex;
  width: 54px;
  height: 54px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--dsw-alias-button-elevated-fill);
  color: var(--dsw-alias-label-secondary);
}
.bh-persona-avatar {
  position: relative;
  z-index: 0;
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  isolation: isolate;
}
.bh-avatar-media {
  display: inline-flex;
  width: 100%;
  height: 100%;
}
.bh-avatar-media svg,
.bh-avatar-media img {
  width: 100%;
  height: 100%;
  display: block;
}
.bh-avatar-media-image {
  overflow: hidden;
  border-radius: 50%;
  background: var(--dsw-alias-button-elevated-fill);
}
.bh-avatar-media-image img {
  object-fit: cover;
}
.bh-persona-avatar[data-active='true']::before {
  content: '';
  position: absolute;
  z-index: -1;
  inset: -2px;
  border: 1px solid var(--dsw-alias-state-business-primary);
  border-radius: 50%;
  opacity: 0.52;
  animation: bh-avatar-halo 1600ms var(--ds-ease-in-out) infinite;
}
.bh-persona-avatar[data-media='blob'][data-effect='thinking-dots'] .bh-avatar-media {
  animation: bh-avatar-breathe 1300ms var(--ds-ease-in-out) infinite;
}
.bh-persona-avatar[data-media='blob'][data-effect='generic-working'] .bh-avatar-media {
  animation: bh-avatar-work 1500ms var(--ds-ease-in-out) infinite;
}
.bh-persona-avatar[data-media='blob'][data-effect='searching'] .bh-avatar-media {
  animation: bh-avatar-search 1250ms var(--ds-ease-in-out) infinite;
}
.bh-persona-avatar[data-media='blob'][data-effect='coding'] .bh-avatar-media {
  animation: bh-avatar-code 1000ms var(--ds-ease-in-out) infinite;
}
.bh-persona-avatar[data-media='blob'][data-effect='executing'] .bh-avatar-media {
  animation: bh-avatar-execute 900ms var(--ds-ease-in-out) infinite;
}
.bh-avatar-indicator {
  position: absolute;
  right: -2px;
  bottom: -2px;
  width: 8px;
  height: 8px;
  border: 1.5px solid var(--dsw-alias-bg-base);
  border-radius: 999px;
  background: var(--dsw-alias-state-business-primary);
}
.bh-persona-avatar[data-state='waiting'] .bh-avatar-indicator {
  background: var(--dsw-alias-state-warn-primary);
}
.bh-persona-avatar[data-state='blocked'] .bh-avatar-indicator {
  background: var(--dsw-alias-state-error-primary);
}
.bh-avatar-thinking {
  right: -5px;
  bottom: -3px;
  width: 18px;
  height: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 1.5px;
  border-radius: 999px;
  background: var(--dsw-alias-bg-base);
}
.bh-avatar-thinking i {
  width: 2.5px;
  height: 2.5px;
  border-radius: 50%;
  background: var(--dsw-alias-state-business-primary);
  animation: bh-thinking-dot 1050ms var(--ds-ease-in-out) infinite;
}
.bh-avatar-thinking i:nth-child(2) {
  animation-delay: 140ms;
}
.bh-avatar-thinking i:nth-child(3) {
  animation-delay: 280ms;
}
.bh-avatar-facepile {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  padding-right: 3px;
}
.bh-avatar-facepile > * + * {
  margin-left: -7px;
}
.bh-avatar-facepile .bh-persona-avatar,
.bh-avatar-facepile-overflow {
  border: 1.5px solid var(--dsw-alias-bg-base);
  border-radius: 50%;
}
.bh-avatar-facepile-overflow {
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--dsw-alias-button-elevated-fill);
  color: var(--dsw-alias-label-secondary);
  font-size: 9px;
  font-weight: 600;
}
@keyframes bh-avatar-halo {
  0%,
  100% {
    opacity: 0.3;
    transform: scale(0.96);
  }
  50% {
    opacity: 0.72;
    transform: scale(1.06);
  }
}
@keyframes bh-avatar-breathe {
  0%,
  100% {
    transform: scale(0.98);
  }
  50% {
    transform: scale(1.035);
  }
}
@keyframes bh-avatar-work {
  0%,
  100% {
    transform: translateY(0) rotate(0deg);
  }
  38% {
    transform: translateY(-2%) rotate(-1.5deg);
  }
  70% {
    transform: translateY(1%) rotate(1deg);
  }
}
@keyframes bh-avatar-search {
  0%,
  100% {
    transform: translateX(-2%);
  }
  50% {
    transform: translateX(2%);
  }
}
@keyframes bh-avatar-code {
  0%,
  100% {
    transform: scaleY(0.98);
  }
  50% {
    transform: scaleY(1.035);
  }
}
@keyframes bh-avatar-execute {
  0%,
  100% {
    transform: rotate(-1.5deg);
  }
  50% {
    transform: rotate(1.5deg);
  }
}
@keyframes bh-thinking-dot {
  0%,
  70%,
  100% {
    opacity: 0.38;
    transform: translateY(0);
  }
  35% {
    opacity: 1;
    transform: translateY(-1.5px);
  }
}
html[data-botharness-motion='reduce'] .bh-persona-avatar::before,
html[data-botharness-motion='reduce'] .bh-avatar-media,
html[data-botharness-motion='reduce'] .bh-avatar-thinking i {
  animation: none !important;
}

/* 原生 .flatList/.groupSection 行距：同一 scope 内相邻行 2px。 */
.bh-list-area > * + * {
  margin-top: 2px;
}
.bh-roster-list {
  flex: 1 0 auto;
  min-height: 72px;
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
.bh-root .bh-multi-selected {
  background: var(--bh-selected);
  box-shadow: inset 0 0 0 1px var(--dsw-alias-border-l2);
}
.bh-contact,
.bh-root .bh-channel-row {
  position: relative;
}
.bh-shortcut-badge {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  display: inline-flex;
  width: 20px;
  height: 20px;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 5px;
  background: var(--dsw-alias-button-elevated-fill);
  color: var(--dsw-alias-label-primary);
  font: 11px/1 var(--dsw-font-family);
  pointer-events: none;
}
.bh-shortcut-active .bh-state,
.bh-shortcut-active .bh-channel-meta {
  visibility: hidden;
}
.bh-pinned .bh-shortcut-badge {
  top: 8px;
  right: 5px;
  transform: none;
}
.bh-rail-channel .bh-shortcut-badge {
  top: -2px;
  right: -2px;
  transform: none;
  width: 16px;
  height: 16px;
  font-size: 10px;
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
  transition: opacity 120ms var(--ds-ease-in-out);
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
.bh-contact.bh-drag-source {
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
.bh-channel-row.bh-drop-after,
.bh-contact.bh-drop-before,
.bh-contact.bh-drop-after {
  position: relative;
}
.bh-channel-row.bh-drop-before::before,
.bh-channel-row.bh-drop-after::after,
.bh-contact.bh-drop-before::before,
.bh-contact.bh-drop-after::after {
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
.bh-channel-row.bh-drop-before::before,
.bh-contact.bh-drop-before::before {
  top: -7px;
}
.bh-channel-row.bh-drop-after::after,
.bh-contact.bh-drop-after::after {
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

html[data-botharness-motion='reduce'] .bh-pin-zone,
html[data-botharness-motion='reduce'] .bh-unpin-zone,
html[data-botharness-motion='reduce'] .bh-section-chevron {
  transition: none;
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

/* Hidden Channel recovery is portaled under body; never depend on .bh-root. */
.bh-hidden-manager {
  display: flex;
  flex-direction: column;
  gap: 0;
  min-width: 0;
}
.bh-hidden-manager > :last-child {
  gap: 8px;
  margin-top: 12px;
}
.bh-hidden-search {
  box-sizing: border-box;
  width: 100%;
}
.bh-hidden-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: min(360px, 55vh);
  overflow-y: auto;
}
.bh-hidden-row {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  padding: 2px 4px;
  border-radius: 8px;
}
.bh-hidden-row:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.bh-hidden-channel-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 28px;
  width: 28px;
  height: 28px;
  color: var(--dsw-alias-label-secondary);
}
.bh-hidden-copy {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
}
.bh-hidden-name,
.bh-hidden-meta {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bh-hidden-name {
  color: var(--dsw-alias-label-primary);
  font-size: 14px;
  line-height: 18px;
}
.bh-hidden-meta {
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 16px;
}
.bh-hidden-empty {
  padding: 28px 8px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 13px;
  text-align: center;
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
.bh-main {
  --bh-channel-header-height: 53px;
}
.bh-topbar {
  position: absolute;
  inset: 0 0 auto;
  z-index: 3;
  display: flex;
  justify-content: center;
  min-width: 0;
  padding: 10px 52px 0;
  pointer-events: none;
}
.bh-channel-island {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  max-width: min(100%, 440px);
  min-height: 34px;
  padding: 5px 12px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 999px;
  background: var(--dsw-alias-bg-module-platform);
  box-shadow: 0 3px 12px color-mix(in srgb, var(--dsw-alias-label-primary) 12%, transparent);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  cursor: pointer;
  pointer-events: auto;
}
.bh-channel-island:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.bh-channel-island:focus-visible {
  outline: 2px solid var(--dsw-alias-label-primary);
  outline-offset: 2px;
}
.bh-channel-island > :first-child {
  flex: 0 0 auto;
}
.bh-chat-top-fade {
  position: absolute;
  inset: 0 0 auto;
  z-index: 2;
  height: 96px;
  background: var(--dsw-alias-bg-base);
  mask-image: linear-gradient(to bottom, var(--dsw-alias-label-primary) 16%, transparent 100%);
  pointer-events: none;
}
.bh-topbar .bh-title {
  flex: 1 1 auto;
  min-width: 56px;
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
  position: relative;
}
.bh-chat-pane {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  position: relative;
}
.bh-chat-body {
  position: relative;
  z-index: 1;
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  padding: 74px 18px 10px;
  overscroll-behavior: contain;
}
.bh-chat-empty {
  height: 100%;
}
.bh-timeline-top-sentinel,
.bh-timeline-newer-sentinel {
  min-height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
}
.bh-timeline-top-sentinel button,
.bh-timeline-newer-sentinel button {
  border: 0;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
}
.bh-timeline-top-sentinel button:hover,
.bh-timeline-newer-sentinel button:hover {
  color: var(--dsw-alias-label-primary);
}
.bh-message-block + .bh-message-block {
  margin-top: 14px;
}
.bh-message-day {
  width: fit-content;
  margin: 10px auto 16px;
  padding: 3px 10px;
  border-radius: 999px;
  background: var(--dsw-alias-button-elevated-fill);
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
}
.bh-message-group {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  min-width: 0;
}
.bh-message-group-me {
  justify-content: flex-end;
}
.bh-message-group-avatar {
  flex: 0 0 28px;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: flex-end;
  margin-bottom: 18px;
}
.bh-message-stack {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  min-width: 0;
  max-width: min(560px, 78%);
}
.bh-message-group-me .bh-message-stack {
  align-items: flex-end;
}
.bh-bubble-author {
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  margin: 0 0 4px 2px;
}
.bh-message-group-me .bh-bubble-author {
  margin: 0 2px 4px 0;
}
.bh-bubble-wrap {
  position: relative;
  width: fit-content;
  max-width: 100%;
}
.bh-bubble-wrap-failed {
  display: flex;
  align-items: center;
  gap: 8px;
}
.bh-bubble-failed-action {
  flex: none;
  border: 0;
  padding: 2px 0;
  color: var(--dsw-alias-state-error-primary);
  background: transparent;
  font-size: 11px;
  cursor: pointer;
}
.bh-bubble-failed-action:focus-visible {
  outline: 2px solid var(--dsw-alias-label-primary);
  outline-offset: 2px;
}
.bh-bubble-wrap + .bh-bubble-wrap {
  margin-top: 2px;
}
.bh-bubble {
  width: fit-content;
  max-width: 100%;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 18px;
  background: var(--dsw-alias-button-elevated-fill);
  padding: 8px 12px;
}
.bh-bubble[data-group-position='first'] {
  border-bottom-left-radius: 5px;
}
.bh-bubble[data-group-position='middle'] {
  border-top-left-radius: 5px;
  border-bottom-left-radius: 5px;
}
.bh-bubble[data-group-position='last'] {
  border-top-left-radius: 5px;
}
.bh-message-group-me .bh-bubble[data-group-position='first'] {
  border-bottom-left-radius: 18px;
  border-bottom-right-radius: 5px;
}
.bh-message-group-me .bh-bubble[data-group-position='middle'] {
  border-top-left-radius: 18px;
  border-bottom-left-radius: 18px;
  border-top-right-radius: 5px;
  border-bottom-right-radius: 5px;
}
.bh-message-group-me .bh-bubble[data-group-position='last'] {
  border-top-left-radius: 18px;
  border-top-right-radius: 5px;
}
.bh-bubble-me {
  background: var(--dsw-alias-interactive-bg-active);
  border-color: transparent;
}
.bh-bubble-pending {
  opacity: 0.55;
}
.bh-bubble-failed {
  opacity: 0.8;
}
.bh-bubble-focused .bh-bubble {
  box-shadow: 0 0 0 2px var(--dsw-alias-label-primary);
}
.bh-bubble-reply {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
  margin: 0 0 7px;
  padding: 4px 8px;
  border: 0;
  border-left: 2px solid var(--dsw-alias-label-secondary);
  border-radius: 4px;
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent);
  color: var(--dsw-alias-label-secondary);
  text-align: left;
  cursor: pointer;
}
.bh-bubble-reply:hover {
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 12%, transparent);
}
.bh-bubble-reply:focus-visible {
  outline: 2px solid var(--dsw-alias-label-primary);
  outline-offset: 2px;
}
.bh-bubble-reply-unavailable {
  cursor: default;
}
.bh-bubble-reply-author {
  font-size: 11px;
  font-weight: 600;
}
.bh-bubble-reply-body {
  overflow: hidden;
  max-width: 100%;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 11px;
}

/* Files stay part of the same message grouping as their text. */
.bh-bubble-content { min-width: 0; }
.bh-message-attachments { display: grid; gap: 6px; margin-top: 6px; }
.bh-message-image-link { display: block; max-width: min(100%, 360px); }
.bh-message-image { display: block; max-width: 100%; max-height: 320px; border-radius: 12px; object-fit: contain; }
.bh-message-file { display: inline-flex; align-items: center; gap: 5px; min-width: 0; width: fit-content; max-width: 100%; padding: 7px 10px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 10px; color: inherit; overflow-wrap: anywhere; }
.bh-bubble-body {
  white-space: pre-wrap;
  word-break: break-word;
}
.bh-bubble-body-markdown {
  min-width: 0;
  white-space: normal;
}
.bh-bubble-body-markdown > :first-child > :first-child {
  margin-top: 0;
}
.bh-bubble-body-markdown > :first-child > :last-child {
  margin-bottom: 0;
}
.bh-bubble-body-markdown .md-code-block {
  max-width: 100%;
}
.bh-bubble-body-markdown pre {
  max-width: 100%;
  overflow-x: auto;
}
.bh-bubble-time {
  margin: 4px 2px 0;
  font-size: 10.5px;
  color: var(--dsw-alias-label-tertiary);
}
.bh-bubble-quick-action {
  position: absolute;
  right: -34px;
  top: 50%;
  transform: translateY(-50%);
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 50%;
  color: var(--dsw-alias-label-secondary);
  background: var(--dsw-alias-button-elevated-fill);
  cursor: pointer;
  opacity: 0;
}
.bh-message-group-me .bh-bubble-quick-action {
  right: auto;
  left: -34px;
}
.bh-bubble-wrap:hover .bh-bubble-quick-action,
.bh-bubble-quick-action:focus-visible {
  opacity: 1;
}
.bh-timeline-new {
  position: absolute;
  z-index: 2;
  bottom: 82px;
  left: 50%;
  transform: translateX(-50%);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 999px;
  padding: 6px 12px;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-module-platform);
  box-shadow: 0 4px 16px color-mix(in srgb, var(--dsw-alias-label-primary) 12%, transparent);
  cursor: pointer;
}

.bh-composer-shell {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
  margin: 0 14px calc(12px + env(safe-area-inset-bottom, 0px));
  flex: 0 0 auto;
}
.bh-composer {
  --bh-composer-body-height: 34px;
  position: relative;
  min-height: 50px;
  box-sizing: border-box;
  overflow: hidden;
  padding: 7px 54px 7px 44px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 25px;
  background: var(--dsw-alias-bg-module-platform);
  box-shadow: 0 8px 24px
    color-mix(in srgb, var(--dsw-alias-label-primary) 9%, transparent);
  transition:
    padding 220ms var(--ds-ease-in-out),
    border-radius 220ms var(--ds-ease-in-out);
}
.bh-composer-expanded {
  padding-top: 10px;
  padding-bottom: 48px;
  border-radius: 20px;
}
.bh-composer-with-footer {
  padding: 10px 12px 48px;
  border-radius: 20px;
}
.bh-composer-reply {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 0 0 6px 8px;
}
.bh-composer-reply-copy {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  gap: 2px;
  padding-left: 8px;
  border-left: 2px solid var(--dsw-alias-label-secondary);
}
.bh-composer-reply-author {
  overflow: hidden;
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.bh-composer-reply-body {
  overflow: hidden;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.bh-composer-reply-cancel {
  flex: 0 0 24px;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  color: var(--dsw-alias-label-secondary);
  background: transparent;
  font-size: 18px;
  cursor: pointer;
}
.bh-composer-reply-cancel:hover {
  background: var(--dsw-alias-interactive-bg-active);
}
.bh-composer-reply-cancel:focus-visible {
  outline: 2px solid var(--dsw-alias-label-primary);
}

.bh-composer-activity-status {
  min-height: 40px;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 6px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11.5px;
}
.bh-composer-activity-facepile .bh-persona-avatar,
.bh-composer-activity-facepile .bh-avatar-facepile-overflow {
  border: 0;
}
.bh-composer-activity-facepile .bh-persona-avatar::before {
  display: none;
}
.bh-composer-activity-summary {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bh-composer-file-input { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
.bh-composer-add-file { position: absolute; left: 8px; bottom: 10px; width: 30px; height: 30px; padding: 0; border: 0; border-radius: 50%; background: transparent; color: var(--dsw-alias-label-secondary); font-size: 22px; line-height: 30px; cursor: pointer; }
.bh-composer-add-file:hover { background: var(--dsw-alias-interactive-bg-active); }
.bh-composer-add-file:disabled { opacity: .5; cursor: default; }
.bh-composer-attachments { display: flex; flex-wrap: wrap; gap: 5px; padding: 2px 6px 7px 0; }
.bh-composer-attachment { display: inline-flex; align-items: center; gap: 5px; max-width: 100%; padding: 4px 6px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; color: var(--dsw-alias-label-secondary); font-size: 11px; }
.bh-composer-attachment-name { overflow: hidden; max-width: 180px; white-space: nowrap; text-overflow: ellipsis; }
.bh-composer-attachment button { padding: 0 2px; border: 0; background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; }
.bh-composer-body {
  display: flex;
  min-width: 0;
  height: var(--bh-composer-body-height);
  overflow: hidden;
}
.bh-composer-first-expand .bh-composer-body {
  transition: height 220ms var(--ds-ease-in-out);
}
.bh-composer-input {
  display: block;
  width: 100%;
  min-width: 0;
  min-height: 34px;
  max-height: 144px;
  box-sizing: border-box;
  border: 0;
  outline: none;
  resize: none;
  padding: 7px 8px 5px;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  line-height: 22px;
  overflow-wrap: anywhere;
}
.bh-composer-input::placeholder {
  color: var(--dsw-alias-label-dimmed);
}
.bh-composer-input:disabled {
  color: var(--dsw-alias-label-dimmed);
  cursor: default;
}
.bh-composer-footer {
  position: absolute;
  right: 10px;
  bottom: 8px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
}
.bh-send-btn {
  width: 34px;
  min-width: 34px;
  height: 34px;
  padding: 0;
  border-radius: 50%;
}
html[data-botharness-motion='reduce'] .bh-composer,
html[data-botharness-motion='reduce'] .bh-composer-body,
html[data-botharness-motion='reduce'] .bh-composer-add-file,
html[data-botharness-motion='reduce'] .bh-composer-footer {
  transition: none;
}

.bh-channel-sidebar {
  position: relative;
  width: 320px;
  flex: 0 0 320px;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--dsw-alias-border-l2);
}
.bh-channel-sidebar-resize {
  position: absolute;
  left: -3px;
  top: 0;
  bottom: 0;
  width: 6px;
  cursor: col-resize;
  z-index: 2;
}
.bh-channel-sidebar-resize:hover {
  background: var(--dsw-alias-border-l2);
}
.bh-channel-sidebar-head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 42px;
  padding: 10px 44px 2px 14px;
}
.bh-channel-sidebar-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
}
.bh-sidebar-toggle {
  position: absolute;
  top: calc((var(--bh-channel-header-height) - 28px) / 2);
  right: 8px;
  z-index: 7;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
}
.bh-sidebar-toggle:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.bh-channel-sidebar-entries {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 6px 0 12px;
}
.bh-channel-sidebar-entry-head {
  display: flex;
  align-items: center;
  gap: 6px;
  width: calc(100% - 12px);
  height: 32px;
  margin: 2px 6px;
  padding: 0 8px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.bh-channel-sidebar-entry-head:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.bh-channel-sidebar-entry-chevron {
  flex: none;
  display: inline-flex;
  color: var(--dsw-alias-label-tertiary);
  transition: transform 150ms var(--ds-ease-in-out);
}
.bh-channel-sidebar-entry-chevron.bh-chevron-collapsed {
  transform: rotate(-90deg);
}
.bh-channel-sidebar-entry-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  line-height: 20px;
}
.bh-channel-sidebar-entry-badge {
  flex: none;
  display: inline-flex;
}
.bh-channel-sidebar-entry-body {
  padding: 2px 12px 10px;
}
.bh-channel-sidebar-overlay-layer {
  position: absolute;
  inset: 0;
  z-index: 6;
  display: flex;
  justify-content: flex-end;
}
.bh-channel-sidebar-backdrop {
  position: absolute;
  inset: 0;
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 22%, transparent);
}
.bh-channel-sidebar-overlay {
  position: relative;
  height: 100%;
  background: var(--dsw-alias-bg-base);
  box-shadow: -8px 0 24px color-mix(in srgb, var(--dsw-alias-label-primary) 12%, transparent);
}
html[data-botharness-motion='reduce'] .bh-channel-sidebar-entry-chevron {
  transition: none;
}
.bh-workspace-grants {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}
.bh-workspace-folder-table {
  overflow: hidden;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
}
.bh-workspace-folder-row + .bh-workspace-folder-row {
  border-top: 1px solid var(--dsw-alias-border-l2);
}
.bh-workspace-folder-main {
  display: flex;
  align-items: stretch;
  min-width: 0;
}
.bh-workspace-folder-toggle {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 9px 10px;
  border: 0;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  text-align: left;
  cursor: pointer;
}
.bh-workspace-folder-toggle:hover,
.bh-workspace-folder-remove:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.bh-workspace-folder-chevron {
  flex: none;
  color: var(--dsw-alias-label-secondary);
  transform: rotate(-90deg);
}
.bh-workspace-folder-chevron.bh-expanded {
  transform: rotate(0);
}
.bh-workspace-folder-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bh-workspace-folder-remove {
  display: grid;
  flex: none;
  width: 34px;
  place-items: center;
  border: 0;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
}
.bh-workspace-folder-remove:hover {
  color: var(--dsw-alias-label-primary);
}
.bh-workspace-folder-toggle:focus-visible,
.bh-workspace-folder-remove:focus-visible,
.bh-folder-browser button:focus-visible {
  outline: 2px solid var(--dsw-alias-label-primary);
  outline-offset: -2px;
}
.bh-workspace-folder-detail {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  padding: 0 10px 10px 32px;
}
.bh-workspace-folder-path {
  max-width: 100%;
  overflow-wrap: anywhere;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
}
.bh-workspace-folder-secondary {
  min-width: 0;
}
.bh-workspace-folder-secondary > summary {
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
}
.bh-workspace-folder-secondary .bh-workspace-folder-table,
.bh-workspace-folder-manual {
  margin-top: 8px;
}
.bh-workspace-folder-manual {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}
.bh-workspace-folder-manual input {
  width: 100%;
}
.bh-folder-browser {
  width: min(580px, calc(100vw - 32px));
}
.bh-folder-browser-crumbs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 10px;
}
.bh-folder-browser-crumb {
  border: 0;
  border-radius: 6px;
  padding: 4px 6px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
}
.bh-folder-browser-crumb[aria-current='location'] {
  background: var(--dsw-alias-interactive-bg-active);
  color: var(--dsw-alias-label-primary);
}
.bh-folder-browser-list {
  min-height: 180px;
  max-height: min(360px, 50vh);
  overflow-y: auto;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
}
.bh-folder-browser-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  border: 0;
  padding: 8px 10px;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  text-align: left;
  cursor: pointer;
}
.bh-folder-browser-item:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.bh-folder-browser-hidden {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  color: var(--dsw-alias-label-secondary);
}
.bh-memory-entry {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}
.bh-memory-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
}
.bh-memory-toolbar button,
.bh-memory-editor button {
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  padding: 4px 8px;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  cursor: pointer;
}
.bh-memory-toolbar button:hover,
.bh-memory-editor button:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
}
.bh-memory-editor button:disabled {
  opacity: 0.5;
  cursor: default;
}
.bh-memory-files,
.bh-memory-history {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.bh-memory-row {
  width: 100%;
  border: 0;
  border-radius: 8px;
  padding: 6px 8px;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
  text-align: left;
  overflow-wrap: anywhere;
  cursor: pointer;
}
.bh-memory-row:hover {
  background: var(--bh-hover);
}
.bh-memory-row-selected {
  background: var(--bh-selected);
}
.bh-memory-editor {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.bh-memory-editor label,
.bh-memory-history strong {
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
}
.bh-memory-editor textarea {
  width: 100%;
  min-height: 140px;
  resize: vertical;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  padding: 8px;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font-family: var(--dsw-font-family-mono, monospace);
  font-size: 12px;
}
.bh-memory-diff {
  max-height: 240px;
  margin: 0;
  overflow: auto;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  padding: 8px;
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
}

.bh-assignment-row {
  display: block;
  width: 100%;
  border: 0;
  border-radius: 8px;
  padding: 8px;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.bh-assignment-row:hover {
  background: var(--bh-hover);
}
.bh-assignment-row-selected {
  background: var(--bh-selected);
}
.bh-assignment-title {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bh-assignment-meta {
  display: flex;
  gap: 8px;
  margin-top: 2px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
}
.bh-assignment-summary {
  margin-top: 4px;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 18px;
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.bh-assignment-detail {
  margin-top: 12px;
  border-top: 1px solid var(--dsw-alias-border-l2);
  padding: 12px 8px 4px;
}
.bh-assignment-detail-label {
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
}
.bh-assignment-detail-purpose {
  margin-top: 4px;
  color: var(--dsw-alias-label-primary);
  font-weight: 600;
}
.bh-assignment-detail dl {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 12px 0 0;
}
.bh-assignment-detail dl > div {
  min-width: 0;
}
.bh-assignment-detail dt {
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
}
.bh-assignment-detail dd {
  margin: 2px 0 0;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  overflow-wrap: anywhere;
}
.bh-assignment-id {
  font-family: var(--dsw-font-family-mono, monospace);
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
/* The Bot mark: one box sized by the caller, artwork resolved per palette. */
.bh-bot-icon {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: var(--bh-bot-icon-size, 16px);
  height: var(--bh-bot-icon-size, 16px);
}

.bh-bot-icon > svg,
.bh-bot-icon > img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

/* Settings nav cell tagged by bot-icon-nav: hide the shell glyph, show ours. */
button.bh-bot-nav > svg {
  display: none;
}

.bh-bot-nav-icon {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
}

.bh-bot-nav-icon > svg,
.bh-bot-nav-icon > img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

/* Bot icon chooser: what you see is what you pick — one card per mark. */
/* Manual path fallback inside a settings row (the picker may be absent). */
.bh-settings-input {
  width: 100%;
  min-width: 0;
  padding: 5px 8px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 12px;
}

.bh-settings-input:focus {
  outline: none;
  border-color: var(--bh-accent);
}

.bh-icon-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(88px, 1fr));
  gap: 8px;
  margin: 8px 0 4px;
}

.bh-icon-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 12px 8px 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 12px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  transition:
    border-color 120ms var(--ds-ease-in-out),
    background 120ms var(--ds-ease-in-out),
    color 120ms var(--ds-ease-in-out);
}

.bh-icon-card:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}

.bh-icon-card[data-selected='true'] {
  border-color: var(--bh-accent);
  background: var(--dsw-alias-interactive-bg-active);
  color: var(--dsw-alias-label-primary);
}

.bh-icon-card-art {
  pointer-events: none;
}

.bh-icon-card-label {
  text-align: center;
  line-height: 1.3;
}

.bh-settings-section-head {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 24px 0 8px;
}
.bh-settings-section-title {
  font-size: 15px;
  font-weight: 600;
  line-height: 22px;
  color: var(--dsw-alias-label-primary);
}
.bh-settings-section-desc {
  font-size: 12px;
  font-weight: 400;
  line-height: 18px;
  color: var(--dsw-alias-label-tertiary);
}
.bh-settings-rows {
  display: flex;
  flex-direction: column;
}
.bh-settings-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 0;
  border-bottom: 0.5px solid var(--dsw-alias-border-l2);
}
.bh-settings-row-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-right: 48px;
}
.bh-settings-row-title {
  font-size: 14px;
  font-weight: 400;
  line-height: 22px;
  color: var(--dsw-alias-label-primary);
}
.bh-settings-row-desc {
  font-size: 12px;
  font-weight: 400;
  line-height: 18px;
  color: var(--dsw-alias-label-tertiary);
}
.bh-settings-selector {
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
.bh-settings-selector:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.bh-settings-chevron {
  flex: none;
}
.bh-motion-preview {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  width: fit-content;
  min-height: 24px;
  margin-top: 4px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 12px;
  padding: 2px 8px;
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
}
.bh-motion-preview-sample {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  width: 22px;
  height: 12px;
}
.bh-motion-preview-sample i {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--dsw-alias-state-business-primary);
  opacity: 0.45;
}
html[data-botharness-motion='full'] .bh-motion-preview-sample i {
  animation: bh-motion-preview-dot 1100ms var(--ds-ease-in-out) infinite;
}
html[data-botharness-motion='full'] .bh-motion-preview-sample i:nth-child(2) {
  animation-delay: 130ms;
}
html[data-botharness-motion='full'] .bh-motion-preview-sample i:nth-child(3) {
  animation-delay: 260ms;
}
@keyframes bh-motion-preview-dot {
  0%,
  70%,
  100% {
    opacity: 0.4;
    transform: translateY(0);
  }
  35% {
    opacity: 1;
    transform: translateY(-2px);
  }
}

@media (max-width: 720px) {
  .bh-composer-shell {
    margin-right: 8px;
    margin-left: 8px;
  }
  .bh-settings-row {
    align-items: flex-start;
    flex-wrap: wrap;
  }
  .bh-settings-row-text {
    flex-basis: 100%;
    padding-right: 0;
  }
}
/* Human approval in a Channel message uses the same Host folder browser as sidebar access. */
.bh-grant-request-card { display: grid; gap: 12px; min-width: min(340px, 100%); }
.bh-grant-request-title { font-weight: 600; }
.bh-grant-request-reason { white-space: pre-wrap; overflow-wrap: anywhere; }
.bh-grant-request-card > button { justify-self: start; }
.bh-tool-approval-card { display: grid; gap: 10px; min-width: min(340px, 100%); }
.bh-tool-approval-input {
  margin: 0;
  padding: 10px;
  max-height: 260px;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: 8px;
  background: var(--dsw-alias-button-elevated-fill);
  color: var(--dsw-alias-label-primary);
}
.bh-tool-approval-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.bh-tool-approval-confirm, .bh-access-warning { display: grid; gap: 8px; padding: 10px; border: 0.5px solid var(--dsw-alias-border-l3); border-radius: 8px; }
.bh-assignment-access-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
`;
