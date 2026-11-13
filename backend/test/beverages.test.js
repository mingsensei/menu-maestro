import test from 'node:test';
import assert from 'node:assert/strict';
import { beverageProfile, requestsAlcoholFree, isAlcoholOnlyFollowup, explicitBeverageRequest } from '../src/menu-filters.js';
import { createMenuRetriever } from '../src/menu-retrieval.js';
import { recommend as runRecommend } from '../src/recommendations.js';
import { chatSchema } from '../src/validation.js';
import { withQueryContract } from './helpers/intent-fixture.js';
const recommend = options => runRecommend({ ...options, ai: withQueryContract(options.ai) });

const categories = ['soft_drinks', 'mocktails', 'cocktails', 'coffee', 'unknown_drinks'].map(id => ({ id, name: id, display_name: id }));
const item = (id, name, description, category_id, price) => ({ id, name, description, category_id, price, vat: 0, badges: [] });
const items = [
  item('orange', 'FRESH ORANGE JUICE', 'Fresh orange juice', 'soft_drinks', 54000),
  item('tropical', 'TROPICAL SMOOTH', 'Lychee, pineapple & melon juice', 'soft_drinks', 64800),
  item('rose', 'A LITTLE LOVE', 'Rose tea, lime & lychee juice, sugar, lychees & mint leaf', 'mocktails', 97200),
  item('sandy', 'SANDY BEACH', 'Pineapple juice, lime juice, grenadine, sugar, Amaretto, Cointreau & Bacardi Rum', 'cocktails', 140400),
  item('irish', 'IRISH COFFEE', 'Coffee and Irish whiskey', 'coffee', 100000),
  item('coffee', 'COFFEE', 'Black coffee', 'coffee', 40000),
  item('mislabeled', 'MOCKTAIL WITH RUM', 'Orange juice and rum', 'mocktails', 60000),
  item('unknown', 'UNCONFIRMED DRINK', 'Fruit blend', 'unknown_drinks', 50000),
];
const preferences = { diet: 'any', maxPrice: null, mild: false, avoid: [] };
const intent = { ...preferences, keywords: [], kind: 'drink', includeKids: false, scope: 'catalog', referenceIds: [], drinkType: 'any', alcohol: 'any' };
const input = extra => chatSchema.parse({ language: 'vi', messages: [{ role: 'user', content: 'Có nước ép không?' }], ...extra });
const catalog = { items, categories };
const retrieve = (retriever, overrides = {}) => retriever.retrieve({ ...catalog, preferences, intent, ...overrides });

test('juice means fruit juice, not cocktails or tea-based mocktails containing juice', () => {
  const result = retrieve(createMenuRetriever(), { intent: { ...intent, drinkType: 'juice', alcohol: 'none' } });
  assert.deepEqual(result.items.map(item => item.id), ['orange', 'tropical']);
});

test('non-alcoholic filters exclude cocktail categories, liquor in coffee/mocktails, and unknown alcohol status', () => {
  const result = retrieve(createMenuRetriever(), { intent: { ...intent, alcohol: 'none' } });
  assert.deepEqual(result.items.map(item => item.id), ['orange', 'tropical', 'rose', 'coffee']);
  assert.equal(beverageProfile(items.find(item => item.id === 'sandy'), 'cocktails').alcohol, 'alcoholic');
  assert.equal(beverageProfile(items.find(item => item.id === 'mislabeled'), 'mocktails').alcohol, 'alcoholic');
});

test('cache keys and narrowing include beverage identity and alcohol constraints', () => {
  const retriever = createMenuRetriever();
  const broad = retrieve(retriever);
  const narrow = retrieve(retriever, { previous: broad.state, intent: { ...intent, drinkType: 'juice', alcohol: 'none' } });
  assert.deepEqual(narrow.items.map(item => item.id), ['orange', 'tropical']);
  const cached = retrieve(retriever, { intent: { ...intent, drinkType: 'juice', alcohol: 'none' } });
  assert.equal(cached.retrieval.strategy, 'cache');
  assert.deepEqual(cached.items.map(item => item.id), ['orange', 'tropical']);
  const other = createMenuRetriever();
  const first = retrieve(other, { intent: { ...intent, alcohol: 'none' } });
  const expanded = retrieve(other, { previous: first.state });
  assert.equal(expanded.retrieval.strategy, 'catalog');
  assert.ok(expanded.items.some(item => item.id === 'sandy'));
});

