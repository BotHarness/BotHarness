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

### Candidate correction

Runtime source `1b8d47555648e64ad6b0933e6e2689d9d0f2520e` corrects `channel_send` to name the registered `channel_read` bounded-content arguments and `channel_attachment_import` for a selected authorized local result. Parameters and execution/rendering are unchanged. Its converted description/parameters grow **1,829 → 1,856** units (+27); the complete metadata with name is **1,878**. All 38 names/roles remain present, every other converted size is unchanged, original 20-name sum becomes **14,083**, and 37-Orchestrator sum **24,109**. This is a contract correction, not a fixed-schema token reduction. See `tool-inventory.json`, `schema-comparison.json` and `README.md` for the candidate proof and safe reproducer.
