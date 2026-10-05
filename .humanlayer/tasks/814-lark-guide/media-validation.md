# Lark guide media validation

Issue #814; task `codex/local/01a107e1-4682-7930-98db-7cd7d1d7359b`.

Configured screenshots are actual read-only captures of the published QA app and the #823 qualified product (`0.0.0-test.823.6`, Provider `4.32.0-botharness.2`). The source Modal shows the designated real topic message retained from #823. This refresh does not claim new app creation, permission changes, deployment or a fresh message exchange.

The 104-second MP4 is an edited sequence of actual screenshots, not continuous recording. H264/yuv420p, fast-start, 831,761 bytes; English and Chinese WebVTT tracks. All 13 chapter midpoints match their source frames (video-chapter-proof.json). Images retain dimensions and use compressed WebP (media-manifest.json). App Secrets remained masked or empty.

- Product build passed; documentation build passed (320 pages).
- Repository lint, formatting, typecheck and bilingual ledgers passed.
- Documentation typecheck: 0 errors / 0 warnings; 115 existing hints.
- Focused docs tests: 29 passed.
- Restricted full suite: 2448 passed, 9 skipped, 4 failed exclusively due EPERM (loopback bind / real home-directory write).
- Reran the 3 affected browser files with loopback permitted and homedir mocked into a task-local temporary fixture: 21 passed. Assertions and repository test files were unchanged. This is a separate retry, not a claim that the initial run passed.
- Nimbus lint: 56 existing link errors elsewhere; neither Lark guide has an error.
- Both locales load all 16 guide images. Default captions follow locale. Desktop 1280×720 and mobile 390×844 have no document overflow. Corrected video plays/pauses in Chrome at readyState 4.

The installation example pins the #823-qualified product and immutable Provider input. Newer main changed the development Provider input; the guide does not mix it into the already qualified product. Public npm installation is not claimed. Initial dependency-race and sandbox-refusal evidence is retained locally; no checks were weakened.
