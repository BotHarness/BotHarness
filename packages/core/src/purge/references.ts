import type { DatabaseSync } from 'node:sqlite';
import { isChannelAttachmentRef, attachmentIdentity } from '../attachments/ref.js';
import { sourceMediaUploadId } from '../messaging/media-identity.js';

export function managedSourceFiles(db: DatabaseSync, id: string): Map<string, string> {
  const files = new Map<string, string>();
  const row = db
    .prepare('SELECT payload_json FROM source_events WHERE source_event_id = ?')
    .get(id);
  const payload = JSON.parse(String(row?.payload_json ?? '{}'));
  const add = (ref: unknown) => {
    if (isChannelAttachmentRef(ref)) files.set(attachmentIdentity(ref), ref.name);
  };
  for (const ref of payload.attachments ?? []) add(ref);
  for (const binding of db
    .prepare('SELECT * FROM attachment_file_bindings WHERE source_event_id = ?')
    .all(id)) {
    add(JSON.parse(String(binding.original_json)));
    if (binding.target_json) add(JSON.parse(String(binding.target_json)));
    files.set(String(binding.file_id), files.get(String(binding.file_id)) ?? 'attachment');
  }
  for (const binding of db
    .prepare('SELECT file_id, role FROM messaging_managed_files WHERE source_event_id = ?')
    .all(id))
    files.set(String(binding.file_id), String(binding.role));
  for (const intent of db
    .prepare("SELECT body FROM messaging_outbox WHERE json_extract(body, '$.sourceEventId') = ?")
    .all(id))
    add(JSON.parse(String(intent.body)).file);
  const source = payload.external;
  if (source?.event?.attachments) {
    const grant = db.prepare('SELECT body FROM messaging_grants WHERE id = ?').get(source.grantId);
    const ingest =
      source.ingestId &&
      db
        .prepare('SELECT body FROM messaging_conversation_ingests WHERE id = ?')
        .get(source.ingestId);
    const authority = grant ?? ingest;
    if (authority) {
      const providerId = JSON.parse(String(authority.body)).providerId;
      for (const ref of source.event.attachments)
        files.set(
          'file:' +
            sourceMediaUploadId(
              providerId,
              source.event.fingerprint,
              source.event.conversation.id,
              ref.id,
            ),
          ref.name,
        );
    }
  }
  return files;
}

export function retainedManagedFiles(
  db: DatabaseSync,
  excluding: ReadonlySet<string> = new Set(),
): Set<string> {
  const files = new Set<string>();
  for (const row of db.prepare('SELECT source_event_id FROM source_events').all()) {
    const id = String(row.source_event_id);
    if (!excluding.has(id)) for (const file of managedSourceFiles(db, id).keys()) files.add(file);
  }
  for (const row of db.prepare('SELECT body FROM messaging_outbox').all()) {
    const intent = JSON.parse(String(row.body));
    if (!excluding.has(intent.sourceEventId) && isChannelAttachmentRef(intent.file))
      files.add(attachmentIdentity(intent.file));
  }
  return files;
}
