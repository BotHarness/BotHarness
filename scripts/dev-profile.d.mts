export function developmentProfileManifest<T>(
  manifest: T,
  worktree: string,
): T & {
  dependencies: Record<string, string>;
  dsh: { profile: { bundles: string[] } };
};