test('all requested ingredient keywords must match rather than any ingredient matching', () => {
  const result = retrieve(createMenuRetriever(), { intent: { ...intent, drinkType: 'juice', alcohol: 'none', keywords: ['orange', 'juice'] } });
  assert.deepEqual(result.items.map(item => item.id), ['orange']);
});

test('previous-item references cannot bypass the new non-alcoholic constraint', () => {
  const result = retrieve(createMenuRetriever(), { previous: { selectedIds: ['sandy', 'rose'] }, intent: { ...intent, scope: 'previous', alcohol: 'none' } });
  assert.deepEqual(result.items.map(item => item.id), ['rose']);
});

test('a juice request returns exactly the two actual juices, without padding with mocktails or cocktails', async () => {
  const result = await recommend({ input: input(), ...catalog, ai: { json: async (_system, data) => {
    if (!data.dishes) return { topic: 'menu', kind: 'drink', keywords: ['juice'] };
    assert.deepEqual(data.dishes.map(item => item.name), ['TROPICAL SMOOTH', 'FRESH ORANGE JUICE']);
    assert.ok(data.dishes.every(item => item.beverage.alcohol === 'none'));
    return { reply: 'Bạn thử nước cam hoặc TROPICAL SMOOTH với vải, dứa và dưa nhé.' };
  } } });
  assert.deepEqual(result.items.map(item => item.id), ['tropical', 'orange']);
  assert.equal(result.alternatives, false);
});

test('a bare non-alcoholic follow-up retains juice identity and earlier budget even if the model forgets', async () => {
  let state;
  const previous = { intent: { ...intent, drinkType: 'juice', maxPrice: 60000, budgetExplicit: true, budgetOrigin: 'spoken' }, selectedIds: ['orange', 'tropical', 'rose', 'sandy'] };
  const result = await recommend({ input: input({ messages: [{ role: 'user', content: 'không cồn?' }] }), ...catalog, previous,
    onState: value => { state = value; },
    ai: { json: async (_system, data) => data.dishes ? { reply: 'Nước cam là lựa chọn không cồn.' } : { topic: 'restaurant', kind: 'food', scope: 'previous', referenceIds: ['sandy'], keywords: [] } },
  });
  assert.deepEqual(result.items.map(item => item.id), ['orange']);
  assert.equal(state.intent.drinkType, 'juice');
  assert.equal(state.intent.alcohol, 'none');
  assert.equal(state.intent.maxPrice, 60000);
});

test('non-alcoholic preferences persist for subsequent drink requests but allow an explicit alcoholic change', async () => {
  const previous = { intent: { ...intent, alcohol: 'none' } };
  const makeAI = alcohol => ({ json: async (_system, data) => data.dishes ? { reply: 'Here are the options.' } : { topic: 'menu', kind: 'drink', alcohol } });
  const retained = await recommend({ input: input({ messages: [{ role: 'user', content: 'Còn đồ uống khác?' }] }), ...catalog, previous, ai: makeAI('any') });
  assert.ok(!retained.items.some(item => ['sandy', 'irish', 'mislabeled', 'unknown'].includes(item.id)));
  const changed = await recommend({ input: input({ messages: [{ role: 'user', content: 'Giờ tôi muốn cocktail có cồn.' }] }), ...catalog, previous, ai: makeAI('alcoholic') });
  assert.ok(changed.items.some(item => item.id === 'sandy'));
  assert.ok(changed.items.every(item => ['sandy', 'irish', 'mislabeled'].includes(item.id)));
});

