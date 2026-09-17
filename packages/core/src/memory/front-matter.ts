import { parse, stringify } from 'yaml';

export type MemoryVisibility = 'shared' | 'private';

export interface MemoryDocument {
  summary: string;
  updatedAt: string;
  sources: string[];
  visibility: MemoryVisibility;
  tags?: string[];
  owner?: string;
}

export interface ParsedMemoryFile {
  document: MemoryDocument;
  body: string;
  frontMatterLines: number;
  warnings: string[];
}

export interface ParseMemoryFileOptions {
  mtime: Date;
}

function firstNonEmptyLine(text: string): string {
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return '';
}

function stringList(value: unknown, field: string, warnings: string[]): string[] {
  if (!Array.isArray(value)) {
    warnings.push(`invalid front-matter field: ${field}`);
    return [];
  }
  const result: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') {
      warnings.push(`invalid front-matter field: ${field}`);
      return [];
    }
    const trimmed = entry.trim();
    if (trimmed.length > 0) result.push(trimmed);
  }
  return result;
}

function splitFence(text: string): {
  frontMatter: string | undefined;
  frontMatterLines: number;
  body: string;
  warnings: string[];
} {
  const lines = text.split('\n');
  if (lines[0]?.trim() !== '---') {
    return {
      frontMatter: undefined,
      frontMatterLines: 0,
      body: text,
      warnings: ['missing front-matter'],
    };
  }
  let close = -1;
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index]?.trim() === '---') {
      close = index;
      break;
    }
  }
  if (close === -1) {
    return {
      frontMatter: undefined,
      frontMatterLines: 0,
      body: text,
      warnings: ['unterminated front-matter'],
    };
  }
  return {
    frontMatter: lines.slice(1, close).join('\n'),
    frontMatterLines: close + 1,
    body: lines.slice(close + 1).join('\n'),
    warnings: [],
  };
}

export function parseMemoryFile(text: string, options: ParseMemoryFileOptions): ParsedMemoryFile {
  const split = splitFence(text);
  const warnings = [...split.warnings];
  const body = split.body;
  const fallbackSummary = firstNonEmptyLine(body);
  let parsed: unknown;
  if (split.frontMatter !== undefined && split.frontMatter.trim().length > 0) {
    try {
      parsed = parse(split.frontMatter);
    } catch (error) {
      warnings.push(`invalid front-matter YAML: ${(error as Error).message}`);
    }
  } else if (split.frontMatter !== undefined) {
    warnings.push('empty front-matter');
  }

  const record =
    typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  if (parsed !== undefined && record === undefined) {
    warnings.push('front-matter is not a mapping');
  }
  const fields = record ?? {};

  let summary = fallbackSummary;
  if (fields['summary'] !== undefined) {
    if (typeof fields['summary'] === 'string' && fields['summary'].trim().length > 0) {
      summary = fields['summary'].trim();
    } else {
      warnings.push('invalid front-matter field: summary');
    }
  } else if (record !== undefined) {
    warnings.push('missing front-matter field: summary');
  }

  let updatedAt = options.mtime.toISOString();
  const rawUpdatedAt = fields['updated_at'];
  if (rawUpdatedAt !== undefined) {
    if (typeof rawUpdatedAt === 'string' && Number.isFinite(Date.parse(rawUpdatedAt))) {
      updatedAt = new Date(rawUpdatedAt).toISOString();
    } else {
      warnings.push('invalid front-matter field: updated_at');
    }
  } else if (record !== undefined) {
    warnings.push('missing front-matter field: updated_at');
  }

  let sources: string[] = [];
  if (fields['sources'] !== undefined) {
    sources = stringList(fields['sources'], 'sources', warnings);
  }

  let visibility: MemoryVisibility = 'shared';
  const rawVisibility = fields['visibility'];
  if (rawVisibility !== undefined) {
    if (rawVisibility === 'private' || rawVisibility === 'shared') {
      visibility = rawVisibility;
    } else {
      warnings.push('invalid front-matter field: visibility');
    }
  }

  let tags: string[] | undefined;
  if (fields['tags'] !== undefined) {
    const parsedTags = stringList(fields['tags'], 'tags', warnings);
    if (parsedTags.length > 0) tags = parsedTags;
  }

  let owner: string | undefined;
  if (fields['owner'] !== undefined) {
    if (typeof fields['owner'] === 'string' && fields['owner'].trim().length > 0) {
      owner = fields['owner'].trim();
    } else {
      warnings.push('invalid front-matter field: owner');
    }
  }

  return {
    document: {
      summary,
      updatedAt,
      sources,
      visibility,
      ...(tags === undefined ? {} : { tags }),
      ...(owner === undefined ? {} : { owner }),
    },
    body,
    frontMatterLines: split.frontMatterLines,
    warnings,
  };
}

export function serializeMemoryFile(document: MemoryDocument, body: string): string {
  const fields: Record<string, unknown> = {
    summary: document.summary,
    updated_at: document.updatedAt,
    sources: document.sources,
    visibility: document.visibility,
  };
  if (document.tags !== undefined) fields['tags'] = document.tags;
  if (document.owner !== undefined) fields['owner'] = document.owner;
  const yamlText = stringify(fields).trimEnd();
  return `---\n${yamlText}\n---\n${body}`;
}
