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

/* Segments returned by YouTube are cues, not sentences. We merge cues and
 * split at sentence-ending punctuation, keeping the best time available. */
export function splitTranscriptSegments(segments) {
    const cleaned = (segments || [])
        .filter(segment => segment && String(segment.text || "").trim())
        .map(segment => ({
            start: Math.max(0, Number(segment.start || 0)),
            duration: Math.max(0.3, Number(segment.duration || 1)),
            text: String(segment.text).replace(/\s+/g, " ").trim()
        }))
    const sentences = []
    const current = { text: "", start: null, duration: 0, wordCount: 0 }

    for (const segment of cleaned) {
        const segmentStart = segment.start
        const words = normalizedWords(segment.text)
        for (const word of words) {
            if (current.start === null) current.start = segmentStart
            current.text = [current.text, word].filter(Boolean).join(" ")
            current.duration = Math.max(current.duration, segmentStart + segment.duration - current.start)
            current.wordCount += 1
            const endsSentence = /[.!?]["'”)]?$/.test(current.text)
            const tooLarge = current.wordCount >= MAX_SEGMENT_SIZE
            if ((endsSentence && current.wordCount >= MIN_SEGMENT_SIZE) || tooLarge) {
                flushSentence(current, sentences, MIN_SEGMENT_SIZE)
                current.start = null
            }
        }
    }
    if (current.text) flushSentence(current, sentences, 1)

    if (!sentences.length && cleaned.length) {
        return cleaned.map(segment => ({ start: segment.start, end: segment.start + segment.duration, text: segment.text }))
    }
    for (const sentence of sentences) {
        if (!Number.isFinite(sentence.start)) sentence.start = 0
        if (!Number.isFinite(sentence.duration)) sentence.duration = 1
        sentence.end = sentence.start + Math.max(0.5, sentence.duration)
    }
    return sentences
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
