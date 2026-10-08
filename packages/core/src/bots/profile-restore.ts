import { join } from 'node:path';
import type { PersonaBotRegistry } from './registry.js';
import type { PersonaBotDeletion } from './deletion.js';
import { memoryOwnership } from './deletion.js';
import { attachOperationalModule, type OperationalDatabaseOwner } from '../database/owner.js';

export interface RestoredMemoryLocator {
  slug: string;
  repository: string;
  disposition: 'retained' | 'erased';
}
export function restoreProfileRegistry(
  database: OperationalDatabaseOwner,
  registry: PersonaBotRegistry,
  locators: readonly RestoredMemoryLocator[],
  stagingHome: string,
  destinationHome: string,
): void {
  const port = attachOperationalModule(database, 'bot-registry');
  const records = registry.listHistorical();
  if (
    records.length !== locators.length ||
    new Set(locators.map((item) => item.slug)).size !== records.length
  )
    throw new Error('Memory locator coverage does not match Registry');
  port.transaction((db) => {
    for (const record of records) {
      const locator = locators.find((item) => item.slug === record.slug);
      if (!locator) throw new Error('Required Memory locator is missing');
      const local = locator.repository || 'erased/' + record.slug;
      const target = join(destinationHome, 'botharness', local);
      const deletionRow = db
        .prepare('SELECT body FROM persona_bot_deletions WHERE slug = ?')
        .get(record.slug);
      const deletion =
        deletionRow && (JSON.parse(String(deletionRow.body)) as PersonaBotDeletion | undefined);
      if ((locator.disposition === 'erased') !== (deletion?.memory === 'erased'))
        throw new Error('Erased Memory has no canonical deletion proof');
      const proof =
        locator.disposition === 'retained'
          ? { ...memoryOwnership(join(stagingHome, 'botharness', local)), path: target }
          : undefined;
      const restored = {
        ...record,
        memoryDir: target,
        workspaces: [],
        paused: true,
        browserAccess: false,
        computerAccess: false,
      };
      db.prepare('UPDATE persona_bots SET body = ? WHERE slug = ?').run(
        JSON.stringify(restored),
        record.slug,
      );
      if (deletion)
        db.prepare('UPDATE persona_bot_deletions SET body = ? WHERE slug = ?').run(
          JSON.stringify({
            ...deletion,
            memoryDir: target,
            ...(proof ? { ownership: proof } : {}),
          }),
          record.slug,
        );
      if (proof)
        db.prepare(
          'INSERT INTO persona_bot_memory_ownership (slug, body) VALUES (?, ?) ON CONFLICT(slug) DO UPDATE SET body = excluded.body',
        ).run(record.slug, JSON.stringify(proof));
    }
  });
}
