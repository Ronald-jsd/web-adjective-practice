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

/* La tabla general guarda varios ejemplos en una sola celda separados por "/".
 * Solo se separan cuando inglés y español tienen el mismo número de partes;
 * así un texto con barras legítimas no se rompe. */
export function splitCatalogExamples(en, es) {
    const english = String(en ?? "").trim()
    const spanish = String(es ?? "").trim()
    const enParts = english.split(/\s*\/\s*/).map(part => part.trim()).filter(Boolean)
    const esParts = spanish.split(/\s*\/\s*/).map(part => part.trim()).filter(Boolean)
    if (enParts.length <= 1 || enParts.length !== esParts.length) {
        return [{ en: english, es: spanish }]
    }
    return enParts.map((part, index) => ({ en: part, es: esParts[index] }))
}

/* Cada ejemplo en su propia línea, numerados cuando hay más de uno, para que
 * la traducción de cada ejemplo quede alineada en la celda vecina. */
export function renderExampleLines(en, es, lang, formatText) {
    const examples = splitCatalogExamples(en, es)
    if (!examples.length) return ""
    return examples.map((example, index) => {
        const number = examples.length > 1 ? `<span class="opacity-60 mr-1">${index + 1}.</span>` : ""
        return `<div class="flex items-start">${number}${formatText(example[lang], lang)}</div>`
    }).join("")
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
    const rawTerms = searchTerms(query)
    if (!rawTerms.length) return true

    // Una sola letra no es una palabra buscable: en "It's" el apóstrofo
    // dejaría la "s" como palabra suelta y ensuciaría búsquedas como "even s".
    const terms = rawTerms.filter(term => term.length >= 2)
    if (!terms.length) return false

    if (mode === "exact") return hasWordMatch(normalizedText, terms, true)

    // Un término único y suficientemente largo se trata como prefijo para
    // sugerir mientras se escribe. En cuanto hay varias palabras —o es una
    // palabra corta como "so" o "at"— se exige la palabra completa.
    const usePrefix = terms.length === 1 && terms[0].length >= 3
    return terms.some(term => hasWordMatch(normalizedText, [term], usePrefix))
}
