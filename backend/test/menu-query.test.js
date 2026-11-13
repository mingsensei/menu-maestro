import test from 'node:test';
import assert from 'node:assert/strict';
import { createAI } from '../src/ai.js';
import { recommend } from '../src/recommendations.js';
import { createMenuRetriever } from '../src/menu-retrieval.js';
import { chatSchema } from '../src/validation.js';

const categories = ['soft_drinks', 'mocktails', 'cocktails', 'coffee', 'wine'].map(id => ({ id, name: id, display_name: id }));
const make = (id, description, category_id, price = 50000) => ({ id, name: id, description, category_id, price, vat: 0, badges: [] });
const items = [make('juice', 'Orange juice', 'soft_drinks'), make('soda', 'Sprite', 'soft_drinks'), make('mocktail', 'Lychee, tea and lime', 'mocktails'), make('cocktail', 'Pineapple and rum', 'cocktails'), make('coffee', 'Espresso', 'coffee'), make('wine', 'Red wine', 'wine')];
const prefs = { diet: 'any', maxPrice: null, mild: false, avoid: [] };
const base = { ...prefs, topic: 'menu', kind: 'drink', drinkType: 'any', alcohol: 'any', keywords: [], includeKids: false, scope: 'catalog', referenceIds: [] };
const question = 'đồ uống không cồn ngon';
const facts = [
  { type: 'kind', value: 'drink', source: 'đồ uống' },
  { type: 'alcohol', value: 'none', source: 'không cồn' },
  { type: 'preference', value: 'tasty', source: 'ngon' },
];
const input = (content = question, preferences = {}) => chatSchema.parse({ language: 'vi', messages: [{ role: 'user', content }], preferences });
const expected = new Set(['juice', 'soda', 'mocktail', 'coffee']);

test('the canonical plan fixes false empty results across model field and prior-context combinations', async () => {
  let cases = 0, rawFalseEmpties = 0;
  for (const kind of ['food', 'drink', 'any']) {
    for (const drinkType of ['any', 'cocktail', 'wine']) {
      for (const scope of ['catalog', 'previous']) {
        for (const keywords of [[], ['non-alcoholic', 'tasty']]) {
          for (const oldType of ['cocktail', 'wine']) {
            const previous = { intent: { ...base, drinkType: oldType }, selectedIds: [oldType], selectedItems: [{ id: oldType, name: oldType }] };
            const raw = { ...base, kind, drinkType, scope, keywords, alcohol: 'none' };
            if (!createMenuRetriever().retrieve({ items, categories, preferences: prefs, intent: raw, previous }).items.length) rawFalseEmpties++;
            const result = await recommend({ input: input(), items, categories, previous,
              ai: { json: async (_system, data) => data.dishes ? { reply: 'Các lựa chọn không cồn.' } : { ...raw, queryMode: 'detail', searchTerms: facts } },
            });
            assert.deepEqual(new Set(result.items.map(item => item.id)), expected, JSON.stringify({ kind, drinkType, scope, keywords, oldType }));
            assert.equal(result.preferences.kind, 'drink');
            assert.equal(result.preferences.drinkType, 'any');
            assert.equal(result.preferences.alcohol, 'none');
            assert.deepEqual(result.preferences.keywords, []);
            assert.equal(result.preferences.scope, 'catalog');
            cases++;
          }
        }
      }
    }
  }
  assert.equal(cases, 72);
  assert.ok(rawFalseEmpties > 0, 'These are demonstrated failures of raw model-output retrieval, not just new happy-path examples.');
});

test('query meaning depends on typed evidence, not the exact wording of the reported Vietnamese sentence', async () => {
  for (const [content, kindSource, alcoholSource, preferenceSource] of [
    ['I want delicious alcohol-free drinks', 'drinks', 'alcohol-free', 'delicious'],
    ['Des boissons sans alcool, bonnes', 'boissons', 'sans alcool', 'bonnes'],
    ['맛있는 무알코올 음료', '음료', '무알코올', '맛있는'],
    ['好喝的无酒精饮料', '饮料', '无酒精', '好喝'],
  ]) {
    const searchTerms = [{ type: 'kind', value: 'drink', source: kindSource }, { type: 'alcohol', value: 'none', source: alcoholSource }, { type: 'preference', value: 'delicious', source: preferenceSource }];
    const result = await recommend({ input: input(content), items, categories, ai: { json: async (_system, data) => data.dishes ? { reply: 'Options.' } : { ...base, kind: 'food', keywords: ['delicious', 'non-alcoholic'], queryMode: 'new_search', searchTerms } } });
    assert.deepEqual(new Set(result.items.map(item => item.id)), expected);
  }
});

