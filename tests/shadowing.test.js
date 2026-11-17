import test from "node:test"
import assert from "node:assert/strict"
import { extractYouTubeId, parseManualTranscript, suggestionWords, looksLikeYouTubeUrl, activeWordIndex, splitTranscriptSegments, retimeSegments } from "../js/shadowing/model.js"
import {
    TRANSCRIPT_KEY_STORAGE,
    TRANSCRIPT_PROVIDER_STORAGE,
    clearTranscriptCredentials,
    getTranscriptKey,
    getTranscriptProvider,
    normalizeProviderSegments,
    setTranscriptCredentials,
    transcriptConfig
} from "../js/shadowing/transcript.js"
import { normalizeTranscriptRow } from "../js/shadowing/transcript-store.js"
import { normalizeAiCacheRow } from "../js/shadowing/ai-cache.js"
import { buildSpeechGuide, explainGuide, partOfSpeech } from "../js/shadowing/speech-guide.js"

test("extractYouTubeId accepts watch, short, shorts and embed URLs", () => {
    assert.equal(extractYouTubeId("https://www.youtube.com/watch?v=Q5vAL799_BM"), "Q5vAL799_BM")
    assert.equal(extractYouTubeId("https://youtu.be/Q5vAL799_BM?si=example"), "Q5vAL799_BM")
    assert.equal(extractYouTubeId("https://www.youtube.com/shorts/Q5vAL799_BM"), "Q5vAL799_BM")
    assert.equal(extractYouTubeId("https://www.youtube.com/embed/Q5vAL799_BM"), "Q5vAL799_BM")
    assert.equal(extractYouTubeId("Q5vAL799_BM"), "Q5vAL799_BM")
    assert.equal(extractYouTubeId("https://example.com/video"), "")
})

test("looksLikeYouTubeUrl distinguishes links from transcript text", () => {
    assert.equal(looksLikeYouTubeUrl("https://www.youtube.com/watch?v=Q5vAL799_BM"), true)
    assert.equal(looksLikeYouTubeUrl("youtu.be/Q5vAL799_BM"), false)
    assert.equal(looksLikeYouTubeUrl("Welcome back to the channel."), false)
    assert.equal(looksLikeYouTubeUrl(""), false)
})

test("manual transcripts split text into timed practice lines", () => {
    const segments = parseManualTranscript("Welcome. This is a test.\nWe are learning English.")
    assert.ok(segments.length >= 2)
    assert.equal(segments[0].text, "Welcome. This is a test.")
    assert.ok(Number.isFinite(segments[0].start))
    assert.ok(Number.isFinite(segments[0].end))
    assert.ok(segments[0].end > segments[0].start)
})

test("suggestionWords deduplicates and returns unique lookup words", () => {
    assert.deepEqual(suggestionWords("This is this simple sentence is this this again."), ["this", "is", "simple", "sentence", "again"])
})

test("Supadata segments convert millisecond offsets into timed sentences", () => {
    const segments = normalizeProviderSegments("supadata", {
        content: [
            { text: "Hello there friend.", offset: 0, duration: 2000, lang: "en" },
            { text: "This is a test.", offset: 2000, duration: 2500, lang: "en" }
        ],
        lang: "en"
    })
    assert.equal(segments.length, 2)
    assert.equal(segments[0].text, "Hello there friend.")
    assert.equal(segments[0].start, 0)
    assert.equal(segments[0].end, 2)
    assert.equal(segments[1].text, "This is a test.")
    assert.equal(segments[1].start, 2)
    assert.ok(segments[1].end > segments[1].start)
})

test("TranscriptFetch segments keep their second-based timing", () => {
    const segments = normalizeProviderSegments("transcriptfetch", {
        segments: [{ start: 1.2, duration: 2.16, text: "All right, so here we are, in front of the elephants" }]
    })
    assert.equal(segments.length, 1)
    assert.equal(segments[0].start, 1.2)
    assert.ok(segments[0].text.startsWith("All right"))
})

