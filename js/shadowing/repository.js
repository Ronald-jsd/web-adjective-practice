import {
    cacheRow,
    cacheRowsPreservingPending,
    readCachedRows,
    removeCachedRow,
    TABLES
} from "../offline/cache.js"
import { isOnline, queueChange } from "../offline/sync.js"
import { generateUuid } from "../offline/ids.js"

const TABLE = TABLES.shadowingLessons
const COLUMNS = "id,user_id,video_url,video_id,title,source,transcript,created_at,updated_at"

function sortDescending(rows) {
    return [...rows].sort((left, right) => new Date(right.created_at || 0) - new Date(left.created_at || 0))
}

export function normalizeShadowingLesson(row) {
    if (!row) return null
    return {
        id: row.id,
        videoUrl: row.video_url || "",
        videoId: row.video_id || "",
        title: row.title || "YouTube",
        source: row.source === "auto" ? "auto" : "manual",
        transcript: Array.isArray(row.transcript) ? row.transcript : [],
        createdAt: row.created_at || null,
        updatedAt: row.updated_at || null
    }
}

export function createShadowingRepository(supabase) {
    return {
        async list(userId) {
            const cached = await readCachedRows(TABLE, row => row && row.user_id === userId)
            if (!isOnline()) return sortDescending(cached).map(normalizeShadowingLesson)
            try {
                const { data, error } = await supabase
                    .from(TABLE)
                    .select(COLUMNS)
                    .eq("user_id", userId)
                    .order("created_at", { ascending: false })
                if (error) throw error
                const withUser = (data || []).map(row => ({ ...row, user_id: row.user_id || userId }))
                const merged = await cacheRowsPreservingPending(TABLE, withUser)
                return sortDescending(merged.filter(row => row.user_id === userId)).map(normalizeShadowingLesson)
            } catch (error) {
                console.warn("[shadowing] Lecciones cargadas desde el dispositivo:", error?.message || error)
                return sortDescending(cached).map(normalizeShadowingLesson)
            }
        },

        async save(userId, lesson) {
            const now = new Date().toISOString()
            const existing = lesson.id
                ? await (async function findCached() {
                    const rows = await readCachedRows(TABLE, row => row && row.id === lesson.id)
                    return rows[0] || null
                }())
                : null
            const row = {
                id: lesson.id || generateUuid(),
                user_id: userId,
                video_url: String(lesson.videoUrl || "").slice(0, 2048),
                video_id: String(lesson.videoId || "").slice(0, 64),
                title: String(lesson.title || "Lección de YouTube").slice(0, 300),
                source: lesson.source === "auto" ? "auto" : "manual",
                transcript: Array.isArray(lesson.transcript) ? lesson.transcript : [],
                created_at: existing?.created_at || now,
                updated_at: now
            }
            await cacheRow(TABLE, row.id, row)
            await queueChange({ table: TABLE, action: "upsert", payload: row, conflict: "id", localId: row.id, description: "Guardar lección Shadowing" })
            return normalizeShadowingLesson(row)
        },

        async remove(userId, id) {
            await removeCachedRow(TABLE, id)
            await queueChange({ table: TABLE, action: "delete", match: { id, user_id: userId }, localId: id, description: "Eliminar lección Shadowing" })
        }
    }
}
