import test from 'node:test';
import assert from 'node:assert/strict';
import { filterItems, priceWithVAT, recommend as runRecommend } from '../src/recommendations.js';
import { chatSchema } from '../src/validation.js';
import { withQueryContract } from './helpers/intent-fixture.js';
const recommend = options => runRecommend({ ...options, ai: withQueryContract(options.ai) });
import { menuFlavourNotes, menuFlavourSummary } from '../src/menu-filters.js';

const items = [
  { id: '1', name: 'Garden salad', description: 'Tomato, lettuce and olive oil', price: 90000, vat: 10, badges: ['vegan', 'vegetarian'] },
  { id: '2', name: 'Beef pasta', description: 'Beef, tomato and cheese', price: 190000, vat: 10, badges: ['beef'] },
  { id: '3', name: 'Spicy tofu', description: 'Tofu with chili sauce', price: 100000, vat: 8, badges: ['vegan', 'spicy'] },
  { id: '4', name: 'Peanut noodles', description: 'Peanut and soy sauce', price: 80000, vat: 0, badges: ['vegan'] },
  { id: '5', name: 'Prawn salad', description: 'Prawns, lettuce', price: 110000, vat: 0, badges: [] },
  { id: '6', name: 'Mislabeled soup', description: 'Chicken, butter and cream', price: 75000, vat: 0, badges: ['vegan', 'dairy'] },
];
const input = (extra = {}) => chatSchema.parse({ language: 'vi', action: 'suggest', messages: [{ role: 'user', content: 'Gợi ý món nhé' }], ...extra });
const offline = { configured: false, json: async () => { throw new Error('provider unavailable'); } };

test('budget includes VAT, including the boundary amount', () => {
  assert.equal(priceWithVAT(items[1]), 209000);
  assert.equal(filterItems([items[1]], { maxPrice: 200000 }).length, 0);
  assert.equal(filterItems([items[1]], { maxPrice: 209000 }).length, 1);
});
test('diet requires explicit menu evidence and rejects contradictory metadata', () => {
  const vegan = filterItems(items, { diet: 'vegan' }).map(item => item.id);
  assert.deepEqual(vegan, ['1', '3', '4']);
  assert.deepEqual(filterItems(items, { diet: 'gluten_free' }), []);
  assert.deepEqual(filterItems(items, { diet: 'dairy_free' }), []);
});
test('combines vegan, budget, spice and allergen-family exclusions', () => {
  assert.deepEqual(filterItems(items, { diet: 'vegan', maxPrice: 100000, mild: true, avoid: ['nuts'] }).map(item => item.id), ['1']);
  assert.equal(filterItems([items[4]], { avoid: ['hải sản'] }).length, 0);
});
test('provider failure does not return guesses for a free-text request', async () => {
  const result = await recommend({ input: input({ action: 'chat', messages: [{ role: 'user', content: 'Tôi dị ứng đậu phộng' }] }), items, ai: offline });
  assert.equal(result.mode, 'unavailable');
  assert.deepEqual(result.items, []);
});
test('structured suggestions keep working without an AI key', async () => {
  const result = await recommend({ input: input({ preferences: { diet: 'vegan', mild: true, avoid: ['nuts'] } }), items, ai: offline });
  assert.equal(result.mode, 'filters');
  assert.deepEqual(result.items.map(item => item.id), ['1']);
  assert.equal(result.items[0].price_with_vat, 99000);
});
test('AI cannot relax explicit filters or supply invented item IDs', async () => {
  let calls = 0;
  const ai = { json: async () => ++calls === 1 ? { diet: 'any', maxPrice: null, mild: false, avoid: [], keywords: [], popular: false, clarification: '' } : { reply: 'Mời bạn thử món này.', itemIds: ['invented'] } };
  const result = await recommend({ input: input({ action: 'chat', preferences: { diet: 'vegan', mild: true, maxPrice: 100000, avoid: ['nuts'] } }), items, ai });
  assert.deepEqual(result.items.map(item => item.id), ['1']);
});
test('natural-language dietary requirements intersect with explicit filters', async () => {
  const ai = { json: async () => ({ diet: 'vegan', maxPrice: null, mild: false, avoid: [], keywords: [], popular: false, clarification: '' }) };
  const result = await recommend({ input: input({ action: 'chat', preferences: { diet: 'gluten_free' } }), items, ai });
  assert.deepEqual(result.items, []);
});
test('clarifies an ambiguous group budget while showing real dishes priced individually', async () => {
  const ai = { json: async () => ({ diet: 'any', maxPrice: null, mild: false, avoid: [], keywords: [], popular: false, clarification: 'Ngân sách này là cho mỗi món hay cả bàn?', clarificationReason: 'budget' }) };
  const result = await recommend({ input: input({ action: 'chat' }), items, ai });
  assert.ok(result.items.length > 0);
  assert.ok(result.items.every(item => items.some(real => real.id === item.id)));
  assert.match(result.reply, /cả bàn/);
});
test('popularity uses actual view counts and discloses absent tracking data', async () => {
  const result = await recommend({ input: input({ action: 'popular' }), items, counts: [{ menu_item_id: '2', view_count: '99' }], popularityAvailable: true, ai: offline });
  assert.equal(result.items[0].id, '2');
  const emptyCounts = await recommend({ input: input({ action: 'popular' }), items, ai: offline });
  assert.match(emptyCounts.reply, /Chưa đủ dữ liệu/);
});

