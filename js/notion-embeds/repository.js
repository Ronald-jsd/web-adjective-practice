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

const COLUMNS = "id,user_id,title,url,created_at,updated_at"

function sortByCreatedAt(rows) {
    return [...rows].sort((left, right) => {
        const a = new Date(left.created_at || 0).getTime()
        const b = new Date(right.created_at || 0).getTime()
        return a === b ? 0 : a - b
    })
}

export function normalizeNotionEmbed(row) {
    if (!row) return null
    return {
        id: row.id,
        title: row.title || "",
        url: row.url || "",
        createdAt: row.created_at || null,
        updatedAt: row.updated_at || null
    }
}

export function createNotionEmbedRepository(supabase) {
    const table = TABLES.notionPages

    return {
        async list(userId) {
            const cached = await readCachedRows(table, row => row && row.user_id === userId)
            if (!isOnline()) return sortByCreatedAt(cached).map(normalizeNotionEmbed)

            try {
                const { data, error } = await supabase
                    .from(table)
                    .select(COLUMNS)
                    .eq("user_id", userId)
                    .order("created_at", { ascending: true })
                if (error) throw error
                const rows = (data || []).map(row => ({ ...row, user_id: row.user_id || userId }))
                const merged = await cacheRowsPreservingPending(table, rows)
                return sortByCreatedAt(merged.filter(row => row.user_id === userId)).map(normalizeNotionEmbed)
            } catch (error) {
                console.warn("[notion-embeds] No se pudieron descargar las páginas de Notion:", error)
                return sortByCreatedAt(cached).map(normalizeNotionEmbed)
            }
        },

        async save(userId, { title, url }, id = null) {
            const now = new Date().toISOString()
            const existing = id ? await readCachedRow(table, id) : null
            const row = {
                id: id || generateUuid(),
                user_id: userId,
                title: title || "",
                url,
                created_at: existing?.created_at || now,
                updated_at: now
            }
            await cacheRow(table, row.id, row)
            await queueChange({
                table,
                action: "upsert",
                payload: row,
                conflict: "id",
                localId: row.id,
                description: id ? "Editar página de Notion" : "Guardar página de Notion"
            })
            return normalizeNotionEmbed(row)
        },

        async remove(userId, id) {
            await removeCachedRow(table, id)
            await queueChange({
                table,
                action: "delete",
                match: { id, user_id: userId },
                localId: id,
                description: "Eliminar página de Notion"
            })
        }
    }
}
