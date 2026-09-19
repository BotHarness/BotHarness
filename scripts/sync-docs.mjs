#!/usr/bin/env node
/**
 * sync-docs.mjs — generate the docs site's content from repo sources.
 *
 * Bilingual layout (see `apps/docs` AGENT.md):
 *
 *   - English is primary. The `docs` collection serves the root URL tree
 *     (`/docs/**`, `/dev/**`). Hand-translated user docs live in
 *     `apps/docs/src/content/docs/docs/`; this script generates
 *     `docs/dev/**` from the repo sources.
 *   - Chinese is secondary, mounted at `/zh/**` through Nimbus's
 *     `versions.others` mechanism (`docs-zh` collection). Hand-translated
 *     user docs live in `apps/docs/src/content/docs-zh/docs/`; this script
 *     generates `docs-zh/dev/**` from the repo sources.
 *
 * The repo files are the single source of truth: every generated page is
 * rebuilt from them on each `syncDocs()` call.
 *
 *   - A page with both an English and a Chinese source (`PAGES[].en` /
 *     `PAGES[].zh`, e.g. the architecture page) is written verbatim into
 *     both trees.
 *   - A page with only a Chinese source is Chinese in both trees, but the
 *     English-tree copy carries `untranslated: true`, so the root route
 *     renders it with the "not translated yet" banner.
 *   - A page with only an English source would be English in both trees,
 *     with the Chinese-tree copy flagged `untranslated: true` so the `/zh`
 *     route renders the Chinese notice instead.
 *
 * Changelog entries are language pairs keyed by base filename:
 *
 *   - `docs/changelog/<date>-<slug>.md`    → English (primary)
 *   - `docs/changelog/<date>-<slug>.zh.md` → Chinese
 *
 * Each tree is generated from its own side (`changelog` for the English
 * tree at `/changelog/**`, `changelog-zh` for the Chinese tree at
 * `/zh/changelog/**`). A missing side falls back to the other language and
 * is flagged `untranslated` so its route renders the notice banner plus a
 * link to the counterpart.
 *
 * Never hand-edit anything under `src/content/docs/dev/**`,
 * `src/content/docs-zh/dev/**`, `src/content/changelog/**`, or
 * `src/content/changelog-zh/**`.
 */
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = join(ROOT, 'apps', 'docs', 'src', 'content');
const DIAGRAMS_RENDERED = join(ROOT, 'docs', 'architecture', 'diagrams', 'rendered');
const DIAGRAMS_PUBLIC = join(ROOT, 'apps', 'docs', 'public', 'diagrams');
const GITHUB_BLOB = 'https://github.com/BotHarness/BotHarness/blob/main/';
const SKILL = '.agents/skills/dsh-plugin-dev/';

const ARCHITECTURE_DIAGRAMS_ZH = [
  { name: '01-system-context', caption: '系统上下文' },
  { name: '02-modules', caption: 'Deep modules 与所有权' },
  { name: '03-boot', caption: 'Host 启动、迁移与 recovery' },
  { name: '04-create-bot', caption: 'Messaging 事务与外部副作用' },
  { name: '05-im-binding', caption: 'Orchestrator 与 Work control plane' },
  { name: '06-state', caption: '持久化、导出与恢复边界' },
];

const ARCHITECTURE_DIAGRAMS_EN = [
  { name: '01-system-context', caption: 'System context' },
  { name: '02-modules', caption: 'Deep modules and ownership' },
  { name: '03-boot', caption: 'Host boot, migration, and recovery' },
  { name: '04-create-bot', caption: 'Messaging transaction and external side effects' },
  { name: '05-im-binding', caption: 'Orchestrator and Work control plane' },
  { name: '06-state', caption: 'Persistence, export, and restore boundaries' },
];

/**
 * Repo sources per docs page. Each variant carries its source file, the
 * frontmatter fallback copy, and (for the architecture page) the diagram
 * captions/`lang`. Pages without a variant source are rendered from the
 * other language's source and flagged `untranslated`.
 */