test('default recommendations prioritize higher-priced eligible food without category quotas', async () => {
  const catalog = [
    { ...items[0], category_id: 'starters' },
    { ...items[1], category_id: 'mains' },
    { ...items[2], category_id: 'starters' },
    { ...items[3], category_id: 'pasta' },
    { id: 'water', name: 'Water', description: '', price: 10000, vat: 0, category_id: 'drinks' },
  ];
  const categories = ['starters', 'mains', 'pasta', 'drinks'].map(id => ({ id, name: id, display_name: id }));
  const result = await recommend({ input: input(), items: catalog, categories, ai: offline });
  assert.ok(!result.items.some(item => item.id === 'water'));
  const prices = result.items.map(item => item.price_with_vat);
  assert.deepEqual(prices, [...prices].sort((a, b) => b - a));
});

test('one RTR AI answers restaurant questions from the menu page without needing menu storage', async () => {
  let restaurantCalls = 0;
  const result = await recommend({
    input: { ...input({ action: 'chat' }), context: 'menu' },
    ai: { json: async () => ({ topic: 'restaurant' }) },
    getCatalog: async () => { throw new Error('Menu database must not be needed for a restaurant question'); },
    restaurant: async () => { restaurantCalls++; return { reply: 'Verona có guitar.', items: [], mode: 'ai', sources: [{ id: 'section-3', title: 'Không gian' }] }; },
  });
  assert.equal(restaurantCalls, 1);
  assert.match(result.reply, /guitar/);
  assert.equal(result.sources.length, 1);
});

test('one RTR AI can recommend dishes on home and answer a mixed question with real dishes and knowledge sources', async () => {
  for (const topic of ['menu', 'both']) {
    let restaurantCalls = 0;
    const result = await recommend({
      input: { ...input({ action: 'chat' }), context: 'home' }, items,
      ai: { json: async (system, data) => data.dishes ? { reply: 'Các món phù hợp.' } : { topic, diet: 'any', maxPrice: null, mild: false, avoid: [], keywords: [], clarification: '' } },
      restaurant: async () => { restaurantCalls++; return { reply: 'Nhà hàng ở Đà Nẵng.', sources: [{ id: 'address', title: 'Địa chỉ' }], mode: 'ai', items: [] }; },
    });
    assert.ok(result.items.length > 0);
    assert.ok(result.items.every(item => items.some(real => real.id === item.id)));
    assert.equal(restaurantCalls, topic === 'both' ? 1 : 0);
    if (topic === 'both') { assert.match(result.reply, /Đà Nẵng/); assert.equal(result.sources[0].title, 'Địa chỉ'); }
  }
});

