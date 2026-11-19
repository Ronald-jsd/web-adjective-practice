const MINUTE_IN_MS = 60 * 1000
const DAY_IN_MS = 24 * 60 * 60 * 1000
const DEFAULT_LEARNING_STEPS = Object.freeze([1, 10])
const DEFAULT_EASE = 2.5
const MIN_EASE = 1.3
const MAX_EASE = 3.0
const EASY_BONUS = 1.4
const LAPSE_GRADUATION_FACTOR = 0.5

/* Todo en minutos para que las tarjetas nuevas no se salten directo a
 * "mañana" como hacía el sistema antiguo de casillas. */
export const DEFAULT_REVIEW_INTERVALS = Object.freeze({
    again: 0,
    firstStep: 1,
    secondStep: 10,
    easy: 4,
    good: 1,
    mastered: 30
})

export function addDays(date, days) {
    return new Date(Number(date) + Number(days) * DAY_IN_MS)
}

function addMinutes(date, minutes) {
    return new Date(Number(date) + Number(minutes) * MINUTE_IN_MS)
}

function roundDays(value, fallback = 1) {
    const number = Number(value)
    if (!Number.isFinite(number)) return fallback
    return Math.max(fallback, Math.min(36500, Math.round(number)))
}

function positiveNumber(value, fallback) {
    const number = Number(value)
    return Number.isFinite(number) ? number : fallback
}

function normalizeSentenceState(sentence) {
    const rawState = String(sentence.memoryState || sentence.memory_state || '').toLowerCase()
    const box = String(sentence.reviewBox || sentence.review_box || '1').toLowerCase()
    const inferred = rawState === 'new' || rawState === 'learning' || rawState === 'review' || rawState === 'relearning'
        ? rawState
        : box === 'mastered' || box === '3' || box === '2'
            ? 'review'
            : 'new'
    return {
        ...sentence,
        memoryState: inferred,
        intervalDays: positiveNumber(sentence.intervalDays ?? sentence.interval_days, box === 'mastered' ? 30 : box === '3' ? 7 : box === '2' ? 3 : 0),
        easeFactor: positiveNumber(sentence.easeFactor ?? sentence.ease_factor, DEFAULT_EASE),
        repetitions: Math.max(0, Math.floor(positiveNumber(sentence.repetitions ?? sentence.consecutive_successes, box === 'new' ? 0 : 1))),
        lapses: Math.max(0, Math.floor(positiveNumber(sentence.lapses, 0))),
        learningStep: Math.max(0, Math.floor(positiveNumber(sentence.learningStep ?? sentence.learning_step, inferred === 'new' ? 0 : 1)))
    }
}

function baseFields(sentence, now) {
    const state = normalizeSentenceState(sentence)
    return {
        totalAttempts: Math.max(0, Math.floor(positiveNumber(state.totalAttempts ?? state.total_attempts, 0))) + 1,
        lastReviewedAt: now.toISOString(),
        easeFactor: state.easeFactor,
        intervalDays: state.intervalDays,
        repetitions: state.repetitions,
        lapses: state.lapses,
        learningStep: state.learningStep,
        memoryState: state.memoryState
    }
}

function graduated(sentence, grade, next) {
    return {
        ...sentence,
        ...next,
        consecutiveSuccesses: next.repetitions,
        reviewBox: next.memoryState === 'review' ? 'mastered' : '1'
    }
}

/* Escribe el mismo calendario que Anki: nuevas en learningsteps, revisadas
 * con SM-2 modificado y lapsos que vuelven a relearning. */
function getLearningSteps(options = {}) {
    const candidate = Array.isArray(options.learningSteps) ? options.learningSteps : DEFAULT_LEARNING_STEPS
    const steps = candidate.map(value => Number(value)).filter(value => Number.isFinite(value) && value > 0 && value <= 1440)
    return steps.length ? steps.slice(0, 8) : [...DEFAULT_LEARNING_STEPS]
}

