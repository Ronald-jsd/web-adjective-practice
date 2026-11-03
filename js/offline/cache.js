/* Acceso de alto nivel al espejo local de las tablas de Supabase. */

import {
    replaceTable,
    putRecords,
    getRecords,
    getRecord,
    putRecord,
    deleteRecord,
    getMeta,
    setMeta,
    listOutboxEntries
} from "./db.js";

function toEntries(rows, idField) {
    return (rows || [])
        .filter(Boolean)
        .map((row) => ({ id: row[idField] ?? row.id, value: row }))
        .filter((entry) => entry.id !== undefined && entry.id !== null);
}

export async function cacheRows(table, rows, idField = "id", options = {}) {
    const entries = toEntries(rows, idField);
    try {
        if (options.replace === false) {
            await putRecords(table, entries);
        } else {
            await replaceTable(table, entries);
        }
    } catch (error) {
        console.warn(`[offline] No se pudo guardar "${table}" en el dispositivo:`, error);
    }
    return rows || [];
}

export async function cacheRow(table, id, value) {
    try {
        await putRecord(table, id, value);
    } catch (error) {
        console.warn(`[offline] No se pudo guardar "${table}:${id}" en el dispositivo:`, error);
    }
}

export async function readCachedRows(table, filter = null) {
    try {
        const rows = await getRecords(table);
        return typeof filter === "function" ? rows.filter(filter) : rows;
    } catch (error) {
        console.warn(`[offline] No se pudo leer "${table}" del dispositivo:`, error);
        return [];
    }
}

export async function readCachedRow(table, id) {
    try {
        return await getRecord(table, id);
    } catch (error) {
        console.warn(`[offline] No se pudo leer "${table}:${id}" del dispositivo:`, error);
        return null;
    }
}

export async function removeCachedRow(table, id) {
    try {
        await deleteRecord(table, id);
    } catch (error) {
        console.warn(`[offline] No se pudo borrar "${table}:${id}" del dispositivo:`, error);
    }
}

export async function cacheSnapshot(key, value) {
    try {
        await setMeta(key, value);
    } catch (error) {
        console.warn(`[offline] No se pudo guardar la copia "${key}":`, error);
    }
}

export async function readSnapshot(key) {
    try {
        return await getMeta(key);
    } catch (error) {
        console.warn(`[offline] No se pudo leer la copia "${key}":`, error);
        return null;
    }
}

/* Identificadores con cambios sin subir para una tabla.
 * `localId` permite tablas cuya clave local no es la columna `id`
 * (favoritos, estado de palabras, progreso de práctica). */
export async function pendingChangeIds(table) {
    const result = { upsert: new Set(), remove: new Set() };
    let entries = [];
    try {
        entries = await listOutboxEntries();
    } catch (error) {
        return result;
    }

    for (const entry of entries) {
        if (!entry || entry.table !== table) continue;
        const target = entry.localId !== undefined
            ? entry.localId
            : entry.action === "delete"
                ? entry.match?.id
                : entry.payload?.id ?? entry.match?.id;
        if (target === undefined || target === null) continue;
        if (entry.action === "delete") result.remove.add(String(target));
        else result.upsert.add(String(target));
    }
    return result;
}

/* Guarda el resultado de la nube sin borrar filas que aún no se han subido.
 * Sin esto, una recarga con conexión justo después de crear algo sin red
 * eliminaría ese elemento de la copia local. */
export async function cacheRowsPreservingPending(table, rows, idField = "id", options = {}) {
    const replace = options.replace !== false;
    const pending = await pendingChangeIds(table);
    const cached = await readCachedRows(table);
    const byId = new Map();
    const cachedById = new Map();

    for (const row of cached) {
        if (!row) continue;
        const id = row[idField] ?? row.id;
        if (id === undefined || id === null) continue;
        cachedById.set(String(id), row);
    }

    if (!replace) {
        for (const [key, row] of cachedById) byId.set(key, row);
    }

    for (const row of rows || []) {
        if (!row) continue;
        const id = row[idField] ?? row.id;
        if (id === undefined || id === null) continue;
        const key = String(id);
        if (pending.remove.has(key)) continue;
        // Un cambio pendiente manda sobre la copia de la nube.
        byId.set(key, pending.upsert.has(key) && cachedById.has(key) ? cachedById.get(key) : row);
    }

    if (replace) {
        for (const [key, row] of cachedById) {
            if (pending.upsert.has(key) && !byId.has(key)) byId.set(key, row);
        }
    }

    // Las filas borradas en el dispositivo desaparecen también de la copia.
    for (const key of pending.remove) {
        byId.delete(key);
        try {
            await deleteRecord(table, key);
        } catch (error) {
            // Sin IndexedDB disponible no hay nada que borrar.
        }
    }

    const finalRows = [...byId.values()];
    if (replace) {
        await cacheRows(table, finalRows, idField);
    } else {
        await cacheRows(table, finalRows, idField, { replace: false });
    }
    return finalRows;
}

export const TABLES = {
    categories: "categories",
    items: "items",
    verbs: "verbs",
    sentences: "my_sentences",
    customItems: "user_custom_items",
    wordStatus: "user_word_status",
    favorites: "user_vocabulary_favorites",
    practiceProgress: "vocabulary_practice_progress",
    aiQueries: "user_ai_queries"
};
