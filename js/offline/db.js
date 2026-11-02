/* Almacenamiento local con IndexedDB.
 *
 * Tres almacenes:
 *  - records: espejo de las tablas de Supabase. Clave: "<tabla>::<id>".
 *  - outbox:  cola de cambios pendientes de subir a la nube.
 *  - meta:    valores sueltos (por ejemplo, la última copia de las categorías).
 *
 * Todo el módulo falla de forma controlada si el navegador no permite
 * IndexedDB (modo privado muy restrictivo, por ejemplo).
 */

const DB_NAME = "visual-guide-offline";
const DB_VERSION = 1;

const RECORDS_STORE = "records";
const OUTBOX_STORE = "outbox";
const META_STORE = "meta";

let databasePromise = null;

export function isIndexedDbSupported() {
    try {
        return typeof indexedDB !== "undefined" && indexedDB !== null;
    } catch (error) {
        return false;
    }
}

export function openDatabase() {
    if (!isIndexedDbSupported()) {
        return Promise.reject(new Error("IndexedDB no está disponible en este navegador."));
    }
    if (databasePromise) return databasePromise;

    databasePromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(RECORDS_STORE)) {
                const store = db.createObjectStore(RECORDS_STORE, { keyPath: "key" });
                store.createIndex("table", "table", { unique: false });
            }
            if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
                const store = db.createObjectStore(OUTBOX_STORE, { keyPath: "id", autoIncrement: true });
                store.createIndex("table", "table", { unique: false });
            }
            if (!db.objectStoreNames.contains(META_STORE)) {
                db.createObjectStore(META_STORE, { keyPath: "key" });
            }
        };

        request.onsuccess = () => {
            const db = request.result;
            db.onversionchange = () => {
                db.close();
                databasePromise = null;
            };
            resolve(db);
        };

        request.onerror = () => reject(request.error || new Error("No se pudo abrir IndexedDB."));
        request.onblocked = () => reject(new Error("IndexedDB está bloqueada por otra pestaña."));
    }).catch((error) => {
        databasePromise = null;
        throw error;
    });

    return databasePromise;
}

function requestResult(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function withStore(storeName, mode, action) {
    const db = await openDatabase();
    const transaction = db.transaction(storeName, mode);
    const completed = new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error || new Error("Transacción cancelada."));
    });
    const store = transaction.objectStore(storeName);
    const result = await action(store);
    await completed;
    return result;
}

export function recordKey(table, id) {
    return `${table}::${id}`;
}

export async function putRecord(table, id, value) {
    const key = recordKey(table, id);
    await withStore(RECORDS_STORE, "readwrite", (store) => requestResult(store.put({
        key,
        table,
        id: String(id),
        value,
        savedAt: Date.now()
    })));
}

export async function putRecords(table, entries) {
    if (!entries.length) return;
    await withStore(RECORDS_STORE, "readwrite", (store) => {
        for (const entry of entries) {
            store.put({
                key: recordKey(table, entry.id),
                table,
                id: String(entry.id),
                value: entry.value,
                savedAt: Date.now()
            });
        }
        return null;
    });
}

async function tableKeys(table) {
    return withStore(RECORDS_STORE, "readonly", (store) =>
        requestResult(store.index("table").getAllKeys(IDBKeyRange.only(table)))
    );
}

export async function replaceTable(table, entries) {
    const keys = await tableKeys(table);
    await withStore(RECORDS_STORE, "readwrite", (store) => {
        for (const key of keys) store.delete(key);
        for (const entry of entries) {
            store.put({
                key: recordKey(table, entry.id),
                table,
                id: String(entry.id),
                value: entry.value,
                savedAt: Date.now()
            });
        }
        return null;
    });
}

export async function getRecord(table, id) {
    const row = await withStore(RECORDS_STORE, "readonly", (store) =>
        requestResult(store.get(recordKey(table, id)))
    );
    return row ? row.value : null;
}

export async function getRecords(table) {
    const rows = await withStore(RECORDS_STORE, "readonly", (store) =>
        requestResult(store.index("table").getAll(IDBKeyRange.only(table)))
    );
    return rows.map((row) => row.value);
}

export async function deleteRecord(table, id) {
    await withStore(RECORDS_STORE, "readwrite", (store) =>
        requestResult(store.delete(recordKey(table, id)))
    );
}

export async function clearTable(table) {
    const keys = await tableKeys(table);
    if (!keys.length) return;
    await withStore(RECORDS_STORE, "readwrite", (store) => {
        for (const key of keys) store.delete(key);
        return null;
    });
}

export async function getMeta(key) {
    const row = await withStore(META_STORE, "readonly", (store) => requestResult(store.get(key)));
    return row ? row.value : null;
}

export async function setMeta(key, value) {
    await withStore(META_STORE, "readwrite", (store) =>
        requestResult(store.put({ key, value, savedAt: Date.now() }))
    );
}

export async function addOutboxEntry(entry) {
    const payload = {
        ...entry,
        createdAt: entry.createdAt || Date.now(),
        attempts: entry.attempts || 0
    };
    return withStore(OUTBOX_STORE, "readwrite", (store) => requestResult(store.add(payload)));
}

export async function updateOutboxEntry(entry) {
    await withStore(OUTBOX_STORE, "readwrite", (store) => requestResult(store.put(entry)));
}

export async function listOutboxEntries() {
    return withStore(OUTBOX_STORE, "readonly", (store) => requestResult(store.getAll()));
}

export async function removeOutboxEntry(id) {
    await withStore(OUTBOX_STORE, "readwrite", (store) => requestResult(store.delete(id)));
}

export async function countOutboxEntries() {
    return withStore(OUTBOX_STORE, "readonly", (store) => requestResult(store.count()));
}

export async function clearOutboxEntries() {
    await withStore(OUTBOX_STORE, "readwrite", (store) => requestResult(store.clear()));
}

export async function clearAllOfflineData() {
    await withStore(RECORDS_STORE, "readwrite", (store) => requestResult(store.clear()));
    await withStore(OUTBOX_STORE, "readwrite", (store) => requestResult(store.clear()));
    await withStore(META_STORE, "readwrite", (store) => requestResult(store.clear()));
}
