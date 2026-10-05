# BotHarness UI captures for the promo

- Source: BotHarness `origin/main` @ `af7b1d57ac39944348ccf0e9fb30e6d4889125b6`, exported with `git archive` (not the working tree), `pnpm install && pnpm build`, run in DeepSeek Harness `0.2.0-rc.1` via `scripts/dev-instance.mjs` (isolated `DSH_HOME` per language, Web Profile `web-dev`).
- Browser: headless Chrome for Testing 151 driven by puppeteer-core 25.11, light theme. UI language came from DSH's locale service (browser language: `--lang=zh-CN` / `--lang=en-US`, no stored preference), so all BotHarness and DSH copy is the shipped zh / en dictionary.
- Content: fictional "Observatory exhibit" project. PersonaBots Mira · Research / Theo · Design / Nova · Build (zh: Mira · 研究 / Theo · 设计 / Nova · 构建) with role badges, Human "Alex". Avatars are Avatar Family pixel recipes set through the real `botharness/botAppearanceSet` API (the call the avatar editor makes): Mira = AVATAR_PRESETS[1], Theo = AVATAR_PRESETS[0], Nova = AVATAR_PRESETS[9]. Mira's memory repo was seeded with ordinary git commits (side branch `exhibit-notes` merged with `--no-ff`) plus an uncommitted `projects/next-review.md`; `notes/review-demo.md` was then written by Mira herself (real DeepSeek turn) during the memory-activity clip. All bot messages are real DeepSeek replies; nothing was edited in any image.
- Rectangles are `x,y,w,h` in image pixels (top-left origin), measured from the live DOM (`getBoundingClientRect` x devicePixelRatio) at capture time.

| file | pixels | CSS viewport | DPR |
|---|---|---|---|
| `{zh,en}/memory-evolution.jpg` | 1280x800 | 1280x800 | 1 |
| `{zh,en}/memory-files.jpg` | 1440x960 | 1440x960 | 1 |
| `{zh,en}/group.jpg` | 2940x1846 | 1470x923 | 2 |
| `{zh,en}/clips/group-activity/NNNN.jpg` | 2940x1846 | 1470x923 | 2 |
| `{zh,en}/clips/memory-activity/NNNN.jpg` | 1280x800 | 1280x800 | 1 |


## zh

### zh/memory-evolution.jpg (1280x800)

- Diff lines block (whole hunk table, lines 9-15): 293,134,654,220  (file card incl. header: 292,93,656,262)
- Removed line (red): 293,234,654,24; added lines (green, 2 rows): 293,258,654,48
- Branch graph (all commit rows, HEAD at top): 973,275,295,322; merged-branch label `exhibit-notes`: 1185,371,79,16
- "New memory" / uncommitted block (2 new files): 973,122,295,111; branch row with "Uncommitted changes" + Switch: 973,235,295,32
- Switch-branch control ("从该记忆节点新建并切换分支"): 736,14,212,28 (fully visible)
- Recovery checkpoints row: 973,614,295,18

### zh/memory-files.jpg (1440x960)

- File tree (all rows): 1133,86,295,364
- File tree rows: `notes` 1133,86,267,30; `notes/review-demo.md` 1151,116,249,30; `notes/visitor-feedback.md` 1151,145,249,30; `people` 1133,177,267,30; `people/team.md` 1151,206,249,30; `people/visitors.md` 1151,236,249,30; `preferences` 1133,267,267,30; `projects` 1133,299,267,30; `projects/next-review.md` 1151,328,249,30; `projects/observatory.md` 1151,358,249,30; `.gitattributes` 1133,389,267,30; `PERSONA.md` 1133,421,267,30
- Open file in reader (`projects/observatory.md` content): 280,62,840,369; reader title bar: 280,0,840,52

### zh/group.jpg (2940x1846)

- Human @mention message (Alex, mentions all three): 1196,286,1068,161
- Bot reply Nova · 构建: bubble 668,516,1068,132; with avatar + name: 596,475,1668,173
- Bot reply Mira · 研究: bubble 668,717,1068,132; with avatar + name: 596,676,1668,173
- Bot reply Theo · 设计: bubble 668,918,1068,132; with avatar + name: 596,877,1668,173
- Members panel (Members/成员 header, Human Alex, three PersonaBots): 2302,96,638,476
- Left sidebar rows (top to bottom as shown): 天文馆 · 工作室 24,508,512,99; Nova · 构建 24,611,512,100; Theo · 设计 24,715,512,99; Mira · 研究 24,818,512,99