export function scheduleReview(sentence, grade, now = new Date(), options = {}) {
    const learningSteps = getLearningSteps(options)
    const rawGrade = typeof grade === 'boolean' ? (grade ? 'good' : 'again') : String(grade || '').toLowerCase()
    const normalizedGrade = rawGrade === 'remembered' || rawGrade === 'good' ? 'good'
        : rawGrade === 'forgotten' || rawGrade === 'again' ? 'again'
        : ['again', 'hard', 'good', 'easy'].includes(rawGrade)
            ? rawGrade
            : 'again'
    const source = normalizeSentenceState(sentence)
    const fields = baseFields(source, now)
    const id = String(normalizedGrade)

    if (source.memoryState === 'new' || source.memoryState === 'learning') {
        if (id === 'again') {
            return graduated(source, id, {
                ...fields,
                memoryState: 'learning',
                easeFactor: source.memoryState === 'review' ? Math.max(MIN_EASE, source.easeFactor - 0.2) : source.easeFactor,
                intervalDays: 0,
                repetitions: 0,
                lapses: source.lapses,
                learningStep: 0,
                nextReviewAt: addMinutes(now, learningSteps[0]).toISOString(),
                totalFailures: source.totalFailures || 0,
                lastGrade: id
            })
        }
        if (id === 'hard') {
            return graduated(source, id, {
                ...fields,
                memoryState: 'learning',
                intervalDays: 0,
                repetitions: source.repetitions,
                learningStep: Math.max(1, source.learningStep),
                nextReviewAt: addMinutes(now, learningSteps[1] ?? learningSteps[0] ?? 10).toISOString(),
                lastGrade: id,
                totalFailures: source.totalFailures || 0
            })
        }
        if (id === 'easy') {
            return graduated(source, id, {
                ...fields,
                memoryState: 'review',
                easeFactor: Math.min(MAX_EASE, source.easeFactor + 0.15),
                intervalDays: 4,
                repetitions: 1,
                learningStep: 0,
                nextReviewAt: addDays(now, 4).toISOString(),
                lastGrade: id,
                totalFailures: source.totalFailures || 0
            })
        }
        const isNewCard = source.memoryState === 'new'
        if (isNewCard) {
            return graduated(source, id, {
                ...fields,
                memoryState: 'learning',
                intervalDays: 0,
                repetitions: 1,
                learningStep: 1,
                nextReviewAt: addMinutes(now, learningSteps[1] ?? learningSteps[0]).toISOString(),
                lastGrade: id,
                totalFailures: source.totalFailures || 0
            })
        }
        return graduated(source, id, {
            ...fields,
            memoryState: 'review',
            intervalDays: 1,
            repetitions: 1,
            learningStep: 0,
            nextReviewAt: addDays(now, 1).toISOString(),
            lastGrade: id,
            totalFailures: source.totalFailures || 0
        })
    }

    if (source.memoryState === 'relearning') {
        if (id === 'again') {
            return graduated(source, id, {
                ...fields,
                memoryState: 'relearning',
                easeFactor: Math.max(MIN_EASE, source.easeFactor - 0.2),
                repetitions: 0,
                lapses: source.lapses + 1,
                learningStep: 0,
                intervalDays: source.intervalDays,
                nextReviewAt: addMinutes(now, learningSteps[0]).toISOString(),
                totalFailures: source.totalFailures || 0,
                lastGrade: id
            })
        }
        if (id === 'hard') {
            return graduated(source, id, {
                ...fields,
                memoryState: 'relearning',
                learningStep: Math.max(1, source.learningStep),
                intervalDays: source.intervalDays,
                nextReviewAt: addMinutes(now, learningSteps[1] ?? learningSteps[0]).toISOString(),
                lastGrade: id,
                totalFailures: source.totalFailures || 0
            })
        }
        if (id === 'easy') {
            return graduated(source, id, {
                ...fields,
                memoryState: 'review',
                easeFactor: Math.min(MAX_EASE, source.easeFactor + 0.15),
                intervalDays: roundDays(Math.max(source.intervalDays * source.easeFactor, 1), 1),
                repetitions: Math.max(1, source.repetitions),
                learningStep: 0,
                nextReviewAt: addDays(now, roundDays(Math.max(source.intervalDays * source.easeFactor, 1), 1)).toISOString(),
                lastGrade: id,
                totalFailures: source.totalFailures || 0
            })
        }
        return graduated(source, id, {
            ...fields,
            memoryState: 'review',
            intervalDays: roundDays(Math.max(source.intervalDays * LAPSE_GRADUATION_FACTOR, 1), 1),
            repetitions: 1,
            learningStep: 0,
            nextReviewAt: addDays(now, roundDays(Math.max(source.intervalDays * LAPSE_GRADUATION_FACTOR, 1), 1)).toISOString(),
            lastGrade: id,
            totalFailures: source.totalFailures || 0
        })
    }

    if (id === 'again') {
        return graduated(source, id, {
            ...fields,
            memoryState: 'relearning',
            easeFactor: Math.max(MIN_EASE, source.easeFactor - 0.2),
            repetitions: 0,
            lapses: source.lapses + 1,
            learningStep: 0,
            intervalDays: source.intervalDays,
            nextReviewAt: addMinutes(now, learningSteps[0]).toISOString(),
            totalFailures: source.totalFailures || 0,
            lastGrade: id
        })
    }
    if (id === 'hard') {
        const interval = roundDays(Math.max(source.intervalDays * 1.2, 1), 1)
        return graduated(source, id, {
            ...fields,
            memoryState: 'review',
            easeFactor: Math.max(MIN_EASE, source.easeFactor - 0.15),
            intervalDays: interval,
            repetitions: source.repetitions + 1,
            learningStep: 0,
            nextReviewAt: addDays(now, interval).toISOString(),
            lastGrade: id,
            totalFailures: source.totalFailures || 0
        })
    }
    if (id === 'easy') {
        const interval = roundDays(Math.max(source.intervalDays * source.easeFactor * EASY_BONUS, 4), 4)
        return graduated(source, id, {
            ...fields,
            memoryState: 'review',
            easeFactor: Math.min(MAX_EASE, source.easeFactor + 0.15),
            intervalDays: interval,
            repetitions: source.repetitions + 1,
            learningStep: 0,
            nextReviewAt: addDays(now, interval).toISOString(),
            lastGrade: id,
            totalFailures: source.totalFailures || 0
        })
    }
    const interval = roundDays(Math.max(source.intervalDays * source.easeFactor, 1), 1)
    return graduated(source, id, {
        ...fields,
        memoryState: 'review',
        intervalDays: interval,
        repetitions: source.repetitions + 1,
        learningStep: 0,
        nextReviewAt: addDays(now, interval).toISOString(),
        lastGrade: id,
        totalFailures: source.totalFailures || 0
    })
}