test('a genuine unavailable fruit remains a required search term; it is not discarded like a preference', async () => {
  const diagnostics = [];
  const result = await recommend({ input: input('nước ép xoài ngon'), items, categories, onDiagnostic: event => diagnostics.push(event),
    ai: { json: async () => ({ ...base, kind: 'drink', drinkType: 'juice', alcohol: 'none', queryMode: 'new_search',
      searchTerms: [{ type: 'beverage_type', value: 'juice', source: 'nước ép' }, { type: 'ingredient', value: 'mango', source: 'xoài' }, { type: 'preference', value: 'tasty', source: 'ngon' }] }) },
  });
  assert.deepEqual(result.items, []);
  assert.deepEqual(result.preferences.keywords, ['mango']);
  assert.equal(result.retrieval.verifiedCatalog, true);
  assert.ok(result.retrieval.rejected.keywords > 0);
  assert.equal(diagnostics[0].event, 'chat.empty_query');
});

test('an invalid required model term is a query error, not a claim that the restaurant has no matching inventory', async () => {
  const diagnostics = [];
  const result = await recommend({ input: input(), items, categories, onDiagnostic: event => diagnostics.push(event),
    ai: { json: async () => ({ ...base, queryMode: 'new_search', searchTerms: [...facts, { type: 'ingredient', value: 'mango', source: 'text the guest never supplied' }] }) },
  });
  assert.equal(result.mode, 'unavailable');
  assert.doesNotMatch(result.reply, /Chưa có món phù hợp/);
  assert.equal(diagnostics[0].event, 'chat.invalid_query');
  assert.ok(diagnostics[0].issues.includes('required_term_without_evidence'));
});

test('a genuine named-item detail remains scoped to that item', async () => {
  const result = await recommend({ input: input('cocktail đó có thành phần gì?'), items, categories,
    previous: { intent: { ...base, drinkType: 'cocktail' }, selectedIds: ['cocktail'], selectedItems: [{ id: 'cocktail', name: 'cocktail' }] },
    ai: { json: async (_system, data) => data.dishes ? { reply: 'Pineapple and rum.' } : { ...base, scope: 'previous', referenceIds: ['cocktail'], queryMode: 'detail', searchTerms: [{ type: 'dish_name', value: 'cocktail', source: 'cocktail đó' }] } },
  });
  assert.deepEqual(result.items.map(item => item.id), ['cocktail']);
  assert.equal(result.retrieval.strategy, 'previous');
});

test('a new general subject broadens an old subtype while keeping explicit current hard restrictions', async () => {
  const result = await recommend({ input: input(question, { maxPrice: 55000 }), items: [...items, make('pricey', 'Fruit juice', 'soft_drinks', 100000)], categories,
    previous: { intent: { ...base, drinkType: 'wine' }, selectedIds: ['wine'] },
    ai: { json: async (_system, data) => data.dishes ? { reply: 'Options.' } : { ...base, drinkType: 'wine', scope: 'previous', queryMode: 'refine', searchTerms: facts } },
  });
  assert.deepEqual(new Set(result.items.map(item => item.id)), expected);
  assert.ok(!result.items.some(item => ['pricey', 'wine', 'cocktail'].includes(item.id)));
});


test('subjective preference words cannot request an invented popularity ranking', async () => {
  const result = await recommend({ input: input(), items, categories,
    ai: { json: async (_system, data) => data.dishes ? { reply: 'Options.' } : { ...base, popular: true, queryMode: 'new_search', searchTerms: facts } },
  });
  assert.equal(result.preferences.popular, false);
});

