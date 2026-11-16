import test from "node:test"
import assert from "node:assert/strict"
import { extractYouTubeId, parseManualTranscript, suggestionWords } from "../js/shadowing/model.js"

test("extractYouTubeId accepts watch, short, shorts and embed URLs", () => {
    assert.equal(extractYouTubeId("https://www.youtube.com/watch?v=Q5vAL799_BM"), "Q5vAL799_BM")
    assert.equal(extractYouTubeId("https://youtu.be/Q5vAL799_BM?si=example"), "Q5vAL799_BM")
    assert.equal(extractYouTubeId("https://www.youtube.com/shorts/Q5vAL799_BM"), "Q5vAL799_BM")
    assert.equal(extractYouTubeId("https://www.youtube.com/embed/Q5vAL799_BM"), "Q5vAL799_BM")
    assert.equal(extractYouTubeId("Q5vAL799_BM"), "Q5vAL799_BM")
    assert.equal(extractYouTubeId("https://example.com/video"), "")
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
