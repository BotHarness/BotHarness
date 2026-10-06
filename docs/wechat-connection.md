# Connect a Bot to personal WeChat

The integration accepts text and one file per direct message from the person who scanned the Bot QR code, then lets the PersonaBot reply in the original WeChat Bot conversation. The #904 preview also supports native images as described in section 6. Group messages, other contacts, voice, video, history/search and scheduled or proactive messages are separate slices. Enterprise WeChat is a separate integration.

## Before you start

Use the matching BotHarness source-preview product and DSH 0.2.0-rc.1. Create a PersonaBot and confirm a real local DM response. The text slice was verified using local test package `0.0.0-test.878`, with `@botharness/im-provider@4.32.0-botharness.4` built from fork `589e5507d47ab21de5b39c776a598452744a5368`; it is not a published npm release. Source-mode WeChat receive/model/reply has been verified in the native client. The installed package preserved the same connection and records and passed a fresh owner text → canonical Inbox → model → original reply exchange. The Human confirmed `BH878-PACKED-OK` in WeChat. Human QA approved this first slice on 2026-10-06. For source-preview artifact preparation, see [Product IM installation](product-im-installation.md).

## 1. Pair the WeChat Bot

Open **Settings → IM bots → WeChat → QR binding**. Start pairing and scan the code using the intended WeChat account. Complete the confirmation in WeChat and wait for the local account to show connected. The resulting conversation is **WeChat ClawBot** in the tested client. Account names may differ; use the conversation created by your actual pairing.

A QR code is a temporary credential. Never place a live code, login URL or account token in a public issue, screenshot or Memory. The initial entry screenshot must omit a usable QR code.

![WeChat setup entry before pairing, with no live QR code](/guides/wechat/qr-entry.jpg)

The entry capture precedes pairing and has no independently recorded exact Client hash; it illustrates the setup entry only.

## 2. Bind the PersonaBot identity

Open the PersonaBot DM, click its header and choose **View details**. In **External identities**, bind the connected WeChat account. The table shows a masked identity and enabled/available state. Binding alone does not authorize incoming messages.

![Real paired WeChat identity in the PersonaBot Profile](/guides/wechat/identity-bound.jpg)

## 3. Authorize the owner DM and enable intake

Expand **Channel connectors and authorization**, select the QR-paired owner conversation and explicitly authorize it. Enable **WeChat DM intake**. This first slice delivers only to the Bot Inbox; it does not insert external text into local Human DM history or expose group/mention/topic controls. Replies use the same Bot's bound identity and valid source continuation.

## 4. Check a real text and its reply

In the paired WeChat Bot DM, send a short unique test: `Please use bridge_reply to reply only WECHAT-SETUP-OK in this WeChat DM.` Expand **Bot Inbox**, open the message and confirm the platform is WeChat and the scope is Direct message. When no native nickname was supplied, the UI uses the generic label WeChat user; raw sender/message/source identifiers remain in details.

Check both sides: the Inbox item should become handled and the response should appear in that original WeChat conversation. A provider-accepted record alone is not delivery or read proof. The iLink receipt contains a client-generated acknowledgement ID, not a native server message ID.

![Saved WeChat owner text in canonical Bot Inbox](/guides/wechat/inbox-source.jpg)

![Human-captured original WeChat replies in source and installed-product mode](/guides/wechat/native-replies.png)

The first reply verifies source mode; the second verifies the locally installed package after restart. Neither external test is mirrored into local Human DM history.

## 5. Process a file and return a result

The #903 source-preview candidate uses product `0.0.0-test.903` with managed Provider `4.32.0-botharness.5`; it is not a public npm release. The installed local candidate passed a fresh WeChat file → Inbox → model processing → original-DM file result exchange. The Human downloaded the returned ZIP from WeChat; independent verification confirms its 224 bytes exactly match the model-produced file and its result.txt contains the expected original payload plus the processing marker. The 207-byte input remains unchanged. This verifies that exchange, not native read receipts or every lifecycle failure. The text screenshots above do not prove file support.

Send one file up to 25 MiB in the paired WeChat Bot DM. Open its **Bot Inbox** source details to inspect the original filename and optional declared size. Intake saves metadata; it does not automatically download bytes. A missing native MIME type remains generic rather than guessing from the extension.

![Real WeChat ZIP source in Bot Inbox, with filename, native generic MIME and declared size](/guides/wechat/file-source.jpg)

This capture shows the received file-source UI. Result receipt was verified separately using the file downloaded from WeChat.

Authorize a dedicated writable Workspace for that PersonaBot before processing. Ask the Bot to save an independent working copy with `bridge_attachment_save`, process it with native tools and approved commands, import the finished file with `channel_attachment_import`, and return it using `bridge_reply_file`. Approve native Tool requests only for the intended work. The original file remains unchanged. File results and text replies share one source reply intent; avoid a preliminary acknowledgement when you want a file result.