test('a corrected topic replaces compact memory without reusing its subjects as menu filters', async () => {
  let state;
  const previous = { memory: { summary: 'Guest asked about beef and Verona.', keywords: ['beef', 'Verona'] } };
  const updated = { summary: 'Guest now wants tofu, not beef.', keywords: ['tofu', 'tofu'] };
  const ai = { json: async (system, data) => {
    if (data.dishes) {
      assert.deepEqual(data.conversationContext.keywords, ['tofu']);
      return { reply: 'Try the tofu.' };
    }
    assert.deepEqual(data.conversationContext, previous.memory);
    assert.match(system, /latest explicit guest request overrides old context/);
    return { topic: 'menu', keywords: ['tofu'], memory: updated };
  } };
  const result = await recommend({ input: input({ action: 'chat' }), previous, items, ai, onState: value => { state = value; } });
  assert.deepEqual(result.items.map(item => item.id), ['3']);
  assert.deepEqual(state.memory.keywords, ['tofu']);
  assert.equal(result.preferences.memory, undefined);
});

test('explicitly cleared memory replaces old context in both state and restaurant replies', async () => {
  let state;
  const memory = { summary: '', keywords: [] };
  const result = await recommend({
    input: input({ action: 'chat' }),
    previous: { selectedIds: ['1'], memory: { summary: 'Earlier request', keywords: ['Verona'] } },
    ai: { json: async () => ({ topic: 'restaurant', memory, forgetContext: true }) },
    onState: value => { state = value; },
    restaurant: async context => {
      assert.deepEqual(context.memory, memory);
      return { reply: 'What would you like to know?', items: [], mode: 'ai' };
    },
  });
  assert.equal(result.mode, 'ai');
  assert.deepEqual(state.memory, memory);
  assert.deepEqual(state.questions, []);
  assert.equal(state.selectedIds, undefined);
});

test('malformed model memory does not discard a valid intent or replace bounded prior memory', async () => {
  let state;
  const previous = { memory: { summary: 'Guest is choosing a dish.', keywords: ['food'] } };
  const ai = { json: async (_system, data) => data.dishes ? { reply: 'Try this dish.' } : { topic: 'menu', memory: { summary: 'x'.repeat(701), keywords: Array(20).fill('invalid') } } };
  const result = await recommend({ input: input({ action: 'chat' }), previous, items, ai, onState: value => { state = value; } });
  assert.equal(result.mode, 'ai');
  assert.ok(result.items.length > 0);
  assert.deepEqual(state.memory, previous.memory);
});


test('an empty model summary cannot erase earlier guest questions without an explicit forget signal', async () => {
  let state;
  await recommend({
    input: input({ action: 'chat' }),
    previous: { questions: ['Remember Verona.'], memory: { summary: 'Verona', keywords: ['Verona'] } },
    ai: { json: async () => ({ topic: 'restaurant', memory: { summary: '', keywords: [] } }) },
    onState: value => { state = value; },
    restaurant: async ({ questions }) => {
      assert.equal(questions[0], 'Remember Verona.');
      return { reply: 'Restaurant address.', mode: 'ai', items: [] };
    },
  });
  assert.equal(state.questions[0], 'Remember Verona.');
});

test('unsupported, ambiguous or missing detection preserves the selected language', async () => {
  for (const detectedLanguage of ['de', 'ar', 'invalid', null, undefined]) {
    const result = await recommend({
      input: input({ language: 'vi', action: 'chat' }),
      ai: { json: async () => ({ topic: 'restaurant', detectedLanguage }) },
      restaurant: async ({ language }) => {
        assert.equal(language, 'vi');
        return { reply: 'Thông tin nhà hàng.', mode: 'ai', items: [] };
      },
    });
    assert.equal(result.language, 'vi');
    assert.equal(result.mode, 'ai');
  }
});

