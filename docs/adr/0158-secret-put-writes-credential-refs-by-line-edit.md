---
Status: Accepted
Date: 2026-10-10
Issues: [#1308](https://github.com/BotHarness/DeepSeekBot/issues/1308)
---

# secret-put writes credential refs by line-edit with backup and re-read

Zero-click operation needs scripted secret configuration (wrangler-`secret-put`-style), but the DSH credential file is versioned, strictly validated YAML that fails Host startup when malformed, and owned by the credentials service with live reload. We decided that **`deepseekbot secret-put <NAME>` reads the value from stdin only and writes it by editing only the target `refs:` lines — never re-serializing the document — with a backup taken first and a re-read validation after, and `secret-list` reports names, sources, and writability, never values.**

## Decision

- **Stdin-only values.** Secret values travel exclusively through stdin pipes (`echo "$KEY" | deepseekbot secret-put DEEPSEEK_API_KEY`); any secret-style argv flag stays a hard `secret-in-argv` error per ADR-0156. Names in argv are safe: names are addresses, not secrets.
- **Line-edit, not re-serialize.** The writer touches only the target entry under top-level `refs:` and leaves every other byte (comments, formatting, `records:` grants) intact, so provider-owned grant payloads and human notes cannot be mangled by a YAML round trip. `records:` is never written: grant payloads belong to their provider owner.
- **Backup plus re-read.** Before writing, the current file is copied to a timestamped backup beside it; after writing, the file is re-parsed with the store's strictness (mapping root, known tops, addressable keys, non-empty values) and the backup is restored on any failure, surfacing a coded error instead of a broken Host.
- **0600 enforced.** A missing file is created owner-only; an existing file readable by others is refused with a repair hint, mirroring the store's own POSIX check.
- **`secret-list` mirrors `describe`.** Names plus configured/source/writable, never values — the same semantics as the official credential API, so agents can branch on "is DEEPSEEK_API_KEY configured?" without ever seeing it. `secret-unset` deletes the entry (blanking is refused: empty means absent).

## Considered Options

- **Reuse dsh-credentials-local's store offline:** rejected. It is a cordis service needing a Context; standalone instantiation is unverified, and it would drag the Host's dependency surface into the CLI for what amounts to a file edit the store explicitly supports ("edit the file directly").
- **Write through a running Host's credential API:** rejected for P1. It makes secret configuration wait on the P2 host transport; file writes reload live via the store's watcher, so offline writes take effect on next Host start with zero clicks.
- **Full-document YAML rewrite:** rejected. Re-serialization risks comment loss, formatting churn, and — worst case — mangling opaque grant payloads the CLI cannot interpret.
- ** PUT values via argv flags:** rejected. Shell history and process listings make argv values a leak by construction.

## Consequences

- Secret verbs form their own slice (P1d) with dedicated acceptance: 0600 enforcement, no-echo proofs, backup/restore behavior, and malformed-file refusal.
- Pairing flows reuse the same halves: non-secret pairing artifacts go to stdout JSON, secret inputs arrive via stdin, and a future `pairing-status` verb polls (P3).
- If DSH ever ships an official credentials CLI, these verbs delegate to it; the stdin-only and never-echo rules survive the move.
