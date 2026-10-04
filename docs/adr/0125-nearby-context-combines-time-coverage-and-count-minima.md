# ADR-0125: Nearby context combines time coverage with count minima

- Status: Accepted
- Date: 2026-10-04
- Issue: [#793](https://github.com/BotHarness/BotHarness/issues/793)
- Supersedes: ADR-0106's nearby window-only selection and five-minute continuation lifetime

## Context

A busy external group can have more useful context inside five minutes than fits one page; a quiet group can have too few messages to explain the source. A fixed message cap loses the first case, while a time-only window loses the second. The Human requested both time coverage and minimum preceding/following counts.

## Decision

This is an application-defined Messaging capability through the existing DSH Service Provider/Consumer seam. The trusted own-Inbox Source Event remains the anchor. `bridge_context` nearby reads provider-visible supported Human text in the inclusive five-minute interval on each side, then supplements a sparse preceding side to `before_count` (default 10) and following side to `after_count` (default 5), each integer 0–20. The anchor is excluded from those side counts. Counts are minima, never caps on dense time-window coverage. Only already available messages are queried; no wait for future input or new subscription is introduced.

The anchor remains independently available through canonical `bridge_read`; it is not synthesized into a Chat listing that omits it. Lark Chat listing can omit topic replies, so topic content uses the existing separate Thread scope. Nearby does not claim to merge both native listing surfaces.

The Lark Provider uses bounded Chat listing: ascending pages of the time window, descending nearest older supplement, then ascending nearest newer supplement. Its checked continuation retains phase, counts and native page token. Millisecond boundary filtering handles the SDK's second-resolution time filters without overlapping returned messages. Missing, unsupported or withdrawn messages cannot satisfy minima. Exhausted visible history can return fewer messages. A dense window remains incomplete until the caller follows all continuation pages; output budgets and per-read cancellation/deadlines still apply.

For a fresh anchor whose upper window boundary is still in the future, the newer supplement ends with an empty terminal page. It does not send a future-start request: Lark defaults an omitted end time to now and refuses that inverted range. The time-window query still returns already available messages within its explicit bounds.

Messaging owns opaque process-local continuation tokens bound to Bot, source, grant revision, scope and count parameters. Each successful page issues a new token valid for 30 minutes. Successful use consumes the prior token; restart invalidates it. Every call rechecks current authority and Provider/Consumer lifetime. Increased token lifetime grants no longer-lived access.

Returned observations reconcile into canonical Source Events and existing read audit; no historical Inbox Admission, automatic reply, Memory write, read receipt, transcript store or native provider-wide search is added. Group and Thread reads retain their existing semantics. The UI displays the latest returned page, not a promise of a complete transcript.

## Consequences

Sparse conversations gain useful neighboring messages; busy windows require more calls. The model can choose minima and follow explicit continuation within the same query. Time-window pages and later supplement pages are not globally chronological across calls; timestamps and IDs preserve the original ordering for consumers. Continuations can fail if an already fetched page changes while a character-budget continuation refetches it, rather than silently skipping content.
