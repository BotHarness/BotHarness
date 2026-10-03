import { readPage } from './page.mjs';

const KEY = 'borrowedTab';
let polling = false;
let pendingPoll;
let generation = 0;
const read = async () => (await chrome.storage.session.get(KEY))[KEY];

function hostOrigin(value) {
  const url = new URL(value);
  if (
    url.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost'].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error('Use the local BotHarness address, for example http://127.0.0.1:3140');
  return url.origin;
}

async function request(config, action, body = {}, signal) {
  const response = await fetch(
    `${hostOrigin(config.host)}/botharness-browser/extension/${action}`,
    {
      method: 'POST',
      credentials: 'omit',
      cache: 'no-store',
      headers: {
        'content-type': 'application/json',
        ...(config.token ? { authorization: `Bearer ${config.token}` } : {}),
      },
      body: JSON.stringify(body),
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(25_000)])
        : AbortSignal.timeout(25_000),
    },
  );
  const result = await response.json();
  if (!response.ok || result.ok !== true)
    throw new Error(result.error ?? 'Browser connection unavailable');
  return result.value;
}

async function returnTab(config) {
  generation += 1;
  if ((await read())?.token === config.token) {
    await chrome.storage.session.remove(KEY);
    await chrome.action.setBadgeText({ text: '' });
  }
  if (pendingPoll?.token === config.token) pendingPoll.controller.abort();
  await request(config, 'return').catch(() => undefined);
}

async function poll() {
  if (polling) return;
  polling = true;
  try {
    for (;;) {
      const config = await read();
      if (config?.tabId === undefined) return;
      try {
        const controller = new AbortController();
        pendingPoll = { token: config.token, controller };
        const command = await request(config, 'poll', {}, controller.signal);
        pendingPoll = undefined;
        if ((await read())?.token !== config.token) continue;
        if (command === null) continue;
        if (
          command.method !== 'observe' ||
          command.tabId !== config.tabId ||
          command.url !== config.url
        )
          throw new Error('Borrowed page changed');
        const tab = await chrome.tabs.get(config.tabId);
        if (tab.url !== config.url) throw new Error('Borrowed page navigated');
        const results = await chrome.scripting.executeScript({
          target: { tabId: config.tabId },
          func: readPage,
        });
        const result = results[0];
        const current = await read();
        if (current?.token !== config.token) continue;
        if (!result || result.documentId !== config.documentId || result.result.url !== config.url)
          throw new Error('Borrowed document changed');
        await request(config, 'result', { id: command.id, observation: result.result });
      } catch {
        pendingPoll = undefined;
        if ((await read())?.token !== config.token) continue;
        await returnTab(config);
        return;
      }
    }
  } finally {
    polling = false;
    if ((await read())?.tabId !== undefined) void poll();
  }
}

async function handle(message) {
  if (message.action === 'status') {
    const config = await read();
    if (config === undefined) return null;
    const tabs =
      config.tabId === undefined
        ? await chrome.tabs.query({ active: true, currentWindow: true })
        : [];
    return {
      displayName: config.displayName,
      url: config.url ?? tabs[0]?.url ?? '',
      title: tabs[0]?.title ?? '',
      shared: config.tabId !== undefined,
    };
  }
  if (message.action === 'pair') {
    const existing = await read();
    if (existing !== undefined) await returnTab(existing);
    const host = hostOrigin(message.host);
    const result = await request({ host }, 'pair', { code: message.code });
    await chrome.storage.session.set({
      [KEY]: { host, token: result.token, displayName: result.displayName },
    });
    return { displayName: result.displayName };
  }
  const config = await read();
  if (config === undefined) throw new Error('Pair with BotHarness first');
  if (message.action === 'return') {
    await returnTab(config);
    return null;
  }
  if (message.action !== 'share' || config.tabId !== undefined)
    throw new Error('Invalid Browser action');
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (tab?.id === undefined || !/^https?:\/\//u.test(tab.url ?? ''))
    throw new Error('Open an ordinary web page, then click the extension icon');
  const sharingGeneration = generation;
  await chrome.storage.session.set({ [KEY]: { ...config, sharingTabId: tab.id } });
  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => location.href,
  });
  const result = results[0];
  if (sharingGeneration !== generation || result?.result !== tab.url || !result.documentId)
    throw new Error('Page changed; open the extension again');
  await request(config, 'share', {
    tabId: tab.id,
    url: tab.url,
    title: (tab.title ?? '').slice(0, 500),
  });
  const current = await read();
  if (sharingGeneration !== generation || current?.token !== config.token) {
    await request(config, 'return').catch(() => undefined);
    throw new Error('Borrowing was cancelled');
  }
  await chrome.storage.session.set({
    [KEY]: { ...config, tabId: tab.id, url: tab.url, documentId: result.documentId },
  });
  if (sharingGeneration !== generation) {
    await returnTab(config);
    throw new Error('Borrowing was cancelled');
  }
  await chrome.action.setBadgeText({ text: 'READ' });
  void poll();
  return { displayName: config.displayName, url: tab.url, shared: true };
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL('popup.html'))
    return false;
  handle(message).then(
    (value) => reply({ ok: true, value }),
    (error) => reply({ ok: false, error: error.message }),
  );
  return true;
});
chrome.tabs.onRemoved.addListener((id) => {
  void read().then((config) => {
    if (config?.tabId === id || config?.sharingTabId === id) return returnTab(config);
  });
});
chrome.tabs.onUpdated.addListener((id, change) => {
  if (change.status !== 'loading' && change.url === undefined) return;
  void read().then((config) => {
    if (config?.tabId === id || config?.sharingTabId === id) return returnTab(config);
  });
});
chrome.alarms.onAlarm.addListener(() => {
  void poll();
});
chrome.runtime.onStartup.addListener(() => {
  void chrome.storage.session.remove(KEY);
  void chrome.action.setBadgeText({ text: '' });
});
void chrome.alarms.create('borrow-heartbeat', { periodInMinutes: 0.5 });
void poll();
