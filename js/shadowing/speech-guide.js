/* Guía de estrés y pausas para la frase central de Shadowing.
 *
 * Todo se calcula en el dispositivo, sin IA y sin créditos:
 *  - Si la transcripción trae tiempos por palabra (json3 de YouTube), se usan.
 *  - Si solo hay bloques de proveedor, se usan los tiempos que ya calcula
 *    splitTranscriptSegments() al repartir cada bloque rolling entre palabras.
 *  - El estrés es una aproximación: duración relativa + tipo de palabra.
 *  - La dirección final (↗/↘) se estima por puntuación, nunca se presenta como
 *    medida de la voz. Por eso la interfaz distingue "medido" de "estimado".
 */

export const GUIDE_TOKEN_REGEX = /[A-Za-z]+(?:['’-][A-Za-z]+)*|\S+/g

export function guideTokens(text) {
    return String(text || "").match(GUIDE_TOKEN_REGEX) || []
}

const POS_LABELS = {
    noun: "sustantivo",
    verb: "verbo",
    adjective: "adjetivo",
    adverb: "adverbio",
    preposition: "preposición",
    conjunction: "conjunción",
    pronoun: "pronombre",
    determiner: "determinante",
    auxiliary: "verbo auxiliar",
    number: "número",
    other: "palabra"
}

const CLOSED_WORDS = [
    ["auxiliary", "am is are was were be been being do does did done have has had having can could may might must shall should will would ought"],
    ["determiner", "a an the this that these those my your his her its our their some any no every each either neither which whose"],
    ["pronoun", "i you he she it we they me him us them who whom what someone somebody something anyone anybody anything everyone everybody everything nobody nothing myself yourself himself herself itself ourselves yourselves themselves"],
    ["preposition", "in on at by for with to from of about into onto over under above below between among through during before after near against across behind around via per like as than until since despite inside outside without within toward towards"],
    ["conjunction", "and but or nor yet so because although though while if unless whether plus when where why how"],
    ["adverb", "very really quite just also too still already yet not often always never sometimes usually rarely again here there now then today tomorrow yesterday quickly slowly carefully probably maybe perhaps almost nearly only even finally actually basically clearly simply well fast hard together away out up down off"]
]

const CLOSED_INDEX = new Map()
for (const [tag, words] of CLOSED_WORDS) {
    for (const word of words.split(" ")) CLOSED_INDEX.set(word, tag)
}

const CONTENT_TAGS = new Set(["noun", "verb", "adjective", "adverb", "number"])
const FUNCTION_TAGS = new Set(["determiner", "pronoun", "preposition", "conjunction", "auxiliary"])

const COMMON_NOUNS = new Set("app code job guy kid dog cat car bus cup day way man woman men women child children friend time year people thing stuff water food phone email website video team company city story baby name work festival night march app spring".split(" "))
const COMMON_VERBS = new Set("wants want need needs like likes work works say says make makes get gets give gives go goes come comes know knows think thinks see sees take takes tell tells find finds feel feels welcome sponsor".split(" "))
const COMMON_ADJECTIVES = new Set("clean clear null full free hard open high low long short new old young good bad great small big".split(" "))
const Y_ADJECTIVES = new Set("happy busy easy dirty lucky silly greedy tidy messy sleepy noisy ugly funny tiny ready heavy healthy wealthy lively friendly lonely lovely pretty sorry hungry angry thirsty".split(" "))

function suffixTag(word) {
    if (word.length < 4) return "other"
    if (/(?:ly)$/.test(word)) return "adverb"
    if (/(?:tion|sion|ment|ness|ity|ance|ence|ship|hood|ism|ist|age)$/.test(word)) return "noun"
    if (/(?:able|ible|ful|ive|ous|ical|ish|less|ary|ial)$/.test(word)) return "adjective"
    if (/(?:ize|ise|ify|ate)$/.test(word)) return "verb"
    if (/(?:ing|ed)$/.test(word)) return "verb"
    if (/(?:or|er|est)$/.test(word)) return word.length <= 6 ? "adjective" : "noun"
    if (/(?:ic|al)$/.test(word)) return "adjective"
    if (/y$/.test(word)) return Y_ADJECTIVES.has(word) ? "adjective" : "noun"
    if (/s$/.test(word) && !/(?:ss|us|is|ys)$/.test(word)) return "verb"
    return "other"
}

export function partOfSpeech(token) {
    const word = String(token || "").toLowerCase().replace(/[^a-z0-9'-]/g, "")
    if (!word) return { tag: "other", label: POS_LABELS.other }
    if (/^\d+$/.test(word)) return { tag: "number", label: POS_LABELS.number }
    const tag = CLOSED_INDEX.get(word)
        || (COMMON_NOUNS.has(word) ? "noun" : "")
        || (COMMON_VERBS.has(word) ? "verb" : "")
        || (COMMON_ADJECTIVES.has(word) ? "adjective" : "")
        || suffixTag(word)
    return { tag, label: POS_LABELS[tag] || POS_LABELS.other }
}

function normalizeWordText(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9'-]/g, "")
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value))
}

/* Alinea las palabras con tiempos reales. Cuando el proveedor dio menos
 * tiempos que palabras (o ninguno), rellena los huecos repartiendo el rango
 * disponible por el largo de cada palabra, igual que hacía la interfaz. */
function alignTimings(tokens, provided, segment) {
    const start = Number(segment?.start || 0)
    const end = Math.max(start + 0.5, Number(segment?.end || start + 2))
    const usable = provided
        .map(word => ({
            text: word.text,
            from: Number(word.from || 0),
            to: Number(word.to || 0),
            measured: Boolean(word.measured)
        }))
        .filter(word => word.text && Number.isFinite(word.from) && Number.isFinite(word.to) && word.to > word.from)
        .sort((left, right) => left.from - right.from)

    const wordIndexes = []
    tokens.forEach((token, index) => {
        if (/^[A-Za-z]+(?:['’-][A-Za-z]+)*$/.test(token) || /^\d+$/.test(token)) wordIndexes.push(index)
    })
    if (!wordIndexes.length) return []

    const weights = wordIndexes.map(index => Math.max(2, String(tokens[index]).replace(/[^A-Za-z0-9]/g, "").length))
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0) || 1
    const assigned = new Array(wordIndexes.length).fill(null)
    let pointer = 0
    wordIndexes.forEach((tokenIndex, position) => {
        const wanted = normalizeWordText(tokens[tokenIndex])
        let found = -1
        for (let cursor = pointer; cursor < usable.length; cursor += 1) {
            if (normalizeWordText(usable[cursor].text) === wanted) {
                found = cursor
                break
            }
        }
        if (found < 0 && usable.length === wordIndexes.length && position < usable.length) found = position
        if (found >= 0) {
            assigned[position] = { ...usable[found] }
            pointer = found + 1
        }
    })

    const fallbackWord = position => {
        const from = start + ((end - start) * weights.slice(0, position).reduce((sum, weight) => sum + weight, 0)) / totalWeight
        const to = start + ((end - start) * weights.slice(0, position + 1).reduce((sum, weight) => sum + weight, 0)) / totalWeight
        return { from, to, measured: false }
    }
    // Un hueco entre dos tiempos medidos se reparte solo dentro de ese hueco.
    for (let position = 0; position < assigned.length; position += 1) {
        if (assigned[position]) continue
        let left = position - 1
        while (left >= 0 && !assigned[left]) left -= 1
        let right = position + 1
        while (right < assigned.length && !assigned[right]) right += 1
        const leftTo = left >= 0 ? assigned[left].to : start
        const rightFrom = right < assigned.length ? assigned[right].from : end
        if (rightFrom > leftTo + 0.05 && (left >= 0 || right < assigned.length)) {
            const sliceWeights = weights.slice(left + 1, right).reduce((sum, weight) => sum + weight, 0) || 1
            let cursor = leftTo
            for (let index = left + 1; index < right; index += 1) {
                const next = cursor + ((rightFrom - leftTo) * weights[index]) / sliceWeights
                assigned[index] = { from: cursor, to: next, measured: false }
                cursor = next
            }
        } else {
            for (let index = position; index < assigned.length && !assigned[index]; index += 1) {
                assigned[index] = { ...fallbackWord(index), measured: false }
            }
        }
    }

    return wordIndexes.map((tokenIndex, position) => ({
        tokenIndex,
        from: clamp(assigned[position].from, start, end),
        to: clamp(Math.max(assigned[position].from + 0.06, assigned[position].to), start, end),
        measured: assigned[position].measured
    }))
}

function median(values) {
    if (!values.length) return 0.4
    const sorted = [...values].sort((left, right) => left - right)
    const middle = Math.floor(sorted.length / 2)
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function contourFor(tokens) {
    const significant = tokens.map(token => String(token).trim()).filter(Boolean)
    const last = significant[significant.length - 1] || ""
    if (last.includes("?")) return "↗"
    if (/[.!]["'”)]*$/.test(last)) return "↘"
    if (/[,;:—-]["'”)]*$/.test(last)) return ""
    return "↘"
}

/* Construye la guía completa de una frase ya dividida por
 * splitTranscriptSegments(). Nunca llama a la red. */
export function buildSpeechGuide(segment, nextSegment = null) {
    const tokens = guideTokens(segment?.text)
    const segmentStart = Number(segment?.start || 0)
    const segmentEnd = Math.max(segmentStart + 0.5, Number(segment?.end || segmentStart + 2))
    const timed = alignTimings(tokens, Array.isArray(segment?.words) ? segment.words : [], segment)
    const byTokenIndex = new Map(timed.map(item => [item.tokenIndex, item]))
    const wordItems = timed.map((item, position) => {
        const duration = Math.max(1, (item.to - item.from) * 1000)
        const previous = position > 0 ? timed[position - 1] : null
        const gapBeforeMs = Math.max(0, (item.from - (previous ? previous.to : Number(segment?.start || 0))) * 1000)
        return {
            ...item,
            position,
            durationMs: Math.round(duration),
            gapBeforeMs: Math.round(gapBeforeMs),
            ...partOfSpeech(tokens[item.tokenIndex])
        }
    })

    const typical = median(wordItems.map(item => item.durationMs)) || 400
    let primaryIndex = -1
    let bestScore = -Infinity
    wordItems.forEach((item, index) => {
        const score = clamp(item.durationMs / typical, 0, 3) + (CONTENT_TAGS.has(item.tag) ? 0.45 : FUNCTION_TAGS.has(item.tag) ? -0.4 : 0)
        item.score = score
        if (CONTENT_TAGS.has(item.tag) && score > bestScore) {
            bestScore = score
            primaryIndex = index
        }
    })
    if (primaryIndex < 0) {
        wordItems.forEach((item, index) => {
            if (item.score > bestScore) {
                bestScore = item.score
                primaryIndex = index
            }
        })
    }
    if (primaryIndex >= 0) wordItems[primaryIndex].stress = "primary"
    wordItems.forEach((item, index) => {
        if (index === primaryIndex) return
        if (item.score >= Math.max(1.1, bestScore * 0.72)) item.stress = "secondary"
        else if (FUNCTION_TAGS.has(item.tag) && (item.durationMs < typical * 0.75 || item.score < 0.7)) item.stress = "faded"
        else item.stress = "normal"
    })

    const contour = contourFor(tokens)
    const lastWordIndex = wordItems.length ? wordItems[wordItems.length - 1].tokenIndex : -1
    const contourOnWord = contour && lastWordIndex === tokens.length - 1 ? lastWordIndex : -1
    const pauseAfterMsByIndex = new Map()
    const lastTokenIndex = tokens.length - 1
    if (nextSegment && Number.isFinite(Number(nextSegment.start))) {
        pauseAfterMsByIndex.set(lastTokenIndex, Math.max(0, Math.round((Number(nextSegment.start) - segmentEnd) * 1000)))
    }
    const punctuationPauses = new Set()
    tokens.forEach((token, index) => {
        if (/^[,;:]$/.test(String(token).trim()) && !pauseAfterMsByIndex.has(index)) {
            pauseAfterMsByIndex.set(index, 350)
            punctuationPauses.add(index)
        }
    })
    const pauseMark = ms => (ms || 0) >= 600 ? "||" : (ms || 0) >= 300 ? "|" : ""
    const measuredPauses = wordItems.some(item => item.gapBeforeMs >= 300) || (pauseAfterMsByIndex.get(lastTokenIndex) || 0) >= 300
    const items = tokens.map((token, index) => {
        const pauseAfterMs = pauseAfterMsByIndex.get(index) || 0
        const word = byTokenIndex.get(index)
        if (!word) return {
            token,
            index,
            isWord: false,
            contour: contour && index > lastWordIndex ? contour : "",
            pauseAfter: pauseMark(pauseAfterMs),
            pauseAfterMs,
            pauseAfterSource: punctuationPauses.has(index) ? "punctuation" : "timing"
        }
        const item = wordItems.find(entry => entry.tokenIndex === index)
        const pauseBeforeMs = item.gapBeforeMs
        return {
            token,
            index,
            isWord: true,
            pos: item.tag,
            posLabel: item.label,
            durationMs: item.durationMs,
            gapBeforeMs: pauseBeforeMs,
            pauseBefore: pauseMark(pauseBeforeMs),
            pauseAfter: pauseMark(pauseAfterMs),
            pauseAfterMs,
            pauseAfterSource: "timing",
            stress: item.stress,
            contour: index === contourOnWord ? contour : ""
        }
    })

    const spans = wordItems.map(item => ({
        from: clamp((item.from - segmentStart) / (segmentEnd - segmentStart), 0, 1),
        to: clamp((Math.max(item.to, item.from + 0.06) - segmentStart) / (segmentEnd - segmentStart), 0, 1)
    })).map((span, index, all) => ({
        from: index > 0 ? Math.max(span.from, all[index - 1].to) : span.from,
        to: Math.max(span.to, index > 0 ? all[index - 1].to : 0)
    }))

    return {
        source: wordItems.some(item => item.measured) ? "measured" : "estimated",
        contour,
        contourSource: "punctuation",
        pauseSource: measuredPauses ? "timing" : "punctuation",
        items,
        spans
    }
}

/* Explicación en lenguaje claro para la ventana flotante. Cada regla usa una
 * palabra real de la frase actual, para que no haya que imaginar el ejemplo. */
export function explainGuide(guide) {
    const sample = stress => guide?.items?.find(item => item.isWord && item.stress === stress)?.token || ""
    const pause = guide?.items?.find(item => item.pauseBefore || item.pauseAfter)
    const pauseMark = pause ? (pause.pauseBefore || pause.pauseAfter) : "|"
    const pauseIsLong = pauseMark === "||"
    const contour = guide?.contour || "↘"
    return [
        {
            key: "primary",
            label: "Golpe principal",
            sample: sample("primary") || "palabra",
            description: "La palabra más fuerte de la frase. Dila un poco más alto y un poco más larga."
        },
        {
            key: "secondary",
            label: "Acento secundario",
            sample: sample("secondary") || "palabra",
            description: "También se destaca, pero menos que el golpe principal."
        },
        {
            key: "faded",
            label: "Palabra ligera",
            sample: sample("faded") || "to",
            description: "Dila rápido y pegada a la siguiente, casi sin hacer pausa."
        },
        {
            key: "pause",
            label: pauseIsLong ? "Pausa larga" : "Pausa breve",
            sample: pauseMark,
            description: pauseIsLong
                ? "Para un momento y respira: el hablante se detiene medio segundo o más."
                : "Haz una pausa corta antes de seguir, sin cambiar el ritmo de la frase."
        },
        {
            key: "contour",
            label: "Tono al terminar",
            sample: contour,
            description: contour === "↗"
                ? "La voz sube al final, como cuando hacemos una pregunta."
                : "La voz baja al final, como en una afirmación."
        },
        {
            key: "hover",
            label: "Si tienes duda",
            sample: "ℹ",
            description: "Pasa el cursor sobre cualquier palabra: verás su tipo y su duración exacta en milisegundos."
        }
    ]
}
