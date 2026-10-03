import { createRequire } from 'node:module';
import { createDailyDocument } from './daily-document.js';
import type { Browser } from 'playwright-core';

interface Connector {
  resolveCLIConfigForMCP(
    options: Record<string, unknown>,
    env: NodeJS.ProcessEnv,
  ): Promise<unknown>;
  createBrowserWithInfo(
    config: unknown,
    client: { clientName: string; clientVersion: string; roots: [] },
    options: Record<string, unknown>,
    bind: { title: string },
  ): Promise<{ browser: Browser }>;
}
const tools: Connector = createRequire(import.meta.url)('playwright-core/lib/coreBundle').tools;
let browser: Browser | undefined;
let document: ReturnType<typeof createDailyDocument> | undefined;
function send(value: unknown): void {
  process.send?.(value);
}
async function execute(command: string, args: Record<string, unknown>): Promise<unknown> {
  if (command === 'connect') {
    if (browser !== undefined) throw new Error('Already connected');
    const options = {
      extension: true,
      browser: 'chrome',
      ...(typeof args.path === 'string' && args.path !== '' ? { executablePath: args.path } : {}),
    };
    const config = await tools.resolveCLIConfigForMCP(options, {});
    browser = (
      await tools.createBrowserWithInfo(
        config,
        { clientName: String(args.name), clientVersion: '1.0', roots: [] },
        options,
        { title: String(args.name) },
      )
    ).browser;
    const pages = browser.contexts()[0]?.pages() ?? [];
    if (pages.length !== 1)
      throw new Error('Select exactly one existing page in the Playwright extension');
    const selected = pages[0]!;
    if (!/^https?:\/\//u.test(selected.url()))
      throw new Error(
        'Select an ordinary HTTP(S) document; browser and extension pages cannot be controlled',
      );
    document = createDailyDocument(selected, (reason) => {
      send({ event: 'revoked', reason });
      void browser?.close().catch(() => undefined);
    });
    return { url: selected.url(), title: await selected.title() };
  }
  if (document === undefined)
    throw new Error('Select and authorize a Daily Browser document first');
  return document.execute(command, args);
}
function actionFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  const hints: readonly [RegExp, string][] = [
    [/outside of the viewport/iu, 'element is outside the viewport'],
    [/intercepts pointer events/iu, 'element is covered'],
    [/not visible/iu, 'element is not visible'],
    [/not stable/iu, 'element is not stable'],
    [/detached|stale/iu, 'element ref is stale'],
    [/Pause/iu, 'Browser Pause is active'],
    [/fresh browser_observe/iu, 'Resume requires a fresh browser_observe'],
    [/revoked|returned|closed|disconnected/iu, 'document authority was revoked'],
    [/Timeout/iu, 'element action timed out'],
  ];
  const reason = hints.find(([pattern]) => pattern.test(message))?.[1] ?? 'element action failed';
  return `Daily Browser action refused: ${reason}; observe again, or reconnect and authorize if the document changed`;
}
process.on('message', (message: { id: number; command: string; args: Record<string, unknown> }) => {
  void execute(message.command, message.args).then(
    (value) => send({ id: message.id, value }),
    (error: unknown) =>
      send({
        id: message.id,
        error:
          message.command === 'type' || message.command === 'click'
            ? actionFailure(error)
            : error instanceof Error
              ? error.message
              : 'Daily Browser operation failed',
      }),
  );
});
process.on('disconnect', () => {
  document?.dispose();
  process.exit(0);
});
