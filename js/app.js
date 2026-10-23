import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY, store } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

import { checkUser } from "./auth.js";
import { renderCategories, loadCategoriesFromSupabase } from "./data.js";
import { performSearch, initSearchModeListeners } from "./search.js";
import { closeCategoryView } from "./category-view.js";
import { updateAIButton } from "./ai.js";
import { initializePractice } from "./practice.js";
import { initializeBrowserAI } from "./browser-ai.js";
import { toggleFavorite } from "./favorites.js";

window.toggleVocabularyFavorite = (itemType, itemId) =>
    toggleFavorite(supabase, itemType, itemId);

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
        searchInput.value = "";
        searchInput.addEventListener("input", async (e) => {
            if (clearBtn) clearBtn.classList.toggle("hidden", !e.target.value);
            performSearch(e.target.value);
        });
    }

    if (clearBtn) {
        clearBtn.addEventListener("click", async () => {
            if (searchInput) searchInput.value = "";
            clearBtn.classList.add("hidden");
            const data = await loadCategoriesFromSupabase(true);
            store.categoriesData = data;
            renderCategories(data);
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
    try {
        console.log("Cargando verbos...");
        const { loadVerbsFromSupabase } = await import("./verbs/verbs-data.js");
        const data = await loadVerbsFromSupabase(forceRefresh);
        return data;
    } catch (error) {
        console.error("Error cargando verbos:", error);
        return [];
    }
};

async function initApp() {
    await checkUser();
    initializeBrowserAI();
    const data = await loadCategoriesFromSupabase();
    store.categoriesData = data;
    renderCategories(data);
    await initializePractice(data, { supabase, userId: store.currentUser?.id });
    window.refreshPracticeCategories = async function (options = {}) {
        await initializePractice(store.categoriesData, {
            supabase,
            userId: store.currentUser?.id,
            refreshVerbs: options.refreshVerbs !== false,
            refreshAIQueries: options.refreshAIQueries !== false
        });
    };
    window.refreshPracticeFavorites = async function () {
        await initializePractice(store.categoriesData, {
            supabase,
            userId: store.currentUser?.id,
            refreshVerbs: false,
            refreshAIQueries: false,
            skipProgressSync: true,
            favoritesChanged: true
        });
    };
    updateAIButton();
    setupEventListeners();

    setTimeout(() => {
        initSearchModeListeners();
    }, 100);
}

let mySentencesInitialized = false;
window.initializeMySentences = async function () {
    if (mySentencesInitialized) return;
    mySentencesInitialized = true;
    try {
        const { initializeSentencesApp } = await import("./sentences/app.js");
        await initializeSentencesApp();
    } catch (error) {
        mySentencesInitialized = false;
        console.error("Unable to initialize MySentences", error);
        window.alert("No se pudo abrir MySentences. Recarga la página e inténtalo de nuevo.");
    }
};

initApp();

export { supabase };