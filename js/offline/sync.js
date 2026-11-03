/* Cola de cambios y sincronización automática con Supabase.
 *
 * Flujo:
 *  1. La interfaz escribe primero en IndexedDB (sensación instantánea).
 *  2. Cada cambio se añade a "outbox" con un identificador de cliente.
 *  3. Al volver la conexión, al volver a la app y cada minuto se vacía la cola.
 *  4. Los errores de red se reintentan; los errores permanentes se descartan
 *     para no bloquear la cola y se muestran en el estado de sincronización.
 */

import {
    addOutboxEntry,
    listOutboxEntries,
    removeOutboxEntry,
    updateOutboxEntry,
    countOutboxEntries,
    clearOutboxEntries,
    clearAllOfflineData
} from "./db.js";

const RETRYABLE_STATUS = new Set([0, 401, 408, 425, 429]);
const RETRYABLE_CODES = new Set([
    "PGRST301",
    "PGRST302",
    "PGRST204", // columna ausente: no se descarta el cambio
    "42703",    // columna ausente (Postgres)
    "428C9",    // id explícito rechazado por una columna identity ALWAYS
    "57014",
    "53300",
    "57P01"
]);

let client = null;
let getUser = () => null;
let flushing = false;
let started = false;
let pendingCache = 0;
let lastSyncAt = 0;
let lastError = null;
let scheduledFlush = null;

const stateListeners = new Set();

export function initOfflineSync(supabase, options = {}) {
    client = supabase || null;
    if (typeof options.getUserId === "function") getUser = options.getUserId;
    if (typeof options.onState === "function") stateListeners.add(options.onState);
    return api;
}

export function isOnline() {
    try {
        return typeof navigator === "undefined" || navigator.onLine !== false;
    } catch (error) {
        return true;
    }
}

export function getSyncState() {
    return {
        online: isOnline(),
        pending: pendingCache,
        syncing: flushing,
        lastSyncAt,
        lastError
    };
}

export function onSyncState(listener) {
    stateListeners.add(listener);
    try {
        listener(getSyncState());
    } catch (error) {
        console.warn("[offline] Error en el listener de sincronización:", error);
    }
    return () => stateListeners.delete(listener);
}

function emit() {
    const state = getSyncState();
    for (const listener of stateListeners) {
        try {
            listener(state);
        } catch (error) {
            console.warn("[offline] Error en el listener de sincronización:", error);
        }
    }
    if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("offline-sync-state", { detail: state }));
        window.dispatchEvent(new CustomEvent("offline-outbox-changed", { detail: state }));
    }
}

export async function refreshPending() {
    try {
        pendingCache = await countOutboxEntries();
    } catch (error) {
        console.warn("[offline] No se pudo contar la cola de cambios:", error);
    }
    emit();
    return pendingCache;
}

/* Añade un cambio a la cola. No espera a la red. */
export async function queueChange(change) {
    if (!change || !change.table || !change.action) {
        throw new Error("queueChange necesita table y action.");
    }
    const entry = {
        ...change,
        userId: change.userId !== undefined ? change.userId : getUser() || null
    };

    try {
        const id = await addOutboxEntry(entry);
        pendingCache += 1;
        emit();
        if (isOnline()) scheduleFlush(500);
        return id;
    } catch (error) {
        console.warn("[offline] No se pudo guardar el cambio en el dispositivo:", error);
        lastError = "No se pudo guardar el cambio en este dispositivo.";
        emit();
        return null;
    }
}

function scheduleFlush(delay = 0) {
    if (scheduledFlush) {
        clearTimeout(scheduledFlush);
    }
    scheduledFlush = setTimeout(() => {
        scheduledFlush = null;
        flushOutbox().catch((error) => console.warn("[offline] Error al sincronizar:", error));
    }, delay);
}