test("plain provider text becomes timed practice lines", () => {
    const segments = normalizeProviderSegments("supadata", { content: "Hola mundo." })
    assert.equal(segments.length, 1)
    assert.equal(segments[0].text, "Hola mundo.")
    assert.equal(segments[0].start, 0)
    assert.ok(segments[0].end > 0)
    assert.deepEqual(normalizeProviderSegments("supadata", { content: [] }), [])
})

test("transcript credentials stay on the device and can be cleared", () => {
    const values = new Map()
    const originalStorage = globalThis.localStorage
    globalThis.localStorage = {
        getItem: key => values.get(key) || null,
        setItem: (key, value) => values.set(key, value),
        removeItem: key => values.delete(key)
    }
    try {
        assert.equal(setTranscriptCredentials("supadata", "  sd_test_key  "), true)
        assert.equal(values.get(TRANSCRIPT_KEY_STORAGE), "sd_test_key")
        assert.equal(values.get(TRANSCRIPT_PROVIDER_STORAGE), "supadata")
        assert.equal(getTranscriptKey(), "sd_test_key")
        assert.equal(getTranscriptProvider(), "supadata")
        assert.equal(transcriptConfig().configured, true)

        assert.equal(setTranscriptCredentials("desconocido", "otra"), true)
        assert.equal(getTranscriptProvider(), "supadata")

        clearTranscriptCredentials()
        assert.equal(getTranscriptKey(), "")
        assert.equal(transcriptConfig().configured, false)
    } finally {
        globalThis.localStorage = originalStorage
    }
})

test("transcript cache rows keep the per-account shape", () => {
    const row = normalizeTranscriptRow({
        user_id: "user-1",
        video_id: "jNQXAC9IVRw",
        title: "Me at the zoo",
        language: "en",
        source: "supadata",
        segments: [{ start: 0, end: 2, text: "Hola." }],
        updated_at: "2026-11-16T10:00:00.000Z"
    })
    assert.equal(row.videoId, "jNQXAC9IVRw")
    assert.equal(row.title, "Me at the zoo")
    assert.equal(row.source, "supadata")
    assert.equal(row.segments.length, 1)
    assert.equal(normalizeTranscriptRow(null), null)
})

test("activeWordIndex follows the sentence timing", () => {
    const spans = [
        { from: 0, to: 0.25 },
        { from: 0.25, to: 0.6 },
        { from: 0.6, to: 1 }
    ]
    const segment = { start: 10, end: 12 }
    assert.equal(activeWordIndex(spans, 9, segment), -1)
    assert.equal(activeWordIndex(spans, 10, segment), 0)
    assert.equal(activeWordIndex(spans, 10.4, segment), 0)
    assert.equal(activeWordIndex(spans, 10.5, segment), 1)
    assert.equal(activeWordIndex(spans, 11, segment), 1)
    assert.equal(activeWordIndex(spans, 11.8, segment), 2)
    assert.equal(activeWordIndex(spans, 13, segment), -1)
    assert.equal(activeWordIndex([], 11, segment), -1)
})

test("ai cache rows keep the account shape", () => {
    const row = normalizeAiCacheRow({
        user_id: "user-1",
        kind: "word",
        cache_key: "from",
        value: { translation: "desde" },
        source: "ai",
        updated_at: "2026-11-16T10:00:00.000Z"
    })
    assert.equal(row.kind, "word")
    assert.equal(row.key, "from")
    assert.equal(row.value.translation, "desde")
    assert.equal(row.source, "ai")
    assert.equal(normalizeAiCacheRow(null), null)
})

test("splitTranscriptSegments reparte el tiempo de un bloque entre sus frases", () => {
    const result = splitTranscriptSegments([{
        start: 0,
        duration: 10,
        text: "Hello there everyone. This is a longer sentence here."
    }])
    assert.equal(result.length, 2)
    assert.ok(result[0].end < result[1].end)
    assert.ok(result[0].end <= result[1].start + 0.01)
})

