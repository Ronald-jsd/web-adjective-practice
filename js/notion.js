import { store } from "./config.js";
import { showToast } from "./cache.js";

const PANEL_ID = "notion-integration-panel";
const SELECTION_STORAGE_PREFIX = "notion_selected_pages_v1:";
let initialized = false;
let supabaseClient;
let pages = [];
let selectedPageIds = new Set();

function selectionStorageKey(userId) {
    return `${SELECTION_STORAGE_PREFIX}${userId}`;
}

function readSelection(userId) {
    try {
        const stored = JSON.parse(localStorage.getItem(selectionStorageKey(userId)) || "[]");
        return new Set(Array.isArray(stored) ? stored.filter(id => typeof id === "string") : []);
    } catch (error) {
        console.warn("No se pudo leer la selección local de páginas de Notion:", error);
        return new Set();
    }
}

function writeSelection(userId, pageIds) {
    localStorage.setItem(selectionStorageKey(userId), JSON.stringify(pageIds));
}

function showMessage(message, type = "info") {
    const status = document.getElementById("notion-integration-status");
    if (!status) return;
    status.textContent = message;
    status.className = `mt-3 text-sm ${type === "error" ? "text-red-700" : type === "success" ? "text-green-700" : "text-gray-600"}`;
}

async function getFunctionErrorMessage(error, fallback) {
    const context = error?.context;
    if (context instanceof Response) {
        const body = await context.clone().text();
        if (body) {
            try {
                const payload = JSON.parse(body);
                if (payload?.error) return payload.error;
                if (payload?.message) return payload.message;
            } catch {
                return body.slice(0, 500);
            }
        }
        return `${error.message || fallback} (HTTP ${context.status})`;
    }
    return error?.message || fallback;
}

async function invoke(functionName, body) {
    const { data, error } = await supabaseClient.functions.invoke(functionName, { body });
    if (error) {
        const detail = await getFunctionErrorMessage(error, "Error al contactar el servicio.");
        throw new Error(detail);
    }
    if (data?.error) throw new Error(data.error);
    return data;
}

export async function loadNotionPracticeCategories(supabase, pageIds) {
    if (!pageIds.length) return [];
    if (pageIds.length > 20) {
        throw new Error("Carga hasta 20 páginas por operación.");
    }

    const categories = [];
    let totalItems = 0;
    for (let index = 0; index < pageIds.length; index += 1) {
        const { data, error } = await supabase.functions.invoke("notion-sync", {
            body: { action: "vocabulary", pageIds: [pageIds[index]] }
        });
        if (error) {
            const detail = await getFunctionErrorMessage(error, "Error al consultar Notion.");
            throw new Error(`Página ${index + 1} de ${pageIds.length}: ${detail}`);
        }
        if (data?.error) throw new Error(data.error);
        totalItems += Number(data?.totalItems) || 0;
        if (totalItems > 2000) {
            throw new Error("La selección supera las 2.000 tarjetas temporales. Selecciona menos páginas.");
        }
        categories.push(...(data?.categories || []));
    }
    return categories;
}

export function getSelectedNotionPageIds(userId) {
    return [...readSelection(userId)];
}

function pageDepth(page, pageById) {
    let depth = 0;
    let parentId = page.parent_page_id;
    const visited = new Set([page.page_id]);
    while (parentId && pageById.has(parentId) && depth < 5 && !visited.has(parentId)) {
        visited.add(parentId);
        depth += 1;
        parentId = pageById.get(parentId).parent_page_id;
    }
    return depth;
}