export async function flushOutbox(options = {}) {
    if (!client) return { skipped: true, pending: pendingCache };
    if (flushing) return { skipped: true, pending: pendingCache };
    if (!isOnline()) {
        emit();
        return { offline: true, pending: pendingCache };
    }

    flushing = true;
    lastError = null;
    emit();

    let processed = 0;
    let failed = 0;
    let remaining = pendingCache;

    try {
        const entries = await listOutboxEntries();
        entries.sort((a, b) => (a.id || 0) - (b.id || 0));

        for (const entry of entries) {
            const currentUser = getUser();
            if (!currentUser) break;
            if (entry.userId && entry.userId !== currentUser) continue;

            const outcome = await sendEntry(entry);
            if (outcome.ok) {
                await removeOutboxEntry(entry.id);
                processed += 1;
                pendingCache = Math.max(0, pendingCache - 1);
                continue;
            }

            if (outcome.retry) {
                failed += 1;
                lastError = outcome.message;
                await updateOutboxEntry({
                    ...entry,
                    attempts: (entry.attempts || 0) + 1,
                    lastError: outcome.message,
                    lastAttemptAt: Date.now()
                });
                // Sin red (o con el servidor caído) no tiene sentido seguir
                // intentando el resto de la cola en este momento.
                break;
            }

            // Error permanente: se descarta para que no bloquee la cola.
            failed += 1;
            lastError = outcome.message;
            await removeOutboxEntry(entry.id);
            pendingCache = Math.max(0, pendingCache - 1);
            console.warn("[offline] Cambio descartado por un error permanente:", entry, outcome.message);
        }
    } catch (error) {
        lastError = error?.message || String(error);
        console.warn("[offline] No se pudo vaciar la cola:", error);
    } finally {
        flushing = false;
        lastSyncAt = Date.now();
        try {
            remaining = await countOutboxEntries();
            pendingCache = remaining;
        } catch (error) {
            remaining = pendingCache;
        }
        emit();
    }

    if (!options.silent && processed > 0 && remaining === 0) {
        if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("offline-sync-complete"));
        }
    }

    return { processed, failed, pending: remaining, error: lastError };
}

async function sendEntry(entry) {
    try {
        const table = client.from(entry.table);
        let query;

        if (entry.action === "upsert") {
            query = entry.conflict
                ? table.upsert(entry.payload, { onConflict: entry.conflict })
                : table.upsert(entry.payload);
        } else if (entry.action === "update") {
            query = table.update(entry.payload);
            for (const [column, value] of Object.entries(entry.match || {})) {
                query = query.eq(column, value);
            }
        } else if (entry.action === "delete") {
            query = table.delete();
            for (const [column, value] of Object.entries(entry.match || {})) {
                query = query.eq(column, value);
            }
        } else {
            return { ok: false, retry: false, message: `Acción desconocida: ${entry.action}` };
        }

        const { error } = await query;
        if (!error) return { ok: true };
        return classifySyncError(error);
    } catch (error) {
        return classifySyncError(error);
    }
}

export function classifySyncError(error) {
    const message = error?.message || String(error || "Error desconocido");
    const status = Number(error?.status || error?.statusCode || 0);
    const code = String(error?.code || "");
    const name = String(error?.name || "");
    const networkish =
        name === "TypeError" ||
        name === "AbortError" ||
        /fetch|network|load failed|failed to fetch|timeout|timed out|offline/i.test(message);

    const retry =
        networkish ||
        RETRYABLE_STATUS.has(status) ||
        status >= 500 ||
        RETRYABLE_CODES.has(code);

    return { ok: false, retry, status, code, message };
}

export async function clearOfflineData() {
    try {
        await clearOutboxEntries();
        await clearAllOfflineData();
    } catch (error) {
        console.warn("[offline] No se pudieron borrar los datos locales:", error);
    }
    pendingCache = 0;
    lastError = null;
    lastSyncAt = 0;
    emit();
}

export function startAutoSync() {
    if (started || typeof window === "undefined") return;
    started = true;

    const trigger = () => {
        if (isOnline()) scheduleFlush(200);
    };

    window.addEventListener("online", () => {
        emit();
        trigger();
    });
    window.addEventListener("offline", emit);
    window.addEventListener("app-online", trigger);
    window.addEventListener("app-foreground", trigger);
    window.addEventListener("app-flush-outbox", trigger);
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") trigger();
    });

    window.setInterval(() => {
        if (isOnline()) trigger();
    }, 60 * 1000);

    registerBackgroundSync();

    refreshPending().then(() => {
        if (isOnline() && pendingCache > 0) scheduleFlush(1200);
    });
}

async function registerBackgroundSync() {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    try {
        const registration = await navigator.serviceWorker.ready;
        if ("sync" in registration) {
            await registration.sync.register("sync-outbox");
        }
    } catch (error) {
        // iOS y algunos navegadores no soportan Background Sync. La app
        // sincroniza igualmente al abrirse o al volver a primer plano.
    }
}

/* API de depuración y para pruebas manuales desde la consola. */
const api = {
    flushOutbox,
    refreshPending,
    getSyncState,
    clearOfflineData
};

if (typeof window !== "undefined") {
    window.offlineSync = api;
}
