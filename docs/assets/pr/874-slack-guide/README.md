# Illustrated Slack connection guide — #874

Task: `codex/local/01a0f14c-5338-7020-853b-0fe54b87aa95`.
Claim: https://github.com/BotHarness/BotHarness/issues/874#issuecomment-5994275266
Base: `5e91748ef485b16a1f7fd62ae9768a5423263592`.

## Capture provenance

All images are real browser screenshots, converted to WebP without compositing or content alteration. Screenshots were inspected before inclusion; no token, private login URL or credential form value is present. Public QA names, synthetic messages and their non-secret IDs are retained.

- Guide images 01–06: current `.3` disconnected local onboarding and existing Slack QA console (creation method, Socket Mode, installed Bot scopes and saved Bot event subscriptions). Creation was cancelled; no application, token or permission was created or changed. OAuth captures show only the scrolled scopes section.
- Images 08–10 and 13: retained #868 product Profile, existing identity/Grant, empty binding form and original handled source. No identity, Grant or routing policy was saved or changed.
- Images 07/11: reused accepted #868 installed-artifact online state and actual native model replies; original PNGs and bounded qualification facts remain in `../868-slack-product/`.
- Image 12: reused #845 shared-Channel connector capture, explicitly labelled in the guide; original image remains in `../845-slack-shared-channel/`.

Guide screenshots use the Chinese UI: the English guide captions identify the same controls and scope. A blank form is not connection proof; the accepted configured/runtime captures are identified separately.

## Documentation presentation

- `before.webp`: currently deployed site's Chinese Lark guide/navigation, which has no Slack connection page. This is the public baseline, not a deployment of this PR.
- `zh-light.webp` / `zh-dark.webp`: local built Slack guide at the same header/table state in both themes.
- `en.webp`: English local built page and sidebar link.
- `mobile.webp`: Chinese local built page at 390 × 844 browser viewport; DOM client/scroll width both 384px, no horizontal overflow.

Both language pages load all 13 actual images. HTML, clean `.md` siblings and all WebP assets return 200 from the built preview. Build: 326 pages. Language/sidebar/design/release-ledger regression: 37 passed. Bilingual ledger, formatting and diff checks passed; Chinese OG font was regenerated.

Scope is documentation/navigation/media only. No runtime behavior, credential/permission change, new Slack app, npm publication or website deployment is included. The retained source/model/native reply evidence is #868's accepted E2E; this documentation task does not repeat or broaden that integration test.