function renderPages() {
    const list = document.getElementById("notion-page-list");
    const syncButton = document.getElementById("notion-sync-selected");
    const saveSelection = document.getElementById("notion-save-selection");
    if (!list || !saveSelection || !syncButton) return;

    list.replaceChildren();
    if (!pages.length) {
        const empty = document.createElement("p");
        empty.className = "text-sm text-gray-500";
        empty.textContent = "No se encontraron páginas. Comparte las páginas de Notion con tu integración y vuelve a cargar.";
        list.appendChild(empty);
    }

    const pageById = new Map(pages.map(page => [page.page_id, page]));
    for (const page of pages) {
        const label = document.createElement("label");
        label.className = "flex items-start gap-3 rounded-lg border border-gray-200 bg-white p-3 hover:border-indigo-300";
        label.style.paddingLeft = `${12 + pageDepth(page, pageById) * 18}px`;
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = page.page_id;
        checkbox.checked = selectedPageIds.has(page.page_id);
        checkbox.className = "mt-1 accent-indigo-600";
        checkbox.addEventListener("change", () => {
            if (checkbox.checked && selectedPageIds.size >= 20) {
                checkbox.checked = false;
                showMessage("Puedes elegir hasta 20 páginas por carga temporal.", "error");
                return;
            }
            if (checkbox.checked) selectedPageIds.add(page.page_id);
            else selectedPageIds.delete(page.page_id);
            updateButtons();
        });
        const text = document.createElement("span");
        text.className = "min-w-0 text-sm text-gray-800";
        const title = document.createElement("span");
        title.className = "block font-medium";
        title.textContent = page.title;
        text.appendChild(title);
        const info = document.createElement("span");
        info.className = "block text-xs text-gray-500";
        info.textContent = page.parent_type === "database_id"
            ? "Página de una base de datos · carga temporal"
            : "Carga temporal desde Notion";
        text.appendChild(info);
        label.append(checkbox, text);
        list.appendChild(label);
    }
    updateButtons();
}

function updateButtons() {
    const saveSelection = document.getElementById("notion-save-selection");
    const syncButton = document.getElementById("notion-sync-selected");
    const selectedCount = selectedPageIds.size;
    if (saveSelection) saveSelection.disabled = !pages.length;
    if (syncButton) syncButton.disabled = selectedCount === 0;
}

async function loadPages() {
    showMessage("Cargando páginas compartidas con Notion...");
    try {
        const pageResult = await invoke("notion-sync", { action: "pages" });
        pages = pageResult.pages || [];
        const availableIds = new Set(pages.map(page => page.page_id));
        selectedPageIds = new Set([...readSelection(store.currentUser.id)]
            .filter(pageId => availableIds.has(pageId)));
        renderPages();
        showMessage(`${pages.length} páginas accesibles. El vocabulario solo se carga temporalmente al practicar.`, "success");
    } catch (error) {
        console.error("No se pudieron cargar las páginas de Notion:", error);
        showMessage(`No se pudieron cargar las páginas: ${error.message}`, "error");
    }
}

async function saveSelection(refreshPractice = true) {
    if (!store.currentUser) return false;
    const button = document.getElementById("notion-save-selection");
    if (button) {
        button.disabled = true;
        button.textContent = "Guardando...";
    }
    try {
        writeSelection(store.currentUser.id, [...selectedPageIds]);
        if (refreshPractice) {
            await window.refreshPracticeCategories?.({ refreshNotion: false });
        }
        showMessage("Selección guardada en este navegador. El vocabulario se carga temporalmente desde Notion.", "success");
        return true;
    } catch (error) {
        console.error("No se pudo guardar la selección de páginas:", error);
        showMessage(`No se pudo guardar la selección: ${error.message}`, "error");
        return false;
    } finally {
        if (button) {
            button.textContent = "Guardar selección";
            updateButtons();
        }
    }
}

async function syncSelectedPages() {
    if (!selectedPageIds.size) {
        showMessage("Selecciona al menos una página para cargar.", "error");
        return;
    }
    if (!await saveSelection(false)) return;
    const button = document.getElementById("notion-sync-selected");
    if (button) {
        button.disabled = true;
        button.textContent = "Cargando...";
    }
    showMessage("Cargando temporalmente el vocabulario seleccionado desde Notion...");
    try {
        const categories = await loadNotionPracticeCategories(supabaseClient, [...selectedPageIds]);
        window.setNotionPracticeCategories?.(categories);
        await window.refreshPracticeCategories?.({ refreshNotion: false });
        const total = categories.reduce((sum, category) =>
            sum + category.subcategories.reduce((subSum, subcategory) =>
                subSum + subcategory.items.length, 0), 0);
        showMessage(`Carga temporal completa: ${total} elementos de ${categories.length} páginas. Ya están seleccionados en Practicar; pulsa “Comenzar práctica”. No se guardaron en Supabase.`, "success");
    } catch (error) {
        console.error("No se pudo cargar el vocabulario de Notion:", error);
        showMessage(`No se pudo cargar desde Notion: ${error.message}`, "error");
    } finally {
        if (button) {
            button.textContent = "Cargar vocabulario temporal";
            updateButtons();
        }
    }
}

