import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { parse as parseAstro } from '@astrojs/compiler';
import { parse as parseJavaScript } from '@babel/parser';
import postcss from 'postcss';
import ts from 'typescript-legacy';

const codeExtensions = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.mts', '.cts']);
const sourceExtensions = new Set([...codeExtensions, '.astro', '.css']);
const generatedPrefixes = ['packages/computer/lib/', 'apps/docs/dist/', 'apps/docs/.astro/'];
const firstPartyPrefixes = ['packages/', 'scripts/', 'apps/docs/', 'design/'];

export function isPolicySource(path) {
  const normalized = path.replaceAll('\\', '/');
  if (!sourceExtensions.has(extname(normalized))) return false;
  if (generatedPrefixes.some((prefix) => normalized.startsWith(prefix))) return false;
  if (normalized.endsWith('.min.js') || normalized.endsWith('.map')) return false;
  return (
    firstPartyPrefixes.some((prefix) => normalized.startsWith(prefix)) || !normalized.includes('/')
  );
}

function position(source, offset) {
  const lines = source.slice(0, offset).split('\n');
  return { line: lines.length, column: lines.at(-1).length + 1 };
}

function issue(path, source, kind, offset, token) {
  const { line, column } = position(source, offset);
  const normalizedToken = token.replace(/\r\n/g, '\n');
  return {
    path,
    kind,
    line,
    column,
    token: normalizedToken,
    hash: createHash('sha256').update(`${kind}\0${normalizedToken}`).digest('hex').slice(0, 16),
  };
}

function isException(path, item) {
  if (item.kind !== 'comment') return false;
  if (item.token === '#!/usr/bin/env node' && item.line === 1 && path.startsWith('scripts/'))
    return true;
  if (
    item.token === '// @vitest-environment jsdom' &&
    item.line === 1 &&
    /(?:^|\/)test\/[^/]+\.test\.[jt]sx?$/.test(path)
  )
    return true;
  if (
    path === 'apps/docs/src/components/ui/search/providers/pagefind.ts' &&
    item.token === '/* @vite-ignore */'
  )
    return true;
  if (
    path === 'packages/client/src/client/hash-icon.tsx' &&
    item.line === 1 &&
    item.column === 1 &&
    item.hash === '8d64b9069cfcfaab'
  )
    return true;
  return false;
}

