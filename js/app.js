import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY, store } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

import { checkUser, loadUserCustomItems, initAuthSession } from "./auth.js";
import { renderCategories, loadCategoriesFromSupabase, refreshCategoriesFromLocalCustomItems } from "./data.js";
import { performSearch, initSearchModeListeners, showFavoriteAdjectives } from "./search.js";
import { closeCategoryView } from "./category-view.js";
import { updateAIButton } from "./ai.js";
import { initializePractice, setNotionPracticeCategories } from "./practice.js";
import { initializeBrowserAI, getStudyQueries, openStudyQuery } from "./browser-ai.js";
import { initializeNotionIntegration } from "./notion.js";
import { initializeNotionEmbeds } from "./notion-embeds/app.js";
import { initializeShadowing } from "./shadowing/app.js";
import { initializeWordGroups } from "./word-groups/modal.js";
import { toggleFavorite } from "./favorites.js";
import { showToast } from "./cache.js";
import { isCatalogFresh } from "./catalog-freshness.js";
import { showLoading, hideLoading } from "./ui-status.js";
import { initPWA } from "./pwa.js";
import { initOfflineSync, startAutoSync } from "./offline/sync.js";
import { initSyncStatus } from "./offline/status.js";
import { initializeDailyStudy } from "./daily-study-ui.js";

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

/* Sin sesión no hay favoritos visibles: el logout limpia la copia local por
 * seguridad. Mostramos el aviso en vez de dejar un filtro que parece vacío. */
function updateFavoriteFilterHints() {
    const filters = [
        {
            select: document.getElementById("adjective-global-favorite-filter"),
            hint: document.getElementById("adjective-favorite-login-hint")
        },
        {
            select: document.getElementById("verbs-favorite-filter"),
            hint: document.getElementById("verbs-favorite-login-hint")
        }
    ];

    filters.forEach(({ select, hint }) => {
        if (hint) hint.classList.toggle("hidden", !!store.currentUser);
        if (select) {
            select.disabled = !store.currentUser;
            select.title = store.currentUser ? "" : "Inicia sesión para ver tus favoritos";
        }
    });
}

