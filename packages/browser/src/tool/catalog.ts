export const BROWSER_TOOL_PREFIX = 'browser_';

export interface BrowserToolSpec {
  readonly raw: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  readonly audit: (args: Record<string, unknown>) => string;
}

function str(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '?';
}

export const BROWSER_TOOLS: readonly BrowserToolSpec[] = [
  {
    raw: 'open',
    description:
      "Open a URL in this PersonaBot's Bot Browser window. Reuses the Bot's current tab when one exists, otherwise opens a new window. Returns the page URL and title.",
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Absolute http(s) URL to open, for example https://example.com',
        },
      },
      required: ['url'],
      additionalProperties: false,
    },
    audit: (args) => `url=${str(args, 'url').slice(0, 160)}`,
  },
  {
    raw: 'observe',
    description:
      "Observe this PersonaBot's current Bot Browser tab: the page URL and title, visible text (bounded), and interactive elements with refs. Refs belong to this observation only; re-observe after navigation, after a refusal, and after any Human input.",
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    audit: () => 'observe',
  },
  {
    raw: 'screenshot',
    description:
      "Capture this PersonaBot's current Bot Browser tab as an image for visual verification (layout, images, charts). Returns an image when the active route supports it, otherwise a readable fallback.",
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    audit: () => 'screenshot',
  },
];

export function browserToolName(raw: string): string {
  return `${BROWSER_TOOL_PREFIX}${raw}`;
}

export const BROWSER_GUIDANCE = `You can browse the web through this profile's shared Bot Browser — a real browser window owned by BotHarness, shared by every PersonaBot of this profile. Other PersonaBots may be browsing at the same time: stay inside the tabs you opened.

Observe before you act. Call \`browser_open\` to open a page (it reuses your current tab) and \`browser_observe\` to read it; element refs belong to that exact observation. Re-observe after navigation, after a refusal, and after any Human input.

Credentials are the Human's. The Bot Browser has its own persistent profile; when a page asks for a login, tell the Human in the chat what to log in to, then wait — the Human signs in through the Bot Browser entry. Never type passwords, API keys, or recovery codes.

Before an externally visible action (posting, sending, purchasing, deleting), tell the Human what you are about to do in one short message. Browser Authorization lets you act; it is not blanket consent for surprising consequences. When done, report which page you read and what you concluded, and stop acting.`;
