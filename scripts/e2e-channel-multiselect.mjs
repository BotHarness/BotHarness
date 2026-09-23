// Live DSH tracer for #215: selection and bounded batch commands use the real sidebar and roster store.
import { createRequire } from 'node:module';
import { readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pnpm = resolve(root, 'node_modules/.pnpm');
const puppeteerDir = readdirSync(pnpm).find((entry) => entry.startsWith('puppeteer@'));
if (!puppeteerDir) throw new Error('Puppeteer is unavailable');
const puppeteer = createRequire(resolve(pnpm, puppeteerDir, 'node_modules/'))('puppeteer');
const token = process.env.BH_E2E_TOKEN;
if (!token) throw new Error('Set BH_E2E_TOKEN');
const origin = process.env.BH_E2E_ORIGIN ?? 'http://127.0.0.1:3103';
const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

async function rpc(page, method, args) {
  return page.evaluate(
    async ({ method, args }) => {
      const response = await fetch(`/api/botharness/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'client-request',
          rpcId: `multi-e2e-${Math.random()}`,
          method: `botharness/${method}`,
          payload: { args },
        }),
      });
      const envelope = await response.json();
      if (envelope.result?.ok !== true) throw new Error(JSON.stringify(envelope.result));
      return envelope.result.value;
    },
    { method, args },
  );
}

let page;
let originalHidden;
let originalPins;
let targetSectionId;
let pinnedMoveSectionId;
const batchRequests = [];
try {
  page = await browser.newPage();
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/botharness/rosterBatch') {
      batchRequests.push(request.url());
    }
  });
  await page.goto(`${origin}/?token=${encodeURIComponent(token)}`, {
    waitUntil: 'networkidle2',
    timeout: 60000,
  });
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'Continue')
      ?.click();
    Array.from(document.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'Configure later')
      ?.click();
    document.querySelector('button[aria-label="Open sidebar"]')?.click();
    document.querySelector('button[aria-label="Bot mode"], button[aria-label="BOT 模式"]')?.click();
  });
  await page.waitForSelector('button[aria-label="新建"], button[aria-label="New"]', {
    timeout: 15000,
  });

  await page.keyboard.down('Alt');
  await page.keyboard.press('Backquote');
  await page.keyboard.up('Alt');
  await page.waitForFunction(() => document.querySelector('.bh-region') === null);
  await page.keyboard.down('Alt');
  await page.keyboard.press('Backquote');
  await page.keyboard.up('Alt');
  await page.waitForSelector('.bh-region', { timeout: 10000 });

  const originalRoster = await rpc(page, 'rosterGet', {});
  originalHidden = originalRoster.hidden;
  originalPins = originalRoster.pins;
  const nonce = Date.now();
  const first = (await rpc(page, 'channelCreate', { name: `Multi-A-${nonce}`, members: [] }))
    .channel.id;
  const second = (await rpc(page, 'channelCreate', { name: `Multi-B-${nonce}`, members: [] }))
    .channel.id;
  const sectionName = `Multi-Section-${nonce}`;
  targetSectionId = (await rpc(page, 'sectionCreate', { name: sectionName })).section.id;
  await page.reload({ waitUntil: 'networkidle2' });
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'Configure later')
      ?.click();
    if (document.querySelector('.bh-root') !== null) return;
    document.querySelector('button[aria-label="Open sidebar"]')?.click();
    document.querySelector('button[aria-label="Bot mode"], button[aria-label="BOT 模式"]')?.click();
  });
  const selector = (id) => `button[data-channel-id="${id}"]`;
  await page.waitForSelector(selector(first), { timeout: 15000 });
  await page.waitForSelector(selector(second), { timeout: 15000 });
  await page.$eval(selector(first), (button) => button.scrollIntoView({ block: 'center' }));
  await page.$eval(selector(second), (button) => button.scrollIntoView({ block: 'center' }));
  await page.waitForFunction(
    (ids) =>
      ids.every((id) => {
        const button = document.querySelector(`button[data-channel-id="${id}"]`);
        const rect = button?.getBoundingClientRect();
        if (!rect) return false;
        const hit = document.elementFromPoint(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2,
        );
        return hit?.closest('[data-channel-id]')?.getAttribute('data-channel-id') === id;
      }),
    { timeout: 10000 },
    [first, second],
  );
  const shortcutFirst = await page.$eval('[data-channel-id][aria-keyshortcuts="Alt+1"]', (button) =>
    button.getAttribute('data-channel-id'),
  );
  if (!shortcutFirst) throw new Error('first channel shortcut hint missing');
  await page.keyboard.down('Alt');
  await page.waitForFunction(
    () => document.querySelector('[aria-keyshortcuts="Alt+1"] .bh-shortcut-badge') !== null,
  );
  await page.keyboard.press('1');
  await page.keyboard.up('Alt');
  await page.waitForFunction(
    (id) => document.querySelector(`[data-channel-id="${id}"]`)?.classList.contains('bh-selected'),
    { timeout: 5000 },
    shortcutFirst,
  );
  const shortcutTenth = await page.evaluate(() =>
    document
      .querySelector('[data-channel-id][aria-keyshortcuts="Alt+0"]')
      ?.getAttribute('data-channel-id'),
  );
  if (shortcutTenth) {
    await page.keyboard.down('Alt');
    await page.keyboard.press('0');
    await page.keyboard.up('Alt');
    await page.waitForFunction(
      (id) =>
        document.querySelector(`[data-channel-id="${id}"]`)?.classList.contains('bh-selected'),
      { timeout: 5000 },
      shortcutTenth,
    );
  }
  const shortcutSelected = shortcutTenth ?? shortcutFirst;
  await page.click('button[aria-label="Search"], button[aria-label="搜索"]');
  await page.focus('input.bh-search-input');
  await page.keyboard.down('Alt');
  await page.keyboard.press('1');
  await page.keyboard.up('Alt');
  const stillSelected = await page.$eval(`[data-channel-id="${shortcutSelected}"]`, (button) =>
    button.classList.contains('bh-selected'),
  );
  if (!stillSelected) throw new Error('shortcut hijacked the search input');
  await page.keyboard.press('Escape');
  await page.click(selector(first));
  await page.keyboard.down('Control');
  await page.click(selector(second));
  await page.keyboard.up('Control');
  await page.waitForFunction(
    (ids) =>
      ids.every(
        (id) =>
          document
            .querySelector(`button[data-channel-id="${id}"]`)
            ?.getAttribute('aria-pressed') === 'true',
      ),
    { timeout: 3000 },
    [first, second],
  );
  if (await page.$('.bh-selection-bar')) throw new Error('obsolete bulk toolbar is still visible');
  const selected = 2;
  await page.click(selector(second), { button: 'right' });
  await page.waitForFunction(
    () =>
      Array.from(document.querySelectorAll('[role="menu"] button')).some((button) =>
        /将 2 个频道 移动到|Move 2 channels to/u.test(button.textContent ?? ''),
      ),
    { timeout: 5000 },
  );
  await page.evaluate(() => {
    const move = Array.from(document.querySelectorAll('[role="menu"] button')).find((button) =>
      /将 2 个频道 移动到|Move 2 channels to/u.test(button.textContent ?? ''),
    );
    if (!(move instanceof HTMLButtonElement)) throw new Error('bulk move action missing');
    move.click();
  });
  await page.waitForFunction(
    (name) =>
      Array.from(document.querySelectorAll('[role="menu"] button')).some(
        (button) => button.textContent?.trim() === name,
      ),
    { timeout: 5000 },
    sectionName,
  );
  await page.evaluate(
    ({ sectionId, ids }) => {
      const samples = [];
      const observer = new MutationObserver(() => {
        const section = document.querySelector(`[data-section-id="${sectionId}"]`);
        const visible = Array.from(section?.querySelectorAll('[data-channel-id]') ?? [])
          .map((row) => row.getAttribute('data-channel-id'))
          .filter((id) => ids.includes(id));
        if (visible.length > 0) samples.push(visible.join(','));
      });
      observer.observe(document.querySelector('.bh-root'), { childList: true, subtree: true });
      window.__bhBatchMoveObservation = { observer, samples };
    },
    { sectionId: targetSectionId, ids: [first, second] },
  );
  await page.evaluate((name) => {
    const target = Array.from(document.querySelectorAll('[role="menu"] button')).find(
      (button) => button.textContent?.trim() === name,
    );
    if (!(target instanceof HTMLButtonElement)) throw new Error('target section missing');
    target.click();
  }, sectionName);
  await page.waitForFunction(
    ({ sectionId, ids }) =>
      ids.every(
        (id) =>
          document.querySelector(`[data-section-id="${sectionId}"] [data-channel-id="${id}"]`) !==
          null,
      ),
    { timeout: 10000 },
    { sectionId: targetSectionId, ids: [first, second] },
  );
  const moved = (await rpc(page, 'rosterGet', {})).sections.find(
    (section) => section.id === targetSectionId,
  );
  if (!moved || ![first, second].every((id) => moved.channelIds.includes(id))) {
    throw new Error('batch move did not persist both channels');
  }
  await new Promise((resolve) => setTimeout(resolve, 100));
  const moveSamples = await page.evaluate(() => {
    const observation = window.__bhBatchMoveObservation;
    observation.observer.disconnect();
    return observation.samples;
  });
  if (
    moveSamples.length === 0 ||
    moveSamples.some((sample) => {
      const ids = sample.split(',');
      return ids.length !== 2 || ![first, second].every((id) => ids.includes(id));
    })
  ) {
    throw new Error(`batch move exposed intermediate DOM states: ${moveSamples.join(' | ')}`);
  }
  const pinnedMoveSectionName = `Pinned-Move-${nonce}`;
  pinnedMoveSectionId = (await rpc(page, 'sectionCreate', { name: pinnedMoveSectionName })).section
    .id;
  await page.reload({ waitUntil: 'networkidle2' });
  await page.evaluate(() => {
    if (document.querySelector('.bh-root') !== null) return;
    document.querySelector('button[aria-label="Open sidebar"]')?.click();
    document.querySelector('button[aria-label="Bot mode"], button[aria-label="BOT 模式"]')?.click();
  });
  await page.waitForSelector(selector(first), { timeout: 15000 });
  const selectPair = async () => {
    await page.$eval(selector(first), (button) => button.scrollIntoView({ block: 'center' }));
    await page.$eval(selector(second), (button) => button.scrollIntoView({ block: 'center' }));
    await page.waitForFunction(
      (ids) =>
        ids.every((id) => {
          const button = document.querySelector(`button[data-channel-id="${id}"]`);
          const rect = button?.getBoundingClientRect();
          if (!rect) return false;
          const hit = document.elementFromPoint(
            rect.left + rect.width / 2,
            rect.top + rect.height / 2,
          );
          return hit?.closest('[data-channel-id]')?.getAttribute('data-channel-id') === id;
        }),
      { timeout: 5000 },
      [first, second],
    );
    await page.click(selector(first));
    await page.keyboard.down('Control');
    await page.click(selector(second));
    await page.keyboard.up('Control');
    await page.waitForFunction(
      (ids) =>
        ids.every(
          (id) =>
            document
              .querySelector(`button[data-channel-id="${id}"]`)
              ?.getAttribute('aria-pressed') === 'true',
        ),
      { timeout: 3000 },
      [first, second],
    );
  };
  const pinPair = async () => {
    await selectPair();
    await page.click(selector(second), { button: 'right' });
    await page.waitForFunction(
      () =>
        Array.from(document.querySelectorAll('[role="menu"] button')).some((button) =>
          /置顶 2 个频道|Pin 2 channels/u.test(button.textContent ?? ''),
        ),
      { timeout: 5000 },
    );
    await page.evaluate(() => {
      const pin = Array.from(document.querySelectorAll('[role="menu"] button')).find((button) =>
        /置顶 2 个频道|Pin 2 channels/u.test(button.textContent ?? ''),
      );
      if (!(pin instanceof HTMLButtonElement)) throw new Error('bulk pin action missing');
      pin.click();
    });
    await page.waitForFunction(
      (ids) =>
        ids.every((id) => document.querySelector(`button.bh-pinned[data-channel-id="${id}"]`)),
      { timeout: 10000 },
      [first, second],
    );
  };
  await pinPair();
  const pinnedBefore = await page.evaluate(
    (ids) =>
      Array.from(document.querySelectorAll('button.bh-pinned[data-channel-id]'))
        .map((button) => button.getAttribute('data-channel-id'))
        .filter((id) => ids.includes(id)),
    [first, second],
  );
  if (pinnedBefore.length !== 2) throw new Error('pinned pair is not visible');
  const [pinTarget, pinSource] = pinnedBefore;
  // CDP pointer drags can miss the grid hit target; dispatch the same browser
  // DragEvents to verify the UI handlers and durable Host ordering deterministically.
  await page.evaluate((sourceId) => {
    const source = document.querySelector(`button.bh-pinned[data-channel-id="${sourceId}"]`);
    if (!(source instanceof HTMLButtonElement)) throw new Error('pin source missing');
    window.__pinTransfer = new DataTransfer();
    source.dispatchEvent(
      new DragEvent('dragstart', {
        bubbles: true,
        cancelable: true,
        dataTransfer: window.__pinTransfer,
      }),
    );
  }, pinSource);
  await page.waitForFunction(
    (id) => document.querySelector(`button.bh-pinned.bh-drag-source[data-channel-id="${id}"]`),
    { timeout: 5000 },
    pinSource,
  );
  await page.evaluate((targetId) => {
    const target = document.querySelector(`button.bh-pinned[data-channel-id="${targetId}"]`);
    if (!(target instanceof HTMLButtonElement)) throw new Error('pin target missing');
    const rect = target.getBoundingClientRect();
    target.dispatchEvent(
      new DragEvent('dragover', {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + rect.width / 4,
        clientY: rect.top + rect.height / 2,
        dataTransfer: window.__pinTransfer,
      }),
    );
  }, pinTarget);
  await page.waitForFunction(
    (id) => document.querySelector(`button.bh-pinned.bh-pin-drop-before[data-channel-id="${id}"]`),
    { timeout: 5000 },
    pinTarget,
  );
  await page.evaluate(
    ({ sourceId, targetId }) => {
      const target = document.querySelector(`button.bh-pinned[data-channel-id="${targetId}"]`);
      const source = document.querySelector(`button.bh-pinned[data-channel-id="${sourceId}"]`);
      if (!(target instanceof HTMLButtonElement) || !(source instanceof HTMLButtonElement)) {
        throw new Error('pin drag pair missing');
      }
      const rect = target.getBoundingClientRect();
      target.dispatchEvent(
        new DragEvent('drop', {
          bubbles: true,
          cancelable: true,
          clientX: rect.left + rect.width / 4,
          clientY: rect.top + rect.height / 2,
          dataTransfer: window.__pinTransfer,
        }),
      );
      source.dispatchEvent(
        new DragEvent('dragend', {
          bubbles: true,
          dataTransfer: window.__pinTransfer,
        }),
      );
    },
    { sourceId: pinSource, targetId: pinTarget },
  );
  await page.waitForFunction(
    (ids) =>
      Array.from(document.querySelectorAll('button.bh-pinned[data-channel-id]'))
        .map((button) => button.getAttribute('data-channel-id'))
        .filter((id) => ids.includes(id))
        .join(',') === ids.join(','),
    { timeout: 10000 },
    [pinSource, pinTarget],
  );
  const reorderedPins = (await rpc(page, 'rosterGet', {})).pins.filter((id) =>
    [first, second].includes(id),
  );
  if (reorderedPins.join(',') !== [pinSource, pinTarget].join(',')) {
    throw new Error('pinned reorder did not persist without changing membership');
  }
  await page.click('button[aria-label="置顶排序"], button[aria-label="Sort pinned"]');
  await page.waitForFunction(
    () =>
      Array.from(document.querySelectorAll('[role="menu"]')).some((menu) =>
        /置顶排序|Sort pinned/u.test(menu.textContent ?? ''),
      ),
    { timeout: 5000 },
  );
  await page.keyboard.press('Escape');
  await selectPair();
  await page.click(selector(second), { button: 'right' });
  await page.waitForFunction(
    () =>
      Array.from(document.querySelectorAll('[role="menu"] button')).some((button) =>
        /取消置顶 2 个频道|Unpin 2 channels/u.test(button.textContent ?? ''),
      ),
    { timeout: 5000 },
  );
  await page.evaluate(() => {
    const unpin = Array.from(document.querySelectorAll('[role="menu"] button')).find((button) =>
      /取消置顶 2 个频道|Unpin 2 channels/u.test(button.textContent ?? ''),
    );
    if (!(unpin instanceof HTMLButtonElement)) throw new Error('bulk unpin action missing');
    unpin.click();
  });
  await page.waitForFunction(
    ({ sectionId, ids }) =>
      ids.every(
        (id) =>
          document.querySelector(`[data-section-id="${sectionId}"] [data-channel-id="${id}"]`) !==
            null && document.querySelector(`button.bh-pinned[data-channel-id="${id}"]`) === null,
      ),
    { timeout: 10000 },
    { sectionId: targetSectionId, ids: [first, second] },
  );
  const unpinnedRoster = await rpc(page, 'rosterGet', {});
  if ([first, second].some((id) => unpinnedRoster.pins.includes(id))) {
    throw new Error('bulk unpin did not persist both channels');
  }

  await pinPair();
  await selectPair();
  await page.click(selector(second), { button: 'right' });
  await page.waitForFunction(
    () =>
      Array.from(document.querySelectorAll('[role="menu"] button')).some((button) =>
        /将 2 个频道 移动到|Move 2 channels to/u.test(button.textContent ?? ''),
      ),
    { timeout: 5000 },
  );
  await page.evaluate(() => {
    const move = Array.from(document.querySelectorAll('[role="menu"] button')).find((button) =>
      /将 2 个频道 移动到|Move 2 channels to/u.test(button.textContent ?? ''),
    );
    if (!(move instanceof HTMLButtonElement)) throw new Error('pinned bulk move missing');
    move.click();
  });
  await page.waitForFunction(
    (name) =>
      Array.from(document.querySelectorAll('[role="menu"] button')).some(
        (button) => button.textContent?.trim() === name,
      ),
    { timeout: 5000 },
    pinnedMoveSectionName,
  );
  await page.evaluate((name) => {
    const target = Array.from(document.querySelectorAll('[role="menu"] button')).find(
      (button) => button.textContent?.trim() === name,
    );
    if (!(target instanceof HTMLButtonElement)) throw new Error('pinned move section missing');
    target.click();
  }, pinnedMoveSectionName);
  await page.waitForFunction(
    ({ sectionId, ids }) =>
      ids.every(
        (id) =>
          document.querySelector(`[data-section-id="${sectionId}"] [data-channel-id="${id}"]`) !==
            null && document.querySelector(`button.bh-pinned[data-channel-id="${id}"]`) === null,
      ),
    { timeout: 10000 },
    { sectionId: pinnedMoveSectionId, ids: [first, second] },
  );
  const pinnedMoveRoster = await rpc(page, 'rosterGet', {});
  if (
    [first, second].some((id) => pinnedMoveRoster.pins.includes(id)) ||
    ![first, second].every((id) =>
      pinnedMoveRoster.sections
        .find((section) => section.id === pinnedMoveSectionId)
        ?.channelIds.includes(id),
    )
  ) {
    throw new Error('bulk pinned move did not unpin and reassign both channels');
  }
  await page.click(selector(first));
  await page.keyboard.down('Shift');
  await page.click(selector(second));
  await page.keyboard.up('Shift');
  await page.waitForFunction(
    (ids) =>
      ids.every(
        (id) =>
          document
            .querySelector(`button[data-channel-id="${id}"]`)
            ?.getAttribute('aria-pressed') === 'true',
      ),
    { timeout: 3000 },
    [first, second],
  );
  await page.click(selector(second), { button: 'right' });
  await page.waitForFunction(
    () =>
      Array.from(document.querySelectorAll('[role="menu"] button')).some((button) =>
        /隐藏 2 个频道|Hide 2 channels/u.test(button.textContent ?? ''),
      ),
    { timeout: 5000 },
  );
  await page.evaluate(() => {
    const hide = Array.from(document.querySelectorAll('[role="menu"] button')).find((button) =>
      /隐藏 2 个频道|Hide 2 channels/u.test(button.textContent ?? ''),
    );
    if (!(hide instanceof HTMLButtonElement)) throw new Error('bulk hide action missing');
    hide.click();
  });
  await page.waitForFunction(
    (ids) => ids.every((id) => document.querySelector(`button[data-channel-id="${id}"]`) === null),
    { timeout: 10000 },
    [first, second],
  );
  const persisted = (await rpc(page, 'rosterGet', {})).hidden;
  if (!persisted.includes(first) || !persisted.includes(second)) {
    throw new Error('batch hide did not persist both channels');
  }
  if (batchRequests.length !== 6) {
    throw new Error(`expected 6 one-request batch actions, saw ${batchRequests.length}`);
  }
  console.log(JSON.stringify({ verdict: 'PASS', selected, batchRequests: batchRequests.length }));
} catch (error) {
  console.error(String(error?.stack ?? error).replace(/token=[^&\s]+/gu, 'token=<REDACTED>'));
  process.exitCode = 1;
} finally {
  if (page !== undefined && originalHidden !== undefined) {
    await rpc(page, 'hiddenSet', { hidden: originalHidden }).catch(() => {});
    if (originalPins !== undefined) {
      await rpc(page, 'pinsSet', { pins: originalPins }).catch(() => {});
    }
    if (pinnedMoveSectionId !== undefined) {
      await rpc(page, 'sectionRemove', { sectionId: pinnedMoveSectionId }).catch(() => {});
    }
    if (targetSectionId !== undefined) {
      await rpc(page, 'sectionRemove', { sectionId: targetSectionId }).catch(() => {});
    }
  }
  await browser.close();
}
