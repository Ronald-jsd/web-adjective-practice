import test from "node:test"
import assert from "node:assert/strict"
import {
    STUDY_ACTIVITIES,
    MAIN_SLOT,
    REVIEW_SLOT,
    MAIN_ACTIVITY_IDS,
    REVIEW_ACTIVITY_IDS,
    MIN_REAL_INTERACTIONS,
    getActivity,
    getLocalDateKey,
    isValidCommitment,
    normalizeCommitment,
    chooseDailyActivity,
    chooseDailyTarget,
    createDailyRandom,
    ensureDailyMissions,
    findDailyMissions,
    findMission,
    refreshMissionTarget,
    recordCommitment,
    recordInteraction,
    recordCompletion,
    resetMission,
    saveReminderSettings,
    normalizeDailyState,
    getActivityMinutes,
    getDailyTotalMinutes,
    getTotalPlanMinutes,
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

const AI_TARGETS = [
    { id: "q1", label: "Phasal verbs" },
    { id: "q2", label: "Condicionales" },
    { id: "q3", label: "Pronunciación de -ed" }
]

test("the six study activities point to real sections of the app", () => {
    assert.deepEqual(STUDY_ACTIVITIES.map(activity => activity.id), [
        "practice", "listening", "shadowing", "vocabulary", "sentences", "ai"
    ])
    for (const activity of STUDY_ACTIVITIES) {
        assert.ok(activity.label && activity.icon && activity.section)
        assert.ok(activity.minutes >= 5)
        assert.equal(getActivityMinutes(activity.id), activity.minutes)
        assert.equal(getActivity(activity.id), activity)
    }
    assert.equal(getTotalPlanMinutes(), 70)
    assert.deepEqual(getActivity("practice").pane, "general")
    assert.deepEqual(getActivity("listening").pane, "audio")
    assert.deepEqual(getActivity("shadowing").pane, "shadowing")
    assert.deepEqual(getActivity("vocabulary").screen, "vocabulary")
    assert.deepEqual(getActivity("sentences").screen, "review")
})

test("only the two missions assigned today count towards the daily time", () => {
    const now = new Date(2026, 10, 19, 9, 0)
    const today = ensureDailyMissions(normalizeDailyState(null), {
        dateKey: "2026-11-19", now, targets: AI_TARGETS
    })
    const total = getDailyTotalMinutes(today.missions)
    assert.equal(total, getActivityMinutes(today.missions.main.activityId) +
        getActivityMinutes(today.missions.review.activityId))
    assert.ok(total < getTotalPlanMinutes())
    assert.ok(total >= 15)
    assert.ok(total <= 30)
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

test("each daily pick is deterministic and never repeats yesterday's activity", () => {
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

test("two different missions are created per day and each keeps its own slot", () => {
    const now = new Date(2026, 10, 19, 9, 0)
    const first = ensureDailyMissions(normalizeDailyState(null), {
        dateKey: "2026-11-19", now, targets: AI_TARGETS
    })
    assert.equal(first.created, true)
    assert.equal(first.missions.main.slot, MAIN_SLOT)
    assert.equal(first.missions.review.slot, REVIEW_SLOT)
    assert.ok(MAIN_ACTIVITY_IDS.includes(first.missions.main.activityId))
    assert.ok(REVIEW_ACTIVITY_IDS.includes(first.missions.review.activityId))
    assert.notEqual(first.missions.main.activityId, first.missions.review.activityId)
    assert.equal(first.state.history.length, 2)

    const repeated = ensureDailyMissions(first.state, { dateKey: "2026-11-19", now, targets: AI_TARGETS })
    assert.equal(repeated.created, false)
    assert.equal(repeated.missions.main.activityId, first.missions.main.activityId)
    assert.equal(repeated.missions.review.activityId, first.missions.review.activityId)
    assert.equal(repeated.state.history.length, 2)
})

test("the two missions of a day alternate with the previous day", () => {
    let state = normalizeDailyState(null)
    const previousBySlot = {}
    for (let day = 18; day <= 24; day += 1) {
        const dateKey = `2026-11-${String(day).padStart(2, "0")}`
        const ensured = ensureDailyMissions(state, {
            dateKey, now: new Date(2026, 10, day, 9, 0), targets: AI_TARGETS
        })
        state = ensured.state
        for (const slot of [MAIN_SLOT, REVIEW_SLOT]) {
            if (previousBySlot[slot]) {
                assert.notEqual(ensured.missions[slot].activityId, previousBySlot[slot])
            }
            previousBySlot[slot] = ensured.missions[slot].activityId
        }
        assert.notEqual(ensured.missions.main.activityId, ensured.missions.review.activityId)
    }
})

test("reviewing requires real interactions before scoring and schedules at least one day ahead", () => {
    const now = new Date(2026, 10, 19, 9, 0)
    const created = ensureDailyMissions(normalizeDailyState(null), {
        dateKey: "2026-11-19", now, targets: AI_TARGETS
    })
    let state = created.state
    const dateKey = "2026-11-19"
    const main = created.missions.main

    const invalid = recordCommitment(state, dateKey, MAIN_SLOT, "lo haré luego", now)
    assert.equal(invalid.valid, false)
    const committed = recordCommitment(state, dateKey, MAIN_SLOT, "Estudiaré " + getActivity(main.activityId).label, now)
    assert.equal(committed.valid, true)
    state = committed.state

    const missingRecall = recordCompletion(state, dateKey, MAIN_SLOT, { grade: "good", recall: " " }, now)
    assert.equal(missingRecall.recorded, false)

    for (let index = 0; index < MIN_REAL_INTERACTIONS - 1; index += 1) {
        state = recordInteraction(state, dateKey, MAIN_SLOT, now).state
    }
    const tooFew = recordCompletion(state, dateKey, MAIN_SLOT, { grade: "good", recall: "reasonable" }, now)
    assert.equal(tooFew.recorded, false)

    state = recordInteraction(state, dateKey, MAIN_SLOT, now).state
    assert.equal(findMission(state, dateKey, MAIN_SLOT).interactions, MIN_REAL_INTERACTIONS)
    const completed = recordCompletion(state, dateKey, MAIN_SLOT, { grade: "good", recall: "reasonable" }, now)
    assert.equal(completed.recorded, true)
    assert.equal(completed.mission.grade, "good")
    assert.ok(new Date(completed.card.nextReviewAt).getTime() - now.getTime() >= 24 * 60 * 60 * 1000 - 1000)

    const restarted = resetMission(completed.state, dateKey, MAIN_SLOT)
    assert.equal(restarted.reset, true)
    assert.equal(restarted.mission.commitmentAt, null)
    assert.equal(restarted.mission.completedAt, null)
    assert.equal(restarted.mission.interactions, 0)
    assert.equal(recordCommitment(restarted.state, dateKey, MAIN_SLOT, "Estudiaré otro", now).valid, true)

    const untouchedReview = findMission(completed.state, dateKey, REVIEW_SLOT)
    assert.equal(untouchedReview.completedAt, null)
})

test("each AI query has its own review card and new queries join the rotation", () => {
    const now = new Date(2026, 10, 19, 9, 0)
    const dateKey = "2026-11-19"
    const withAi = normalizeDailyState({
        history: [{
            date: dateKey,
            slot: REVIEW_SLOT,
            activityId: "ai",
            targetId: "q1",
            targetLabel: "Phasal verbs"
        }]
    })
    assert.deepEqual(findDailyMissions(withAi, dateKey).review.targetId, "q1")

    const same = refreshMissionTarget(withAi, dateKey, AI_TARGETS, now)
    assert.equal(same.changed, false)
    assert.equal(same.mission.targetId, "q1")

    const newQueries = [{ id: "q4", label: "Consulta nueva" }]
    const rotated = refreshMissionTarget(withAi, dateKey, newQueries, now)
    assert.equal(rotated.changed, true)
    assert.equal(rotated.mission.targetId, "q4")
    assert.equal(rotated.mission.targetLabel, "Consulta nueva")

    const nextTarget = chooseDailyTarget({ targets: [...newQueries, ...AI_TARGETS], previousId: "q4", random: () => 0.9 })
    assert.ok(nextTarget)
    assert.notEqual(nextTarget.id, "q4")

    let state = rotated.state
    state = recordCommitment(state, dateKey, REVIEW_SLOT, "Estudiaré IA", now).state
    for (let index = 0; index < MIN_REAL_INTERACTIONS; index += 1) {
        state = recordInteraction(state, dateKey, REVIEW_SLOT, now).state
    }
    const completed = recordCompletion(state, dateKey, REVIEW_SLOT, { grade: "easy", recall: "repasar phasal verbs" }, now)
    assert.equal(completed.recorded, true)
    assert.equal(completed.cardKey, "ai:q4")
    assert.ok(completed.state.cards["ai:q4"])
    assert.equal(completed.state.cards.ai, undefined)
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