async function connectNotion() {
    if (!store.currentUser) {
        showToast("Inicia sesión antes de conectar Notion.", "warning");
        return;
    }
    const button = document.getElementById("notion-connect");
    if (button) {
        button.disabled = true;
        button.textContent = "Conectando...";
    }
    try {
        const { authorizeUrl } = await invoke("notion-connect", { action: "start" });
        window.location.assign(authorizeUrl);
    } catch (error) {
        console.error("No se pudo iniciar OAuth de Notion:", error);
        showMessage(`No se pudo conectar Notion: ${error.message}`, "error");
        if (button) {
            button.disabled = false;
            button.textContent = "Conectar Notion";
        }
    }
}

async function disconnectNotion() {
    if (!window.confirm("¿Desconectar Notion y quitar de Practicar las páginas seleccionadas?")) return;
    try {
        await invoke("notion-connect", { action: "disconnect" });
        pages = [];
        selectedPageIds.clear();
        try {
            localStorage.removeItem(selectionStorageKey(store.currentUser.id));
        } catch (error) {
            console.warn("No se pudo borrar la selección local de Notion:", error);
        }
        renderPages();
        window.setNotionPracticeCategories?.([]);
        await window.refreshPracticeCategories?.({ refreshNotion: true });
        updateConnectionView(false, null);
        showMessage("Notion se desconectó. La autorización de la integración también se puede revocar desde Notion.", "success");
    } catch (error) {
        console.error("No se pudo desconectar Notion:", error);
        showMessage(`No se pudo desconectar Notion: ${error.message}`, "error");
    }
}

function updateConnectionView(connected, workspaceName) {
    const connect = document.getElementById("notion-connect");
    const controls = document.getElementById("notion-connected-controls");
    const workspace = document.getElementById("notion-workspace-name");
    if (connect) connect.classList.toggle("hidden", connected);
    if (controls) controls.classList.toggle("hidden", !connected);
    if (workspace) workspace.textContent = workspaceName
        ? `Conectado a: ${workspaceName}`
        : connected ? "Notion está conectado." : "";
}

async function loadConnectionStatus() {
    if (!store.currentUser) {
        updateConnectionView(false, null);
        showMessage("Inicia sesión para conectar tu espacio de Notion.");
        return;
    }
    try {
        const status = await invoke("notion-connect", { action: "status" });
        updateConnectionView(status.connected, status.workspaceName);
        if (status.connected) await loadPages();
    } catch (error) {
        console.error("No se pudo consultar el estado de Notion:", error);
        showMessage(`No se pudo consultar Notion: ${error.message}`, "error");
    }
}

export function initializeNotionIntegration(supabase) {
    if (initialized) return;
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    initialized = true;
    supabaseClient = supabase;

    document.getElementById("notion-connect")?.addEventListener("click", connectNotion);
    document.getElementById("notion-load-pages")?.addEventListener("click", loadPages);
    document.getElementById("notion-save-selection")?.addEventListener("click", saveSelection);
    const syncButton = document.getElementById("notion-sync-selected");
    syncButton?.addEventListener("click", syncSelectedPages);
    if (syncButton) syncButton.textContent = "Cargar vocabulario temporal";
    document.getElementById("notion-disconnect")?.addEventListener("click", disconnectNotion);

    const url = new URL(window.location.href);
    const callbackState = url.searchParams.get("notion");
    if (callbackState) {
        showMessage(callbackState === "connected"
            ? "Notion se conectó correctamente."
            : "La conexión con Notion no se completó. Puedes intentarlo otra vez.",
        callbackState === "connected" ? "success" : "error");
        url.searchParams.delete("notion");
        url.searchParams.delete("message");
        window.history.replaceState({}, "", url);
    }
    loadConnectionStatus();
}