const steakCategories = [{ id: 'starters', name: 'starters', display_name: 'Starters' }, { id: 'mains', name: 'mains', display_name: 'Mains' }];
const steaks = [
  make('STEAK SALAD', 'Top blade steak and lettuce', 'starters', 270000),
  make('TOP BLADE STEAK', 'Canadian beef and mashed potatoes', 'mains', 529200),
  make('T-BONE STEAK', 'Australian T-bone steak and potatoes', 'mains', 1080000),
  make('RIB-EYE STEAK', 'Australian beef and fries', 'mains', 1512000),
];
const model = output => ({ json: async (_system, data) => data.dishes ? { reply: 'Các món steak trong thực đơn.' } : output });

test('a partial dish-family request searches the whole menu instead of binding to the previous Steak Salad', async () => {
  const result = await recommend({ input: input('Có steak ko'), items: steaks, categories: steakCategories,
    previous: { intent: { ...base, kind: 'food', keywords: ['salad'], maxPrice: 300000 }, selectedIds: ['STEAK SALAD'], selectedItems: [{ id: 'STEAK SALAD', name: 'STEAK SALAD' }], questions: ['salad'] },
    ai: model({ ...base, kind: 'food', maxPrice: 300000, scope: 'previous', referenceIds: ['STEAK SALAD'], queryMode: 'detail',
      searchTerms: [{ type: 'dish_name', value: 'STEAK SALAD', source: 'steak' }, { type: 'ingredient', value: 'salad', source: 'salad' }] }),
  });
  assert.deepEqual(result.items.map(item => item.id), ['RIB-EYE STEAK', 'T-BONE STEAK', 'TOP BLADE STEAK', 'STEAK SALAD']);
  assert.deepEqual(result.preferences.keywords, []);
  assert.deepEqual(result.preferences.subjects, [{ value: 'steak', categoryIds: [] }]);
  assert.equal(result.preferences.maxPrice, null);
  assert.equal(result.preferences.scope, 'catalog');
});

test('an unrequested model-inferred budget is removed; a manually selected cap is retained', async () => {
  const output = { ...base, kind: 'food', maxPrice: 300000, queryMode: 'new_search', searchTerms: [{ type: 'dish_type', value: 'steak', source: 'steak' }] };
  const uncapped = await recommend({ input: input('Có steak ko'), items: steaks, categories: steakCategories, ai: model(output) });
  assert.equal(uncapped.items.length, 4);
  assert.equal(uncapped.preferences.maxPrice, null);
  const capped = await recommend({ input: input('Có steak ko', { maxPrice: 300000 }), items: steaks, categories: steakCategories, ai: model(output) });
  assert.deepEqual(capped.items.map(item => item.id), ['STEAK SALAD']);
  assert.equal(capped.preferences.maxPrice, 300000);
});

test('a spoken price cap requires matching numeric evidence and is not inferred from taste words', async () => {
  for (const [content, source, value] of [['steak dưới 600k', '600k', '600000'], ['steak dưới 600.000đ', '600.000đ', '600000'], ['steak dưới 0,6 triệu', '0,6 triệu', '600000'], ['steak dưới 600k thôi', 'dưới 600k thôi', '600000 VND'], ['steak dưới 600k', '600k', '600.000 ₫']]) {
    const result = await recommend({ input: input(content), items: steaks, categories: steakCategories,
      ai: model({ ...base, kind: 'food', queryMode: 'new_search', searchTerms: [{ type: 'dish_type', value: 'steak', source: 'steak' }, { type: 'budget', value, source }] }),
    });
    assert.equal(result.preferences.maxPrice, 600000);
    assert.deepEqual(result.items.map(item => item.id), ['TOP BLADE STEAK', 'STEAK SALAD']);
  }
  const inferred = await recommend({ input: input('steak ngon'), items: steaks, categories: steakCategories,
    ai: model({ ...base, kind: 'food', maxPrice: 300000, queryMode: 'new_search', searchTerms: [{ type: 'dish_type', value: 'steak', source: 'steak' }, { type: 'budget', value: '300000', source: 'ngon' }] }),
  });
  assert.equal(inferred.preferences.maxPrice, null);
  assert.equal(inferred.items.length, 4);
});

