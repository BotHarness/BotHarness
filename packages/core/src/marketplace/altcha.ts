export const ALTCHA_ALGORITHM = 'SHA-256';
export const CHALLENGE_TTL_SECONDS = 300;

export type ChallengeTier = 'default' | 'elevated' | 'high';

export const TIER_MAX_NUMBER: Record<ChallengeTier, number> = {
  default: 50_000,
  elevated: 250_000,
  high: 1_000_000,
};

export interface AltchaChallenge {
  algorithm: typeof ALTCHA_ALGORITHM;
  challenge: string;
  maxnumber: number;
  salt: string;
  signature: string;
}

export interface AltchaSolution {
  algorithm: typeof ALTCHA_ALGORITHM;
  challenge: string;
  number: number;
  salt: string;
  signature: string;
}

const encoder = new TextEncoder();

function hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(text: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', encoder.encode(text)));
}

async function hmacHex(key: string, text: string): Promise<string> {
  const imported = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return hex(await crypto.subtle.sign('HMAC', imported, encoder.encode(text)));
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export async function createChallenge(options: {
  key: string;
  tier: ChallengeTier;
  now: Date;
  random?: () => string;
  number?: number;
}): Promise<AltchaChallenge> {
  const maxnumber = TIER_MAX_NUMBER[options.tier];
  const expires = Math.floor(options.now.getTime() / 1000) + CHALLENGE_TTL_SECONDS;
  const nonce =
    options.random?.() ?? hex(crypto.getRandomValues(new Uint8Array(12)).buffer as ArrayBuffer);
  const salt = `${nonce}?expires=${expires}`;
  const secret =
    options.number ?? (crypto.getRandomValues(new Uint32Array(1))[0] ?? 0) % (maxnumber + 1);
  const challenge = await sha256Hex(`${salt}${secret}`);
  return {
    algorithm: ALTCHA_ALGORITHM,
    challenge,
    maxnumber,
    salt,
    signature: await hmacHex(options.key, challenge),
  };
}

export function parseChallenge(value: unknown): AltchaChallenge | undefined {
  const source = record(value);
  if (source === undefined || source['algorithm'] !== ALTCHA_ALGORITHM) return undefined;
  const { challenge, maxnumber, salt, signature } = source;
  if (typeof challenge !== 'string' || typeof salt !== 'string' || typeof signature !== 'string') {
    return undefined;
  }
  if (typeof maxnumber !== 'number' || !Number.isSafeInteger(maxnumber) || maxnumber < 0) {
    return undefined;
  }
  return { algorithm: ALTCHA_ALGORITHM, challenge, maxnumber, salt, signature };
}

export function encodeSolution(solution: AltchaSolution): string {
  return btoa(JSON.stringify(solution));
}

export function decodeSolution(payload: string): AltchaSolution | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(atob(payload));
  } catch {
    return undefined;
  }
  const source = record(parsed);
  if (source === undefined || source['algorithm'] !== ALTCHA_ALGORITHM) return undefined;
  const { challenge, number, salt, signature } = source;
  if (typeof challenge !== 'string' || typeof salt !== 'string' || typeof signature !== 'string') {
    return undefined;
  }
  if (typeof number !== 'number' || !Number.isSafeInteger(number) || number < 0) return undefined;
  return { algorithm: ALTCHA_ALGORITHM, challenge, number, salt, signature };
}

export type SolutionCheck =
  | { ok: true; challenge: string; expiresAt: number }
  | { ok: false; reason: 'invalid' | 'expired' };

export async function verifySolution(options: {
  key: string;
  payload: string;
  now: Date;
}): Promise<SolutionCheck> {
  const solution = decodeSolution(options.payload);
  if (solution === undefined) return { ok: false, reason: 'invalid' };
  const expires = Number(/[?&]expires=(\d+)/u.exec(solution.salt)?.[1]);
  if (!Number.isSafeInteger(expires)) return { ok: false, reason: 'invalid' };
  if ((await sha256Hex(`${solution.salt}${solution.number}`)) !== solution.challenge) {
    return { ok: false, reason: 'invalid' };
  }
  if ((await hmacHex(options.key, solution.challenge)) !== solution.signature) {
    return { ok: false, reason: 'invalid' };
  }
  if (expires * 1000 < options.now.getTime()) return { ok: false, reason: 'expired' };
  return { ok: true, challenge: solution.challenge, expiresAt: expires };
}

export async function solveChallenge(
  challenge: AltchaChallenge,
  options: { batch?: number; yieldEvery?: () => Promise<void>; signal?: AbortSignal } = {},
): Promise<string | undefined> {
  const batch = options.batch ?? 2_000;
  for (let start = 0; start <= challenge.maxnumber; start += batch) {
    if (options.signal?.aborted === true) return undefined;
    const numbers = Array.from(
      { length: Math.min(batch, challenge.maxnumber - start + 1) },
      (_, index) => start + index,
    );
    const hashes = await Promise.all(
      numbers.map((number) => sha256Hex(`${challenge.salt}${number}`)),
    );
    const found = hashes.indexOf(challenge.challenge);
    const number = numbers[found];
    if (number !== undefined) {
      return encodeSolution({
        algorithm: ALTCHA_ALGORITHM,
        challenge: challenge.challenge,
        number,
        salt: challenge.salt,
        signature: challenge.signature,
      });
    }
    await options.yieldEvery?.();
  }
  return undefined;
}