function setupEventListeners() {
    const searchInput = document.getElementById("global-search");
    const clearBtn = document.getElementById("clear-search");
    const backBtn = document.getElementById("back-to-categories");
    const adjectiveFavoriteFilter = document.getElementById("adjective-search-favorite-filter");
    const adjectiveGlobalFavoriteFilter = document.getElementById("adjective-global-favorite-filter");
    const adjectiveFilters = [adjectiveGlobalFavoriteFilter, adjectiveFavoriteFilter].filter(Boolean);

    const setAdjectiveFavoriteFilter = (value, source) => {
        if (value === "favorites" && !store.currentUser) {
            showToast("Inicia sesión para ver tus favoritos.", "info");
            if (source) source.value = "all";
            return;
        }
        store.adjectiveFavoritesOnly = value === "favorites";
        adjectiveFilters.forEach(select => {
            if (select !== source) select.value = value;
        });
        const activeFilter = document.getElementById("adjective-favorite-filter");
        if (activeFilter && activeFilter !== source) activeFilter.value = value;
        if (store.lastSearchQuery?.trim() && store.lastSearchQuery !== "★ favoritos") performSearch(store.lastSearchQuery);
        else if (store.adjectiveFavoritesOnly) showFavoriteAdjectives();
        else {
            const resultsPanel = document.getElementById("search-results");
            if (resultsPanel) resultsPanel.classList.add("hidden");
            renderCategories(store.categoriesData);
        }
    };

    adjectiveFilters.forEach(select => select.addEventListener("change", () => setAdjectiveFavoriteFilter(select.value, select)));

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
    // La copia local ya se validó al cargar; solo se vuelve a la red cuando
    // han pasado 24 h. Las ediciones usan forceRefresh y no dependen de aquí.
    if (isCatalogFresh("categories")) return;
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

function navigateToDailyActivity(activity, mission) {
    if (!activity) return;
    const button = document.querySelector(`[data-section="${activity.section}"]`);
    window.switchSection?.(activity.section, button);
    if (activity.pane) document.querySelector(`[data-practice-pane="${activity.pane}"]`)?.click();
    if (activity.screen) {
        const clickTab = () => document.querySelector(`.tab[data-screen="${activity.screen}"]`)?.click();
        clickTab();
        setTimeout(clickTab, 150);
    }
    // El reto de IA abre la consulta concreta del tema elegido.
    if (activity.id === "ai" && mission?.targetId) {
        setTimeout(() => openStudyQuery(mission.targetId), 200);
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
    // El módulo de Mi aprendizaje se carga una vez con conexión. Así, al
    // pulsar la pestaña sin internet, el import dynamic se resuelve desde la
    // caché del navegador/service worker en vez de intentar ir a la red.
    preloadMySentencesModule().catch(error => {
        console.warn("No se pudo precargar Mi aprendizaje:", error);
    });
    startAutoSync();
    initAuthSession();
    // El plan diario se muestra aunque la sesión remota tarde o falle.
    initializeDailyStudy({
        userId: store.currentUser?.id,
        navigate: navigateToDailyActivity,
        getStudyQueries,
        openStudyTarget: openStudyQuery
    });
    await checkUser();
    updateFavoriteFilterHints();
    initializeBrowserAI();
    initializeNotionIntegration(supabase);
    initializeNotionEmbeds(supabase);
    initializeShadowing(supabase);
    initializeWordGroups(supabase);
    const data = await loadCategoriesFromSupabase();
    store.categoriesData = data;
    renderCategories(data);
    // Si el usuario ya había escrito en el buscador, se repite la búsqueda
    // ahora que los datos están disponibles.
    if (store.lastSearchQuery?.trim()) performSearch(store.lastSearchQuery);
    refreshCategoriesInBackground();
    // La práctica se prepara en segundo plano para que la app quede usable cuanto antes.
    initializePractice(data, { supabase, userId: store.currentUser?.id }).catch(error => {
        console.error("No se pudo preparar la práctica:", error);
        showToast("No se pudo preparar la práctica. Puedes seguir usando el resto de la app.", "warning");
    });
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
let mySentencesFailed = false;
let mySentencesModulePromise = null;

function preloadMySentencesModule() {
    if (!mySentencesModulePromise) {
        mySentencesModulePromise = import("./sentences/app.js").catch(error => {
            mySentencesModulePromise = null;
            throw error;
        });
    }
    return mySentencesModulePromise;
}

function showMySentencesError() {
    mySentencesFailed = true;
    const target = document.getElementById("sentences-loading-indicator");
    if (!target) return;
    target.classList.remove("hidden");
    target.setAttribute("role", "status");
    target.innerHTML = '<span>Mi aprendizaje no está disponible en este momento. ' +
        'Tus datos siguen guardados en el dispositivo.</span> ' +
        '<button type="button" id="retry-mysentences" class="text-button">Reintentar</button>';
    target.querySelector("#retry-mysentences")?.addEventListener("click", () => {
        window.initializeMySentences();
    });
}

window.initializeMySentences = async function () {
    if (mySentencesInitialized) return;
    mySentencesInitialized = true;
    mySentencesFailed = false;
    showLoading("sentences-loading-indicator", "Cargando tu aprendizaje…");
    try {
        const { initializeSentencesApp } = await preloadMySentencesModule();
        await initializeSentencesApp();
    } catch (error) {
        mySentencesInitialized = false;
        console.error("Unable to initialize MySentences", error);
        showMySentencesError();
        return;
    }
    hideLoading("sentences-loading-indicator");
};

// Si la apertura falló porque no había red, se reintenta solo al recuperarla.
window.addEventListener("online", () => {
    if (mySentencesFailed && document.getElementById("mysentences-section")?.classList.contains("active")) {
        window.initializeMySentences();
    }
});

initApp();

export { supabase };