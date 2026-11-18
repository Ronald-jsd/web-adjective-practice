/* Búsqueda compartida por adjetivos y verbos: ignora tildes y mayúsculas.
 * "Contiene" busca cualquier término que EMPIECE por lo escrito
 * ("eve" → "even", "eventually"; "at first" → at o first).
 * "Exacta" aplica lo mismo a la frase completa
 * ("event" → "eventually"; "at first" → "at first glance").
 * En ambos casos se respeta el inicio de palabra: "at" no coincide en
 * "Temperate" ni "event" en "uneventful". */

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
    return terms.some(term => hasWordMatch(normalizedText, [term], true))
}
