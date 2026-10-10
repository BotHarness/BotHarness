# Actual sound and live requests integration

Source `50b44535a8180a138268c4f52a7fb5581f61de13`, incorporating main
`d55d82fe`; formal `@botharness/pixel-avatar@0.8.0`. Chinese, 1559 × 865,
one isolated DSH Profile. These media qualify the sound branch with the
already-merged request cards, rather than the new mouth artwork.

Two real native `ask_user_question` requests contain three questions for A
and one for B. Native inputs select one choice, two checkboxes and a custom
answer. Switching light/dark preserves both drafts. A answers through its
Companion while an unrelated Channel remains selected; B's draft survives.
B then answers through the canonical Chat card, with unique input IDs
across the simultaneously rendered surfaces. Both answers commit exactly
once, continue their original Bot, and reconcile the Companion in the same
document. A late duplicate is refused. See `qualification.json`.

The screenshots show consecutive actual states, not a before/after code
comparison. The three-question card scrolls within its bounded region;
the dark draft image is scrolled to the custom answer. Question-mark avatars
are actual pending Bot appearances, not placeholders inserted for the capture.

`two-bot-and-chat.webm` is a continuous 56.833-second silent official Chrome
DevTools MCP screencast, container-remuxed only. `actual-output.mp3` is the
real Web Audio output, observed through a QA-only recording destination
without microphone access or product gain changes. Its separate clock
starts before the screencast; the two files are not synchronized.

Observed source starts increase from 4 after native grab/landing to 77 after
the original Bots reply. This establishes renewed text-paced sound after
request resolution, not a calibrated fast-gesture or GPU measurement.
There are no browser console errors. The original sound preference is
restored, all request decisions are canonical, and the owned browser is
closed. The failed initial hidden-toolbar attempt is retained privately and
excluded from these results.
