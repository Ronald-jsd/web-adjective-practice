const MAX_SEGMENT_SIZE = 36
const MIN_SEGMENT_SIZE = 3

export function extractYouTubeId(rawUrl) {
    const value = String(rawUrl || "").trim()
    try {
        const url = new URL(value, "https://www.youtube.com")
        const host = url.hostname.toLowerCase().replace(/^www\./, "")
        if (/(^|\.)youtube(-nocookie)?\.com$/.test(host)) {
            const id = url.searchParams.get("v") || (url.pathname.startsWith("/shorts/") ? url.pathname.split("/")[2] : null) || (url.pathname.startsWith("/embed/") ? url.pathname.split("/")[2] : null)
            if (id && /^[A-Za-z0-9_-]{11}$/.test(id)) return id
        }
        if (host === "youtu.be" || host.endsWith(".youtu.be")) {
            const id = url.pathname.split("/").filter(Boolean)[0]
            if (id && /^[A-Za-z0-9_-]{11}$/.test(id)) return id
        }
    } catch (error) {
        // También aceptamos el ID directamente.
    }
    return /^[A-Za-z0-9_-]{11}$/.test(value) ? value : ""
}

function normalizedWords(text) {
    return String(text || "").trim().match(/\S+/g) || []
}

/* Los tiempos por palabra pueden venir de los segs de json3 (medidos) o de
 * los bloques rolling ya repartidos por esta misma función (estimados). */
function normalizeProvidedWords(value) {
    if (!Array.isArray(value)) return []
    return value.map(word => ({
        text: String(word?.text || "").replace(/\s+/g, " ").trim(),
        from: Number(word?.from),
        to: Number(word?.to),
        measured: Boolean(word?.measured)
    })).filter(word => word.text && Number.isFinite(word.from) && Number.isFinite(word.to) && word.to > word.from)
}

/* Reajusta los tiempos de palabra cuando una frase se recorta o se fusiona. */
function fitWords(words, start, end) {
    const list = normalizeProvidedWords(words)
    if (!list.length) return []
    const first = Math.min(...list.map(word => word.from))
    const last = Math.max(...list.map(word => word.to))
    const scale = (end - start) / Math.max(0.2, last - first)
    let previous = start
    return list.map(word => {
        const from = Math.max(previous, Math.min(end, start + (word.from - first) * scale))
        const to = Math.max(from + 0.06, Math.min(end, start + (word.to - first) * scale))
        previous = to
        return { ...word, from, to }
    })
}

function flushSentence(sentence, sentences, minimumWords = 1) {
    const clean = sentence.text.replace(/\s+/g, " ").trim()
    const wordCount = normalizedWords(clean).length
    if (wordCount < minimumWords) return
    sentences.push({ ...sentence, text: clean })
    sentence.text = ""
    sentence.start = null
    sentence.duration = 0
    sentence.wordCount = 0
}

/* Los subtítulos de Supadata/YouTube son de tipo "rolling": dos líneas están
 * visibles a la vez y el `duration` de un bloque llega hasta el bloque DOS
 * posiciones después. Ese duration NO es el tiempo de habla: si se usa como tal,
 * cada frase se extiende sobre las dos siguientes y se oyen palabras ajenas.
 * El tiempo de habla de un bloque termina cuando empieza el bloque siguiente.
 * Repartimos ese intervalo entre sus palabras y agrupamos las palabras en
 * frases usando sus tiempos reales. */
