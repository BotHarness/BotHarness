# #570 — trusted attachment forwarding and committed acknowledgement

Real DSH 0.2.0-rc.1 with `deepseek-official / deepseek-flash`, two isolated profiles, Chinese UI, dark theme, 1440 × 1200 viewport. Only synthetic QA data is published. Authentication, credentials and private Session contexts stay machine-local.

Baseline: merged #609 implementation (`a5c0fcf926e6a9e298118017c41ec92fb56fffa1`). Candidate source: `a6ddbd84`; initial integration: `c21db99151e0aedcf830c96489962ed36c37677c`; final #577 compatibility source: `7fd3fc5070670390a7a52cba0dede2d29f6923e1`. The final evidence commit adds only this report, screenshots and sanitized result records.

## Real end-to-end path

1. Upload a synthetic 480 × 300 PNG through the existing authenticated Human attachment endpoint and commit a Human DM containing it. This does not add a model upload Tool.
2. Ask the real Orchestrator to read that message, inspect the image with `channel_read_image`, copy all four trusted fields unchanged, and send one attachment-only message to its joined Group.
3. Inspect actual DSH Session `request/header`, `tool/call` and `tool/result` events. Both revisions saw the blue circle and orange square; a native image block reached the model. No Shell, Assignment or external send was used. The baseline additionally checked joined Channels twice.
4. Verify the durable Group message has an empty body and exactly the original reference. Download through the committed Channel/message/file identity and compare bytes with the uploaded PNG.
5. In the real Human UI, select the destination Group and click its committed image. The new browser tab displays the actual 480 × 300 image. Screenshots contain native UI pixels, without a replacement DOM or a mocked backend.
6. Restart the final integrated Host, read the same original Group message and inspect its image again. The Group still contains exactly one Bot message.

Baseline forwarding already worked. This change clarifies the model contract and makes the destination part of the authoritative acknowledgement; it does not claim to introduce forwarding itself.

## Measured model contract

Counts are UTF-16 characters from actual compiled Tool metadata/results, not estimated tokens.

| Measurement                           | Before | After |
| ------------------------------------- | -----: | ----: |
| Compiled parameter schema             |    864 |  1081 |
| Complete Tool metadata                |   1143 |  1483 |
| Explicit Group send acknowledgement   |     90 |   133 |
| Default Human DM send acknowledgement |     58 |   106 |

The old acknowledgement is prose containing only the message ID. The new JSON has exactly `channelId` and `messageId`, matched against committed records for both explicit and default destinations. The additional Channel identity increases acknowledgement size; no reduction in total token usage is claimed.

Initial pre-#577 validation accepted both four-field identities. After #577, retained old messages project `{fileId,name,mime,size}`; obsolete `{hash,name,mime,size}` results must be refreshed from the owning message before a new send. Owner-qualified legacy image reads still resolve current bytes. The new `integer` declaration matches existing safe nonnegative size validation. The pinned DSH schema accepts neither `maxItems` nor numeric bounds; descriptions and runtime guards express at most 10 attachments, size 0–9007199254740991, and at most 20 eligible Group mentions. No Host path reaches these read/image results.

## Regression coverage and validation

Production-seam regressions call the compiled DSH Tools through Core and canonical SQLite Messaging: default/explicit committed IDs, attachment-only image sends, migrated retained legacy history and old/compact reads, rejected obsolete hash sends, 10 accepted versus 11 refused references, fabricated/missing/cross-profile references, invalid safe integer sizes, same-Channel replies, 20 eligible mention IDs versus 21, self/paused/nonmember/missing recipients, identical delivery-key retries, conflicting retries, and failed authoritative appends without success acknowledgement. Existing tests retain image ownership/current-file and causal-loop coverage.

The first full run recorded 1529 passes, one existing skip, and one timeout in `memory-file-actions.test.ts` (“streams binary and oversized current bytes with a safe Unicode filename”, 15-second threshold). Its isolated rerun passed all four tests in 6.91 seconds without assertion or timeout changes. The original failure is retained here; a rerun is not a claimed Memory fix. Final integrated suite results are recorded in `validation.json`.

## Human QA

The task-owned candidate remains running, with an authenticated browser on **QA570 Forwarded Images after**. Open the image, then select **QA570 Image Forwarder after** and compare the JSON confirmation with the Group's original message. The restart report is marked `QA570-INTEGRATED-DONE`. New local-file uploads remain a separate product decision.

## Evidence files

- `before-report.png` / `after-report.png`: matched Human DM image inspection and quoted acknowledgement.
- `before-forwarded.png` / `after-forwarded.png`: actual attachment-only Group messages.
- `after-opened-image.png`: Human click opens the committed image in the browser.
- `after-integrated.png`: final Host restart and original-message inspection.
- `before-results.json` / `after-results.json`: actual schema, results and synthetic message identities.
- `validation.json`: final revision and delivery checks.

Driver notes: the first two launch ports were occupied; neither existing process was stopped, and verified free ports were selected. The first headful capture timed out waiting for Bot mode to initialize; a normal native reload succeeded. An evidence assertion initially compared JSON property order; it was corrected to compare the unchanged four field names and values. These driver corrections do not change product code or turn the original failures into passes.

## Latest-main compatibility correction

The first PR CI ran against newly merged #577 and correctly rejected the test fixture that tried to append raw legacy hashes as new messages. The corrected fixture seeds an actual retained immutable Human DM, migrates it through canonical Messaging, verifies its original envelope is unchanged, and forwards current references from both old and compact reads. Raw obsolete hashes remain rejected. Model guidance and bilingual release/contracts explicitly require refreshing old reads. The final runtime is rechecked after integrating this change; its latest schema measurements and source revision are in `after-results.json`.
