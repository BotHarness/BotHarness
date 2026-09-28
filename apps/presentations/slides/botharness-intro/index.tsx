import type { DesignSystem, Page, SlideMeta, SlideTransition } from '@open-slide/core';
import { useSlidePageNumber } from '@open-slide/core';
import type { CSSProperties, ReactNode } from 'react';

export const design: DesignSystem = {
  palette: { bg: '#0a0f14', text: '#edf2f7', accent: '#34d399' },
  fonts: {
    display: 'system-ui, -apple-system, "SF Pro Display", "Inter", sans-serif',
    body: 'system-ui, -apple-system, "SF Pro Text", "Inter", "Noto Sans SC", sans-serif',
  },
  typeScale: { hero: 168, body: 36 },
  radius: 16,
};

const EASE_OUT = 'cubic-bezier(0, 0, 0.2, 1)';
const EASE_IN = 'cubic-bezier(0.4, 0, 1, 1)';

export const transition: SlideTransition = {
  duration: 260,
  exit: {
    duration: 260,
    easing: EASE_IN,
    keyframes: [{ opacity: 1 }, { opacity: 1 }],
  },
  enter: {
    duration: 260,
    easing: EASE_OUT,
    keyframes: [
      { opacity: 0, transform: 'translateY(6px)' },
      { opacity: 1, transform: 'translateY(0)' },
    ],
  },
};

const muted = '#8a9ba8';
const dim = '#5b6b7a';
const panel = '#111a23';
const line = '#1e2a37';
const accentSoft = 'rgba(52, 211, 153, 0.12)';
const mono = 'ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace';

const fill: CSSProperties = {
  width: '100%',
  height: '100%',
  position: 'relative',
  overflow: 'hidden',
  background: 'var(--osd-bg)',
  color: 'var(--osd-text)',
  fontFamily: 'var(--osd-font-body)',
  letterSpacing: '-0.01em',
};

const css = `
  .bh { animation-timing-function: cubic-bezier(0.22, 1, 0.36, 1); animation-fill-mode: both; }
  [data-still] .bh { animation: none !important; }
  @media (prefers-reduced-motion: reduce) { .bh { animation: none !important; } }
  @keyframes bh-rise { from { opacity: 0; transform: translateY(14px); } }
  @keyframes bh-fade { from { opacity: 0; } }
  .bh-rise { animation-name: bh-rise; animation-duration: 0.55s; }
  .bh-fade { animation-name: bh-fade; animation-duration: 0.45s; }
`;

const Styles = () => <style>{css}</style>;

function Footer() {
  const { current, total } = useSlidePageNumber();
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    <div
      style={{
        position: 'absolute',
        left: 120,
        right: 120,
        bottom: 72,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontFamily: mono,
        fontSize: 20,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: dim,
      }}
    >
      <span>
        BotHarness <span style={{ color: '#2b3a4a' }}>·</span> botharness.ai
      </span>
      <span>
        {pad(current)} / {pad(total)}
      </span>
    </div>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div
      className="bh bh-fade"
      style={{
        fontFamily: mono,
        fontSize: 24,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        color: 'var(--osd-accent)',
      }}
    >
      {children}
    </div>
  );
}

function Title({ children }: { children: ReactNode }) {
  return (
    <h2
      className="bh bh-rise"
      style={{
        margin: '24px 0 0 0',
        fontFamily: 'var(--osd-font-display)',
        fontSize: 76,
        fontWeight: 800,
        letterSpacing: '-0.03em',
        lineHeight: 1.1,
        animationDelay: '0.06s',
      }}
    >
      {children}
    </h2>
  );
}

function Bullet({ dot, head, tail }: { dot?: string; head: string; tail?: string }) {
  return (
    <li
      className="bh bh-rise"
      style={{
        listStyle: 'none',
        display: 'flex',
        gap: 20,
        alignItems: 'baseline',
        fontSize: 34,
        lineHeight: 1.5,
        color: '#c9d4de',
        animationDelay: '0.14s',
      }}
    >
      <span style={{ fontFamily: mono, fontSize: 26, color: 'var(--osd-accent)', flexShrink: 0 }}>
        {dot ?? '—'}
      </span>
      <span>
        <span style={{ color: 'var(--osd-text)', fontWeight: 650 }}>{head}</span>
        {tail ? <span style={{ color: muted }}> {tail}</span> : null}
      </span>
    </li>
  );
}

