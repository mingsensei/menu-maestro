import test from 'node:test';
import assert from 'node:assert/strict';
import { createCatalogCache } from '../src/catalog-cache.js';

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

test('concurrent cold readers share one database load and warm readers reuse the snapshot', async () => {
  const gate = deferred();
  let loads = 0;
  const cache = createCatalogCache({ load: () => { loads++; return gate.promise; } });
  const first = cache.get(), second = cache.get();
  assert.equal(loads, 1);
  const snapshot = { items: [{ name: 'Pasta' }] };
  gate.resolve(snapshot);
  assert.equal(await first, snapshot);
  assert.equal(await second, snapshot);
  for (let index = 0; index < 50; index++) assert.equal(await cache.get(), snapshot);
  assert.equal(loads, 1);
});

test('background refresh never blocks warm chat reads and publishes a complete new snapshot atomically', async () => {
  const gate = deferred();
  let loads = 0;
  const old = { items: [{ price: 100 }] }, updated = { items: [{ price: 200 }] };
  const cache = createCatalogCache({ load: () => ++loads === 1 ? Promise.resolve(old) : gate.promise });
  await cache.get();
  const refresh = cache.refresh();
  assert.equal(await cache.get(), old);
  gate.resolve(updated);
  assert.equal(await refresh, updated);
  assert.equal(await cache.get(), updated);
});

test('invalidating during an in-flight load discards stale data for every waiting reader', async () => {
  const gate = deferred();
  let loads = 0;
  const fresh = { items: [{ price: 200 }] };
  const cache = createCatalogCache({ load: () => ++loads === 1 ? gate.promise : Promise.resolve(fresh) });
  const first = cache.get();
  cache.invalidate();
  const second = cache.get();
  gate.resolve({ items: [{ price: 100 }] });
  assert.equal(await first, fresh);
  assert.equal(await second, fresh);
  assert.equal(loads, 2);
});

test('a failed background refresh retains the usable snapshot, but known admin edits invalidate it', async () => {
  let failing = false;
  const snapshot = { items: [{ price: 100 }] };
  const cache = createCatalogCache({ load: async () => { if (failing) throw Error('database down'); return snapshot; } });
  await cache.get();
  failing = true;
  await assert.rejects(cache.refresh(), /database down/);
  assert.equal(await cache.get(), snapshot);
  cache.invalidate();
  await assert.rejects(cache.get(), /database down/);
  failing = false;
  assert.equal(await cache.get(), snapshot);
});

test('startup warms once, background refresh is scheduled independently of chat, and shutdown stops its timer', async () => {
  let callback, loads = 0, unrefs = 0, stops = 0;
  const timer = { unref: () => unrefs++ };
  const cache = createCatalogCache({
    load: async () => ({ revision: ++loads }),
    schedule: (run, interval) => { callback = run; assert.equal(interval, 300000); return timer; },
    unschedule: handle => { assert.equal(handle, timer); stops++; },
  });
  await cache.start();
  assert.equal(loads, 1);
  assert.equal((await cache.get()).revision, 1);
  callback();
  await cache.refresh();
  assert.equal((await cache.get()).revision, 2);
  assert.equal(unrefs, 1);
  cache.stop();
  assert.equal(stops, 1);
});
