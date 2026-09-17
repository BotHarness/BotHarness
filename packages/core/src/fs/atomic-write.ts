import { randomUUID } from 'node:crypto';
import { renameSync, writeFileSync } from 'node:fs';

export function atomicWriteFile(target: string, content: string): void {
  const temporary = `${target}.${randomUUID()}.tmp`;
  writeFileSync(temporary, content, 'utf8');
  renameSync(temporary, target);
}
