import { normalizeSentence } from "./model.js"

const SENTENCES_TABLE = "my_sentences"
const ATTEMPTS_TABLE = "my_sentence_exercise_attempts"

export function createSentenceRepository(supabase) {
    async function checked(query) {
        const { data, error } = await query
        if (error) throw error
        return data
    }

    return {
        async list(userId) {
            const rows = await checked(
                supabase.from(SENTENCES_TABLE).select("*").eq("user_id", userId).order("created_at", { ascending: false })
            )
            return rows.map(normalizeSentence)
        },
        async save(userId, sentence, id = null) {
            const values = {
                user_id: userId,
                english_text: sentence.englishText.trim(),
                spanish_translation: sentence.spanishTranslation.trim() || null,
                topic_tags: sentence.topicTags,
                reason_for_saving: sentence.reasonForSaving,
                grammar_pattern: sentence.grammarPattern.trim() || null
            }
            const query = id
                ? supabase.from(SENTENCES_TABLE).update(values).eq("id", id).eq("user_id", userId).select().single()
                : supabase.from(SENTENCES_TABLE).insert(values).select().single()
            return normalizeSentence(await checked(query))
        },
        async remove(userId, id) {
            await checked(supabase.from(SENTENCES_TABLE).delete().eq("id", id).eq("user_id", userId))
        },
        async updateReview(userId, id, state) {
            const values = {
                review_box: state.reviewBox,
                next_review_at: state.nextReviewAt,
                total_attempts: state.totalAttempts,
                total_failures: state.totalFailures,
                consecutive_successes: state.consecutiveSuccesses,
                last_reviewed_at: state.lastReviewedAt
            }
            const row = await checked(
                supabase.from(SENTENCES_TABLE).update(values).eq("id", id).eq("user_id", userId).select().single()
            )
            return normalizeSentence(row)
        },
        async recordExerciseAttempt(userId, sentenceId, attempt) {
            return checked(supabase.from(ATTEMPTS_TABLE).insert({
                user_id: userId,
                sentence_id: sentenceId,
                exercise_type: attempt.exerciseType,
                user_answer: attempt.userAnswer,
                is_correct: attempt.isCorrect,
                was_answer_revealed: attempt.wasAnswerRevealed,
                difficulty_rating: attempt.difficultyRating
            }).select().single())
        },
        async getExerciseAttempts(userId) {
            return checked(
                supabase.from(ATTEMPTS_TABLE).select("id,sentence_id,exercise_type,user_answer,is_correct,was_answer_revealed,difficulty_rating,attempted_at")
                    .eq("user_id", userId).order("attempted_at", { ascending: false })
            )
        }
    }
}