test('detected language controls menu generation and localized fallback text', async () => {
  let calls = 0;
  const result = await recommend({
    input: input({ language: 'en', action: 'chat' }), items,
    ai: { json: async (system, data) => {
      if (!data.dishes) {
        assert.match(system, /LATEST guest message/);
        return { topic: 'menu', detectedLanguage: 'vi' };
      }
      calls++;
      assert.equal(data.language, 'vi');
      throw new Error('Provider unavailable during answer generation');
    } },
  });
  assert.equal(calls, 1);
  assert.equal(result.language, 'vi');
  assert.equal(result.mode, 'filters');
  assert.match(result.reply, /Bạn thử những món này/);
  assert.equal(result.preferences.detectedLanguage, undefined);
});

test('mixed restaurant and menu answers use one detected language', async () => {
  const result = await recommend({
    input: input({ language: 'en', action: 'chat' }), items,
    ai: { json: async (_system, data) => {
      if (!data.dishes) return { topic: 'both', detectedLanguage: 'fr' };
      assert.equal(data.language, 'fr');
      return { reply: 'Voici quelques plats.' };
    } },
    restaurant: async ({ language }) => {
      assert.equal(language, 'fr');
      return { reply: 'Le restaurant est à Da Nang.', mode: 'ai', sources: [] };
    },
  });
  assert.equal(result.language, 'fr');
  assert.match(result.reply, /Da Nang/);
  assert.match(result.reply, /quelques plats/);
});

test('a broad salmon request searches the Italian menu and returns cards despite optional clarification', async () => {
  const salmon = [
    { id: 'salmon-pasta', name: 'SALMONE PASTA', description: 'Salmon, cream and cherry tomatoes', price: 200000, vat: 10, badges: [] },
    { id: 'salmon-pizza', name: 'SALMONE AFFUMICATO PIZZA', description: 'Smoked salmon, cream cheese and capers', price: 230000, vat: 10, badges: [] },
  ];
  let catalogCalls = 0;
  let answerCalls = 0;
  const result = await recommend({
    input: input({ action: 'chat', context: 'home', messages: [{ role: 'user', content: 't cần món với cá hồi' }] }),
    getCatalog: async () => { catalogCalls++; return { items: [...items, ...salmon], categories: [], counts: [], popularityAvailable: false }; },
    ai: { json: async (system, data) => {
      if (!data.dishes) {
        assert.match(system, /ITALIAN restaurant/);
        return { topic: 'menu', keywords: ['salmon'], clarification: 'Bạn muốn nướng, chiên hay sashimi?', clarificationReason: 'preference' };
      }
      answerCalls++;
      assert.match(system, /recommend the supplied real menu dishes immediately/);
      assert.deepEqual(new Set(data.dishes.map(item => item.name)), new Set(salmon.map(item => item.name)));
      assert.equal(data.exactMatch, true);
      return { reply: 'Bạn thử SALMONE PASTA hoặc SALMONE AFFUMICATO PIZZA nhé.' };
    } },
  });
  assert.equal(catalogCalls, 1);
  assert.equal(answerCalls, 1);
  assert.deepEqual(new Set(result.items.map(item => item.id)), new Set(salmon.map(item => item.id)));
  assert.doesNotMatch(result.reply, /sashimi|Bạn muốn/);
  assert.equal(result.alternatives, false);
});

