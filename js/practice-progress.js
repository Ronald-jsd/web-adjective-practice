/* Progreso de práctica local-first.
 *
 * - Cada intento se guarda en IndexedDB y en la cola de sincronización.
 * - Al cargar se combina la copia local (localStorage + IndexedDB) con la
 *   nube; gana el último repaso (`last_reviewed_at`).
 * - Sin conexión no se pierde nada: la cola sube los cambios al reconectar.
 */

import {
    cacheRow,
    cacheRowsPreservingPending,
    readCachedRows,
    TABLES
} from "./offline/cache.js"
import { queueChange, isOnline } from "./offline/sync.js"

const TABLE = "vocabulary_practice_progress"

function cacheId(userId, itemId) {
    return `${userId}|${itemId}`
}

export function createPracticeProgressSync(supabase, userId) {
    if (!supabase || !userId) throw new Error("Supabase and a signed-in user are required.")

    return {
        async loadAndMerge(localProgress) {
            let remoteRows = null

            if (isOnline()) {
                try {
                    const { data, error } = await supabase
                        .from(TABLE)
                        .select("item_id,attempts,correct,repetitions,interval_days,ease,due_at,lapses,last_reviewed_at")
                        .eq("user_id", userId)
                    if (error) throw error

                    remoteRows = data || []
                    const withMeta = remoteRows.map(row => ({
                        ...row,
                        user_id: userId,
                        cache_id: cacheId(userId, row.item_id)
                    }))
                    await cacheRowsPreservingPending(TABLES.practiceProgress, withMeta, "cache_id")
                } catch (error) {
                    console.warn("[offline] Progreso de práctica: se usa la copia local.", error)
                }
            }

            if (!remoteRows) {
                remoteRows = await readCachedRows(
                    TABLES.practiceProgress,
                    row => row.user_id === userId
                )
            } else {
                // Añade cambios locales que aún no están en la nube.
                const cached = await readCachedRows(
                    TABLES.practiceProgress,
                    row => row.user_id === userId
                )
                const byId = new Map(remoteRows.map(row => [String(row.item_id), row]))
                for (const row of cached) {
                    const key = String(row.item_id)
                    if (!byId.has(key)) byId.set(key, row)
                }
                remoteRows = [...byId.values()]
            }

            const remoteById = new Map(
                remoteRows.map(row => [String(row.item_id), fromDatabase(row)])
            )

            const merged = { ...localProgress }
            const pendingWrites = []

            for (const [itemId, remoteProgress] of remoteById) {
                const local = localProgress[itemId]
                if (!local || getLastReviewedAt(local) <= getLastReviewedAt(remoteProgress)) {
                    merged[itemId] = remoteProgress
                } else {
                    pendingWrites.push({ itemId, progress: local })
                }
            }

            for (const [itemId, local] of Object.entries(localProgress)) {
                if (!remoteById.has(String(itemId))) {
                    pendingWrites.push({ itemId, progress: local })
                }
            }

            for (const { itemId, progress } of pendingWrites) {
                await persist(supabase, userId, itemId, progress)
            }

            return merged
        },

        async save(itemId, progress) {
            await persist(supabase, userId, itemId, progress)
        }
    }
}

async function persist(supabase, userId, itemId, progress) {
    const id = cacheId(userId, itemId)
    const row = toDatabase(userId, itemId, progress)
    await cacheRow(TABLES.practiceProgress, id, { ...row, cache_id: id })

    if (isOnline()) {
        try {
            const { error } = await supabase
                .from(TABLE)
                .upsert(row, { onConflict: "user_id,item_id" })
            if (!error) return
            console.warn("[offline] No se pudo subir el progreso; queda en la cola.", error)
        } catch (error) {
            console.warn("[offline] No se pudo subir el progreso; queda en la cola.", error)
        }
    }

    await queueChange({
        table: TABLE,
        action: "upsert",
        payload: row,
        conflict: "user_id,item_id",
        localId: id,
        description: "Progreso de práctica"
    })
}

function fromDatabase(row) {
    return {
        attempts: row.attempts,
        correct: row.correct,
        repetitions: row.repetitions,
        intervalDays: Number(row.interval_days),
        ease: Number(row.ease),
        dueAt: row.due_at ? new Date(row.due_at).getTime() : 0,
        lapses: row.lapses,
        lastReviewedAt: row.last_reviewed_at ? new Date(row.last_reviewed_at).getTime() : 0
    }
}

function toDatabase(userId, itemId, progress) {
    return {
        user_id: userId,
        item_id: itemId,
        attempts: progress.attempts || 0,
        correct: progress.correct || 0,
        repetitions: progress.repetitions || 0,
        interval_days: progress.intervalDays || 0,
        ease: progress.ease || 2.5,
        due_at: new Date(progress.dueAt || 0).toISOString(),
        lapses: progress.lapses || 0,
        last_reviewed_at: progress.lastReviewedAt
            ? new Date(progress.lastReviewedAt).toISOString()
            : null
    }
}

function getLastReviewedAt(progress) {
    const value = progress.lastReviewedAt || 0
    const timestamp = typeof value === "number" ? value : new Date(value).getTime()
    return Number.isFinite(timestamp) ? timestamp : 0
}
