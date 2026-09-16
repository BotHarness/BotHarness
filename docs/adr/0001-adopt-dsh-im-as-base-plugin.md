# Adopt dsh-im as the base plugin

One Host must run several Feishu/Lark Bots with per-Bot personas, and among the bridge plugins surveyed, dsh-im is the only one that already supports multiple bots per channel, ships a settings UI, is MIT-licensed, and is officially recognized. We extend dsh-im and treat dsh-lark-link (outbox/WAL reliability, group policy), dsh-lark-bridge (group→project, thread→session routing), and dsh-feishu (single-Bot UX) as design references.

## Considered Options

- **dsh-im** — multi-Bot, settings UI, MIT, active; Lark international (`brand`) support unverified.
- **dsh-lark-link / dsh-feishu** — strong reliability and Lark support, but one Bot per profile.
- **dsh-lark-bot** — most feature-complete, but AGPL-3.0, incompatible with the project's licensing.

## Consequences

Lark international support is unverified until M1; if dsh-im lacks it, add a `brand` option and keep the change upstreamable (PRD §5.6, §9.1).
