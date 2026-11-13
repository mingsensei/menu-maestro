import test from 'node:test';
import assert from 'node:assert/strict';
import { createConversationCache, createMenuRetriever } from '../src/menu-retrieval.js';

const preferences = { diet: 'any', maxPrice: null, mild: false, avoid: [] };
const intent = { ...preferences, keywords: ['beef'], kind: 'food', includeKids: false, scope: 'catalog', referenceIds: [] };
const items = Array.from({ length: 10 }, (_, index) => ({ id: String(index), name: `Beef pasta ${index}`, description: 'Beef and tomato', price: (index + 1) * 10000, vat: 10, badges: [], category_id: 'pasta' }));
const catalog = { items: [...items, { ...items[0], id: 'tofu', name: 'Tofu', description: 'Tofu', badges: ['vegan'] }], categories: [{ id: 'pasta', name: 'Pasta' }] };
const retrieve = (retriever, extra = {}) => retriever.retrieve({ ...catalog, intent, preferences, ...extra });

test('repeat searches reuse cached IDs without inspecting the catalog again', () => {
  const retriever = createMenuRetriever();
  const first = retrieve(retriever);
  assert.equal(first.retrieval.strategy, 'catalog');
  assert.equal(first.retrieval.inspected, 11);
  const next = retrieve(retriever);
  assert.equal(next.retrieval.strategy, 'cache');
  assert.equal(next.retrieval.inspected, 0);
  assert.deepEqual(next.items, first.items);
});

test('narrowing searches reuse all prior candidates, not just the four shown', () => {
  const retriever = createMenuRetriever();
  const first = retrieve(retriever);
  const next = retrieve(retriever, { previous: { ...first.state, selectedIds: ['0', '1', '2', '3'] }, intent: { ...intent, maxPrice: 80000 } });
  assert.equal(next.retrieval.strategy, 'narrowed');
  assert.equal(next.retrieval.inspected, 10);
  assert.ok(next.items.some(item => item.id === '6'));
  assert.ok(next.items.every(item => item.price * 1.1 <= 80000));
  const broad = retrieve(retriever, { previous: next.state, intent: { ...intent, maxPrice: 200000 } });
  assert.equal(broad.retrieval.strategy, 'catalog');
  assert.equal(broad.items.length, 10);
  const topic = retrieve(retriever, { previous: next.state, intent: { ...intent, keywords: ['tofu'] } });
  assert.equal(topic.retrieval.strategy, 'catalog');
  assert.deepEqual(topic.items.map(item => item.id), ['tofu']);
});

test('prior-dish questions resolve only server-known IDs and still enforce new explicit filters', () => {
  const retriever = createMenuRetriever();
  const first = retrieve(retriever);
  const previous = { ...first.state, selectedIds: ['0', '1'] };
  const detail = retrieve(retriever, { previous, intent: { ...intent, scope: 'previous', keywords: ['ingredients'], referenceIds: ['1'] } });
  assert.equal(detail.retrieval.strategy, 'previous');
  assert.equal(detail.retrieval.inspected, 1);
  assert.deepEqual(detail.items.map(item => item.id), ['1']);
  const filtered = retrieve(retriever, { previous, intent: { ...intent, scope: 'previous' }, preferences: { ...preferences, diet: 'vegan' } });
  assert.deepEqual(filtered.items, []);
  const forged = retrieve(retriever, { previous, intent: { ...intent, scope: 'previous', referenceIds: ['tofu'] } });
  assert.ok(!forged.items.some(item => item.id === 'tofu'));
});

test('a search after a prior-dish answer is not limited to that one dish', () => {
  const retriever = createMenuRetriever({ maxQueries: 1 });
  const first = retrieve(retriever);
  const detail = retrieve(retriever, { previous: { ...first.state, selectedIds: ['0'] }, intent: { ...intent, scope: 'previous', referenceIds: ['0'] } });
  retrieve(retriever, { intent: { ...intent, keywords: ['tofu'] } }); // evicts original search
  const next = retrieve(retriever, { previous: detail.state });
  assert.equal(next.retrieval.strategy, 'narrowed');
  assert.equal(next.items.length, 10);
});

test('catalog changes invalidate results; referenced IDs use current prices and deleted dishes disappear', () => {
  const retriever = createMenuRetriever();
  const first = retrieve(retriever);
  const previous = { ...first.state, selectedIds: ['0', '1'] };
  const updatedItems = [{ ...items[0], price: 999000 }, ...items.slice(2)];
  const changed = retrieve(retriever, { previous, items: updatedItems });
  assert.equal(changed.retrieval.strategy, 'catalog');
  assert.equal(changed.items[0].price, 999000);
  assert.ok(!changed.items.some(item => item.id === '1'));
  const detail = retrieve(retriever, { previous, items: updatedItems, intent: { ...intent, scope: 'previous' } });
  assert.deepEqual(detail.items.map(item => item.id), ['0']);
  assert.equal(detail.items[0].price, 999000);
  const removedCategory = retrieve(retriever, { items: [], categories: [] });
  assert.deepEqual(removedCategory.items, []);
});

test('bounded query cache evicts least recently used searches', () => {
  const retriever = createMenuRetriever({ maxQueries: 2 });
  retrieve(retriever);
  retrieve(retriever, { intent: { ...intent, keywords: ['tofu'] } });
  retrieve(retriever); // retain beef
  retrieve(retriever, { intent: { ...intent, keywords: ['tomato'] } });
  assert.equal(retrieve(retriever).retrieval.strategy, 'cache');
  assert.equal(retrieve(retriever, { intent: { ...intent, keywords: ['tofu'] } }).retrieval.strategy, 'catalog');
});

const input = { messages: [{ role: 'user', content: 'Beef dishes?' }] };
const answer = { reply: 'Try beef pasta.' };
const followup = [...input.messages, { role: 'assistant', content: answer.reply }, { role: 'user', content: 'Which is cheaper?' }];

test('conversation context requires both the opaque ID and matching preceding turn', () => {
  const cache = createConversationCache();
  const id = cache.save(undefined, input, answer, { selectedIds: ['0'] });
  assert.deepEqual(cache.read(id, followup), { selectedIds: ['0'] });
  assert.equal(cache.read(undefined, followup), undefined);
  assert.equal(cache.read('another-guest', followup), undefined);
  assert.equal(cache.read(id, input.messages), undefined);
  assert.equal(cache.read(id, [{ role: 'user', content: 'changed' }, ...followup.slice(1)]), undefined);
});

test('conversation context expires, respects memory limits and matches truncated UI replies', () => {
  let now = 100;
  const cache = createConversationCache({ ttl: 1000, maxEntries: 1, now: () => now });
  const id = cache.save(undefined, input, answer, {});
  const long = { reply: 'x'.repeat(1800) };
  const next = cache.save(undefined, input, long, { selectedIds: ['1'] });
  assert.equal(cache.read(id, followup), undefined);
  const messages = [...input.messages, { role: 'assistant', content: long.reply.slice(0, 1000) }, followup.at(-1)];
  assert.deepEqual(cache.read(next, messages), { selectedIds: ['1'] });
  now += 1000;
  assert.equal(cache.read(next, messages), undefined);
});

test('conversation fingerprints tolerate trimming applied by request validation', () => {
  const cache = createConversationCache();
  const id = cache.save(undefined, input, { reply: 'Reply with whitespace.  ' }, { selectedIds: ['0'] });
  const messages = [...input.messages, { role: 'assistant', content: 'Reply with whitespace.' }, followup.at(-1)];
  assert.deepEqual(cache.read(id, messages), { selectedIds: ['0'] });
});
