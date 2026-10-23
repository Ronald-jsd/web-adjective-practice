import { showToast } from "./cache.js";
import { store } from "./config.js";

export function getFavoriteKey(itemType, itemId) {
    return `${itemType}:${String(itemId)}`;
}

export function isFavorite(itemType, itemId) {
    return store.favoriteSet.has(getFavoriteKey(itemType, itemId));
}

export async function loadUserFavorites(supabase, userId) {
    store.favoriteSet.clear();
    if (!userId) return;

    let result;
    try {
        result = await supabase
            .from("user_vocabulary_favorites")
            .select("item_type, item_id")
            .eq("user_id", userId);
    } catch (error) {
        console.error("No se pudieron cargar los favoritos:", error);
        showToast(`No se pudieron cargar tus favoritos. Ejecuta supabase/vocabulary_favorites.sql. ${error.message || ""}`, "error");
        return;
    }
    const { data, error } = result;

    if (error) {
        console.error("No se pudieron cargar los favoritos:", error);
        showToast(`No se pudieron cargar tus favoritos. Ejecuta supabase/vocabulary_favorites.sql. ${error.message || ""}`, "error");
        return;
    }

    (data || []).forEach(favorite => {
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

    const key = getFavoriteKey(itemType, itemId);
    const alreadyFavorite = store.favoriteSet.has(key);
    const query = alreadyFavorite
        ? supabase.from("user_vocabulary_favorites")
            .delete()
            .eq("user_id", store.currentUser.id)
            .eq("item_type", itemType)
            .eq("item_id", String(itemId))
        : supabase.from("user_vocabulary_favorites")
            .upsert({
                user_id: store.currentUser.id,
                item_type: itemType,
                item_id: String(itemId)
            }, { onConflict: "user_id,item_type,item_id" });

    let result;
    try {
        result = await query;
    } catch (error) {
        console.error("No se pudo guardar el favorito:", error);
        showToast(`No se pudo actualizar el favorito. Verifica supabase/vocabulary_favorites.sql. ${error.message || ""}`, "error");
        return false;
    }
    const { error } = result;
    if (error) {
        console.error("No se pudo guardar el favorito:", error);
        showToast(`No se pudo actualizar el favorito. Verifica supabase/vocabulary_favorites.sql. ${error.message || ""}`, "error");
        return false;
    }

    if (alreadyFavorite) store.favoriteSet.delete(key);
    else store.favoriteSet.add(key);
    showToast(alreadyFavorite ? "Se quitó de Favoritos." : "Se agregó a Favoritos.", "success");
    window.dispatchEvent(new CustomEvent("vocabulary-favorites-changed"));
    return true;
}
