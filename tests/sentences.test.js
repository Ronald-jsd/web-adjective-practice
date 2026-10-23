import test from "node:test"
import assert from "node:assert/strict"
import { validateSentence } from "../js/sentences/model.js"
import { DEFAULT_REVIEW_INTERVALS, isDue, scheduleReview } from "../js/sentences/scheduler.js"
import { checkFillBlank, createFillBlank } from "../js/sentences/exercises.js"
import { createSentenceRepository } from "../js/sentences/repository.js"
import { AI_PROVIDER_STORAGE, GROQ_KEY_STORAGE } from "../js/config.js"
import { recommendEnglishSentence } from "../js/ai-translation.js"
import { createPracticeProgressSync } from "../js/practice-progress.js"
import {
    filterAudioPracticeItems,
    getPracticeFillHint,
    rankPracticeReviews,
    selectPracticeDistractors
} from "../js/practice-utils.js"
import { createPracticeAudioPlayer, PRACTICE_AUDIO_RATES } from "../js/practice-audio.js"
import {
    createAIExamplePrompt,
    createAIPracticeCategory,
    createFavoritesPracticeCategory,
    createVerbPracticeCategory,
    splitTranslatedExample
} from "../js/ai-practice.js"

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

test("saved AI query cards become individual practice items with translated examples", () => {
    const category = createAIPracticeCategory([
        {
            id: "query-1",
            cards: [
                {
                    word: "would like",
                    pronunciation: "/wʊd laɪk/",
                    spanish: "Forma educada de expresar un deseo.",
                    example_en: "I would like to visit Japan.",
                    example_es: "Me gustaría visitar Japón."
                },
                {
                    word: "feel like",
                    pronunciation: "/fiːl laɪk/",
                    spanish: "Expresa tener ganas de algo.",
                    example_en: "I feel like eating pizza.",
                    example_es: "Tengo ganas de comer pizza."
                }
            ]
        }
    ])

    assert.equal(category.id, "ai-queries")
    assert.equal(category.subcategories[0].items.length, 2)
    assert.equal(category.subcategories[0].items[0][0], "would like")
    assert.equal(category.subcategories[0].items[0][2], "Forma educada de expresar un deseo.")
    assert.equal(category.subcategories[0].items[0][3], "I would like to visit Japan.")
    assert.equal(category.subcategories[0].items[0][4], "Me gustaría visitar Japón.")
    assert.equal(category.subcategories[0].items[1][3], "I feel like eating pizza.")
    assert.equal(createAIPracticeCategory([]), null)
})

test("AI fill-in exercises use every saved example, including inflected phrases", () => {
    assert.equal(
        createAIExamplePrompt("would like", "I would like to visit Japan."),
        "I _____ to visit Japan."
    )
    assert.equal(
        createAIExamplePrompt("be dying to", "I'm dying to see the new movie."),
        "¿Qué expresión completa este ejemplo? I'm dying to see the new movie."
    )
})

test("saved verbs become an individual selectable practice category", () => {
    const category = createVerbPracticeCategory([
        {
            id: 42,
            verb: "begin",
            pronunciation: "/bɪˈɡɪn/",
            translation: "empezar",
            example_base: "I begin work at nine. (Empiezo a trabajar a las nueve.)",
            past_simple: "began",
            pronunciation_ps: "/bɪˈɡæn/",
            translation_ps: "empezó",
            example_ps: "She began work yesterday. (Ella empezó a trabajar ayer.)",
            past_participle: "begun",
            pronunciation_pp: "/bɪˈɡʌn/",
            translation_pp: "empezado",
            example_pp: "The meeting has begun. (La reunión ha empezado.)"
        },
        { id: 43, verb: "", translation: "vacío" }
    ])

    assert.equal(category.id, "saved-verbs")
    assert.equal(category.title, "Verbos guardados")
    assert.equal(category.subcategories[0].items.length, 3)
    assert.equal(category.subcategories[0].items[0][0], "begin")
    assert.equal(category.subcategories[0].items[0][2], "empezar")
    assert.equal(category.subcategories[0].items[0][3], "I begin work at nine.")
    assert.equal(category.subcategories[0].items[0][4], "Empiezo a trabajar a las nueve.")
    assert.equal(category.subcategories[0].items[0][5], "saved-verb-42-base")
    assert.deepEqual(category.subcategories[0].items.slice(1).map(item => item.slice(0, 5)), [
        ["began", "/bɪˈɡæn/", "empezó", "She began work yesterday.", "Ella empezó a trabajar ayer."],
        ["begun", "/bɪˈɡʌn/", "empezado", "The meeting has begun.", "La reunión ha empezado."]
    ])
    assert.equal(createVerbPracticeCategory([]), null)
})

