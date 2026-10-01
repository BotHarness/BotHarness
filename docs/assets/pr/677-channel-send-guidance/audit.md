## Integrated closeout audit — #560

Task: `codex/local/01a0f268-9db7-7702-b051-bc1bb94b22b9`. Audited main: `222770648139a7fb97925ae77085cf8f0893463e`; DSH Tools: `0.2.0-rc.1`.

**The original nine slices are completed and merged. #677 corrects the integrated description/documentation gap and remains pending Human QA/merge.** The audit found `channel_send` still naming an unregistered `channel_read_content` Tool and denying local-file import despite the registered `channel_attachment_import`. The bilingual living architecture repeats the nonexistent read Tool name. #677 fixes this existing contract; no new capability or IM provider test is included.

### Delivery and real E2E evidence

| Child | Merged PR | Verified observable behavior                                                                                                 |
| ----- | --------- | ---------------------------------------------------------------------------------------------------------------------------- |
| #561  | #580      | Rename/member removal ACKs omit avatar, membership and invitation history; defensive rename failure.                         |
| #562  | #583      | Two Groups, invitation accept/refuse, current membership and decisions survive restart.                                      |
| #563  | #585      | Selected Group join request, approve/refuse and exact subsequent access.                                                     |
| #564  | #589      | Enums, pagination/search and explicit exact-ID empty result without revealing inaccessible Groups.                           |
| #565  | #596      | Bounded read, full oversized-content reconstruction, exact reply/image identities and omitted Admissions staying pending.    |
| #567  | #603      | Legal attention matrix, invalid combinations rejected before writes, Human override/revision reread and source resets.       |
| #568  | #609      | Bounded contact discovery with stable IDs, same-name colleagues, continuation, full-description search and committed Bot DM. |
| #570  | #617      | Trusted attachment forwarding/native image inspection and actual destination/message acknowledgement.                        |
| #571  | #620      | One committed departure, duplicate no-change, missing/DM failures and canonical authority revocation.                        |

All nine PRs are MERGED, all nine original native children are CLOSED/COMPLETED. The only original native blocker edges are #562 → #561 and #563 → #561; #561 is closed. Human acceptance of the first slice before sibling implementation is recorded in [#561's outcome](https://github.com/BotHarness/BotHarness/issues/561#issuecomment-5913386823).

The nine PR descriptions contain **47 screenshots**; all 47 exact image URLs returned HTTP 200 with PNG content during this closeout. Their existing recorded real DSH E2E evidence is reused here; this audit does not claim a fresh model replay of every slice. PR #673, which produced the audited main revision, has a successful combined lint/format/types/tests/build/docs workflow.

### Integrated regression proof

**74 tests passed in 13 files, no skips** at the exact audited revision. The first run covers 70 tests in group-management, invitation, join, Channel discovery/query/model reads, attention contracts, Group wake policy, source policy, contact discovery, attachment forwarding and Group leave. Four additional existing Inbox-ignore checks cover ignored versus handled/no-reply, prior observation, unread siblings and an ignored admission remaining terminal when its turn fails. No assertions/timeouts were weakened.