export function splitTranscriptSegments(segments) {
    const cleaned = (segments || [])
        .filter(segment => segment && String(segment.text || "").trim())
        .map(segment => ({
            start: Math.max(0, Number(segment.start || 0)),
            duration: Math.max(0.3, Number(segment.duration || 1)),
            text: String(segment.text).replace(/\s+/g, " ").trim(),
            words: normalizeProvidedWords(segment.words)
        }))
        .sort((a, b) => a.start - b.start)
    if (!cleaned.length) return []

    const words = []
    cleaned.forEach((cue, index) => {
        const tokens = cue.text.split(/\s+/).filter(Boolean)
        if (!tokens.length) return
        const ownEnd = cue.start + cue.duration
        const next = cleaned[index + 1]
        // En SRT/texto plano el siguiente empieza DESPUÉS: ahí sí vale el
        // duration propio. Si se solapa, estamos ante subtítulos rolling.
        const cueEnd = next
            ? (next.start >= ownEnd - 0.05 ? ownEnd : Math.max(cue.start + 0.2, next.start))
            : ownEnd
        const span = Math.max(0.2, cueEnd - cue.start)
        const measured = cue.words.filter(word => word.from >= cue.start - 0.4 && word.from <= cueEnd + 0.4)
        if (measured.length) {
            measured.forEach(word => words.push({ ...word, to: Math.max(word.from + 0.06, Math.min(word.to, cueEnd + 0.25)) }))
            return
        }
        tokens.forEach((token, position) => {
            words.push({
                text: token,
                from: cue.start + span * (position / tokens.length),
                to: cue.start + span * ((position + 1) / tokens.length),
                measured: false
            })
        })
    })
    if (!words.length) return []

    const sentences = []
    let current = []
    const flush = () => {
        if (!current.length) return
        sentences.push({
            text: current.map(word => word.text).join(" ").replace(/\s+([,.!?;:])/g, "$1"),
            start: current[0].from,
            end: current[current.length - 1].to,
            wordCount: current.length,
            words: current.map(word => ({ ...word }))
        })
        current = []
    }
    const isSoftBreak = (text) => /[,;:\u2014\u2013]["'”)]*$/.test(text)
    words.forEach((word, index) => {
        current.push(word)
        const text = word.text
        const next = words[index + 1]
        const hardEnd = /[.!?]["'”)]*$/.test(text)
        const softEnd = !hardEnd && isSoftBreak(text) && current.length >= 8
        const tooLong = current.length >= MAX_SEGMENT_SIZE
        // Corta en puntuación fuerte, en pausa suave si ya hay suficientes palabras,
        // o por tamaño máximo cuando el subtítulo no trae puntuación.
        if (hardEnd || softEnd || (tooLong && !next)) {
            flush()
        } else if (tooLong) {
            // Busca un corte suave cercano hacia atrás; si no hay, corta aquí.
            let cut = -1
            for (let i = current.length - 2; i >= Math.floor(current.length * 0.5); i -= 1) {
                if (isSoftBreak(current[i].text)) { cut = i + 1; break }
            }
            if (cut > 0 && cut < current.length) {
                const tail = current.splice(cut)
                flush()
                current.push(...tail)
            } else {
                flush()
            }
        }
    })
    flush()

    const merged = []
    for (const sentence of sentences) {
        const previous = merged[merged.length - 1]
        if (previous && previous.wordCount < MIN_SEGMENT_SIZE) {
            previous.text = `${previous.text} ${sentence.text}`.trim()
            previous.end = sentence.end
            previous.words = [...(previous.words || []), ...(sentence.words || [])]
            previous.wordCount += sentence.wordCount
        } else {
            merged.push({ ...sentence })
        }
    }
    if (merged.length > 1) {
        const last = merged[merged.length - 1]
        if (last.wordCount < MIN_SEGMENT_SIZE) {
            const previous = merged[merged.length - 2]
            previous.text = `${previous.text} ${last.text}`.trim()
            previous.end = last.end
            previous.words = [...(previous.words || []), ...(last.words || [])]
            previous.wordCount += last.wordCount
            merged.pop()
        }
    }
    for (let index = 0; index < merged.length - 1; index += 1) {
        const next = merged[index + 1]
        if (next.start > merged[index].start) {
            merged[index].end = Math.min(merged[index].end, next.start)
        }
    }

    return merged.map(sentence => {
        const start = Math.max(0, Number(sentence.start.toFixed(2)))
        const end = Math.max(start + 0.5, Number(sentence.end.toFixed(2)))
        return {
            start,
            end,
            text: sentence.text,
            words: fitWords(sentence.words, start, end)
        }
    })
}

/* Ajusta el final de cada frase al comienzo de la siguiente. Con los
 * subtítulos existentes esto evita que el video siga hablando la frase
 * siguiente mientras la anterior todavía está marcada como activa. */
export function retimeSegments(segments) {
    const list = (segments || []).filter(Boolean).map(segment => ({ ...segment }))
    return list.map((segment, index) => {
        const start = Math.max(0, Number(segment.start || 0))
        const ownEnd = Number(segment.end || 0)
        const duration = Math.max(0.5, Number(segment.duration || ownEnd - start || 2))
        let end = Math.max(start + 0.5, ownEnd, start + duration)
        const next = list[index + 1]
        // Solo acortamos si la siguiente empieza DESPUÉS: si los tiempos se
        // solapan, conservamos la duración propia para no cortar la frase.
        if (next && Number(next.start || 0) > end) end = Number(next.start) - 0.02
        return { ...segment, start, end, words: fitWords(segment.words, start, Math.max(start + 0.5, end)) }
    })
}

export function looksLikeYouTubeUrl(value) {
    const text = String(value || "").trim()
    return /^https?:\/\/\S+$/i.test(text) || /^www\.(?:youtube\.com|youtu\.be\/|m\.youtube\.com)\S*$/i.test(text)
}

const SRT_LINE = /^\d{1,2}:\d{2}:\d{2}[.,]\d{3}\s*-->\s*\d{1,2}:\d{2}:\d{2}[.,]\d{3}/

export function parseManualTranscript(raw) {
    const value = String(raw || "").replace(/^\uFEFF/, "").trim()
    if (!value) return []

    if (SRT_LINE.test(value) || /WEBVTT/i.test(value.split("\n")[0])) {
        const lines = value.split(/\r?\n/).map(line => line.trim())
        const rawSegments = []
        for (let index = 0; index < lines.length; index += 1) {
            const match = lines[index].match(/(\d{1,2}):(\d{2}):(\d{2})[.,](\d{3}).*?(\d{1,2}):(\d{2}):(\d{2})[.,](\d{3})/)
            if (!match) continue
            const start = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000
            const end = Number(match[5]) * 3600 + Number(match[6]) * 60 + Number(match[7]) + Number(match[8]) / 1000
            const content = []
            for (let cursor = index + 1; cursor < lines.length && lines[cursor]; cursor += 1) content.push(lines[cursor])
            rawSegments.push({ start, duration: Math.max(0.5, end - start), text: content.join(" ") })
        }
        return splitTranscriptSegments(rawSegments)
    }

    const plainLines = value.split(/\n+/).map(line => line.trim()).filter(Boolean)
    const sentences = []
    let start = 0
    for (const line of plainLines) {
        const words = normalizedWords(line).length
        const duration = Math.max(2, words * 0.45)
        sentences.push({ start, end: start + duration, duration, text: line })
        start += duration
    }
    return splitTranscriptSegments(sentences)
}

export function tokensizeSentence(text) {
    return String(text || "").match(/[A-Za-z]+(?:['’-][A-Za-z]+)*|\d+/g) || []
}

export function normalizeWord(word) {
    return String(word || "").toLowerCase().replace(/[^a-z0-9'-]/g, "")
}

export function suggestionWords(sentence) {
    return [...new Set(tokensizeSentence(sentence).map(normalizeWord).filter(Boolean))].slice(0, 60)
}

/* Los subtítulos traen el tiempo de la frase completa, no de cada palabra.
 * Esta función reparte ese tiempo entre las palabras y devuelve cuál se está
 * oyendo en un segundo concreto. `spans` es [{from, to}] en fracción 0..1. */
export function activeWordIndex(spans, seconds, segment) {
    if (!Array.isArray(spans) || !spans.length) return -1
    const start = Number(segment?.start || 0)
    const end = Number(segment?.end || start + Math.max(0.5, Number(segment?.duration || 1)))
    const fraction = (seconds - start) / Math.max(0.3, end - start)
    if (!(fraction >= 0 && fraction <= 1)) return -1
    const index = spans.findIndex(span => fraction >= span.from && fraction < span.to)
    if (index < 0 && fraction >= 1) return spans.length - 1
    return index
}
