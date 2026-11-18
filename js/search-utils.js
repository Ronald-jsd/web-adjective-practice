/* Búsqueda compartida por adjetivos y verbos: ignora tildes y mayúsculas.
 * "Contiene": con una sola palabra larga busca por prefijo ("eve" → "even",
 * "eventually"); con varias palabras o palabras cortas exige la palabra
 * completa ("even so" → even o so, nunca "sofocante"; "at" no casa con
 * "Temperate").
 * "Exacta" aplica prefijo a la frase completa ("event" → "eventually"). */

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

function hasWordMatch(normalizedText, parts, prefixOnly = false) {
    const phrase = parts.map(escapeRegExp).join("[^a-z0-9]+")
    // El límite inicial evita coincidencias en mitad de palabra. En modo
    // exacto no cerramos el final para que "event" sugiera "eventually" y
    // "eventually" siga encontrando "eventually he".
    const trailingBoundary = prefixOnly ? "" : "(?=$|[^a-z0-9])"
    const pattern = new RegExp(`(^|[^a-z0-9])${phrase}${trailingBoundary}`)
    return pattern.test(normalizedText)
}

export function matchesSearchTerms(text, query, mode = "partial") {
    const normalizedText = normalizeSearchText(text)
    const terms = searchTerms(query)
    if (!terms.length) return true

    if (mode === "exact") return hasWordMatch(normalizedText, terms, true)

    // Un término único y suficientemente largo se trata como prefijo para
    // sugerir mientras se escribe. En cuanto hay varias palabras —o es una
    // palabra corta como "so" o "at"— se exige la palabra completa.
    const usePrefix = terms.length === 1 && terms[0].length >= 3
    return terms.some(term => hasWordMatch(normalizedText, [term], usePrefix))
}
