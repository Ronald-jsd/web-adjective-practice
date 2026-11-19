/* Frescura de los catálogos descargados de Supabase.
 *
 * Los catálogos completos (categorías y verbos) pesan casi 2 MB juntos. Con
 * la copia en el espejo offline basta con bajarlos una vez al día: mientras la
 * marca sea válida se reutiliza el dispositivo y no se toca la red. Las
 * ediciones siguen usando forceRefresh para ignorar esta marca. */

import { CACHE_DURATION } from "./config.js"

export const CATALOG_FRESHNESS_PREFIX = "catalog_fresh_"

const storageKey = name => `${CATALOG_FRESHNESS_PREFIX}${name}`

export function isCatalogFresh(name, now = Date.now()) {
    try {
        const raw = localStorage.getItem(storageKey(name))
        if (!raw) return false
        const timestamp = Number(raw)
        if (!Number.isFinite(timestamp)) return false
        return timestamp <= now && now - timestamp < CACHE_DURATION
    } catch (error) {
        return false
    }
}

export function markCatalogFresh(name, timestamp = Date.now()) {
    try {
        localStorage.setItem(storageKey(name), String(timestamp))
    } catch (error) {
        // Sin localStorage se sigue consultando la red como antes.
    }
}
