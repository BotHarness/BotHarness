import { createHash } from 'node:crypto';
import {
  constants,
  closeSync,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';

export class ProfileBackupError extends Error {
  constructor(
    readonly code: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ProfileBackupError';
  }
}

export const digest = (data: Uint8Array): string => createHash('sha256').update(data).digest('hex');
export function portablePath(path: string): string {
  if (path.length > 1000 || path !== path.normalize('NFC') || path.includes('\\'))
    throw new ProfileBackupError('package-invalid', 'Unsupported package path');
  const parts = path.split('/');
  if (
    parts.some(
      (part) =>
        !part ||
        part === '.' ||
        part === '..' ||
        /[\u0000-\u001f\u007f<>:"|?*]/u.test(part) ||
        /[. ]$/u.test(part) ||
        /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/iu.test(part),
    )
  )
    throw new ProfileBackupError('package-invalid', 'Unsafe package path');
  return path;
}

export function physicalDirectory(path: string): string {
  let current = path;
  while (true) {
    const info = lstatSync(current);
    if (!info.isDirectory() || info.isSymbolicLink())
      throw new ProfileBackupError('snapshot-changed', 'Managed directory contains a link');
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return realpathSync(path);
}

export function treeFiles(root: string): { path: string; local: string }[] {
  const canonical = physicalDirectory(root);
  const result: { path: string; local: string }[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const path = join(dir, entry.name);
      if (entry.isSymbolicLink())
        throw new ProfileBackupError('snapshot-changed', 'Managed files contain a link');
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile())
        result.push({ path, local: portablePath(relative(canonical, path).split(sep).join('/')) });
      else throw new ProfileBackupError('snapshot-changed', 'Unsupported managed file');
    }
  };
  walk(canonical);
  return result;
}

export function fixedFile(
  path: string,
  maximumBytes = 512 * 1024 * 1024,
): { data: Buffer; verify(): void } {
  physicalDirectory(dirname(path));
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const before = fstatSync(fd);
    if (before.size > maximumBytes)
      throw new ProfileBackupError('too-large', 'Managed file exceeds package resource bound');
    const named = lstatSync(path);
    if (
      !before.isFile() ||
      named.isSymbolicLink() ||
      before.ino !== named.ino ||
      before.dev !== named.dev
    )
      throw new ProfileBackupError('snapshot-changed', 'Managed file identity changed');
    const data = readFileSync(fd);
    const hash = digest(data);
    return {
      data,
      verify() {
        physicalDirectory(dirname(path));
        const after = lstatSync(path);
        if (
          !after.isFile() ||
          after.isSymbolicLink() ||
          after.dev !== before.dev ||
          after.ino !== before.ino ||
          after.size !== before.size ||
          after.mtimeMs !== before.mtimeMs ||
          after.ctimeMs !== before.ctimeMs ||
          digest(readFileSync(path)) !== hash
        )
          throw new ProfileBackupError(
            'snapshot-changed',
            'Managed file changed during capture; retry',
          );
      },
    };
  } finally {
    closeSync(fd);
  }
}