test('an unavailable requested juice does not produce unrelated drink alternatives', async () => {
  const result = await recommend({ input: input({ messages: [{ role: 'user', content: 'Có nước ép xoài không?' }] }), ...catalog, ai: { json: async () => ({ topic: 'menu', kind: 'drink', drinkType: 'juice', keywords: ['mango'] }) } });
  assert.deepEqual(result.items, []);
  assert.equal(result.alternatives, false);
});

test('short alcohol-free follow-ups are recognized in the supported language scripts', () => {
  for (const phrase of ['không cồn?', 'non-alcoholic?', 'sin alcohol', 'sans alcool', 'senza alcol', 'без алкоголя', 'алкогольсіз', '무알코올', '무알콜', '无酒精', 'アルコールなし']) {
    assert.equal(requestsAlcoholFree(phrase), true, phrase);
    assert.equal(isAlcoholOnlyFollowup(phrase), true, phrase);
  }
  assert.equal(requestsAlcoholFree('có cồn không?'), false);
});

test('mixed food-and-drink queries also enforce alcohol-free restrictions on beverage cards', () => {
  const food = item('salad', 'Garden salad', 'Lettuce and tomato', 'starters', 50000);
  const result = createMenuRetriever().retrieve({ items: [...items, food], categories: [...categories, { id: 'starters', name: 'starters', display_name: 'Starters' }], preferences, intent: { ...intent, kind: 'any', alcohol: 'none' } });
  assert.ok(result.items.some(item => item.id === 'salad'));
  assert.ok(!result.items.some(item => ['sandy', 'irish', 'mislabeled', 'unknown'].includes(item.id)));
});

test('alcohol-free beer can be identified from an explicit label, while alcohol ingredients veto conflicting labels', () => {
  assert.equal(beverageProfile(item('zero', 'Beer 0.0%', 'Alcohol-free lager', 'beers', 50000), 'Beers').alcohol, 'none');
  assert.equal(beverageProfile(item('wrong', 'Alcohol-free mix', 'Orange juice and vodka', 'mocktails', 50000), 'Mocktails').alcohol, 'alcoholic');
});


test('a known alcohol-free follow-up remains safely filtered when intent extraction is unavailable', async () => {
  const previous = { intent: { ...intent, drinkType: 'juice' } };
  const result = await recommend({
    input: input({ context: 'home', messages: [{ role: 'user', content: 'không cồn?' }] }), ...catalog, previous,
    ai: { json: async () => { throw new Error('Provider unavailable'); } },
    restaurant: async () => { throw new Error('A resolved drink follow-up must not fall back to restaurant knowledge'); },
  });
  assert.equal(result.mode, 'filters');
  assert.deepEqual(result.items.map(item => item.id), ['tropical', 'orange']);
  assert.match(result.reply, /Lychee, pineapple & melon juice/);
});


test('an explicit cocktail request cannot become generic drinks when the model omits drinkType', async () => {
  const extras = [item('sprite', 'SPRITE', 'Sprite', 'soft_drinks', 32400), item('tiger', 'TIGER', 'Tiger ABV 5.0%', 'beers', 55000), item('espresso', 'ESPRESSO', 'Espresso', 'coffee', 75600), item('whisky', 'JW BLACK LABEL', 'Blended Scotch Whisky', 'spirits', 93500)];
  const result = await recommend({ input: input({ messages: [{ role: 'user', content: 'cocktail nào ngon nhất' }] }), items: [...items, ...extras], categories: [...categories, { id: 'beers', name: 'beers' }, { id: 'spirits', name: 'spirits' }], ai: { json: async (_system, data) => data.dishes ? { reply: 'SANDY BEACH có vị chua ngọt từ dứa và chanh.' } : { topic: 'menu', kind: 'drink', drinkType: 'any', keywords: [], alcohol: 'any' } } });
  assert.deepEqual(result.items.map(item => item.id), ['sandy']);
  assert.equal(result.preferences.drinkType, 'cocktail');
});