test("los subtítulos rolling no extienden una frase hacia las siguientes", () => {
    const result = splitTranscriptSegments([
        { start: 66.7, duration: 4.5, text: ">> So the company wants an app and it wants" },
        { start: 69.2, duration: 4.1, text: "it for the Spring Film Festival. We" },
        { start: 71.2, duration: 4.1, text: "sponsor the festival and opening night" },
        { start: 73.3, duration: 3.2, text: "is March 19th." },
        { start: 75.3, duration: 5.1, text: "That's the date on the" }
    ])
    const phrase = result.find(item => item.text.includes("Spring Film Festival"))
    assert.ok(phrase, "debe existir la frase completa")
    assert.ok(phrase.start >= 66.6 && phrase.start <= 66.8)
    assert.ok(phrase.end > 70.5 && phrase.end <= 71.1, `final real: ${phrase.end}`)
    assert.ok(!phrase.text.includes("sponsor"))
    const following = result.find(item => item.text.includes("sponsor the festival"))
    assert.ok(following)
    assert.ok(following.start >= phrase.start)
    assert.ok(following.end <= 75.4, `final de la frase siguiente: ${following.end}`)
})

test("retimeSegments no corta una frase cuando los tiempos se solapan", () => {
    const overlapping = retimeSegments([
        { start: 0, end: 12, duration: 12, text: "a" },
        { start: 8, end: 20, duration: 12, text: "b" }
    ])
    assert.equal(overlapping[0].end, 12)
    const withGap = retimeSegments([
        { start: 0, end: 4, duration: 4, text: "a" },
        { start: 9, end: 14, duration: 5, text: "b" }
    ])
    assert.ok(withGap[0].end < withGap[1].start)
})

test("splitTranscriptSegments conserva los tiempos de palabra recibidos", () => {
    const result = splitTranscriptSegments([{
        start: 0,
        duration: 3,
        text: "Hello there friend.",
        words: [
            { text: "Hello", from: 0, to: 0.6, measured: true },
            { text: "there", from: 0.6, to: 1.1, measured: true },
            { text: "friend", from: 1.2, to: 2.4, measured: true }
        ]
    }])
    assert.equal(result.length, 1)
    assert.equal(result[0].words.length, 3)
    assert.equal(result[0].words[0].from, 0)
    assert.equal(result[0].words[2].measured, true)
    assert.ok(result[0].words[2].to <= result[0].end + 0.01)
})

test("partOfSpeech identifica los tipos usados en la guía", () => {
    assert.equal(partOfSpeech("company").tag, "noun")
    assert.equal(partOfSpeech("wants").tag, "verb")
    assert.equal(partOfSpeech("beautiful").tag, "adjective")
    assert.equal(partOfSpeech("quickly").tag, "adverb")
    assert.equal(partOfSpeech("the").tag, "determiner")
    assert.equal(partOfSpeech("and").tag, "conjunction")
    assert.equal(partOfSpeech("we").tag, "pronoun")
    assert.equal(partOfSpeech("2026").tag, "number")
})

test("buildSpeechGuide marca pausas, estrés y tono con tiempos medidos", () => {
    const guide = buildSpeechGuide({
        start: 0,
        end: 4,
        text: "So the company wants an app.",
        words: [
            { text: "So", from: 0, to: 0.25, measured: true },
            { text: "the", from: 0.25, to: 0.4, measured: true },
            { text: "company", from: 0.5, to: 1.3, measured: true },
            { text: "wants", from: 1.35, to: 2, measured: true },
            { text: "an", from: 2.05, to: 2.2, measured: true },
            { text: "app", from: 2.9, to: 3.6, measured: true }
        ]
    })
    const item = token => guide.items.find(entry => entry.token === token)
    assert.equal(guide.source, "measured")
    assert.equal(guide.contour, "↘")
    assert.equal(item("company").stress, "primary")
    assert.equal(item("the").stress, "faded")
    assert.equal(item("app").pauseBefore, "||")
    assert.equal(item("app").pos, "noun")
    assert.equal(item("app").durationMs, 700)
    assert.ok(guide.spans.every(span => span.from >= 0 && span.to <= 1))
})