function Shell({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  children: ReactNode;
}) {
  return (
    <div style={fill} data-still={undefined}>
      <Styles />
      <div style={{ position: 'absolute', left: 120, right: 120, top: 104 }}>
        <Eyebrow>{eyebrow}</Eyebrow>
        <Title>{title}</Title>
      </div>
      <div style={{ position: 'absolute', left: 120, right: 120, top: 400, bottom: 160 }}>
        {children}
      </div>
      <Footer />
    </div>
  );
}

function Card({ no, title, body }: { no: string; title: string; body: string }) {
  return (
    <div
      className="bh bh-rise"
      style={{
        flex: 1,
        background: panel,
        border: `1px solid ${line}`,
        borderRadius: 'var(--osd-radius)',
        padding: '36px 36px 32px 36px',
        animationDelay: '0.14s',
      }}
    >
      <div
        style={{
          fontFamily: mono,
          fontSize: 22,
          letterSpacing: '0.12em',
          color: 'var(--osd-accent)',
        }}
      >
        {no}
      </div>
      <div
        style={{
          marginTop: 16,
          fontSize: 36,
          fontWeight: 750,
          letterSpacing: '-0.02em',
          lineHeight: 1.25,
        }}
      >
        {title}
      </div>
      <div style={{ marginTop: 14, fontSize: 28, lineHeight: 1.55, color: muted }}>{body}</div>
    </div>
  );
}

// 1 — Cover
const Cover: Page = () => (
  <div style={fill}>
    <Styles />
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background:
          'radial-gradient(1100px 500px at 78% 18%, rgba(52,211,153,0.16), transparent 62%), radial-gradient(900px 600px at 12% 88%, rgba(56,130,246,0.14), transparent 60%)',
      }}
    />
    <div style={{ position: 'absolute', left: 120, right: 120, top: 120 }}>
      <div
        className="bh bh-fade"
        style={{
          fontFamily: mono,
          fontSize: 24,
          letterSpacing: '0.2em',
          color: 'var(--osd-accent)',
        }}
      >
        DSH PLUGIN · DEEPSEEK HARNESS
      </div>
      <h1
        className="bh bh-rise"
        style={{
          margin: '28px 0 0 0',
          fontFamily: 'var(--osd-font-display)',
          fontSize: 'var(--osd-size-hero)',
          fontWeight: 900,
          letterSpacing: '-0.045em',
          lineHeight: 0.98,
          animationDelay: '0.06s',
        }}
      >
        BotHarness
      </h1>
      <p
        className="bh bh-rise"
        style={{
          margin: '28px 0 0 0',
          fontSize: 52,
          fontWeight: 600,
          letterSpacing: '-0.02em',
          color: '#d7e1ea',
          animationDelay: '0.12s',
        }}
      >
        给 LLM Agent 一份<span style={{ color: 'var(--osd-accent)' }}>持久身份</span>
      </p>
      <p
        className="bh bh-fade"
        style={{
          margin: '20px 0 0 0',
          fontSize: 30,
          lineHeight: 1.6,
          color: muted,
          animationDelay: '0.18s',
        }}
      >
        PersonaBot —— 带人格、跨会话记忆、可并发工作的 Bot。不 fork DSH 的插件层。
      </p>
    </div>
    <div
      className="bh bh-rise"
      style={{
        position: 'absolute',
        left: 120,
        right: 120,
        bottom: 170,
        display: 'flex',
        gap: 20,
        animationDelay: '0.24s',
      }}
    >
      <div
        style={{
          flex: 1,
          border: `1px solid ${line}`,
          background: panel,
          borderRadius: 14,
          padding: '24px 30px',
          fontSize: 28,
          color: '#c9d4de',
        }}
      >
        <span style={{ color: 'var(--osd-accent)', fontFamily: mono, fontSize: 24 }}>● </span>
        持久身份 <span style={{ color: dim }}>· 跨 Session / Chat / Workspace</span>
      </div>
      <div
        style={{
          flex: 1,
          border: `1px solid ${line}`,
          background: panel,
          borderRadius: 14,
          padding: '24px 30px',
          fontSize: 28,
          color: '#c9d4de',
        }}
      >
        <span style={{ color: 'var(--osd-accent)', fontFamily: mono, fontSize: 24 }}>● </span>
        Git 记忆 <span style={{ color: dim }}>· 工作树即记忆，可审计</span>
      </div>
      <div
        style={{
          flex: 1,
          border: `1px solid ${line}`,
          background: panel,
          borderRadius: 14,
          padding: '24px 30px',
          fontSize: 28,
          color: '#c9d4de',
        }}
      >
        <span style={{ color: 'var(--osd-accent)', fontFamily: mono, fontSize: 24 }}>● </span>
        并发执行 <span style={{ color: dim }}>· 一人分饰多角同时推进</span>
      </div>
    </div>
    <Footer />
  </div>
);

