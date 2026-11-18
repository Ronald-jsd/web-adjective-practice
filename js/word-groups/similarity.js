const SPANISH_STOPWORDS = new Set([
    "a", "al", "como", "con", "de", "del", "desde", "el", "en", "entre", "hasta", "la", "las",
    "los", "o", "para", "por", "que", "sin", "sobre", "un", "una", "unas", "unos", "y", "e",
    "eso", "esto", "aquello", "aquella", "aquellas", "aquel", "esa", "esas", "ese", "esos"
])
const MAX_TRANSLATION_LENGTH = 1000

function stripDiacritics(value) {
    return String(value ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
}

function splitTranslations(value) {
    return stripDiacritics(value)
        .replace(/&/g, " y ")
        .replace(/[«»“”"()[\]{}]/g, " ")
        .split(/[\/;,|–—\u2013\u2014]+|\s+-\s+/)
        .map(part => part.trim())
        .filter(Boolean)
}

function tokensUntil(value, limit = 8) {
    const tokens = String(value || "").match(/[a-z0-9ñ]+/gi) || []
    return tokens
        .map(token => token.toLowerCase())
        .filter(token => !SPANISH_STOPWORDS.has(token))
        .slice(0, limit)
}

/* Spanish translations often contain lists of synonyms and stock fillers
 * (“además de eso”, “a fin de cuentas”, “por supuesto que sí”). Comparing
 * the content-token key is safer than comparing the full string. */
export function spanishTranslationKeys(value) {
    const source = String(value ?? "").slice(0, MAX_TRANSLATION_LENGTH)
    const keys = []
    for (const segment of splitTranslations(source)) {
        const tokens = tokensUntil(segment)
        if (!tokens.length) continue
        keys.push(tokens.join(" "))
    }
    return [...new Set(keys)]
}

export function spanishTranslationsMatch(left, right) {
    const leftKeys = spanishTranslationKeys(left)
    if (!leftKeys.length) return false
    const rightKeys = new Set(spanishTranslationKeys(right))
    return leftKeys.some(key => rightKeys.has(key))
}

export function sameTranslationWordCount(left, right) {
    const leftKeys = spanishTranslationKeys(left)
    const rightKeys = new Set(spanishTranslationKeys(right))
    return leftKeys.filter(key => rightKeys.has(key)).length
}

/* Dos filas del catálogo pueden tener la misma palabra con traducciones o
 * ejemplos distintos (por ejemplo dos "throughout"). No son duplicados: se
 * identifican por source+itemId y deben poder convivir en el mismo grupo. */
function isDistinctEntry(leftIdentity, rightIdentity) {
    return Boolean(leftIdentity && rightIdentity && leftIdentity !== rightIdentity)
}

const identityOf = item => {
    const itemId = item?.itemId ?? item?.item_id
    return itemId === undefined || itemId === null || itemId === ""
        ? null
        : `${item?.source || "catalog"}:${String(itemId)}`
}

/* Devuelve los candidatos con al menos una clave de traducción compartida y
 * sin repetir el término seleccionado desde otra colección. */
export function matchingTranslationCandidates(candidates, selected, { excludeSeedWord = true } = {}) {
    const selectedKeys = spanishTranslationKeys(selected?.spanish || "")
    if (!selectedKeys.length) return []

    const selectedWord = String(selected?.word || "").trim().toLowerCase()
    const selectedIdentity = identityOf(selected)
    const blockedIds = new Set()
    if (selectedIdentity) blockedIds.add(selectedIdentity)

    const matches = []
    for (const candidate of candidates || []) {
        if (!candidate?.word || !candidate?.spanish) continue
        const candidateIdentity = identityOf(candidate)
        const candidateWord = String(candidate.word).trim().toLowerCase()
        if (candidateIdentity && blockedIds.has(candidateIdentity)) continue
        if (excludeSeedWord && selectedWord && candidateWord === selectedWord
            && !isDistinctEntry(selectedIdentity, candidateIdentity)) continue

        if (!spanishTranslationsMatch(selected.spanish, candidate.spanish)) continue
        matches.push(candidate)
        if (matches.length >= 80) break
    }
    return matches
}

export function missingTranslationCandidates(candidates, selected, group) {
    const existingIdentities = new Set((group?.members || []).map(member => {
        if (member.itemId) return `${member.source || "catalog"}:${String(member.itemId)}`
        return `${member.source || "inline"}:word:${String(member.word || "").toLowerCase()}`
    }))
    const existingWords = new Set((group?.members || []).map(member => String(member.word || "").toLowerCase()))
    return matchingTranslationCandidates(candidates, selected).filter(candidate => {
        const candidateIdentity = identityOf(candidate)
        if (candidateIdentity && existingIdentities.has(candidateIdentity)) return false
        const candidateWord = String(candidate.word || "").toLowerCase()
        if (!existingWords.has(candidateWord)) return true
        // La misma palabra solo se descarta si no podemos probar que son filas
        // distintas; dos entradas con IDs propios deben aparecer juntas.
        const sameWordMember = (group?.members || []).find(member => String(member.word || "").toLowerCase() === candidateWord)
        return isDistinctEntry(identityOf(sameWordMember), candidateIdentity)
    })
}
