# #122 / #712 — transparent full-width Session cards

Real isolated DSH 0.2.0 RC1, actual DeepSeek V4 Pro/off, production Host/Client seams.

- Human supersedes the separate outer panel: disclosure floats transparently above the composer, with the transcript viewport extending behind it. Only Session cards keep a background.
- Full-width 40px desktop cards place name/status/time on one line; 420px cards wrap to two lines without overflowing. Native Assignment titles use ellipsis and a full-name hover title.
- Native `session/title` facts supply the actual Assignment name. The authenticated native `session/rename` command updates it while retaining Activity state, opaque display identity and current Tool Activity; a follow snapshot independently confirms the logged title.
- Latest-message padding follows measured disclosure height, so approval actions stay above the overlay. Scrolling up 96px demonstrates actual transcript content behind the transparent header; this is not a fabricated screenshot backdrop.
- Real Orchestrator Shell approval → allowed-once → harmless native two-second timer → actual `Safe tool activity confirmed` → idle/no Session rows → refresh remains idle. Assignment timer remains pending for Human QA.
- Default disclosure is folded; pinned/Rail summaries, reduced motion, refresh/reopen and both themes pass.

## Matched comparison

Before is the actually compiled previous #712 Client `5890adcf`, using the same final compatible Host, same real pending Assignment, logged native name, transcript, locale and light theme. After uses the final Client. Desktop is 1500×760 and narrow is 420×860. The changed transcript placement is the actual floating-layout result. No activity/history DOM was fabricated. Only machine-local directories and opaque Grant references in the native approval/transcript are redacted before capture.

JSON evidence is allowlisted: synthetic Bot identity, selected public model route, safe Host Activity snapshots with opaque display keys and names, layout measurements and native event type/time/registered tool name. It contains no native Session identity, raw execution payload, credentials, cookie or token URL. Real tool input remains visible only in the native approval screenshots for the harmless timer.