// 2 — Problem
const Problem: Page = () => (
  <Shell eyebrow="01 — 为什么需要 BotHarness" title="Session 结束，身份就消失">
    <ul style={{ margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 28 }}>
      <Bullet head="Agent 活在一次会话里，" tail="换个 Chat、换个目录就从零开始。" dot="01" />
      <Bullet head="记忆靠复制粘贴，" tail="散在聊天记录里，不可版本、不可审计。" dot="02" />
      <Bullet head="一次只能做一件事，" tail="没有可并发、可恢复、可归属的执行。" dot="03" />
    </ul>
  </Shell>
);

// 3 — PersonaBot
const Persona: Page = () => (
  <Shell eyebrow="02 — 核心概念 PersonaBot" title="一个 Bot，就是一个人">
    <div style={{ display: 'flex', gap: 28, height: '100%' }}>
      <Card
        no="IDENTITY"
        title="持久身份"
        body="Host 生成的稳定 ID。显示名可重复，ID 永不混淆，归档后历史仍可审计。"
      />
      <Card
        no="MEMORY"
        title="Git 记忆"
        body="每 Bot 一个 Git 仓库。检出即记忆，Persona 只是其中一份内容。"
      />
      <Card
        no="EXECUTION"
        title="执行归属"
        body="一个 Orchestrator + 多个 Assignment Sessions，同一个人同时推进多件事。"
      />
    </div>
  </Shell>
);

// 4 — Architecture
const Arch: Page = () => (
  <Shell eyebrow="03 — 架构：一层插件，不 fork DSH" title="DSH 拥有执行，BotHarness 拥有身份">
    <div style={{ display: 'flex', gap: 28 }}>
      <div
        className="bh bh-rise"
        style={{
          flex: 1.2,
          background: accentSoft,
          border: '1px solid rgba(52,211,153,0.35)',
          borderRadius: 'var(--osd-radius)',
          padding: '32px 36px',
          animationDelay: '0.14s',
        }}
      >
        <div
          style={{
            fontFamily: mono,
            fontSize: 22,
            letterSpacing: '0.12em',
            color: 'var(--osd-accent)',
          }}
        >
          BOTHARNESS · HOST
        </div>
        <div style={{ marginTop: 12, fontSize: 33, fontWeight: 700, lineHeight: 1.5 }}>
          身份 · 记忆 · 消息
          <br />
          事项 · 移植
        </div>
        <div style={{ marginTop: 10, fontFamily: mono, fontSize: 24, color: muted }}>
          one botharness.db · 权威事务
        </div>
      </div>
      <div
        className="bh bh-rise"
        style={{
          flex: 1,
          background: panel,
          border: `1px solid ${line}`,
          borderRadius: 'var(--osd-radius)',
          padding: '32px 36px',
          animationDelay: '0.2s',
        }}
      >
        <div style={{ fontFamily: mono, fontSize: 22, letterSpacing: '0.12em', color: muted }}>
          DSH OWNS
        </div>
        <div
          style={{
            marginTop: 12,
            fontSize: 31,
            fontWeight: 650,
            lineHeight: 1.5,
            color: '#d7e1ea',
          }}
        >
          Agent 执行
          <br />
          Session 历史 · 凭证
        </div>
        <div style={{ marginTop: 10, fontFamily: mono, fontSize: 24, color: dim }}>
          不复制第二套权威
        </div>
      </div>
      <div
        className="bh bh-rise"
        style={{
          flex: 1,
          background: panel,
          border: `1px solid ${line}`,
          borderRadius: 'var(--osd-radius)',
          padding: '32px 36px',
          animationDelay: '0.26s',
        }}
      >
        <div style={{ fontFamily: mono, fontSize: 22, letterSpacing: '0.12em', color: muted }}>
          CLIENT
        </div>
        <div
          style={{
            marginTop: 12,
            fontSize: 31,
            fontWeight: 650,
            lineHeight: 1.5,
            color: '#d7e1ea',
          }}
        >
          只经 RPC
          <br />
          读投影 · 交命令
        </div>
        <div style={{ marginTop: 10, fontFamily: mono, fontSize: 24, color: dim }}>
          不直读库不推导状态
        </div>
      </div>
    </div>
  </Shell>
);

