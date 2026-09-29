# Keep model usage as a Bot-owned retained statistic

Status: accepted

DSH SessionEvents are the canonical facts for each actual provider/model attempt and its provider-reported token usage, including reported usage from failed or retried attempts. BotHarness records a daily PersonaBot × execution-role × exact provider/model aggregate of uncached input, output, cache-read, and cache-write tokens, plus unknown-usage attempts. It attributes DSH Subagent work to its owning PersonaBot and distinguishes Orchestrator, Assignment, and Subagent activity. A Turn that calls several models contributes to each route separately rather than to a `mixed` bucket.

The aggregate is an application-owned retained statistic: ordinary Session deletion does not erase it, so rebuilding from the remaining Session logs must neither clear nor double-count historical values. Incremental folding must be idempotent per durable attempt, and reconciliation must replace or correct only buckets for which complete source evidence remains; it cannot truncate retained history. It contains no prompt, response, credential, or deleted Session identity. A PersonaBot's thorough purge removes its identifiable usage; archiving leaves it available for inspection. The Profile presents actual observed routes, not merely allowed routes, and marks missing provider usage as unknown instead of zero. Its activity chart initially shows 26 weeks, with a selectable range and an all-time total.

This deliberately separates replayable execution evidence from the bounded statistic retained after its source Session is gone. It extends the existing `usage_daily` projection, whose whole-table rebuild and `mixed` route bucket cannot satisfy that retention or attribution contract.
