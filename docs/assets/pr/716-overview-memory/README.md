# Overview Memory activity — #716

## Real runtime evidence

These captures use the production BotHarness Host/Client and native DSH API Gateway in one isolated Profile, with three real PersonaBots and actual Git repositories. The scene includes a Human Memory edit submitted through `memorySave`, a dated ordinary Git commit representing yesterday's follow-up, an untracked draft, a clean repository and a deliberately invalid repository. No statistics were injected into SQLite or mocked.

- Before: actual main `a86e1f9f` in a separate checkout, same Profile and scene.
- After: this PR, same locale (Chinese), date, theme and viewport.
- Overview pairs: 1440 × 900 light/dark; 420 × 960 narrow.
- `memory-compact.png` and `memory-compact-dark.png`: Profile-style compact rows, seven-day sparklines and separate dirty/unavailable state.
- `daily-details.png`: exact daily counts; the E2E compares every rendered cell to the public query, including unavailable cells.
- `bot-profile.png`: the Curator row opens its actual Bot Profile.
- `memory-narrow.png`: 420px layout, with no document horizontal overflow.

Ordinary commit totals are **Curator 4**, **Observer 2**, **Offline unavailable**. Curator has one yesterday commit and three today commits; its untracked draft is a separate current-state indicator. The E2E also compares all seven daily values with the existing Bot Profile Memory activity query. Both queries now share the ordinary-commit date/ref definition. The totals include initial repository/Persona commits because those are ordinary history. Auxiliary recovery/stash snapshot refs are excluded. A Host restart preserves the same ordinary counts and dirty state despite new recovery observations. Reads leave HEAD, index and worktree unchanged and do not change the Human's unread count.

## Human QA

1. Open Activity Center → Overview → Statistics.
2. Inspect Memory activity: Curator has uncommitted changes, Observer is clean, Offline is unavailable rather than zero/clean.
3. Hover a daily bar and expand Details to see exact dates and counts. Repository content is not copied into the statistics response.
4. Refresh. Check that counts and dirty state remain separate and no unread messages are cleared.
5. Open a Bot through its arrow to inspect its existing Profile/Memory view; return to Overview.
6. At 420px, names, counts, state and Profile arrows remain accessible. Collapse Statistics or leave Overview to dispose the Memory poll.

## Reproduce

Use a new isolated Profile and set `BH_OVERVIEW_MEMORY_QA_HOME` / `BH_OVERVIEW_MEMORY_QA_PORT`. Launch with `scripts/dev-instance.mjs`, then run:

```sh
node scripts/e2e-overview-memory.mjs prepare
node scripts/e2e-overview-memory.mjs check
```

`prepare` is for a fresh scene, once per Profile; it deliberately makes only the Offline QA repository invalid. `check` is read-only. Stop the exact task Host PID, restart the same Profile and run `resume` for retention verification. `before` uses a real base checkout; set `BH_OVERVIEW_MEMORY_QA_REPO` and `BH_OVERVIEW_MEMORY_QA_OUT` to capture the matched baseline without changing the scene. All launch URLs, cookies, private paths and logs remain local.

Core seam tests cover deduplication across branches, backdated histories, committer rather than author dates, recovery checkpoint exclusion, exact seven buckets, index bytes, hidden-untracked Git preferences, unavailable repositories and bounded pages. Client tests cover decoding, loaded-page refresh, Profile navigation, stale errors and poll disposal. Git reads run asynchronously with timeouts and optional locks/fsmonitor disabled.
