# Issue #657 real Lark ZIP acceptance

Original runtime proof: d2c07f2c21240c8ba2fda8d909b164b2133489c1. Latest-main integration runtime proof: adf2e5ba007a901025f98ae2f699b6b44d1677b1. Pinned DSH: 0.2.0-rc.1. Qualified provider: 3784a5cb2e5a2aec6eb3a89c9eccf5426b9fb103. These are synthetic QA files.

## Verified behavior

A real User uploaded source-orders.zip to a private Lark topic, replied to that exact file with an @Bot processing request, and the real model saved an independent write-Granted copy. It wrote a Python processor with native file tools, requested one single-call Shell approval, read orders.csv, built a fresh summary-orders-final.zip, imported the new result and called bridge_reply_file. Lark accepted the application-identity file reply in the original topic, with the triggering User message as parent. No local Channel message mirror or Assignment was created for the external request.

The final reply and original were downloaded independently from Lark. summary.json contains rows=3, quantity=7, total=60; orders.csv is byte-identical to the source. Original ZIP remains 170 bytes with SHA-256 39c6928f4fc1a7a7439a0814f6da5ab314ed9f34b6f1d39f4154659402c89c84. The final ZIP is 322 bytes. The accepted Outbox persisted through Host restart; the remote topic still contained exactly two application file replies (one first-run result and one final-run result), with no automatic resend.

First-run model verification corrected an initial calculation before returning its result. Two later User QA requests were not admitted while the shared receiver connection had recovered; they are preserved as test history, not counted as successful runs. The original receive toggle and operational disconnect were temporarily paused through public APIs. The Provider supervisor can restore operational disconnect, so those pauses do not promise a permanent SDK stop. After verification the original scope and connection were restored; this task’s own QA Provider Fiber was disabled through the official Plugin Manager to stop its supervisor while preserving Core, Client and QA data.

## Visual evidence

source-modal-before.jpg runs the actual main Client at caa9ec3f from a separate checkout; source-modal-after.jpg runs the PR Client. Same retained Source Event, English locale, dark theme and 484 × 827 viewport. Host and QA data were retained; no DOM mocking or screenshot compositing.

lark-original-baseline.jpg shows the original upload. lark-first-result.jpg shows the complete first request and actual ZIP reply. lark-final-result.jpg shows the independent final-build reply. Native Lark captures are cropped to the synthetic QA conversation, excluding unrelated chats.

The original-file HTTP download route returned 200, no-store, 170 bytes and the original SHA-256. Client clicking showed Downloading and returned to Download file without error, but the in-app browser did not expose a completed blob download event; browser file-save completion remains Human QA, not an automated PASS.

## Human QA

1. Open the retained ZIP QA PersonaBot and its Bot Inbox external Source Event; compare source filename and Download file entry with the screenshots.
2. In the private BotHarness ZIP QA #657 Lark topic, download the original and the final reply; inspect summary.json and compare orders.csv. The committed ZIPs are exact independently downloaded evidence copies.
3. For fresh live processing or Client source download, transfer the single shared test receiver back to this QA instance through the same public receive/lifecycle controls first. Its IM Provider is currently disabled to preserve the other task's receiver; re-enable this task’s Provider as part of the handoff. Do not run both simultaneously.
4. Reply to the exact original file with @Bot, approve only the necessary Shell call, and verify one new ZIP reply in the same topic.

Latest-main integrated coverage: 1772 passed / 2 skipped; typecheck, build, lint/source policy, format and bilingual release ledgers passed. The provider fork regression suite separately passed 1916 tests. native-tool-trace.json contains only tool names and result sequences from final native Session Persistence, excluding model reasoning and private inputs.

## Latest-main revalidation

A third fresh processing run at adf2e5ba downloaded main-source-orders.zip and created summary-orders-main.zip with one Shell approval. Lark accepted it in the original topic with the exact new User request as parent. The independently downloaded 322-byte result contains rows=3, quantity=7 and total=60; CSV and original ZIP still match their original bytes. See integrated-verification.json, lark-integrated-result.jpg and the exact summary-orders-main.zip download. Subsequent review changes only repair independent waiter recovery on a concurrent acquisition failure and move fixture assertions outside caught callbacks; the new failure branch has focused regression coverage.

Final code after both review fixes: 1773 passed / 2 skipped; focused review regressions 15 passed; typecheck, lint/source policy, format, build and release ledgers passed. The healthy real Lark run remains pinned to adf2e5ba; the later code changes affect only independent concurrent-failure recovery.
