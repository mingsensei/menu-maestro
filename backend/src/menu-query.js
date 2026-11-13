import { z } from 'zod';
import { menuSubject } from './menu-subjects.js';
import { normalize, requestsAlcoholFree, isAlcoholOnlyFollowup, dietConflict, requestsAvoided } from './menu-filters.js';

export const queryModeSchema = z.enum(['new_search', 'refine', 'detail']);
export const searchTermTypes = ['ingredient', 'dish_type', 'dish_name', 'kind', 'beverage_type', 'alcohol', 'diet', 'mild', 'avoid', 'allergy', 'budget', 'preference', 'remove'];
export const searchTermSchema = z.object({
  type: z.enum(searchTermTypes),
  value: z.string().trim().min(1).max(100),
  source: z.string().trim().min(1).max(240),
  scope: z.enum(['request', 'session']).default('request'),
});
const kinds = new Set(['food', 'drink', 'dessert', 'any']);
const drinks = new Set(['any', 'juice', 'mocktail', 'cocktail', 'beer', 'wine', 'coffee', 'tea', 'soft_drink', 'spirit']);
const alcohols = new Set(['any', 'none', 'alcoholic']);
const fingerprint = text => normalize(text).normalize('NFC');
// Allergy wording in the 10 supported languages (normalized: accents stripped).
const allergyCue = /di ung|allerg|intoleran|аллерг|аллергия|аллергиям|알레르기|알러지|アレルギー|过敏|過敏|alergi/;

// Verify VND amounts from quoted numeric evidence, rather than trusting an inferred cap.
function quotedBudget(term) {
  const canonicalAmount = fingerprint(term.value).match(/^(\d+(?:[.,]\d+)*)\s*(?:vnd|dong|₫)?$/);
  const expected = canonicalAmount ? Number(/^\d{1,3}(?:[.,]\d{3})+$/.test(canonicalAmount[1]) ? canonicalAmount[1].replace(/[.,]/g, '') : canonicalAmount[1].replace(',', '.')) : NaN;
  if (!Number.isFinite(expected) || expected < 0 || expected > 100000000) return null;
  const quote = fingerprint(term.source);
  if (/[$€£]|usd|eur/.test(quote)) return null;
  for (const match of quote.matchAll(/(\d+(?:[.,]\d+)*)\s*(trieu|million|nghin|ngan|k\b|m\b|vnd|dong|₫)?/g)) {
    let number = match[1];
    const unit = match[2];
    if (/^\d{1,3}(?:[.,]\d{3})+$/.test(number)) number = number.replace(/[.,]/g, '');
    else number = number.replace(',', '.');
    const amount = Number(number) * (['k', 'nghin', 'ngan'].includes(unit) ? 1000 : ['m', 'trieu', 'million'].includes(unit) ? 1000000 : 1);
    if (amount === expected && (unit || amount >= 1000)) return amount;
  }
  return null;
}

// Ground partial names against the live catalog. "steak" is not automatically
// the previously shown "Steak Salad" just because the model expanded the name.
function groundTerm(term, catalog, previous, issues) {
  if (!catalog || !['ingredient', 'dish_type', 'dish_name'].includes(term.type)) return term;
  const quotedCategory = menuSubject(term.source, catalog.categories);
  if (quotedCategory.categoryIds.length && !catalog.items.some(item => fingerprint(item.name) === fingerprint(term.source))) return { ...term, type: 'dish_type', value: quotedCategory.value };
  if (menuSubject(term.value, catalog.categories).categoryIds.length && !catalog.items.some(item => fingerprint(item.name) === fingerprint(term.value))) return { ...term, type: 'dish_type' };
  const source = fingerprint(term.source);
  const value = fingerprint(term.value);
  const named = catalog.items.find(item => fingerprint(item.name) === value);
  if (named && source.includes(value)) return term;
  const name = named || (previous?.selectedItems || []).find(item => fingerprint(item.name).includes(value));
  if (!name) return term;
  const tokens = [...new Set(fingerprint(name.name).match(/[\p{L}\p{N}]+/gu) || [])];
  const sourceTokens = new Set(source.match(/[\p{L}\p{N}]+/gu) || []);
  const anchors = tokens.filter(token => token.length >= 3 && sourceTokens.has(token));
  if (anchors.length !== 1) return term;
  if (term.type === 'ingredient' && (previous?.intent?.keywords || []).some(word => fingerprint(word) === value)) return term;
  issues.push('partial_name_resolved_as_catalog_search');
  return { ...term, type: 'dish_type', value: anchors[0] };
}

