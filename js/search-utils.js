/* Búsqueda compartida por adjetivos y verbos: ignora tildes y mayúsculas y
 * encuentra cualquiera de las palabras escritas, no solo la frase completa. */

export function normalizeSearchText(value) {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
}

export function searchTerms(query) {
    return normalizeSearchText(query).trim().split(/\s+/).filter(Boolean)
}

export function matchesSearchTerms(text, query, mode = "partial") {
    const normalizedText = normalizeSearchText(text)
    const terms = searchTerms(query)
    if (!terms.length) return true

    if (mode === "exact") {
        const words = normalizedText.split(/\s+/)
        return terms.some(term => words.includes(term))
    }
    return terms.some(term => normalizedText.includes(term))
}
