import { createHash, randomUUID } from 'node:crypto';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import type { ChannelMessage } from '../channels/channel.js';
import { isChannelAttachmentRef, type ChannelAttachmentRef } from './ref.js';
import { ChannelAttachmentError, type AttachmentStore } from './store.js';

export interface RetainedAttachmentMessage {
  sourceEventId: string;
  message: ChannelMessage;
}

interface Binding {
  file_id: string;
  original_json: string;
  target_json: string | null;
  state: 'pending' | 'ready';
}

export interface AttachmentMigrationResult {
  converted: number;
  failed: number;
  resumed: number;
}

export function createLegacyAttachmentMigration(
  database: OperationalDatabaseModulePort,
  files: AttachmentStore | undefined,
  retained: () => RetainedAttachmentMessage[],
  warn?: (message: string) => void,
) {
  let running: Promise<AttachmentMigrationResult> | undefined;
  const binding = (sourceEventId: string, index: number): Binding | undefined =>
    database.read((db) =>
      db
        .prepare(
          'SELECT file_id, original_json, target_json, state FROM attachment_file_bindings WHERE source_event_id = ? AND attachment_index = ?',
        )
        .get(sourceEventId, index),
    ) as Binding | undefined;
  const resolve = (
    sourceEventId: string,
    index: number,
    ref: ChannelAttachmentRef,
  ): ChannelAttachmentRef => {
    if (ref.fileId !== undefined) return ref;
    const row = binding(sourceEventId, index);
    if (row === undefined || row.state !== 'ready') return ref;
    if (row.original_json !== JSON.stringify(ref))
      throw new ChannelAttachmentError(
        'Attachment migration reference changed; repair required',
        'invalid-ref',
      );
    let value: unknown;
    try {
      value = JSON.parse(row.target_json ?? 'null');
    } catch {}
    if (!isChannelAttachmentRef(value) || value.fileId !== row.file_id)
      throw new ChannelAttachmentError(
        'Attachment migration record is unavailable; repair required',
        'not-found',
      );
    return value;
  };
  const run = async (signal?: AbortSignal): Promise<AttachmentMigrationResult> => {
    const result = { converted: 0, failed: 0, resumed: 0 };
    if (files === undefined) return result;
    const start = Date.now();
    let announced = false;
    for (const { sourceEventId, message } of retained()) {
      for (const [index, ref] of (message.attachments ?? []).entries()) {
        if (signal?.aborted) return result;
        if (ref.hash === undefined) continue;
        let row = binding(sourceEventId, index);
        if (row?.state === 'ready') continue;
        if (!announced) {
          warn?.('attachment-migration phase=started initiator=Host-startup');
          announced = true;
        }
        if (row === undefined) {
          const id = 'file:' + randomUUID();
          database.transaction(
            (db) =>
              db
                .prepare(`
            INSERT INTO attachment_file_bindings
              (source_event_id, attachment_index, file_id, original_json, state)
            VALUES (?, ?, ?, ?, 'pending')
          `)
                .run(sourceEventId, index, id, JSON.stringify(ref)),
            [],
          );
          row = binding(sourceEventId, index)!;
        } else result.resumed += 1;
        try {
          if (row.original_json !== JSON.stringify(ref))
            throw new ChannelAttachmentError('Legacy reference changed', 'invalid-ref');
          const source = await files.download(ref.hash, ref.name, signal);
          if (source.ref.size !== ref.size || source.ref.mime !== ref.mime) {
            await source.body.cancel();
            throw new ChannelAttachmentError(
              'Legacy metadata does not match current object',
              'corrupt',
            );
          }
          const data = async function* () {
            const reader = source.body.getReader();
            try {
              while (true) {
                const next = await reader.read();
                if (next.done) break;
                yield next.value;
              }
            } finally {
              await reader.cancel().catch(() => undefined);
              reader.releaseLock();
            }
          };
          const target = await files
            .upload({
              data: data(),
              name: ref.name,
              uploadId: row.file_id.slice(5),
              ...(signal === undefined ? {} : { signal }),
            })
            .finally(async () => {
              if (!source.body.locked) await source.body.cancel().catch(() => undefined);
            });
          if (target.fileId !== row.file_id)
            throw new ChannelAttachmentError(
              'Converted attachment identity changed',
              'invalid-ref',
            );
          const check = await files.download(row.file_id, undefined, signal);
          const reader = check.body.getReader();
          const checksum = createHash('sha256');
          let size = 0;
          try {
            while (true) {
              const next = await reader.read();
              if (next.done) break;
              checksum.update(next.value);
              size += next.value.byteLength;
              if (size > ref.size)
                throw new ChannelAttachmentError(
                  'Converted attachment grew before publication',
                  'corrupt',
                );
            }
          } finally {
            await reader.cancel().catch(() => undefined);
            reader.releaseLock();
          }
          if (
            size !== ref.size ||
            check.ref.mime !== ref.mime ||
            'sha256:' + checksum.digest('hex') !== ref.hash
          )
            throw new ChannelAttachmentError('Converted attachment failed verification', 'corrupt');
          signal?.throwIfAborted();
          database.transaction(
            (db) =>
              db
                .prepare(`
            UPDATE attachment_file_bindings SET state = 'ready', target_json = ?, last_error = NULL
            WHERE source_event_id = ? AND attachment_index = ? AND file_id = ?
          `)
                .run(JSON.stringify(target), sourceEventId, index, row.file_id),
            [],
          );
          result.converted += 1;
        } catch (error) {
          if (signal?.aborted) return result;
          const code = error instanceof ChannelAttachmentError ? error.code : 'conversion-failed';
          database.transaction(
            (db) =>
              db
                .prepare(`
            UPDATE attachment_file_bindings SET last_error = ? WHERE source_event_id = ? AND attachment_index = ?
          `)
                .run(code, sourceEventId, index),
            [],
          );
          result.failed += 1;
          warn?.(
            `attachment-migration phase=refused source=${encodeURIComponent(sourceEventId).slice(0, 80)} index=${index} code=${code} action=repair-legacy-object-and-restart`,
          );
        }
      }
    }
    if (announced)
      warn?.(
        `attachment-migration phase=complete converted=${result.converted} failed=${result.failed} resumed=${result.resumed} durationMs=${Date.now() - start}`,
      );
    return result;
  };
  return {
    resolve,
    project(sourceEventId: string, message: ChannelMessage): ChannelMessage {
      if (!message.attachments?.some((ref) => ref.hash !== undefined)) return message;
      return {
        ...message,
        attachments: message.attachments.map((ref, index) => resolve(sourceEventId, index, ref)),
      };
    },
    pendingFiles(): string[] {
      return database
        .read((db) =>
          db.prepare("SELECT file_id FROM attachment_file_bindings WHERE state = 'pending'").all(),
        )
        .map((row) => String(row.file_id));
    },
    migrate(signal?: AbortSignal): Promise<AttachmentMigrationResult> {
      if (running !== undefined) return running;
      const operation = run(signal);
      running = operation;
      void operation
        .finally(() => {
          if (running === operation) running = undefined;
        })
        .catch(() => undefined);
      return operation;
    },
  };
}
