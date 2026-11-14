import {
    cacheRow,
    cacheRowsPreservingPending,
    readCachedRow,
    readCachedRows,
    removeCachedRow,
    TABLES
} from "../offline/cache.js"
import { isOnline, queueChange } from "../offline/sync.js"
import { generateUuid } from "../offline/ids.js"
import { normalizeGroup } from "./model.js"

const COLUMNS = "id,user_id,title,members,relationships,created_at,updated_at"

function sortByUpdatedAtDesc(rows) {
    return [...rows].sort((left, right) => new Date(right.updated_at || right.updatedAt || 0).getTime() - new Date(left.updated_at || left.updatedAt || 0).getTime())
}

export function createWordGroupRepository(supabase) {
    const table = TABLES.wordGroups

    return {
        async list(userId) {
            const cached = await readCachedRows(table, row => row?.user_id === userId)
            if (!isOnline()) return sortByUpdatedAtDesc(cached).map(normalizeGroup)
            try {
                const { data, error } = await supabase
                    .from(table)
                    .select(COLUMNS)
                    .eq("user_id", userId)
                    .order("updated_at", { ascending: false })
                if (error) throw error
                const rows = (data || []).map(row => ({ ...row, user_id: row.user_id || userId }))
                const merged = await cacheRowsPreservingPending(table, rows)
                return sortByUpdatedAtDesc(merged.filter(row => row?.user_id === userId)).map(normalizeGroup)
            } catch (error) {
                console.warn("[word-groups] No se pudieron descargar los grupos:", error)
                return sortByUpdatedAtDesc(cached).map(normalizeGroup)
            }
        },

        async save(userId, group, id = null) {
            const now = new Date().toISOString()
            const existingId = id || group.id || generateUuid()
            const cached = await readCachedRow(table, existingId)
            const normalized = normalizeGroup({
                ...group,
                id: existingId,
                created_at: cached?.created_at || now,
                updated_at: now
            }, { createId: true })
            const row = {
                id: existingId,
                user_id: userId,
                title: normalized.title,
                members: normalized.members,
                relationships: normalized.relationships,
                created_at: cached?.created_at || now,
                updated_at: now
            }
            await cacheRow(table, existingId, row)
            await queueChange({
                table,
                action: "upsert",
                payload: row,
                conflict: "id",
                localId: existingId,
                description: cached ? "Editar grupo de palabras" : "Guardar grupo de palabras"
            })
            return normalizeGroup(row)
        },

        async remove(userId, id) {
            await removeCachedRow(table, id)
            await queueChange({
                table,
                action: "delete",
                match: { id, user_id: userId },
                localId: id,
                description: "Eliminar grupo de palabras"
            })
        }
    }
}
