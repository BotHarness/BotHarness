export const CSS = `
.bh-root {
  --bh-bg: #ffffff;
  --bh-side: #f7f8fa;
  --bh-ink: #1c1f24;
  --bh-muted: #8a9099;
  --bh-line: #e8eaed;
  --bh-accent: #4f46e5;
  --bh-thinking: #3b82f6;
  --bh-working: #16a34a;
  --bh-waiting: #d97706;
  --bh-blocked: #dc2626;
  --bh-idle: #9ca3af;
  --bh-done: #94a3b8;
  font: 13px/1.5 -apple-system, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  color: var(--bh-ink);
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
  padding: 10px 10px 4px;
}
.bh-region-rail {
  padding: 0;
}

.bh-search-row {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-bottom: 10px;
}
.bh-search-box {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  background: #fff;
  border: 1px solid var(--bh-line);
  border-radius: 8px;
  padding: 6px 9px;
  color: var(--bh-muted);
  min-width: 0;
}
.bh-search-box input {
  border: 0;
  outline: none;
  background: transparent;
  color: var(--bh-ink);
  width: 100%;
  min-width: 0;
}
.bh-icon-btn {
  width: 32px;
  height: 32px;
  border: 1px solid var(--bh-line);
  border-radius: 8px;
  background: #fff;
  color: #4b5563;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
}
.bh-icon-btn:hover {
  background: #f3f4f6;
}

.bh-pinned-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 8px;
  margin-bottom: 12px;
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
  background: #eef0f3;
}
.bh-pinned.bh-selected {
  background: #e6e9ff;
}
.bh-pinned .bh-name {
  font-size: 12px;
  font-weight: 600;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bh-tag {
  font-size: 10px;
  color: #6b7280;
  background: #eceef1;
  border-radius: 5px;
  padding: 1px 5px;
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
  border-radius: 50%;
  border: 2px solid var(--bh-side);
  background: var(--bh-idle);
}
.bh-presence[data-state='working'] {
  background: var(--bh-working);
}
.bh-presence[data-state='waiting'] {
  background: var(--bh-waiting);
}
.bh-presence[data-state='blocked'] {
  background: var(--bh-blocked);
}
.bh-presence[data-state='thinking'] {
  background: var(--bh-thinking);
}

.bh-side-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 4px 4px;
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--bh-muted);
  user-select: none;
}
.bh-side-head .bh-count {
  font-size: 11px;
  background: #e9ebef;
  border-radius: 999px;
  padding: 0 7px;
  color: #4b5563;
  letter-spacing: 0;
  text-transform: none;
}
.bh-side-head .bh-count.bh-warn {
  background: #fef3c7;
  color: #b45309;
}
.bh-side-head .bh-count + .bh-count {
  margin-left: 4px;
}

.bh-contact {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 7px 6px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
  font: inherit;
}
.bh-contact:hover {
  background: #eef0f3;
}
.bh-contact.bh-selected {
  background: #e6e9ff;
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
  color: var(--bh-muted);
  font-size: 11.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bh-unread {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--bh-thinking);
  flex: 0 0 auto;
}

.bh-ws-row {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 6px 6px;
  border-radius: 7px;
  color: #374151;
}
.bh-ws-row .bh-name {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bh-ws-row .bh-meta {
  margin-left: auto;
  color: var(--bh-muted);
  font-size: 11px;
  flex: 0 0 auto;
}

.bh-note {
  color: var(--bh-muted);
  font-size: 12px;
  padding: 6px 4px;
}
.bh-error {
  margin: 4px 4px 10px;
  border: 1px solid #fecaca;
  background: #fef2f2;
  color: #b91c1c;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 12px;
}

.bh-mode-switch {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--bh-line);
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
  color: #374151;
}
.bh-mode-switch:hover {
  background: #f3f4f6;
}
.bh-mode-switch .bh-grow {
  flex: 1;
  text-align: left;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bh-mode-switch .bh-kbd {
  font-size: 10px;
  color: var(--bh-muted);
}

.bh-main {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  background: var(--bh-bg);
}
.bh-topbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 18px;
  border-bottom: 1px solid var(--bh-line);
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
  color: var(--bh-muted);
}
.bh-pill {
  margin-left: auto;
  font-size: 11px;
  color: var(--bh-muted);
  background: #f1f2f4;
  border-radius: 999px;
  padding: 3px 10px;
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
  color: var(--bh-muted);
  flex-direction: column;
  gap: 6px;
  text-align: center;
  padding: 24px;
}
.bh-placeholder .bh-big {
  font-size: 15px;
  color: #6b7280;
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
  border: 1px solid var(--bh-line);
  border-radius: 10px;
  padding: 12px 14px;
}
.bh-kpi .bh-num {
  font-size: 22px;
  font-weight: 700;
}
.bh-kpi .bh-lbl {
  color: var(--bh-muted);
  font-size: 12px;
}
.bh-kpi.bh-warn .bh-num {
  color: var(--bh-waiting);
}
.bh-panel {
  border: 1px solid var(--bh-line);
  border-radius: 10px;
  padding: 12px 14px;
}
.bh-panel h3 {
  margin: 0 0 8px;
  font-size: 13px;
}
.bh-panel .bh-sub {
  color: var(--bh-muted);
  font-size: 11px;
  font-weight: 400;
  margin-left: 6px;
}
.bh-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  color: var(--bh-muted);
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
  color: var(--bh-muted);
  font-size: 12px;
  padding: 6px 2px;
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
  border-right: 1px solid var(--bh-line);
}
.bh-chat-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
}
.bh-composer {
  border-top: 1px solid var(--bh-line);
  padding: 10px 14px;
  color: var(--bh-muted);
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
  border-bottom: 1px solid var(--bh-line);
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
.bh-chip {
  font-size: 11px;
  color: #374151;
  background: #f1f2f4;
  border: 0;
  border-radius: 999px;
  padding: 2px 9px;
  cursor: pointer;
  font: inherit;
}
.bh-chip.bh-on {
  background: #111827;
  color: #fff;
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
.bh-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--bh-idle);
  flex: 0 0 auto;
  display: inline-block;
}
.bh-dot[data-state='thinking'] {
  background: var(--bh-thinking);
}
.bh-dot[data-state='working'] {
  background: var(--bh-working);
}
.bh-dot[data-state='waiting'] {
  background: var(--bh-waiting);
}
.bh-dot[data-state='blocked'] {
  background: var(--bh-blocked);
}
.bh-dot[data-state='done'] {
  background: var(--bh-done);
}
`;
