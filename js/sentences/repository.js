import { normalizeSentence } from "./model.js"
import {
    cacheRow,
    cacheRows,
    cacheRowsPreservingPending,
    readCachedRow,
    readCachedRows,
    removeCachedRow,
    TABLES
} from "../offline/cache.js"
import { queueChange } from "../offline/sync.js"
import { generateLocalIntegerId, generateUuid, isLocalIntegerId } from "../offline/ids.js"

const SENTENCES_TABLE = "my_sentences"
const VOCABULARY_TABLE = "user_custom_items"

const SENTENCE_COLUMNS = "id,english_text,spanish_translation,topic_tags,reason_for_saving,grammar_pattern,notes,review_box,next_review_at,total_attempts,total_failures,consecutive_successes,last_reviewed_at,created_at,updated_at"
const VOCABULARY_COLUMNS = "id,word,pronunciation,spanish,example_en,example_es,notes,category,subcategory,created_at"

const ONE_DAY_MS = 24 * 60 * 60 * 1000

function numericId(value) {
    const number = Number(value)
    return Number.isFinite(number) ? number : value
}

function sortByCreatedAtDesc(rows) {
    return [...rows].sort((a, b) => {
        const left = new Date(a.created_at || 0).getTime()
        const right = new Date(b.created_at || 0).getTime()
        return right - left
    })
}

