/* Búsqueda compartida por adjetivos y verbos: ignora tildes y mayúsculas.
 * "Contiene" encuentra cualquiera de las palabras escritas; "exacta" exige
 * la frase completa consecutiva (palabra suelta o frase de varias palabras). */

export function normalizeSearchText(value) {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
}

export function searchTerms(query) {
    return normalizeSearchText(query).trim().split(/\s+/).filter(Boolean)
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export function matchesSearchTerms(text, query, mode = "partial") {
    const normalizedText = normalizeSearchText(text)
    const terms = searchTerms(query)
    if (!terms.length) return true

    if (mode === "exact") {
        const phrase = terms.map(escapeRegExp).join("[^a-z0-9]+")
        const pattern = new RegExp(`(^|[^a-z0-9])${phrase}(?=$|[^a-z0-9])`)
        return pattern.test(normalizedText)
    }
    return terms.some(term => normalizedText.includes(term))
}