function scriptKind(path) {
  if (path.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (path.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (path.endsWith('.ts') || path.endsWith('.mts') || path.endsWith('.cts'))
    return ts.ScriptKind.TS;
  return ts.ScriptKind.JS;
}

function memberUseEffect(expression, namespaces) {
  if (
    ts.isPropertyAccessExpression(expression) &&
    expression.name.text === 'useEffect' &&
    ts.isIdentifier(expression.expression)
  )
    return namespaces.has(expression.expression.text);
  if (
    ts.isElementAccessExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    ts.isStringLiteral(expression.argumentExpression)
  )
    return (
      namespaces.has(expression.expression.text) &&
      expression.argumentExpression.text === 'useEffect'
    );
  return false;
}

function effectValue(expression, functions, namespaces) {
  if (ts.isIdentifier(expression)) return functions.has(expression.text);
  if (memberUseEffect(expression, namespaces)) return true;
  if (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression)) {
    return effectValue(expression.expression, functions, namespaces);
  }
  if (ts.isConditionalExpression(expression)) {
    return (
      effectValue(expression.whenTrue, functions, namespaces) ||
      effectValue(expression.whenFalse, functions, namespaces)
    );
  }
  return false;
}

function reactBindings(file) {
  const functions = new Set();
  const namespaces = new Set();
  for (const statement of file.statements) {
    if (!ts.isImportDeclaration(statement) || statement.moduleSpecifier.text !== 'react') continue;
    const clause = statement.importClause;
    if (clause?.name) namespaces.add(clause.name.text);
    if (clause?.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
      namespaces.add(clause.namedBindings.name.text);
    }
    if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const specifier of clause.namedBindings.elements) {
        if ((specifier.propertyName ?? specifier.name).text === 'useEffect')
          functions.add(specifier.name.text);
      }
    }
  }
  for (let changed = true; changed;) {
    changed = false;
    function visit(node) {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
        const name = node.name.text;
        if (effectValue(node.initializer, functions, namespaces)) {
          if (!functions.has(name)) {
            functions.add(name);
            changed = true;
          }
        } else if (
          ts.isIdentifier(node.initializer) &&
          namespaces.has(node.initializer.text) &&
          !namespaces.has(name)
        ) {
          namespaces.add(name);
          changed = true;
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(file);
  }
  return { functions, namespaces };
}

function scanScript(path, fragment, source, baseOffset) {
  const file = ts.createSourceFile(path, fragment, ts.ScriptTarget.Latest, true, scriptKind(path));
  const found = [];
  const bindings = reactBindings(file);
  function visit(node) {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (
        (ts.isIdentifier(callee) && bindings.functions.has(callee.text)) ||
        memberUseEffect(callee, bindings.namespaces)
      )
        found.push(
          issue(path, source, 'useEffect', baseOffset + node.getStart(file), node.getText(file)),
        );
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  const parsed = parseJavaScript(fragment, {
    sourceType: 'unambiguous',
    plugins: ['typescript', 'jsx', 'decorators-legacy'],
    allowReturnOutsideFunction: true,
    errorRecovery: true,
  });
  for (const comment of parsed.comments) {
    found.push(
      issue(
        path,
        source,
        'comment',
        baseOffset + comment.start,
        fragment.slice(comment.start, comment.end),
      ),
    );
  }
  if (fragment.startsWith('#!')) {
    found.push(
      issue(path, source, 'comment', baseOffset, fragment.split('\n', 1)[0].replace(/\r$/, '')),
    );
  }
  return found;
}

function scanCss(path, fragment, source, baseOffset) {
  const found = [];
  const root = postcss.parse(fragment, { from: path });
  root.walkComments((node) => {
    const start = node.source.start.offset;
    found.push(
      issue(
        path,
        source,
        'comment',
        baseOffset + start,
        fragment.slice(start, node.source.end.offset),
      ),
    );
  });
  return found;
}

function utf16Offset(source, byteOffset) {
  return Buffer.from(source).subarray(0, byteOffset).toString().length;
}

async function scanAstro(path, source) {
  const { ast } = await parseAstro(source, { position: true });
  const found = [];
  function offsetOf(node) {
    return utf16Offset(source, node.position.start.offset);
  }
  function visit(node) {
    if (node.type === 'comment') {
      const offset = offsetOf(node) - 4;
      found.push(
        issue(
          path,
          source,
          'comment',
          offset,
          source.slice(offset, offset + node.value.length + 7),
        ),
      );
    } else if (node.type === 'frontmatter') {
      const start = source.indexOf(node.value, offsetOf(node));
      found.push(...scanScript(path, node.value, source, start));
    } else if (node.type === 'expression') {
      const start = offsetOf(node);
      const end = node.position.end ? utf16Offset(source, node.position.end.offset) : start;
      if (source[start] === '{' && source[end - 1] === '}') {
        found.push(...scanScript(path, source.slice(start + 1, end - 1), source, start + 1));
      }
    } else if (node.type === 'element' && (node.name === 'script' || node.name === 'style')) {
      for (const child of node.children) {
        if (child.type !== 'text') continue;
        const start = offsetOf(child);
        found.push(
          ...(node.name === 'style'
            ? scanCss(path, child.value, source, start)
            : scanScript(path, child.value, source, start)),
        );
      }
    } else if (node.children) {
      for (const child of node.children) visit(child);
    }
    if (node.attributes) {
      for (const attribute of node.attributes) {
        if (attribute.kind !== 'expression' && attribute.kind !== 'template-literal') continue;
        const start = source.indexOf(attribute.value, offsetOf(attribute));
        found.push(...scanScript(path, attribute.value, source, start));
      }
    }
  }
  visit(ast);
  return found;
}

export async function scanSource(path, source) {
  if (!isPolicySource(path)) return [];
  const normalized = path.replaceAll('\\', '/');
  const extension = extname(normalized);
  const found =
    extension === '.astro'
      ? await scanAstro(normalized, source)
      : extension === '.css'
        ? scanCss(normalized, source, source, 0)
        : scanScript(normalized, source, source, 0);
  const unique = new Map();
  for (const item of found) {
    if (!isException(normalized, item)) {
      unique.set(`${item.kind}:${item.line}:${item.column}:${item.hash}`, item);
    }
  }
  return [...unique.values()].sort((a, b) => a.line - b.line || a.column - b.column);
}

export async function scanRepository(root) {
  const paths = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { cwd: root },
  )
    .toString('utf8')
    .split('\0')
    .filter(isPolicySource);
  const found = [];
  for (const path of paths)
    found.push(...(await scanSource(path, readFileSync(join(root, path), 'utf8'))));
  return found;
}

export function baselineOf(issues) {
  const entries = new Map();
  for (const item of issues) {
    const key = `${item.path}\0${item.kind}\0${item.hash}`;
    const entry = entries.get(key);
    if (entry) entry.count += 1;
    else
      entries.set(key, {
        path: item.path,
        kind: item.kind,
        hash: item.hash,
        count: 1,
        exampleLine: item.line,
        preview: item.token.replace(/\s+/g, ' ').slice(0, 96),
      });
  }
  return [...entries.values()].sort(
    (a, b) =>
      a.path.localeCompare(b.path) || a.exampleLine - b.exampleLine || a.kind.localeCompare(b.kind),
  );
}

export function compareBaseline(issues, baseline) {
  const allowed = new Map(
    baseline.map((entry) => [`${entry.path}\0${entry.kind}\0${entry.hash}`, entry.count]),
  );
  const unexpected = [];
  for (const item of issues) {
    const key = `${item.path}\0${item.kind}\0${item.hash}`;
    const remaining = allowed.get(key) ?? 0;
    if (remaining === 0) unexpected.push(item);
    else allowed.set(key, remaining - 1);
  }
  const stale = baseline.filter(
    (entry) => (allowed.get(`${entry.path}\0${entry.kind}\0${entry.hash}`) ?? 0) > 0,
  );
  return { unexpected, stale };
}
