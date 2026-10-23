import test from "node:test"
import assert from "node:assert/strict"
import {
    GEMINI_TEXT_MODELS,
    GROQ_TEXT_MODELS,
    parseAIJson
} from "../js/ai-models.js"

test("AI model lists only include the current text generation models", () => {
    assert.deepEqual(GEMINI_TEXT_MODELS, ["gemini-3.6-flash"])
    assert.deepEqual(GROQ_TEXT_MODELS, [
        "openai/gpt-oss-20b",
        "openai/gpt-oss-120b",
        "qwen/qwen3.8-27b"
    ])
})

test("parseAIJson accepts plain, fenced, and wrapped JSON objects", () => {
    const expected = { english: "Good morning", spanish: "Buenos días" }
    assert.deepEqual(parseAIJson(JSON.stringify(expected)), expected)
    assert.deepEqual(parseAIJson(`\`\`\`json\n${JSON.stringify(expected)}\n\`\`\``), expected)
    assert.deepEqual(parseAIJson(`Respuesta:\n${JSON.stringify(expected)}\nListo.`), expected)
})

test("parseAIJson rejects empty, malformed, and non-object JSON responses", () => {
    assert.equal(parseAIJson(""), null)
    assert.equal(parseAIJson("{no válido}"), null)
    assert.equal(parseAIJson('["not", "an object"]'), null)
})
