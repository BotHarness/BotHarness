Refs #116 | [Agent claim](https://github.com/BotHarness/BotHarness/issues/116#issuecomment-5848670466) | Task: `codex/local/01a0cde3-1621-7382-96a1-852758cedfc0`

## Why the change

People need to see which existing Assignment Sessions still have full file access after they turn off the Bot's default or restart DSH.

## Special things to note

- The badge comes from each Assignment's immutable permission snapshot; the current Bot default never rewrites an existing Session.
- Real DSH tests covered safe → full access → safe creation, native reads inside and outside the Grant, and persistence after restart; 1,060 automated tests, typecheck, lint, and build pass. Human QA of the warning is pending.
- All touched files pass formatting. The full-tree check on Windows reports existing CRLF differences across 440 unrelated files; #116 stays open until Human QA and the remaining acceptance audit.

## Change outline

```text
Assignment Directory: permission.mode (durable Session snapshot)
  → Host sessions() projection: assignmentAccessMode
  → Client parser and Session row model
  → Channel Sessions list: warning Tag only for danger-full-access
```

The Host and Client tests pin the snapshot projection and prevent an Orchestrator row from inheriting an Assignment warning.
