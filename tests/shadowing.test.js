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

test("retimeSegments corta cada frase antes de la siguiente", () => {
    const result = retimeSegments([
        { start: 0, end: 12, text: "a" },
        { start: 8, end: 20, text: "b" },
        { start: 16, end: 30, text: "c" }
    ])
    assert.ok(result[0].end < result[1].start)
    assert.ok(result[1].end < result[2].start)
    assert.equal(result[0].start, 0)
})