test('missing requested dishes produce clearly labelled real alternatives without relaxing dietary or price filters', async () => {
  let state;
  const result = await recommend({
    input: input({ action: 'chat', preferences: { diet: 'vegan', maxPrice: 100000, mild: true, avoid: ['nuts'] } }),
    items,
    ai: { json: async (_system, data) => {
      if (!data.dishes) return { topic: 'menu', keywords: ['sashimi'], diet: 'vegan' };
      assert.equal(data.exactMatch, false);
      assert.deepEqual(data.requestedKeywords, ['sashimi']);
      assert.deepEqual(data.dishes.map(item => item.name), ['Garden salad']);
      return { reply: 'Bạn có thể thử Garden salad.' };
    } },
    onState: value => { state = value; },
  });
  assert.equal(result.alternatives, true);
  assert.match(result.reply, /chưa tìm thấy món khớp đúng yêu cầu/);
  assert.deepEqual(result.items.map(item => item.id), ['1']);
  assert.deepEqual(state.selectedIds, ['1']);
  assert.deepEqual(state.intent.keywords, ['sashimi']);
});

test('answer-generation outages still return actual matching dish cards', async () => {
  const result = await recommend({
    input: input({ action: 'chat' }), items,
    ai: { json: async (_system, data) => {
      if (!data.dishes) return { topic: 'menu', keywords: ['beef'], clarification: 'How do you want it cooked?' };
      throw new Error('Provider unavailable');
    } },
  });
  assert.equal(result.mode, 'filters');
  assert.deepEqual(result.items.map(item => item.id), ['2']);
  assert.match(result.reply, /Bạn thử những món này/);
});

test('no safe alternatives means an honest empty result, never dishes violating mandatory restrictions', async () => {
  let generations = 0;
  const result = await recommend({
    input: input({ action: 'chat', preferences: { diet: 'gluten_free', maxPrice: 100000 } }), items,
    ai: { json: async (_system, data) => {
      if (data.dishes) generations++;
      return { topic: 'menu', keywords: ['salmon'] };
    } },
  });
  assert.deepEqual(result.items, []);
  assert.equal(result.alternatives, false);
  assert.equal(generations, 0);
  assert.match(result.reply, /Chưa có món phù hợp/);
});

test('eligible Special dishes precede regular dishes without category diversity pushing specials down', async () => {
  const categories = [
    { id: 'special', name: 'chef_specials', display_name: 'Special' },
    { id: 'pasta', name: 'pasta', display_name: 'Pasta' },
    { id: 'pizza', name: 'pizza', display_name: 'Pizza' },
  ];
  const specials = [1, 2, 3].map(n => ({ id: `special-${n}`, name: `Special salmon ${n}`, description: 'Salmon with orange-butter sauce', price: 300000 + n, vat: 0, category_id: 'special', badges: [] }));
  const regular = [
    { id: 'pasta', name: 'Salmon pasta', description: 'Salmon, cream and tomatoes', price: 100000, vat: 0, category_id: 'pasta', badges: [] },
    { id: 'pizza', name: 'Salmon pizza', description: 'Salmon and cheese', price: 120000, vat: 0, category_id: 'pizza', badges: [] },
  ];
  const result = await recommend({ input: input(), items: [...regular, ...specials], categories, ai: offline });
  assert.deepEqual(result.items.slice(0, 3).map(item => item.id), [...specials].reverse().map(item => item.id));
  assert.equal(result.items[3].id, 'pizza');
});

test('Special priority never overrides budget, dietary restrictions or the requested ingredient', async () => {
  const categories = [{ id: 'special', name: 'special', display_name: 'Special' }, { id: 'pasta', name: 'pasta', display_name: 'Pasta' }];
  const catalog = [
    { id: 'expensive', name: 'Special tofu', description: 'Tofu and tomato', price: 300000, vat: 0, category_id: 'special', badges: ['vegan'] },
    { id: 'meat', name: 'Special beef', description: 'Beef and cream', price: 90000, vat: 0, category_id: 'special', badges: [] },
    { id: 'other', name: 'Special salad', description: 'Lettuce and olive oil', price: 80000, vat: 0, category_id: 'special', badges: ['vegan'] },
    { id: 'regular', name: 'Tofu pasta', description: 'Tofu and tomato', price: 90000, vat: 0, category_id: 'pasta', badges: ['vegan'] },
  ];
  const result = await recommend({ input: input({ action: 'chat', preferences: { diet: 'vegan', maxPrice: 100000 } }), items: catalog, categories, ai: { json: async (_system, data) => data.dishes ? { reply: 'Try tofu pasta.' } : { keywords: ['tofu'], diet: 'vegan' } } });
  assert.deepEqual(result.items.map(item => item.id), ['regular']);
});

