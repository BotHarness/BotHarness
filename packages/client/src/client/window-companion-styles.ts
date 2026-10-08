export const WINDOW_COMPANION_CSS = `
.bh-companion-stage {
  /* @bh-companion-aliases:start — pixel geometry over native DSH surfaces. */
  --bh-companion-surface: var(--dsw-alias-bg-base);
  --bh-companion-text: var(--dsw-alias-label-primary);
  --bh-companion-muted: var(--dsw-alias-label-secondary);
  --bh-companion-border: var(--dsw-alias-border-l2);
  --bh-companion-hover: var(--dsw-alias-interactive-bg-hover);
  --bh-companion-attention: var(--dsw-alias-state-warn-primary);
  --bh-companion-font: var(--dsw-font-markdown-code-block-font-family);
  /* @bh-companion-aliases:end */
  position: absolute; inset: 0; pointer-events: none; overflow: hidden;
}
.bh-companion { position: absolute; width: 96px; height: 96px; pointer-events: auto; }
.bh-companion-character { border: 0; padding: 0; background: transparent; cursor: grab; touch-action: none; width: 96px; height: 96px; transform-origin: center 20%; transition: transform 140ms ease-out, transform-origin 140ms ease-out; }
.bh-companion[data-motion='fall'] .bh-companion-character,
.bh-companion[data-motion='land'] .bh-companion-character { transform-origin: center bottom; transition: transform 70ms ease-out, transform-origin 140ms ease-out; }
.bh-companion-character:active { cursor: grabbing; }
.bh-companion .bh-persona-avatar[data-surface='companion'],
.bh-companion .bh-persona-avatar[data-surface='companion']::before,
.bh-companion .bh-avatar-media { background: transparent; border: 0; border-radius: 0; box-shadow: none; overflow: visible; }
.bh-companion button:focus-visible { outline: 2px solid var(--bh-accent); outline-offset: 3px; }
.bh-companion-activity { position: absolute; bottom: 134px; width: 320px; max-width: calc(100vw - 16px); padding: 6px 9px; background: var(--bh-companion-surface); border: 1px solid var(--bh-companion-border); color: var(--bh-companion-muted); font: 12px/18px var(--bh-companion-font); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bh-companion[data-sync='stale'] .bh-companion-activity { border-style: dashed; }
.bh-companion-cards { position: absolute; bottom: 174px; width: 320px; max-width: calc(100vw - 16px); margin: 0; padding: 0; list-style: none; overflow: visible; transition: height 220ms ease; }
.bh-companion[data-reading='true'] .bh-companion-cards { overflow: auto; scrollbar-gutter: stable; }
.bh-companion-card { position: absolute; width: 100%; height: 104px; padding: 8px 10px; background: var(--bh-companion-surface); border: 2px solid var(--bh-companion-border); transform-origin: center top; color: var(--bh-companion-text); transition: top 220ms ease, transform 220ms ease; box-shadow: 3px 3px 0 var(--bh-companion-border); }
.bh-companion-card header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.bh-companion-card header button { font-size: 11px; color: var(--bh-companion-muted); background: transparent; border: 0; padding: 0; cursor: pointer; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.bh-companion-card p { margin: 6px 0 0; font: 12px/18px var(--bh-companion-font); white-space: pre-wrap; overflow-wrap: anywhere; max-height: 54px; overflow: auto; }
.bh-companion-toolbar { position: absolute; bottom: 96px; left: -10px; display: flex; align-items: center; gap: 4px; padding: 5px; background: var(--bh-companion-surface); border: 1px solid var(--bh-companion-border); opacity: 0; visibility: hidden; transition: opacity 150ms ease; }
.bh-companion-toolbar[data-open='true'] { opacity: 1; visibility: visible; }
.bh-companion-toolbar button { display: grid; place-items: center; min-width: 28px; height: 26px; border: 0; background: transparent; color: var(--bh-companion-text); cursor: pointer; }
.bh-companion-toolbar button:hover { background: var(--bh-companion-hover); }
.bh-companion-attention { position: absolute; z-index: 2; right: 4px; top: 4px; min-width: 20px; height: 20px; padding: 0 3px; border: 1px solid var(--bh-companion-border); background: var(--bh-companion-surface); color: var(--bh-companion-attention); cursor: pointer; }
html[data-botharness-motion='reduce'] .bh-companion * { transition: none; }
`;