test('an explicit cocktail request starts a fresh category search instead of reusing prior juice cards', async () => {
  const result = await recommend({ input: input({ messages: [{ role: 'user', content: 'cocktail nào ngon nhất' }] }), ...catalog,
    previous: { intent: { ...intent, drinkType: 'juice', alcohol: 'any' }, selectedIds: ['orange', 'tropical'] },
    ai: { json: async (_system, data) => data.dishes ? { reply: 'Try SANDY BEACH.' } : { topic: 'restaurant', kind: 'food', scope: 'previous', referenceIds: ['orange'], keywords: ['juice'] } },
  });
  assert.deepEqual(result.items.map(item => item.id), ['sandy']);
});

test('an unqualified named-category request remains category-bound during intent-provider outages', async () => {
  const result = await recommend({ input: input({ context: 'home', messages: [{ role: 'user', content: 'cocktail nào ngon nhất' }] }), ...catalog,
    ai: { json: async () => { throw new Error('429'); } },
    restaurant: async () => { throw new Error('Must not route a simple cocktail request to restaurant knowledge'); },
  });
  assert.equal(result.mode, 'filters');
  assert.deepEqual(result.items.map(item => item.id), ['sandy']);
});

test('explicit category recognition avoids negatives, mixed requests, recipe questions and ambiguous stop words', () => {
  assert.deepEqual(explicitBeverageRequest('cocktail nào ngon nhất'), { type: 'cocktail', simple: true });
  assert.deepEqual(explicitBeverageRequest('Which cocktail is the best?'), { type: 'cocktail', simple: true });
  assert.equal(explicitBeverageRequest('SANDY BEACH có chứa nước ép không?'), null);
  assert.equal(explicitBeverageRequest('Không muốn cocktail, gợi ý nước ép').type, 'juice');
  assert.equal(explicitBeverageRequest('cocktail và nước ép'), null);
  assert.equal(explicitBeverageRequest('A question in the selected language'), null);
  assert.equal(explicitBeverageRequest('cocktail không đường').simple, false);
  assert.equal(explicitBeverageRequest('cocktail dưới 100k').simple, false);
});

test('cocktails without alcohol use the mocktail category instead of alcoholic cocktail cards', async () => {
  const result = await recommend({ input: input({ messages: [{ role: 'user', content: 'Gợi ý cocktail không cồn' }] }), ...catalog,
    ai: { json: async (_system, data) => data.dishes ? { reply: 'A LITTLE LOVE là lựa chọn không cồn.' } : { topic: 'menu', kind: 'drink', drinkType: 'cocktail', alcohol: 'any' } },
  });
  assert.deepEqual(result.items.map(item => item.id), ['rose']);
  assert.equal(result.preferences.drinkType, 'mocktail');
  assert.equal(result.preferences.alcohol, 'none');
});

test('best cocktail suggestions are limited to a lead choice and one alternative, without claiming popularity', async () => {
  const cocktails = [1, 2, 3, 4].map(n => item(`cocktail-${n}`, `COCKTAIL ${n}`, 'Pineapple and rum', 'cocktails', 100000 + n));
  const result = await recommend({ input: input({ messages: [{ role: 'user', content: 'cocktail nào ngon nhất' }] }), items: cocktails, categories,
    ai: { json: async (system, data) => {
      if (!data.dishes) return { topic: 'menu', kind: 'drink', popular: true };
      assert.equal(data.dishes.length, 2);
      assert.match(system, /Taste is subjective/);
      return { reply: 'Try the first option or the second for a different balance.' };
    } },
  });
  assert.equal(result.items.length, 2);
  assert.equal(result.preferences.popular, false);
});


test('a new category search does not inherit an old automatic price cap during provider outages', async () => {
  const previous = { intent: { ...intent, drinkType: 'juice', maxPrice: 100000 } };
  const result = await recommend({ input: input({ messages: [{ role: 'user', content: 'cocktail nào ngon nhất' }] }), ...catalog, previous,
    ai: { json: async () => { throw new Error('429'); } },
  });
  assert.deepEqual(result.items.map(item => item.id), ['sandy']);
  assert.equal(result.preferences.maxPrice, null);
  assert.equal(result.preferences.drinkType, 'cocktail');
});
