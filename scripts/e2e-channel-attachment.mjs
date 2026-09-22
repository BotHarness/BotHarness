// Live #146 tracer bullet: real DSH Fetch upload, Channel send, and browser rendering.
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
if (!token) throw new Error('Set BH_E2E_TOKEN for an isolated DSH profile');
const origin = process.env.BH_E2E_ORIGIN ?? 'http://127.0.0.1:3102';
const nonce = Date.now().toString();
const channelName = `AttachmentE2E-${nonce}`;
const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 960 });
  await page.goto(`${origin}/?token=${encodeURIComponent(token)}`, {
    waitUntil: 'networkidle2',
    timeout: 60000,
  });
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'Continue')
      ?.click();
    Array.from(document.querySelectorAll('button'))
      .find((button) => ['BOT 模式', 'Bot mode'].includes(button.textContent?.trim() ?? ''))
      ?.click();
  });
  await page.waitForFunction(
    () => document.querySelector('button[aria-label="新建"], button[aria-label="New"]'),
    { timeout: 10000 },
  );
  const rpc = (method, args) =>
    page.evaluate(
      async (m, a) => {
        const response = await fetch(`/api/botharness/${m}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            type: 'client-request',
            rpcId: `attachment-e2e-${m}-${Math.random()}`,
            method: `botharness/${m}`,
            payload: { args: a },
          }),
        });
        const envelope = await response.json();
        if (envelope.result?.ok !== true)
          throw new Error(`${m}: ${JSON.stringify(envelope.result ?? envelope)}`);
        return envelope.result.value;
      },
      method,
      args,
    );
  const created = await rpc('channelCreate', { name: channelName, members: [] });
  const channelId = created.channel.id;
  await page.reload({ waitUntil: 'networkidle2', timeout: 60000 });
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('button'))
      .find((button) => ['BOT 模式', 'Bot mode'].includes(button.textContent?.trim() ?? ''))
      ?.click();
    Array.from(document.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'Configure later')
      ?.click();
  });
  await page.waitForFunction(
    (name) =>
      Array.from(document.querySelectorAll('button')).some((button) =>
        button.textContent?.includes(name),
      ),
    { timeout: 10000 },
    channelName,
  );
  await page.evaluate(
    (name) =>
      Array.from(document.querySelectorAll('button'))
        .find((button) => button.textContent?.includes(name))
        ?.click(),
    channelName,
  );
  await page.waitForSelector('input.bh-composer-file-input', { timeout: 10000 });
  const attach = async (name, bytes, mime) => {
    await page.evaluate(
      (filename, values, type) => {
        const input = document.querySelector('input.bh-composer-file-input');
        if (!(input instanceof HTMLInputElement)) throw new Error('file input missing');
        const transfer = new DataTransfer();
        transfer.items.add(new File([new Uint8Array(values)], filename, { type }));
        input.files = transfer.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      },
      name,
      Array.from(bytes),
      mime,
    );
    await page.waitForFunction(
      () => {
        const send = document.querySelector('button.bh-send-btn');
        return Boolean(send && !send.disabled);
      },
      { timeout: 10000 },
    );
  };
  const png = Uint8Array.from(
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlqkgAAAABJRU5ErkJggg==',
      'base64',
    ),
  );
  await attach('tiny.png', png, 'image/png');
  await page.type('textarea.bh-composer-input', 'image-e2e');
  await page.click('button.bh-send-btn');
  await page.waitForSelector('img.bh-message-image[alt="tiny.png"]', { timeout: 10000 });
  await page.waitForFunction(
    () => document.querySelector('img.bh-message-image[alt="tiny.png"]')?.naturalWidth > 0,
    { timeout: 10000 },
  );
  const first = await rpc('channelTimeline', { channelId });
  const imageMessage = first.page.entries.find((entry) => entry.body === 'image-e2e');
  const imageRef = imageMessage?.attachments?.[0];
  if (!imageRef || imageRef.mime !== 'image/png')
    throw new Error('image ref missing from durable timeline');
  const imageDownload = await page.evaluate(async (ref) => {
    const response = await fetch(
      `/api/botharness/attachment?hash=${encodeURIComponent(ref.hash)}&name=${encodeURIComponent(ref.name)}`,
    );
    return {
      status: response.status,
      type: response.headers.get('content-type'),
      disposition: response.headers.get('content-disposition'),
      bytes: Array.from(new Uint8Array(await response.arrayBuffer())),
    };
  }, imageRef);
  if (
    imageDownload.status !== 200 ||
    imageDownload.type !== 'image/png' ||
    !imageDownload.disposition?.startsWith('inline;') ||
    Buffer.compare(Buffer.from(imageDownload.bytes), Buffer.from(png)) !== 0
  )
    throw new Error(`inline image round trip failed: ${JSON.stringify(imageDownload)}`);
  const pdf = new TextEncoder().encode('%PDF-1.7\n% attachment E2E\n');
  await attach('report.pdf', pdf, 'application/pdf');
  await page.click('button.bh-send-btn');
  await page.waitForSelector('a.bh-message-file[download="report.pdf"]', { timeout: 10000 });
  const second = await rpc('channelTimeline', { channelId });
  const pdfRef = second.page.entries.find((entry) => entry.attachments?.[0]?.name === 'report.pdf')
    ?.attachments?.[0];
  if (!pdfRef || pdfRef.mime !== 'application/pdf')
    throw new Error('PDF ref missing from durable timeline');
  const fileDownload = await page.evaluate(async (ref) => {
    const response = await fetch(
      `/api/botharness/attachment?hash=${encodeURIComponent(ref.hash)}&name=${encodeURIComponent(ref.name)}`,
    );
    return {
      status: response.status,
      type: response.headers.get('content-type'),
      disposition: response.headers.get('content-disposition'),
      bytes: Array.from(new Uint8Array(await response.arrayBuffer())),
    };
  }, pdfRef);
  if (
    fileDownload.status !== 200 ||
    fileDownload.type !== 'application/pdf' ||
    !fileDownload.disposition?.startsWith('attachment;') ||
    Buffer.compare(Buffer.from(fileDownload.bytes), Buffer.from(pdf)) !== 0
  )
    throw new Error(`file download round trip failed: ${JSON.stringify(fileDownload)}`);
  console.log(
    JSON.stringify({
      result: 'PASS',
      channelId,
      imageHash: imageRef.hash,
      fileHash: pdfRef.hash,
      imageBytes: png.length,
      fileBytes: pdf.length,
    }),
  );
} finally {
  await browser.close();
}
