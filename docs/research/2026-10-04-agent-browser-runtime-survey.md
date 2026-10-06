# Agent-oriented browsers and runtimes: Steel, Aside and BotHarness

Date: 2026-10-04 (Asia/Tokyo). Research only; this is not an implementation decision, performance certification or issue claim.

## Decision context and method

The immediate BotHarness goal is equivalent Browser operations through managed Local and Container browsers, followed by explicit control of a Human's daily browser. Human context sharing (#758, v2.0) is a separate product path. A runtime should improve browser execution while PersonaBot, Browser Access, Session authorization, tab ownership, Pause, Audit and model attachment authority stay with their existing owners.

Inspected official documentation and pinned public source. No candidate was installed or run; no personal browser/profile was accessed. Benchmark numbers remain vendor claims. Distinguish a rendering engine, a browser/session service, an Agent-facing driver and a complete application with its own agent.

## Working recommendation

1. Evaluate Microsoft's Playwright Chrome Extension first for the remaining daily-Chrome control slice. It already describes real-tab consent, existing logins and separate client tab groups. Qualification in BotHarness is still required.
2. Keep current managed Chrome as the baseline. Compare its observation/action behavior with agent-browser and Playwright before replacing the driver. Improving compact page context and reliable actions may matter more than changing the browser binary.
3. Treat Steel as an optional managed execution backend, not an automatic upgrade to model reasoning or a connection to the Human's current Chrome.
4. Evaluate Aside and BrowserOS neo as optional local browser targets. They are different adoption choices from an extension in the Human's unchanged Chrome.
5. Keep Stagehand's model-backed action resolution optional; do not create an accidental competing PersonaBot reasoning/approval loop.

These are architecture inferences from the facts below, not measured rankings.

## Current BotHarness baseline

Local and Container use the same high-level tool catalog. The runtime abstracts browser launch/CDP connection; Container supplies an execution implementation and upload staging. The model receives application-level observe/click/type tools, not raw CDP messages. The current snapshot script collects bounded rendered text and element refs from the main document; it is not a full accessibility-tree traversal. This identifies an observation-quality comparison worth doing without presuming a browser-engine replacement.

