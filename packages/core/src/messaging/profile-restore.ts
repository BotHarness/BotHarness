import { attachOperationalModule, type OperationalDatabaseOwner } from '../database/owner.js';
import type { ProfileBackupManifest } from '../portability/package.js';

export function profileMessagingDependencies(
  database: OperationalDatabaseOwner,
): ProfileBackupManifest['dependencies'] {
  return attachOperationalModule(database, 'messaging').read((db) =>
    db
      .prepare('SELECT bot_slug, provider_id, platform, account_ref FROM messaging_bindings')
      .all()
      .map((row) => ({
        kind: 'provider' as const,
        scope: String(row.bot_slug),
        reference: JSON.stringify({
          provider: row.provider_id,
          platform: row.platform,
          account: row.account_ref,
        }),
        required: false,
        contract: 'messaging-binding/1',
      })),
  );
}
export function suspendRestoredMessaging(database: OperationalDatabaseOwner): void {
  const port = attachOperationalModule(database, 'messaging');
  port.transaction((db) => {
    db.exec(
      'UPDATE messaging_bindings SET enabled = 0, enabled_inherited = 0, revision = revision + 1',
    );
    for (const row of db
      .prepare("SELECT id, body FROM messaging_pairings WHERE status IN ('pending', 'approved')")
      .all()) {
      const body = {
        ...JSON.parse(String(row.body)),
        status: 'revoked',
        reviewedAt: new Date().toISOString(),
      };
      body.revision += 1;
      db.prepare("UPDATE messaging_pairings SET body = ?, status = 'revoked' WHERE id = ?").run(
        JSON.stringify(body),
        String(row.id),
      );
    }
    for (const row of db.prepare('SELECT id, body FROM messaging_grants').all()) {
      const body = JSON.parse(String(row.body));
      body.suspendedReason = 'rebind-required';
      body.revision += 1;
      db.prepare('UPDATE messaging_grants SET body = ?, revision = ? WHERE id = ?').run(
        JSON.stringify(body),
        body.revision,
        String(row.id),
      );
    }
    for (const row of db.prepare('SELECT id, body FROM messaging_conversation_ingests').all()) {
      const body = JSON.parse(String(row.body));
      body.enabled = false;
      body.revision += 1;
      db.prepare(
        'UPDATE messaging_conversation_ingests SET body = ?, revision = ? WHERE id = ?',
      ).run(JSON.stringify(body), body.revision, String(row.id));
    }
    for (const row of db
      .prepare(
        "SELECT id, state, body FROM messaging_outbox WHERE state IN ('pending', 'in-flight')",
      )
      .all()) {
      const state = row.state === 'in-flight' ? 'unknown-outcome' : 'cancelled';
      const at = new Date().toISOString();
      const body = {
        ...JSON.parse(String(row.body)),
        state,
        settledAt: at,
        reason: 'disaster-restore-no-replay',
      };
      db.prepare('UPDATE messaging_outbox SET state = ?, body = ? WHERE id = ?').run(
        state,
        JSON.stringify(body),
        String(row.id),
      );
      db.prepare(
        'UPDATE messaging_outbox_attempts SET state = ?, finished_at = ?, reason = ? WHERE intent_id = ?',
      ).run(state, at, body.reason, String(row.id));
    }
  });
}