test('high prices are preferred by default, with an explicit cheap preference changing order without inventing a budget', async () => {
  const result = await recommend({ input: input('steak rẻ'), items: steaks, categories: steakCategories,
    ai: model({ ...base, kind: 'food', maxPrice: 300000, queryMode: 'new_search', searchTerms: [{ type: 'dish_type', value: 'steak', source: 'steak' }, { type: 'preference', value: 'price_low', source: 'rẻ' }] }),
  });
  assert.equal(result.preferences.maxPrice, null);
  assert.deepEqual(result.items.map(item => item.id), ['STEAK SALAD', 'TOP BLADE STEAK', 'T-BONE STEAK', 'RIB-EYE STEAK']);
});

test('malformed untyped provider output cannot be treated as a verified empty inventory search', async () => {
  const result = await recommend({ input: input(), items, categories, ai: model({ ...base, keywords: ['non-alcoholic', 'tasty'] }) });
  assert.equal(result.mode, 'unavailable');
  assert.doesNotMatch(result.reply, /Chưa có món phù hợp/);
});

test('a cleared manual budget is not resurrected by context during a refinement', async () => {
  const result = await recommend({ input: input('ít cay hơn'), items: steaks, categories: steakCategories,
    previous: { intent: { ...base, kind: 'food', keywords: ['steak'], maxPrice: 300000, budgetExplicit: true, budgetOrigin: 'manual' }, questions: ['steak'] },
    ai: model({ ...base, kind: 'food', maxPrice: 300000, mild: true, queryMode: 'refine', searchTerms: [{ type: 'dish_type', value: 'steak', source: 'steak' }] }),
  });
  assert.equal(result.preferences.maxPrice, null);
  assert.equal(result.items.length, 4);
});

test('empty cache results are rescanned and carry per-stage exclusion counts before an inventory-empty conclusion', () => {
  const retriever = createMenuRetriever();
  const required = { ...base, kind: 'drink', drinkType: 'juice', alcohol: 'none', keywords: ['mango'] };
  const first = retriever.retrieve({ items, categories, preferences: prefs, intent: required });
  assert.equal(first.items.length, 0);
  const cached = retriever.retrieve({ items, categories, preferences: prefs, intent: required });
  assert.equal(cached.retrieval.strategy, 'cache');
  const verified = retriever.retrieve({ items, categories, preferences: prefs, intent: required, forceCatalog: true });
  assert.equal(verified.retrieval.verifiedCatalog, true);
  assert.equal(verified.retrieval.inspected, items.length);
  assert.equal(Object.values(verified.retrieval.rejected).reduce((sum, count) => sum + count, 0), items.length);
});

test('AI-invented diet, mildness and exclusions cannot empty a broad alcohol-free request', async () => {
  const result = await recommend({ input: input(), items, categories,
    ai: model({ ...base, kind: 'food', diet: 'vegan', mild: true, avoid: ['orange', 'tea', 'coffee', 'sprite'], maxPrice: 1000, queryMode: 'new_search', searchTerms: facts }),
  });
  assert.deepEqual(new Set(result.items.map(item => item.id)), expected);
  assert.equal(result.preferences.diet, 'any');
  assert.equal(result.preferences.mild, false);
  assert.deepEqual(result.preferences.avoid, []);
  assert.equal(result.preferences.maxPrice, null);
});

test('verified session exclusions persist across subjects while ordinary meal preferences do not accumulate', async () => {
  let previous;
  await recommend({ input: input('Tôi dị ứng cam, muốn đồ uống không cồn'), items, categories, onState: state => { previous = state; },
    ai: model({ ...base, queryMode: 'new_search', searchTerms: [{ type: 'kind', value: 'drink', source: 'đồ uống' }, { type: 'alcohol', value: 'none', source: 'không cồn' }, { type: 'avoid', value: 'orange', source: 'dị ứng cam', scope: 'session' }] }),
  });
  const next = await recommend({ input: input('coffee'), items, categories, previous,
    ai: model({ ...base, kind: 'drink', queryMode: 'new_search', searchTerms: [{ type: 'beverage_type', value: 'coffee', source: 'coffee' }] }),
  });
  assert.deepEqual(next.preferences.allergy, ['orange']);
  assert.ok(!next.items.some(item => item.id === 'juice'));
  let meal;
  await recommend({ input: input('steak không cay'), items: steaks, categories: steakCategories, onState: state => { meal = state; },
    ai: model({ ...base, kind: 'food', mild: true, queryMode: 'new_search', searchTerms: [{ type: 'dish_type', value: 'steak', source: 'steak' }, { type: 'mild', value: 'true', source: 'không cay', scope: 'request' }] }),
  });
  const fresh = await recommend({ input: input(), items, categories, previous: meal,
    ai: model({ ...base, mild: true, queryMode: 'new_search', searchTerms: facts }),
  });
  assert.equal(fresh.preferences.mild, false);
  assert.deepEqual(new Set(fresh.items.map(item => item.id)), expected);
});


