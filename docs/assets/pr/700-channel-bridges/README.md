# #700 Channel Bridge evidence

Latest-main baseline: `23d5acd51207affacdc63092ea5256f147ee6b51`. Final production code: `4320d789`.

Chrome, natural 882 × 827 viewport, light theme, Chinese locale. Before and empty-after use the same initial three-message QA Group fixture. The empty-after frame was captured at `95d04e29`; Client presentation is unchanged through final code. Other screenshots were recaptured on final code, with activity growing as real QA messages arrived.

Final QA used the existing authorized Lark test group and identity. The final paused/deleted probes remained excluded after explicit re-add, delayed read-back and Host restart. Fresh mention and two ordinary messages each produced one Source Event. The real model called `channel_read` then `bridge_reply` on turns 48 and 49; both replies were Provider-accepted. Mention-only ordinary qualification produced no Source Event. Existing 5-message / 30-second digest parameters were preserved; retained QA is enabled, mention-only.

The initial deleted-route probe arrived late after re-add before the intake-boundary fix. Its accepted fact remains in QA history; it was not erased to produce passing evidence. Automated regression controls delayed delivery after pause/resume and delete/re-add/restart. Real QA does not artificially control Lark delivery timing. The cutoff uses qualified Provider send time and aligned Host UTC; clock skew can refuse otherwise eligible messages.

Generation 50 recovery requires a compatible backup or forward fix. No production deployment, new external scopes or accounts, multi-target/DM expansion, or shared sender authority was performed.

`verification.json` contains only bounded QA markers, counts, outcome states, policy fields and tool names. No credentials, full model prompts, other group messages or provider fingerprints are published.
