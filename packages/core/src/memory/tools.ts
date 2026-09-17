import { defineTool, type ToolDefinition, type ToolRunContext } from '@deepseek-ai/dsh-tools';

import { formatMemoryTree } from './tree.js';
import type { MemoryStore } from './store.js';
import { GROUP_SCOPE, type MemoryScope } from './visibility.js';

export interface MemoryToolsOptions {
  resolveStore: (exec: ToolRunContext) => MemoryStore | undefined;
  resolveScope?: (exec: ToolRunContext) => MemoryScope;
}

const READ_DESCRIPTION =
  'Read one Markdown file from the calling PersonaBot memory. Paths are relative to the memory ' +
  'root (for example customers/acme.md). Private entries are only readable in their owner DM.';

const SEARCH_DESCRIPTION =
  'Search the calling PersonaBot memory with a case-insensitive substring match. Returns ' +
  'memory-relative path, line number and the matching line. Private entries are only visible ' +
  'in their owner DM; prefer this over reading files one by one.';

const WRITE_DESCRIPTION =
  'Create or overwrite one Markdown file in the calling PersonaBot memory. Every write requires ' +
  'a one-line summary (it becomes the git commit message) and is committed atomically. Use ' +
  'sources to record where the fact came from (chat, date, sender). Mark confidences from a DM ' +
  'as visibility=private. MEMORY.md and PERSONA.md cannot be written.';

const LIST_DESCRIPTION =
  'List the calling PersonaBot memory tree: memory-relative paths with their summaries and ' +
  'updated-at timestamps, plus folded counts for oversized directories. Private entries are ' +
  'only visible in their owner DM.';

export function createMemoryTools(options: MemoryToolsOptions): ToolDefinition[] {
  const scopeFor = options.resolveScope ?? ((): MemoryScope => GROUP_SCOPE);
  const storeFor = (exec: ToolRunContext, toolName: string): MemoryStore => {
    const store = options.resolveStore(exec);
    if (store === undefined) {
      throw new Error(`${toolName}: no PersonaBot is bound to this session`);
    }
    return store;
  };

  return [
    defineTool({
      name: 'memory_read',
      description: READ_DESCRIPTION,
      parameters: {
        path: {
          type: 'string',
          required: true,
          description: 'Memory-relative .md path, for example customers/acme.md',
        },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      async execute(args, exec) {
        const store = storeFor(exec, 'memory_read');
        const entry = store.read(args.path, scopeFor(exec));
        if (entry === undefined) {
          throw new Error(`memory_read: no memory file at ${args.path}`);
        }
        return entry.body;
      },
    }),

    defineTool({
      name: 'memory_search',
      description: SEARCH_DESCRIPTION,
      parameters: {
        query: { type: 'string', required: true, description: 'Case-insensitive substring' },
      },
      output: {
        schema: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              path: { type: 'string', required: true },
              line: { type: 'integer', required: true },
              excerpt: { type: 'string', required: true },
            },
          },
        },
        render: (args, hits) => [
          {
            type: 'text',
            text:
              hits.length === 0
                ? `No matches for "${args.query}".`
                : hits.map((hit) => `${hit.path}:${hit.line}: ${hit.excerpt}`).join('\n'),
          },
        ],
      },
      async execute(args, exec) {
        const store = storeFor(exec, 'memory_search');
        return store.search(args.query, scopeFor(exec));
      },
    }),

    defineTool({
      name: 'memory_write',
      description: WRITE_DESCRIPTION,
      parameters: {
        path: { type: 'string', required: true, description: 'Memory-relative .md path' },
        body: { type: 'string', required: true, description: 'Full Markdown body of the file' },
        summary: {
          type: 'string',
          required: true,
          description: 'One-line summary of the change; becomes the git commit message',
        },
        sources: {
          type: 'array',
          items: { type: 'string' },
          description: 'Where this came from, for example "feishu:group-42" or "2026-09-17"',
        },
        visibility: {
          type: 'string',
          enum: ['shared', 'private'],
          description: 'shared (default) is visible in every chat; private only in the owner DM',
        },
        tags: { type: 'array', items: { type: 'string' }, description: 'Optional topic tags' },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      async execute(args, exec) {
        const store = storeFor(exec, 'memory_write');
        const scope = scopeFor(exec);
        const visibility = args.visibility ?? 'shared';
        let owner: string | undefined;
        if (visibility === 'private') {
          if (scope.kind !== 'dm') {
            throw new Error('memory_write: private memory can only be written in a DM');
          }
          owner = scope.owner;
        }
        const result = await store.write(
          {
            path: args.path,
            body: args.body,
            summary: args.summary,
            visibility,
            ...(args.sources === undefined ? {} : { sources: args.sources }),
            ...(args.tags === undefined ? {} : { tags: args.tags }),
            ...(owner === undefined ? {} : { owner }),
          },
          scope,
        );
        if (!result.ok) {
          throw new Error(
            `memory_write: refused to overwrite ${result.path} (${result.reason}): ` +
              'private entries can only be modified in their owner DM',
          );
        }
        return `Wrote ${result.path} — ${result.summary} (commit ${result.commit.slice(0, 7)})`;
      },
    }),

    defineTool({
      name: 'memory_list',
      description: LIST_DESCRIPTION,
      parameters: {},
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      async execute(_args, exec) {
        const store = storeFor(exec, 'memory_list');
        const text = formatMemoryTree(store.tree(scopeFor(exec)));
        return text.length === 0 ? 'Memory is empty.' : text;
      },
    }),
  ];
}
