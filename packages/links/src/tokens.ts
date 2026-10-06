export const TOKEN_PREFIX = 'bhl_';
export const TOKEN_PATTERN = /^bhl_[A-Za-z0-9_-]{43}$/;
export const MIN_BOOTSTRAP_LENGTH = 32;

const encoder = new TextEncoder();

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}

export function generateToken(): string {
  return TOKEN_PREFIX + base64url(crypto.getRandomValues(new Uint8Array(32)));
}

export function displayPrefix(token: string): string {
  return token.slice(0, TOKEN_PREFIX.length + 8);
}

export async function hashToken(token: string): Promise<string> {
  return Array.from(await digest(token), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function sameSecret(given: string, expected: string): Promise<boolean> {
  const [left, right] = await Promise.all([digest(given), digest(expected)]);
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}
