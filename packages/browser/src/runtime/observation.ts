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

export function compactBrowserSnapshot(snapshot: string): string {
  const output: string[] = [];
  const parents: { indent: number; content: string; kept: boolean }[] = [];
  for (const line of snapshot.split('\n')) {
    const match = /^( *)- (.*)$/u.exec(line);
    if (match === null) {
      output.push(line);
      parents.length = 0;
      continue;
    }
    const indent = match[1]!.length;
    while (parents.length > 0 && parents.at(-1)!.indent >= indent) parents.pop();
    const node = /^([A-Za-z][\w-]*(?: "(?:[^"\\]|\\.)*")?)(?: \[([^\]\n]*)\])?(.*)$/u.exec(
      match[2]!,
    );
    let content = match[2]!;
    if (node?.[2] !== undefined) {
      const parts = node[2].split(', ').filter((part) => !/^ref=e\d+$/u.test(part));
      content = `${node[1]}${parts.length === 0 ? '' : ` [${parts.join(', ')}]`}${node[3]}`;
    }
    const parent = parents.at(-1);
    const staticText = /^StaticText ("(?:[^"\\]|\\.)*")$/u.exec(content);
    let value: unknown;
    try {
      value = staticText === null ? undefined : JSON.parse(staticText[1]!);
    } catch {}
    const duplicate =
      staticText !== null &&
      parent !== undefined &&
      (parent.content === `heading ${staticText[1]}` ||
        parent.content.startsWith(`heading ${staticText[1]} [`) ||
        (/^(?:textbox|spinbutton|combobox) /u.test(parent.content) &&
          typeof value === 'string' &&
          parent.content.endsWith(`: ${value}`)));
    const kept = !/^(?:generic|paragraph|LabelText)$/u.test(content) && !duplicate;
    if (kept) output.push(`${'  '.repeat(parents.filter((item) => item.kept).length)}- ${content}`);
    parents.push({ indent, content, kept });
  }
  const text = output.join('\n');
  return text.length <= 12000 ? text : `${text.slice(0, 12000)}\n[AX text truncated]`;
}