test("saved verbs without a stored tense form do not create placeholder exercises", () => {
    const category = createVerbPracticeCategory([{
        id: 7,
        verb: "walk",
        translation: "caminar",
        past_simple: "--",
        past_participle: "N/A"
    }])
    assert.equal(category.subcategories[0].items.length, 1)
})

test("favorites practice includes only marked adjective IDs and all usable forms of starred verbs", () => {
    const adjectiveCategories = [{
        id: "adjectives",
        title: "Adjetivos",
        subcategories: [{
            id: "feelings",
            title: "Sentimientos",
            items: [
                ["happy", "/ˈhæpi/", "feliz", "I feel happy.", "Me siento feliz.", 15],
                ["calm", "/kɑːm/", "tranquilo", "Stay calm.", "Mantén la calma.", "custom_abc", "abc"],
                ["sad", "/sæd/", "triste", "I feel sad.", "Me siento triste.", 16]
            ]
        }]
    }]
    const verbs = [
        {
            id: 42, verb: "begin", translation: "empezar", example_base: "I begin work.",
            past_simple: "began", translation_ps: "empezó",
            past_participle: "begun", translation_pp: "empezado"
        },
        { id: 43, verb: "walk", translation: "caminar", past_simple: "walked", past_participle: "walked" }
    ]
    const favorites = new Set(["adjective:15", "adjective:custom_abc", "verb:42"])

    const [adjectiveFavorites, verbFavorites] = createFavoritesPracticeCategory(adjectiveCategories, verbs, favorites)
    assert.equal(adjectiveFavorites.id, "favorite-adjectives")
    assert.equal(verbFavorites.id, "favorite-verbs")
    assert.equal(adjectiveFavorites.title, "Favoritos · Adjetivos")
    assert.equal(verbFavorites.title, "Favoritos · Verbos")
    assert.deepEqual(adjectiveFavorites.subcategories[0].items.map(item => item[0]), ["happy", "calm"])
    assert.deepEqual(verbFavorites.subcategories[0].items.map(item => item[0]), ["begin", "began", "begun"])
    assert.deepEqual(verbFavorites.subcategories[0].items.map(item => item[5]), [
        "saved-verb-42-base",
        "saved-verb-42-past-simple",
        "saved-verb-42-past-participle"
    ])
    assert.equal(verbFavorites.subcategories[0].items[0][3], "I begin work.")
    const emptyFavorites = createFavoritesPracticeCategory(adjectiveCategories, verbs, new Set())
    assert.deepEqual(emptyFavorites.map(category => category.id), ["favorite-adjectives", "favorite-verbs"])
    assert.deepEqual(emptyFavorites.map(category => category.subcategories[0].items), [[], []])
})

test("practice choice distractors are unique and selected efficiently from large lists", () => {
    const words = Array.from({ length: 6500 }, (_, index) => ({ word: `verb-${index}` }))
    words.push({ word: "VERB-1" }, { word: "correct" })
    const distractors = selectPracticeDistractors(words, "correct", 3, () => 0.5)

    assert.equal(distractors.length, 3)
    assert.equal(new Set(distractors.map(item => item.word.toLowerCase())).size, 3)
    assert.ok(distractors.every(item => item.word.toLowerCase() !== "correct"))
})

