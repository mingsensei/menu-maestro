import { normalize } from './menu-filters.js';

const key = value => normalize(value).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
const singular = value => value.replace(/\b([a-z]{3,})s\b/g, '$1');
// Canonical category translation is normally supplied by intent extraction.
const aliases = { 'mi y': 'pasta', 'italian pasta': 'pasta', 'italian noodles': 'pasta' };
export function menuSubject(value, categories = []) {
  const canonical = aliases[key(value)] || key(value);
  const term = singular(canonical);
  const categoryIds = categories.filter(category => [category.name, category.display_name].some(name => {
    const label = singular(key(name));
    return label === term || (` ${label} `).includes(` ${term} `);
  })).map(category => category.id);
  return { value: canonical, categoryIds };
}
export function matchesMenuSubject(item, subject, text) {
  if (subject.categoryIds.length) return subject.categoryIds.includes(item.category_id);
  return (text ?? normalize(`${item.name} ${item.description}`)).includes(normalize(subject.value));
}

// Multiple explicitly requested groups get coverage, in the guest's order.
// Single/broad requests retain the regular Special/relevance/price ordering.
export function selectMenuSubjects(candidates, subjects = [], limit = 4) {
  if (subjects.length < 2) return candidates.slice(0, limit);
  const assigned = new Set();
  const pools = subjects.map(subject => candidates.filter(item => {
    if (assigned.has(item.id) || !matchesMenuSubject(item, subject)) return false;
    assigned.add(item.id);
    return true;
  }));
  const selected = pools.map(() => []);
  let count = 0;
  for (let round = 0; count < limit; round++) {
    let added = false;
    for (let group = 0; group < pools.length && count < limit; group++) {
      if (!pools[group][round]) continue;
      selected[group].push(pools[group][round]); count++; added = true;
    }
    if (!added) break;
  }
  return selected.flat();
}
