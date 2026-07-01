import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY, store } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

import { checkUser } from "./auth.js";
import { renderCategories, loadCategoriesFromSupabase } from "./data.js";
import { performSearch, initSearchModeListeners } from "./search.js";
import { closeCategoryView } from "./category-view.js";
import { updateAIButton } from "./ai.js";

function setupEventListeners() {
    const searchInput = document.getElementById("global-search");
    const clearBtn = document.getElementById("clear-search");
    const backBtn = document.getElementById("back-to-categories");

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
    const data = await loadCategoriesFromSupabase();
    store.categoriesData = data;
    renderCategories(data);
    updateAIButton();
    setupEventListeners();

    setTimeout(() => {
        initSearchModeListeners();
    }, 100);
}

initApp();

export { supabase };