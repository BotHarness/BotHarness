# Original screenshot-save slice acceptance — #494

This finishes the end-to-end acceptance of the existing screenshot-save feature, implemented in merged PR #513 and composed with upload from #514 / #654. It adds a repeatable real-model verification path and evidence, without changing production Browser behavior. The integrated runtime under test is main `ec2e3a5226e4f94276e1720761d9c27201f7893e`.

## Results

| Original acceptance criterion                                          | Verified result                                                                                                                                                                                                                                              |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Capture reaches the model as an image attachment and a saved JPEG path | Real model called `browser_screenshot`; the saved JPEG exists. Its normalized native image attachment is content-addressed, present in DSH's attachment store and verified against its SHA-256 and byte count.                                               |
| Bounded retention removes old captures                                 | After seeding 105 disposable historical JPEGs alongside the original capture, one native registered screenshot call leaves exactly 100 captures: seven oldest removed, both live captures and the remaining 98 historical captures retained.                 |
| Bot chains the returned path into upload                               | The real model copied the exact saved path into `browser_upload`, attached it through the observed chooser-button ref and freshly observed the filename.                                                                                                     |
| A coherent user task completes                                         | After a second authorized DM, the real model observed, clicked Publish once, observed Published: 1 and committed a DM reply. The loopback server parsed actual multipart FormData and verified filename, length and SHA-256 against the original saved JPEG. |
| Privacy and ownership remain intact                                    | Three successful screenshot/upload/publish Audit entries are attributed to the Bot, Orchestrator Session and role, without absolute paths or JPEG contents. Source JPEG base64 does not enter durable Session events. The same owned target remains current. |

The real model performs the screenshot, upload and publish steps. Only the retention test uses the existing disposable native Tool adapter; its seeded history is explicit fixture data, not 105 observed browser captures. The fixture never assigns file inputs: its Attach screenshot button creates a hidden file input and invokes the native chooser; `browser_upload` performs the interception and attachment. The server receives actual JPEG bytes rather than a filename-only acknowledgment.

## Screenshot states — 2400 × 1472

All three unedited JPEGs come from the production authenticated Browser observation route with the same viewport, light theme, English fixture, browser locale and data. These are states of the already implemented feature, not a before/after runtime fix.

- `before-page.jpg`: local draft, no attachment, Published: 0.
- `attached-page.jpg`: the real model's saved screenshot attached, Published: 0.
- `completed-page.jpg`: native Publish click completed once; the receipt displays the received JPEG byte count.

No account, credential, private prompt, personal content or absolute Host path is shown. `results.json` is a public-safe assertion report; authentication, Bot/Session identities and checkpoint paths remain outside Git.

## Reproduce

Use a fresh isolated DSH Profile from `scripts/dev-instance.mjs`, the pinned `0.2.0-rc.1` CLI, a built Bundle and a usable machine-local DeepSeek key. Insert `scripts/fixtures/browser-queue-qa.mjs` only in this disposable Profile's Patch and set `botharness-browser.autoAllowActions` only there. The fixture is loopback-only and contains no personal data; DM prompts explicitly authorize uploading and publishing to it.

```sh
node scripts/e2e-browser-screenshot-upload.mjs --serve
```

In another terminal, set `BH_E2E_ORIGIN`, `BH_E2E_HOME` and `BH_E2E_STATE` for the private isolated Profile and checkpoint. The helper reads the launcher's private authentication cookie; do not put login URLs or credentials in Git. Default fixture port is 32012; set `BH_E2E_FIXTURE_PORT` consistently in both terminals if occupied.

```sh
set -e
BH_E2E_SCREENSHOT=<before-image> node scripts/e2e-browser-screenshot-upload.mjs --prepare
BH_E2E_SCREENSHOT=<attached-image> node scripts/e2e-browser-screenshot-upload.mjs --attach
BH_E2E_SCREENSHOT=<completed-image> node scripts/e2e-browser-screenshot-upload.mjs --publish
BH_E2E_RESULTS=<public-report> node scripts/e2e-browser-screenshot-upload.mjs --retention
```

Each mode requires the previous completed phase. Reusing a completed publish fails before sending model input. Reproduce in a new disposable Profile and fixture server; preserve the completed page for Human QA. Open Screenshot QA's DM and expand Browser to view Published: 1 and the real model reply.

## First failures and native contract

The initial probes failed on test assumptions, not a Browser runtime regression: native Session tool arguments are JSON strings, image blocks carry `attachment` references rather than raw `data`/`mimeType`, and native image admission normalizes/re-encodes JPEGs. The normalized model image can therefore have a different byte count and digest from the saved Chrome JPEG. The probe now verifies the normalized attachment against its own content-addressed stored bytes and verifies the uploaded file against the original saved JPEG. Exact one-submission, path equality, Audit counts and retention assertions remain strict. Complete reruns use fresh isolated Profiles; first-failure logs stay local.

This format was checked in the installed pinned DSH `dsh-attachment-local` implementation (`normalizedImagePath`, `prepareImage` / normalization and immutable publication), and against the real Host. It does not establish a new BotHarness persistence authority. Model vision interpretation, public-site posting, actual sign-in, profile export and Container Browser remain outside this acceptance.

Validation: full repository suite **1683 passed, 1 existing opt-in skip**; lint, formatting, typecheck and build passed. E2E is opt-in because it needs a real model key and a running managed browser; CI does not silently count this live scenario as a unit test.
