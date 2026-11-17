import {
    cacheRow,
    readCachedRows,
    removeCachedRow,
    pendingChangeIds,
    TABLES
} from "../offline/cache.js"
import { isOnline, queueChange } from "../offline/sync.js"

/* Transcripciones de Shadowing guardadas por cuenta.
 * - Se guardan para siempre: nada se borra automáticamente.
 * - La copia local permite abrirlas sin conexión.
 * - Con sesión, se sincronizan para verlas en móvil, PC o portátil. */

const TABLE = TABLES.transcriptCache
const COLUMNS = "user_id,video_id,title,language,source,segments,created_at,updated_at"
const LOCAL_OWNER = "local"

function ownerId(userId) {
    return userId || LOCAL_OWNER
}

function localId(userId, videoId) {
    return `${ownerId(userId)}::${videoId}`
}

function sortByUpdated(rows) {
    return [...rows].sort((left, right) => new Date(right.updatedAt || 0) - new Date(left.updatedAt || 0))
}

export function normalizeTranscriptRow(row) {
    if (!row) return null
    return {
        videoId: String(row.video_id || ""),
        title: String(row.title || ""),
        language: String(row.language || "en"),
        source: String(row.source || "auto"),
        segments: Array.isArray(row.segments) ? row.segments : [],
        createdAt: row.created_at || null,
        updatedAt: row.updated_at || null
    }
}

export function createTranscriptStore(supabase) {
    return {
        async get(userId, videoId) {
            if (!videoId) return null
            const owner = ownerId(userId)
            const cached = await readCachedRows(TABLE, row => row && row.user_id === owner && row.video_id === videoId)
            if (cached[0]) return normalizeTranscriptRow(cached[0])
            if (!userId || !isOnline()) return null
            try {
                // Un borrado pendiente manda: no se resucita la copia remota.
                const pending = await pendingChangeIds(TABLE)
                if (pending.remove.has(localId(userId, videoId))) return null
                const { data, error } = await supabase
                    .from(TABLE)
                    .select(COLUMNS)
                    .eq("user_id", userId)
                    .eq("video_id", videoId)
                    .maybeSingle()
                if (error) throw error
                if (!data) return null
                await cacheRow(TABLE, localId(userId, videoId), data)
                return normalizeTranscriptRow(data)
            } catch (error) {
                console.warn("[shadowing] Transcripción no disponible en la cuenta:", error?.message || error)
                return null
            }
        },

        async list(userId) {
            const owner = ownerId(userId)
            const cached = await readCachedRows(TABLE, row => row && row.user_id === owner)
            if (!userId || !isOnline()) return sortByUpdated(cached.map(normalizeTranscriptRow))

            try {
                const { data, error } = await supabase
                    .from(TABLE)
                    .select(COLUMNS)
                    .eq("user_id", userId)
                    .order("updated_at", { ascending: false })
                if (error) throw error

                const remote = data || []
                const remoteKeys = new Set(remote.map(row => localId(userId, row.video_id)))
                const pending = await pendingChangeIds(TABLE)

                // Las filas borradas en otro dispositivo desaparecen aquí,
                // salvo que tengan un cambio local sin subir.
                for (const row of cached) {
                    const key = localId(owner, row.video_id)
                    if (!remoteKeys.has(key) && !pending.upsert.has(key)) {
                        await removeCachedRow(TABLE, key)
                    }
                }
                for (const row of remote) {
                    const key = localId(userId, row.video_id)
                    // Si el borrado aún está en la cola, no se vuelve a mostrar.
                    if (pending.remove.has(key)) continue
                    await cacheRow(TABLE, key, { ...row, user_id: userId })
                }
                const merged = await readCachedRows(TABLE, row => row && row.user_id === owner)
                return sortByUpdated(merged.map(normalizeTranscriptRow))
            } catch (error) {
                console.warn("[shadowing] Lista de transcripciones desde el dispositivo:", error?.message || error)
                return sortByUpdated(cached.map(normalizeTranscriptRow))
            }
        },

        async save(userId, entry) {
            if (!entry?.videoId || !Array.isArray(entry.segments) || !entry.segments.length) return null
            const owner = ownerId(userId)
            const key = localId(owner, entry.videoId)
            const previous = (await readCachedRows(TABLE, row => row && row.user_id === owner && row.video_id === entry.videoId))[0] || null
            const now = new Date().toISOString()
            const row = {
                user_id: owner,
                video_id: entry.videoId,
                title: String(entry.title || "").slice(0, 300),
                language: String(entry.language || "en"),
                source: String(entry.source || "auto"),
                segments: entry.segments,
                created_at: previous?.created_at || now,
                updated_at: now
            }
            await cacheRow(TABLE, key, row)
            if (userId) {
                await queueChange({
                    table: TABLE,
                    action: "upsert",
                    payload: row,
                    conflict: "user_id,video_id",
                    localId: key,
                    description: "Guardar transcripción Shadowing"
                })
            }
            return normalizeTranscriptRow(row)
        },

        async remove(userId, videoId) {
            if (!videoId) return
            const owner = ownerId(userId)
            const key = localId(owner, videoId)
            await removeCachedRow(TABLE, key)
            if (userId) {
                await queueChange({
                    table: TABLE,
                    action: "delete",
                    match: { user_id: userId, video_id: videoId },
                    localId: key,
                    description: "Eliminar transcripción Shadowing"
                })
            }
        }
    }
}