test("smart review prioritizes failed words and those not practiced for the longest", () => {
    const items = [{ id: "recent" }, { id: "old" }, { id: "failed" }]
    const progress = {
        recent: { lapses: 0, lastReviewedAt: 900, dueAt: 100 },
        old: { lapses: 0, lastReviewedAt: 100, dueAt: 50 },
        failed: { lapses: 2, lastReviewedAt: 800, dueAt: 200 }
    }
    const ranked = rankPracticeReviews(items, item => progress[item.id])
    assert.deepEqual(ranked.map(item => item.id), ["failed", "old", "recent"])
})

test("audio content filters include only new or failed and due items", () => {
    const items = [{ id: "new" }, { id: "failed" }, { id: "due" }, { id: "future" }]
    const progress = {
        new: { attempts: 0, lapses: 0, dueAt: 0 },
        failed: { attempts: 1, lapses: 1, dueAt: 500 },
        due: { attempts: 2, lapses: 0, dueAt: 900 },
        future: { attempts: 1, lapses: 0, dueAt: 1100 }
    }
    const getProgress = item => progress[item.id]
    assert.deepEqual(filterAudioPracticeItems(items, "new", getProgress, 1000).map(item => item.id), ["new"])
    assert.deepEqual(filterAudioPracticeItems(items, "review", getProgress, 1000).map(item => item.id), ["failed", "due"])
    assert.deepEqual(filterAudioPracticeItems(items, "all", getProgress, 1000), items)
})

test("fill-in exercises show the Spanish answer hint and optional example translation", () => {
    assert.equal(getPracticeFillHint("guardar"), "💡 En español: guardar")
    assert.equal(
        getPracticeFillHint("almacenar", "Guardamos los abrigos en el ático."),
        "💡 En español: almacenar · Traducción del ejemplo: Guardamos los abrigos en el ático."
    )
})

test("verb example translation is separated from the English cloze sentence", () => {
    assert.deepEqual(
        splitTranslatedExample("We put out the campfire completely. (Apagamos la fogata por completo.)"),
        ["We put out the campfire completely.", "Apagamos la fogata por completo."]
    )
    assert.deepEqual(splitTranslatedExample("They arrive early."), ["They arrive early.", ""])
})

test("audio study reads each selected word, translation, and example in order", () => {
    const spoken = []
    const states = []
    const voices = []
    const synthesis = {
        speak(utterance) { spoken.push(utterance) },
        cancel() {},
        pause() {},
        resume() {}
    }
    const player = createPracticeAudioPlayer({
        synthesis,
        createUtterance: text => ({ text }),
        getVoice: language => {
            voices.push(language)
            return { name: `${language}-preferred` }
        },
        onState: state => states.push(state)
    })

    player.start([{
        word: "save",
        spanish: "guardar",
        example: "Save the file.",
        exampleSpanish: "Guarda el archivo."
    }])
    assert.equal(spoken[0].text, "save")
    assert.equal(spoken[0].lang, "en-US")
    assert.equal(spoken[0].voice.name, "en-preferred")
    assert.equal(spoken[0].rate, 1)
    spoken[0].onend()
    assert.equal(spoken[1].text, "guardar")
    assert.equal(spoken[1].lang, "es-ES")
    assert.equal(spoken[1].voice.name, "es-preferred")
    spoken[1].onend()
    assert.equal(spoken[2].text, "Save the file.")
    spoken[2].onend()
    assert.equal(spoken[3].text, "Guarda el archivo.")
    spoken[3].onend()
    assert.equal(states.at(-1).status, "complete")
    assert.deepEqual(voices, ["en", "es", "en", "es"])
})

