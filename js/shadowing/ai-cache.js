import {
    cacheRow,
    readCachedRows,
    removeCachedRow,
    pendingChangeIds,
    TABLES
} from "../offline/cache.js"
import { isOnline, queueChange } from "../offline/sync.js"

/* Definiciones de palabras y traducciones de frases guardadas por cuenta.
 * Se consultan antes de llamar a la IA, también desde otro dispositivo. */

const TABLE = TABLES.aiCache
const COLUMNS = "user_id,kind,cache_key,value,source,created_at,updated_at"
const LOCAL_OWNER = "local"

function ownerId(userId) {
    return userId || LOCAL_OWNER
}

function localId(userId, kind, key) {
    return `${ownerId(userId)}::${kind}::${key}`
}

export function normalizeAiCacheRow(row) {
    if (!row) return null
    return {
        kind: String(row.kind || ""),
        key: String(row.cache_key || ""),
        value: row.value,
        source: String(row.source || "ai"),
        updatedAt: row.updated_at || null
    }
}

export function createAiCache(supabase) {
    return {
        async get(userId, kind, key) {
            if (!kind || !key) return null
            const owner = ownerId(userId)
            const cached = await readCachedRows(
                TABLE,
                row => row && row.user_id === owner && row.kind === kind && row.cache_key === key
            )
            if (cached[0]) return normalizeAiCacheRow(cached[0])
            if (!userId || !isOnline()) return null
            try {
                const pending = await pendingChangeIds(TABLE)
                if (pending.remove.has(localId(userId, kind, key))) return null
                const { data, error } = await supabase
                    .from(TABLE)
                    .select(COLUMNS)
                    .eq("user_id", userId)
                    .eq("kind", kind)
                    .eq("cache_key", key)
                    .maybeSingle()
                if (error) throw error
                if (!data) return null
                await cacheRow(TABLE, localId(userId, kind, key), data)
                return normalizeAiCacheRow(data)
            } catch (error) {
                console.warn("[shadowing] Caché de IA no disponible:", error?.message || error)
                return null
            }
        },

        async save(userId, kind, key, value, source = "ai") {
            if (!kind || !key || value === undefined || value === null) return null
            const owner = ownerId(userId)
            const id = localId(owner, kind, key)
            const previous = (await readCachedRows(
                TABLE,
                row => row && row.user_id === owner && row.kind === kind && row.cache_key === key
            ))[0] || null
            const now = new Date().toISOString()
            const row = {
                user_id: owner,
                kind,
                cache_key: String(key).slice(0, 2000),
                value,
                source: String(source || "ai"),
                created_at: previous?.created_at || now,
                updated_at: now
            }
            await cacheRow(TABLE, id, row)
            if (userId) {
                await queueChange({
                    table: TABLE,
                    action: "upsert",
                    payload: row,
                    conflict: "user_id,kind,cache_key",
                    localId: id,
                    description: "Guardar caché de IA Shadowing"
                })
            }
            return normalizeAiCacheRow(row)
        },

        async remove(userId, kind, key) {
            if (!kind || !key) return
            const id = localId(userId, kind, key)
            await removeCachedRow(TABLE, id)
            if (userId) {
                await queueChange({
                    table: TABLE,
                    action: "delete",
                    match: { user_id: userId, kind, cache_key: key },
                    localId: id,
                    description: "Borrar caché de IA Shadowing"
                })
            }
        }
    }
}
