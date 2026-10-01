import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createAttachmentStore } from '../src/attachments/store.js';
import { saveAttachmentFile, importAttachmentFile } from '../src/attachments/file-operations.js';
import { authorizedPathRoot } from '../src/workspaces/grant-native-tools.js';
import { mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createTempRoot } from './helpers.js';
import { createTestWorkspaceGrants, TEST_GRANT_ID } from './workspace-grant-fixture.js';

const cleanup: Array<() => void> = [];
afterEach(() => {
  for (const close of cleanup.splice(0)) close();
});
async function fixture() {
  const home = realpathSync(createTempRoot('bh-file-operations-'));
  const project = join(home, 'project');
  mkdirSync(project);
  const outside = join(home, 'outside');
  mkdirSync(outside);
  const owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
  cleanup.push(() => {
    owner.close();
    rmSync(home, { recursive: true, force: true });
  });
  const grants = createTestWorkspaceGrants(owner, project);
  const attachments = createAttachmentStore({ rootDir: join(home, 'attachments') });
  const bytes = Buffer.from('arbitrary original bytes, ZIP or another format');
  const original = await attachments.upload({
    data: (async function* () {
      yield bytes;
    })(),
    name: 'orders.zip',
  });
  let visible = true;
  const deps = {
    botSlug: 'ada',
    grants,
    attachments,
    source: () => {
      if (!visible) throw new Error('Source message is unavailable');
      return attachments.current(original);
    },
  };
  const input = {
    messageId: 'message-1',
    fileId: original.fileId!,
    grantId: TEST_GRANT_ID,
    destinationPath: 'orders.zip',
  };
  const save = (extra = {}) => saveAttachmentFile({ ...input, ...extra }, deps);
  const enable = () => grants.setOrchestratorWrite('ada', TEST_GRANT_ID, true);
  const imported = (path: string, signal?: AbortSignal) =>
    importAttachmentFile(
      { filePath: path, ...(signal === undefined ? {} : { signal }) },
      {
        attachments,
        authorize: (target) => {
          const grant = grants.requireActive('ada', TEST_GRANT_ID);
          if (authorizedPathRoot([grant.workspacePath], target) === undefined)
            throw new Error('Outside authorized directory');
        },
      },
    );
  return {
    home,
    project,
    outside,
    grants,
    attachments,
    bytes,
    original,
    save,
    enable,
    imported,
    hide: () => {
      visible = false;
    },
    deps,
    input,
  };
}

describe('Attachment file operations', () => {
  it('preserves source bytes and publishes an independent downloadable result after ordinary edits/moves', async () => {
    const f = await fixture();
    f.enable();
    const saved = await f.save();
    expect(readFileSync(saved.path)).toEqual(f.bytes);
    writeFileSync(saved.path, 'processed output');
    const result = await f.imported(saved.path);
    expect(result.fileId).not.toBe(f.original.fileId);
    const original = await f.attachments.download(f.original.fileId!);
    expect(Buffer.from(await new Response(original.body).arrayBuffer())).toEqual(f.bytes);
    const downloaded = await f.attachments.download(result.fileId!);
    expect(await new Response(downloaded.body).text()).toBe('processed output');
    expect(
      createHash('sha256')
        .update(readFileSync(f.attachments.fileTarget(f.original.fileId!).path))
        .digest('hex'),
    ).toBe(createHash('sha256').update(f.bytes).digest('hex'));
  });
  it('requires explicit write access, never overwrites, and checks current source authorization', async () => {
    const f = await fixture();
    await expect(f.save()).rejects.toThrow(/write authorization/);
    f.enable();
    await f.save();
    await expect(f.save()).rejects.toThrow(/EEXIST/);
    expect(readFileSync(join(f.project, 'orders.zip'))).toEqual(f.bytes);
    f.hide();
    await expect(f.save({ destinationPath: 'other.zip' })).rejects.toThrow(/Source/);
    expect(existsSync(join(f.project, 'other.zip'))).toBe(false);
  });
  it('denies traversal, symlinks, other Bot grants, missing inputs and revoked directories', async () => {
    const f = await fixture();
    f.enable();
    symlinkSync(f.outside, join(f.project, 'escape'));
    await expect(f.save({ destinationPath: '../outside/file.zip' })).rejects.toThrow(
      /authorization/,
    );
    await expect(f.save({ destinationPath: 'escape/file.zip' })).rejects.toThrow(/authorization/);
    await expect(saveAttachmentFile(f.input, { ...f.deps, botSlug: 'bob' })).rejects.toThrow(
      /missing or revoked/,
    );
    await expect(f.imported(join(f.project, 'missing.zip'))).rejects.toThrow();
    writeFileSync(join(f.outside, 'secret'), 'outside');
    await expect(f.imported(join(f.outside, 'secret'))).rejects.toThrow(/Outside/);
    symlinkSync(join(f.outside, 'secret'), join(f.project, 'escape-file'));
    await expect(f.imported(join(f.project, 'escape-file'))).rejects.toThrow(/Outside/);
    f.grants.revoke('ada', TEST_GRANT_ID);
    await expect(f.save()).rejects.toThrow(/missing or revoked/);
    await expect(f.imported(join(f.project, 'missing.zip'))).rejects.toThrow(/missing or revoked/);
  });
  it('saves the current managed original, rejects an oversized original and relative output selection', async () => {
    const f = await fixture();
    f.enable();
    writeFileSync(f.attachments.fileTarget(f.original.fileId!).path, 'edited current original');
    const saved = await f.save();
    expect(readFileSync(saved.path, 'utf8')).toBe('edited current original');
    await expect(f.imported('orders.zip')).rejects.toThrow(/absolute/);
    writeFileSync(
      f.attachments.fileTarget(f.original.fileId!).path,
      Buffer.alloc(f.attachments.maxBytes + 1),
    );
    await expect(f.save({ destinationPath: 'oversized.zip' })).rejects.toThrow(/transfer limit/);
    expect(existsSync(join(f.project, 'oversized.zip'))).toBe(false);
  });

  it('cancels transfers and rejects oversized results without publishing an output', async () => {
    const f = await fixture();
    f.enable();
    const abort = new AbortController();
    abort.abort();
    await expect(f.save({ signal: abort.signal })).rejects.toThrow();
    const large = join(f.project, 'large');
    writeFileSync(large, Buffer.alloc(f.attachments.maxBytes + 1));
    await expect(f.imported(large)).rejects.toThrow(/transfer limit/);
    await expect(f.imported(large, abort.signal)).rejects.toThrow();
    expect(existsSync(join(f.project, 'orders.zip'))).toBe(false);
  });
  it('rechecks revoked destination/source during streaming and removes partial files', async () => {
    const f = await fixture();
    f.enable();
    const attachments = {
      ...f.attachments,
      download: async () => ({
        ref: f.original,
        body: new ReadableStream<Uint8Array>({
          pull(controller) {
            f.grants.setOrchestratorWrite('ada', TEST_GRANT_ID, false);
            controller.enqueue(f.bytes);
            controller.close();
          },
        }),
      }),
    };
    await expect(saveAttachmentFile(f.input, { ...f.deps, attachments })).rejects.toThrow(
      /write authorization/,
    );
    expect(existsSync(join(f.project, 'orders.zip'))).toBe(false);
  });
});
