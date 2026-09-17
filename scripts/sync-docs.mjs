#!/usr/bin/env node
/**
 * sync-docs.mjs — generate the docs site's content from repo sources.
 *
 * Bilingual layout (see `apps/docs` AGENT.md):
 *
 *   - `docs`    — primary Chinese collection. User docs live in
 *     `apps/docs/src/content/docs/docs/` (hand-authored), everything under
 *     `docs/dev/**` is generated here from `docs/`, `PRD.md`, `CONTEXT.md`
 *     and `docs/adr/`.
 *   - `docs-en` — English collection mounted at `/en/**`. Hand-translated
 *     pages live in `apps/docs/src/content/docs-en/docs/`; this script mirrors
 *     the generated `docs/dev/**` tree into `docs-en/dev/**` with
 *     `untranslated: true` added to the frontmatter, so the `/en` route can
 *     render the Chinese fallback with an untranslated notice. Pages with an
 *     English source (`PAGES` entries carrying `lang: 'en'`, i.e. the
 *     architecture page) are written from that source instead and are exempt
 *     from the mirror.
 *
 * The repo files are the single source of truth: every generated file —
 * Chinese or mirrored — is rebuilt from them on each `syncDocs()` call. Never
 * hand-edit `src/content/docs/dev/**` or `src/content/docs-en/dev/**`.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = join(ROOT, 'apps', 'docs', 'src', 'content');
const DIAGRAMS_RENDERED = join(ROOT, 'docs', 'architecture', 'diagrams', 'rendered');
const DIAGRAMS_PUBLIC = join(ROOT, 'apps', 'docs', 'public', 'diagrams');
const GITHUB_BLOB = 'https://github.com/BotHarness/BotHarness/blob/main/';

const ARCHITECTURE_DIAGRAMS = [
  { name: '01-system-context', caption: '系统上下文' },
  { name: '02-modules', caption: '模块与包' },
  { name: '03-boot', caption: '装载与服务暴露' },
  { name: '04-create-bot', caption: '创建 PersonaBot（数据流）' },
  { name: '05-im-binding', caption: 'IM 绑定解析（当前为 helper，M5 接线）' },
  { name: '06-state', caption: '状态机与事件' },
];

const ARCHITECTURE_DIAGRAMS_EN = [
  { name: '01-system-context', caption: 'System context' },
  { name: '02-modules', caption: 'Modules & packages' },
  { name: '03-boot', caption: 'Boot & service exposure' },
  { name: '04-create-bot', caption: 'Creating a PersonaBot (data flow)' },
  { name: '05-im-binding', caption: 'IM binding resolution (helper today, wired in M5)' },
  { name: '06-state', caption: 'State machine & events' },
];

const PAGES = [
  {
    source: 'docs/architecture/botharness-architecture.md',
    target: 'docs/dev/architecture.mdx',
    title: '架构与数据流',
    description: '系统上下文、模块、数据流与边界（持续维护）',
    order: 0,
    diagrams: ARCHITECTURE_DIAGRAMS,
  },
  {
    source: 'docs/architecture/botharness-architecture.en.md',
    target: 'docs-en/dev/architecture.mdx',
    title: 'BotHarness Architecture & Data Flow',
    description: 'System context, modules, data flow and boundaries (living doc)',
    order: 0,
    lang: 'en',
    diagrams: ARCHITECTURE_DIAGRAMS_EN,
  },
  {
    source: 'docs/botharness.md',
    target: 'docs/dev/spec/platform.mdx',
    title: '平台规格',
    description: 'PersonaBot、记忆、状态与工作方式',
    order: 1,
  },
  {
    source: 'PRD.md',
    target: 'docs/dev/spec/app-prd.mdx',
    title: 'DeepSeekBot 应用 PRD',
    description: '首个应用：sidebar 名册、委派与 IM 接入',
    order: 2,
  },
  {
    source: 'CONTEXT.md',
    target: 'docs/dev/spec/context.mdx',
    title: '领域词表',
    description: 'PersonaBot 术语的规范用法',
    order: 3,
  },
];

const LINK_REWRITES = [
  [/\]\(\.?\/?docs\/architecture\/botharness-architecture\.(?:md|html)\)/g, '](/dev/architecture)'],
  [/\]\(\.?\/?docs\/botharness\.md\)/g, '](/dev/spec/platform)'],
  [/\]\(\.?\/?PRD\.md\)/g, '](/dev/spec/app-prd)'],
  [/\]\(\.?\/?CONTEXT\.md\)/g, '](/dev/spec/context)'],
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

function frontmatter({ title, description, order }) {
  const lines = ['---', `title: ${JSON.stringify(title)}`];
  if (description) lines.push(`description: ${JSON.stringify(description)}`);
  lines.push('sidebar:', `  order: ${order}`, '---', '', '');
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

/**
 * Generate every `PAGES` entry. Returns the translated `/en` pages keyed by
 * their path relative to `docs-en/dev` so the mirror below can keep them
 * instead of overwriting them with the Chinese fallback.
 */
