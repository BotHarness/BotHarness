export function resolveEntryOrder(
  registered: readonly string[],
  saved: readonly string[],
): readonly string[] {
  return [...new Set([...saved, ...registered])];
}
export function moveEntry(order: readonly string[], id: string, target: string): readonly string[] {
  const from = order.indexOf(id);
  const to = order.indexOf(target);
  if (from < 0 || to < 0 || from === to) return order;
  const next = [...order];
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
}
