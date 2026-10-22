export const DEFAULT_REVIEW_INTERVALS = Object.freeze({
    1: 1,
    2: 3,
    3: 7,
    mastered: 30
})

export function scheduleReview(sentence, remembered, now = new Date(), intervals = DEFAULT_REVIEW_INTERVALS) {
    const next = { ...sentence }
    next.totalAttempts = (sentence.totalAttempts || 0) + 1
    next.lastReviewedAt = now.toISOString()

    if (!remembered) {
        next.reviewBox = 1
        next.totalFailures = (sentence.totalFailures || 0) + 1
        next.consecutiveSuccesses = 0
        next.nextReviewAt = addDays(now, intervals[1]).toISOString()
        return next
    }

    next.consecutiveSuccesses = (sentence.consecutiveSuccesses || 0) + 1
    if (sentence.reviewBox === "mastered") {
        next.reviewBox = "mastered"
        next.nextReviewAt = addDays(now, intervals.mastered).toISOString()
    } else if (sentence.reviewBox >= 3) {
        next.reviewBox = "mastered"
        next.nextReviewAt = addDays(now, intervals.mastered).toISOString()
    } else {
        next.reviewBox = Math.max(1, sentence.reviewBox || 1) + 1
        next.nextReviewAt = addDays(now, intervals[next.reviewBox]).toISOString()
    }
    return next
}

export function isDue(sentence, now = new Date()) {
    return new Date(sentence.nextReviewAt).getTime() <= now.getTime()
}

function addDays(date, days) {
    const result = new Date(date)
    result.setDate(result.getDate() + days)
    return result
}
