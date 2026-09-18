export const CSS = `
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
  padding: 6px var(--dsh-sidebar-inline-padding) 4px 0;
}
.bh-region-rail {
  padding: 0;
}

.bh-search-row {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-bottom: 10px;
  padding: 0 0 0 4px;
}
.bh-search-input {
  flex: 1;
  min-width: 0;
}
.bh-icon-btn {
  width: 32px;
  height: 32px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-alias-button-elevated-fill);
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
}
.bh-icon-btn:hover {
  background: var(--bh-hover);
}

.bh-pinned-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 8px;
  margin-bottom: 12px;
  padding: 0 0 0 4px;
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
.bh-presence {
  position: absolute;
  right: 6px;
  bottom: 30px;
  width: 9px;
  height: 9px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--dsw-specific-sidebar-fill);
  border-radius: 50%;
}

.bh-side-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 0 4px 4px;
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--dsw-alias-label-tertiary);
  user-select: none;
}

.bh-list-area {
  /* 原生 listArea 约定：抵消 root 的右衬，让列表行贴到滚动条边缘（行自己带 8px）。 */
  margin-right: calc(-1 * var(--dsh-sidebar-inline-padding));
}
.bh-contact {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 7px 8px 7px 4px;
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
  background: var(--bh-selected);
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
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

.bh-ws-row {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 6px 8px 6px 4px;
  border-radius: 7px;
  color: var(--dsw-alias-label-secondary);
}
.bh-ws-row .bh-name {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bh-ws-row .bh-meta {
  margin-left: auto;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  flex: 0 0 auto;
}

.bh-note {
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  padding: 6px 0 6px 4px;
}
.bh-error {
  margin: 4px 0 10px 4px;
  border: 1px solid var(--dsw-alias-state-error-secondary);
  background: var(--dsw-alias-interactive-bg-hover-danger);
  color: var(--dsw-alias-state-error-primary);
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 12px;
}

.bh-mode-switch {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 8px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  color: inherit;
  font: inherit;
}
.bh-mode-switch:hover {
  background: var(--bh-hover);
}
.bh-mode-switch .bh-grow {
  flex: 1;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
.bh-topbar .bh-crumb {
  color: var(--dsw-alias-label-tertiary);
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

.bh-dash {
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.bh-dash h2 {
  margin: 0;
  font-size: 16px;
}
.bh-kpis {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}
.bh-kpi {
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  padding: 12px 14px;
}
.bh-kpi .bh-num {
  font-size: 22px;
  font-weight: 700;
}
.bh-kpi .bh-lbl {
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
}
.bh-kpi.bh-warn .bh-num {
  color: var(--dsw-alias-state-warn-label);
}
.bh-panel {
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  padding: 12px 14px;
}
.bh-panel h3 {
  margin: 0 0 8px;
  font-size: 13px;
}
.bh-panel .bh-sub {
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  font-weight: 400;
  margin-left: 6px;
}
.bh-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  margin-top: 6px;
}
.bh-legend .bh-sw {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 2px;
  margin-right: 4px;
}
.bh-inbox-empty {
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  padding: 6px 2px;
}
.bh-dim {
  color: var(--dsw-alias-label-tertiary);
}

.bh-bot-view {
  display: flex;
  height: 100%;
  min-height: 0;
}
.bh-chat-pane {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--dsw-alias-border-l2);
}
.bh-chat-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
}
.bh-composer {
  border-top: 1px solid var(--dsw-alias-border-l2);
  padding: 10px 14px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
}
.bh-events-pane {
  width: 380px;
  flex: 0 0 380px;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.bh-events-head {
  padding: 12px 14px 8px;
  border-bottom: 1px solid var(--dsw-alias-border-l2);
}
.bh-events-head h3 {
  margin: 0 0 8px;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bh-filters {
  display: flex;
  gap: 6px;
}
.bh-events {
  flex: 1;
  overflow: auto;
  padding: 8px 14px 14px;
}
.bh-events .bh-placeholder {
  height: auto;
  padding: 24px 0;
}
`;
