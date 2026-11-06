import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY, store } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

import { checkUser, loadUserCustomItems, initAuthSession } from "./auth.js";
import { renderCategories, loadCategoriesFromSupabase, refreshCategoriesFromLocalCustomItems } from "./data.js";
import { performSearch, initSearchModeListeners } from "./search.js";
import { closeCategoryView } from "./category-view.js";
import { updateAIButton } from "./ai.js";
import { initializePractice, setNotionPracticeCategories } from "./practice.js";
import { initializeBrowserAI } from "./browser-ai.js";
import { initializeNotionIntegration } from "./notion.js";
import { toggleFavorite } from "./favorites.js";
import { showToast } from "./cache.js";
import { showLoading, hideLoading } from "./ui-status.js";
import { initPWA } from "./pwa.js";
import { initOfflineSync, startAutoSync } from "./offline/sync.js";
import { initSyncStatus } from "./offline/status.js";

window.toggleVocabularyFavorite = (itemType, itemId) =>
    toggleFavorite(supabase, itemType, itemId);
window.setNotionPracticeCategories = setNotionPracticeCategories;

window.refreshPersonalVocabulary = async function () {
    if (!store.currentUser) return;
    await loadUserCustomItems({ preferCache: true });
    const categories = await refreshCategoriesFromLocalCustomItems() || store.categoriesData;
    initializePractice(categories, {
        supabase,
        userId: store.currentUser.id,
        refreshVerbs: false,
        refreshAIQueries: false,
        refreshPersonalVocabulary: true,
        refreshNotion: false
    }).catch((error) => {
        console.warn("No se pudo actualizar la práctica con tu vocabulario:", error);
        showToast("Tu vocabulario se guardó, pero no se pudo actualizar la práctica.", "warning");
    });
};

window.addEventListener("personal-vocabulary-changed", () => {
    window.refreshPersonalVocabulary?.().catch((error) => {
        console.error("No se pudo actualizar tu vocabulario:", error);
        showToast("Tu vocabulario se guardó, pero no se pudo actualizar la vista.", "warning");
    });
});

window.addEventListener("personal-sentences-changed", async () => {
    if (!store.currentUser) return;
    try {
        await initializePractice(store.categoriesData, {
            supabase,
            userId: store.currentUser.id,
            refreshVerbs: false,
            refreshAIQueries: false,
            refreshSentences: true,
            refreshNotion: false
        });
    } catch (error) {
        console.error("No se pudieron actualizar tus frases en la práctica:", error);
        showToast("La frase se guardó, pero no se pudo actualizar la práctica. Recarga la página.", "warning");
    }
});

window.addEventListener("session-revalidated", async () => {
    if (!store.currentUser) return;
    try {
        await initializePractice(store.categoriesData, {
            supabase,
            userId: store.currentUser.id,
            refreshVerbs: false,
            refreshAIQueries: true,
            refreshNotion: false
        });
    } catch (error) {
        console.warn("No se pudo actualizar la práctica al recuperar la conexión:", error);
    }
});

function setupEventListeners() {
    const searchInput = document.getElementById("global-search");
    const clearBtn = document.getElementById("clear-search");
    const backBtn = document.getElementById("back-to-categories");
    const adjectiveFavoriteFilter = document.getElementById("adjective-search-favorite-filter");

    if (adjectiveFavoriteFilter) {
        adjectiveFavoriteFilter.addEventListener("change", () => {
            store.adjectiveFavoritesOnly = adjectiveFavoriteFilter.value === "favorites";
            if (store.lastSearchQuery?.trim()) performSearch(store.lastSearchQuery);
        });
    }

    if (searchInput) {
        searchInput.addEventListener("input", async (e) => {
            if (clearBtn) clearBtn.classList.toggle("hidden", !e.target.value);
            performSearch(e.target.value);
        });
    }

    if (clearBtn) {
        clearBtn.addEventListener("click", () => {
            if (searchInput) searchInput.value = "";
            clearBtn.classList.add("hidden");
            renderCategories(store.categoriesData);
        });
    }

    if (backBtn) {
        backBtn.addEventListener("click", async () => {
            if (searchInput) searchInput.value = "";
            if (clearBtn) clearBtn.classList.add("hidden");
            renderCategories(store.categoriesData);
        });
    }

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            const categoryView = document.getElementById("category-view");
            if (categoryView && !categoryView.classList.contains("hidden")) {
                closeCategoryView();
            }
        }
    });
}

