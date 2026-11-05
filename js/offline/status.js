/* Indicador de sincronización: cambios pendientes, sincronizando y
 * "Todo sincronizado". Se apoya en los eventos de js/offline/sync.js. */

import { onSyncState, refreshPending, flushOutbox } from "./sync.js";

const ELEMENT_ID = "sync-status";
let hideTimer = null;
let lastPending = null;

export function initSyncStatus() {
    if (typeof document === "undefined") return;

    let element = document.getElementById(ELEMENT_ID);
    if (!element) {
        element = document.createElement("button");
        element.id = ELEMENT_ID;
        element.type = "button";
        element.className = "sync-status hidden";
        element.setAttribute("role", "status");
        element.setAttribute("aria-live", "polite");
        element.innerHTML =
            '<span class="sync-status-dot" aria-hidden="true"></span>' +
            '<span class="sync-status-text" data-sync-message></span>';
        element.addEventListener("click", () => {
            if (element.dataset.retry === "true") {
                flushOutbox().catch(() => {});
            }
        });
        document.body.appendChild(element);
    }

    onSyncState(render);
    refreshPending();
}

function render(state) {
    const element = document.getElementById(ELEMENT_ID);
    if (!element) return;

    const pending = Number(state.pending) || 0;
    const text = element.querySelector("[data-sync-message]");
    if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
    }

    element.classList.remove("hidden", "is-offline", "is-pending", "is-syncing", "is-synced", "is-error");
    element.dataset.retry = "false";
    element.title = state.lastError || "";

    if (state.syncing) {
        element.classList.add("is-syncing");
        if (text) text.textContent = pending
            ? `Sincronizando ${pending} ${pending === 1 ? "cambio" : "cambios"}…`
            : "Sincronizando…";
        return;
    }

    if (!state.online) {
        if (pending > 0) {
            element.classList.add("is-offline");
            if (text) text.textContent = `Sin conexión · ${pending} ${pending === 1 ? "cambio pendiente" : "cambios pendientes"}`;
        } else {
            element.classList.add("hidden");
        }
        lastPending = pending;
        return;
    }

    if (pending > 0) {
        element.classList.add(state.lastError ? "is-error" : "is-pending");
        element.dataset.retry = "true";
        if (text) {
            text.textContent = state.lastError
                ? `${pending} ${pending === 1 ? "cambio pendiente" : "cambios pendientes"} · toca para reintentar`
                : `${pending} ${pending === 1 ? "cambio pendiente" : "cambios pendientes"} · se sincronizará solo`;
        }
        lastPending = pending;
        return;
    }

    // Acabamos de pasar de tener cambios a cero: confirmación breve.
    if (lastPending !== null && lastPending > 0) {
        element.classList.add("is-synced");
        if (text) text.textContent = "Todo sincronizado";
        hideTimer = setTimeout(() => {
            element.classList.add("hidden");
        }, 2600);
    } else {
        element.classList.add("hidden");
    }
    lastPending = pending;
}
