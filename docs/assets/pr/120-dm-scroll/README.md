# DM reading-position regression (#120)

Real isolated DSH 0.2.0-rc.1, using the public Channel commands, browser composer and DeepSeek Flash/low. The script sends a long Human DM, observes a real activity footer, scrolls to earlier content, sends a second instruction through the composer and waits for an actual model reply after native Memory write/read.

- Baseline main `f9211ba5`: sending while reading history moved scrollTop from 0 to 158 (failed).
- Fixed dark and light: scrollTop stays at 0. A following latest message has bottom gap 0 and stays fully visible with a 40px activity region. Active shared Avatars have no outer pseudo-element frame.
- The small 1440 × 540 viewport deliberately produces overflow. In `history.png`, the last message is below the viewport because the Human is reading history; the new-message action remains available. `footer.png` shows following latest with the activity region expanded.
- Screenshots are actual browser captures. The screenshot helper masks only a potential machine-local Tool-approval directory; this fixture uses no Shell or approval card. Token URLs, private cookies and Host logs are excluded. Proof JSON contains only public fixture names, route identity and geometry.

Run from a built worktree linked to an isolated Host, with `BH_E2E_ORIGIN`, `BH_E2E_HOME`, `BH_E2E_EVIDENCE` and optionally `BH_E2E_THEME=light|dark`, then `node scripts/e2e-dm-scroll.mjs`. It creates an isolated PersonaBot with an explicit model preset, and exits nonzero on the original history jump, footer clipping, redundant Avatar frame or missing real reply.

The shared activity transport and row/pinned/rail state E2E remain in [PR #659](https://github.com/BotHarness/BotHarness/pull/659). Historical PR #230 is audited rather than copied: polling and React effect hooks are superseded; outer frames and duplicate row indicators are already absent; only the demonstrated history-send regression needs a production change. No replacement state authority or viewport observer is added.
