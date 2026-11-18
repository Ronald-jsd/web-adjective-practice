/* Búsqueda compartida por adjetivos y verbos: ignora tildes y mayúsculas.
 * "Contiene" encuentra cualquiera de las palabras completas escritas;
 * "exacta" exige la frase completa consecutiva. En ambos casos se respetan
 * los límites de palabra: "at" no coincide dentro de "weather". */

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

function hasWholeMatch(normalizedText, parts) {
    const phrase = parts.map(escapeRegExp).join("[^a-z0-9]+")
    const pattern = new RegExp(`(^|[^a-z0-9])${phrase}(?=$|[^a-z0-9])`)
    return pattern.test(normalizedText)
}

export function matchesSearchTerms(text, query, mode = "partial") {
    const normalizedText = normalizeSearchText(text)
    const terms = searchTerms(query)
    if (!terms.length) return true

    if (mode === "exact") return hasWholeMatch(normalizedText, terms)
    return terms.some(term => hasWholeMatch(normalizedText, [term]))
}
