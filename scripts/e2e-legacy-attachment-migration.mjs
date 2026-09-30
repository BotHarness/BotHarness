import { createRequire } from 'node:module';
import {
  readFileSync,
  readdirSync,
  mkdirSync,
  mkdtempSync,
  writeFileSync,
  existsSync,
  renameSync,
  cpSync,
} from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync, backup } from 'node:sqlite';
import assert from 'node:assert/strict';
const w = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const phase = process.argv[2];
if (!process.env.BH_E2E_INSTANCE || !process.env.BH_E2E_FIXTURE)
  throw new Error('Private instance and fixture paths are required');
const instance = JSON.parse(readFileSync(process.env.BH_E2E_INSTANCE, 'utf8'));
const fixturePath = process.env.BH_E2E_FIXTURE;
const local = dirname(fixturePath);
const out = resolve(process.env.BH_E2E_OUTPUT ?? join(w, 'docs/assets/pr/577-legacy-attachments'));
mkdirSync(out, { recursive: true });
const initial = 'Legacy attachment migration QA\nOriginal transfer bytes.\n';
const saved = 'Legacy attachment migration QA\nSaved in TextEdit — current migrated destination.\n';
const p = join(w, 'node_modules/.pnpm');
const puppeteer = createRequire(
  join(
    p,
    readdirSync(p).find((x) => x.startsWith('puppeteer@')),
    'node_modules/',
  ),
)('puppeteer');
const browser = await puppeteer.launch({
  headless: true,
  executablePath:
    process.env.BH_E2E_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--no-sandbox'],
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.setViewport({ width: 1440, height: 960 });
const rpc = (method, args = {}) =>
  page.evaluate(
    async (method, args) => {
      const envelope = await (
        await fetch('/api/botharness/' + method, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            type: 'client-request',
            rpcId: 'qa-' + method,
            method: 'botharness/' + method,
            payload: { args },
          }),
        })
      ).json();
      if (!envelope.result?.ok) throw new Error(JSON.stringify(envelope.result));
      return envelope.result.value;
    },
    method,
    args,
  );
const clickText = async (selector, text) => {
  await page.waitForFunction(
    (selector, text) =>
      [...document.querySelectorAll(selector)].some((element) =>
        element.textContent.includes(text),
      ),
    {},
    selector,
    text,
  );
  await page.evaluate(
    (selector, text) =>
      [...document.querySelectorAll(selector)]
        .find((element) => element.textContent.includes(text))
        .click(),
    selector,
    text,
  );
};
const menuReady = () =>
  page.waitForFunction(() => {
    const menu = document.querySelector('[role="menu"]');
    return menu && !menu.textContent.includes('正在检查') && menu.textContent.includes('复制');
  });
const selectChannel = async () => {
  await page.click('button[aria-label="Bot 模式"],button[aria-label="Bot mode"]');
  await page.waitForSelector('[data-channel-id="' + fixture.channelId + '"]');
  await page.click('[data-channel-id="' + fixture.channelId + '"]');
  await page.waitForSelector('.bh-message-file');
  await page.waitForNetworkIdle({ idleTime: 500 });
};
const snapshot = () => {
  const db = new DatabaseSync(join(instance.home, 'botharness/botharness.db'), { readOnly: true });
  try {
    return JSON.parse(
      JSON.stringify({
        events: db.prepare('SELECT * FROM source_events ORDER BY source_event_id').all(),
        admissions: db
          .prepare('SELECT * FROM inbox_admissions ORDER BY source_event_id, bot_slug')
          .all(),
        placements: db
          .prepare('SELECT * FROM channel_placements ORDER BY channel_id, revision')
          .all(),
      }),
    );
  } finally {
    db.close();
  }
};
const allState = () => {
  const db = new DatabaseSync(join(instance.home, 'botharness/botharness.db'), { readOnly: true });
  try {
    return JSON.parse(
      JSON.stringify(
        Object.fromEntries(
          db
            .prepare(
              "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
            )
            .all()
            .map(({ name }) => [
              name,
              db.prepare('SELECT * FROM "' + name.replaceAll('"', '""') + '"').all(),
            ]),
        ),
      ),
    );
  } finally {
    db.close();
  }
};
const read = (f, messageId = f.messageId, identity = f.ref.fileId) =>
  page.evaluate(
    async (args) => {
      const response = await fetch('/api/botharness/attachment?' + new URLSearchParams(args));
      return {
        status: response.status,
        text: await response.text(),
        cache: response.headers.get('cache-control'),
      };
    },
    {
      channelId: f.channelId,
      messageId,
      ...(identity.startsWith('file:') ? { fileId: identity } : { hash: identity }),
    },
  );
