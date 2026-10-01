import { spawn, type ChildProcess } from 'node:child_process';

import { jpegDimensions } from '../jpeg.js';
import { browserKey } from './keyboard.js';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export interface BrowserElement {
  readonly ref: string;
  readonly role: string;
  readonly name: string;
}

export interface BrowserObservation {
  readonly url: string;
  readonly title: string;
  readonly elements: readonly BrowserElement[];
  readonly text: string;
}

export interface BrowserTab {
  readonly tabId: string;
  readonly url: string;
  readonly title: string;
}

export interface CdpClient {
  send(
    method: string,
    params?: Record<string, unknown>,
    sessionId?: string,
  ): Promise<Record<string, unknown>>;
  close(): void;
}

interface WebSocketLike {
  send(data: string): void;
  close(): void;
  addEventListener(type: string, listener: (event: { data?: unknown }) => void): void;
}

type WebSocketCtor = new (url: string) => WebSocketLike;

export interface BotBrowserRuntimeOptions {
  readonly browserPath?: string;
  readonly userDataDir: string;
  readonly installDir?: string;
  readonly installFallback?: (installDir: string) => Promise<string>;
  readonly headless?: boolean;
  readonly launchTimeoutMs?: number;
  readonly onEvent?: (detail: string) => void;
  readonly connect?: (url: string) => Promise<CdpClient>;
  readonly platform?: NodeJS.Platform;
  readonly env?: NodeJS.ProcessEnv;
  readonly fileExists?: (path: string) => boolean;
}

export interface BotBrowserRuntime {
  ensure(): Promise<void>;
  isRunning(): boolean;
  open(url: string, reuseTabId?: string): Promise<BrowserTab>;
  observe(tabId: string): Promise<BrowserObservation>;
  click(tabId: string, ref: string): Promise<BrowserTab>;
  clickAt(tabId: string, x: number, y: number): Promise<BrowserTab>;
  type(tabId: string, ref: string, text: string): Promise<BrowserTab>;
  pressKey(tabId: string, key: string): Promise<BrowserTab>;
  scroll(tabId: string, direction: 'up' | 'down', amount: number): Promise<BrowserTab>;
  uploadFile(tabId: string, options: { ref?: string; path: string }): Promise<void>;
  createTab(url: string): Promise<BrowserTab>;
  listTabs(): Promise<readonly { targetId: string; url: string; title: string }[]>;
  tabInfo(targetId: string): Promise<{ url: string; title: string }>;
  closeTab(targetId: string): Promise<void>;
  captureScreenshot(tabId: string): Promise<
    | {
        data: string;
        mimeType: string;
        viewport?: { width: number; height: number };
        image?: { width: number; height: number };
      }
    | undefined
  >;
  openWindow(targetId?: string): Promise<BrowserTab>;
  currentUrl(): string | undefined;
  binaryPath(): string | undefined;
  stop(): Promise<void>;
}