// 5 — Memory
const Memory: Page = () => (
  <Shell eyebrow="04 — 记忆：Git 即真相" title="工作树即记忆">
    <ul style={{ margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 28 }}>
      <Bullet head="每 Bot 一个 Git 仓库，" tail="Markdown / 代码 / 二进制，改了即记住。" dot="✓" />
      <Bullet head="Persona 只是内容，" tail="快照进 system prompt，新会话才生效。" dot="✓" />
      <Bullet head="Human 直接改、提交即生效，" tail="观察只记 HEAD，不锁文件。" dot="✓" />
    </ul>
  </Shell>
);

// 6 — Execution
const Exec: Page = () => (
  <Shell eyebrow="05 — 执行：编排者 + 并发事项" title="一个编排者，多线并行">
    <div
      className="bh bh-rise"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 0,
        border: `1px solid ${line}`,
        background: panel,
        borderRadius: 'var(--osd-radius)',
        padding: '30px 36px',
        animationDelay: '0.14s',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: mono, fontSize: 22, color: muted }}>INBOX</div>
        <div style={{ fontSize: 32, fontWeight: 750, marginTop: 6 }}>Bot Inbox</div>
      </div>
      <div
        style={{
          flex: 1,
          textAlign: 'center',
          fontFamily: mono,
          fontSize: 30,
          color: 'var(--osd-accent)',
        }}
      >
        ──▶
      </div>
      <div
        style={{
          textAlign: 'center',
          background: accentSoft,
          border: '1px solid rgba(52,211,153,0.4)',
          borderRadius: 12,
          padding: '18px 34px',
        }}
      >
        <div style={{ fontFamily: mono, fontSize: 22, color: 'var(--osd-accent)' }}>
          ORCHESTRATOR
        </div>
        <div style={{ fontSize: 32, fontWeight: 800, marginTop: 4 }}>编排者</div>
      </div>
      <div
        style={{
          flex: 1,
          textAlign: 'center',
          fontFamily: mono,
          fontSize: 30,
          color: 'var(--osd-accent)',
        }}
      >
        ──▶
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: mono, fontSize: 22, color: muted }}>ASSIGNMENTS</div>
        <div style={{ fontSize: 32, fontWeight: 750, marginTop: 6 }}>
          事项 A <span style={{ color: dim }}>·</span> 事项 B <span style={{ color: dim }}>·</span>{' '}
          …
        </div>
      </div>
    </div>
    <p
      className="bh bh-fade"
      style={{
        margin: '30px 0 0 0',
        fontSize: 28,
        lineHeight: 1.6,
        color: muted,
        animationDelay: '0.22s',
      }}
    >
      Wake Policy 决定何时唤醒 · 事项经 report 回到编排者 · 默认全局并发上限 3，无排队。
    </p>
  </Shell>
);

// 7 — DeepSeekBot
const App: Page = () => (
  <Shell eyebrow="06 — 首个应用 DeepSeekBot" title="把 Bot 带进侧边栏">
    <div style={{ display: 'flex', gap: 28 }}>
      <Card
        no="ROSTER"
        title="Roster"
        body="Bot 与 Channel 一眼可见：状态、未读、事项，一处进入。"
      />
      <Card no="@ MENTION" title="@ 委派" body="从私聊或群里 @ 它。直复，或开一个独立事项去做。" />
      <Card
        no="FEISHU / LARK"
        title="IM 接入"
        body="飞书双向消息。App Secret 只进凭证服务，永不进仓库。"
      />
    </div>
  </Shell>
);

