/* Búsqueda compartida por adjetivos y verbos: ignora tildes y mayúsculas.
 * "partial" busca desde el principio del campo: "go" → "go out", "gone".
 * "exact" exige que el campo completo sea la palabra buscada, ni más ni menos:
 * "go out" encuentra "go out", pero no "go outside" ni "go out with friends". */

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

function startsWithPhrase(normalizedText, parts) {
    // Anclado al inicio del campo: "go" encuentra "go out" y "gone", pero
    // "out" no encuentra "go out". Sin límite final para sugerir textos más
    // largos ("go out" → "go outside", "event" → "eventually").
    const phrase = parts.map(escapeRegExp).join("[^a-z0-9']+")
    const pattern = new RegExp(`^${phrase}`)
    return pattern.test(normalizedText)
}

function exactText(normalizedText, normalizedQuery) {
    return normalizedText.replace(/\s+/g, " ").trim() === normalizedQuery.replace(/\s+/g, " ").trim()
}

export function matchesSearchTerms(text, query, mode = "partial") {
    const normalizedQuery = normalizeSearchText(query)
    if (!normalizedQuery.trim()) return true
    if (mode === "exact") return exactText(normalizeSearchText(text), normalizedQuery)
    return startsWithPhrase(normalizeSearchText(text), searchTerms(query))
}
