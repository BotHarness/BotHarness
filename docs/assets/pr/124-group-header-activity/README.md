# Group header activity — #124

Base: f397073df95c72d21d913452ff09469b446ed9e3 (merged #782).
Runtime: real isolated DSH 0.2.0-rc.1, four Group members, two real
DeepSeek Flash / low Orchestrator Sessions and two idle members.

## Matched visual evidence

The Human QA card/chips pairs compare accepted head 21edd96d with the
chips revision, using the same isolated data after all model requests completed, the same Chinese locale, and matched viewports:
1500 × 1000 light and 420 × 860 dark. The header idle pair uses the same
light viewport and data. A separate working keyboard-focus screenshot
shows the new native Tooltip and working Profile chips show both live
Bots alongside an idle member and +1. No credentials or private Host paths appear.

The Group member order deliberately places two idle Bots before Orbit and Nova;
the actual verifier requires three visible header avatars, both active Bots
visible despite their late membership positions, and an accurate +1 count.
A focused regression also covers five members, stable active ordering, no input
mutation, and a caller requesting more than the hard limit of three.

## Reproduce

1. Boot this worktree with scripts/dev-instance.mjs into a fresh isolated
   home. Set BH_E2E_ORIGIN, BH_E2E_HOME and BH_E2E_EVIDENCE locally.
2. Run node scripts/e2e-group-header-activity.mjs prepare to create four
   members via the authenticated public Host commands.
3. Run node scripts/e2e-group-header-activity.mjs check. It sends two real
   model requests and approves only the exact bounded 45-second native
   Shell timers requested for this fixture.
4. Tab to a visible Group header avatar: native Tooltip shows its safe
   Host aggregate. Enter opens the existing Group Profile popover; up to three active-first chips and the remaining +N count appear. Escape dismisses it. The Group name still opens
   Profile and retains its View details action.
5. The verifier checks both completion messages and idle recovery. It
   disconnects the browser, restores connectivity, and requires a new SSE
   snapshot whose generation/revision and Bot presentation match Host.

Native DSH Tooltip intentionally ignores pointer-modality focus; the
verifier therefore uses actual Tab and Shift+Tab keyboard events.

runtime-proof.json records the actual working, reconnect and settled
snapshots, zero client exceptions, no narrow-screen horizontal overflow,
and successful header verification. Private launch URLs and cookies stay
in ignored task-local files.

This slice reuses Host aggregates, accepted GroupActivityRows, and the
existing authenticated Gateway/Profile seam. It does not complete #124;
remaining Assignment/motion/member variants await subsequent slices.

## Human QA compactness correction

The existing native DSH Pill and Tooltip compose a wrapping flex preview,
not full-width activity cards. A shared personaBotActivityPreview bounds
both facepile and popover to three, prioritizing thinking/working and
preserving equal-priority membership order. Each chip shows avatar, an
ellipsized name and short Host state; native hover/keyboard Tooltip exposes
the existing safe aggregate. The chip Tooltip check rejects raw timer
arguments. The composer expanded rows retain their accepted presentation.

The card/chips screenshots match 1500 × 1000 light and 420 × 860 dark
viewports, Chinese locale, the same Group, member order and settled state.
Baseline source was the accepted/reviewed 21edd96d, then the saved chips
source and bundle were restored before publishing.
