import { profilePage } from './page.mjs';
const KEY = 'profileBinding';
let polling = false;
let activePoll;
let currentEpoch;
let clientId = crypto.randomUUID();
const selected = new Map();
const observed = new Map();
const read = async () => (await chrome.storage.local.get(KEY))[KEY];
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
    throw new Error('Use the local BotHarness address');
  return url.origin;
}
async function request(config, action, body = {}, signal) {
  const response = await fetch(`${hostOrigin(config.host)}/botharness-browser/profile/${action}`, {
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
  });
  const reply = await response.json();
  if (!response.ok || !reply.ok) throw new Error('Profile connection unavailable');
  return reply.value;
}
const tabs = async () =>
  (await chrome.tabs.query({})).filter(
    (tab) => !tab.incognito && /^https?:\/\//u.test(tab.url ?? '') && tab.id !== undefined,
  );
const invalidate = () => {
  selected.clear();
  observed.clear();
};
async function page(tabId, method, slug, ref = '', text = '') {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: profilePage,
    args: [method, slug, ref, text],
  });
  if (!results[0] || results[0].result === undefined) throw new Error('Page command failed');
  if (results[0].result?.error) throw new Error(results[0].result.error);
  return results[0];
}
async function execute(command) {
  const { slug, method, args } = command;
  if (typeof slug !== 'string' || !args || typeof args !== 'object')
    throw new Error('Invalid command');
  if (method === 'invalidate') {
    const id = selected.get(slug);
    observed.delete(slug);
    if (id !== undefined) await page(id, 'invalidate', slug).catch(() => undefined);
    return null;
  }
  if (method === 'tabs') {
    const live = await tabs();
    if (args.action === 'list')
      return live.map((tab) => ({
        targetId: String(tab.id),
        url: tab.url.slice(0, 2048),
        title: (tab.title ?? '').slice(0, 500),
        current: selected.get(slug) === tab.id,
      }));
    if (args.action !== 'select') throw new Error('Profile tabs supports list/select only');
    const tab = live.find((tab) => String(tab.id) === args.targetId);
    if (!tab) throw new Error('Ordinary webpage tab unavailable');
    selected.set(slug, tab.id);
    observed.delete(slug);
    return { url: tab.url, title: tab.title };
  }
  const id = selected.get(slug);
  const live = await tabs();
  const tab = live.find((tab) => tab.id === id);
  if (!tab) throw new Error('Select an ordinary webpage tab first');
  if (method === 'open') {
    if (typeof args.url !== 'string' || !/^https?:\/\//u.test(args.url))
      throw new Error('HTTP(S) URL required');
    observed.delete(slug);
    await chrome.tabs.update(id, { url: args.url });
    return { url: args.url };
  }
  if (method === 'observe') {
    const reply = await page(id, 'observe', slug);
    observed.set(slug, {
      id,
      documentId: reply.documentId,
      refs: new Set(reply.result.elements.map((item) => item.ref)),
    });
    return reply.result;
  }
  if (!['type', 'click'].includes(method)) throw new Error('Unsupported Profile command');
  const snapshot = observed.get(slug);
  if (snapshot?.id !== id || !snapshot.refs.has(args.ref))
    throw new Error('Observe the selected tab first');
  if (method === 'type' && (typeof args.text !== 'string' || args.text.length > 20_000))
    throw new Error('Invalid text');
  await chrome.tabs.update(id, { active: true });
  await chrome.windows.update(tab.windowId, { focused: true });
  const prepared = await page(id, `prepare-${method}`, slug, args.ref);
  if (prepared.documentId !== snapshot.documentId) {
    observed.delete(slug);
    throw new Error('Document changed');
  }
  const target = { tabId: id };
  let attached = false;
  try {
    await chrome.debugger.attach(target, '1.3');
    attached = true;
    const check = await page(id, method === 'click' ? 'click' : 'type', slug, args.ref);
    if (check.documentId !== snapshot.documentId) throw new Error('Document changed');
    if (method === 'type')
      await chrome.debugger.sendCommand(target, 'Input.insertText', { text: args.text });
    else {
      await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: check.result.x,
        y: check.result.y,
      });
      await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x: check.result.x,
        y: check.result.y,
        button: 'left',
        clickCount: 1,
      });
      await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: check.result.x,
        y: check.result.y,
        button: 'left',
        clickCount: 1,
      });
    }
    return { url: prepared.result.url };
  } finally {
    observed.clear();
    if (attached) await chrome.debugger.detach(target).catch(() => undefined);
    await page(id, 'finish', slug).catch(() => undefined);
  }
}
async function poll() {
  if (polling) return;
  polling = true;
  clientId = crypto.randomUUID();
  try {
    for (;;) {
      const config = await read();
      if (!config) return;
      try {
        activePoll = new AbortController();
        const command = await request(
          config,
          'poll',
          { count: (await tabs()).length, clientId },
          activePoll.signal,
        );
        if ((await read())?.token !== config.token) {
          invalidate();
          continue;
        }
        if (command.epoch !== currentEpoch) {
          currentEpoch = command.epoch;
          invalidate();
        }
        if (!command.id) continue;
        let value;
        let error;
        try {
          value = await execute(command);
        } catch (failure) {
          const reasons = [
            'Stale or unavailable ref',
            'Element is covered',
            'Document changed',
            'Observe the selected tab first',
            'Input focus unavailable',
            'Page command failed',
          ];
          const reason =
            reasons.find((value) => String(failure).includes(value)) ?? 'Chrome command failed';
          error = reason;
        }
        await request(config, 'result', {
          id: command.id,
          epoch: command.epoch,
          ...(error ? { error } : { value }),
        });
      } catch {
        if (activePoll?.signal.aborted && (await read())?.token === config.token) continue;
        invalidate();
        await chrome.action.setBadgeText({ text: 'OFF' });
        return;
      }
      await chrome.action.setBadgeText({ text: 'ON' });
    }
  } finally {
    polling = false;
  }
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL('popup.html'))
    return false;
  const handle = async () => {
    if (message.action === 'status') return { paired: Boolean(await read()) };
    if (message.action === 'forget') {
      const config = await read();
      if (config) await request(config, 'forget').catch(() => undefined);
      await chrome.storage.local.remove(KEY);
      activePoll?.abort();
      invalidate();
      return null;
    }
    if (message.action === 'reconnect') {
      clientId = crypto.randomUUID();
      activePoll?.abort();
      invalidate();
      void poll();
      return null;
    }
    if (message.action !== 'pair' || message.consent !== true)
      throw new Error('Explicit Profile control consent required');
    const host = hostOrigin(message.host);
    clientId = crypto.randomUUID();
    const result = await request({ host }, 'pair', { code: message.code });
    await chrome.storage.local.set({ [KEY]: { host, token: result.token } });
    invalidate();
    void poll();
    return null;
  };
  handle().then(
    (value) => reply({ ok: true, value }),
    () =>
      reply({ ok: false, error: 'Connection failed; check the local address and pairing code' }),
  );
  return true;
});
chrome.tabs.onUpdated.addListener((id, change) => {
  if (change.status === 'loading' || change.url)
    for (const [slug, snapshot] of observed) if (snapshot.id === id) observed.delete(slug);
});
chrome.tabs.onRemoved.addListener((id) => {
  for (const [slug, tab] of selected)
    if (tab === id) {
      selected.delete(slug);
      observed.delete(slug);
    }
});
chrome.alarms.onAlarm.addListener(() => {
  void poll();
});
chrome.runtime.onStartup.addListener(() => {
  invalidate();
  void poll();
});
void chrome.alarms.create('profile-heartbeat', { periodInMinutes: 0.5 });
void poll();
