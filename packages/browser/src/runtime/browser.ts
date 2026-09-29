import { spawn, type ChildProcess } from 'node:child_process';
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
  type(tabId: string, ref: string, text: string): Promise<BrowserTab>;
  pressKey(tabId: string, key: string): Promise<BrowserTab>;
  scroll(tabId: string, direction: 'up' | 'down', amount: number): Promise<BrowserTab>;
  uploadFile(tabId: string, options: { ref?: string; path: string }): Promise<void>;
  createTab(url: string): Promise<BrowserTab>;
  listTabs(): Promise<readonly { targetId: string; url: string; title: string }[]>;
  tabInfo(targetId: string): Promise<{ url: string; title: string }>;
  closeTab(targetId: string): Promise<void>;
  captureScreenshot(tabId: string): Promise<{ data: string; mimeType: string } | undefined>;
  openWindow(): Promise<BrowserTab>;
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

const SNAPSHOT_SCRIPT = `(() => {
  const elements = [];
  const wanted = 'a[href],button,input,textarea,select,summary,[role],[contenteditable="true"]';
  for (const el of document.querySelectorAll(wanted)) {
    if (elements.length >= 200) break;
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) continue;
    const ref = 'e' + (elements.length + 1);
    el.setAttribute('data-botharness-ref', ref);
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute('role') || tag;
    const raw = el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('name') || (el.innerText || el.value || '');
    const name = String(raw).trim().replace(/\\s+/g, ' ').slice(0, 80);
    elements.push({ ref: ref, role: role, name: name });
  }
  const text = (document.body ? document.body.innerText : '').replace(/\\s+/g, ' ').trim().slice(0, 6000);
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
    for (;;) {
      try {
        const value = await evaluate(sessionId, 'document.readyState');
        if (String(value) === 'complete') return;
      } catch {
        return;
      }
      if (Date.now() >= deadline) return;
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
    `(() => { const el = ${selectorExpression(ref)}; if (!el) return { ok: false, reason: 'stale-ref' }; el.scrollIntoView({ block: 'center', inline: 'center' }); el.click(); return { ok: true }; })()`;

  const typeScript = (ref: string, text: string): string =>
    `(() => { const el = ${selectorExpression(ref)}; if (!el) return { ok: false, reason: 'stale-ref' }; el.focus(); if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) { const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; const descriptor = Object.getOwnPropertyDescriptor(proto, 'value'); const setter = descriptor && descriptor.set; if (setter) { setter.call(el, ${JSON.stringify(text)}); } else { el.value = ${JSON.stringify(text)}; } el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return { ok: true }; } if (el.isContentEditable) { el.textContent = ${JSON.stringify(text)}; el.dispatchEvent(new InputEvent('input', { bubbles: true, data: ${JSON.stringify(text)} })); return { ok: true }; } return { ok: false, reason: 'not-editable' }; })()`;

  const pressKeyScript = (key: string): string =>
    `(() => { const el = document.activeElement || document.body; const opts = { key: ${JSON.stringify(key)}, bubbles: true, cancelable: true }; el.dispatchEvent(new KeyboardEvent('keydown', opts)); el.dispatchEvent(new KeyboardEvent('keypress', opts)); el.dispatchEvent(new KeyboardEvent('keyup', opts)); return { ok: true }; })()`;

  const scrollScript = (direction: 'up' | 'down', amount: number): string =>
    `(() => { window.scrollBy(0, ${direction === 'down' ? amount : -amount}); return { ok: true }; })()`;

  const runInteraction = async (tabId: string, expression: string): Promise<BrowserTab> => {
    const sessionId = await attach(tabId);
    const value = asObject(await evaluate(sessionId, expression));
    if (value !== undefined && value['ok'] !== true) {
      const reason = typeof value['reason'] === 'string' ? value['reason'] : 'failed';
      if (reason === 'stale-ref') {
        throw new Error('The element ref is stale; call browser_observe again before acting');
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

  const click = (tabId: string, ref: string): Promise<BrowserTab> =>
    runInteraction(tabId, clickScript(ref));

  const type = (tabId: string, ref: string, text: string): Promise<BrowserTab> =>
    runInteraction(tabId, typeScript(ref, text));

  const pressKey = (tabId: string, key: string): Promise<BrowserTab> =>
    runInteraction(tabId, pressKeyScript(key));

  const scroll = (tabId: string, direction: 'up' | 'down', amount: number): Promise<BrowserTab> =>
    runInteraction(tabId, scrollScript(direction, amount));

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
    const sessionId = await attach(targetId);
    await live.send('Page.navigate', { url }, sessionId);
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
    const sessionId = await attach(targetId);
    await live.send('Page.navigate', { url }, sessionId);
    await waitForReady(sessionId);
    const page = await readPage(sessionId);
    lastUrl = page.url;
    return { tabId: targetId, url: page.url, title: page.title };
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
    await live.send('Page.setInterceptFileChooserDialog', { enabled: true }, sessionId);
    try {
      if (options.ref !== undefined) {
        const value = asObject(await evaluate(sessionId, clickScript(options.ref)));
        if (value !== undefined && value['ok'] !== true) {
          throw new Error('The element ref is stale; call browser_observe again before acting');
        }
      }
      const findInput = async (): Promise<number | undefined> => {
        const document = await live.send('DOM.getDocument', {}, sessionId);
        const rootId = asObject(document['root'])?.['nodeId'];
        if (typeof rootId !== 'number') throw new Error('The Bot Browser returned no document');
        const found = await live.send(
          'DOM.querySelectorAll',
          { nodeId: rootId, selector: 'input[type="file"]' },
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
    const capture = async (): Promise<string | undefined> => {
      const result = await live.send(
        'Page.captureScreenshot',
        { format: 'jpeg', quality: 60, fromSurface: true },
        sessionId,
      );
      return typeof result['data'] === 'string' && result['data'] !== ''
        ? result['data']
        : undefined;
    };
    try {
      const data = await capture();
      if (data !== undefined) return { data, mimeType: 'image/jpeg' };
    } catch {
      void 0;
    }
    if (!focusEmulated.has(sessionId)) {
      await live
        .send('Emulation.setFocusEmulationEnabled', { enabled: true }, sessionId)
        .catch(() => undefined);
      focusEmulated.add(sessionId);
    }
    const data = await capture().catch(() => undefined);
    return data === undefined ? undefined : { data, mimeType: 'image/jpeg' };
  };

  const openWindow = async (): Promise<BrowserTab> => {
    await ensure();
    const live = client;
    if (live === undefined) throw new Error('The Bot Browser is not running');
    const created = await live.send('Target.createTarget', { url: 'about:blank', newWindow: true });
    const targetId = typeof created['targetId'] === 'string' ? created['targetId'] : '';
    if (targetId === '') throw new Error('The Bot Browser did not open a window');
    await attach(targetId);
    return { tabId: targetId, url: 'about:blank', title: '' };
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
