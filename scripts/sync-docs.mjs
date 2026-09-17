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
 *     pages live in `apps/docs/src/content/docs-en/docs/`; this script only
 *     mirrors the generated `docs/dev/**` tree into `docs-en/dev/**` with
 *     `untranslated: true` added to the frontmatter, so the `/en` route can
 *     render the Chinese fallback with an untranslated notice.
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

function transformDiagrams(body, diagrams) {
  let index = 0;
  return body.replace(/```mermaid\r?\n([\s\S]*?)```\r?\n?/g, (_match, code) => {
    const diagram = diagrams[index];
    index += 1;
    if (!diagram) return mermaidFenceToRuntime(code);
    const caption = diagram.caption ? ` caption=${JSON.stringify(diagram.caption)}` : '';
    return `<Diagram name="${diagram.name}"${caption} />\n`;
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

function prepare(body, diagrams) {
  const transformed = diagrams
    ? transformDiagrams(stripH1(body), diagrams)
    : transformMermaid(stripH1(body));
  return rewriteLinks(transformed);
}

function syncPages() {
  for (const page of PAGES) {
    const raw = readText(page.source);
    const { body } = stripFrontmatter(raw);
    const title = titleFrom(body, page.title);
    writeText(page.target, frontmatter({ ...page, title }) + prepare(body, page.diagrams));
    process.stdout.write(`docs: ${page.source} -> ${page.target}\n`);
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
 * Mirror the generated dev tree into the English collection. English has no
 * translated dev docs yet, so every page is the Chinese source plus an
 * `untranslated: true` flag the `/en` route turns into a notice banner.
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

function mirrorDevToEn() {
  const source = join(CONTENT, 'docs', 'dev');
  const target = join(CONTENT, 'docs-en', 'dev');
  rmSync(target, { recursive: true, force: true });
  if (!existsSync(source)) {
    process.stderr.write('en mirror: src/content/docs/dev is missing — nothing to mirror\n');
    return;
  }
  let count = 0;
  for (const absolute of walkFiles(source)) {
    const relative = absolute.slice(source.length + 1);
    const destination = join(target, relative);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, markUntranslated(readFileSync(absolute, 'utf8')), 'utf8');
    count += 1;
  }
  process.stdout.write(`en mirror: docs/dev -> docs-en/dev (${count} file(s))\n`);
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

  let files = [];
  try {
    files = readdirSync(DIAGRAMS_RENDERED)
      .filter((name) => name.endsWith('.svg'))
      .sort();
  } catch {
    process.stderr.write(
      'diagrams: docs/architecture/diagrams/rendered is missing — run "pnpm diagrams"\n',
    );
    return;
  }
  if (files.length === 0) {
    process.stderr.write('diagrams: no rendered SVGs found — run "pnpm diagrams"\n');
    return;
  }

  mkdirSync(DIAGRAMS_PUBLIC, { recursive: true });
  for (const file of files) {
    copyFileSync(join(DIAGRAMS_RENDERED, file), join(DIAGRAMS_PUBLIC, file));
  }
  process.stdout.write(`diagrams: ${files.length} SVG(s) -> apps/docs/public/diagrams\n`);
}

export function syncDocs() {
  for (const stale of ['docs/spec', 'docs/adr', 'docs/architecture.mdx', 'docs/dev']) {
    rmSync(join(CONTENT, stale), { recursive: true, force: true });
  }

  syncPages();
  syncAdr();
  mirrorDevToEn();
  syncChangelog();
  syncDiagrams();
  process.stdout.write('docs sync complete\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  syncDocs();
}
