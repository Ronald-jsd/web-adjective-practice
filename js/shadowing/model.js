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

function sentencesInText(text) {
    const clean = String(text || "").replace(/\s+/g, " ").trim()
    const pieces = clean.match(/[^.!?]+[.!?]["'”)]*|[^.!?]+$/g) || [clean]
    return pieces.map(piece => piece.trim()).filter(Boolean)
}

/* Cada pieza del proveedor puede contener varias frases. Repartimos su
 * duración entre las frases según cuántas palabras tiene cada una: así una
 * frase dentro de un bloque largo no hereda el final de todo el bloque. */
export function splitTranscriptSegments(segments) {
    const cleaned = (segments || [])
        .filter(segment => segment && String(segment.text || "").trim())
        .map(segment => ({
            start: Math.max(0, Number(segment.start || 0)),
            duration: Math.max(0.3, Number(segment.duration || 1)),
            text: String(segment.text).replace(/\s+/g, " ").trim()
        }))
    if (!cleaned.length) return []

    const pieces = []
    for (const segment of cleaned) {
        const parts = sentencesInText(segment.text)
        const weights = parts.map(part => Math.max(1, tokensizeSentence(part).length))
        const total = weights.reduce((sum, weight) => sum + weight, 0) || 1
        let cursor = segment.start
        parts.forEach((part, index) => {
            const duration = segment.duration * (weights[index] / total)
            pieces.push({ start: cursor, end: cursor + duration, text: part, wordCount: weights[index] })
            cursor += duration
        })
    }

    const merged = []
    for (const piece of pieces) {
        const previous = merged[merged.length - 1]
        if (previous && previous.wordCount < MIN_SEGMENT_SIZE) {
            previous.text = `${previous.text} ${piece.text}`.trim()
            previous.end = piece.end
            previous.wordCount += piece.wordCount
        } else {
            merged.push({ ...piece })
        }
    }
    if (merged.length > 1) {
        const last = merged[merged.length - 1]
        if (last.wordCount < MIN_SEGMENT_SIZE) {
            const previous = merged[merged.length - 2]
            previous.text = `${previous.text} ${last.text}`.trim()
            previous.end = last.end
            merged.pop()
        }
    }

    return merged.map(piece => ({
        start: Math.max(0, Number(piece.start.toFixed(2))),
        end: Math.max(piece.start + 0.5, Number(piece.end.toFixed(2))),
        text: piece.text
    }))
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
        return { ...segment, start, end }
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
