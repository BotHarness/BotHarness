# Actual offscreen playback and return

Issue #1173 / PR #1180. Actual integrated runtime: `3dbcce83189294483844e0f396defe6085accac8`, main base `59ab5769`, published `@botharness/pixel-avatar@0.8.0`. The exact built bundle was launched through the isolated DSH helper; authenticated API health passed. Source review against latest-main `652410b5` is separate from runtime integration of that newer Assignment-capacity commit.

One real Bot `channel_send` produced the exact requested 2,905-character QA message. No fake SSE, product-store mutation, artificial visibility event or direct audio invocation was used. The scene also shows older QA messages in ordinary Chat; they are not the newly revealed companion card.

The official MCP device-viewport control changes the document from 1559×865 to 1×1, then back. An independent native IntersectionObserver records the character at x=8, y=-95 with intersection ratio zero in that 1×1 viewport. The document stays `visible`. This deliberately extreme viewport establishes the actual nonintersection seam, not ordinary-size layout usability or real background-tab behavior.

- Before: 204 characters revealed and 95 observed audio-source starts.
- Offscreen interval: 3,989.4ms between observations; 316 characters at both ends, 148 source starts at both ends.
- After return: 408 characters with the old prefix retained; 192 source starts. Same document/time origin, without reload or replay of the committed prefix.
- Console errors: zero. Original sound setting restored, recorder stopped and owned browser closed.

`visible-before.png` and `visible-after.png` are actual 1559×865 screenshots. Resize clamps the character to the left edge, so this is a behavior pair rather than an identical-position comparison. The upright message bubble and connector are the merged anchor implementation. This does not qualify the separate immediate-release regression in #1248.

`offscreen-return.webm` is the continuous official MCP silent screencast, losslessly remuxed only: 54.600s, no interpolation, dubbing or speed change. `observed-output.mp3` converts the actual QA-observed Web Audio output branch: 15.576s, without volume adjustment or synthesized replacement audio. The two captures use different clocks/durations; they are separate artifacts and do not establish a synchronized soundtrack or complete wall-clock audio timeline. The source-start observations establish no newly admitted voice while offscreen; this is not a new Human listening approval.

The first native-window resize attempt never established nonintersection. A second attempt used an incompatible object argument for the official string-based emulation control and stopped before setup. Both failures and cleanup remain preserved privately; neither is passing evidence. The successful run uses the documented viewport string and checks actual geometry.

The allowlisted `qualification.json` omits private login URLs, cookies, message bodies, Bot/Channel identities and raw logs. Genuine background qualification, calibrated fast-drag/throw feedback and performance acceptance remain separate open gates.