// 8 — Closing
const Closing: Page = () => (
  <div style={fill}>
    <Styles />
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background:
          'radial-gradient(1000px 480px at 50% 108%, rgba(52,211,153,0.18), transparent 65%)',
      }}
    />
    <div style={{ position: 'absolute', left: 120, right: 120, top: 104 }}>
      <Eyebrow>07 — 现状与下一步</Eyebrow>
      <Title>一次只做端到端一小片</Title>
    </div>
    <div
      className="bh bh-rise"
      style={{
        position: 'absolute',
        left: 120,
        right: 120,
        top: 400,
        display: 'flex',
        gap: 28,
        animationDelay: '0.14s',
      }}
    >
      <div
        style={{
          flex: 1,
          border: `1px solid ${line}`,
          background: panel,
          borderRadius: 14,
          padding: '28px 32px',
        }}
      >
        <div
          style={{
            fontFamily: mono,
            fontSize: 22,
            letterSpacing: '0.12em',
            color: 'var(--osd-accent)',
          }}
        >
          DONE
        </div>
        <div style={{ marginTop: 10, fontSize: 30, lineHeight: 1.55, color: '#d7e1ea' }}>
          M1 骨架已合 · M2 记忆 MVP
          <br />
          下一步 M3 Roster 与委派
        </div>
      </div>
      <div
        style={{
          flex: 1,
          border: `1px solid ${line}`,
          background: panel,
          borderRadius: 14,
          padding: '28px 32px',
        }}
      >
        <div
          style={{
            fontFamily: mono,
            fontSize: 22,
            letterSpacing: '0.12em',
            color: 'var(--osd-accent)',
          }}
        >
          HOW
        </div>
        <div style={{ marginTop: 10, fontSize: 30, lineHeight: 1.55, color: '#d7e1ea' }}>
          Tracer bullet：可跑的垂直切片
          <br />
          Human 可上手验证再扩展
        </div>
      </div>
      <div
        style={{
          flex: 1,
          border: `1px solid ${line}`,
          background: panel,
          borderRadius: 14,
          padding: '28px 32px',
        }}
      >
        <div
          style={{
            fontFamily: mono,
            fontSize: 22,
            letterSpacing: '0.12em',
            color: 'var(--osd-accent)',
          }}
        >
          DOCS
        </div>
        <div style={{ marginTop: 10, fontSize: 30, lineHeight: 1.55, color: '#d7e1ea' }}>
          botharness.ai · CONTEXT 术语
          <br />
          决策在 docs/adr
        </div>
      </div>
    </div>
    <div
      className="bh bh-fade"
      style={{
        position: 'absolute',
        left: 120,
        right: 120,
        bottom: 170,
        fontFamily: mono,
        fontSize: 26,
        letterSpacing: '0.04em',
        color: muted,
        animationDelay: '0.22s',
      }}
    >
      $ pnpm install && pnpm build <span style={{ color: dim }}>· MIT · 欢迎试用与反馈</span>
    </div>
    <Footer />
  </div>
);

export const meta: SlideMeta = {
  title: 'BotHarness 介绍',
  createdAt: '2026-09-26T19:36:26.420Z',
};

export const notes: (string | undefined)[] = [
  '开场：BotHarness 是 DSH 之上的插件层，给 Agent 一份持久身份。关键词：PersonaBot、Git 记忆、并发执行。30 秒讲完这页。',
  '痛点：现在的 Agent 活在单次会话里。换 Chat、换目录就失忆；记忆靠粘贴；一次一件事。BotHarness 就是为这三件事来的。',
  'PersonaBot：一个 Bot 就是一个人。有稳定 ID、有 Git 记忆仓库、有执行归属。Persona 只是记忆里的一份内容，不是身份本身。',
  '架构：不 fork DSH。DSH 继续拥有执行和凭证；BotHarness 拥有身份与协作事实，统一放在 botharness.db；前端只经 RPC 读投影。',
  '记忆：工作树即记忆。每 Bot 一个 Git 仓库，改了就是记住了。Persona 快照进新会话，老会话不受影响。审计靠 Git。',
  '执行：Bot Inbox 收事件，按 Wake Policy 唤醒编排者；编排者直复或开 Assignment 并发做；事项 report 回来再决定。默认并发 3。',
  'DeepSeekBot 是首个应用：侧边栏 Roster、@ 委派、飞书 Lark 双向。Secret 只进凭证服务，不进仓库不进日志。',
  '收尾：M1 M2 已完成，下一步 M3。我们按 tracer bullet 交付：一次一小片端到端，Human 可验证。文档在 botharness.ai，欢迎试。',
];

export default [Cover, Problem, Persona, Arch, Memory, Exec, App, Closing] satisfies Page[];
