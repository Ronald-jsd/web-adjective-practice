import { showToast } from "./cache.js";
import { store } from "./config.js";
import { cacheRowsPreservingPending, cacheRow, removeCachedRow, readCachedRows, TABLES } from "./offline/cache.js";
import { queueChange } from "./offline/sync.js";

export function getFavoriteKey(itemType, itemId) {
    return `${itemType}:${String(itemId)}`;
}

export function isFavorite(itemType, itemId) {
    return store.favoriteSet.has(getFavoriteKey(itemType, itemId));
}

function favoriteCacheId(userId, itemType, itemId) {
    return `${userId}|${itemType}|${itemId}`;
}

export async function loadUserFavorites(supabase, userId) {
    store.favoriteSet.clear();
    if (!userId) return;

    let rows = null;

    try {
        const { data, error } = await supabase
            .from("user_vocabulary_favorites")
            .select("item_type, item_id")
            .eq("user_id", userId);
        if (error) throw error;

        rows = data || [];
        rows = await cacheRowsPreservingPending(
            TABLES.favorites,
            rows.map((row) => ({
                ...row,
                user_id: userId,
                cache_id: favoriteCacheId(userId, row.item_type, row.item_id)
            })),
            "cache_id"
        );
    } catch (error) {
        console.warn("Sin conexión: usando tus favoritos guardados en el dispositivo.", error);
        rows = await readCachedRows(TABLES.favorites, (row) => row.user_id === userId);
    }

    (rows || []).forEach((favorite) => {
        if (["adjective", "verb"].includes(favorite.item_type) && favorite.item_id !== null) {
            store.favoriteSet.add(getFavoriteKey(favorite.item_type, favorite.item_id));
        }
    });
    window.dispatchEvent(new CustomEvent("vocabulary-favorites-changed"));
}

export async function toggleFavorite(supabase, itemType, itemId) {
    if (!["adjective", "verb"].includes(itemType) || itemId === null || itemId === undefined || itemId === "") {
        showToast("No se pudo identificar este elemento para guardarlo como favorito.", "error");
        return false;
    }
    if (!store.currentUser) {
        showToast("Inicia sesión para guardar y sincronizar tus favoritos.", "info");
        return false;
    }

    const userId = store.currentUser.id;
    const key = getFavoriteKey(itemType, itemId);
    const alreadyFavorite = store.favoriteSet.has(key);
    const cacheId = favoriteCacheId(userId, itemType, itemId);

    if (alreadyFavorite) {
        store.favoriteSet.delete(key);
        await removeCachedRow(TABLES.favorites, cacheId);
        await queueChange({
            table: TABLES.favorites,
            action: "delete",
            match: { user_id: userId, item_type: itemType, item_id: String(itemId) },
            localId: cacheId,
            description: "Quitar favorito"
        });
    } else {
        store.favoriteSet.add(key);
        const row = { user_id: userId, item_type: itemType, item_id: String(itemId) };
        await cacheRow(TABLES.favorites, cacheId, { ...row, cache_id: cacheId });
        await queueChange({
            table: TABLES.favorites,
            action: "upsert",
            payload: row,
            conflict: "user_id,item_type,item_id",
            localId: cacheId,
            description: "Añadir favorito"
        });
    }

    showToast(alreadyFavorite ? "Se quitó de Favoritos." : "Se agregó a Favoritos.", "success");
    window.dispatchEvent(new CustomEvent("vocabulary-favorites-changed"));
    return true;
}