export function browserCandidates(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): readonly string[] {
  if (platform === 'darwin') {
    return [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ];
  }
  if (platform === 'win32') {
    const programFiles = env['ProgramFiles'] ?? 'C:\\Program Files';
    const programFilesX86 = env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)';
    const localAppData = env['LOCALAPPDATA'];
    return [
      join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      ...(localAppData === undefined || localAppData === ''
        ? []
        : [join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe')]),
      join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    ];
  }
  return [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/microsoft-edge',
    '/usr/bin/microsoft-edge-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
  ];
}

export function discoverBrowserBinary(
  browserPath?: string,
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  fileExists: (path: string) => boolean = existsSync,
): string | undefined {
  const explicit = browserPath?.trim() ?? '';
  if (explicit !== '') return fileExists(explicit) ? explicit : undefined;
  return browserCandidates(platform, env).find((candidate) => fileExists(candidate));
}

export const PINNED_CHROMIUM_VERSION = '154.0.8037.57';

export async function installPinnedBrowser(cacheDir: string): Promise<string> {
  const { Browser, install } = await import('@puppeteer/browsers');
  const installed = await install({
    browser: Browser.CHROME,
    buildId: PINNED_CHROMIUM_VERSION,
    cacheDir,
  });
  return installed.executablePath;
}

export function buildLaunchArgs(options: {
  userDataDir: string;
  headless?: boolean;
}): readonly string[] {
  return [
    `--user-data-dir=${options.userDataDir}`,
    '--remote-debugging-port=0',
    '--disable-blink-features=AutomationControlled',
    '--no-first-run',
    '--no-default-browser-check',
    ...(options.headless === true ? ['--headless=new'] : []),
    '--new-window',
    'about:blank',
  ];
}

export function parseDevToolsUrl(output: string): string | undefined {
  const match = /ws:\/\/[^\s]+\/devtools\/browser\/[^\s]+/u.exec(output);
  return match?.[0];
}

export async function connectCdp(url: string, ctor?: WebSocketCtor): Promise<CdpClient> {
  const Impl = ctor ?? (globalThis as { WebSocket?: WebSocketCtor }).WebSocket;
  if (Impl === undefined) {
    throw new Error('This Node.js runtime has no WebSocket support; Node 22 or newer is required');
  }
  const socket = new Impl(url);
  const pending = new Map<
    number,
    { resolve: (value: Record<string, unknown>) => void; reject: (error: Error) => void }
  >();
  let nextId = 1;
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener('open', () => resolve());
    socket.addEventListener('error', () =>
      reject(new Error('The DevTools websocket failed to open')),
    );
  });
  socket.addEventListener('message', (event) => {
    if (typeof event.data !== 'string') return;
    let message: { id?: number; result?: Record<string, unknown>; error?: { message?: string } };
    try {
      message = JSON.parse(event.data) as typeof message;
    } catch {
      return;
    }
    if (typeof message.id !== 'number') return;
    const entry = pending.get(message.id);
    if (entry === undefined) return;
    pending.delete(message.id);
    if (message.error !== undefined) entry.reject(new Error(message.error.message ?? 'CDP error'));
    else entry.resolve(message.result ?? {});
  });
  socket.addEventListener('close', () => {
    for (const entry of pending.values()) entry.reject(new Error('The DevTools websocket closed'));
    pending.clear();
  });
  return {
    send(method, params = {}, sessionId) {
      const id = nextId;
      nextId += 1;
      return new Promise<Record<string, unknown>>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        const payload: Record<string, unknown> = { id, method, params };
        if (sessionId !== undefined) payload['sessionId'] = sessionId;
        socket.send(JSON.stringify(payload));
      });
    },
    close() {
      try {
        socket.close();
      } catch {}
    },
  };
}

export const SNAPSHOT_SCRIPT = `(() => {
  for (const el of document.querySelectorAll('[data-botharness-ref]')) {
    el.removeAttribute('data-botharness-ref');
  }
  const observationId = Array.from(crypto.getRandomValues(new Uint32Array(4)), (part) => part.toString(36).padStart(7, '0')).join('');
  const elements = [];
  const cap = 250;
  const nameOf = (el) => {
    const raw = el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('placeholder') || el.getAttribute('name') || (el.innerText || el.textContent || el.value || '');
    return String(raw).trim().replace(/\\s+/g, ' ').slice(0, 80);
  };
  const add = (el, role, fallbackName) => {
    if (elements.length >= cap) return false;
    const ref = 'e' + observationId + '_' + (elements.length + 1);
    el.setAttribute('data-botharness-ref', ref);
    elements.push({ ref: ref, role: role, name: nameOf(el) || fallbackName || '' });
    return true;
  };
  const wanted = 'a[href],button,input,textarea,select,summary,[role],[contenteditable="true"],[tabindex]';
  for (const el of document.querySelectorAll(wanted)) {
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) continue;
    if (!add(el, el.getAttribute('role') || el.tagName.toLowerCase())) break;
  }
  const clickables = [];
  for (const el of document.querySelectorAll('div,span,li,i,svg,img,label,section')) {
    if (clickables.length >= 400 || elements.length >= cap) break;
    if (el.hasAttribute('data-botharness-ref')) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 8 || rect.height < 8) continue;
    if (getComputedStyle(el).cursor !== 'pointer') continue;
    if (el.closest('a[href],button,input,textarea,select,summary,[role]')) continue;
    clickables.push(el);
  }
  for (const el of clickables) {
    if (elements.length >= cap) break;
    if (clickables.some((other) => other !== el && el.contains(other))) continue;
    const rect = el.getBoundingClientRect();
    const center = '@' + Math.round(rect.left + rect.width / 2) + ',' + Math.round(rect.top + rect.height / 2);
    add(el, 'clickable', el.tagName.toLowerCase() + ' ' + center);
  }
  const text = String((document.body && (document.body.innerText || document.body.textContent)) || '').replace(/\\s+/g, ' ').trim().slice(0, 6000);
  return { url: location.href, title: document.title, elements: elements, text: text };
})()`;