// Compile model output into one canonical query. Subject, mandatory attributes and
// ingredient/name terms are different axes; preferences never become SQL-like predicates.
export function resolveMenuQuery({ intent, input, previous, queryMode, searchTerms, explicitBeverage, catalog }) {
  const latest = fingerprint(input.messages.at(-1).content);
  const history = [...input.messages.filter(message => message.role === 'user').map(message => message.content), ...(previous?.questions || [])].map(fingerprint);
  const issues = [];
  const structured = Array.isArray(searchTerms);
  const terms = (searchTerms || []).filter(term => {
    const source = fingerprint(term.source);
    const evidenced = history.some(message => message.includes(source));
    if (!evidenced) issues.push(term.type === 'preference' ? 'preference_without_evidence' : 'required_term_without_evidence');
    return evidenced;
  }).map(term => groundTerm(term, catalog, previous, issues));
  const current = terms.filter(term => latest.includes(fingerprint(term.source)));
  // Explicit "no longer needed" statements in the latest message release earlier constraints.
  const removals = new Set(current.filter(term => term.type === 'remove').map(term => fingerprint(term.value).trim()));
  const removed = (...values) => values.some(value => value && removals.has(fingerprint(value).trim()));
  const requestedValues = current.filter(term => ['ingredient', 'dish_type', 'dish_name'].includes(term.type)).map(term => term.value);
  const lastFact = (type, allowed) => current.filter(term => term.type === type && allowed.has(term.value)).at(-1)?.value;
  const currentKind = lastFact('kind', kinds);
  const currentDrink = lastFact('beverage_type', drinks) || explicitBeverage?.type;
  const currentAlcohol = lastFact('alcohol', alcohols);
  const currentDishType = current.some(term => term.type === 'dish_type');
  const hasCurrentDish = current.some(term => term.type === 'dish_name');
  const referencedDish = current.some(term => term.type === 'dish_name' && (previous?.selectedItems || []).some(item =>
    fingerprint(item.name) === fingerprint(term.value) || item.id === term.value));
  const alcoholOnly = isAlcoholOnlyFollowup(input.messages.at(-1).content);
  let mode = queryMode || (currentKind || currentDrink ? 'new_search' : intent.scope === 'previous' ? 'detail' : 'new_search');
  // A newly named broad subject expands the search; it is not a reference to last turn's cards.
  if (((currentKind || currentDrink) && !hasCurrentDish) || currentDishType) mode = 'new_search';
  if (alcoholOnly && previous?.intent?.kind === 'drink') mode = 'refine';
  if (structured && mode === 'detail' && !referencedDish) {
    mode = previous?.intent ? 'refine' : 'new_search';
    issues.push('ungrounded_detail_reference_removed');
  }

  let next = { ...intent, drinkType: intent.drinkType || 'any', alcohol: intent.alcohol || 'any' };
  if (currentKind) next.kind = currentKind;
  if (currentDrink) next.drinkType = currentDrink;
  else if (structured) next.drinkType = mode !== 'new_search' ? previous?.intent?.drinkType || 'any' : 'any';
  if (currentAlcohol) next.alcohol = currentAlcohol;
  else if (structured) next.alcohol = mode !== 'new_search' ? previous?.intent?.alcohol || 'any' : 'any';
  if (requestsAlcoholFree(input.messages.at(-1).content)) next.alcohol = 'none';
  if (structured) {
    const active = mode === 'new_search' ? current : terms;
    const ingredientTerms = active.filter(term => term.type === 'ingredient');
    const subjectTerms = active.filter(term => ['dish_type', 'dish_name'].includes(term.type));
    const position = term => latest.indexOf(fingerprint(term.value)) >= 0 ? latest.indexOf(fingerprint(term.value)) : latest.indexOf(fingerprint(term.source));
    subjectTerms.sort((a, b) => position(a) - position(b));
    next.keywords = [...new Set(ingredientTerms.map(term => term.value))];
    next.subjects = [...new Map(subjectTerms.map(term => {
      const subject = term.type === 'dish_name' ? { value: term.value, categoryIds: [] } : menuSubject(term.value, catalog?.categories);
      return [subject.value, subject];
    })).values()];
    if (terms.some(term => !['ingredient', 'dish_type', 'dish_name'].includes(term.type))) issues.push('non_search_terms_separated');
    if (mode === 'refine' && !currentKind && !currentDrink) {
      if (!ingredientTerms.length) next.keywords = previous?.intent?.keywords || [];
      if (!subjectTerms.length) next.subjects = previous?.intent?.subjects || [];
    }
    if (removals.size) {
      next.keywords = next.keywords.filter(word => !removed(word));
      next.subjects = next.subjects.filter(subject => !removed(subject.value));
    }
  } else if (explicitBeverage?.simple) {
    next.keywords = [];
    next.subjects = [];
    next.clarification = '';
    next.popular = false;
  }

  if (alcoholOnly && previous?.intent?.kind === 'drink') {
    const prior = previous.intent;
    const limit = Math.min(prior.maxPrice ?? Infinity, next.maxPrice ?? Infinity);
    next = { ...next, kind: 'drink', drinkType: prior.drinkType || 'any', keywords: prior.keywords || [], subjects: prior.subjects || [],
      diet: prior.diet || next.diet, maxPrice: Number.isFinite(limit) ? limit : null,
      mild: prior.mild || next.mild, avoid: [...new Set([...(prior.avoid || []), ...next.avoid])],
      popular: prior.popular || next.popular, alcohol: 'none' };
  } else if (next.kind === 'drink' && next.alcohol === 'any' && previous?.intent?.alcohol === 'none' && !currentAlcohol) {
    next.alcohol = 'none';
  }
  // Natural-language restrictions need evidence too. Request-scoped taste choices
  // do not accumulate across topics; explicitly stated session restrictions do.
  const saved = previous?.intent?.verifiedPreferences || {};
  const reusable = preference => preference && (preference.scope === 'session' || mode !== 'new_search');
  const dietTerm = current.filter(term => term.type === 'diet' && ['any', 'vegetarian', 'vegan', 'gluten_free', 'dairy_free'].includes(term.value)).at(-1);
  const mildTerm = current.filter(term => term.type === 'mild' && ['true', 'false'].includes(term.value)).at(-1);
  // Allergies are a separate, safety-critical axis from dislikes: they always persist
  // for the conversation and are never relaxed by a later request. An avoid term
  // stated with allergy wording is treated as an allergy even if the model mislabeled it.
  const modelLabelledAllergy = current.some(term => term.type === 'allergy');
  const isAllergy = term => term.type === 'allergy' || (term.type === 'avoid' && term.value !== 'none'
    && (allergyCue.test(fingerprint(term.source)) || (!modelLabelledAllergy && allergyCue.test(latest))));
  const allergyTerms = current.filter(isAllergy);
  const avoidTerms = current.filter(term => term.type === 'avoid' && !isAllergy(term));
  const allergies = [...new Map([...(saved.allergy || []), ...allergyTerms]
    .map(term => [fingerprint(term.value).trim(), { value: term.value, scope: 'session' }])).values()];
  const blocked = value => allergies.some(allergy => requestsAvoided(allergy.value, [value]));
  if (requestedValues.some(blocked) || next.keywords.some(blocked) || (next.subjects || []).some(subject => blocked(subject.value))) {
    issues.push('allergen_requested');
    next.keywords = next.keywords.filter(word => !blocked(word));
    next.subjects = (next.subjects || []).filter(subject => !blocked(subject.value));
  }
  let diet = dietTerm || (reusable(saved.diet) ? saved.diet : null);
  let mild = mildTerm || (reusable(saved.mild) ? saved.mild : null);
  // A carried-over restriction yields to the guest's newest explicit request:
  // "I'm vegetarian" earlier must not silently turn "beef please" into salads.
  if (!dietTerm && diet && (removed('diet', diet.value) || dietConflict(diet.value, requestedValues.join(' ')))) {
    diet = null;
    issues.push('carried_diet_released');
  }
  if (!mildTerm && mild && (removed('mild', 'spicy') || /\b(spicy|chili|chilli|cay)\b/.test(fingerprint(requestedValues.join(' '))))) {
    mild = null;
    issues.push('carried_mild_released');
  }
  const savedAvoid = (saved.avoid || []).filter(reusable).filter(term => {
    if (!removed(term.value) && !requestsAvoided(term.value, requestedValues)) return true;
    issues.push('carried_avoid_released');
    return false;
  });
  const avoiding = avoidTerms.some(term => term.value === 'none') ? [] : [...savedAvoid, ...avoidTerms];
  next.diet = input.action === 'vegetarian' ? 'vegetarian' : diet?.value || 'any';
  next.mild = input.action === 'mild' || mild?.value === 'true';
  next.avoid = [...new Set(avoiding.map(term => term.value))];
  next.allergy = allergies.map(term => term.value);
  next.verifiedPreferences = {
    allergy: allergies,
    diet: diet ? { value: diet.value, scope: diet.scope || 'request' } : null,
    mild: mild ? { value: mild.value, scope: mild.scope || 'request' } : null,
    avoid: avoiding.map(term => ({ value: term.value, scope: term.scope || 'request' })),
  };
  if (intent.diet !== 'any' && intent.diet !== undefined && next.diet === 'any') issues.push('unrequested_diet_removed');
  if (intent.mild && !next.mild) issues.push('unrequested_mild_removed');
  const budgetTerm = current.filter(term => term.type === 'budget').at(-1);
  const manualBudget = input.preferences.maxPrice;
  let spokenBudget = null;
  if (budgetTerm && intent.clarificationReason !== 'budget') {
    spokenBudget = quotedBudget(budgetTerm);
    if (spokenBudget === null && budgetTerm.value !== 'none') issues.push('unverified_budget_ignored');
  } else if (mode !== 'new_search' && previous?.intent?.budgetExplicit && previous.intent.budgetOrigin === 'spoken' && !budgetTerm && !removed('budget', 'price')) {
    spokenBudget = previous.intent.maxPrice;
  }
  const cap = Math.min(manualBudget ?? Infinity, spokenBudget ?? Infinity);
  next.maxPrice = Number.isFinite(cap) ? cap : null;
  next.budgetExplicit = next.maxPrice !== null;
  next.budgetOrigin = manualBudget !== null && (spokenBudget === null || manualBudget <= spokenBudget) ? 'manual' : spokenBudget !== null ? 'spoken' : null;
  if (intent.maxPrice !== null && intent.maxPrice !== undefined && next.maxPrice === null) issues.push('unrequested_budget_removed');
  const pricePreference = current.filter(term => term.type === 'preference' && ['price_low', 'price_high'].includes(term.value)).at(-1)?.value;
  next.priceOrder = pricePreference === 'price_low' ? 'asc' : pricePreference === 'price_high' ? 'desc' : mode !== 'new_search' && previous?.intent?.priceOrder ? previous.intent.priceOrder : 'desc';
  // These are domain invariants, independent of the wording of any particular question.
  if (next.drinkType !== 'any' || next.alcohol !== 'any') {
    if (next.kind === 'food') issues.push('beverage_constraint_on_food_subject');
    if (next.kind !== 'any' || currentKind === 'drink' || currentDrink || next.kind === 'food') next.kind = 'drink';
  }
  if (next.kind === 'drink' && next.drinkType === 'any' && next.keywords.some(word => ['juice', 'fruit juice', 'nuoc ep'].includes(fingerprint(word)))) {
    next.drinkType = 'juice';
    next.keywords = next.keywords.filter(word => !['juice', 'fruit juice', 'nuoc ep'].includes(fingerprint(word)));
  }
  if (next.drinkType === 'cocktail' && next.alcohol === 'none') next.drinkType = 'mocktail';
  if (next.drinkType === 'juice') { next.kind = 'drink'; next.alcohol = 'none'; }
  if (next.kind === 'drink' && next.topic === 'restaurant') next.topic = 'menu';
  if (structured) next.popular = input.action === 'popular' || (mode === 'new_search' ? current : terms).some(term => term.type === 'preference' && term.value === 'popular');
  // Only an actual detail query is restricted to previously displayed cards.
  const detail = mode === 'detail' && !currentKind && !currentDrink;
  next.scope = detail ? 'previous' : 'catalog';
  if (!detail) next.referenceIds = [];
  if (intent.scope === 'previous' && !detail) issues.push('stale_previous_scope_removed');
  next.keywords = [...new Set(next.keywords.map(word => word.trim()).filter(Boolean))];
  const subjectSource = currentDrink ? 'explicit' : mode === 'refine' && previous?.intent?.drinkType && previous.intent.drinkType !== 'any' ? 'inherited' : 'general';
  const valid = !issues.includes('required_term_without_evidence');
  return { intent: next, mode, valid, issues: [...new Set(issues)], structured, subjectSource };
}