let fixture;
try {
  await page.goto(instance.url, { waitUntil: 'networkidle2' });
  await page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .find((element) => ['Continue', '继续'].includes(element.textContent.trim()))
      ?.click(),
  );
  if (phase === 'image') {
    const channels = (await rpc('channels')).channels;
    let imageChannel;
    let imageMessage;
    for (const channel of channels.filter((channel) => channel.name === 'Image File Actions QA')) {
      const entries = (await rpc('channelTimeline', { channelId: channel.id })).page.entries;
      const found = entries.find((message) =>
        message.attachments?.some((ref) => ref.name === 'image-qa.png'),
      );
      if (found) {
        imageChannel = channel;
        imageMessage = found;
        break;
      }
    }
    assert.ok(imageMessage, 'Retained pre-migration PNG is required');
    const ref = imageMessage.attachments.find((ref) => ref.name === 'image-qa.png');
    const prefix = ref.fileId === undefined ? 'before-image' : 'after-image';
    await page.click('button[aria-label="Bot 模式"],button[aria-label="Bot mode"]');
    await page.waitForSelector('[data-channel-id="' + imageChannel.id + '"]');
    await page.click('[data-channel-id="' + imageChannel.id + '"]');
    await page.waitForFunction(
      () => document.querySelector('img.bh-message-image')?.naturalWidth === 320,
    );
    await page.waitForNetworkIdle({ idleTime: 500 });
    await page.screenshot({ path: join(out, prefix + '-dark.png') });
    const href = await page.$eval('a.bh-message-image-link', (element) => element.href);
    const value = await page.evaluate(async (href) => {
      const response = await fetch(href);
      return {
        status: response.status,
        mime: response.headers.get('content-type'),
        bytes: Array.from(new Uint8Array(await response.arrayBuffer())),
      };
    }, href);
    assert.equal(value.status, 200);
    assert.equal(value.mime, 'image/png');
    const imageBytes = join(local, 'retained-image.bin');
    if (ref.fileId === undefined) writeFileSync(imageBytes, Buffer.from(value.bytes));
    else assert.deepEqual(Buffer.from(value.bytes), readFileSync(imageBytes));
    const popup = browser.waitForTarget((target) => target.url() === href);
    await page.click('a.bh-message-image-link');
    const preview = await (await popup).page();
    await preview.waitForFunction(() => document.querySelector('img')?.naturalWidth === 320);
    await preview.close();
    await page.bringToFront();
    await page.click('a.bh-message-image-link', { button: 'right' });
    await page.waitForSelector('[role="menu"]');
    if (ref.fileId !== undefined) await menuReady();
    await page.screenshot({ path: join(out, prefix + '-menu-dark.png') });
    await page.keyboard.press('Escape');
    if (ref.fileId !== undefined) {
      await page.click('button[aria-label="文件操作: image-qa.png"]');
      await menuReady();
      assert.ok(
        (await page.$eval('[role="menu"]', (menu) => menu.textContent)).includes('显示文件位置'),
      );
    }
    console.log(
      'PASS ' +
        prefix +
        ': retained PNG preserves exact bytes, MIME, inline dimensions and real preview; migrated context and More menus expose native file actions.',
    );
  } else if (phase === 'seed') {
    if (!process.env.BH_E2E_NEW_HOME)
      throw new Error('Private new isolated home is required for seed');
    const source = join(local, 'source', '旧附件 legacy notes.txt');
    mkdirSync(dirname(source), { recursive: true });
    writeFileSync(source, initial);
    const existing = (await rpc('channels')).channels.find(
      (channel) => channel.name === 'Legacy Attachment Migration QA',
    );
    const channel =
      existing ??
      (await rpc('channelCreate', { name: 'Legacy Attachment Migration QA', members: [] })).channel;
    await page.reload({ waitUntil: 'networkidle2' });
    await page.click('button[aria-label="Bot 模式"],button[aria-label="Bot mode"]');
    await page.waitForSelector('[data-channel-id="' + channel.id + '"]');
    await page.click('[data-channel-id="' + channel.id + '"]');
    await page.waitForSelector('input.bh-composer-file-input');
    await page.waitForNetworkIdle({ idleTime: 500 });
    const count = (await rpc('channelTimeline', { channelId: channel.id })).page.entries.length;
    for (let index = count; index < 2; index += 1) {
      console.log('Legacy picker phase', index);
      const [chooser] = await Promise.all([
        page.waitForFileChooser(),
        page.click('button.bh-composer-add-file'),
      ]);
      await chooser.accept([source]);
      await page.waitForFunction(
        () => document.querySelector('button.bh-send-btn')?.disabled === false,
      );
      await page.click('button.bh-send-btn');
      await page.waitForNetworkIdle({ idleTime: 500 });
    }
    const messages = (await rpc('channelTimeline', { channelId: channel.id })).page.entries.filter(
      (message) => message.attachments?.[0]?.name === '旧附件 legacy notes.txt',
    );
    assert.equal(messages.length, 2);
    assert.equal(messages[0].attachments[0].hash, messages[1].attachments[0].hash);
    assert.equal(messages[0].attachments[0].fileId, undefined);
    fixture = {
      channelId: channel.id,
      messageId: messages[0].id,
      independentMessageId: messages[1].id,
      legacy: messages[0].attachments[0],
      source,
      initialFacts: snapshot(),
    };
    await page.screenshot({ path: join(out, 'before-dark.png') });
    await page.click('a.bh-message-file', { button: 'right' });
    await page.waitForSelector('[role="menu"]');
    await page.screenshot({ path: join(out, 'before-menu-dark.png') });
    await page.keyboard.press('Escape');
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
    await page.waitForFunction(() => !document.body.hasAttribute('data-ds-dark-theme'));
    await page.screenshot({ path: join(out, 'before-light.png') });
    const target = join(resolve(process.env.BH_E2E_NEW_HOME), 'botharness');
    mkdirSync(target, { recursive: true });
    assert.equal(
      existsSync(join(target, 'botharness.db')),
      false,
      'Use a new isolated destination, not a running Profile',
    );
    const db = new DatabaseSync(join(instance.home, 'botharness/botharness.db'), {
      readOnly: true,
    });
    try {
      await backup(db, join(target, 'botharness.db'));
    } finally {
      db.close();
    }
    for (const name of ['attachments', 'bots'])
      if (existsSync(join(instance.home, 'botharness', name)))
        cpSync(join(instance.home, 'botharness', name), join(target, name), { recursive: true });
    writeFileSync(fixturePath, JSON.stringify(fixture));
    console.log(
      'PASS actual pre-migration composer sends equal legacy uploads; immutable facts and attachment objects copied to a new private Profile using SQLite backup; no credentials or writer lease copied.',
    );
  } else {
    fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
    if (phase === 'open-editor') {
      const messages = (await rpc('channelTimeline', { channelId: fixture.channelId })).page
        .entries;
      const first = messages.find((message) => message.id === fixture.messageId);
      const independent = messages.find((message) => message.id === fixture.independentMessageId);
      assert.ok(first.attachments[0].fileId);
      assert.notEqual(first.attachments[0].fileId, independent.attachments[0].fileId);
      assert.deepEqual(
        snapshot(),
        fixture.initialFacts,
        'Migration must preserve Source Events, admissions and placements',
      );
      fixture.ref = first.attachments[0];
      fixture.independentRef = independent.attachments[0];
      const { target } = await rpc('messageAttachmentTarget', {
        channelId: fixture.channelId,
        messageId: fixture.messageId,
        fileId: fixture.ref.fileId,
      });
      fixture.path = target.path;
      assert.equal(readFileSync(fixture.path, 'utf8'), initial);
      await selectChannel();
      await page.screenshot({ path: join(out, 'after-dark.png') });
      await page.click('button.bh-message-file');
      await menuReady();
      await page.screenshot({ path: join(out, 'after-menu-dark.png') });
      await page.keyboard.press('Escape');
      await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
      await page.waitForFunction(() => !document.body.hasAttribute('data-ds-dark-theme'));
      await page.screenshot({ path: join(out, 'after-light.png') });
      await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
      await page.waitForFunction(() => document.body.hasAttribute('data-ds-dark-theme'));
      await page.click('button.bh-message-file');
      await menuReady();
      fixture.beforeSave = allState();
      writeFileSync(fixturePath, JSON.stringify(fixture));
      await clickText('[role="menu"] button', '文本编辑');
      await page.waitForSelector('[role="menu"]', { hidden: true });
      await page.waitForNetworkIdle({ idleTime: 500 });
      console.log(
        'PASS migrated old messages expose independent real files, preserve exact message facts and menu actions; native TextEdit handoff completed. Save the expected current text through the editor before verify.',
      );
    } else if (phase === 'verify') {
      assert.equal(readFileSync(fixture.path, 'utf8'), saved, 'Save through actual TextEdit first');
      assert.equal(readFileSync(fixture.source, 'utf8'), initial);
      assert.deepEqual(
        allState(),
        fixture.beforeSave,
        'External save must not write any durable facts or scheduling state',
      );
      assert.equal((await read(fixture)).text, saved);
      assert.equal((await read(fixture, fixture.messageId, fixture.legacy.hash)).text, saved);
      assert.equal((await read(fixture)).cache, 'no-store');
      assert.equal(
        (await read(fixture, fixture.independentMessageId, fixture.independentRef.fileId)).text,
        initial,
      );
      assert.equal(
        (await read(fixture, fixture.independentMessageId, fixture.legacy.hash)).text,
        initial,
      );
      const current = (
        await rpc('channelTimeline', { channelId: fixture.channelId })
      ).page.entries.find((message) => message.id === fixture.messageId).attachments[0];
      assert.equal(current.size, Buffer.byteLength(saved));
      const hashOnly = await page.evaluate(
        async (hash) =>
          (await fetch('/api/botharness/attachment?' + new URLSearchParams({ hash }))).status,
        fixture.legacy.hash,
      );
      assert.equal(hashOnly, 400);
      const { message: shared } = await rpc('channelSend', {
        channelId: fixture.channelId,
        body: 'Explicit reuse after migration',
        attachments: [current],
      });
      fixture.sharedMessageId = shared.id;
      assert.equal((await read(fixture, shared.id)).text, saved);
      await selectChannel();
      await page.screenshot({ path: join(out, 'saved-current-message.png') });
      writeFileSync(fixturePath, JSON.stringify(fixture));
      console.log(
        'PASS native external save changed original and owner-qualified legacy reads; independent equal upload/source unchanged, explicit canonical reuse shared current bytes, old ownerless hash refused, no database changes from save.',
      );
    } else if (phase === 'download') {
      const directory = mkdtempSync(join(local, 'downloads-migrated-'));
      const client = await page.createCDPSession();
      await client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: directory });
      await selectChannel();
      await page.click('button.bh-message-file');
      await menuReady();
      await clickText('[role="menu"] button', '下载到此设备');
      const path = join(directory, fixture.ref.name);
      const deadline = Date.now() + 10_000;
      while (
        Date.now() < deadline &&
        (!existsSync(path) || readdirSync(directory).some((name) => name.endsWith('.crdownload')))
      ) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      assert.ok(existsSync(path), 'Browser menu download timed out');
      assert.ok(
        !readdirSync(directory).some((name) => name.endsWith('.crdownload')),
        'Browser download did not complete',
      );
      assert.equal(readFileSync(path, 'utf8'), saved);
      console.log(
        'PASS actual original-message menu download retains Unicode/spaced filename and saved current bytes.',
      );
    } else if (phase === 'restart') {
      assert.equal((await read(fixture)).text, saved);
      assert.equal((await read(fixture, fixture.messageId, fixture.legacy.hash)).text, saved);
      assert.equal((await read(fixture, fixture.sharedMessageId)).text, saved);
      assert.equal(
        (await read(fixture, fixture.independentMessageId, fixture.independentRef.fileId)).text,
        initial,
      );
      const messages = (await rpc('channelTimeline', { channelId: fixture.channelId })).page
        .entries;
      assert.equal(
        messages.find((message) => message.id === fixture.messageId).attachments[0].fileId,
        fixture.ref.fileId,
      );
      const parked = fixture.path + '.qa-missing';
      renameSync(fixture.path, parked);
      try {
        assert.equal((await read(fixture)).status, 404);
        assert.equal((await read(fixture, fixture.messageId, fixture.legacy.hash)).status, 404);
        assert.equal(existsSync(fixture.path), false);
      } finally {
        renameSync(parked, fixture.path);
      }
      console.log(
        'PASS restart retained migrated identity/current bytes; missing migrated target refused both current and old owner-qualified references without frozen fallback.',
      );
    } else throw new Error('Unknown phase');
  }
  assert.deepEqual(errors, []);
} catch (error) {
  await page.screenshot({ path: join(local, phase + '-failure.png') });
  console.log(await page.evaluate(() => document.body.innerText));
  throw error;
} finally {
  await browser.close();
}
