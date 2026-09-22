# Inject the memory tree; retrieve bodies on demand

> Superseded by ADR-0047, then ADR-0056: nothing is injected from Memory into the system prompt; the Agent explores its Memory Repository with ordinary file tools.

Each turn injects the memory directory tree — paths, one-line summaries, updated-at times — rather than full file bodies or embedding matches; the model pulls details with memory search or direct reads. This tells the Bot what it remembers without spending its context budget, and keeps a semantic-retrieval stack out of the PoC.

## Consequences

The tree is capped (1000 paths) and folders with many files are folded into counts; semantic search is revisited only if keyword search proves insufficient (PRD §5.5 rule M3, appendix D).