### zh/clips/group-activity (2940x1846, 30 fps)

- 205 frames 6.83s marks: send@0.50s/f16 repliers-0@2.05s/f63 repliers-2@3.59s/f109 repliers-3@5.31s/f160 all-replied-idle@5.32s/f161 action-done@5.32s/f161
- Content: a follow-up Human message @mentioning all three (typed in the real composer), then the three bots think and reply in their own identities, then return to idle. The sidebar row avatars, Group header facepile, members-panel avatars and message avatars show the pixel morph (thinking glyph -> face). Marks are host-poll times (about 0.7-1.5 s resolution); `repliers-N` = N replies seen.
- Regions at the final frame:
  - Follow-up Human @mention message: 1196,977,1068,122
  - Reply Theo · 设计: bubble 668,1168,1068,132, avatar 596,1244,56,56
  - Reply Nova · 构建: bubble 668,1369,1068,132, avatar 596,1445,56,56
  - Reply Mira · 研究: bubble 668,1570,1068,132, avatar 596,1646,56,56
  - Sidebar rows during the whole clip (order as recorded): 天文馆 · 工作室 row 24,508,512,100; Nova · 构建 row 24,612,512,99 avatar 40,628,68,68; Theo · 设计 row 24,715,512,99 avatar 40,731,68,68; Mira · 研究 row 24,818,512,99 avatar 40,834,68,68
  - Members panel (avatars morph here too): 2302,96,638,476; Group header facepile (3 avatars, inside the title pill): about 1234,28,104,56; composer: 678,1738,1484,68
  - While bots work, an activity strip ("... 正在思考 / Thinking") appears just above the composer at about 596,1656,1668,56.

### zh/clips/memory-activity (1280x800, 30 fps)

- 231 frames 7.70s marks: send@0.40s/f13 state:Mira · 研究 · 正在思考@1.13s/f35 state:Mira · 研究 · 空闲@6.10s/f184 idle@6.10s/f184 action-done@6.10s/f184
- Content: Mira's DM with Memory evolution open. Alex asks Mira to save the review demo split as `notes/review-demo.md`; Mira thinks (pixel morph on her sidebar row avatar), writes the file, and the "New memory" list goes from 1 to 2 entries live (zh ~f129-132), then she replies and returns to idle.
- Regions at the final frame:
  - New memory block (2 entries at end): 973,122,295,111; branch graph: 973,275,295,322
  - Alex's request message: 408,488,534,57; Mira's reply: bubble 334,580,556,66, avatar 298,618,28,28
  - Sidebar rows (order as recorded): Mira · 研究 row 12,254,256,50 avatar 20,262,34,34; 天文馆 · 工作室 row 12,306,256,50; Nova · 构建 row 12,358,256,50 avatar 20,365,34,34; Theo · 设计 row 12,409,256,50 avatar 20,417,34,34
  - Composer: 339,746,552,34

## en

### en/memory-evolution.jpg (1280x800)

- Diff lines block (whole hunk table, lines 9-15): 293,134,654,220  (file card incl. header: 292,93,656,262)
- Removed line (red): 293,234,654,24; added lines (green, 2 rows): 293,258,654,48
- Branch graph (all commit rows, HEAD at top): 973,275,295,322; merged-branch label `exhibit-notes`: 1185,371,79,16
- "New memory" / uncommitted block (2 new files): 973,122,295,111; branch row with "Uncommitted changes" + Switch: 973,235,295,32
- Switch-branch control ("Create and switch branch from this memory"): 640,14,308,28 (its left part sits under the floating Mira header pill; visible part is about x 735-948)
- Recovery checkpoints row: 973,614,295,18

### en/memory-files.jpg (1440x960)

- File tree (all rows): 1133,86,295,364
- File tree rows: `notes` 1133,86,267,30; `notes/review-demo.md` 1151,116,249,30; `notes/visitor-feedback.md` 1151,145,249,30; `people` 1133,177,267,30; `people/team.md` 1151,206,249,30; `people/visitors.md` 1151,236,249,30; `preferences` 1133,267,267,30; `projects` 1133,299,267,30; `projects/next-review.md` 1151,328,249,30; `projects/observatory.md` 1151,358,249,30; `.gitattributes` 1133,389,267,30; `PERSONA.md` 1133,421,267,30
- Open file in reader (`projects/observatory.md` content): 280,62,840,369; reader title bar: 280,0,840,52