export function createSentenceRepository(supabase) {
    async function checked(query) {
        const { data, error } = await query
        if (error) throw error
        return data
    }

    return {
        async list(userId) {
            try {
                const rows = await checked(
                    supabase.from(SENTENCES_TABLE)
                        .select(SENTENCE_COLUMNS)
                        .eq("user_id", userId)
                        .order("created_at", { ascending: false })
                )
                const withUser = (rows || []).map(row => ({ ...row, user_id: userId }))
                await cacheRowsPreservingPending(TABLES.sentences, withUser)
                return sortByCreatedAtDesc(withUser).map(normalizeSentence)
            } catch (error) {
                const cached = await readCachedRows(TABLES.sentences, row => row.user_id === userId)
                if (cached.length) {
                    console.warn("[offline] Frases cargadas desde el dispositivo:", error?.message || error)
                    return sortByCreatedAtDesc(cached).map(normalizeSentence)
                }
                throw error
            }
        },

        async listVocabulary(userId) {
            try {
                const rows = await checked(
                    supabase.from(VOCABULARY_TABLE)
                        .select(VOCABULARY_COLUMNS)
                        .eq("user_id", userId)
                        .eq("subcategory", "Mi vocabulario")
                        .order("created_at", { ascending: false })
                )
                const withUser = (rows || []).map(row => ({ ...row, user_id: userId }))
                // Esta consulta solo trae "Mi vocabulario"; no debe borrar el
                // resto de elementos personales guardados en el dispositivo.
                await cacheRows(TABLES.customItems, withUser, "id", { replace: false })
                return sortByCreatedAtDesc(withUser)
            } catch (error) {
                const cached = await readCachedRows(
                    TABLES.customItems,
                    row => row.user_id === userId && row.subcategory === "Mi vocabulario"
                )
                if (cached.length) {
                    console.warn("[offline] Vocabulario cargado desde el dispositivo:", error?.message || error)
                    return sortByCreatedAtDesc(cached)
                }
                throw error
            }
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
            const now = new Date().toISOString()

            if (id) {
                const targetId = numericId(id)
                const cached = await readCachedRow(TABLES.customItems, targetId)
                const merged = {
                    ...(cached || {}),
                    ...values,
                    id: targetId,
                    created_at: cached?.created_at || now,
                    updated_at: now
                }
                await cacheRow(TABLES.customItems, targetId, merged)

                if (isLocalIntegerId(targetId)) {
                    // El elemento nació en este dispositivo: la nube aún no
                    // lo conoce, así que se envía completo.
                    await queueChange({
                        table: TABLES.customItems,
                        action: "upsert",
                        payload: merged,
                        conflict: "id",
                        localId: targetId,
                        description: "Guardar vocabulario"
                    })
                } else {
                    await queueChange({
                        table: TABLES.customItems,
                        action: "update",
                        payload: values,
                        match: { id: targetId, user_id: userId },
                        localId: targetId,
                        description: "Editar vocabulario"
                    })
                }
                return merged
            }

            const localId = generateLocalIntegerId()
            const row = {
                ...values,
                id: localId,
                created_at: now,
                updated_at: now
            }
            await cacheRow(TABLES.customItems, localId, row)
            await queueChange({
                table: TABLES.customItems,
                action: "upsert",
                payload: row,
                conflict: "id",
                localId,
                description: "Guardar vocabulario"
            })
            return row
        },

        async removeVocabulary(userId, id) {
            const targetId = numericId(id)
            await removeCachedRow(TABLES.customItems, targetId)
            await queueChange({
                table: TABLES.customItems,
                action: "delete",
                match: { id: targetId, user_id: userId },
                localId: targetId,
                description: "Eliminar vocabulario"
            })
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
            const now = new Date().toISOString()

            if (id) {
                const cached = await readCachedRow(TABLES.sentences, id)
                if (cached) {
                    const merged = { ...cached, ...values, id: cached.id ?? id, updated_at: now }
                    await cacheRow(TABLES.sentences, id, merged)
                    await queueChange({
                        table: TABLES.sentences,
                        action: "upsert",
                        payload: merged,
                        conflict: "id",
                        localId: id,
                        description: "Editar frase"
                    })
                    return normalizeSentence(merged)
                }

                try {
                    const row = await checked(
                        supabase.from(SENTENCES_TABLE)
                            .update(values)
                            .eq("id", id)
                            .eq("user_id", userId)
                            .select(SENTENCE_COLUMNS)
                            .single()
                    )
                    const withUser = { ...row, user_id: userId }
                    await cacheRow(TABLES.sentences, id, withUser)
                    return normalizeSentence(withUser)
                } catch (error) {
                    await queueChange({
                        table: TABLES.sentences,
                        action: "update",
                        payload: values,
                        match: { id, user_id: userId },
                        localId: id,
                        description: "Editar frase"
                    })
                    return normalizeSentence({ ...values, id, updated_at: now })
                }
            }

            const localId = generateUuid()
            const row = {
                ...values,
                id: localId,
                review_box: "1",
                next_review_at: new Date(Date.now() + ONE_DAY_MS).toISOString(),
                total_attempts: 0,
                total_failures: 0,
                consecutive_successes: 0,
                last_reviewed_at: null,
                created_at: now,
                updated_at: now
            }
            await cacheRow(TABLES.sentences, localId, row)
            await queueChange({
                table: TABLES.sentences,
                action: "upsert",
                payload: row,
                conflict: "id",
                localId,
                description: "Guardar frase"
            })
            return normalizeSentence(row)
        },

        async remove(userId, id) {
            await removeCachedRow(TABLES.sentences, id)
            await queueChange({
                table: TABLES.sentences,
                action: "delete",
                match: { id, user_id: userId },
                localId: id,
                description: "Eliminar frase"
            })
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
            const now = new Date().toISOString()
            const cached = await readCachedRow(TABLES.sentences, id)

            if (cached) {
                const merged = { ...cached, ...values, id: cached.id ?? id, updated_at: now }
                await cacheRow(TABLES.sentences, id, merged)
                await queueChange({
                    table: TABLES.sentences,
                    action: "update",
                    payload: values,
                    match: { id, user_id: userId },
                    localId: id,
                    description: "Guardar repaso"
                })
                return normalizeSentence(merged)
            }

            try {
                const row = await checked(
                    supabase.from(SENTENCES_TABLE)
                        .update(values)
                        .eq("id", id)
                        .eq("user_id", userId)
                        .select(SENTENCE_COLUMNS)
                        .single()
                )
                const withUser = { ...row, user_id: userId }
                await cacheRow(TABLES.sentences, id, withUser)
                return normalizeSentence(withUser)
            } catch (error) {
                await queueChange({
                    table: TABLES.sentences,
                    action: "update",
                    payload: values,
                    match: { id, user_id: userId },
                    localId: id,
                    description: "Guardar repaso"
                })
                return normalizeSentence({ ...values, id, user_id: userId, updated_at: now })
            }
        }
    }
}
