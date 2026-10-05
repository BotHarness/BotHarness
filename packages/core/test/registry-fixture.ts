import { afterEach } from 'vitest';
import { createPersonaBotRegistry, type PersonaBotRegistryOptions } from '../src/bots/registry.js';
import {
  mountOperationalDatabase,
  type OperationalDatabaseOwner,
  type OperationalDatabaseOwnerOptions,
} from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';

const owners = new Map<string, OperationalDatabaseOwner>();
export function registryDatabase(
  rootDir: string,
  options: Omit<OperationalDatabaseOwnerOptions, 'dshHome' | 'schemaPlan'> = {},
): OperationalDatabaseOwner {
  const current = owners.get(rootDir);
  if (current !== undefined) return current;
  const owner = mountOperationalDatabase({
    dshHome: rootDir,
    schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
    ...options,
  });
  owners.set(rootDir, owner);
  return owner;
}
export function createTestRegistry(
  options: Omit<PersonaBotRegistryOptions, 'database'> & { database?: OperationalDatabaseOwner },
) {
  const database = options.database ?? registryDatabase(options.rootDir);
  owners.set(options.rootDir, database);
  return createPersonaBotRegistry({ ...options, database });
}
afterEach(() => {
  for (const owner of new Set(owners.values())) owner.close();
  owners.clear();
});
