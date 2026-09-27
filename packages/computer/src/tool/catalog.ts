/**
 * Curated Computer tool surface: the observe/act/verify core PersonaBots get
 * when Computer Access is on. The driver's full catalog is large and full of
 * near-synonyms; the expansion path is progressive discovery, not prompt
 * dumping (ADR-0079). Descriptions come from the driver's own catalog; this
 * module only curates names and defines redacted audit summaries.
 * @module @botharness/computer/tool/catalog
 */

/** Model-facing tool-name prefix; every Computer tool is `computer_<raw>`. */
export const COMPUTER_TOOL_PREFIX = 'computer_';

/** One curated driver tool. */
export interface ComputerToolSpec {
  /** Driver catalog name. */
  readonly raw: string;
  /** Redacted audit summary; never includes typed text or screenshot data. */
  readonly audit: (args: Record<string, unknown>) => string;
}

function str(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '?';
}

function chars(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  return typeof value === 'string' ? `chars=${value.length}` : 'chars=?';
}

function windowRef(args: Record<string, unknown>): string {
  const pid = args['pid'];
  const windowId = args['window_id'];
  const parts: string[] = [];
  if (typeof pid === 'string' || typeof pid === 'number') parts.push(`pid=${pid}`);
  if (typeof windowId === 'string' || typeof windowId === 'number')
    parts.push(`window=${windowId}`);
  return parts.length === 0 ? 'window=-' : parts.join(' ');
}

/** The observe/act/verify core (ADR-0079). */
export const COMPUTER_TOOLS: readonly ComputerToolSpec[] = [
  { raw: 'list_windows', audit: () => 'list windows' },
  {
    raw: 'get_desktop_state',
    audit: (args) => `desktop screenshot=${args['include_screenshot'] === false ? 'no' : 'yes'}`,
  },
  {
    raw: 'get_window_state',
    audit: (args) =>
      `${windowRef(args)} tree=${args['include_tree'] === false ? 'no' : 'yes'} screenshot=${
        args['include_screenshot'] === false ? 'no' : 'yes'
      }`,
  },
  { raw: 'launch_app', audit: (args) => `app=${str(args, 'app')}` },
  {
    raw: 'click',
    audit: (args) =>
      `${windowRef(args)} x=${str(args, 'x')} y=${str(args, 'y')} element=${str(args, 'element_index')}`,
  },
  { raw: 'type_text', audit: (args) => `${windowRef(args)} ${chars(args, 'text')}` },
  { raw: 'press_key', audit: (args) => `${windowRef(args)} key=${str(args, 'key')}` },
  { raw: 'hotkey', audit: (args) => `${windowRef(args)} keys=${str(args, 'keys')}` },
  {
    raw: 'scroll',
    audit: (args) => `${windowRef(args)} ${str(args, 'direction')} amount=${str(args, 'amount')}`,
  },
  {
    raw: 'verify_state',
    audit: (args) => `${windowRef(args)} predicate=${chars(args, 'predicate')}`,
  },
];

/** Model-facing name for one curated tool. */
export function computerToolName(raw: string): string {
  return `${COMPUTER_TOOL_PREFIX}${raw}`;
}

/**
 * Prompt guidance injected with the tools (Bot session scope only). Adapted
 * from the driver's own guidance minus macOS-specific wording; the desktop is
 * a shared X11/XFCE container, and the Human shares credentials with every
 * PersonaBot on it.
 */
export const COMPUTER_GUIDANCE = `You can act on this profile's shared Computer — a Linux (X11/XFCE) desktop inside a container with Chrome, shared by every PersonaBot of this profile. Other PersonaBots may be acting on the same desktop at the same time: stay inside the windows and tabs you opened.

Observe before you act. Call \`computer_get_window_state\` (or \`computer_list_windows\`) first; element indices and tokens belong to that exact snapshot. After any action, after a refusal, and after any Human input, take a fresh snapshot before the next action. \`computer_verify_state\` and fresh observations are how you confirm an outcome; "unknown" is not success.

Delivery: prefer background delivery. A refusal is a contract, not an obstacle — do not silently retry with foreground delivery.

Cancellation does not roll back. Input already delivered to the desktop stays delivered; re-observe before retrying.

Credentials are the Human's. Never type passwords, API keys, or recovery codes. When a page asks for a login, tell the Human in the chat what to log in to, then wait — the Human logs in through the Computer panel. Logins persist in the shared browser profile.

Before an externally visible action (posting, sending, purchasing, deleting), tell the Human what you are about to do in one short message. Computer Authorization lets you act; it is not blanket consent for surprising consequences. When done, report what you did with the window and outcome, and stop acting.`;