The model path [selects serialized content before observing Admissions](https://github.com/BotHarness/BotHarness/blob/222770648139a7fb97925ae77085cf8f0893463e/packages/core/src/runtime/bot-runtime.ts#L3414). Pages and complete oversized-message fragment frames are capped at **12,000 UTF-16 units**; omitted/partial content stays outside the active turn's consumption set. Full fragments must be reconstructed in one turn; changed/cross-message cursors and current-membership loss fail. The projection retains body, author/time, message/Channel IDs, reply identity, attachments and actionable card references, while removing delivery/receipt/revision presentation bookkeeping.

Group command projections are explicit [compact constructors](https://github.com/BotHarness/BotHarness/blob/222770648139a7fb97925ae77085cf8f0893463e/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L39); none of the seven Group create/invite/respond/join/decide/rename/remove model results now serializes a full ChannelRecord. Domain stores still own the full presentation state. `inbox_ignore` throws its internal error decisions; Group leave preserves `unchanged/not-member` rather than fabricating a departure.

### Character costs — not token measurements

Metric: `JSON.stringify({description: tool.description, parameters: tool.parameters}).length` **after pinned `defineTool` conversion**. Units are JS UTF-16 code units of compact JSON. This excludes Tool names, output/rendering, system context, native/browser Tools and Provider wrappers/tokenization. Source-text lengths and raw implicit parameter specs are different metrics.

- Baseline `9325ac2cdc13177f2682ca6ce6a25a24052d1527`: 31 definitions = 30 Orchestrator + 1 Assignment-only.
- Integrated main: **38 definitions = 37 Orchestrator + 1 Assignment-only**. The seven additional registrations are three local attachment Tools and four external Bridge Tools delivered in separate work. The original 20 Channel/contact/attention names remain present.
- Same original 20 names: **9,532 → 14,056** schema/description units. All Orchestrator definitions: **14,493 → 24,082**, including added capabilities and later changes to Assignment/direct-source guidance. These sums are inventory statistics, not an actual assembled prompt or proof of total token savings.
- Existing real E2E result examples: rename **8,444 → 87**, removal **8,372 → 122**, invitation acceptance **9,209 → 196**, join acceptance **9,201 → 197**. The first bounded-history page **19,061 → 6,639** returns one of three messages; two remain available for continuation. Projecting all three alone was **19,061 → 18,749**, so most of that first-page reduction comes from pagination. Contact discovery changed 24 entries/12,009 units to pages of 20/6,018 and 4/1,194. These are fixture-specific result sizes, not tokens or total-task savings.
- Accurate boundaries have a fixed schema cost: `channel_read` **1,012 → 1,695**, `channel_list` **793 → 937**, `list_bot_contacts` **140 → 1,037**, `channel_send` **1,101 → 1,829** before #677. The later direct-source delivery slice #528 and attachment slices also changed descriptions. Small-roster/short-message tasks are not asserted to be cheaper overall.

### Full adapter registration/schema inventory

`*` means required top-level parameter; all remaining entries are optional. Nested attachment references retain their declared metadata and Host validation. “Train” means one of the original 20 reviewed names; “Later” means added attachment/Bridge scope; other entries are enumerated only. Links point to the exact audited source. Baseline/current columns use the metric above, not source length.

| Tool                                                                                                                                                                            | Scope            | Parameters                                                                                                                                                                                                  | Baseline | Integrated |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------: | ---------: |
| [`memory_switch_branch`](https://github.com/BotHarness/BotHarness/blob/222770648139a7fb97925ae77085cf8f0893463e/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L453)        | Other / OOS      | `branch*:string`                                                                                                                                                                                            |      314 |        314 |
| [`memory_continue_from_commit`](https://github.com/BotHarness/BotHarness/blob/222770648139a7fb97925ae77085cf8f0893463e/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L511) | Other / OOS      | `sha*:string`, `branch*:string`                                                                                                                                                                             |      443 |        443 |
| [`list_assignment_models`](https://github.com/BotHarness/BotHarness/blob/222770648139a7fb97925ae77085cf8f0893463e/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L561)      | Other / OOS      | —                                                                                                                                                                                                           |      255 |        255 |
| [`create_assignment`](https://github.com/BotHarness/BotHarness/blob/222770648139a7fb97925ae77085cf8f0893463e/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L589)           | Other / OOS      | `purpose*:string`, `grant_id*:string`, `key:string`, `provider:string`, `model:string`, `reasoning_effort:string`                                                                                           |     1303 |       1303 |
| [`request_workspace_grant`](https://github.com/BotHarness/BotHarness/blob/222770648139a7fb97925ae77085cf8f0893463e/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L675)     | Other / OOS      | `reason*:string`                                                                                                                                                                                            |      350 |        350 |
| [`list_workspace_grants`](https://github.com/BotHarness/BotHarness/blob/222770648139a7fb97925ae77085cf8f0893463e/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L701)       | Other / OOS      | —                                                                                                                                                                                                           |      182 |        182 |
| [`list_assignments`](https://github.com/BotHarness/BotHarness/blob/222770648139a7fb97925ae77085cf8f0893463e/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L720)            | Other / OOS      | —                                                                                                                                                                                                           |      198 |        198 |
| [`inspect_assignment`](https://github.com/BotHarness/BotHarness/blob/222770648139a7fb97925ae77085cf8f0893463e/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L739)          | Other / OOS      | `session_id*:string`, `include_recent_events:boolean`, `report_offset:integer`                                                                                                                              |      781 |        773 |
| [`send_assignment_request`](https://github.com/BotHarness/BotHarness/blob/222770648139a7fb97925ae77085cf8f0893463e/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L803)     | Other / OOS      | `session_id*:string`, `text*:string`, `mode:string`, `answer_to:string`, `provider:string`, `model:string`, `reasoning_effort:string`                                                                       |      716 |       1253 |
| [`stop_assignment`](https://github.com/BotHarness/BotHarness/blob/222770648139a7fb97925ae77085cf8f0893463e/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L889)             | Other / OOS      | `session_id*:string`                                                                                                                                                                                        |      419 |        419 |
| [`channel_list`](https://github.com/BotHarness/BotHarness/blob/222770648139a7fb97925ae77085cf8f0893463e/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L919)                | Train            | `channel_id:string`, `name:string`, `type:string`, `member_bot_ids:array`, `cursor:string`, `limit:number`                                                                                                  |      793 |        937 |
| [`bridge_read`](https://github.com/BotHarness/BotHarness/blob/222770648139a7fb97925ae77085cf8f0893463e/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L969)                 | Later / OOS      | `source_event_id*:string`                                                                                                                                                                                   |      new |        389 |
| [`bridge_attachment_save`](https://github.com/BotHarness/BotHarness/blob/222770648139a7fb97925ae77085cf8f0893463e/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L993)      | Later / OOS      | `source_event_id*:string`, `attachment_id*:string`, `grant_id*:string`, `destination_path*:string`                                                                                                          |      new |        861 |
| [`bridge_reply_file`](https://github.com/BotHarness/BotHarness/blob/222770648139a7fb97925ae77085cf8f0893463e/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L1041)          | Later / OOS      | `source_event_id*:string`, `file_id*:string`                                                                                                                                                                |      new |        620 |
| [`bridge_reply`](https://github.com/BotHarness/BotHarness/blob/222770648139a7fb97925ae77085cf8f0893463e/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L1072)               | Later / OOS      | `source_event_id*:string`, `text*:string`                                                                                                                                                                   |      new |        538 |
| [`channel_read`](https://github.com/BotHarness/BotHarness/blob/222770648139a7fb97925ae77085cf8f0893463e/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L1103)               | Train            | `channel_id:string`, `message_id:string`, `content_cursor:string`, `scope:string`, `text:string`, `author_bot_id:string`, `author_kind:string`, `from:string`, `to:string`, `cursor:string`, `limit:number` |     1012 |       1695 |
| [`inbox_ignore`](https://github.com/BotHarness/BotHarness/blob/222770648139a7fb97925ae77085cf8f0893463e/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L1183)               | Train            | `message_id*:string`, `channel_id:string`                                                                                                                                                                   |      560 |        560 |
| [`channel_attachment_open`](https://github.com/BotHarness/BotHarness/blob/222770648139a7fb97925ae77085cf8f0893463e/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L1216)    | Later / OOS      | `message_id*:string`, `file_id*:string`, `channel_id:string`, `access*:string`                                                                                                                              |      new |        850 |
| [`channel_attachment_save`](https://github.com/BotHarness/BotHarness/blob/222770648139a7fb97925ae77085cf8f0893463e/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L1264)    | Later / OOS      | `message_id*:string`, `file_id*:string`, `channel_id:string`, `grant_id*:string`, `destination_path*:string`                                                                                                |      new |        866 |
| [`channel_attachment_import`](https://github.com/BotHarness/BotHarness/blob/222770648139a7fb97925ae77085cf8f0893463e/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L1317)  | Later / OOS      | `file_path*:string`                                                                                                                                                                                         |      new |        412 |
| [`channel_read_image`](https://github.com/BotHarness/BotHarness/blob/222770648139a7fb97925ae77085cf8f0893463e/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L1349)         | Train            | `channel_id:string`, `message_id*:string`, `attachment_id:string`, `hash:string`                                                                                                                            |      613 |        793 |
| [`list_bot_contacts`](https://github.com/BotHarness/BotHarness/blob/222770648139a7fb97925ae77085cf8f0893463e/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L1483)          | Train            | `query:string`, `limit:integer`, `cursor:string`, `bot_id:string`                                                                                                                                           |      140 |       1037 |
| [`group_create`](https://github.com/BotHarness/BotHarness/blob/222770648139a7fb97925ae77085cf8f0893463e/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L1528)               | Train            | `name*:string`                                                                                                                                                                                              |      219 |        219 |
| [`group_invite_bot`](https://github.com/BotHarness/BotHarness/blob/222770648139a7fb97925ae77085cf8f0893463e/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L1550)           | Train            | `channel_id*:string`, `bot_id*:string`                                                                                                                                                                      |      333 |        333 |
| [`group_invite_respond`](https://github.com/BotHarness/BotHarness/blob/222770648139a7fb97925ae77085cf8f0893463e/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L1575)       | Train            | `invite_id*:string`, `accept*:boolean`                                                                                                                                                                      |      318 |        318 |
| [`group_join_request`](https://github.com/BotHarness/BotHarness/blob/222770648139a7fb97925ae77085cf8f0893463e/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L1610)         | Train            | `channel_id*:string`                                                                                                                                                                                        |      306 |        306 |
| [`group_join_decide`](https://github.com/BotHarness/BotHarness/blob/222770648139a7fb97925ae77085cf8f0893463e/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L1638)          | Train            | `channel_id*:string`, `request_id*:string`, `accept*:boolean`                                                                                                                                               |      404 |        404 |
| [`group_rename`](https://github.com/BotHarness/BotHarness/blob/222770648139a7fb97925ae77085cf8f0893463e/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L1671)               | Train            | `channel_id*:string`, `name*:string`                                                                                                                                                                        |      260 |        260 |
| [`group_remove_member`](https://github.com/BotHarness/BotHarness/blob/222770648139a7fb97925ae77085cf8f0893463e/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L1695)        | Train            | `channel_id*:string`, `bot_id*:string`                                                                                                                                                                      |      303 |        303 |
| [`group_attention_get`](https://github.com/BotHarness/BotHarness/blob/222770648139a7fb97925ae77085cf8f0893463e/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L1726)        | Train            | `channel_id*:string`                                                                                                                                                                                        |      316 |        379 |
| [`group_attention_set`](https://github.com/BotHarness/BotHarness/blob/222770648139a7fb97925ae77085cf8f0893463e/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L1749)        | Train            | `channel_id*:string`, `mode*:string`, `count:integer`, `interval_seconds:integer`                                                                                                                           |      703 |        955 |
| [`source_attention_get`](https://github.com/BotHarness/BotHarness/blob/222770648139a7fb97925ae77085cf8f0893463e/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L1789)       | Train            | —                                                                                                                                                                                                           |      270 |        334 |
| [`source_attention_set`](https://github.com/BotHarness/BotHarness/blob/222770648139a7fb97925ae77085cf8f0893463e/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L1807)       | Train            | `sourceClass:string`, `wake*:string`, `delivery:string`, `digestCount:integer`, `digestIntervalSeconds:integer`                                                                                             |      795 |       1778 |
| [`source_attention_reset`](https://github.com/BotHarness/BotHarness/blob/222770648139a7fb97925ae77085cf8f0893463e/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L1906)     | Train            | `sourceClass:string`                                                                                                                                                                                        |      366 |        723 |
| [`group_leave`](https://github.com/BotHarness/BotHarness/blob/222770648139a7fb97925ae77085cf8f0893463e/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L1952)                | Train            | `channel_id*:string`                                                                                                                                                                                        |      263 |        436 |
| [`bot_dm_send`](https://github.com/BotHarness/BotHarness/blob/222770648139a7fb97925ae77085cf8f0893463e/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L1977)                | Train            | `bot_id*:string`, `body*:string`, `reply_to:string`                                                                                                                                                         |      457 |        457 |
| [`channel_send`](https://github.com/BotHarness/BotHarness/blob/222770648139a7fb97925ae77085cf8f0893463e/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L2013)               | Train            | `body*:string`, `attachments:array`, `channel_id:string`, `reply_to:string`, `mention_bot_ids:array`, `mention_human_ids:array`                                                                             |     1101 |       1829 |
| [`report_to_orchestrator`](https://github.com/BotHarness/BotHarness/blob/222770648139a7fb97925ae77085cf8f0893463e/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L2207)     | Assignment / OOS | `state*:string`, `summary*:string`, `expects_reply:boolean`                                                                                                                                                 |      677 |        677 |

### Remaining findings and scope

1. **In scope and open: #677.** Correct the nonexistent read Tool and false local-upload statement, validate real local import/send/download, then recompute final costs. This prevents claiming the integrated descriptions are fully accurate today.
2. **Out of scope:** memory Tools use explicit `blocked`/`failed` outcomes inside successful native results; `inspect_assignment` still returns `{error}` for an unknown owned Session. Assignment/memory UX and any error-convention unification are not delivered by this train. `list_assignments` and `list_workspace_grants` have no model output budget in this adapter. No blanket “all tools bounded” claim.
3. **Out of scope:** new Bridge Tools, provider readiness, Slack/Lark traffic, historical attachment retrieval and provider E2E belong to their owning work. This task does not reopen IM intake or claim that all profiles/providers are qualified.
4. **Not a missing-input finding:** current references can be obtained from authorized Channel reads; local-result refs come from `channel_attachment_import`. Models must not guess fileId or metadata. Legacy hash results must be refreshed. Numeric/array limits remain supported descriptions plus Host guards where pinned DSH does not express those keywords; existing fractional Channel limits keep their floor/clamp compatibility.
5. **Metric limit:** total input/output tokens and whole-task costs require a chosen model/tokenizer and real assembled Provider requests with a defined workload, cache state and number of continuation calls. They were not measured in this closeout. JSON versus compact text was compared in #565; the chosen JSON fixture was seven units smaller and retained the reference contract.

### Reproduce the inventory

With the lockfile dependencies installed, save the following as `measure-tools.cjs` outside the checkout. It reads literal description/parameter AST fields and runs only the pinned definition conversion, never any Tool execute callback. Run `node /path/to/measure-tools.cjs /path/to/exact-checkout /path/to/tool-inventory.json`. For the baseline table, repeat against baseline `9325ac2cdc13177f2682ca6ce6a25a24052d1527` with its pinned dependencies.

```javascript
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(process.argv[2] || '.');
const out = path.resolve(process.argv[3] || 'tool-inventory.json');
const ts = require(require.resolve('typescript-legacy', { paths: [root] }));
const filename = path.join(root, 'packages/core/src/runtime/dsh-bot-agent-adapter.ts');
const source = fs.readFileSync(filename, 'utf8');
const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
function literal(node) {
  if (ts.isStringLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (ts.isArrayLiteralExpression(node)) return node.elements.map(literal);
  if (ts.isObjectLiteralExpression(node)) {
    return Object.fromEntries(node.properties.map((p) => [p.name.text, literal(p.initializer)]));
  }
  throw new Error('Unsupported schema expression: ' + node.getText(ast));
}
(async () => {
  const modulePath = require.resolve('@deepseek-ai/dsh-tools', {
    paths: [path.join(root, 'packages/core')],
  });
  const { defineTool } = await import(pathToFileURL(modulePath).href);
  const rows = [];
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'defineTool') {
      if (
        !ts.isCallExpression(node.parent) ||
        node.parent.expression.getText(ast) !== 'registerTool'
      ) {
        throw new Error('Tool definition without expected registration');
      }
      const properties = Object.fromEntries(
        node.arguments[0].properties.map((p) => [p.name.text, p]),
      );
      const definition = Object.fromEntries(
        ['name', 'description', 'parameters'].map((key) => [
          key,
          literal(properties[key].initializer),
        ]),
      );
      const compiled = defineTool({
        ...definition,
        output: { schema: { type: 'string' }, render: () => [] },
        execute: () => '',
      });
      rows.push({
        ...definition,
        role: definition.name === 'report_to_orchestrator' ? 'assignment' : 'orchestrator',
        line: ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1,
        sourceChars:
          properties.description.getText(ast).length + properties.parameters.getText(ast).length,
        rawJSONChars: JSON.stringify({
          description: definition.description,
          parameters: definition.parameters,
        }).length,
        compiledJSONChars: JSON.stringify({
          description: compiled.description,
          parameters: compiled.parameters,
        }).length,
        registryJSONChars: JSON.stringify({
          name: compiled.name,
          description: compiled.description,
          parameters: compiled.parameters,
        }).length,
        usesJSONResult: properties.execute.getText(ast).includes('JSON.stringify('),
      });
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  fs.writeFileSync(out, JSON.stringify(rows, null, 2) + '\n');
  for (const row of rows)
    console.log(
      [row.name, row.role, row.compiledJSONChars, row.registryJSONChars, row.line].join('\t'),
    );
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
```

The JSON includes every original implicit schema, converted character count, name-inclusive registry count and file/line anchor. `usesJSONResult` is a syntactic `JSON.stringify` occurrence flag, not a claim that every result is pure JSON: `channel_attachment_save` uses an embedded reference in a text acknowledgement; `channel_read` delegates to its bounded renderer and `channel_read_image` emits a native image block.

**Closeout gate:** leave #560 open until #677's PR passes Human QA and merges, then refresh this inventory and complete the Hub acceptance checklist. No production deployment or IM reconfiguration is part of this audit.

### Final integration and candidate correction

While preparing this PR, main advanced to `358991db74b4b3e199e104ccd6384756d846a318`. Its #662 slice adds `bridge_context` and the Activity Overview adds existing Human action queries. The bilingual release-ledger merge conflict was resolved by preserving both independent entries; the owning Channel/attachment implementation and this description correction retain their boundaries.

Final integrated runtime source `7f0789fd585655ae2d12c7f6e7ed1ce7a87a5d5c`: **39 definitions = 38 Orchestrator + 1 Assignment-only**. The original 20 names sum to **14,083** units; all 38 Orchestrator definitions sum to **25,207**. The added `bridge_context` contributes **1,098** description/parameter units and is external IM scope, enumerated only here. No IM/provider qualification is claimed.

Only `channel_send` differs between latest main and this correction: **1,829 → 1,856** units (+27), complete metadata with name **1,878**. This names `channel_read`'s real `message_id`/`content_cursor` continuation and existing `channel_attachment_import` for a selected authorized local result; parameters and execution/rendering are unchanged. Every other Tool size matches latest main. This is a contract correction, not fixed-schema token reduction.

The final integrated targeted suite passes **75 tests in 14 files, no skips**, including all original train files and the existing local-file operation contract. Types, lint/source policy, formatting, bilingual ledgers, build, 270-page docs and regenerated unchanged OG subset pass. Final runtime proof is in `README.md` and `native-contract-proof.json`; Human QA/merge still gates Hub closure.

| Final Tool                    | Role         | Converted description/parameters | Name-inclusive metadata | Source                                                                                                                                                    |
| ----------------------------- | ------------ | -------------------------------: | ----------------------: | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `memory_switch_branch`        | orchestrator |                              314 |                     344 | [A:453](https://github.com/BotHarness/BotHarness/blob/7f0789fd585655ae2d12c7f6e7ed1ce7a87a5d5c/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L453)   |
| `memory_continue_from_commit` | orchestrator |                              443 |                     480 | [A:511](https://github.com/BotHarness/BotHarness/blob/7f0789fd585655ae2d12c7f6e7ed1ce7a87a5d5c/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L511)   |
| `list_assignment_models`      | orchestrator |                              255 |                     287 | [A:561](https://github.com/BotHarness/BotHarness/blob/7f0789fd585655ae2d12c7f6e7ed1ce7a87a5d5c/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L561)   |
| `create_assignment`           | orchestrator |                             1303 |                    1330 | [A:589](https://github.com/BotHarness/BotHarness/blob/7f0789fd585655ae2d12c7f6e7ed1ce7a87a5d5c/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L589)   |
| `request_workspace_grant`     | orchestrator |                              350 |                     383 | [A:675](https://github.com/BotHarness/BotHarness/blob/7f0789fd585655ae2d12c7f6e7ed1ce7a87a5d5c/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L675)   |
| `list_workspace_grants`       | orchestrator |                              182 |                     213 | [A:701](https://github.com/BotHarness/BotHarness/blob/7f0789fd585655ae2d12c7f6e7ed1ce7a87a5d5c/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L701)   |
| `list_assignments`            | orchestrator |                              198 |                     224 | [A:720](https://github.com/BotHarness/BotHarness/blob/7f0789fd585655ae2d12c7f6e7ed1ce7a87a5d5c/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L720)   |
| `inspect_assignment`          | orchestrator |                              773 |                     801 | [A:739](https://github.com/BotHarness/BotHarness/blob/7f0789fd585655ae2d12c7f6e7ed1ce7a87a5d5c/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L739)   |
| `send_assignment_request`     | orchestrator |                             1253 |                    1286 | [A:803](https://github.com/BotHarness/BotHarness/blob/7f0789fd585655ae2d12c7f6e7ed1ce7a87a5d5c/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L803)   |
| `stop_assignment`             | orchestrator |                              419 |                     444 | [A:889](https://github.com/BotHarness/BotHarness/blob/7f0789fd585655ae2d12c7f6e7ed1ce7a87a5d5c/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L889)   |
| `channel_list`                | orchestrator |                              937 |                     959 | [A:919](https://github.com/BotHarness/BotHarness/blob/7f0789fd585655ae2d12c7f6e7ed1ce7a87a5d5c/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L919)   |
| `bridge_read`                 | orchestrator |                              389 |                     410 | [A:969](https://github.com/BotHarness/BotHarness/blob/7f0789fd585655ae2d12c7f6e7ed1ce7a87a5d5c/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L969)   |
| `bridge_context`              | orchestrator |                             1098 |                    1122 | [A:993](https://github.com/BotHarness/BotHarness/blob/7f0789fd585655ae2d12c7f6e7ed1ce7a87a5d5c/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L993)   |
| `bridge_attachment_save`      | orchestrator |                              861 |                     893 | [A:1043](https://github.com/BotHarness/BotHarness/blob/7f0789fd585655ae2d12c7f6e7ed1ce7a87a5d5c/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L1043) |
| `bridge_reply_file`           | orchestrator |                              620 |                     647 | [A:1091](https://github.com/BotHarness/BotHarness/blob/7f0789fd585655ae2d12c7f6e7ed1ce7a87a5d5c/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L1091) |
| `bridge_reply`                | orchestrator |                              538 |                     560 | [A:1122](https://github.com/BotHarness/BotHarness/blob/7f0789fd585655ae2d12c7f6e7ed1ce7a87a5d5c/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L1122) |
| `channel_read`                | orchestrator |                             1695 |                    1717 | [A:1153](https://github.com/BotHarness/BotHarness/blob/7f0789fd585655ae2d12c7f6e7ed1ce7a87a5d5c/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L1153) |
| `inbox_ignore`                | orchestrator |                              560 |                     582 | [A:1233](https://github.com/BotHarness/BotHarness/blob/7f0789fd585655ae2d12c7f6e7ed1ce7a87a5d5c/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L1233) |
| `channel_attachment_open`     | orchestrator |                              850 |                     883 | [A:1266](https://github.com/BotHarness/BotHarness/blob/7f0789fd585655ae2d12c7f6e7ed1ce7a87a5d5c/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L1266) |
| `channel_attachment_save`     | orchestrator |                              866 |                     899 | [A:1314](https://github.com/BotHarness/BotHarness/blob/7f0789fd585655ae2d12c7f6e7ed1ce7a87a5d5c/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L1314) |
| `channel_attachment_import`   | orchestrator |                              412 |                     447 | [A:1367](https://github.com/BotHarness/BotHarness/blob/7f0789fd585655ae2d12c7f6e7ed1ce7a87a5d5c/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L1367) |
| `channel_read_image`          | orchestrator |                              793 |                     821 | [A:1399](https://github.com/BotHarness/BotHarness/blob/7f0789fd585655ae2d12c7f6e7ed1ce7a87a5d5c/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L1399) |
| `list_bot_contacts`           | orchestrator |                             1037 |                    1064 | [A:1533](https://github.com/BotHarness/BotHarness/blob/7f0789fd585655ae2d12c7f6e7ed1ce7a87a5d5c/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L1533) |
| `group_create`                | orchestrator |                              219 |                     241 | [A:1578](https://github.com/BotHarness/BotHarness/blob/7f0789fd585655ae2d12c7f6e7ed1ce7a87a5d5c/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L1578) |
| `group_invite_bot`            | orchestrator |                              333 |                     359 | [A:1600](https://github.com/BotHarness/BotHarness/blob/7f0789fd585655ae2d12c7f6e7ed1ce7a87a5d5c/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L1600) |
| `group_invite_respond`        | orchestrator |                              318 |                     348 | [A:1625](https://github.com/BotHarness/BotHarness/blob/7f0789fd585655ae2d12c7f6e7ed1ce7a87a5d5c/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L1625) |
| `group_join_request`          | orchestrator |                              306 |                     334 | [A:1660](https://github.com/BotHarness/BotHarness/blob/7f0789fd585655ae2d12c7f6e7ed1ce7a87a5d5c/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L1660) |
| `group_join_decide`           | orchestrator |                              404 |                     431 | [A:1688](https://github.com/BotHarness/BotHarness/blob/7f0789fd585655ae2d12c7f6e7ed1ce7a87a5d5c/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L1688) |
| `group_rename`                | orchestrator |                              260 |                     282 | [A:1721](https://github.com/BotHarness/BotHarness/blob/7f0789fd585655ae2d12c7f6e7ed1ce7a87a5d5c/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L1721) |
| `group_remove_member`         | orchestrator |                              303 |                     332 | [A:1745](https://github.com/BotHarness/BotHarness/blob/7f0789fd585655ae2d12c7f6e7ed1ce7a87a5d5c/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L1745) |
| `group_attention_get`         | orchestrator |                              379 |                     408 | [A:1776](https://github.com/BotHarness/BotHarness/blob/7f0789fd585655ae2d12c7f6e7ed1ce7a87a5d5c/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L1776) |
| `group_attention_set`         | orchestrator |                              955 |                     984 | [A:1799](https://github.com/BotHarness/BotHarness/blob/7f0789fd585655ae2d12c7f6e7ed1ce7a87a5d5c/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L1799) |
| `source_attention_get`        | orchestrator |                              334 |                     364 | [A:1839](https://github.com/BotHarness/BotHarness/blob/7f0789fd585655ae2d12c7f6e7ed1ce7a87a5d5c/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L1839) |
| `source_attention_set`        | orchestrator |                             1778 |                    1808 | [A:1857](https://github.com/BotHarness/BotHarness/blob/7f0789fd585655ae2d12c7f6e7ed1ce7a87a5d5c/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L1857) |
| `source_attention_reset`      | orchestrator |                              723 |                     755 | [A:1956](https://github.com/BotHarness/BotHarness/blob/7f0789fd585655ae2d12c7f6e7ed1ce7a87a5d5c/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L1956) |
| `group_leave`                 | orchestrator |                              436 |                     457 | [A:2002](https://github.com/BotHarness/BotHarness/blob/7f0789fd585655ae2d12c7f6e7ed1ce7a87a5d5c/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L2002) |
| `bot_dm_send`                 | orchestrator |                              457 |                     478 | [A:2027](https://github.com/BotHarness/BotHarness/blob/7f0789fd585655ae2d12c7f6e7ed1ce7a87a5d5c/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L2027) |
| `channel_send`                | orchestrator |                             1856 |                    1878 | [A:2063](https://github.com/BotHarness/BotHarness/blob/7f0789fd585655ae2d12c7f6e7ed1ce7a87a5d5c/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L2063) |
| `report_to_orchestrator`      | assignment   |                              677 |                     709 | [A:2257](https://github.com/BotHarness/BotHarness/blob/7f0789fd585655ae2d12c7f6e7ed1ce7a87a5d5c/packages/core/src/runtime/dsh-bot-agent-adapter.ts#L2257) |

`tool-inventory.json` contains the complete final implicit schemas and anchors. `schema-comparison.json` compares the original baseline, first audited main, final integrated main and candidate. The committed safe reproducer produces all 39 final rows without calling any Tool execute callback.
