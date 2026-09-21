---
Status: Accepted
Date: 2026-09-22
---

# The Bot mark is a user-chosen asset; the shell-owned Settings nav wears it by DOM tagging

A product needs a face. BotHarness shipped without one — the app sidebar's BOT-mode entry borrowed DSH's `IconAgentPresetOutline16`, and the Settings navigation showed the shell's settings gear for the Bot section. The Human supplied DeepSeekBot mascot artwork in light and dark variants and asked for a choice of marks, so the product needs one owned asset pipeline and one preference, not two unrelated icons.

## Decision

- **The Bot mark is a user preference.** `ui-bot-mode` gains `botIcon: 'mascot' | 'blob' | 'bot'` (default `mascot`), written through the same preferences face and settings scope as motion and sorting. Every surface resolves the mark from that one field, so the app sidebar and the Settings navigation cannot disagree.
- **The mascot ships as project assets.** The Human's artwork is committed at `packages/client/assets/bot/deepseekbot-{light,dark}.png` (128 px, alpha preserved) and `pnpm bot:icons` regenerates `packages/client/src/client/bot-icon-assets.ts` with base64 data URIs — the client bundle is a single file, so assets are inlined rather than fetched.
- **The generic glyph is vendored, because DSH has none.** DSH's primitive icon set (76 icons) contains no bot or robot mark, so the Lucide `bot` path (ISC; the same source shadcn draws from) is inlined with `currentColor` and recorded in `packages/client/THIRD_PARTY_NOTICES.md`.
- **The blob reuses the avatar generator.** `blobatar` already produces PersonaBot avatars; the Bot's own blob uses the same generator with a fixed seed (`botharness:bot`) so the mark is one stable identity, not a new face per render.
- **Palette follows the shell's own signal.** Mascot artwork switches light/dark on `body[data-ds-dark-theme]`, the attribute DSH's theme presenter maintains, so no theme service needs to be plumbed into artwork components.
- **The Settings navigation is tagged, not extended.** DSH's shell picks a nav glyph from a hardcoded map keyed by section id (unknown ids fall back to the settings gear), the `settings.section` registration carries no icon option, and `SlotLabel` accepts only strings — there is no seam. The client therefore finds the Bot section's nav cell by its localized label (never by position), hides the shell's glyph with CSS, and inserts the chosen mark; a MutationObserver re-applies after shell re-renders and on preference or palette changes, and a cell that cannot be matched simply keeps the gear.

## Consequences

- The nav patch depends on the shell's DOM shape (a nav button whose children are a glyph and a label span). It degrades to the gear instead of breaking, but it is a documented application-defined workaround, not a supported extension point: an upstream icon affordance for `settings.section` would let us delete the module and keep the rest of this decision intact.
- The mascot adds ~82 KB of base64 to the client bundle. Acceptable for two palette variants of the product's own artwork; a larger or animated mark would need a served asset path instead.
- Icon preference changes are durable per Host (the settings document), so a Human who switches to the blob keeps it across sessions and machines that share the profile.
