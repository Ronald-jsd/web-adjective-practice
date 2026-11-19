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

const RETRYABLE_STATUS = new Set([401, 408, 425, 429]);
const RETRYABLE_CODES = new Set([
    "PGRST301",
    "PGRST302",
    "428C9",    // id explícito rechazado por una columna identity ALWAYS
    "57014",
    "53300",
    "57P01"
]);

const RETRY_BASE_MS = 5 * 1000;
const RETRY_MAX_MS = 5 * 60 * 1000;

/* Espera exponencial entre reintentos del mismo cambio. */
export function retryDelayFor(attempts) {
    const n = Math.max(0, Math.min(Number(attempts) || 0, 10));
    return Math.min(RETRY_MAX_MS, RETRY_BASE_MS * (2 ** n));
}

/* Solo se agrupan entradas contiguas y compatibles: el orden de la cola se
 * conserva y un lote nunca mezcla usuarios ni formas de payload distintas. */
function batchSignature(entry) {
    if (!entry || !entry.table) return null;
    const user = entry.userId || "";
    if (entry.action === "upsert" && entry.payload && typeof entry.payload === "object"
        && !Array.isArray(entry.payload)) {
        const keys = Object.keys(entry.payload).sort().join(",");
        return `upsert|${user}|${entry.table}|${entry.conflict || ""}|${keys}`;
    }
    if (entry.action === "delete" && entry.match && typeof entry.match === "object") {
        const keys = Object.keys(entry.match);
        if (keys.length !== 1) return null;
        const value = entry.match[keys[0]];
        if (value === null || value === undefined) return null;
        return `delete|${user}|${entry.table}|${keys[0]}`;
    }
    return null;
}

export function groupOutboxEntries(entries) {
    const ordered = [...(entries || [])].sort((a, b) => (a.id || 0) - (b.id || 0));
    const groups = [];
    for (const entry of ordered) {
        const signature = batchSignature(entry);
        const last = groups[groups.length - 1];
        if (signature && last && last.signature === signature) {
            last.entries.push(entry);
        } else {
            groups.push({ signature, entries: [entry] });
        }
    }
    return groups;
}

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
        const context = { refreshed: false };
        const groups = groupOutboxEntries(entries);
        let nextRetryIn = Infinity;
        let stop = false;

        for (const group of groups) {
            if (stop) break;
            const currentUser = getUser();
            if (!currentUser) break;

            const usable = group.entries.filter(entry => !entry.userId || entry.userId === currentUser);
            if (!usable.length) continue;

            // Un cambio que falló hace poco espera su backoff en vez de
            // volver a pedirle a Supabase lo mismo cada minuto.
            const ready = [];
            for (const entry of usable) {
                const delay = retryDelayFor(entry.attempts || 0);
                const elapsed = Date.now() - Number(entry.lastAttemptAt || 0);
                if ((entry.attempts || 0) > 0 && entry.lastAttemptAt && elapsed < delay) {
                    nextRetryIn = Math.min(nextRetryIn, Math.max(1, delay - elapsed));
                } else {
                    ready.push(entry);
                }
            }
            if (!ready.length) continue;

            if (group.signature && ready.length > 1) {
                const outcome = await sendBatch({ ...group, entries: ready });
                if (outcome.ok) {
                    for (const entry of ready) {
                        await removeOutboxEntry(entry.id);
                        processed += 1;
                        pendingCache = Math.max(0, pendingCache - 1);
                    }
                    continue;
                }
                // Si el lote falla, se envían uno por uno para conservar el
                // diagnóstico y el reintento independiente de cada cambio.
                console.warn("[offline] No se pudo agrupar el lote; se envía cambio por cambio:", outcome.message);
            }

            for (const entry of ready) {
                const outcome = await sendEntry(entry, context);
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
                    console.warn(
                        `[offline] No se pudo sincronizar "${entry.description || entry.table}":`,
                        outcome.message
                    );
                    // Sin red, con el servidor caído o con límite de peticiones
                    // no tiene sentido seguir. Otros errores reintentables no
                    // deben bloquear al resto.
                    if (outcome.networkish || outcome.status === 429 || outcome.status >= 500) {
                        stop = true;
                        break;
                    }
                    continue;
                }

                // Error permanente: se descarta para que no bloquee la cola.
                failed += 1;
                lastError = outcome.message;
                await removeOutboxEntry(entry.id);
                pendingCache = Math.max(0, pendingCache - 1);
                console.warn("[offline] Cambio descartado por un error permanente:", entry, outcome.message);
            }
        }

        if (!stop && Number.isFinite(nextRetryIn)) {
            scheduleFlush(Math.ceil(nextRetryIn));
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

async function sendBatch(group) {
    const first = group.entries[0];
    if (first.action === "upsert") {
        const payloads = group.entries.map(entry => entry.payload);
        const table = client.from(first.table);
        const query = first.conflict
            ? table.upsert(payloads, { onConflict: first.conflict })
            : table.upsert(payloads);
        const { error } = await query;
        return error ? classifySyncError(error) : { ok: true };
    }
    if (first.action === "delete") {
        const key = Object.keys(first.match)[0];
        const values = group.entries.map(entry => entry.match[key]);
        const { error } = await client.from(first.table).delete().in(key, values);
        return error ? classifySyncError(error) : { ok: true };
    }
    return { ok: false, retry: false, message: "Acción no agrupable" };
}

async function sendOnce(entry) {
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
}

function extractMissingColumn(message) {
    const text = String(message || "");
    return text.match(/Could not find the '([^']+)' column/i)?.[1]
        || text.match(/column "([^"]+)" does not exist/i)?.[1]
        || text.match(/column '([^']+)' does not exist/i)?.[1]
        || null;
}