test('a new food subject does not inherit an old alcohol constraint and become a drink search', async () => {
  const result = await recommend({ input: input('steak'), items: steaks, categories: steakCategories,
    previous: { intent: { ...base, alcohol: 'none' } },
    ai: model({ ...base, kind: 'food', alcohol: 'none', queryMode: 'new_search', searchTerms: [{ type: 'dish_type', value: 'steak', source: 'steak' }] }),
  });
  assert.equal(result.preferences.kind, 'food');
  assert.equal(result.preferences.alcohol, 'any');
  assert.equal(result.items.length, 4);
});


test('explicit quick actions remain mandatory without a language model', async () => {
  const food = [make('plain', 'Beef steak', 'mains'), { ...make('veggie', 'Grilled vegetables', 'mains'), badges: ['vegetarian'] }, { ...make('hot', 'Chili beef', 'mains'), badges: ['spicy'] }];
  const foodCategories = [{ id: 'mains', name: 'Mains', display_name: 'Mains' }];
  const vegetarian = await recommend({ input: { ...input('vegetarian'), action: 'vegetarian' }, items: food, categories: foodCategories });
  assert.deepEqual(vegetarian.items.map(item => item.id), ['veggie']);
  const mild = await recommend({ input: { ...input('mild'), action: 'mild' }, items: food, categories: foodCategories });
  assert.ok(mild.items.length > 0);
  assert.ok(!mild.items.some(item => item.id === 'hot'));
});


test('an intent with a role label instead of a guest quote recovers through validated provider failover', async () => {
  const calls = [];
  const ai = createAI({ groqKey: 'test-secret' }, async (url, options) => {
    if (url.endsWith('/models')) return Response.json({ data: ['openai/gpt-oss-20b', 'openai/gpt-oss-120b'].map(id => ({ id, active: true })) });
    const body = JSON.parse(options.body);
    const data = JSON.parse(body.messages[1].content);
    calls.push(body.model);
    const value = data.dishes ? { reply: 'Các món không cồn phù hợp.' } : { ...base, queryMode: 'new_search', searchTerms: body.model === 'openai/gpt-oss-20b' ? facts.map(term => ({ ...term, source: 'guest' })) : facts };
    return Response.json({ choices: [{ message: { content: JSON.stringify(value) } }] });
  });
  const result = await recommend({ input: input(), items, categories, ai });
  assert.equal(result.mode, 'ai');
  assert.deepEqual(new Set(result.items.map(item => item.id)), expected);
  assert.deepEqual(calls.slice(0, 2), ['openai/gpt-oss-20b', 'openai/gpt-oss-120b']);
});

const mealCategories = ['pasta', 'pizza', 'mains', 'Special Pasta'].map(id => ({ id, name: id, display_name: id }));
const meals = [
  make('PASTA ONE', 'Beef, mushroom and parmesan', 'pasta', 200000),
  make('PASTA TWO', 'Beef, mushroom and tomato', 'pasta', 180000),
  make('PASTA THREE', 'Cream and salmon', 'pasta', 160000),
  make('PIZZA ONE', 'Beef, mushroom and mozzarella', 'pizza', 300000),
  make('PIZZA TWO', 'Beef, mushroom and tomato', 'pizza', 250000),
  make('SIDE PASTA', 'Chicken served with pasta and beef', 'mains', 900000),
];

