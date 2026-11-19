import test from "node:test"
import assert from "node:assert/strict"
import {
    STUDY_ACTIVITIES,
    getActivity,
    getLocalDateKey,
    isValidCommitment,
    normalizeCommitment,
    chooseDailyActivity,
    createDailyRandom,
    ensureDailyMission,
    recordCommitment,
    recordCompletion,
    saveReminderSettings,
    normalizeDailyState,
    loadDailyState,
    saveDailyState,
    getStorageKey
} from "../js/daily-study.js"

function createStorage() {
    const values = new Map()
    return {
        getItem: key => values.has(key) ? values.get(key) : null,
        setItem: (key, value) => values.set(key, String(value)),
        removeItem: key => values.delete(key)
    }
}

test("the six study activities point to real sections of the app", () => {
    assert.deepEqual(STUDY_ACTIVITIES.map(activity => activity.id), [
        "practice", "listening", "shadowing", "vocabulary", "sentences", "ai"
    ])
    for (const activity of STUDY_ACTIVITIES) {
        assert.ok(activity.label && activity.icon && activity.section)
        assert.equal(getActivity(activity.id), activity)
    }
    assert.deepEqual(getActivity("practice").pane, "general")
    assert.deepEqual(getActivity("listening").pane, "audio")
    assert.deepEqual(getActivity("shadowing").pane, "shadowing")
    assert.deepEqual(getActivity("vocabulary").screen, "vocabulary")
    assert.deepEqual(getActivity("sentences").screen, "review")
})

test("local date keys do not shift with UTC", () => {
    const date = new Date(2026, 10, 19, 23, 30)
    assert.equal(getLocalDateKey(date), "2026-11-19")
})

test("the commitment must literally say that the user will study", () => {
    assert.equal(normalizeCommitment("¡Sí, estudiaré Ejercicios!"), "si estudiare ejercicios")
    assert.equal(isValidCommitment("Sí, estudiaré Ejercicios"), true)
    assert.equal(isValidCommitment("estudiare shadowing"), true)
    assert.equal(isValidCommitment("Voy a estudiar mis frases"), true)
    assert.equal(isValidCommitment("quizá estudie mañana"), false)
    assert.equal(isValidCommitment(""), false)
})

test("the daily pick is deterministic and never repeats yesterday's activity", () => {
    const seen = new Set()
    for (let day = 1; day <= 30; day += 1) {
        const dateKey = `2026-12-${String(day).padStart(2, "0")}`
        const previousId = STUDY_ACTIVITIES[(day - 1) % STUDY_ACTIVITIES.length].id
        const first = chooseDailyActivity({ dateKey, previousId, random: createDailyRandom(dateKey, previousId) })
        const second = chooseDailyActivity({ dateKey, previousId, random: createDailyRandom(dateKey, previousId) })
        assert.equal(first, second)
        assert.notEqual(first, previousId)
        seen.add(first)
    }
    assert.equal(seen.size, STUDY_ACTIVITIES.length)
})

test("review due activities are preferred over already consolidated ones", () => {
    const now = new Date(2026, 10, 19, 12, 0)
    const future = new Date(2026, 10, 25, 12, 0).toISOString()
    const cards = {
        practice: { memoryState: "review", nextReviewAt: future },
        listening: { memoryState: "review", nextReviewAt: future },
        shadowing: { memoryState: "new" },
        vocabulary: { memoryState: "review", nextReviewAt: future },
        sentences: { memoryState: "review", nextReviewAt: future },
        ai: { memoryState: "review", nextReviewAt: future }
    }
    assert.equal(chooseDailyActivity({ cards, dateKey: "2026-11-19", now }), "shadowing")
    assert.equal(chooseDailyActivity({
        cards: { ...cards, listening: { memoryState: "review", nextReviewAt: now.toISOString() } },
        previousId: "shadowing",
        dateKey: "2026-11-19",
        now
    }), "listening")
})

test("one mission is created per day and a completed review schedules the next one", () => {
    const now = new Date(2026, 10, 19, 9, 0)
    const first = ensureDailyMission(normalizeDailyState(null), { dateKey: "2026-11-19", now, random: () => 0.1 })
    assert.equal(first.created, true)
    assert.equal(first.mission.commitmentAt, null)

    const repeated = ensureDailyMission(first.state, { dateKey: "2026-11-19", now, random: () => 0.9 })
    assert.equal(repeated.created, false)
    assert.equal(repeated.mission.activityId, first.mission.activityId)
    assert.equal(repeated.state.history.length, 1)

    const invalid = recordCommitment(repeated.state, "2026-11-19", "lo haré luego", now)
    assert.equal(invalid.valid, false)
    const committed = recordCommitment(repeated.state, "2026-11-19", "Estudiaré " + getActivity(first.mission.activityId).label, now)
    assert.equal(committed.valid, true)
    assert.ok(committed.mission.commitmentAt)

    const missingRecall = recordCompletion(committed.state, "2026-11-19", { grade: "good", recall: " " }, now)
    assert.equal(missingRecall.recorded, false)

    const completed = recordCompletion(committed.state, "2026-11-19", { grade: "good", recall: "reasonable" }, now)
    assert.equal(completed.recorded, true)
    assert.equal(completed.mission.grade, "good")
    assert.ok(new Date(completed.card.nextReviewAt).getTime() > now.getTime())

    const nextDay = ensureDailyMission(completed.state, { dateKey: "2026-11-20", now, random: () => 0.1 })
    assert.equal(nextDay.created, true)
    assert.notEqual(nextDay.mission.activityId, completed.mission.activityId)
})

test("daily state survives a reload and is isolated per user", () => {
    const storage = createStorage()
    const state = saveReminderSettings(normalizeDailyState(null), { enabled: true, time: "21:30" })
    assert.equal(saveDailyState(state, { storage, userId: "abc" }), true)
    assert.equal(getStorageKey("abc"), "daily_study_v1:abc")

    const loaded = loadDailyState({ storage, userId: "abc" })
    assert.equal(loaded.notifications.enabled, true)
    assert.equal(loaded.notifications.time, "21:30")
    assert.deepEqual(loadDailyState({ storage, userId: "otro" }), normalizeDailyState(null))

    const invalidTime = saveReminderSettings(state, { enabled: true, time: "99:99" })
    assert.equal(invalidTime.notifications.time, "21:30")
})
