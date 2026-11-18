/* Búsqueda compartida por adjetivos y verbos: ignora tildes y mayúsculas.
 * Siempre se busca desde el principio del campo: "g" → palabras que empiezan
 * por g; "go" → "go out", "gone"; "go out" → "go out", "go outside".
 * No se busca en medio de la frase: "out" no encuentra "go out". */

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

/* `mode` se mantiene por compatibilidad con la interfaz; ambos modos buscan
 * ahora por prefijo de frase. */
export function matchesSearchTerms(text, query, mode = "partial") {
    const terms = searchTerms(query)
    if (!terms.length) return true
    return startsWithPhrase(normalizeSearchText(text), terms)
}