test('reply generation receives Special status and is instructed to explain flavour combinations in dish order', async () => {
  const categories = [{ id: 'special', name: 'special', display_name: 'Special' }];
  const salmon = { id: 'salmon', name: 'BAKED SALMON', description: 'Salmon with orange-butter sauce and mashed sweet potatoes', price: 300000, vat: 0, category_id: 'special', badges: [] };
  let generated = false;
  const result = await recommend({ input: input({ action: 'chat' }), items: [salmon], categories, ai: { json: async (system, data) => {
    if (!data.dishes) return { keywords: ['salmon'] };
    generated = true;
    assert.equal(data.dishes[0].isSpecial, true);
    assert.equal(data.dishes[0].description, salmon.description);
    assert.match(system, /how its listed ingredients combine in flavour or texture/);
    assert.match(system, /Keep the supplied dish order/);
    return { reply: 'BAKED SALMON kết hợp vị béo của cá và bơ với chút chua thơm từ cam, cùng vị ngọt của khoai lang nghiền.' };
  } } });
  assert.equal(generated, true);
  assert.match(result.reply, /chua thơm từ cam/);
});


test('flavour guidance is specific to each actual recipe and does not infer heat or melon varieties', () => {
  const notes = menuFlavourNotes({ description: 'Salmon, cream & cherry tomatoes' });
  assert.ok(notes.some(note => note.includes('mild acidity')));
  assert.ok(!notes.some(note => /Garlic|Capers|Orange/.test(note)));
  assert.ok(menuFlavourNotes({ description: 'Spaghetti, blackened salmon, garlic, parmesan' }).some(note => note.includes('no crispness')));
  assert.ok(menuFlavourNotes({ description: 'Lychee, pineapple & melon juice' }).some(note => note.includes('do not say watermelon')));
});


test('provider outages still produce ingredient-grounded flavour descriptions', async () => {
  const salmon = { id: 'salmon', name: 'SALMONE PASTA', description: 'Salmon, cream & cherry tomatoes', description_vi: 'Cá hồi, kem và cà chua bi', price: 200000, vat: 10, badges: [] };
  const result = await recommend({ input: input({ action: 'chat' }), items: [salmon], ai: { json: async (_system, data) => {
    if (!data.dishes) return { keywords: ['salmon'] };
    throw new Error('429 rate limit');
  } } });
  assert.equal(result.mode, 'filters');
  assert.match(result.reply, /vị béo/);
  assert.match(result.reply, /chua thanh/);
  assert.doesNotMatch(result.reply, /vị cay|hương khói|giòn/);
});

test('deterministic tasting notes stay within listed ingredients across supported languages', () => {
  const dish = { description: 'Spaghetti, blackened salmon, garlic, parmesan' };
  for (const language of ['en', 'vi', 'ko', 'ja', 'cn', 'ru', 'kz', 'es', 'fr', 'it']) assert.ok(menuFlavourSummary(dish, language));
  const vi = menuFlavourSummary(dish, 'vi');
  assert.match(vi, /vị béo/);
  assert.doesNotMatch(vi, /chua thanh|vị ngọt|vị cay|hương khói|giòn/);
  assert.equal(menuFlavourSummary({ description: '' }, 'vi'), '');
});
