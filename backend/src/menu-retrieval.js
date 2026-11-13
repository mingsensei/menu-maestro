import { matchesMenuSubject } from './menu-subjects.js';
import { createHash, randomUUID } from 'node:crypto';
import { filterItems, normalize, beverageProfile } from './menu-filters.js';

const unique = values => [...new Set(values)].sort();
function queryFor(intent, preferences) {
  return {
    diets: unique([intent.diet, preferences.diet].filter(diet => diet !== 'any')),
    maxPrice: Math.min(intent.maxPrice ?? Infinity, preferences.maxPrice ?? Infinity),
    mild: intent.mild || preferences.mild,
    avoid: unique([...intent.avoid, ...(intent.allergy || []), ...preferences.avoid].map(normalize)),
    subjects: (intent.subjects || []).map(subject => ({ value: normalize(subject.value), categoryIds: unique(subject.categoryIds) })).sort((a, b) => a.value.localeCompare(b.value)),
    keywords: unique(intent.keywords.map(normalize)), kind: intent.kind, includeKids: intent.includeKids,
    drinkType: intent.drinkType || 'any', alcohol: intent.alcohol || 'any',
  };
}
function narrows(next, prior) {
  return JSON.stringify(next.keywords) === JSON.stringify(prior.keywords)
    && JSON.stringify(next.subjects) === JSON.stringify(prior.subjects)
    && next.kind === prior.kind && next.includeKids === prior.includeKids
    && (prior.drinkType === 'any' || next.drinkType === prior.drinkType)
    && (prior.alcohol === 'any' || next.alcohol === prior.alcohol)
    && prior.diets.every(diet => next.diets.includes(diet))
    && next.maxPrice <= prior.maxPrice && (!prior.mild || next.mild)
    && prior.avoid.every(term => next.avoid.includes(term));
}

// Retrieval caches contain IDs only. Every response is hydrated from the current catalog.
export function createMenuRetriever({ maxQueries = 200 } = {}) {
  let version;
  let documents = new Map();
  let queries = new Map();
  return {
    retrieve({ items, categories, catalogVersion, intent, preferences, previous, forceCatalog = false }) {
      const nextVersion = catalogVersion || createHash('sha256').update(JSON.stringify([items, categories])).digest('hex');
      if (version !== nextVersion) {
        version = nextVersion;
        const names = new Map(categories.map(category => [category.id, normalize(`${category.name} ${category.display_name}`)]));
        documents = new Map(items.map(item => {
          const category = names.get(item.category_id) || '';
          return [item.id, {
            item, text: normalize(`${item.name} ${item.description} ${(item.badges || []).join(' ')} ${Object.entries(item).filter(([key]) => key.startsWith('description_')).map(([, value]) => value || '').join(' ')} ${category}`),
            beverage: beverageProfile(item, category),
            drink: /drink|cocktail|mocktail|beer|wine|coffee|spirit|beverage|juice|tea\b/.test(category),
            dessert: /dessert|sweet/.test(category), kids: /kids?|children/.test(category),
          }];
        }));
        queries = new Map();
      }
      const query = queryFor(intent, preferences);
      const key = JSON.stringify(query);
      let ids;
      let strategy = 'catalog';
      let inspected = 0;
      const references = intent.referenceIds || [];
      const search = previous?.exhaustive ? previous : previous?.search;
      if (!forceCatalog && intent.scope === 'previous' && previous?.selectedIds?.length
        && references.every(id => previous.selectedIds.includes(id))) {
        // An empty reference list means all dishes just shown (e.g. a comparison).
        ids = references.length ? references : previous.selectedIds;
        strategy = 'previous';
      } else if (!forceCatalog && queries.has(key)) {
        ids = queries.get(key);
        queries.delete(key); queries.set(key, ids);
        strategy = 'cache';
      } else if (!forceCatalog && search?.catalogVersion === version && narrows(query, search.query)) {
        ids = search.candidateIds;
        strategy = 'narrowed';
      }
      const rejected = { kids: 0, beverageType: 0, alcohol: 0, kind: 0, subjects: 0, keywords: 0, preferences: 0 };
      const reject = reason => { rejected[reason]++; return false; };
      if (strategy !== 'cache') {
        const pool = ids ? ids.map(id => documents.get(id)).filter(Boolean) : [...documents.values()];
        inspected = pool.length;
        ids = pool.filter(doc => {
          if (!query.includeKids && doc.kids) return reject('kids');
          if (query.drinkType !== 'any' && !doc.beverage.types.includes(query.drinkType)) return reject('beverageType');
          if (doc.drink && query.alcohol !== 'any' && doc.beverage.alcohol !== query.alcohol) return reject('alcohol');
          if (categories.length && query.kind !== 'any') {
            if (query.kind === 'drink' ? !doc.drink : query.kind === 'dessert' ? !doc.dessert : doc.drink || doc.dessert) return reject('kind');
          }
          if (strategy !== 'previous' && query.subjects.length && !query.subjects.some(subject => matchesMenuSubject(doc.item, subject, doc.text))) return reject('subjects');
          // A prior-item question is resolved by ID, so keywords need not repeat the dish name.
          if (strategy !== 'previous' && query.keywords.length && !query.keywords.every(word => doc.text.includes(word))) return reject('keywords');
          return filterItems(filterItems([doc.item], preferences), { ...intent, avoid: [...intent.avoid, ...(intent.allergy || [])] }).length > 0 || reject('preferences');
        }).map(doc => doc.item.id);
        if (strategy !== 'previous') {
          queries.set(key, ids);
          if (queries.size > maxQueries) queries.delete(queries.keys().next().value);
        }
      }
      return {
        items: ids.map(id => documents.get(id).item),
        retrieval: { strategy, inspected, matched: ids.length, rejected, verifiedCatalog: forceCatalog },
        state: {
          catalogVersion: version, query, candidateIds: ids, intent, exhaustive: strategy !== 'previous',
          // Keep the last full search across detail questions without nesting conversation states.
          ...(strategy === 'previous' && search ? { search: { catalogVersion: search.catalogVersion, query: search.query, candidateIds: search.candidateIds } } : {}),
        },
      };
    },
  };
}

const turnHash = messages => createHash('sha256').update(JSON.stringify(messages.map(({ role, content }) => ({ role, content: content.trim() })))).digest('hex');
const precedingTurn = messages => {
  const tail = messages.slice(0, -1);
  if (tail.at(-1)?.role !== 'assistant' || tail.at(-2)?.role !== 'user') return null;
  return turnHash(tail.slice(-2));
};

// Opaque IDs isolate tabs/guests; bounded TTL storage never persists chat history.
export function createConversationCache({ ttl = 30 * 60_000, maxEntries = 500, now = Date.now } = {}) {
  const entries = new Map();
  return {
    read(id, messages) {
      const entry = entries.get(id);
      if (!entry) return;
      if (entry.until <= now()) { entries.delete(id); return; }
      if (entry.turn !== precedingTurn(messages)) return;
      return entry.state;
    },
    save(id, input, answer, state) {
      const time = now();
      for (const [key, entry] of entries) if (entry.until <= time) entries.delete(key);
      const conversationId = id || randomUUID();
      entries.delete(conversationId);
      entries.set(conversationId, {
        until: time + ttl, state,
        turn: turnHash([
          input.messages.at(-1), { role: 'assistant', content: answer.reply.slice(0, 1000) },
        ]),
      });
      if (entries.size > maxEntries) entries.delete(entries.keys().next().value);
      return conversationId;
    },
  };
}
