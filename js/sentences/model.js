export const TOPICS = [
    "Restaurant",
    "Shopping",
    "Work",
    "Job Interview",
    "Business",
    "Daily Life",
    "Travel",
    "Technology",
    "Grammar",
    "Other"
]

export const REASONS = [
    "I couldn't say it",
    "I made a mistake",
    "Useful expression"
]

export function validateSentence(value) {
    const text = String(value || "").trim()
    if (!text) return { valid: false, message: "Write an English sentence first." }

    const words = text.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g) || []
    const meaningfulExpression = /^(please|thank you|excuse me|good morning|good afternoon|good evening|how are you|see you|no problem|of course|you're welcome)\b/i.test(text)
    if (words.length < 2 && !meaningfulExpression) {
        return { valid: false, message: "Make a sentence with this word first." }
    }

    return { valid: true, message: "" }
}

export function suggestGrammarPattern(value) {
    const text = String(value || "").trim()
    if (/\b(if|unless)\b/i.test(text)) return "Conditional sentence"
    if (/\b(because|although|when|while|so that)\b/i.test(text)) return "Complex sentence"
    if (/\b(have|has)\s+\w+ed\b/i.test(text)) return "Present perfect"
    if (/\b(am|is|are|was|were)\s+\w+ing\b/i.test(text)) return "Continuous tense"
    if (/\b(will|might|could|should|would|can)\b/i.test(text)) return "Modal verb"
    if (/\b(did|went|saw|made|had|was|were|bought|thought|took)\b/i.test(text)) return "Simple past"
    if (/\b(am|is|are|do|does|have|has)\b/i.test(text)) return "Simple present"
    return ""
}

export function normalizeSentence(row) {
    return {
        id: row.id,
        englishText: row.english_text,
        spanishTranslation: row.spanish_translation || "",
        topicTags: row.topic_tags || [],
        reasonForSaving: row.reason_for_saving,
        grammarPattern: row.grammar_pattern || "",
        notes: row.notes || "",
        reviewBox: row.review_box,
        nextReviewAt: row.next_review_at,
        totalAttempts: row.total_attempts,
        totalFailures: row.total_failures,
        consecutiveSuccesses: row.consecutive_successes,
        lastReviewedAt: row.last_reviewed_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    }
}
