import test from 'node:test';
import assert from 'node:assert/strict';
import { recommend } from '../src/recommendations.js';
import { chatSchema } from '../src/validation.js';

const categories = [{ id: 'mains', name: 'Mains', display_name: 'Mains' }];
const mk = (id, description, badges = []) => ({ id, name: id, description, category_id: 'mains', price: 200000, vat: 0, badges });
const items = [mk('Beef Steak', 'Grilled beef', ['beef']), mk('Shrimp Pasta', 'Pasta with shrimp and tomato'), mk('Veggie Risotto', 'Rice and mushroom', ['vegetarian']), mk('Pork Ribs', 'Pork ribs', ['pork']), mk('Chicken Salad', 'Chicken, lettuce')];
const base = { diet: 'any', maxPrice: null, mild: false, avoid: [], topic: 'menu', kind: 'food', drinkType: 'any', alcohol: 'any', keywords: [], includeKids: false, scope: 'catalog', referenceIds: [], popular: false, clarification: '', clarificationReason: 'none', forgetContext: false, detectedLanguage: 'vi', memory: { summary: '', keywords: [] } };

function conversation() {
  let previous; const messages = [];
  return async (content, output, preferences = {}) => {
    messages.push({ role: 'user', content });
    const result = await recommend({ input: chatSchema.parse({ language: 'vi', messages, preferences }), items, categories, previous, onState: state => { previous = state; },
      ai: { json: async (_system, data) => data.dishes ? { reply: 'ok' } : { ...base, ...output } } });
    messages.push({ role: 'assistant', content: result.reply });
    return result;
  };
}
const ids = result => result.items.map(item => item.id);

test('a newer explicit meat request releases a carried-over vegetarian preference', async () => {
  const turn = conversation();
  const veg = await turn('Tôi ăn chay', { queryMode: 'new_search', searchTerms: [{ type: 'diet', value: 'vegetarian', source: 'ăn chay', scope: 'session' }] });
  assert.deepEqual(ids(veg), ['Veggie Risotto']);
  const beef = await turn('Cho tôi món bò', { queryMode: 'new_search', searchTerms: [{ type: 'ingredient', value: 'beef', source: 'bò' }] });
  assert.deepEqual(ids(beef), ['Beef Steak']);
  assert.equal(beef.alternatives, false);
  assert.deepEqual(beef.appliedFilters.diets, []);
});

test('the session diet keeps applying to requests that do not contradict it', async () => {
  const turn = conversation();
  await turn('Tôi ăn chay', { queryMode: 'new_search', searchTerms: [{ type: 'diet', value: 'vegetarian', source: 'ăn chay', scope: 'session' }] });
  const rice = await turn('Có món nấm không', { queryMode: 'new_search', searchTerms: [{ type: 'ingredient', value: 'mushroom', source: 'nấm' }] });
  assert.deepEqual(ids(rice), ['Veggie Risotto']);
  assert.equal(rice.preferences.diet, 'vegetarian');
});

test('a single exclusion can be lifted without clearing the others', async () => {
  const turn = conversation();
  await turn('Tôi không ăn bò và heo', { queryMode: 'new_search', searchTerms: [{ type: 'avoid', value: 'beef', source: 'bò', scope: 'session' }, { type: 'avoid', value: 'pork', source: 'heo', scope: 'session' }] });
  const pork = await turn('Thật ra heo thì ăn được', { queryMode: 'refine', searchTerms: [{ type: 'remove', value: 'pork', source: 'heo thì ăn được' }] });
  assert.deepEqual(pork.preferences.avoid, ['beef']);
  assert.ok(ids(pork).includes('Pork Ribs'));
  assert.ok(!ids(pork).includes('Beef Steak'));
});

test('explicitly requesting an excluded ingredient shows it with an allergy reminder', async () => {
  const turn = conversation();
  await turn('Tôi không ăn bò', { queryMode: 'new_search', searchTerms: [{ type: 'avoid', value: 'beef', source: 'không ăn bò', scope: 'session' }] });
  const beef = await turn('Thôi cho tôi món bò', { queryMode: 'new_search', searchTerms: [{ type: 'ingredient', value: 'beef', source: 'bò' }] });
  assert.deepEqual(ids(beef), ['Beef Steak']);
  assert.match(beef.reply, /dị ứng/);
});

