import type { BrowserElement } from './browser.js';

export function formatBrowserElement(element: BrowserElement, includeRef = true): string {
  const state: string[] = [];
  if (element.value !== undefined) state.push(`value=${JSON.stringify(element.value)}`);
  if (element.valueTruncated) state.push('value-truncated');
  if (element.checked !== undefined) state.push(`checked=${element.checked}`);
  if (element.disabled) state.push('disabled');
  if (element.readOnly) state.push('readonly');
  if (element.expanded !== undefined) state.push(`expanded=${element.expanded}`);
  if (element.selected !== undefined) state.push(`selected=${element.selected}`);
  const identity = `${includeRef ? element.ref + ' ' : ''}${element.role} ${element.name}`;
  return state.length === 0 ? identity : `${identity} [${state.join(', ')}]`;
}

function boundSnapshot(text: string): string {
  return text.length <= 12000 ? text : `${text.slice(0, 12000)}\n[AX text truncated]`;
}

export function compactBrowserSnapshot(snapshot: string): string {
  const nodePattern = /^([A-Za-z][\w-]*(?: "(?:[^"\\]|\\.)*")?)(?: \[([^\]\n]*)\])?(.*)$/u;
  const lines = snapshot.split('\n');
  const hasRawValue = lines.some((line) => {
    const node = nodePattern.exec(line.replace(/^ *- /u, ''));
    return node?.[3]?.includes(': ') === true;
  });
  if (hasRawValue)
    return `AX context is descriptive; use the Interactive elements refs for actions.\n${boundSnapshot(snapshot)}`;
  const output: string[] = [];
  const parents: { indent: number; content: string; kept: boolean }[] = [];
  for (const line of lines) {
    const match = /^( *)- (.*)$/u.exec(line);
    if (match === null) {
      output.push(line);
      parents.length = 0;
      continue;
    }
    const indent = match[1]!.length;
    while (parents.length > 0 && parents.at(-1)!.indent >= indent) parents.pop();
    const node = nodePattern.exec(match[2]!);
    let content = match[2]!;
    if (node?.[2] !== undefined) {
      const parts = node[2].split(', ').filter((part) => !/^ref=e\d+$/u.test(part));
      content = `${node[1]}${parts.length === 0 ? '' : ` [${parts.join(', ')}]`}${node[3]}`;
    }
    const parent = parents.at(-1);
    const staticText = /^StaticText ("(?:[^"\\]|\\.)*")$/u.exec(content);
    const duplicate =
      staticText !== null &&
      parent !== undefined &&
      (parent.content === `heading ${staticText[1]}` ||
        parent.content.startsWith(`heading ${staticText[1]} [`));
    const kept = !/^(?:generic|paragraph|LabelText)$/u.test(content) && !duplicate;
    if (kept) output.push(`${'  '.repeat(parents.filter((item) => item.kept).length)}- ${content}`);
    parents.push({ indent, content, kept });
  }
  const text = output.join('\n');
  return boundSnapshot(text);
}
