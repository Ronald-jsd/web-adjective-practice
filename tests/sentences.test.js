import test from "node:test"
import assert from "node:assert/strict"
import { validateSentence } from "../js/sentences/model.js"
import { DEFAULT_REVIEW_INTERVALS, isDue, scheduleReview } from "../js/sentences/scheduler.js"
import { checkFillBlank, createFillBlank } from "../js/sentences/exercises.js"
import { createSentenceRepository } from "../js/sentences/repository.js"
import { AI_PROVIDER_STORAGE, GROQ_KEY_STORAGE } from "../js/config.js"
import { recommendEnglishSentence } from "../js/ai-translation.js"
import { createPracticeProgressSync } from "../js/practice-progress.js"

const day = 24 * 60 * 60 * 1000

test("rejects isolated words and accepts complete sentences or useful expressions", () => {
    assert.deepEqual(validateSentence("water"), {
        valid: false,
        message: "Make a sentence with this word first."
    })
    assert.equal(validateSentence("Could you help me, please?").valid, true)
    assert.equal(validateSentence("Thank you").valid, true)
    assert.equal(validateSentence("I agree.").valid, true)
})

test("a remembered review advances through configured intervals to mastered", () => {
    const now = new Date("2026-01-01T10:00:00.000Z")
    const box1 = scheduleReview({ reviewBox: 1, totalAttempts: 0, totalFailures: 0, consecutiveSuccesses: 0 }, true, now)
    assert.equal(box1.reviewBox, 2)
    assert.equal(new Date(box1.nextReviewAt).getTime(), now.getTime() + DEFAULT_REVIEW_INTERVALS[2] * day)

    const box2 = scheduleReview({ ...box1, reviewBox: 2 }, true, now)
    assert.equal(box2.reviewBox, 3)
    assert.equal(new Date(box2.nextReviewAt).getTime(), now.getTime() + DEFAULT_REVIEW_INTERVALS[3] * day)

    const mastered = scheduleReview({ ...box2, reviewBox: 3 }, true, now)
    assert.equal(mastered.reviewBox, "mastered")
    assert.equal(new Date(mastered.nextReviewAt).getTime(), now.getTime() + DEFAULT_REVIEW_INTERVALS.mastered * day)
    const retained = scheduleReview(mastered, true, now)
    assert.equal(retained.reviewBox, "mastered")
    assert.equal(new Date(retained.nextReviewAt).getTime(), now.getTime() + 30 * day)
})

test("a failed review returns to Box 1 and resets consecutive successes", () => {
    const now = new Date("2026-01-04T10:00:00.000Z")
    const result = scheduleReview({
        reviewBox: 3, totalAttempts: 4, totalFailures: 1, consecutiveSuccesses: 2
    }, false, now)
    assert.equal(result.reviewBox, 1)
    assert.equal(result.totalAttempts, 5)
    assert.equal(result.totalFailures, 2)
    assert.equal(result.consecutiveSuccesses, 0)
    assert.equal(new Date(result.nextReviewAt).getTime(), now.getTime() + day)
})

test("due checks honor the scheduled timestamp", () => {
    const now = new Date("2026-01-05T12:00:00.000Z")
    assert.equal(isDue({ nextReviewAt: "2026-01-05T11:00:00.000Z" }, now), true)
    assert.equal(isDue({ nextReviewAt: "2026-01-05T13:00:00.000Z" }, now), false)
})

test("fill-blank exercises use a word from the learner's sentence", () => {
    const exercise = createFillBlank({
        englishText: "Could you bring the menu, please?",
        spanishTranslation: ""
    })
    assert.ok(exercise.prompt.includes("_______"))
    assert.ok("Could you bring the menu, please?".toLowerCase().includes(exercise.answer.toLowerCase()))
    assert.equal(checkFillBlank(exercise.answer, exercise).correct, true)
    assert.equal(checkFillBlank("wrong", exercise).correct, false)
})

test("editing updates a sentence without resetting its review progress", async () => {
    const calls = []
    const databaseRow = {
        id: "sentence-1", english_text: "I work near the station.", spanish_translation: "Trabajo cerca de la estación.",
        topic_tags: ["Work"], reason_for_saving: "Useful expression", grammar_pattern: "Simple present",
        review_box: "2", next_review_at: "2026-01-04T12:00:00.000Z", total_attempts: 3,
        total_failures: 1, consecutive_successes: 1, last_reviewed_at: "2026-01-01T12:00:00.000Z",
        created_at: "2025-12-01T12:00:00.000Z", updated_at: "2026-01-01T12:00:00.000Z"
    }
    const query = {
        update(values) { calls.push(["update", values]); return this },
        insert(values) { calls.push(["insert", values]); return this },
        delete() { calls.push(["delete"]); return this },
        select() { return this },
        eq(key, value) { calls.push(["eq", key, value]); return this },
        single() { return Promise.resolve({ data: databaseRow, error: null }) },
        order() { return this }
    }
    const supabase = { from: table => { calls.push(["from", table]); return query } }
    const repository = createSentenceRepository(supabase)
    const updated = await repository.save("user-1", {
        englishText: "I work close to the station.",
        spanishTranslation: "Trabajo cerca de la estación.",
        topicTags: ["Work"],
        reasonForSaving: "Useful expression",
        grammarPattern: "Simple present"
    }, "sentence-1")
    assert.equal(updated.reviewBox, "2")
    assert.equal(updated.totalAttempts, 3)
    assert.equal(calls[0][0], "from")
    assert.equal(calls[1][0], "update")
    assert.equal(calls[1][1].english_text, "I work close to the station.")
    assert.ok(calls.some(call => call[0] === "eq" && call[1] === "id" && call[2] === "sentence-1"))
})