Sources: [runtime and snapshot](https://github.com/BotHarness/BotHarness/blob/db6f1bb3ccee4b491ef8bc1e1ce68a1bbbfb068b/packages/browser/src/runtime/browser.ts#L308), [runtime selection](https://github.com/BotHarness/BotHarness/blob/db6f1bb3ccee4b491ef8bc1e1ce68a1bbbfb068b/packages/browser/src/runtimes.ts), [tool catalog](https://github.com/BotHarness/BotHarness/blob/db6f1bb3ccee4b491ef8bc1e1ce68a1bbbfb068b/packages/browser/src/tool/catalog.ts), [Container E2E](https://github.com/BotHarness/BotHarness/blob/db6f1bb3ccee4b491ef8bc1e1ce68a1bbbfb068b/docs/evidence/issue-726/README.md).

## Steel Browser and Steel CLI

Inspected Browser main `e5902fc50f767702894902916ecf5489de7de457`; latest listed release `v0.5.4-beta` is `3fe2410ad0861303cc06d4aabdb20d0a6a60d888`. Inspected CLI `6ea1953f9770bcbdd5d0ae7e98c80a39ac931b95`. Main source is not proof that a published container digest contains the same behavior.

Steel Browser is an Apache-2.0 managed Chromium service, deployable locally or in Docker, with REST lifecycle/extraction and standard CDP attachment. It does not supply the PersonaBot model loop. The separate Steel CLI integrates agent-browser's native snapshot/ref/action engine; installing Steel alone does not confer those model-facing abstractions.

Sources: [Browser entry points](https://github.com/steel-dev/steel-browser/blob/e5902fc50f767702894902916ecf5489de7de457/README.md), [Docker packaging](https://github.com/steel-dev/steel-browser/blob/e5902fc50f767702894902916ecf5489de7de457/Dockerfile), [CLI engine](https://github.com/steel-dev/cli/blob/6ea1953f9770bcbdd5d0ae7e98c80a39ac931b95/src/browser/engine.rs), [CLI documentation](https://docs.steel.dev/overview/steel-cli).

**Important self-host boundary:** one active session per instance. `SessionService` holds a single active owner, so creating another session is not independent concurrent isolation. An outer instance/pool/profile lease would be needed for independently isolated Bot workloads. Cloud concurrency, CAPTCHA and credential/profile APIs are separate offerings. Documentation says Local Files are unsupported, but pinned main contains registered file routes: report this as source capability, not tested release parity.

Sources: [active session](https://github.com/steel-dev/steel-browser/blob/e5902fc50f767702894902916ecf5489de7de457/api/src/services/session.service.ts#L68), [Local/Cloud comparison](https://docs.steel.dev/overview/self-hosting/steel-local-vs-steel-cloud), [file routes](https://github.com/steel-dev/steel-browser/blob/e5902fc50f767702894902916ecf5489de7de457/api/src/modules/files/files.routes.ts), [route registration](https://github.com/steel-dev/steel-browser/blob/e5902fc50f767702894902916ecf5489de7de457/api/src/steel-browser-plugin.ts#L104).

OSS includes a real interactive CDP screencast viewer. It supplies keyboard/mouse input, but not BotHarness's pause-before-takeover arbitration. Default API/WS paths have no inspected API-key/tenant authorization; isolate them behind the existing authenticated gateway. Profile persistence also needs qualification: the inspected `userDataDir` expression treats a nonempty supplied path as selection of a fixed internal directory, and default Compose mounts do not establish persistence of that actual Chrome profile. This is integration work, not a drop-in replacement.

Sources: [viewer](https://github.com/steel-dev/steel-browser/blob/e5902fc50f767702894902916ecf5489de7de457/api/src/templates/live-session-streamer.ejs), [cast/input handler](https://github.com/steel-dev/steel-browser/blob/e5902fc50f767702894902916ecf5489de7de457/api/src/plugins/browser-socket/casting.handler.ts), [API defaults](https://github.com/steel-dev/steel-browser/blob/e5902fc50f767702894902916ecf5489de7de457/api/src/index.ts), [profile choice](https://github.com/steel-dev/steel-browser/blob/e5902fc50f767702894902916ecf5489de7de457/api/src/services/session.service.ts#L180), [Compose](https://github.com/steel-dev/steel-browser/blob/e5902fc50f767702894902916ecf5489de7de457/docker-compose.yml).

## Aside

Aside is a proprietary Chromium-based end-user browser with its own Agent. Current official documentation also exposes `aside mcp` for external agents and `aside repl` for direct page inspection, screenshots, downloads and deterministic browser steps. Separately, `aside "task"` starts Aside's own Agent. Thus it is a credible external Local target candidate, not merely a sealed chatbot. Public help does not publish complete MCP tool discovery or explicitly guarantee zero internal model calls in the external tool path; qualify those before promising a single PersonaBot loop.

Source: [current developer interface](https://docs.aside.com/help/developers).

The June engineering article describes a Playwright-shaped Asidewright wrapper over CDP, compact accessibility snapshots, asynchronous tab/download signals, visual fallback and patched background-tab behavior. Its criticism of exposing raw CDP to a model is not an argument that all internal CDP drivers are inappropriate: Asidewright itself wraps CDP. BrowserOS, Steel and BotHarness need comparison at their actual model-facing abstraction. The article's benchmark/token reductions are self-reported, not an independent ranking. The FAQ states the browser will not be open-sourced.

Source: [engineering article and FAQ](https://aside.com/blog/how-we-built-the-sota-browser-agent-that-outperforms-fable).

Official native changelog documents Windows release, external MCP/CLI Agent Tabs and UI takeover. Components changelog describes CLI/REPL attachment to an account's focused window and refusal where profiles are ambiguous. This is reuse of an Aside window/profile, not arbitrary unchanged Chrome. The installer script includes Linux CLI packages, but no official Linux browser/daemon/Docker deployment contract was found; CLI packaging is insufficient evidence of a Container Browser. It is therefore not presently qualified as our unified Local/Container replacement.

Sources: [native changelog](https://docs.aside.com/changelog/native), [components changelog](https://docs.aside.com/changelog/components), [download](https://aside.com/download), [installer text, inspected but not executed](https://releases.aside.com/install.sh), [software terms](https://aside.com/policy/terms).

## BrowserOS neo / BrowserOS

Inspected `b56f75d0470e4a9145579aff144a84b6d5eb3b7c`. BrowserOS neo explicitly targets external MCP agents. Public `snapshot`/`act` handlers directly observe/control the browser; `run` supplies a sandboxed scripting interface. This better documents a pure browser-tool backend than Aside's currently brief MCP help page. The official workflow includes request/await Human help and resolved/cancelled/timed-out handoff. These are source/documentation claims, not our tested integration.

Sources: [official external-agent skill](https://github.com/browseros-ai/BrowserOS/blob/b56f75d0470e4a9145579aff144a84b6d5eb3b7c/skills/browseros-neo/SKILL.md), [snapshot handler](https://github.com/browseros-ai/BrowserOS/blob/b56f75d0470e4a9145579aff144a84b6d5eb3b7c/packages/browseros-agent/crates/browseros-mcp/src/tools/snapshot.rs), [action handler](https://github.com/browseros-ai/BrowserOS/blob/b56f75d0470e4a9145579aff144a84b6d5eb3b7c/packages/browseros-agent/crates/browseros-mcp/src/tools/act.rs), [Human help lifecycle](https://github.com/browseros-ai/BrowserOS/blob/b56f75d0470e4a9145579aff144a84b6d5eb3b7c/packages/browseros-agent/apps/claw-server-rust/src/services/help.rs).

Neo is a separate persistent browser alongside daily Chrome, with import, Agent tab groups and local replay. Tab labeling is not independent security isolation; BotHarness must retain recipient/tab authority. Neo publishes macOS/Windows builds, while classic BrowserOS also supports Linux. No official Docker image/runbook was found in this review. Do not assume neo's new MCP/handoff is the same as classic's Linux interface. Both products are in the AGPL-3.0 repository.

Sources: [neo installation](https://docs.browseros.com/neo/install), [tab ownership boundaries](https://docs.browseros.com/neo/tabs-and-isolation), [product distinction](https://github.com/browseros-ai/BrowserOS/blob/b56f75d0470e4a9145579aff144a84b6d5eb3b7c/README.md), [license](https://github.com/browseros-ai/BrowserOS/blob/b56f75d0470e4a9145579aff144a84b6d5eb3b7c/LICENSE).

## Microsoft Playwright Extension / MCP

Inspected Playwright `7ad3fba1aad9471c7e46d67a11b0e710a5d77ea8`, Playwright MCP `f183dad4a52965583e3cc1d59b88cdc279e2e57d`.

The official extension is distributed through the Chrome Web Store. MCP's `--extension` connects to an existing browser. The Human selects a tab and normally approves each connection. Multiple clients get separately named/colored tab groups; a tab belongs to one client at a time, and the status page offers disconnect. This is the most directly relevant published path to controlling existing logged-in Chrome tabs.

Sources: [extension contract](https://github.com/microsoft/playwright/blob/7ad3fba1aad9471c7e46d67a11b0e710a5d77ea8/packages/extension/README.md), [MCP](https://github.com/microsoft/playwright-mcp/blob/f183dad4a52965583e3cc1d59b88cdc279e2e57d/README.md).

The extension uses `debugger`, `activeTab`, `tabs`, `tabGroups` and all-URL host permissions. Source includes explicit group membership and debugger detach bookkeeping. Its connection/grant behavior is not identical to BotHarness's current one-tab read-only lease, so its consent is not a replacement for BotHarness authorization, Pause or revocation. Do not automatically configure token-based connection-approval bypass for a convenience prototype.

Sources: [manifest](https://github.com/microsoft/playwright/blob/7ad3fba1aad9471c7e46d67a11b0e710a5d77ea8/packages/extension/manifest.json), [group ownership](https://github.com/microsoft/playwright/blob/7ad3fba1aad9471c7e46d67a11b0e710a5d77ea8/packages/extension/src/connectedTabGroup.ts), [relay lifecycle](https://github.com/microsoft/playwright/blob/7ad3fba1aad9471c7e46d67a11b0e710a5d77ea8/packages/extension/src/relayConnection.ts).

## agent-browser

Inspected `526157cfd4ec64f45939f9ba0f10d5936aa7ac33`. This is an open-source Agent-oriented automation CLI/daemon, using real Chrome by default. It exposes snapshots, ref-based actions, uploads, downloads, tabs, CDP attachment and persistent profiles. Core deterministic commands can be used without adopting its optional chat loop. Chrome profile copying is a separate browser snapshot, not control of the Human's currently open tabs. Auto-connect requires an available remote-debugging endpoint.

Sources: [README](https://github.com/vercel-labs/agent-browser/blob/526157cfd4ec64f45939f9ba0f10d5936aa7ac33/README.md), [Apache-2.0 license](https://github.com/vercel-labs/agent-browser/blob/526157cfd4ec64f45939f9ba0f10d5936aa7ac33/LICENSE).

Useful comparison points include scoped/interactive-only compact snapshots, iframe representation, annotated screenshots and invalidated refs. Its live WebSocket stream accepts Human input. These are documented affordances, not measured evidence that it improves our DeepSeek task success. The repo's Docker files inspected here build cross-platform binaries; they are not a ready-made production browser/Viewer image. Local/container packaging and authenticated stream takeover still need qualification.

Sources: [snapshots](https://github.com/vercel-labs/agent-browser/blob/526157cfd4ec64f45939f9ba0f10d5936aa7ac33/docs/src/app/snapshots/page.mdx), [streaming](https://github.com/vercel-labs/agent-browser/blob/526157cfd4ec64f45939f9ba0f10d5936aa7ac33/docs/src/app/streaming/page.mdx), [Docker build](https://github.com/vercel-labs/agent-browser/blob/526157cfd4ec64f45939f9ba0f10d5936aa7ac33/docker/docker-compose.yml).

## Stagehand

Inspected `50f3ab81659365ab0fcb960205f41aa88bbfd028` (v4 documentation). This is a browser automation SDK, with deterministic page/locator operations and model-backed `act`, `observe`, `extract`. Official examples launch local Chrome with a persistent profile; Browserbase provides the hosted execution path. A deployed extension runtime is not, by itself, evidence of an explicit Human-selected daily-tab borrowing contract. External model resolution, caching and hosted session ownership introduce integration choices beyond swapping a Chrome executable.

Sources: [current SDK README](https://github.com/browserbase/stagehand/blob/50f3ab81659365ab0fcb960205f41aa88bbfd028/README.md), [v4 quickstart](https://docs.stagehand.dev/v4/first-steps/quickstart), [extension runtime](https://github.com/browserbase/stagehand/blob/50f3ab81659365ab0fcb960205f41aa88bbfd028/packages/extension/README.md).

## Lightpanda: a different workload

Lightpanda is a new headless engine, not a Chromium fork. It supports DOM/JavaScript and automation protocols; the official README describes no graphical rendering engine, with text-only PNG/PDF output. It may suit high-volume extraction. That is a poor fit for replacing our real Chrome rendering, screenshot interpretation and Human takeover path. Published speed/memory numbers are workload-specific vendor measurements.

Source: [official repository](https://github.com/lightpanda-io/browser).

## Next qualification, before selecting a replacement

Use the same actual PersonaBot/model and synthetic fixtures on each candidate. Measure completed tasks, observation size/token cost, latency, retries and memory. Exercise a logged-in page, changed DOM, iframe/Shadow DOM, popup, upload/download and visual fallback. Also exercise two Bots, Human input, Pause/Resume, closed tab, target change, disconnect and stale results. Verify that Browser Access and native authorization still gate every action and image; no candidate may silently switch to another Human tab.

First runnable comparison should be existing daily Chrome → explicit one-Bot tab connection → observe → authorized input/click → independently verified page result → disconnect → further action refusal. Keep Browser control separate from later context sharing. A successful fixture run is not proof against all anti-bot defenses or a complete OS/browser compatibility matrix.
