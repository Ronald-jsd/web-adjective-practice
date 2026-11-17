import { normalizeSearchText as normalize } from "../search-utils.js"

export function normalizeSearchText(value) {
    return normalize(value)
}

export function filterVocabulary(items, query) {
    const list = Array.isArray(items) ? items : []
    const normalizedQuery = normalizeSearchText(query).trim()
    if (!normalizedQuery) return list
    return list.filter(vocabulary => normalizeSearchText([
        vocabulary?.word,
        vocabulary?.pronunciation,
        vocabulary?.spanish,
        vocabulary?.example_en,
        vocabulary?.example_es,
        vocabulary?.notes
    ].join(" ")).includes(normalizedQuery))
}
