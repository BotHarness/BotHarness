export interface MemoryFileNode {
  name: string;
  path: string;
  kind: 'directory' | 'file';
  children: MemoryFileNode[];
}

/** Build a directory tree from the Memory Service's bounded current-file paths. */
export function memoryFileTree(paths: readonly string[]): MemoryFileNode[] {
  const roots: MemoryFileNode[] = [];
  const directories = new Map<string, MemoryFileNode>();
  for (const path of paths) {
    const parts = path.split('/');
    let siblings = roots;
    for (let index = 0; index < parts.length; index += 1) {
      const name = parts[index]!;
      const currentPath = parts.slice(0, index + 1).join('/');
      if (index === parts.length - 1) {
        siblings.push({ name, path: currentPath, kind: 'file', children: [] });
      } else {
        let directory = directories.get(currentPath);
        if (directory === undefined) {
          directory = { name, path: currentPath, kind: 'directory', children: [] };
          directories.set(currentPath, directory);
          siblings.push(directory);
        }
        siblings = directory.children;
      }
    }
  }
  const sort = (nodes: MemoryFileNode[]): void => {
    nodes.sort(
      (left, right) =>
        (left.kind === right.kind ? 0 : left.kind === 'directory' ? -1 : 1) ||
        left.name.localeCompare(right.name),
    );
    for (const node of nodes) sort(node.children);
  };
  sort(roots);
  return roots;
}
