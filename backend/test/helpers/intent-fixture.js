// Older tests exercise auth, filtering, language and memory rather than language
// extraction. Upgrade their fixed intent fixtures to the current query contract.
// Explicit new-contract fixtures (including malformed ones) pass through unchanged.
export function withQueryContract(ai) {
  if (!ai) return ai;
  return { ...ai, json: async (...args) => {
    const result = await ai.json(...args);
    const data = args[1];
    if (data.dishes || data.knowledgeSections || result.queryMode !== undefined || result.searchTerms !== undefined) return result;
    const source = data.conversation.at(-1).content.slice(0, 240);
    const detail = result.scope === 'previous';
    const searchTerms = (result.keywords || []).map(value => ({ type: 'ingredient', value, source }));
    if (result.diet && result.diet !== 'any') searchTerms.push({ type: 'diet', value: result.diet, source });
    if (result.mild) searchTerms.push({ type: 'mild', value: 'true', source });
    for (const value of result.avoid || []) searchTerms.push({ type: 'avoid', value, source });
    if (detail) {
      const selected = data.previousMenu?.selectedItems || [];
      const referenced = result.referenceIds?.length ? selected.filter(item => result.referenceIds.includes(item.id)) : selected;
      for (const item of referenced) searchTerms.push({ type: 'dish_name', value: item.name, source });
    } else {
      if (result.kind === 'drink') searchTerms.push({ type: 'kind', value: 'drink', source });
      if (result.drinkType && result.drinkType !== 'any') searchTerms.push({ type: 'beverage_type', value: result.drinkType, source });
      if (result.alcohol && result.alcohol !== 'any') searchTerms.push({ type: 'alcohol', value: result.alcohol, source });
    }
    return { ...result, queryMode: detail ? 'detail' : 'new_search', searchTerms };
  } };
}