function syncPages() {
  const translated = new Map();
  for (const page of PAGES) {
    const raw = readText(page.source);
    const { body } = stripFrontmatter(raw);
    const title = titleFrom(body, page.title);
    const content = frontmatter({ ...page, title }) + prepare(body, page.diagrams, page.lang);
    writeText(page.target, content);
    if (page.lang === 'en') {
      translated.set(page.target.slice('docs-en/dev/'.length), content);
    }
    process.stdout.write(`docs: ${page.source} -> ${page.target}\n`);
  }
  return translated;
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
    const target = `docs/dev/adr/${file.replace(/\.md$/, '.mdx')}`;
    writeText(
      target,
      frontmatter({ title, order: Number.isNaN(number) ? 99 : number }) +
        statusLine +
        prepare(body),
    );
    process.stdout.write(`adr: ${file} -> ${target}\n`);
  }
}

/**
 * Mirror the generated dev tree into the English collection. Most pages have
 * no English source, so they are the Chinese source plus an `untranslated: true`
 * flag the `/en` route turns into a notice banner. `translated` holds pages
 * with a real English source (keyed by path relative to `docs-en/dev`); their
 * generated content is written verbatim — no `untranslated` flag, no banner.
 */
function walkFiles(directory) {
  const files = [];
  for (const dirent of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, dirent.name);
    if (dirent.isDirectory()) files.push(...walkFiles(absolute));
    else files.push(absolute);
  }
  return files;
}

function markUntranslated(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!match) return content;
  return content.replace(match[0], `---\n${match[1]}\nuntranslated: true\n---\n`);
}

function mirrorDevToEn(translated) {
  const source = join(CONTENT, 'docs', 'dev');
  const target = join(CONTENT, 'docs-en', 'dev');
  rmSync(target, { recursive: true, force: true });
  if (!existsSync(source)) {
    process.stderr.write('en mirror: src/content/docs/dev is missing — nothing to mirror\n');
    return;
  }
  let mirrored = 0;
  let kept = 0;
  for (const absolute of walkFiles(source)) {
    const relative = absolute.slice(source.length + 1).replaceAll('\\', '/');
    const destination = join(target, relative);
    mkdirSync(dirname(destination), { recursive: true });
    const english = translated.get(relative);
    if (english) {
      writeFileSync(destination, english, 'utf8');
      kept += 1;
    } else {
      writeFileSync(destination, markUntranslated(readFileSync(absolute, 'utf8')), 'utf8');
      mirrored += 1;
    }
  }
  process.stdout.write(
    `en mirror: docs/dev -> docs-en/dev (${mirrored} mirrored, ${kept} translated)\n`,
  );
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

function syncChangelog() {
  const directory = join(ROOT, 'docs', 'changelog');
  const files = readdirSync(directory)
    .filter((name) => name.endsWith('.md'))
    .sort();
  for (const file of files) {
    const raw = readFileSync(join(directory, file), 'utf8');
    const { body, title, date, tags } = parseChangelogFrontmatter(raw);
    const fallbackDate = file.slice(0, 10);
    const lines = ['---', `title: ${JSON.stringify(title ?? file)}`];
    lines.push(`date: ${date ?? fallbackDate}`);
    if (tags && tags.length > 0) lines.push(`tags: [${tags.join(', ')}]`);
    lines.push('---', '', '');
    const target = `changelog/${file.replace(/\.md$/, '.mdx')}`;
    writeText(target, lines.join('\n') + prepare(body));
    process.stdout.write(`changelog: ${file} -> ${target}\n`);
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

export function syncDocs() {
  for (const stale of ['docs/spec', 'docs/adr', 'docs/architecture.mdx', 'docs/dev']) {
    rmSync(join(CONTENT, stale), { recursive: true, force: true });
  }

  const translated = syncPages();
  syncAdr();
  mirrorDevToEn(translated);
  syncChangelog();
  syncDiagrams();
  process.stdout.write('docs sync complete\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  syncDocs();
}
