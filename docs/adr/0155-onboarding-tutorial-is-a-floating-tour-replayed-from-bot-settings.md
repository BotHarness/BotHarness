---
Status: Accepted
Date: 2026-10-09
Issues: [#1295](https://github.com/BotHarness/BotHarness/issues/1295)
---

# Onboarding tutorial is a floating tour, auto-presented once and replayed from Bot Settings

The tutorial surface used to be a permanent strip at the top of the Bot-mode content area: `OnboardingSurface` rendered the preparing state, goal, Start/Skip/Continue/Restart controls and the unsent-question entry as the first child of the Bot panel, above every view. It never went away — after completion it kept a full-width row showing "First conversation completed" and Restart. It was the only replay entry, and it spent a whole header row of vertical space in every Bot-mode visit, including for Profiles that finished onboarding months earlier. We decided that **the tutorial is a driver.js floating tour anchored to the DM welcome card, started automatically once per Profile, with Continue/Restart moved into Bot Settings → General; no persistent strip remains.**

## Decision

- **No persistent surface.** The Bot panel keeps only a headless lifecycle component (`OnboardingOverlay`): preparation, refresh and the 5-second reconciliation poll are unchanged, and it still renders the model and send-review modals. It no longer renders the strip, so a completed or skipped Profile sees no onboarding chrome at all.
- **The welcome card is the anchor and the entry.** The DM system welcome (`data-onboarding-welcome`) mounts the driver.js highlight on itself while the tutorial is `active`, exactly like the previous tour, and closing or Escape still pauses.
- **First entry auto-starts.** When the welcome card renders for the receipt's own Channel and the shared receipt is `not-started` and incomplete, the Client performs the existing explicit `start` transition once per mount; the host persists `active` as before. The popover carries a footer "Skip tutorial" action that performs the existing `skip` transition, so dismissal stays explicit and recoverable.
- **Replay lives in Bot Settings.** Bot Settings → General gains one "Onboarding tutorial" row: it shows Start while the receipt is unknown or not started, Continue while active or paused, and Restart when skipped or completed. Activating it closes Bot Settings, opens the receipt's DM through the existing navigation, and performs the chosen tutorial transition. Restart keeps identity, credentials, conversations, completion and companion preferences exactly as ADR-0147 requires.
- **Edge entries move into existing surfaces.** A failed preparation or refresh shows a floating notice with the existing retry action instead of a strip row; the retained unsent question is offered inside the welcome card; choosing among existing PersonaBots stays in the roster. "Preparing" no longer renders its own chrome.
- **Driver.js stays temporary presentation.** The tour is destroyed during model configuration, after completion, when the card unmounts, and on pause/skip; it remains the only overlay the tutorial adds.

## Considered Options

- **Keep the strip but hide it after completion:** rejected. It still spends a header row for every unfinished or paused Profile, and hiding the only replay control makes completion a dead end.
- **A floating pill for resume after pause:** rejected. ADR-0147 keeps paused and skipped states quiet on re-entry; replay belongs in settings, not a second piece of ambient chrome.
- **Auto-present without persisting `active`:** rejected. Closing the tour would not pause the shared receipt, so every later entry would pop the tour again.
- **Keep the strip as the replay entry and remove only the completed state:** rejected. It keeps the vertical cost and splits the replay entry from every other BotHarness setting.

## Consequences

- ADR-0147's surface sentence "Explicit Start/Continue/Restart controls it" is amended: Start is implicit on the first welcome-card entry and still persisted; closing pauses; explicit Continue/Restart (and Start for an unknown receipt) live in Bot Settings. The receipt schema, completion evidence and tutorial states are unchanged.
- The auto-start runs only from the receipt's Channel welcome card, so a Profile that never opens that DM stays `not-started`; the settings row can start it explicitly.
- Other Clients observing an `active` tutorial still do not reopen highlights by themselves; they can Continue or Restart from Bot Settings.
- `OnboardingSurface` disappears from the Client; the strip's "preparing", "goal" and "completed" strings are removed from the locale.
