import { createRequire } from 'node:module';
import { mkdirSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pnpm = resolve(root, 'node_modules/.pnpm');
const puppeteerDir = readdirSync(pnpm).find((entry) => entry.startsWith('puppeteer@'));
if (puppeteerDir === undefined) throw new Error('Puppeteer unavailable');
const puppeteer = createRequire(resolve(pnpm, puppeteerDir, 'node_modules/'))('puppeteer');
const token = process.env.BH_E2E_TOKEN;
if (token === undefined) throw new Error('Set BH_E2E_TOKEN');
const origin = process.env.BH_E2E_ORIGIN ?? 'http://127.0.0.1:3220';
const shots = process.env.BH_SCREENSHOT_DIR ?? '/tmp/bh340-startup-shots';
mkdirSync(shots, { recursive: true });

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 960 });
  await page.goto(`${origin}/?token=${encodeURIComponent(token)}`, {
    waitUntil: 'networkidle2',
    timeout: 60000,
  });
  await page.evaluate(() =>
    Array.from(document.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'Continue')
      ?.click(),
  );
  await page.waitForSelector('button[aria-label="Bot mode"], button[aria-label="Bot 模式"]');
  if ((await page.$('.bh-root')) !== null) throw new Error('Bot mode opened with the default off');
  await page.screenshot({ path: resolve(shots, '01-default-native.png') });

  await page.evaluate(() => localStorage.setItem('botharness/start-in-bot-mode.v1', 'true'));
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.bh-root', { timeout: 20000 });
  await page.screenshot({ path: resolve(shots, '02-startup-bot.png') });

  await page.click('button[aria-label="Bot mode"], button[aria-label="Bot 模式"]');
  await page.waitForFunction(() => document.querySelector('.bh-root') === null);
  await new Promise((resolveWait) => setTimeout(resolveWait, 1000));
  if ((await page.$('.bh-root')) !== null) throw new Error('Startup mode overrode a manual exit');
  await page.screenshot({ path: resolve(shots, '03-manual-native.png') });

  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.bh-root', { timeout: 20000 });
  await page.screenshot({ path: resolve(shots, '04-reload-bot.png') });
  await page.click('button[aria-label="Settings"], button[aria-label="设置"]');
  await page.waitForFunction(() => /Bot settings|Bot 设置/iu.test(document.body.innerText));
  await page.evaluate(() =>
    Array.from(document.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'Bot settings')
      ?.click(),
  );
  await page.waitForSelector('.bh-startup-row');
  await page.screenshot({ path: resolve(shots, '05-settings-light.png') });
  await page.click('button[role="switch"][aria-label="Start in Bot mode"]');
  const storedOff = await page.evaluate(() =>
    localStorage.getItem('botharness/start-in-bot-mode.v1'),
  );
  if (storedOff !== 'false') throw new Error(`Settings switch did not save off: ${storedOff}`);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('button[aria-label="Bot mode"]');
  if ((await page.$('.bh-root')) !== null) throw new Error('Settings off still opened Bot mode');
  await page.screenshot({ path: resolve(shots, '06-settings-off-native.png') });

  await page.click('button[aria-label="Settings"]');
  await page.evaluate(() =>
    Array.from(document.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'Bot settings')
      ?.click(),
  );
  await page.waitForSelector('.bh-startup-row');
  await page.click('button[role="switch"][aria-label="Start in Bot mode"]');
  const storedOn = await page.evaluate(() =>
    localStorage.getItem('botharness/start-in-bot-mode.v1'),
  );
  if (storedOn !== 'true') throw new Error(`Settings switch did not save on: ${storedOn}`);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.bh-root', { timeout: 20000 });
  await page.screenshot({ path: resolve(shots, '07-settings-on-bot.png') });
  console.log('SETTINGS SWITCH PASS');
  await page.click('button[aria-label="Settings"]');
  await page.evaluate(() =>
    Array.from(document.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'General')
      ?.click(),
  );
  await page.evaluate(() =>
    Array.from(document.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'Dark')
      ?.click(),
  );
  await page.waitForFunction(() => document.body.hasAttribute('data-ds-dark-theme'));
  await page.evaluate(() =>
    Array.from(document.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'Bot settings')
      ?.click(),
  );
  await page.waitForSelector('.bh-startup-row');
  await page.screenshot({ path: resolve(shots, '08-settings-dark.png') });
  await page.evaluate(() =>
    Array.from(document.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'General')
      ?.click(),
  );
  await page.evaluate(() =>
    Array.from(document.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'Light')
      ?.click(),
  );
  console.log('DARK THEME PASS');
} finally {
  await browser.close();
}
