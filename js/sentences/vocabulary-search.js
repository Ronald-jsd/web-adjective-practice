export function normalizeSearchText(value) {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
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
