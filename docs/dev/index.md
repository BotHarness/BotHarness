# BotHarness developer documentation

BotHarness developer documentation separates four kinds of authority. Start with the kind of answer you need instead of treating every page as a description of current runtime behavior.

## Design

[Design](/dev/design) contains the canonical BotHarness Product Context and living architecture. It defines intended boundaries and invariants without publishing mutable platform-spec or app-PRD snapshots as parallel authorities.

## Guides

[Guides](/dev/guides) explain verified implementation workflows and integration contracts. A guide is procedural, not a second source of product terminology.

## Reference

[Reference](/dev/reference) is generated from the current codebase. Use it to answer what config, model-facing tools, and public Cordis event seams exist in this revision. If Design and Reference differ, Design describes the target and Reference describes the implementation that exists now.

## Decisions

[Architecture decisions](/dev/adr) record why important choices were made. An ADR is historical evidence: its status tells you whether it is still active, superseded, or amended.

## Vocabulary boundary

BotHarness product terms are owned by the [domain glossary](/dev/design/context). DSH and Cordis terms are owned by the separate [DSH/Cordis Context](/dsh/context). Neither section redefines the other.
