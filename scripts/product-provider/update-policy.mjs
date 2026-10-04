export function productManagedUpdate(endpoint, payload, signal, version) {
  if (signal?.aborted)
    return { ok: false, error: { code: 'cancelled', message: 'Request cancelled.' } };
  if (
    endpoint !== 'update.status' ||
    payload === null ||
    typeof payload !== 'object' ||
    Array.isArray(payload) ||
    Object.keys(payload).length !== 0
  )
    return {
      ok: false,
      error: { code: 'product-managed', message: 'Update this Provider with BotHarness.' },
    };
  return {
    ok: true,
    value: {
      runningVersion: version,
      installedVersion: version,
      latestVersion: null,
      canInstall: false,
      sourceInstall: false,
      blockedReason: 'product-managed',
      profileName: null,
      environmentKind: 'product',
      checkedAt: null,
      checkId: null,
      job: null,
    },
  };
}
