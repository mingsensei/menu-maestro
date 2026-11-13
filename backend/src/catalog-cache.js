// A shared process-local snapshot. Warm reads never expire it or fetch the database;
// startup, explicit invalidation and the background timer own all refreshes.
export function createCatalogCache({ load, refreshIntervalMs = 300000, onError = () => {}, schedule = setInterval, unschedule = clearInterval }) {
  let snapshot;
  let pending;
  let generation = 0;
  let timer;
  function refresh() {
    if (pending) return pending;
    pending = (async () => {
      for (;;) {
        const startedGeneration = generation;
        let next;
        try { next = await load(); }
        catch (error) { if (startedGeneration !== generation) continue; throw error; }
        if (startedGeneration !== generation) continue;
        snapshot = next;
        return snapshot;
      }
    })().finally(() => { pending = undefined; });
    return pending;
  }
  const backgroundRefresh = () => refresh().catch(onError);
  return {
    get: () => snapshot ? Promise.resolve(snapshot) : refresh(),
    refresh,
    invalidate() { snapshot = undefined; generation++; void backgroundRefresh(); },
    start() {
      if (!timer) {
        timer = schedule(() => { void backgroundRefresh(); }, refreshIntervalMs);
        timer.unref?.();
      }
      return backgroundRefresh();
    },
    stop() { if (timer) unschedule(timer); timer = undefined; },
  };
}