test("sentence recommendation uses the existing AI provider to correct English and translate its meaning", async () => {
    const originalStorage = globalThis.localStorage
    const originalFetch = globalThis.fetch
    const values = new Map([
        [GROQ_KEY_STORAGE, "existing-groq-key"],
        [AI_PROVIDER_STORAGE, "groq"]
    ])
    globalThis.localStorage = {
        getItem: key => values.get(key) || null,
        removeItem: key => values.delete(key)
    }
    let request
    globalThis.fetch = async (url, options) => {
        request = { url, options }
        return {
            ok: true,
            json: async () => ({
                choices: [{
                    message: {
                        content: JSON.stringify({
                            english: "I'd like a table for two, please.",
                            spanish: "Quisiera una mesa para dos, por favor."
                        })
                    }
                }]
            })
        }
    }
    try {
        const recommendation = await recommendEnglishSentence("quiero una mesa para dos estoy ambriento")
        assert.deepEqual(recommendation, {
            english: "I'd like a table for two, please.",
            spanish: "Quisiera una mesa para dos, por favor."
        })
        assert.match(request.url, /api\.groq\.com/)
        assert.equal(request.options.headers.Authorization, "Bearer existing-groq-key")
        assert.equal(JSON.parse(request.options.body).messages[1].content, "quiero una mesa para dos estoy ambriento")
        assert.match(JSON.parse(request.options.body).messages[0].content, /gramaticales o de escritura/)
        assert.deepEqual(JSON.parse(request.options.body).response_format, { type: "json_object" })
    } finally {
        globalThis.localStorage = originalStorage
        globalThis.fetch = originalFetch
    }
})

test("sentence recommendation reports when no existing AI key is configured", async () => {
    const originalStorage = globalThis.localStorage
    globalThis.localStorage = { getItem: () => null }
    try {
        await assert.rejects(
            recommendEnglishSentence("I need two table"),
            /No hay una API key de IA configurada/
        )
    } finally {
        globalThis.localStorage = originalStorage
    }
})

test("first practice sync uploads browser progress, then restores it on another device", async () => {
    const rows = new Map()
    const supabase = {
        from(table) {
            assert.equal(table, "vocabulary_practice_progress")
            return {
                select() {
                    return this
                },
                async eq(column, userId) {
                    assert.equal(column, "user_id")
                    return { data: [...rows.values()].filter(row => row.user_id === userId), error: null }
                },
                async upsert(values) {
                    for (const row of Array.isArray(values) ? values : [values]) {
                        rows.set(`${row.user_id}:${row.item_id}`, row)
                    }
                    return { error: null }
                }
            }
        }
    }
    const firstDevice = createPracticeProgressSync(supabase, "user-1")
    const local = {
        "category:subcategory:word-1": {
            attempts: 4,
            correct: 3,
            repetitions: 2,
            intervalDays: 6,
            ease: 2.6,
            dueAt: Date.parse("2026-10-25T12:00:00.000Z"),
            lapses: 1,
            lastReviewedAt: Date.parse("2026-10-22T12:00:00.000Z")
        }
    }
    const merged = await firstDevice.loadAndMerge(local)
    assert.deepEqual(merged, local)
    assert.equal(rows.size, 1)

    const secondDevice = createPracticeProgressSync(supabase, "user-1")
    const restored = await secondDevice.loadAndMerge({})
    assert.deepEqual(restored, local)
})

test("practice sync keeps the most recently reviewed progress when devices differ", async () => {
    const timestamp = Date.parse("2026-10-22T12:00:00.000Z")
    let saved
    const supabase = {
        from() {
            return {
                select() { return this },
                async eq() { return { data: [saved], error: null } },
                async upsert(rows) { saved = Array.isArray(rows) ? rows[0] : rows; return { error: null } }
            }
        }
    }
    saved = {
        user_id: "user-1",
        item_id: "word-1",
        attempts: 2,
        correct: 2,
        repetitions: 2,
        interval_days: 6,
        ease: 2.6,
        due_at: new Date(timestamp + 6 * day).toISOString(),
        lapses: 0,
        last_reviewed_at: new Date(timestamp).toISOString()
    }
    const local = {
        "word-1": {
            attempts: 3,
            correct: 2,
            repetitions: 0,
            intervalDays: 0,
            ease: 2.4,
            dueAt: timestamp + day,
            lapses: 1,
            lastReviewedAt: timestamp + day
        }
    }
    const merged = await createPracticeProgressSync(supabase, "user-1").loadAndMerge(local)
    assert.deepEqual(merged["word-1"], local["word-1"])
    assert.equal(saved.attempts, 3)
    assert.equal(saved.lapses, 1)
})
