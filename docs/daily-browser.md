# Share a daily-browser tab

Daily Browser lets one PersonaBot read a tab you explicitly share from Chrome or Edge, including its current login state. This first version is read-only: it cannot click, type, navigate, or read other tabs. You can return the tab at any time.

## Install the extension

Use a local DSH Web instance opened at `http://127.0.0.1:<port>` or `http://localhost:<port>`. The extension only connects to the DSH Host on your computer.

1. Locate `packages/browser/extension` in the BotHarness checkout, or the `extension` directory in the installed Browser package.
2. Open `chrome://extensions` in Chrome or `edge://extensions` in Edge.
3. Enable Developer mode, choose Load unpacked, and select that directory.
4. Pin **BotHarness Daily Browser** to the browser toolbar if you want an easier entry point.

This version is distributed as unpacked source. Chrome/Edge store distribution is a later step. Edge compatibility follows the MV3 APIs; this slice's real end-to-end evidence uses Chrome for Testing.

## Share and observe

1. In Bot settings, choose **Browser Target → Daily Browser**. This is shared by all Bots in this DSH Profile; switching requires new action approval.
2. Enable Browser Access for the intended Bot and open its Channel sidebar's Browser entry. Computer Access is not required.
3. Choose **Connect browser extension**. The pairing code expires after five minutes and can be used once.
4. Open the page you want to share in your daily browser. Click the extension icon, enter the local BotHarness address and pairing code, and choose **Connect**.
5. Check the Bot name and current page shown by the extension, then choose **Share current tab read-only**. Connecting alone does not share page content.
6. Ask that Bot to use `browser_observe`. Approve its first action when the existing Browser approval asks. The Bot reads bounded visible text and control labels from this document; it does not receive cookies or input values.

The Channel sidebar shows the shared title and address. The extension also shows **READ** while sharing. The Human continues browsing normally, but changing or reloading the shared document ends the lease.

## Return or reconnect

Choose **Return tab** in the extension or BotHarness sidebar. The tab stays open. Navigation, reload, closure, Browser Access removal, changing Browser Target, Host restart, browser restart, or disconnection also end borrowing. The maximum lease is 30 minutes; 45 seconds without polling invalidates a connection, checked on every operation and by a ten-second cleanup interval. Start a new pairing and Share flow to lend a tab again.

Internal browser pages, extension pages and browser-owned viewers cannot be shared through this flow. If pairing fails, check the local address, create a fresh code, and open the extension on an ordinary HTTP/HTTPS page.

## Control one existing Chrome document

Choose **Daily Chrome · Control** in Bot settings → Browser Target. This is separate from the read-only extension above.

1. Install Microsoft's [Playwright extension 0.4.0](https://chromewebstore.google.com/detail/playwright-extension/mmlmfjhmonkocbjadbfplnigmagldckm) in the Chrome profile you already use. It requests debugger, tabs, tabGroups and all-sites permissions.
2. Enable Browser Access for the selected PersonaBot. Computer Access can remain off.
3. In its Browser entry choose **Connect existing page**. In Chrome, select one existing HTTP(S) tab in the official connection page. Keep the connection dialog enabled; BotHarness does not use its bypass token.
4. Check the selected title and URL in BotHarness. **Connected · control not granted** allows no Bot observation or action yet. Choose **Allow control of this document** explicitly.
5. Ask the Bot to read or edit that page in DM. Approve its first Browser operation using the existing native Session approval. This target offers only observe, text input and clicks using current observation refs.
6. Choose **Pause Bot** to edit the page yourself, then **Resume**. The Bot must observe again before acting.
7. Choose **Return tab** to end the grant. Your tab stays open.

Navigation or reload, closing/removing the selected tab, extension disconnection, Access removal, target/profile changes and Host restart also end control. Reconnect and explicitly authorize again. Adding tabs to an extension group does not expand the Bot's document grant. The Human continues using their own Chrome window; this target does not provide a Container Viewer, screenshots, navigation or the other managed Browser tools.

The connector is pinned to `playwright-core@1.64.0-alpha-1790635538000` and official extension protocol 2. A connection waiting for tab selection can be cancelled from the Browser entry. Errors appear there; if the extension is missing, install it in the profile Chrome opens, then retry. Managed Local/Docker Browser and read-only Daily Browser retain their existing behavior.

Input and clicks bring the authorized tab to the foreground; observation does not switch tabs.
