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
import { queueChange, isOnline } from "../offline/sync.js"
import { generateLocalIntegerId, generateUuid, isLocalIntegerId } from "../offline/ids.js"

const SENTENCES_TABLE = "my_sentences"
const VOCABULARY_TABLE = "user_custom_items"
const REVIEW_LOG_TABLE = "my_sentence_review_logs"
const REVIEW_CARD_TABLE = "my_sentence_review_cards"

const SENTENCE_COLUMNS = "id,english_text,spanish_translation,topic_tags,reason_for_saving,grammar_pattern,grammar_pattern_translation,notes,review_box,memory_state,interval_days,ease_factor,repetitions,lapses,learning_step,last_grade,next_review_at,total_attempts,total_failures,consecutive_successes,last_reviewed_at,created_at,updated_at"
const REVIEW_CARD_COLUMNS = "id,user_id,my_sentence_id,direction,memory_state,interval_days,ease_factor,repetitions,lapses,learning_step,last_grade,total_attempts,total_failures,next_review_at,consecutive_successes,last_reviewed_at,created_at,updated_at"
const REVIEW_LOG_COLUMNS = "id,user_id,my_sentence_id,card_id,direction,grade,reviewed_at,previous_state,next_state,previous_interval_days,next_interval_days,total_attempts,total_failures"
const VOCABULARY_COLUMNS = "id,word,pronunciation,spanish,example_en,example_es,notes,category,subcategory,created_at"

const ONE_DAY_MS = 24 * 60 * 60 * 1000