test("audio study supports slower playback rates", () => {
    const spoken = []
    const player = createPracticeAudioPlayer({
        synthesis: { speak: utterance => spoken.push(utterance), cancel() {}, pause() {}, resume() {} },
        createUtterance: text => ({ text }),
        onState() {}
    })
    assert.deepEqual(PRACTICE_AUDIO_RATES, [1, 0.9, 0.85, 0.8, 0.75])
    player.setRate("1")
    player.start([{ word: "normal", spanish: "normal" }])
    assert.equal(spoken[0].rate, 1)
    player.stop()
    player.setRate("0.85")
    player.start([{ word: "study", spanish: "estudiar" }])
    assert.equal(spoken.at(-1).rate, 0.85)
    assert.throws(() => player.setRate(1.2), RangeError)
})

test("audio study shuffles all selected items without omitting any", () => {
    const spoken = []
    const player = createPracticeAudioPlayer({
        synthesis: { speak: utterance => spoken.push(utterance), cancel() {}, pause() {}, resume() {} },
        createUtterance: text => ({ text }),
        random: () => 0,
        onState() {}
    })
    const items = [
        { word: "first", spanish: "primero" },
        { word: "second", spanish: "segundo" },
        { word: "third", spanish: "tercero" }
    ]

    player.start(items)
    for (let index = 0; index < 6; index += 1) spoken[index].onend()
    assert.deepEqual(spoken.filter((_, index) => index % 2 === 0).map(utterance => utterance.text), ["second", "third", "first"])
    assert.equal(spoken.length, 6)
})

test("audio study restores its queue and position for the same filter after reload", () => {
    const stored = new Map()
    const storage = {
        getItem: key => stored.get(key) || null,
        setItem: (key, value) => stored.set(key, value),
        removeItem: key => stored.delete(key)
    }
    const items = [
        { id: "first", word: "first", spanish: "primero" },
        { id: "second", word: "second", spanish: "segundo" }
    ]
    const firstPlayerUtterances = []
    const firstPlayer = createPracticeAudioPlayer({
        synthesis: { speak: utterance => firstPlayerUtterances.push(utterance), cancel() {}, pause() {}, resume() {} },
        createUtterance: text => ({ text }),
        storage,
        random: () => 0.999,
        onState() {}
    })
    firstPlayer.start(items, "all")
    firstPlayerUtterances[0].onend()
    firstPlayerUtterances[1].onend()
    assert.equal(firstPlayer.canResume(items, "all"), true)
    assert.equal(firstPlayer.canResume(items, "new"), false)

    const restoredUtterances = []
    const restoredPlayer = createPracticeAudioPlayer({
        synthesis: { speak: utterance => restoredUtterances.push(utterance), cancel() {}, pause() {}, resume() {} },
        createUtterance: text => ({ text }),
        storage,
        random: () => 0,
        onState() {}
    })
    restoredPlayer.start(items, "all")
    assert.equal(restoredUtterances[0].text, "second")
})

test("audio study can pause, resume, skip an item, and stop", () => {
    const spoken = []
    let pauses = 0
    let resumes = 0
    let cancellations = 0
    const player = createPracticeAudioPlayer({
        synthesis: {
            speak(utterance) { spoken.push(utterance) },
            cancel() { cancellations += 1 },
            pause() { pauses += 1 },
            resume() { resumes += 1 }
        },
        createUtterance: text => ({ text }),
        random: () => 0.999,
        onState() {}
    })
    const items = [
        { word: "first", spanish: "primero" },
        { word: "second", spanish: "segundo" }
    ]

    player.start(items)
    player.pause()
    assert.equal(player.status, "paused")
    player.start(items)
    assert.equal(resumes, 1)
    player.skip()
    assert.equal(spoken.at(-1).text, "second")
    player.stop()
    assert.equal(player.status, "idle")
    assert.equal(pauses, 1)
    assert.ok(cancellations >= 2)
})
