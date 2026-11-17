import test from "node:test"
import assert from "node:assert/strict"
import { extractYouTubeId, parseManualTranscript, suggestionWords, looksLikeYouTubeUrl } from "../js/shadowing/model.js"
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