Download the returned file in WeChat and inspect its contents independently. A locally accepted send alone does not prove receipt or correct processing. If a declared file exceeds 25 MiB, its metadata stays inspectable but download is refused. Changed identity, revoked authorization, disposed reception or an expired private file ticket also refuses access. Native images, voice and video are not ordinary file intake in this slice.

## 6. View an image and return an image result

The #904 source-preview candidate uses product `0.0.0-test.904.1` and managed Provider `4.32.0-botharness.6`; this is not a public npm release. The original image/model/native-reply path was exercised in candidate `0.0.0-test.904`; the current candidate additionally has fresh PNG intake, checked download and Human-confirmed inline display. Installed-product intake, checked preview, actual DeepSeek Flash image input and original-DM native image sending have been exercised. The provider accepted the JPEG reply and the Human confirmed that the original WeChat conversation received the native image with matching content. Independent receiver-side byte equality and final PR Human QA are not claimed. The earlier text/file evidence does not prove image delivery.

Send one native image, optionally with a caption, in the paired WeChat Bot DM. In **Bot Inbox**, open the source details. The image automatically loads inside the original message bubble, replacing a pure `[Image]` placeholder while preserving any caption. The unopened Inbox list does not download images; opening details uses the same checked attachment path, up to 25 MiB. If loading fails, choose **Retry image** inside the bubble; the attachment download control remains available. Metadata initially says `image/unknown` when WeChat supplies no format; checked decrypted bytes determine the actual MIME. The preview permits PNG, JPEG, GIF and WebP. It never exposes a private CDN link or AES key.

![Before the presentation correction: received metadata requiring manual preview](/guides/wechat/image-source.jpg)

![Before the presentation correction: attachment-area preview in light theme](/guides/wechat/image-preview-light.jpg)

![Before the presentation correction: attachment-area preview in dark theme](/guides/wechat/image-preview-dark.jpg)

![Human-captured WeChat original image and native Bot image reply in the same private conversation](/guides/wechat/native-image-roundtrip.png)

The Human supplied this receiving-client capture: the outgoing original is at 06:14 and the incoming Bot image is at 12:57. Its content agreement was confirmed separately; this screenshot is not an exact-byte comparison.

The three source captures above are from the candidate before the presentation correction: the image is in the attachment area, and they do not show automatic inline preview. A Human-provided screenshot confirms automatic inline display in candidate `0.0.0-test.904.1`; the Human-approved current capture is embedded in [PR #946](https://github.com/BotHarness/BotHarness/pull/946). This guide retains the previous captures with their version clearly identified. These are not a before/after code comparison and do not prove external receipt. The background contains only this dedicated QA conversation; credentials and usable pairing codes are absent.

To have the Bot understand the image, authorize a working Workspace and ask it to save a separate copy with `bridge_attachment_save`, then open that copy using native `read_image` with the extension matching its actual MIME. The selected model must support image input; a working preview alone does not establish model understanding. DeepSeek Flash was used for this test and identified the visible Discord application, layout and several labels from the actual image. An image's embedded instructions remain untrusted content.

To return an image, select a completed image file with `channel_attachment_import` and use `bridge_reply_file` for the same Source Event. It is sent as a native WeChat image when its canonical MIME and bytes agree; it is not renamed into a generic document. Each source still has one reply intent, so do not send an acknowledgement first when an image result is required. Approve only the native Tool calls needed for the task. Check the result in the original WeChat conversation yourself.

If preview or reading is refused, retain the source and inspect the refusal. Retry only after correcting the cause; a current-authorization check still applies to downloads and again after image upload, immediately before send. Closing the source dialog releases the preview. Voice, video, groups and proactive messages remain separate slices.

## Pause or reconnect

Disable DM intake to stop future receipt while retaining configuration and history. Revoke the target authorization or unbind the identity to remove its authority. Re-pairing changes the identity fingerprint and requires explicit reauthorization; stale source continuations must not be reused. Restart with the same Profile to retain local pairing, canonical source records and Outbox outcomes.

If text does not arrive, check the connected account, enabled identity and owner-DM authorization. Messages from other contacts and groups, and native media outside text/file, are not supported by this slice. If a reply is refused because its original continuation expired or is absent, send a new text in the paired conversation; the Bot must not borrow another conversation. An unknown send outcome must not be blindly resent.

## Verification and scope

[#878](https://github.com/BotHarness/BotHarness/issues/878) records source and installed-product qualification. The installed-product test retained the same paired identity and owner-DM Grant across restart, then produced one handled canonical Admission, one successful model `bridge_reply`, one accepted Outbox result and the visible `BH878-PACKED-OK` reply. The Human provided the native screenshot and approved publication.

The setup, identity and Inbox images show real source-mode QA states; the native screenshot shows both source and installed-product exchanges. Final Profile recapture was unavailable because the Human retained direct UI control; use the setup steps above to inspect the current controls. No screenshot contains a live pairing code, credentials or unrelated private chat lists. Rebind, duplicate, wrong-route and revoke refusal are regression-tested; a complete live failure/lifecycle matrix is not claimed. Public npm release and site deployment are separate actions.