test('multiple requested dish categories are alternatives, cover both groups, and follow guest order rather than price or model order', async () => {
  for (const type of ['dish_type', 'ingredient', 'dish_name']) {
    const retriever = createMenuRetriever();
    for (const order of [['pasta', 'pizza'], ['pizza', 'pasta']]) {
      const result = await recommend({ input: input(`${order.join(' ')} ngon`), items: meals, categories: mealCategories, retriever,
        ai: model({ ...base, kind: 'food', keywords: ['pasta', 'pizza'], queryMode: 'new_search', searchTerms: order.toReversed().map(value => ({ type, value, source: value })) }),
      });
      assert.equal(result.alternatives, false);
      assert.deepEqual(result.items.map(item => item.category_id), [order[0], order[0], order[1], order[1]]);
      assert.ok(!result.items.some(item => item.id === 'SIDE PASTA'));
      assert.deepEqual(result.preferences.keywords, []);
      if (order[0] === 'pizza') assert.equal(result.retrieval.strategy, 'cache');
    }
  }
});

test('a corrected Italian-pasta request replaces old pizza terms and excludes main dishes with pasta sides', async () => {
  let previous;
  await recommend({ input: input('pasta pizza ngon'), items: meals, categories: mealCategories, onState: state => { previous = state; },
    ai: model({ ...base, kind: 'food', queryMode: 'new_search', searchTerms: ['pasta', 'pizza'].map(value => ({ type: 'dish_type', value, source: value })) }),
  });
  for (const value of ['pasta', 'mì Ý']) {
    const result = await recommend({ input: input('tao muốn ăn mì Ý ấy'), items: meals, categories: mealCategories, previous,
      ai: model({ ...base, kind: 'food', keywords: ['pasta', 'pizza'], queryMode: 'refine', searchTerms: [{ type: 'dish_type', value: 'pizza', source: 'pizza' }, { type: 'dish_type', value, source: 'mì Ý' }] }),
    });
    assert.equal(result.alternatives, false);
    assert.equal(result.items.length, 3);
    assert.ok(result.items.every(item => item.category_id === 'pasta'));
    assert.deepEqual(result.preferences.subjects.map(subject => subject.value), ['pasta']);
  }
});

test('required ingredients and budget intersect with alternative dish groups instead of becoming OR filters', async () => {
  const result = await recommend({ input: input('pasta pizza bò nấm dưới 260k'), items: meals, categories: mealCategories,
    ai: model({ ...base, kind: 'food', queryMode: 'new_search', searchTerms: [
      ...['pasta', 'pizza'].map(value => ({ type: 'dish_type', value, source: value })),
      { type: 'ingredient', value: 'beef', source: 'bò' }, { type: 'ingredient', value: 'mushroom', source: 'nấm' },
      { type: 'budget', value: '260000', source: '260k' },
    ] }),
  });
  assert.equal(result.alternatives, false);
  assert.deepEqual(result.items.map(item => item.id), ['PASTA ONE', 'PASTA TWO', 'PIZZA TWO']);
  assert.ok(result.items.every(item => item.price_with_vat <= 260000));
});

test('Special and price ranking apply within requested groups without hiding the second group', async () => {
  const result = await recommend({ input: input('pasta pizza ngon'), items: [...meals, make('HOUSE PASTA', 'Beef and mushrooms', 'Special Pasta', 170000)], categories: mealCategories,
    ai: model({ ...base, kind: 'food', queryMode: 'new_search', searchTerms: ['pasta', 'pizza'].map(value => ({ type: 'dish_type', value, source: value })) }),
  });
  assert.deepEqual(result.items.map(item => item.id), ['HOUSE PASTA', 'PASTA ONE', 'PIZZA ONE', 'PIZZA TWO']);
});


test('a quoted category cannot be expanded into a previously displayed side-pasta product', async () => {
  const previous = { intent: { ...base, kind: 'food' }, selectedIds: ['SIDE PASTA'], selectedItems: [{ id: 'SIDE PASTA', name: 'SIDE PASTA' }] };
  const result = await recommend({ input: input('tao muốn ăn mì Ý ấy'), items: meals, categories: mealCategories, previous,
    ai: model({ ...base, kind: 'food', scope: 'previous', referenceIds: ['SIDE PASTA'], queryMode: 'detail', searchTerms: [{ type: 'dish_name', value: 'SIDE PASTA', source: 'mì Ý' }] }),
  });
  assert.equal(result.alternatives, false);
  assert.ok(result.items.every(item => item.category_id === 'pasta'));
  assert.equal(result.preferences.scope, 'catalog');
});