window.loadVerbsFromSupabase = async function (forceRefresh) {
    showLoading("verbs-loading-indicator", "Cargando verbos…");
    try {
        console.log("Cargando verbos...");
        const { loadVerbsFromSupabase } = await import("./verbs/verbs-data.js");
        const data = await loadVerbsFromSupabase(forceRefresh);
        return data;
    } catch (error) {
        console.error("Error cargando verbos:", error);
        return [];
    } finally {
        hideLoading("verbs-loading-indicator");
    }
};

/* Actualiza las categorías desde la nube sin bloquear la interfaz. La copia
 * local ya está visible; cuando llega la respuesta se refresca la vista
 * respetando la búsqueda o la categoría que el usuario esté viendo. */
async function refreshCategoriesInBackground() {
    try {
        const fresh = await loadCategoriesFromSupabase(true, { silent: true });
        if (!fresh?.length) return;
        store.categoriesData = fresh;

        const searchDiv = document.getElementById("search-results");
        if (searchDiv && !searchDiv.classList.contains("hidden")) {
            window.refreshSearchResults?.();
            return;
        }

        const categoryView = document.getElementById("category-view");
        if (!categoryView || categoryView.classList.contains("hidden")) {
            renderCategories(fresh);
        }
    } catch (error) {
        console.warn("No se pudieron actualizar las categorías en segundo plano:", error);
    }
}

async function initApp() {
    // Los listeners de la interfaz se conectan antes de las tareas lentas
    // (sesión, datos y práctica) para que el buscador responda desde el
    // primer momento y no borre lo que el usuario escribió mientras carga.
    setupEventListeners();

    initOfflineSync(supabase, { getUserId: () => store.currentUser?.id || null });
    initSyncStatus();
    initPWA();
    startAutoSync();
    initAuthSession();
    await checkUser();
    initializeBrowserAI();
    initializeNotionIntegration(supabase);
    const data = await loadCategoriesFromSupabase();
    store.categoriesData = data;
    renderCategories(data);
    // Si el usuario ya había escrito en el buscador, se repite la búsqueda
    // ahora que los datos están disponibles.
    if (store.lastSearchQuery?.trim()) performSearch(store.lastSearchQuery);
    refreshCategoriesInBackground();
    await initializePractice(data, { supabase, userId: store.currentUser?.id });
    window.refreshPracticeCategories = async function (options = {}) {
        await initializePractice(store.categoriesData, {
            supabase,
            userId: store.currentUser?.id,
            refreshVerbs: options.refreshVerbs !== false,
            refreshAIQueries: options.refreshAIQueries !== false,
            refreshNotion: options.refreshNotion === true
        });
    };
    window.refreshPracticeFavorites = async function () {
        await initializePractice(store.categoriesData, {
            supabase,
            userId: store.currentUser?.id,
            refreshVerbs: false,
            refreshAIQueries: false,
            refreshNotion: false,
            skipProgressSync: true,
            favoritesChanged: true
        });
    };
    updateAIButton();

    setTimeout(() => {
        initSearchModeListeners();
    }, 100);
}

let mySentencesInitialized = false;
window.initializeMySentences = async function () {
    if (mySentencesInitialized) return;
    mySentencesInitialized = true;
    showLoading("sentences-loading-indicator", "Cargando tu aprendizaje…");
    try {
        const { initializeSentencesApp } = await import("./sentences/app.js");
        await initializeSentencesApp();
    } catch (error) {
        mySentencesInitialized = false;
        console.error("Unable to initialize MySentences", error);
        window.alert("No se pudo abrir MySentences. Recarga la página e inténtalo de nuevo.");
    } finally {
        hideLoading("sentences-loading-indicator");
    }
};

initApp();

export { supabase };