/* Devuelve una previsualización inocua para cada botón, como el intervalo
 * que aparece en Anki bajo Again/Hard/Good/Easy. */
export function previewReview(sentence, now = new Date(), options = {}) {
    return Object.fromEntries(['again', 'hard', 'good', 'easy'].map(grade => {
        const preview = scheduleReview(sentence, grade, now, options)
        const delay = new Date(preview.nextReviewAt).getTime() - new Date(now).getTime()
        return [grade, formatInterval(delay)]
    }))
}

export function isDue(sentence, now = new Date()) {
    return new Date(sentence.nextReviewAt).getTime() <= now.getTime()
}

export function sortReviewQueue(left, right, now = new Date()) {
    const byState = reviewStateRank(left) - reviewStateRank(right)
    if (byState) return byState
    const leftDue = new Date(left.nextReviewAt).getTime()
    const rightDue = new Date(right.nextReviewAt).getTime()
    if (leftDue !== rightDue) return leftDue - rightDue
    return String(left.id || '').localeCompare(String(right.id || ''))
}

function reviewStateRank(sentence) {
    const state = normalizeSentenceState(sentence).memoryState
    if (state === 'relearning') return 0
    if (state === 'learning') return 1
    if (state === 'review') return 2
    return 3
}

export function reviewStateLabel(sentence) {
    const state = normalizeSentenceState(sentence).memoryState
    const labels = {
        new: 'Nueva',
        learning: 'Aprendiendo',
        review: 'Repaso',
        relearning: 'Reaprender'
    }
    return labels[state] || 'Nueva'
}

export function formatInterval(milliseconds) {
    if (milliseconds <= 0) return 'ahora'
    const minutes = Math.round(milliseconds / MINUTE_IN_MS)
    if (minutes < 60) return `${Math.max(1, minutes)} min`
    const days = Math.round(milliseconds / DAY_IN_MS)
    if (days < 30) return `${days}d`
    if (days < 365) return `${Math.round(days / 30)} mes${days < 60 ? '' : 'es'}`
    return `${Math.round(days / 365)} años`
}