const PAGES = [
  {
    slug: 'dev/architecture',
    order: 0,
    zh: {
      source: 'docs/architecture/botharness-architecture.md',
      title: '架构与数据流',
      description: '系统上下文、模块、数据流与边界（持续维护）',
      diagrams: ARCHITECTURE_DIAGRAMS_ZH,
    },
    en: {
      source: 'docs/architecture/botharness-architecture.en.md',
      title: 'BotHarness Architecture & Data Flow',
      description: 'System context, modules, data flow and boundaries (living doc)',
      lang: 'en',
      diagrams: ARCHITECTURE_DIAGRAMS_EN,
    },
  },
  {
    slug: 'dev/spec/platform',
    order: 1,
    zh: {
      source: 'docs/botharness.md',
      title: '平台规格',
      description: 'PersonaBot、记忆、状态与工作方式',
    },
  },
  {
    slug: 'dev/spec/app-prd',
    order: 2,
    zh: {
      source: 'PRD.md',
      title: 'DeepSeekBot 应用 PRD',
      description: '首个应用：sidebar 名册、委派与 IM 接入',
    },
  },
  {
    slug: 'dev/spec/context',
    order: 3,
    zh: {
      source: 'CONTEXT.md',
      title: '领域词表',
      description: 'PersonaBot 术语的规范用法',
    },
  },
  {
    slug: 'dev/spec/client-bridge',
    order: 4,
    zh: {
      source: 'docs/client-bridge.md',
      title: '客户端桥',
      description: 'Web Client 与 core 之间的读模型 RPC 契约（M3 初稿）',
    },
  },
];

const LINK_REWRITES = [
  [/\]\(\.?\/?docs\/architecture\/botharness-architecture\.(?:md|html)\)/g, '](/dev/architecture)'],
  [/\]\(\.?\/?docs\/botharness\.md\)/g, '](/dev/spec/platform)'],
  [/\]\(\.?\/?PRD\.md\)/g, '](/dev/spec/app-prd)'],
  [/\]\(\.?\/?CONTEXT\.md\)/g, '](/dev/spec/context)'],
  [/\]\(\.?\/?docs\/client-bridge\.md\)/g, '](/dev/spec/client-bridge)'],
  [/\]\(\.?\/?docs\/adr\/([0-9]{4}-[a-z0-9-]+)\.md\)/g, '](/dev/adr/$1)'],
  [/\]\(\.?\/?README\.en?\.md\)/g, `](${GITHUB_BLOB}README.md)`],
];

const MERMAID_OPEN = '<pre class="mermaid">{`';
const MERMAID_CLOSE = '`}</pre>';

function readText(relativePath) {
  return readFileSync(join(ROOT, relativePath), 'utf8');
}

function writeText(relativePath, content) {
  const absolute = join(CONTENT, relativePath);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, content, 'utf8');
}

function mermaidFenceToRuntime(code) {
  return `${MERMAID_OPEN}\n${String(code).trimEnd()}\n${MERMAID_CLOSE}\n`;
}

function transformMermaid(body) {
  return body.replace(/```mermaid\r?\n([\s\S]*?)```\r?\n?/g, (_match, code) =>
    mermaidFenceToRuntime(code),
  );
}

function transformDiagrams(body, diagrams, lang) {
  let index = 0;
  return body.replace(/```mermaid\r?\n([\s\S]*?)```\r?\n?/g, (_match, code) => {
    const diagram = diagrams[index];
    index += 1;
    if (!diagram) return mermaidFenceToRuntime(code);
    const langAttr = lang === 'en' ? ' lang="en"' : '';
    const caption = diagram.caption ? ` caption=${JSON.stringify(diagram.caption)}` : '';
    return `<Diagram name="${diagram.name}"${caption}${langAttr} />\n`;
  });
}

function rewriteLinks(body) {
  let output = body;
  for (const [pattern, replacement] of LINK_REWRITES) output = output.replace(pattern, replacement);
  return output;
}

function stripFrontmatter(body) {
  const match = body.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { frontmatter: '', body };
  return { frontmatter: match[1] ?? '', body: body.slice(match[0].length) };
}