function normalizeReviewCardRecord(card, sentence) {
    const base = sentence || {}
    return {
        ...base,
        id: card.id,
        sentenceId: card.my_sentence_id || card.sentenceId,
        direction: card.direction,
        memoryState: card.memory_state || base.memoryState || "new",
        intervalDays: Number(card.interval_days ?? base.intervalDays ?? 0),
        easeFactor: Number(card.ease_factor ?? base.easeFactor ?? 2.5),
        repetitions: Number(card.repetitions ?? base.repetitions ?? 0),
        lapses: Number(card.lapses ?? base.lapses ?? 0),
        learningStep: Number(card.learning_step ?? base.learningStep ?? 0),
        lastGrade: card.last_grade || base.lastGrade || null,
        nextReviewAt: card.next_review_at || base.nextReviewAt,
        totalAttempts: Number(card.total_attempts ?? base.totalAttempts ?? 0),
        totalFailures: Number(card.total_failures ?? base.totalFailures ?? 0),
        consecutiveSuccesses: Number(card.consecutive_successes ?? base.consecutiveSuccesses ?? 0),
        lastReviewedAt: card.last_reviewed_at || base.lastReviewedAt || null,
        createdAt: card.created_at || base.createdAt || null,
        updatedAt: card.updated_at || base.updatedAt || null
    }
}

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
            if (!isOnline()) {
                const cached = await readCachedRows(TABLES.sentences, row => row.user_id === userId)
                return sortByCreatedAtDesc(cached).map(normalizeSentence)
            }
            try {
                const rows = await checked(
                    supabase.from(SENTENCES_TABLE)
                        .select(SENTENCE_COLUMNS)
                        .eq("user_id", userId)
                        .order("created_at", { ascending: false })
                )
                const withUser = (rows || []).map(row => ({ ...row, user_id: userId }))
                const finalRows = await cacheRowsPreservingPending(TABLES.sentences, withUser)
                return sortByCreatedAtDesc(finalRows).map(normalizeSentence)
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
            if (!isOnline()) {
                const cached = await readCachedRows(
                    TABLES.customItems,
                    row => row.user_id === userId && row.subcategory === "Mi vocabulario"
                )
                return sortByCreatedAtDesc(cached)
            }
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
                const finalRows = await cacheRowsPreservingPending(
                    TABLES.customItems,
                    withUser,
                    "id",
                    { replace: false }
                )
                return sortByCreatedAtDesc(finalRows.filter(
                    row => row.user_id === userId && row.subcategory === "Mi vocabulario"
                ))
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

            if (isOnline()) {
                try {
                    // Con conexión se guarda directamente en la nube para
                    // obtener el id definitivo; si falla, queda en la cola.
                    const saved = await checked(
                        supabase.from(VOCABULARY_TABLE)
                            .insert(values)
                            .select(VOCABULARY_COLUMNS)
                            .single()
                    )
                    const withUser = { ...saved, user_id: userId }
                    await cacheRow(TABLES.customItems, withUser.id, withUser)
                    return withUser
                } catch (error) {
                    console.warn(
                        "[offline] No se pudo guardar el vocabulario en la nube; se guarda en el dispositivo.",
                        error
                    )
                }
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
                grammar_pattern_translation: String(sentence.grammarPatternTranslation || "").trim() || null,
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
                memory_state: "new",
                interval_days: 0,
                ease_factor: 2.5,
                repetitions: 0,
                lapses: 0,
                learning_step: 0,
                last_grade: null,
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
            const cards = await readCachedRows(TABLES.reviewCards, row => row && String(row.my_sentence_id || row.mySentenceId || "") === String(id))
            for (const card of cards) await removeCachedRow(TABLES.reviewCards, card.id)
            const logs = await readCachedRows(TABLES.reviewLogs, row => row && String(row.my_sentence_id || row.mySentenceId || row.sentenceId || "") === String(id))
            for (const log of logs) await removeCachedRow(TABLES.reviewLogs, log.id)
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
                memory_state: state.memoryState,
                interval_days: state.intervalDays,
                ease_factor: state.easeFactor,
                repetitions: state.repetitions,
                lapses: state.lapses,
                learning_step: state.learningStep,
                last_grade: state.lastGrade,
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
        },

        /* Los intentos de repaso también se leen del espejo local; así la
         * práctica puede mostrar actividad y precisión del día sin conexión. */
        async listReviewLogs(userId) {
            const normalizeLog = row => row && ({
                id: row.id,
                sentenceId: row.my_sentence_id || row.sentenceId,
                cardId: row.card_id || row.cardId || null,
                direction: row.direction || "forward",
                grade: row.grade,
                reviewedAt: row.reviewed_at || row.reviewedAt,
                previousState: row.previous_state || row.previousState || "new",
                nextState: row.next_state || row.nextState || "learning",
                previousIntervalDays: Number(row.previous_interval_days || row.previousIntervalDays || 0),
                nextIntervalDays: Number(row.next_interval_days || row.nextIntervalDays || 0),
                totalAttempts: Number(row.total_attempts || row.totalAttempts || 1),
                totalFailures: Number(row.total_failures || row.totalFailures || 0)
            })
            if (!isOnline()) {
                const cached = await readCachedRows(TABLES.reviewLogs, row => row && row.user_id === userId)
                return cached.map(normalizeLog).filter(Boolean).sort((left, right) => new Date(right.reviewedAt || 0) - new Date(left.reviewedAt || 0))
            }
            try {
                const { data, error } = await supabase
                    .from(REVIEW_LOG_TABLE)
                    .select(REVIEW_LOG_COLUMNS)
                    .eq("user_id", userId)
                    .order("reviewed_at", { ascending: false })
                    .limit(500)
                if (error) throw error
                const withUser = (data || []).map(row => ({ ...row, user_id: row.user_id || userId }))
                const merged = await cacheRowsPreservingPending(TABLES.reviewLogs, withUser)
                return merged.filter(row => row.user_id === userId)
                    .map(normalizeLog)
                    .sort((left, right) => new Date(right.reviewedAt || 0) - new Date(left.reviewedAt || 0))
            } catch (error) {
                console.warn("[offline] Historial de repasos cargado desde el dispositivo:", error?.message || error)
                const cached = await readCachedRows(TABLES.reviewLogs, row => row && row.user_id === userId)
                return cached.map(normalizeLog).filter(Boolean)
            }
        },

        async appendReviewLog(userId, sentence, grade, result) {
            const now = new Date().toISOString()
            const row = {
                id: generateUuid(),
                user_id: userId,
                my_sentence_id: sentence.sentenceId || sentence.id,
                card_id: sentence.cardId || sentence.id,
                direction: sentence.direction || "forward",
                grade,
                reviewed_at: now,
                previous_state: sentence.memoryState || "new",
                next_state: result.memoryState,
                previous_interval_days: Number(sentence.intervalDays || 0),
                next_interval_days: Number(result.intervalDays || 0),
                total_attempts: Number(result.totalAttempts || 1),
                total_failures: Number(result.totalFailures || 0)
            }
            await cacheRow(TABLES.reviewLogs, row.id, row)
            await queueChange({
                table: TABLES.reviewLogs,
                action: "upsert",
                payload: row,
                conflict: "id",
                localId: row.id,
                description: "Guardar intento de repaso"
            })
            return {
                id: row.id,
                sentenceId: row.my_sentence_id,
                cardId: row.card_id,
                direction: row.direction,
                grade: row.grade,
                reviewedAt: row.reviewed_at,
                previousState: row.previous_state,
                nextState: row.next_state,
                previousIntervalDays: row.previous_interval_days,
                nextIntervalDays: row.next_interval_days,
                totalAttempts: row.total_attempts,
                totalFailures: row.total_failures
            }
        },

        async listReviewCards(userId, sentences) {
            const bySentence = new Map((sentences || []).map(sentence => [String(sentence.id), sentence]))
            const cached = await readCachedRows(TABLES.reviewCards, row => row && row.user_id === userId)
            let rows = cached
            if (isOnline()) {
                try {
                    const { data, error } = await supabase
                        .from(REVIEW_CARD_TABLE)
                        .select(REVIEW_CARD_COLUMNS)
                        .eq("user_id", userId)
                        .order("created_at", { ascending: true })
                    if (error) throw error
                    const withUser = (data || []).map(row => ({ ...row, user_id: row.user_id || userId }))
                    rows = await cacheRowsPreservingPending(TABLES.reviewCards, withUser)
                } catch (error) {
                    console.warn("[offline] Tarjetas de repaso cargadas desde el dispositivo:", error?.message || error)
                }
            }

            const existing = new Set(rows.map(row => `${row.my_sentence_id}:${row.direction}`))
            for (const sentence of sentences || []) {
                for (const direction of ["forward", "reverse"]) {
                    if (existing.has(`${sentence.id}:${direction}`)) continue
                    const now = new Date().toISOString()
                    const row = {
                        id: generateUuid(),
                        user_id: userId,
                        my_sentence_id: sentence.id,
                        direction,
                        memory_state: direction === "forward" ? (sentence.memoryState || "new") : "new",
                        interval_days: direction === "forward" ? Number(sentence.intervalDays || 0) : 0,
                        ease_factor: direction === "forward" ? Number(sentence.easeFactor || 2.5) : 2.5,
                        repetitions: direction === "forward" ? Number(sentence.repetitions || 0) : 0,
                        lapses: direction === "forward" ? Number(sentence.lapses || 0) : 0,
                        learning_step: direction === "forward" ? Number(sentence.learningStep || 0) : 0,
                        last_grade: direction === "forward" ? (sentence.lastGrade || null) : null,
                        total_attempts: direction === "forward" ? Number(sentence.totalAttempts || 0) : 0,
                        total_failures: direction === "forward" ? Number(sentence.totalFailures || 0) : 0,
                        next_review_at: direction === "forward" ? (sentence.nextReviewAt || now) : now,
                        consecutive_successes: direction === "forward" ? Number(sentence.consecutiveSuccesses || 0) : 0,
                        last_reviewed_at: direction === "forward" ? (sentence.lastReviewedAt || null) : null,
                        created_at: now,
                        updated_at: now
                    }
                    await cacheRow(TABLES.reviewCards, row.id, row)
                    await queueChange({ table: TABLES.reviewCards, action: "upsert", payload: row, conflict: "id", localId: row.id, description: "Crear tarjeta de repaso" })
                    rows.push(row)
                    existing.add(`${sentence.id}:${direction}`)
                }
            }

            return rows
                .filter(row => row && row.user_id === userId && bySentence.has(String(row.my_sentence_id)))
                .map(row => normalizeReviewCardRecord(row, bySentence.get(String(row.my_sentence_id))))
        },

        async updateReviewCard(userId, id, state) {
            const values = {
                memory_state: state.memoryState,
                interval_days: state.intervalDays,
                ease_factor: state.easeFactor,
                repetitions: state.repetitions,
                lapses: state.lapses,
                learning_step: state.learningStep,
                last_grade: state.lastGrade,
                next_review_at: state.nextReviewAt,
                total_attempts: state.totalAttempts,
                total_failures: state.totalFailures,
                consecutive_successes: state.consecutiveSuccesses,
                last_reviewed_at: state.lastReviewedAt
            }
            const now = new Date().toISOString()
            const cached = await readCachedRow(TABLES.reviewCards, id)

            if (cached) {
                const merged = { ...cached, ...values, id: cached.id ?? id, updated_at: now }
                await cacheRow(TABLES.reviewCards, id, merged)
                await queueChange({ table: TABLES.reviewCards, action: "update", payload: values, match: { id, user_id: userId }, localId: id, description: "Guardar repaso" })
                const sentences = await readCachedRows(TABLES.sentences, row => row && row.user_id === userId)
                return normalizeReviewCardRecord(merged, sentences.find(row => String(row.id) === String(merged.my_sentence_id)))
            }

            try {
                const row = await checked(
                    supabase.from(REVIEW_CARD_TABLE)
                        .update(values)
                        .eq("id", id)
                        .eq("user_id", userId)
                        .select(REVIEW_CARD_COLUMNS)
                        .single()
                )
                const withUser = { ...row, user_id: userId }
                await cacheRow(TABLES.reviewCards, id, withUser)
                const sentences = await readCachedRows(TABLES.sentences, row => row && row.user_id === userId)
                return normalizeReviewCardRecord(withUser, sentences.find(item => String(item.id) === String(withUser.my_sentence_id)))
            } catch (error) {
                await queueChange({ table: TABLES.reviewCards, action: "update", payload: values, match: { id, user_id: userId }, localId: id, description: "Guardar repaso" })
                return normalizeReviewCardRecord({ ...values, id, user_id: userId, updated_at: now }, null)
            }
        }
    }
}
