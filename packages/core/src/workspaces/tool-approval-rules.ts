import { randomUUID } from 'node:crypto';
import type { OperationalDatabaseModulePort } from '../database/owner.js';

export type ToolRuleKind = 'exact' | 'all-opaque';
export interface ToolApprovalRule {
  id: string;
  botSlug: string;
  role: 'orchestrator' | 'assignment';
  scopeKey: string;
  kind: ToolRuleKind;
  toolName: string;
  input: string;
  createdAt: string;
  revokedAt?: string;
}
interface RuleRow {
  id: string;
  bot_slug: string;
  role: ToolApprovalRule['role'];
  scope_key: string;
  kind: ToolRuleKind;
  tool_name: string;
  input: string;
  created_at: string;
  revoked_at: string | null;
}
function record(row: RuleRow): ToolApprovalRule {
  return {
    id: row.id,
    botSlug: row.bot_slug,
    role: row.role,
    scopeKey: row.scope_key,
    kind: row.kind,
    toolName: row.tool_name,
    input: row.input,
    createdAt: row.created_at,
    ...(row.revoked_at === null ? {} : { revokedAt: row.revoked_at }),
  };
}
export interface ToolApprovalRuleStore {
  list(botSlug: string): ToolApprovalRule[];
  match(
    input: Pick<ToolApprovalRule, 'botSlug' | 'role' | 'scopeKey' | 'toolName' | 'input'>,
  ): ToolApprovalRule | undefined;
  createPending(
    input: Pick<ToolApprovalRule, 'botSlug' | 'role' | 'scopeKey' | 'kind' | 'toolName' | 'input'>,
  ): ToolApprovalRule;
  activate(botSlug: string, id: string): void;
  revoke(botSlug: string, id: string): ToolApprovalRule | undefined;
}
export function createToolApprovalRuleStore(
  database: OperationalDatabaseModulePort,
): ToolApprovalRuleStore {
  return {
    list(botSlug) {
      const rows = database.read((connection) =>
        connection
          .prepare(
            'SELECT * FROM tool_approval_rules WHERE bot_slug = ? AND active = 1 ORDER BY created_at DESC, id',
          )
          .all(botSlug),
      ) as unknown as RuleRow[];
      return rows.map(record);
    },
    match(input) {
      const row = database.read((connection) =>
        connection
          .prepare(
            `SELECT * FROM tool_approval_rules
         WHERE bot_slug = ? AND role = ? AND scope_key = ? AND active = 1 AND revoked_at IS NULL
           AND ((kind = 'exact' AND tool_name = ? AND input = ?) OR kind = 'all-opaque')
         ORDER BY CASE kind WHEN 'exact' THEN 0 ELSE 1 END, created_at DESC LIMIT 1`,
          )
          .get(input.botSlug, input.role, input.scopeKey, input.toolName, input.input),
      ) as RuleRow | undefined;
      return row === undefined ? undefined : record(row);
    },
    createPending(input) {
      const row: ToolApprovalRule = {
        ...input,
        id: randomUUID(),
        createdAt: new Date().toISOString(),
      };
      database.transaction(
        (connection) => {
          connection
            .prepare(
              `INSERT INTO tool_approval_rules
           (id, bot_slug, role, scope_key, kind, tool_name, input, created_at, active)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
            )
            .run(
              row.id,
              row.botSlug,
              row.role,
              row.scopeKey,
              row.kind,
              row.toolName,
              row.input,
              row.createdAt,
            );
        },
        ['tool-approval-rules'],
      );
      return row;
    },
    activate(botSlug, id) {
      database.transaction(
        (connection) => {
          const result = connection
            .prepare(
              'UPDATE tool_approval_rules SET active = 1 WHERE bot_slug = ? AND id = ? AND revoked_at IS NULL',
            )
            .run(botSlug, id);
          if (result.changes !== 1) throw new Error('Tool approval rule is unavailable');
        },
        ['tool-approval-rules'],
      );
    },
    revoke(botSlug, id) {
      return database.transaction(
        (connection) => {
          connection
            .prepare(
              'UPDATE tool_approval_rules SET revoked_at = COALESCE(revoked_at, ?) WHERE bot_slug = ? AND id = ?',
            )
            .run(new Date().toISOString(), botSlug, id);
          const row = connection
            .prepare('SELECT * FROM tool_approval_rules WHERE bot_slug = ? AND id = ?')
            .get(botSlug, id) as RuleRow | undefined;
          return row === undefined ? undefined : record(row);
        },
        ['tool-approval-rules'],
      );
    },
  };
}