### en/group.jpg (2940x1846)

- Human @mention message (Alex, mentions all three): 1196,286,1068,161
- Bot reply Theo · Design: bubble 668,516,1068,232; with avatar + name: 596,475,1668,273
- Bot reply Nova · Build: bubble 668,817,1068,180; with avatar + name: 596,776,1668,221
- Bot reply Mira · Research: bubble 668,1066,1068,228; with avatar + name: 596,1025,1668,269
- Members panel (Members/成员 header, Human Alex, three PersonaBots): 2302,96,638,476
- Left sidebar rows (top to bottom as shown): Observatory · Studio 24,508,512,100; Theo · Design 24,612,512,99; Nova · Build 24,715,512,99; Mira · Research 24,818,512,99

### en/clips/group-activity (2940x1846, 30 fps)

- 228 frames 7.60s marks: send@0.30s/f10 repliers-0@1.85s/f57 repliers-2@3.38s/f102 repliers-3@5.36s/f162 all-replied-idle@6.88s/f207 action-done@6.88s/f207
- Content: a follow-up Human message @mentioning all three (typed in the real composer), then the three bots think and reply in their own identities, then return to idle. The sidebar row avatars, Group header facepile, members-panel avatars and message avatars show the pixel morph (thinking glyph -> face). Marks are host-poll times (about 0.7-1.5 s resolution); `repliers-N` = N replies seen.
- Regions at the final frame:
  - Follow-up Human @mention message: 1196,790,1068,161
  - Reply Theo · Design: bubble 668,1020,1068,232, avatar 596,1196,56,56
  - Reply Nova · Build: bubble 668,1321,1068,180, avatar 596,1445,56,56
  - Reply Mira · Research: bubble 668,1570,1068,132, avatar 596,1646,56,56
  - Sidebar rows during the whole clip (order as recorded): Observatory · Studio row 24,508,512,100; Theo · Design row 24,612,512,99 avatar 40,628,68,68; Nova · Build row 24,715,512,99 avatar 40,731,68,68; Mira · Research row 24,818,512,99 avatar 40,834,68,68
  - Members panel (avatars morph here too): 2302,96,638,476; Group header facepile (3 avatars, inside the title pill): about 1234,28,104,56; composer: 678,1738,1484,68
  - While bots work, an activity strip ("... 正在思考 / Thinking") appears just above the composer at about 596,1656,1668,56.

### en/clips/memory-activity (1280x800, 30 fps)

- 241 frames 8.03s marks: send@0.20s/f7 state:Mira · Research · Thinking@1.54s/f47 state:Mira · Research · Idle@7.41s/f223 idle@7.42s/f224 action-done@7.42s/f224
- Content: Mira's DM with Memory evolution open. Alex asks Mira to save the review demo split as `notes/review-demo.md`; Mira thinks (pixel morph on her sidebar row avatar), writes the file, and the "New memory" list goes from 1 to 2 entries live (en ~f151-160), then she replies and returns to idle.
- Regions at the final frame:
  - New memory block (2 entries at end): 973,122,295,111; branch graph: 973,275,295,322
  - Alex's request message: 408,359,534,77; Mira's reply: bubble 334,470,556,66, avatar 298,508,28,28
  - Sidebar rows (order as recorded): Mira · Research row 12,254,256,50 avatar 20,262,34,34; Observatory · Studio row 12,306,256,50; Theo · Design row 12,358,256,50 avatar 20,365,34,34; Nova · Build row 12,409,256,50 avatar 20,417,34,34
  - Composer: 339,746,552,34

## Notes

- Model replies came quickly and the bots answered from memory already in context, so the clips show thinking -> reply -> idle; no visible read/search/edit tool phase was captured in the Group clip. In the memory clip Mira's file write happens inside the thinking phase (her avatar state polled as Thinking -> Idle).
- Clip frames come from Chrome's screencast (frames only on repaint) resampled to a fixed 30 fps by timestamp; a frame repeats when nothing repainted. JPEG quality 85.
- group.jpg has no browser chrome (headless viewport only), unlike the old `docs/assets/readme/group-collaboration.jpg`.
- The Bot mode row shows an Activity Center unread badge (3 zh / 4 en) from the real warm-up DMs and tool approvals.