function stripH1(body) {
  return body.replace(/^#\s+.*\r?\n+/, '');
}

function titleFrom(body, fallback) {
  const match = body.match(/^#\s+(.+)$/m);
  return match ? String(match[1]).trim() : fallback;
}

function frontmatter({ title, description, order, untranslated, extra = [] }) {
  const lines = ['---', `title: ${JSON.stringify(title)}`];
  if (description) lines.push(`description: ${JSON.stringify(description)}`);
  lines.push('sidebar:', `  order: ${order}`);
  if (untranslated) lines.push('untranslated: true');
  lines.push(...extra);
  lines.push('---', '', '');
  return lines.join('\n');
}

/**
 * English sources may carry a maintainer note as an HTML comment directly
 * under the H1 (kept readable in the repo). MDX only accepts JSX-style
 * comments, so drop a leading note when generating the page.
 */
function stripMaintainerNote(body) {
  return body.replace(/^(#\s+[^\r\n]*\r?\n+)\s*<!--[\s\S]*?-->\s*\r?\n+/, '$1');
}

function prepare(body, diagrams, lang) {
  const source = stripMaintainerNote(body);
  const transformed = diagrams
    ? transformDiagrams(stripH1(source), diagrams, lang)
    : transformMermaid(stripH1(source));
  return rewriteLinks(transformed);
}

/** Render one variant of a page (frontmatter + prepared body). */
function renderPage(variant, order, untranslated) {
  const raw = readText(variant.source);
  const { body } = stripFrontmatter(raw);
  const title = titleFrom(body, variant.title);
  return (
    frontmatter({ title, description: variant.description, order, untranslated }) +
    prepare(body, variant.diagrams, variant.lang)
  );
}

/**
 * Generate every `PAGES` entry into both collections: the English tree
 * (`docs/`) keeps translated pages clean and flags Chinese-only fallbacks,
 * the Chinese tree (`docs-zh/`) is the mirror image.
 */
function syncPages() {
  for (const page of PAGES) {
    const enTarget = `docs/${page.slug}.mdx`;
    const zhTarget = `docs-zh/${page.slug}.mdx`;
    if (page.en) {
      writeText(enTarget, renderPage(page.en, page.order, false));
      process.stdout.write(`en: ${page.en.source} -> ${enTarget}\n`);
    } else {
      writeText(enTarget, renderPage(page.zh, page.order, true));
      process.stdout.write(`en: ${page.zh.source} -> ${enTarget} (untranslated)\n`);
    }
    if (page.zh) {
      writeText(zhTarget, renderPage(page.zh, page.order, false));
      process.stdout.write(`zh: ${page.zh.source} -> ${zhTarget}\n`);
    } else {
      writeText(zhTarget, renderPage(page.en, page.order, true));
      process.stdout.write(`zh: ${page.en.source} -> ${zhTarget} (untranslated)\n`);
    }
  }
}

function syncAdr() {
  const directory = join(ROOT, 'docs', 'adr');
  const files = readdirSync(directory)
    .filter((name) => name.endsWith('.md'))
    .sort();
  for (const file of files) {
    const raw = readFileSync(join(directory, file), 'utf8');
    const { frontmatter: sourceFrontmatter, body } = stripFrontmatter(raw);
    const number = Number.parseInt(file.slice(0, 4), 10);
    const title = titleFrom(body, file);
    const status = sourceFrontmatter.match(/^Status:\s*(.+)$/m)?.[1]?.trim();
    const statusLine = status ? `> Status: ${status}\n\n` : '';
    const order = Number.isNaN(number) ? 99 : number;
    const relative = `dev/adr/${file.replace(/\.md$/, '.mdx')}`;
    writeText(
      `docs/${relative}`,
      frontmatter({ title, order, untranslated: true }) + statusLine + prepare(body),
    );
    writeText(`docs-zh/${relative}`, frontmatter({ title, order }) + statusLine + prepare(body));
    process.stdout.write(`adr: ${file} -> docs/${relative} + docs-zh/${relative}\n`);
  }
}

function parseChangelogFrontmatter(raw) {
  const { frontmatter: text, body } = stripFrontmatter(raw);
  const title = text
    .match(/^title:\s*(.+)$/m)?.[1]
    ?.trim()
    .replace(/^["']|["']$/g, '');
  const date = text
    .match(/^date:\s*(.+)$/m)?.[1]
    ?.trim()
    .replace(/^["']|["']$/g, '');
  const tags = text
    .match(/^tags:\s*\[(.*)\]$/m)?.[1]
    ?.split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
  return { body, title, date, tags };
}

/**
 * Group the repo's changelog files into language pairs keyed by base name.
 * `foo.md` is the English side, `foo.zh.md` the Chinese side; either may be
 * absent.
 */
function changelogPairs() {
  const directory = join(ROOT, 'docs', 'changelog');
  const pairs = new Map();
  const files = readdirSync(directory)
    .filter((name) => name.endsWith('.md'))
    .sort();
  for (const file of files) {
    const zh = file.endsWith('.zh.md');
    const key = zh ? file.slice(0, -'.zh.md'.length) : file.slice(0, -'.md'.length);
    const pair = pairs.get(key) ?? {};
    pair[zh ? 'zh' : 'en'] = file;
    pairs.set(key, pair);
  }
  return [...pairs.entries()].sort(([a], [b]) => a.localeCompare(b));
}

/** One tree's copy of a changelog entry (frontmatter + prepared body). */
function renderChangelogEntry(variant, key, untranslated) {
  const { body, title, date, tags } = variant;
  const lines = ['---', `title: ${JSON.stringify(title ?? key)}`];
  lines.push(`date: ${date ?? key.slice(0, 10)}`);
  if (tags && tags.length > 0) lines.push(`tags: [${tags.join(', ')}]`);
  if (untranslated) lines.push('untranslated: true');
  lines.push('---', '', '');
  return lines.join('\n') + prepare(body);
}

/**
 * Generate both changelog trees from the repo pairs: the English tree
 * (`changelog`) from the `.md` side and the Chinese tree (`changelog-zh`)
 * from the `.zh.md` side. A missing side falls back to the other language
 * and is flagged `untranslated`.
 */
function syncChangelog() {
  rmSync(join(CONTENT, 'changelog'), { recursive: true, force: true });
  rmSync(join(CONTENT, 'changelog-zh'), { recursive: true, force: true });

  for (const [key, pair] of changelogPairs()) {
    const en = pair.en ? parseChangelogFrontmatter(readText(`docs/changelog/${pair.en}`)) : null;
    const zh = pair.zh ? parseChangelogFrontmatter(readText(`docs/changelog/${pair.zh}`)) : null;
    writeText(`changelog/${key}.mdx`, renderChangelogEntry(en ?? zh, key, !pair.en));
    writeText(`changelog-zh/${key}.mdx`, renderChangelogEntry(zh ?? en, key, !pair.zh));
    const flags = [pair.en ? 'en' : 'en←zh', pair.zh ? 'zh' : 'zh←en'].join(', ');
    process.stdout.write(`changelog: ${key} (${flags})\n`);
  }
}

function syncDiagrams() {
  rmSync(DIAGRAMS_PUBLIC, { recursive: true, force: true });

  const copySvgs = (source, target) => {
    let files = [];
    try {
      files = readdirSync(source)
        .filter((name) => name.endsWith('.svg'))
        .sort();
    } catch {
      return null;
    }
    if (files.length === 0) return null;
    mkdirSync(target, { recursive: true });
    for (const file of files) {
      copyFileSync(join(source, file), join(target, file));
    }
    return files.length;
  };

  const zh = copySvgs(DIAGRAMS_RENDERED, DIAGRAMS_PUBLIC);
  if (zh === null) {
    process.stderr.write(
      'diagrams: docs/architecture/diagrams/rendered is missing — run "pnpm diagrams"\n',
    );
    return;
  }
  process.stdout.write(`diagrams: ${zh} SVG(s) -> apps/docs/public/diagrams\n`);

  const en = copySvgs(join(DIAGRAMS_RENDERED, 'en'), join(DIAGRAMS_PUBLIC, 'en'));
  if (en === null) {
    process.stderr.write(
      'diagrams: docs/architecture/diagrams/rendered/en is missing — run "pnpm diagrams"\n',
    );
    return;
  }
  process.stdout.write(`diagrams: ${en} SVG(s) -> apps/docs/public/diagrams/en\n`);
}

/** Provenance metadata from the skill's frontmatter; reused by every DSH Dev Docs page. */
function skillProvenance() {
  const { frontmatter: text } = stripFrontmatter(readText(`${SKILL}SKILL.md`));
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === 'metadata:');
  const fields = {};
  if (start === -1) return fields;
  for (const line of lines.slice(start + 1)) {
    const match = line.match(/^\s+([A-Za-z][A-Za-z0-9]*):\s*"?(.*?)"?\s*$/);
    if (!match) break;
    fields[match[1]] = match[2];
  }
  return fields;
}

function provenanceFields({ skillVersion, verifiedAgainst, upstreamSha, verifiedAt }) {
  return [
    `skillVersion: ${JSON.stringify(skillVersion)}`,
    `verifiedAgainst: ${JSON.stringify(verifiedAgainst)}`,
    `upstreamSha: ${JSON.stringify(upstreamSha)}`,
    `verifiedAt: ${JSON.stringify(verifiedAt)}`,
  ];
}

const SKILL_PAGES = [
  {
    slug: 'dsh/context',
    order: 1,
    source: `${SKILL}references/context.md`,
    title: 'Canonical context',
    description: 'Precise DSH, Cordis and BotHarness vocabulary and boundaries',
  },
  {
    slug: 'dsh/decision-tree',
    order: 2,
    source: `${SKILL}references/decision-tree.md`,
    title: 'Decision tree',
    description: 'Choose the correct DSH seam before implementation',
  },
  {
    slug: 'dsh/bot-runtime',
    order: 3,
    source: `${SKILL}references/bot-runtime-architecture.md`,
    title: 'Bot runtime architecture',
    description: 'Keep product IM, Work ownership and DSH delegation separate',
  },
  {
    slug: 'dsh/guide',
    order: 4,
    source: `${SKILL}SKILL.md`,
    title: 'The full guide',
    description: 'Foundation-first workflow, implementation branches and pitfalls',
  },
  {
    slug: 'dsh/host',
    order: 5,
    source: `${SKILL}references/host.md`,
    title: 'Host-side reference',
    description: 'Package manifest, patches, tools, events, lifecycle',
  },
  {
    slug: 'dsh/client',
    order: 6,
    source: `${SKILL}references/client.md`,
    title: 'Client-side reference',
    description: 'dsh.client, slots, RPC and the lazy-CJS build contract',
  },
  {
    slug: 'dsh/slots',
    order: 7,
    source: `${SKILL}references/slots.md`,
    title: 'Slot catalog',
    description: 'Every UI slot with kind, scope and use',
  },
  {
    slug: 'dsh/patterns',
    order: 8,
    source: `${SKILL}references/community-ui-patterns.md`,
    title: 'Community UI patterns',
    description:
      'How the ecosystem builds DSH plugin UI — build routes, proven practices, drift hazards',
  },
];

/**
 * DSH Dev Docs: render the dsh-plugin-dev skill (`.agents/skills/dsh-plugin-dev/`)
 * into the `dsh/` section of both trees, plus the hand-written landing
 * (`docs/dsh/index.md` + `.zh.md`). Every page carries the skill's provenance
 * fields so readers can see which DSH revision its claims were verified
 * against — the mirror repo ships the same values.
 */
function syncSkill() {
  const provenance = provenanceFields(skillProvenance());

  const landing = [
    { tree: 'docs', source: 'docs/dsh/index.md', untranslated: false },
    { tree: 'docs-zh', source: 'docs/dsh/index.zh.md', untranslated: false },
  ];
  for (const variant of landing) {
    const raw = readText(variant.source);
    const { body } = stripFrontmatter(raw);
    const title = titleFrom(body, 'DSH Plugin Development');
    writeText(
      `${variant.tree}/dsh/index.mdx`,
      frontmatter({
        title,
        description:
          'Foundation-first DSH and Cordis design guide — install the skill, then follow its decision tree',
        order: 0,
        untranslated: variant.untranslated,
        extra: provenance,
      }) + prepare(body),
    );
    process.stdout.write(`skill: ${variant.source} -> ${variant.tree}/dsh/index.mdx\n`);
  }

  for (const page of SKILL_PAGES) {
    const raw = readText(page.source);
    const { body } = stripFrontmatter(raw);
    writeText(
      `docs/${page.slug}.mdx`,
      frontmatter({ ...page, untranslated: false, extra: provenance }) + prepare(body),
    );
    writeText(
      `docs-zh/${page.slug}.mdx`,
      frontmatter({ ...page, untranslated: true, extra: provenance }) + prepare(body),
    );
    process.stdout.write(`skill: ${page.source} -> ${page.slug} (docs + docs-zh)\n`);
  }
}

export function syncDocs() {
  for (const stale of [
    'docs/spec',
    'docs/adr',
    'docs/architecture.mdx',
    'docs/dev',
    'docs-zh/dev',
    'docs/dsh',
    'docs-zh/dsh',
  ]) {
    rmSync(join(CONTENT, stale), { recursive: true, force: true });
  }

  syncPages();
  syncAdr();
  syncChangelog();
  syncSkill();
  syncDiagrams();
  process.stdout.write('docs sync complete\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  syncDocs();
}
