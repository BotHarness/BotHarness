export const BOT_DESCRIPTOR_PATH = '.botharness/bot.json';
export const MAX_DESCRIPTOR_BYTES = 16_384;
export const MAX_DESCRIPTOR_NAME_LENGTH = 60;
export const MAX_DESCRIPTOR_ROLES = 8;
export const MAX_DESCRIPTOR_ROLE_LENGTH = 32;

export type BotDescriptorAvatar = { recipe: Record<string, unknown> } | { image: string };

export interface BotDescriptor {
  name?: string;
  roles?: string[];
  avatar?: BotDescriptorAvatar;
}

const IMAGE_PATH = /\.(png|jpe?g|webp)$/iu;

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function isDescriptorImagePath(value: string): boolean {
  if (value.length === 0 || value.length > 200 || !IMAGE_PATH.test(value)) return false;
  if (value.startsWith('/') || value.includes('\\') || /^[a-z][a-z0-9+.-]*:/iu.test(value)) {
    return false;
  }
  return value.split('/').every((part) => part !== '' && part !== '..');
}

function parseAvatar(value: unknown): BotDescriptorAvatar | undefined | false {
  if (value === undefined) return undefined;
  const source = record(value);
  if (source === undefined) return false;
  const recipe = record(source['recipe']);
  const image = source['image'];
  if (recipe !== undefined && image === undefined) return { recipe };
  if (recipe === undefined && typeof image === 'string' && isDescriptorImagePath(image.trim())) {
    return { image: image.trim().replace(/^\.\//u, '') };
  }
  return false;
}

function parseRoles(value: unknown): string[] | undefined | false {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > MAX_DESCRIPTOR_ROLES) return false;
  const roles: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') return false;
    const role = item.trim();
    if (role.length === 0 || [...role].length > MAX_DESCRIPTOR_ROLE_LENGTH) return false;
    if (!roles.includes(role)) roles.push(role);
  }
  return roles;
}

export function parseBotDescriptor(text: string): BotDescriptor | undefined {
  if (new TextEncoder().encode(text).length > MAX_DESCRIPTOR_BYTES) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  const source = record(parsed);
  if (source === undefined) return undefined;
  const descriptor: BotDescriptor = {};
  const name = source['name'];
  if (name !== undefined) {
    if (typeof name !== 'string') return undefined;
    const trimmed = name.trim();
    if (trimmed.length === 0 || [...trimmed].length > MAX_DESCRIPTOR_NAME_LENGTH) return undefined;
    descriptor.name = trimmed;
  }
  const roles = parseRoles(source['roles']);
  if (roles === false) return undefined;
  if (roles !== undefined && roles.length > 0) descriptor.roles = roles;
  const avatar = parseAvatar(source['avatar']);
  if (avatar === false) return undefined;
  if (avatar !== undefined) descriptor.avatar = avatar;
  return descriptor;
}
