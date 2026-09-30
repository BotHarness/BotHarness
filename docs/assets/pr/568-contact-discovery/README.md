# Contact discovery E2E (#568)

All images are original 1440 × 1200 Chinese dark-theme DSH 0.2.0-rc.1 screenshots with synthetic local QA data. Two isolated Profiles each have 24 eligible colleagues, including two identically named Polar Specialists. The intended colleague is last in stable-ID order.

- `before-discovery.png`: baseline Human DM and committed action; the model misstates the count and old parameters in its prose. Actual `request/header` and `tool/result` in `results.json` establish an empty parameter schema and 24 contacts in one 12,009-character response. Model prose is not verification authority.
- `after-discovery.png`: real model uses default pages of 20 and 4, disambiguates the later-page colleague, reads detail, searches a term beyond the preview, and sends exactly one Bot DM.
- `before-conversation.png` / `after-conversation.png`: native action-chip click opens the actual two-member Bot DM; Human sees the committed original message with a read-only banner and no composer. The after screenshot was recaptured on the integrated Host.
- `after-integrated.png`: final Host restart followed by real-model query, detail and original-message read, without another Bot DM.

The compiled parameter schema increases from 33 to 621 characters; complete Tool metadata from 167 to 1,064. Default actual returns decrease from 12,009 characters to 6,018 and 1,194; every candidate discovery/detail result is within the 12,000-character budget. Measurements use JavaScript UTF-16 string lengths. Screenshot checksums, exact source revisions, synthetic stable IDs, Tool arguments and bounded result summaries are in `results.json`; local credentials, raw prompts and filesystem paths are excluded.

Human QA: open QA568 Discovery after, inspect the colleague-discovery report, and click its centered sent-private-message action. Confirm the correct Polar Specialist conversation and read-only composer boundary. To repeat discovery, ask the owner Bot to browse default contact pages and find the Polar Specialist responsible for the polar ledger, then search QA568-LEDGER-NEEDLE. Use current Tool results and stable IDs to distinguish the two names.

Pagination is a live Registry view. Stable-ID order survives renames; removed/paused candidates disappear; new matching identities behind a cursor require a fresh query. Custom BotAgentAdapter contacts callbacks must return the page shape documented in the bilingual release ledger. Existing DM and Group consumers continue accepting the identical stable ID values.
