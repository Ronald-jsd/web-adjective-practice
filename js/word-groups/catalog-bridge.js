/* Puente entre la tabla principal y la ventana de palabras similares.
 *
 * La tabla principal vive en `store.categoriesData` y en las tablas `items`
 * (catálogo compartido) y `user_custom_items` (vocabulario propio). El grupo de
 * palabras similares guarda una copia de esos datos. Para que ambos lados
 * muestren siempre lo mismo, este módulo empuja los cambios del grupo a la
 * tabla principal y elimina de ella las palabras que se borran desde el modal.
 */

import { store } from "../config.js"
import { updateCachedCategories } from "../data.js"
import { cacheRow, readCachedRow, removeCachedRow, TABLES } from "../offline/cache.js"
import { queueChange } from "../offline/sync.js"

const FIELD_INDEX = {
    word: 0,
    pronunciation: 1,
    spanish: 2,
    example_en: 3,
    example_es: 4
}

function itemKey(member) {
    if (!member?.itemId) return ""
    return member.source === "custom" ? `custom_${member.itemId}` : String(member.itemId)
}

function joinExamples(list) {
    return (list || [])
        .map(value => String(value || "").trim())
        .filter(Boolean)
        .join(" / ")
}

/* La tabla principal guarda todos los ejemplos de una palabra en dos celdas
 * separadas por " / ". Se reconstruyen desde la lista del grupo. */
function catalogPayload(member) {
    const examples = (member.examples || []).filter(example => example.en || example.es)
    return {
        word: String(member.word || "").trim(),
        pronunciation: String(member.pronunciation || "").trim(),
        spanish: String(member.spanish || "").trim(),
        example_en: joinExamples(examples.map(example => example.en)),
        example_es: joinExamples(examples.map(example => example.es))
    }
}

function applyToSnapshot(snapshot, key, payload) {
    for (const category of snapshot || []) {
        for (const subcategory of category.subcategories || []) {
            for (const row of subcategory.items || []) {
                if (String(row?.[5]) !== key) continue
                for (const [field, index] of Object.entries(FIELD_INDEX)) {
                    if (payload[field] !== undefined) row[index] = payload[field]
                }
            }
        }
    }
    return snapshot
}

function removeFromSnapshot(snapshot, key) {
    for (const category of snapshot || []) {
        for (const subcategory of category.subcategories || []) {
            subcategory.items = (subcategory.items || []).filter(row => String(row?.[5]) !== key)
        }
    }
    return snapshot
}

async function refreshMainViews() {
    // `editing.js` expone el refresco real de la tabla; se usa por ventana para
    // no crear un ciclo de imports entre el modal y el módulo de edición.
    try {
        await window.refreshCategoryViewFromLocalCopy?.()
    } catch (error) {
        console.warn("[word-groups] No se pudo refrescar la tabla principal:", error)
    }
    window.refreshSearchResults?.()
    try {
        await window.refreshPracticeCategories?.()
    } catch (error) {
        console.warn("[word-groups] No se pudo refrescar la práctica:", error)
    }
}

/* Copia a la tabla principal los datos editados dentro del grupo. Solo se llama
 * con miembros que el usuario tocó y que existen en el catálogo. */
export async function pushMemberToCatalog(member, userId) {
    const key = itemKey(member)
    if (!key) return false
    const payload = catalogPayload(member)

    if (member.source === "custom") {
        const cached = await readCachedRow(TABLES.customItems, member.itemId)
        await cacheRow(TABLES.customItems, member.itemId, {
            ...(cached || {}),
            ...payload,
            id: member.itemId,
            user_id: userId
        })
        await queueChange({
            table: TABLES.customItems,
            action: "update",
            payload,
            match: { id: member.itemId, user_id: userId },
            description: "Editar vocabulario desde palabras similares"
        })
    } else {
        await queueChange({
            table: TABLES.items,
            action: "update",
            payload,
            match: { id: member.itemId },
            description: "Editar palabra desde palabras similares"
        })
    }

    const snapshot = await updateCachedCategories(current => applyToSnapshot(current, key, payload))
    if (snapshot) store.categoriesData = snapshot
    await refreshMainViews()
    return true
}

/* Elimina la palabra de la tabla principal (catálogo compartido o vocabulario
 * propio). Es irreversible, así que la interfaz siempre pide confirmación. */
export async function deleteMemberFromCatalog(member, userId) {
    const key = itemKey(member)
    if (!key) return false

    if (member.source === "custom") {
        await removeCachedRow(TABLES.customItems, member.itemId)
        await queueChange({
            table: TABLES.customItems,
            action: "delete",
            match: { id: member.itemId, user_id: userId },
            description: "Eliminar vocabulario desde palabras similares"
        })
    } else {
        await queueChange({
            table: TABLES.items,
            action: "delete",
            match: { id: member.itemId },
            description: "Eliminar palabra desde palabras similares"
        })
    }

    const snapshot = await updateCachedCategories(current => removeFromSnapshot(current, key))
    if (snapshot) store.categoriesData = snapshot
    await refreshMainViews()
    window.dispatchEvent(new CustomEvent("word-catalog-changed"))
    return true
}
