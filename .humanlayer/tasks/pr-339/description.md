Refs #116 | [Agent claim](https://github.com/BotHarness/BotHarness/issues/116#issuecomment-5848670466) | Task: `codex/local/01a0cde3-1621-7382-96a1-852758cedfc0`

## Why the change

People need to see which existing Assignment Sessions still have full file access after they turn off the Bot's default or restart DSH.

## Special things to note

- The badge comes from each Assignment's immutable permission snapshot; the current Bot default never rewrites an existing Session.
- Real DSH tests covered safe → full access → safe creation, native reads inside and outside the Grant, and persistence after restart. Human QA of the warning in the Channel is pending.
- This PR addresses the persistent Session warning; #116 stays open until its full acceptance matrix is complete.

## Change outline

```text
Assignment Directory: permission.mode (durable Session snapshot)
  → Host sessions() projection: assignmentAccessMode
  → Client parser and Session row model
  → Channel Sessions list: warning Tag only for danger-full-access
```

The Host and Client tests pin the snapshot projection and prevent an Orchestrator row from inheriting an Assignment warning.

