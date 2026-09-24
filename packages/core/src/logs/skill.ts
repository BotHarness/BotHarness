/**
 * Runtime skill contribution for reading operational logs (issue #248, Q6).
 *
 * Agents get no dedicated log tool by design (ADR-0064); instead the Host
 * registers this model-only skill whose body is the reader guide. The skill
 * catalog carries only name + description until the model loads the body on
 * demand, so unread logs cost one directory line, not the guide.
 *
 * Single source: `docs/dev/guides/reading-operational-logs.md` is the
 * authored text and the docs site renders it; `LOGS_SKILL_CONTENT` is the
 * registered copy. `log-skill.test.ts` fails on any drift between the two.
 */
export const LOGS_SKILL_NAME = 'reading-operational-logs';

export const LOGS_SKILL_DESCRIPTION =
  'Read BotHarness operational logs (logs.db) directly: file location, read-only open, query shapes, result caps.';

export const LOGS_SKILL_WHEN_TO_USE =
  'When debugging why something happened, inspecting recent plugin or Computer activity, or answering what-failed questions in-harness.';

export const LOGS_SKILL_INVOCATION = {
  modelInvocable: true,
  userInvocable: false,
} as const;

/**
 * Discovery bucket shown in the catalog. `register()` defaults an omitted
 * provider to `"runtime"` but never fills `source` — and the loader's
 * `validateDefinition` throws `source must be a string` on `get()`, so a
 * skill without an explicit source lists fine but never loads (diagnosed
 * live in #248: catalog showed the skill, two model `skill()` calls failed).
 */
export const LOGS_SKILL_SOURCE = 'runtime';

/** Attribution for the loaded body; kept distinct from the default. */
export const LOGS_SKILL_PROVIDER = 'botharness-core';

export const LOGS_SKILL_CONTENT = `# Reading operational logs as an agent

Product meaning: [ADR-0063](../adr/0063-operational-log-database.md) (topology),
[ADR-0064](../adr/0064-agent-log-access-without-a-tool.md) (why there is no
tool). Code facts: \`packages/core/src/logs/log-db.ts\` (schema, \`LogQuery\`).

There is no log-reading tool and there will not be one: you already have
everything needed. This guide is the whole contract — read it when you need
logs, never assume it is in context otherwise.

## Locate the file

Every shell call receives \`DSH_HOME\` in its environment. The database is:

\`\`\`
$DSH_HOME/botharness/logs.db
\`\`\`

## Open read-only, never write

- Prefer a read-only open (e.g. Node \`new DatabaseSync(path, { readOnly: true })\`,
  or SQLite URI \`file:<path>?mode=ro\`). This reads the \`-wal\` normally and
  never takes a write lock.
- Do NOT use \`immutable=1\` on the live file: it tells SQLite to ignore the
  \`-wal\`, which yields a stale or even table-less view (verified live: the
  schema itself can live in the WAL). Immutable opens are only for
  fully-checkpointed copies.
- Never write, checkpoint, or migrate from an agent session. The Host owns the
  single write connection.
- Never copy \`logs.db\` alone for offline analysis: without its \`-wal\` sidecar
  the copy is stale or corrupt. Copy the \`-wal\` (and \`-shm\`) with it, or query
  the live file read-only.

## Query shapes (mirroring \`LogQuery\`)

Newest-first, bounded — the same vocabulary as \`GET /api/computer/logs\`:

\`\`\`sql
SELECT id, ts, plugin, owner, kind, detail, principal, bot,
       orchestrator_session, assignment_session, trace_id, payload
  FROM log_entries
 WHERE (plugin = :plugin)            -- optional exact match
   AND (owner = :owner)              -- optional; a filter dimension, not a gate:
                                     -- Developer Mode reads see every owner
   AND (:entity IN (principal, bot, orchestrator_session,
                    assignment_session, trace_id))  -- optional causation match
   AND (ts >= :since)                -- optional epoch milliseconds
 ORDER BY ts DESC, id DESC
 LIMIT 100;                          -- default 100, never above 1000
\`\`\`

- Full-text needs (\`detail\` / \`payload\` substring search) scan by construction;
  bound them with a time range first.
- Keep result sets small: select the columns you need, not \`SELECT *\` over
  wide ranges — wide payload reads land in session history until compaction.

## Rules that are not negotiable

- **No secrets, ever.** Log rows follow the existing no-secrets rule; your
  queries must not try to route around it.
- **Developer Mode gates Humans, not you.** Its on/off state changes nothing
  about your ability to read. Do not treat it as permission or refusal.
- **Schema drifts by generation.** If a column from this guide is missing,
  check \`log_schema.version\` and \`packages/core/src/logs/log-db.ts\` — update
  this guide when you learn something new about the schema.
`;