test("buildSpeechGuide marca pausas por puntuación y por hueco entre frases", () => {
    const guide = buildSpeechGuide({ start: 1, end: 3, text: "Hello, there." }, { start: 4, end: 6, text: "Bye." })
    const comma = guide.items.find(item => item.token === ",")
    const last = guide.items[guide.items.length - 1]
    assert.equal(comma.pauseAfter, "|")
    assert.equal(comma.pauseAfterSource, "punctuation")
    assert.equal(last.pauseAfter, "||")
    assert.equal(guide.pauseSource, "timing")
})

test("buildSpeechGuide estima la guía cuando la transcripción no trae palabras", () => {
    const guide = buildSpeechGuide({ start: 1, end: 3, text: "Hello there." })
    assert.equal(guide.source, "estimated")
    assert.equal(guide.items.filter(item => item.isWord).length, 2)
    assert.equal(guide.contour, "↘")
    assert.equal(guide.spans.length, 2)
    assert.ok(guide.spans[1].to <= 1)
    assert.deepEqual(buildSpeechGuide(null).items, [])
})

test("explainGuide explica cada marca con palabras reales de la frase", () => {
    const guide = buildSpeechGuide({
        start: 0,
        end: 4,
        text: "So the company wants an app.",
        words: [
            { text: "So", from: 0, to: 0.25, measured: true },
            { text: "the", from: 0.25, to: 0.4, measured: true },
            { text: "company", from: 0.5, to: 1.3, measured: true },
            { text: "wants", from: 1.35, to: 2, measured: true },
            { text: "an", from: 2.05, to: 2.2, measured: true },
            { text: "app", from: 2.9, to: 3.6, measured: true }
        ]
    })
    const rows = explainGuide(guide)
    assert.deepEqual(rows.map(row => row.key), ["primary", "secondary", "normal", "faded", "pause", "contour", "hover"])
    const row = key => rows.find(entry => entry.key === key)
    const words = new Set(guide.items.filter(item => item.isWord).map(item => item.token))
    assert.equal(row("primary").sample, "company")
    assert.ok(words.has(row("faded").sample), `la palabra ligera debe salir de la frase: ${row("faded").sample}`)
    assert.equal(row("pause").sample, "||")
    assert.equal(row("pause").label, "Pausa larga")
    assert.equal(row("contour").sample, "↘")
    assert.match(row("primary").description, /más fuerte/)
    assert.ok(rows.every(entry => entry.label && entry.description && entry.sample))
})

test("explainGuide explica las palabras de ritmo base que aparecen en negro", () => {
    const guide = buildSpeechGuide({ start: 0, end: 6, text: "From clean code to clear communication, welcome to English." })
    const normal = explainGuide(guide).find(row => row.key === "normal")
    assert.equal(normal.label, "Ritmo base")
    assert.ok(guide.items.some(item => item.isWord && item.stress === "normal" && item.token === normal.sample))
    assert.match(normal.description, /fuerza media/)
})

test("explainGuide adapta la pausa breve y el tono ascendente", () => {
    const guide = buildSpeechGuide({ start: 1, end: 3, text: "Are you coming?" }, { start: 3.5, end: 5, text: "Yes." })
    const rows = explainGuide(guide)
    const pause = rows.find(row => row.key === "pause")
    const contour = rows.find(row => row.key === "contour")
    assert.equal(pause.label, "Pausa breve")
    assert.match(pause.description, /pausa corta/)
    assert.equal(contour.sample, "↗")
    assert.match(contour.description, /sube/)
})

test("explainGuide funciona con una guía vacía sin lanzar errores", () => {
    const rows = explainGuide({ items: [], contour: "" })
    assert.equal(rows.length, 7)
    assert.ok(rows.every(row => row.sample && row.description))
    assert.equal(rows.find(row => row.key === "contour").sample, "↘")
})
