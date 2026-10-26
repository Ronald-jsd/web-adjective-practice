import { normalizeSentence } from "./model.js"

const SENTENCES_TABLE = "my_sentences"

export function createSentenceRepository(supabase) {
    async function checked(query) {
        const { data, error } = await query
        if (error) throw error
        return data
    }

    return {
        async list(userId) {
            const rows = await checked(
                supabase.from(SENTENCES_TABLE)
                    .select("id,english_text,spanish_translation,topic_tags,reason_for_saving,grammar_pattern,notes,review_box,next_review_at,total_attempts,total_failures,consecutive_successes,last_reviewed_at,created_at,updated_at")
                    .eq("user_id", userId)
                    .order("created_at", { ascending: false })
            )
            return rows.map(normalizeSentence)
        },
        async listVocabulary(userId) {
            return checked(
                supabase.from("user_custom_items")
                    .select("id,word,pronunciation,spanish,example_en,example_es,notes,category,subcategory,created_at")
                    .eq("user_id", userId)
                    .eq("subcategory", "Mi vocabulario")
                    .order("created_at", { ascending: false })
            )
        },
        async saveVocabulary(userId, vocabulary, id = null, category = "Mis Expresiones") {
            const values = {
                user_id: userId,
                word: vocabulary.word.trim(),
                pronunciation: vocabulary.pronunciation.trim(),
                spanish: vocabulary.spanish.trim(),
                example_en: vocabulary.exampleEn.trim(),
                example_es: vocabulary.exampleEs.trim(),
                notes: String(vocabulary.notes || "").trim() || null,
                category,
                subcategory: "Mi vocabulario"
            }
            const query = id
                ? supabase.from("user_custom_items").update(values).eq("id", id).eq("user_id", userId).select().single()
                : supabase.from("user_custom_items").insert(values).select().single()
            return checked(query)
        },
        async removeVocabulary(userId, id) {
            await checked(
                supabase.from("user_custom_items").delete().eq("id", id).eq("user_id", userId)
            )
        },
        async save(userId, sentence, id = null) {
            const values = {
                user_id: userId,
                english_text: sentence.englishText.trim(),
                spanish_translation: sentence.spanishTranslation.trim() || null,
                topic_tags: sentence.topicTags,
                reason_for_saving: sentence.reasonForSaving,
                grammar_pattern: sentence.grammarPattern.trim() || null,
                notes: String(sentence.notes || "").trim() || null
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
        }
    }
}