const READY_TIMEOUT_MS = 15_000;
const READY_POLL_MS = 200;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createBotBrowserRuntime(options: BotBrowserRuntimeOptions): BotBrowserRuntime {
  const onEvent = options.onEvent ?? ((): void => undefined);
  const launchTimeoutMs = options.launchTimeoutMs ?? 20_000;
  const connect = options.connect ?? ((url: string) => connectCdp(url));
  let child: ChildProcess | undefined;
  let client: CdpClient | undefined;
  let binary: string | undefined;
  let lastUrl: string | undefined;
  const sessions = new Map<string, string>();

  const isRunning = (): boolean =>
    child !== undefined && child.exitCode === null && !child.killed && client !== undefined;

  const launch = async (): Promise<void> => {
    binary = discoverBrowserBinary(
      options.browserPath,
      options.platform,
      options.env,
      options.fileExists ?? existsSync,
    );
    if (binary === undefined) {
      const explicit = options.browserPath?.trim() ?? '';
      if (explicit !== '') {
        throw new Error(`The configured Bot Browser binary does not exist: ${explicit}`);
      }
      const installer = options.installFallback ?? installPinnedBrowser;
      if (options.installDir === undefined && options.installFallback === undefined) {
        throw new Error(
          'No Chrome, Edge, or Chromium was found for the Bot Browser; install one or set browserPath in the browser plugin configuration',
        );
      }
      onEvent(`no system browser; installing Chrome for Testing ${PINNED_CHROMIUM_VERSION}`);
      try {
        binary = await installer(options.installDir ?? options.userDataDir);
      } catch (error) {
        throw new Error(
          `No Chrome, Edge, or Chromium was found and the pinned fallback could not be installed: ${error instanceof Error ? error.message : String(error)}; install a browser or set browserPath in the browser plugin configuration`,
        );
      }
      onEvent(`installed ${binary}`);
    }
    mkdirSync(options.userDataDir, { recursive: true });
    onEvent(`launch ${binary}`);
    const proc = spawn(
      binary,
      [
        ...buildLaunchArgs({
          userDataDir: options.userDataDir,
          ...(options.headless === true ? { headless: true } : {}),
        }),
      ],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
    child = proc;
    const endpoint = await new Promise<string>((resolve, reject) => {
      let stderr = '';
      const settle = (action: () => void): void => {
        clearTimeout(timer);
        proc.stderr?.off('data', onData);
        proc.off('exit', onExit);
        proc.off('error', onError);
        action();
      };
      const timer = setTimeout(
        () =>
          settle(() =>
            reject(
              new Error(
                `The Bot Browser did not report a DevTools endpoint within ${Math.round(launchTimeoutMs / 1000)}s`,
              ),
            ),
          ),
        launchTimeoutMs,
      );
      const onData = (chunk: Buffer): void => {
        stderr += chunk.toString('utf8');
        const url = parseDevToolsUrl(stderr);
        if (url !== undefined) settle(() => resolve(url));
      };
      const onExit = (code: number | null): void =>
        settle(() =>
          reject(new Error(`The Bot Browser exited during startup (code ${code ?? 'unknown'})`)),
        );
      const onError = (error: Error): void => settle(() => reject(error));
      proc.stderr?.on('data', onData);
      proc.on('exit', onExit);
      proc.on('error', onError);
    });
    try {
      client = await connect(endpoint);
    } catch (error) {
      proc.kill('SIGTERM');
      child = undefined;
      throw error;
    }
    onEvent('ready');
  };

  const ensure = async (): Promise<void> => {
    if (isRunning()) return;
    await launch();
  };

  const attach = async (targetId: string): Promise<string> => {
    const live = client;
    if (live === undefined) throw new Error('The Bot Browser is not running');
    const existing = sessions.get(targetId);
    if (existing !== undefined) return existing;
    const info = await live.send('Target.attachToTarget', { targetId, flatten: true });
    const sessionId = typeof info['sessionId'] === 'string' ? info['sessionId'] : '';
    if (sessionId === '') throw new Error('The Bot Browser did not attach a debugging session');
    sessions.set(targetId, sessionId);
    return sessionId;
  };

  const evaluate = async (sessionId: string, expression: string): Promise<unknown> => {
    const live = client;
    if (live === undefined) throw new Error('The Bot Browser is not running');
    const result = await live.send(
      'Runtime.evaluate',
      { expression, returnByValue: true },
      sessionId,
    );
    const remote = result['result'];
    if (typeof remote !== 'object' || remote === null) return undefined;
    return (remote as { value?: unknown }).value;
  };

  const waitForReady = async (sessionId: string): Promise<void> => {
    const deadline = Date.now() + READY_TIMEOUT_MS;
    let complete = false;
    for (;;) {
      let value: unknown;
      try {
        value = await evaluate(sessionId, 'document.readyState');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!/execution context was destroyed|cannot find context/iu.test(message)) throw error;
      }
      if (String(value) === 'complete') {
        if (complete) return;
        complete = true;
      } else {
        complete = false;
      }
      if (Date.now() >= deadline) {
        throw new Error(
          `Bot Browser page did not settle within ${READY_TIMEOUT_MS}ms after the action; it may have already run. Call browser_observe to inspect the current page before retrying`,
        );
      }
      await delay(READY_POLL_MS);
    }
  };

  const asObject = (value: unknown): Record<string, unknown> | undefined =>
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined;

  const readPage = async (sessionId: string): Promise<{ url: string; title: string }> => {
    const value = asObject(
      await evaluate(sessionId, '({ url: location.href, title: document.title })').catch(
        () => undefined,
      ),
    );
    return {
      url: typeof value?.['url'] === 'string' ? value['url'] : 'about:blank',
      title: typeof value?.['title'] === 'string' ? value['title'] : '',
    };
  };

  const selectorExpression = (ref: string): string =>
    `document.querySelector(${JSON.stringify(`[data-botharness-ref=${JSON.stringify(ref)}]`)})`;

  const clickScript = (ref: string): string =>
    `(() => { const el = ${selectorExpression(ref)}; if (!el) return { ok: false, reason: 'stale-ref' }; el.scrollIntoView({ block: 'center', inline: 'center' }); const rect = el.getBoundingClientRect(); if (rect.width < 1 || rect.height < 1) return { ok: false, reason: 'not-clickable' }; return { ok: true, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }; })()`;

  const prepareInput = async (sessionId: string): Promise<void> => {
    const live = client;
    if (live === undefined) throw new Error('The Bot Browser is not running');
    if (!focusEmulated.has(sessionId)) {
      await live.send('Emulation.setFocusEmulationEnabled', { enabled: true }, sessionId);
      focusEmulated.add(sessionId);
    }
  };

  const dispatchMouseClick = async (sessionId: string, x: number, y: number): Promise<void> => {
    const live = client;
    if (live === undefined) throw new Error('The Bot Browser is not running');
    await prepareInput(sessionId);
    await live.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }, sessionId);
    await live.send(
      'Input.dispatchMouseEvent',
      { type: 'mousePressed', x, y, button: 'left', clickCount: 1 },
      sessionId,
    );
    await live.send(
      'Input.dispatchMouseEvent',
      { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 },
      sessionId,
    );
  };

  const clickRef = async (sessionId: string, ref: string): Promise<void> => {
    const value = asObject(await evaluate(sessionId, clickScript(ref)));
    if (value === undefined || value['ok'] !== true) {
      const reason =
        value !== undefined && typeof value['reason'] === 'string' ? value['reason'] : 'failed';
      if (reason === 'stale-ref') {
        throw new Error('The element ref is stale; call browser_observe again before acting');
      }
      throw new Error(`The Bot Browser action failed: ${reason}`);
    }
    const x = typeof value['x'] === 'number' ? value['x'] : 0;
    const y = typeof value['y'] === 'number' ? value['y'] : 0;
    await dispatchMouseClick(sessionId, x, y);
  };

  const typeScript = (ref: string, text: string): string =>
    `(() => { const el = ${selectorExpression(ref)}; if (!el) return { ok: false, reason: 'stale-ref' }; if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) { if (el.matches(':disabled')) return { ok: false, reason: 'disabled' }; if (el.readOnly) return { ok: false, reason: 'readonly' }; } el.focus(); if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) { const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; const descriptor = Object.getOwnPropertyDescriptor(proto, 'value'); const setter = descriptor && descriptor.set; if (setter) { setter.call(el, ${JSON.stringify(text)}); } else { el.value = ${JSON.stringify(text)}; } el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return { ok: true }; } if (el.isContentEditable) { el.textContent = ${JSON.stringify(text)}; el.dispatchEvent(new InputEvent('input', { bubbles: true, data: ${JSON.stringify(text)} })); return { ok: true }; } return { ok: false, reason: 'not-editable' }; })()`;

  const runInteraction = async (tabId: string, expression: string): Promise<BrowserTab> => {
    const sessionId = await attach(tabId);
    const value = asObject(await evaluate(sessionId, expression));
    if (value !== undefined && value['ok'] !== true) {
      const reason = typeof value['reason'] === 'string' ? value['reason'] : 'failed';
      if (reason === 'stale-ref') {
        throw new Error('The element ref is stale; call browser_observe again before acting');
      }
      if (reason === 'readonly' || reason === 'disabled') {
        throw new Error(`The referenced field is ${reason}; choose an editable field`);
      }
      if (reason === 'not-editable') {
        throw new Error('The referenced element is not an editable field');
      }
      throw new Error(`The Bot Browser action failed: ${reason}`);
    }
    await waitForReady(sessionId);
    const page = await readPage(sessionId);
    lastUrl = page.url;
    return { tabId, url: page.url, title: page.title };
  };

  const click = async (tabId: string, ref: string): Promise<BrowserTab> => {
    const sessionId = await attach(tabId);
    await clickRef(sessionId, ref);
    await waitForReady(sessionId);
    const page = await readPage(sessionId);
    lastUrl = page.url;
    return { tabId, url: page.url, title: page.title };
  };

  const clickAt = async (tabId: string, x: number, y: number): Promise<BrowserTab> => {
    const sessionId = await attach(tabId);
    const bounds = asObject(
      await evaluate(sessionId, '({ width: window.innerWidth, height: window.innerHeight })'),
    );
    const width = typeof bounds?.['width'] === 'number' ? bounds['width'] : undefined;
    const height = typeof bounds?.['height'] === 'number' ? bounds['height'] : undefined;
    if (
      width !== undefined &&
      height !== undefined &&
      (x < 0 || y < 0 || x >= width || y >= height)
    ) {
      throw new Error(
        `The coordinates ${Math.round(x)},${Math.round(y)} are outside the viewport (${width}x${height}); take a fresh browser_screenshot and use its coordinates`,
      );
    }
    await dispatchMouseClick(sessionId, x, y);
    await waitForReady(sessionId);
    const page = await readPage(sessionId);
    lastUrl = page.url;
    return { tabId, url: page.url, title: page.title };
  };

  const type = (tabId: string, ref: string, text: string): Promise<BrowserTab> =>
    runInteraction(tabId, typeScript(ref, text));

  const pressKey = async (tabId: string, key: string): Promise<BrowserTab> => {
    const { text, ...definition } = browserKey(key);
    const sessionId = await attach(tabId);
    const live = client;
    if (!live) throw new Error('Bot Browser is not connected');
    await prepareInput(sessionId);
    const release = (): Promise<Record<string, unknown>> =>
      live.send('Input.dispatchKeyEvent', { type: 'keyUp', ...definition }, sessionId);
    try {
      await live.send(
        'Input.dispatchKeyEvent',
        {
          type: text ? 'keyDown' : 'rawKeyDown',
          ...definition,
          ...(text ? { text, unmodifiedText: text } : {}),
        },
        sessionId,
      );
    } catch (error) {
      await release().catch(() => undefined);
      throw error;
    }
    await release();
    await waitForReady(sessionId);
    const page = await readPage(sessionId);
    lastUrl = page.url;
    return { tabId, ...page };
  };

  const scroll = async (
    tabId: string,
    direction: 'up' | 'down',
    amount: number,
  ): Promise<BrowserTab> => {
    const sessionId = await attach(tabId);
    const bounds = asObject(
      await evaluate(sessionId, '({ width: window.innerWidth, height: window.innerHeight })'),
    );
    const width = bounds?.['width'];
    const height = bounds?.['height'];
    if (
      typeof width !== 'number' ||
      typeof height !== 'number' ||
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width <= 0 ||
      height <= 0
    ) {
      throw new Error('The Bot Browser viewport is unavailable; observe again before scrolling');
    }
    const live = client;
    if (!live) throw new Error('The Bot Browser is not running');
    await prepareInput(sessionId);
    await live.send(
      'Input.dispatchMouseEvent',
      { type: 'mouseMoved', x: width / 2, y: height / 2 },
      sessionId,
    );
    await live.send(
      'Input.dispatchMouseEvent',
      {
        type: 'mouseWheel',
        x: width / 2,
        y: height / 2,
        deltaX: 0,
        deltaY: direction === 'down' ? amount : -amount,
      },
      sessionId,
    );
    await waitForReady(sessionId);
    const page = await readPage(sessionId);
    lastUrl = page.url;
    return { tabId, ...page };
  };

  const open = async (url: string, reuseTabId?: string): Promise<BrowserTab> => {
    await ensure();
    const live = client;
    if (live === undefined) throw new Error('The Bot Browser is not running');
    let targetId = reuseTabId;
    if (targetId !== undefined) {
      try {
        await live.send('Target.getTargetInfo', { targetId });
      } catch {
        targetId = undefined;
      }
    }
    if (targetId === undefined) return openTarget(url, false);
    return navigateTab(targetId, url);
  };

  const navigateTab = async (targetId: string, url: string): Promise<BrowserTab> => {
    const live = client;
    if (live === undefined) throw new Error('The Bot Browser is not running');
    const sessionId = await attach(targetId);
    const navigation = await live.send('Page.navigate', { url }, sessionId);
    if (typeof navigation['errorText'] === 'string' && navigation['errorText'] !== '') {
      throw new Error(
        `Bot Browser navigation failed (${navigation['errorText']}); retry browser_open with a reachable URL`,
      );
    }
    await waitForReady(sessionId);
    const page = await readPage(sessionId);
    lastUrl = page.url;
    return { tabId: targetId, url: page.url, title: page.title };
  };

  const openTarget = async (url: string, newWindow: boolean): Promise<BrowserTab> => {
    const live = client;
    if (live === undefined) throw new Error('The Bot Browser is not running');
    const created = await live.send('Target.createTarget', {
      url: 'about:blank',
      newWindow,
      ...(newWindow ? {} : { background: true, focus: false }),
    });
    const targetId = typeof created['targetId'] === 'string' ? created['targetId'] : '';
    if (targetId === '') throw new Error('The Bot Browser did not open a tab');
    try {
      return await navigateTab(targetId, url);
    } catch (error) {
      const started = Date.now();
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          live.send('Target.closeTarget', { targetId }).then((closed) => {
            if (closed['success'] === false) throw new Error('Navigation cleanup was refused');
            sessions.delete(targetId);
          }),
          new Promise<never>((_resolve, reject) => {
            timeout = setTimeout(() => reject(new Error('Navigation cleanup timed out')), 2000);
          }),
        ]);
      } catch {
        onEvent(
          `navigation cleanup failed initiator=navigation phase=new-target outcome=error reason=cleanup-unavailable durationMs=${Date.now() - started}`,
        );
      } finally {
        clearTimeout(timeout);
      }
      throw error;
    }
  };

  const createTab = async (url: string): Promise<BrowserTab> => {
    await ensure();
    return openTarget(url, false);
  };

  const uploadFile = async (
    tabId: string,
    options: { ref?: string; path: string },
  ): Promise<void> => {
    const live = client;
    if (live === undefined) throw new Error('The Bot Browser is not running');
    if (!existsSync(options.path)) {
      throw new Error(`The file does not exist on the Host: ${options.path}`);
    }
    const sessionId = await attach(tabId);
    const documentRoot = async (): Promise<number> => {
      const document = await live.send('DOM.getDocument', {}, sessionId);
      const rootId = asObject(document['root'])?.['nodeId'];
      if (typeof rootId !== 'number') throw new Error('The Bot Browser returned no document');
      return rootId;
    };
    if (options.ref !== undefined) {
      const target = asObject(
        await evaluate(
          sessionId,
          `(() => { const el = ${selectorExpression(options.ref)}; if (!el) return { ok: false, reason: 'stale-ref' }; return { ok: true, fileInput: el instanceof HTMLInputElement && el.type === 'file' }; })()`,
        ),
      );
      if (target?.['ok'] !== true) {
        throw new Error('The element ref is stale; call browser_observe again before acting');
      }
      if (target['fileInput'] === true) {
        const found = await live.send(
          'DOM.querySelector',
          {
            nodeId: await documentRoot(),
            selector: `input[type="file"][data-botharness-ref=${JSON.stringify(options.ref)}]`,
          },
          sessionId,
        );
        const nodeId = found['nodeId'];
        if (typeof nodeId !== 'number' || !Number.isInteger(nodeId) || nodeId <= 0) {
          throw new Error(
            'The referenced file input is unavailable; call browser_observe again before uploading',
          );
        }
        await live.send('DOM.setFileInputFiles', { files: [options.path], nodeId }, sessionId);
        return;
      }
    }
    await live.send('Page.setInterceptFileChooserDialog', { enabled: true }, sessionId);
    try {
      if (options.ref !== undefined) {
        await clickRef(sessionId, options.ref);
      }
      const findInput = async (): Promise<number | undefined> => {
        const found = await live.send(
          'DOM.querySelectorAll',
          { nodeId: await documentRoot(), selector: 'input[type="file"]' },
          sessionId,
        );
        const nodeIds = Array.isArray(found['nodeIds'])
          ? (found['nodeIds'] as readonly unknown[]).filter(
              (value): value is number => typeof value === 'number',
            )
          : [];
        return nodeIds[nodeIds.length - 1];
      };
      let nodeId = await findInput();
      if (nodeId === undefined && options.ref !== undefined) {
        for (let attempt = 0; attempt < 10 && nodeId === undefined; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 200));
          nodeId = await findInput();
        }
      }
      if (nodeId === undefined) {
        throw new Error(
          'The page has no file input; click the upload control first so the page creates one, then retry',
        );
      }
      await live.send('DOM.setFileInputFiles', { files: [options.path], nodeId }, sessionId);
    } finally {
      await live
        .send('Page.setInterceptFileChooserDialog', { enabled: false }, sessionId)
        .catch(() => undefined);
    }
  };

  const listTabs = async (): Promise<
    readonly { targetId: string; url: string; title: string }[]
  > => {
    const live = client;
    if (live === undefined) throw new Error('The Bot Browser is not running');
    const result = await live.send('Target.getTargets', {});
    const infos = Array.isArray(result['targetInfos'])
      ? (result['targetInfos'] as readonly Record<string, unknown>[])
      : [];
    return infos
      .filter((info) => info['type'] === 'page' && typeof info['targetId'] === 'string')
      .map((info) => ({
        targetId: String(info['targetId']),
        url: typeof info['url'] === 'string' ? info['url'] : '',
        title: typeof info['title'] === 'string' ? info['title'] : '',
      }));
  };

  const tabInfo = async (targetId: string): Promise<{ url: string; title: string }> => {
    const live = client;
    if (live === undefined) throw new Error('The Bot Browser is not running');
    const result = await live.send('Target.getTargetInfo', { targetId });
    const info = asObject(result['targetInfo']);
    return {
      url: typeof info?.['url'] === 'string' ? info['url'] : '',
      title: typeof info?.['title'] === 'string' ? info['title'] : '',
    };
  };

  const closeTab = async (targetId: string): Promise<void> => {
    const live = client;
    if (live === undefined) throw new Error('The Bot Browser is not running');
    await live.send('Target.closeTarget', { targetId });
    sessions.delete(targetId);
  };

  const observe = async (tabId: string): Promise<BrowserObservation> => {
    const sessionId = await attach(tabId);
    const value = asObject(await evaluate(sessionId, SNAPSHOT_SCRIPT));
    if (value === undefined) throw new Error('The Bot Browser returned no page state');
    const elements = Array.isArray(value['elements'])
      ? (value['elements'] as readonly BrowserElement[])
      : [];
    const url = typeof value['url'] === 'string' ? value['url'] : 'about:blank';
    lastUrl = url;
    return {
      url,
      title: typeof value['title'] === 'string' ? value['title'] : '',
      elements,
      text: typeof value['text'] === 'string' ? value['text'] : '',
    };
  };

  const focusEmulated = new Set<string>();

  const captureScreenshot = async (
    tabId: string,
  ): Promise<{ data: string; mimeType: string } | undefined> => {
    const sessionId = await attach(tabId);
    const live = client;
    if (live === undefined) throw new Error('The Bot Browser is not running');
    const metrics = await live.send('Page.getLayoutMetrics', {}, sessionId).catch(() => undefined);
    const clip = asObject(metrics?.['cssVisualViewport']);
    const viewport =
      clip !== undefined &&
      typeof clip['clientWidth'] === 'number' &&
      typeof clip['clientHeight'] === 'number'
        ? { width: clip['clientWidth'], height: clip['clientHeight'] }
        : undefined;
    const capture = async (): Promise<string | undefined> => {
      const result = await live.send(
        'Page.captureScreenshot',
        {
          format: 'jpeg',
          quality: 60,
          fromSurface: true,
          ...(clip === undefined ||
          typeof clip['clientWidth'] !== 'number' ||
          typeof clip['clientHeight'] !== 'number' ||
          clip['clientWidth'] <= 0
            ? {}
            : {
                clip: {
                  x: typeof clip['pageX'] === 'number' ? clip['pageX'] : 0,
                  y: typeof clip['pageY'] === 'number' ? clip['pageY'] : 0,
                  width: clip['clientWidth'],
                  height: clip['clientHeight'],
                  scale: 1,
                },
              }),
        },
        sessionId,
      );
      return typeof result['data'] === 'string' && result['data'] !== ''
        ? result['data']
        : undefined;
    };
    const withMeta = (
      data: string,
    ): {
      data: string;
      mimeType: string;
      viewport?: { width: number; height: number };
      image?: { width: number; height: number };
    } => {
      const image = jpegDimensions(data);
      return {
        data,
        mimeType: 'image/jpeg',
        ...(viewport === undefined ? {} : { viewport }),
        ...(image === undefined ? {} : { image }),
      };
    };
    try {
      const data = await capture();
      if (data !== undefined) return withMeta(data);
    } catch {
      void 0;
    }
    await prepareInput(sessionId).catch(() => undefined);
    const data = await capture().catch(() => undefined);
    return data === undefined ? undefined : withMeta(data);
  };

  const openWindow = async (existingTargetId?: string): Promise<BrowserTab> => {
    await ensure();
    const live = client;
    if (live === undefined) throw new Error('The Bot Browser is not running');
    let targetId = existingTargetId;
    if (targetId === undefined) {
      const created = await live.send('Target.createTarget', {
        url: 'about:blank',
        newWindow: true,
      });
      targetId = typeof created['targetId'] === 'string' ? created['targetId'] : '';
      if (targetId === '') throw new Error('The Bot Browser did not open a window');
    }
    const sessionId = await attach(targetId);
    const window = await live.send('Browser.getWindowForTarget', { targetId });
    if (asObject(window['bounds'])?.['windowState'] === 'minimized') {
      await live.send('Browser.setWindowBounds', {
        windowId: window['windowId'],
        bounds: { windowState: 'normal' },
      });
    }
    await live.send('Target.activateTarget', { targetId });
    await live.send('Page.bringToFront', {}, sessionId);
    return { tabId: targetId, ...(await tabInfo(targetId)) };
  };

  const stop = async (): Promise<void> => {
    const proc = child;
    const live = client;
    child = undefined;
    client = undefined;
    sessions.clear();
    live?.close();
    if (proc === undefined || proc.exitCode !== null) {
      if (proc !== undefined) onEvent('stopped');
      return;
    }
    await new Promise<void>((resolve) => {
      const done = setTimeout(() => {
        proc.kill('SIGKILL');
        resolve();
      }, 4_000);
      proc.once('exit', () => {
        clearTimeout(done);
        resolve();
      });
      proc.kill('SIGTERM');
    });
    onEvent('stopped');
  };

  return {
    ensure,
    isRunning,
    open,
    observe,
    click,
    clickAt,
    type,
    pressKey,
    scroll,
    uploadFile,
    createTab,
    listTabs,
    tabInfo,
    closeTab,
    captureScreenshot,
    openWindow,
    currentUrl: () => lastUrl,
    binaryPath: () => binary,
    stop,
  };
}