/* Si la tabla ya no tiene una columna del payload, se quita y se reintenta.
 * Así un cambio antiguo no bloquea la cola para siempre. */
function withoutMissingColumn(entry, error) {
    if (!entry.payload || typeof entry.payload !== "object") return null;
    if (!["PGRST204", "42703"].includes(error.code)) return null;
    const column = extractMissingColumn(error.message);
    if (!column || !Object.prototype.hasOwnProperty.call(entry.payload, column)) return null;
    const payload = { ...entry.payload };
    delete payload[column];
    if (!Object.keys(payload).length) return null;
    return { ...entry, payload };
}

async function sendEntry(entry, context = {}) {
    try {
        const outcome = await sendOnce(entry);
        if (outcome.ok) return outcome;

        const cleaned = withoutMissingColumn(entry, outcome);
        if (cleaned) {
            console.warn(`[offline] La columna "${extractMissingColumn(outcome.message)}" ya no existe; se omite en "${entry.description || entry.table}".`);
            const retried = await sendOnce(cleaned);
            return retried.ok ? { ok: true } : retried;
        }

        // Un token caducado se puede recuperar: se fuerza una sola renovación
        // por vaciado de cola y se reintenta el cambio.
        if (outcome.status === 401 && !context.refreshed && client?.auth?.refreshSession) {
            context.refreshed = true;
            try {
                await client.auth.refreshSession();
                return await sendEntry(entry, context);
            } catch (refreshError) {
                return classifySyncError(refreshError);
            }
        }

        return outcome;
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
        name === "AuthRetryableFetchError" ||
        /fetch|network|load failed|failed to fetch|timeout|timed out|offline/i.test(message);

    // Un error de PostgREST sin estado HTTP (status 0) no es un fallo de red:
    // puede ser una columna inexistente, un duplicado o una regla RLS. Antes
    // se reintentaba para siempre y bloqueaba el resto de la cola.
    const retry =
        networkish ||
        (status > 0 && (RETRYABLE_STATUS.has(status) || status >= 500)) ||
        RETRYABLE_CODES.has(code);

    return { ok: false, retry, networkish, status, code, message };
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