test('a refine can drop an inherited ingredient requirement', async () => {
  const turn = conversation();
  await turn('món có tôm', { queryMode: 'new_search', searchTerms: [{ type: 'ingredient', value: 'shrimp', source: 'tôm' }] });
  const other = await turn('không cần tôm nữa', { queryMode: 'refine', searchTerms: [{ type: 'remove', value: 'shrimp', source: 'không cần tôm nữa' }] });
  assert.deepEqual(other.preferences.keywords, []);
  assert.ok(ids(other).length > 1);
});

test('remove terms still need evidence in the latest guest message', async () => {
  const turn = conversation();
  await turn('Tôi ăn chay', { queryMode: 'new_search', searchTerms: [{ type: 'diet', value: 'vegetarian', source: 'ăn chay', scope: 'session' }] });
  const next = await turn('Có món nấm không', { queryMode: 'new_search', searchTerms: [{ type: 'ingredient', value: 'mushroom', source: 'nấm' }, { type: 'remove', value: 'diet', source: 'ăn chay' }] });
  assert.equal(next.preferences.diet, 'vegetarian');
});

test('manual UI filters remain mandatory', async () => {
  const turn = conversation();
  const beef = await turn('Cho tôi món bò', { queryMode: 'new_search', searchTerms: [{ type: 'ingredient', value: 'beef', source: 'bò' }] }, { diet: 'vegetarian' });
  assert.ok(!ids(beef).includes('Beef Steak'));
});

test('an allergy is never relaxed by a later request for that ingredient', async () => {
  const turn = conversation();
  await turn('Tôi dị ứng tôm', { queryMode: 'new_search', searchTerms: [{ type: 'allergy', value: 'shrimp', source: 'dị ứng tôm', scope: 'session' }] });
  const shrimp = await turn('Cho tôi món tôm', { queryMode: 'new_search', searchTerms: [{ type: 'ingredient', value: 'shrimp', source: 'tôm' }] });
  assert.ok(!ids(shrimp).includes('Shrimp Pasta'));
  assert.ok(ids(shrimp).length > 0);
  assert.match(shrimp.reply, /dị ứng/);
  assert.deepEqual(shrimp.appliedFilters.allergy, ['shrimp']);
  const removed = await turn('tôm thì ăn được', { queryMode: 'refine', searchTerms: [{ type: 'remove', value: 'shrimp', source: 'tôm thì ăn được' }] });
  assert.ok(!ids(removed).includes('Shrimp Pasta'));
  const named = await turn('Shrimp Pasta thì sao', { queryMode: 'new_search', searchTerms: [{ type: 'dish_name', value: 'Shrimp Pasta', source: 'Shrimp Pasta' }] });
  assert.ok(!ids(named).includes('Shrimp Pasta'));
});

test('an avoid term stated with allergy wording is treated as an allergy', async () => {
  const turn = conversation();
  await turn('Tôi bị dị ứng bò', { queryMode: 'new_search', searchTerms: [{ type: 'avoid', value: 'beef', source: 'bò', scope: 'request' }] });
  const beef = await turn('Cho tôi món bò', { queryMode: 'new_search', searchTerms: [{ type: 'ingredient', value: 'beef', source: 'bò' }] });
  assert.ok(!ids(beef).includes('Beef Steak'));
  assert.deepEqual(beef.preferences.allergy, ['beef']);
});

test('dislikes and allergies in one message are kept apart', async () => {
  const turn = conversation();
  const first = await turn('Tôi dị ứng tôm, không thích heo', { queryMode: 'new_search', searchTerms: [{ type: 'allergy', value: 'shrimp', source: 'dị ứng tôm', scope: 'session' }, { type: 'avoid', value: 'pork', source: 'không thích heo', scope: 'session' }] });
  assert.deepEqual(first.preferences.allergy, ['shrimp']);
  assert.deepEqual(first.preferences.avoid, ['pork']);
  const pork = await turn('Thôi cho món heo', { queryMode: 'new_search', searchTerms: [{ type: 'ingredient', value: 'pork', source: 'heo' }] });
  assert.deepEqual(ids(pork), ['Pork Ribs']);
  assert.deepEqual(pork.preferences.allergy, ['shrimp']);
});

test('starting over clears allergies only through an explicit forget', async () => {
  const turn = conversation();
  await turn('Tôi dị ứng tôm', { queryMode: 'new_search', searchTerms: [{ type: 'allergy', value: 'shrimp', source: 'dị ứng tôm', scope: 'session' }] });
  const reset = await turn('Quên hết đi, cho tôi món tôm', { forgetContext: true, queryMode: 'new_search', searchTerms: [{ type: 'ingredient', value: 'shrimp', source: 'tôm' }] });
  assert.deepEqual(ids(reset), ['Shrimp Pasta']);
});
