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
  padding: 0 4px;
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

.bh-section-head {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 6px 4px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  cursor: pointer;
  font: inherit;
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  text-align: left;
}
.bh-section-head:hover {
  background: var(--bh-hover);
}
.bh-section-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bh-section-count {
  flex: 0 0 auto;
}

.bh-create-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0 4px 10px;
  padding: 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
}
.bh-create-title {
  font-weight: 600;
}
.bh-create-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.bh-note {
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  padding: 6px 4px;
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
`;
