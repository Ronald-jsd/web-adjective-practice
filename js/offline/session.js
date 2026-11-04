/* Espejo local de la sesión.
 *
 * Supabase guarda la sesión en localStorage, pero al arrancar sin red puede
 * fallar el refresco del token y `getSession()` devolver null. Este módulo
 * conserva una copia propia del usuario para que la app siga considerándolo
 * identificado mientras no haya conexión.
 *
 * La copia nunca sustituye a una validación real: al volver la conexión,
 * js/auth.js vuelve a comprobar el token con Supabase.
 */

import { getMeta, setMeta } from "./db.js"

const STORAGE_KEY = "visual_guide_session_user"
const AUTH_TOKEN_PREFIX = "sb-"
const AUTH_TOKEN_SUFFIX = "-auth-token"

function getStorage() {
    try {
        return typeof localStorage !== "undefined" ? localStorage : null
    } catch (error) {
        return null
    }
}

function safeParse(value) {
    try {
        return JSON.parse(value)
    } catch (error) {
        return null
    }
}

function normalizeUser(user) {
    if (!user || typeof user !== "object" || !user.id) return null
    return {
        id: String(user.id),
        email: user.email || "",
        phone: user.phone || "",
        role: user.role || "authenticated",
        aud: user.aud || "authenticated",
        created_at: user.created_at || null,
        updated_at: user.updated_at || null,
        user_metadata: user.user_metadata || {},
        app_metadata: user.app_metadata || {}
    }
}

/* Guarda el usuario en localStorage (síncrono) y en IndexedDB (respaldo). */
export function rememberUser(user) {
    const normalized = normalizeUser(user)
    if (!normalized) return null

    const storage = getStorage()
    if (storage) {
        try {
            storage.setItem(STORAGE_KEY, JSON.stringify(normalized))
        } catch (error) {
            console.warn("[offline] No se pudo guardar la sesión en localStorage:", error)
        }
    }
    setMeta(STORAGE_KEY, normalized).catch(() => {})
    return normalized
}

export function forgetUser() {
    const storage = getStorage()
    if (storage) {
        try {
            storage.removeItem(STORAGE_KEY)
        } catch (error) {
            console.warn("[offline] No se pudo borrar la sesión guardada:", error)
        }
    }
    setMeta(STORAGE_KEY, null).catch(() => {})
}

export function readRememberedUser() {
    const storage = getStorage()
    if (!storage) return null
    return normalizeUser(safeParse(storage.getItem(STORAGE_KEY)))
}

async function readRememberedUserFromDb() {
    try {
        return normalizeUser(await getMeta(STORAGE_KEY))
    } catch (error) {
        return null
    }
}

/* Supabase puede guardar el token en una sola clave o dividido en trozos. */
function readTokenValue(storage, baseKey) {
    const raw = storage.getItem(baseKey)
    if (raw) return safeParse(raw)

    const parts = []
    for (let index = 0; ; index += 1) {
        const chunk = storage.getItem(`${baseKey}.${index}`)
        if (!chunk) break
        parts.push(chunk)
    }
    if (!parts.length) return null
    return safeParse(parts.join(""))
}

/* Lee el usuario directamente del token que guarda Supabase. */
export function readStoredSessionUser() {
    const storage = getStorage()
    if (!storage) return null

    let keys = []
    try {
        keys = Object.keys(storage)
    } catch (error) {
        return null
    }

    // Supabase puede guardar el token en una sola clave o dividirlo en
    // "…-auth-token.0", "…-auth-token.1", etc.
    const baseKeys = new Set()
    for (const key of keys) {
        if (!key.startsWith(AUTH_TOKEN_PREFIX)) continue
        const chunk = key.match(/^(.*-auth-token)\.(\d+)$/)
        if (chunk) {
            baseKeys.add(chunk[1])
        } else if (key.endsWith(AUTH_TOKEN_SUFFIX)) {
            baseKeys.add(key)
        }
    }

    for (const baseKey of baseKeys) {
        const session = readTokenValue(storage, baseKey)
        const user = normalizeUser(session?.user)
        if (user) return user
    }
    return null
}

/* Respaldo local: token de Supabase, espejo propio o IndexedDB. */
export async function readLocalSessionUser() {
    return readStoredSessionUser() || readRememberedUser() || await readRememberedUserFromDb()
}

/* Devuelve el usuario aunque `getSession()` falle sin conexión. */
export async function resolveSessionUser(supabase) {
    let user = null

    if (supabase?.auth?.getSession) {
        try {
            const { data, error } = await supabase.auth.getSession()
            if (!error) user = normalizeUser(data?.session?.user)
        } catch (error) {
            console.warn("No se pudo leer la sesión de Supabase; se usa la copia local.", error)
        }
    }

    if (!user) user = await readLocalSessionUser()
    if (user) rememberUser(user)
    return user
}

/* Distingue una sesión realmente inválida de un fallo de red. */
export function isInvalidSessionError(error) {
    if (!error) return false

    const name = String(error.name || "")
    const code = String(error.code || "")
    const message = String(error.message || "").toLowerCase()

    if (name === "AuthSessionMissingError") return true
    if (name === "AuthInvalidJwtError" || name === "AuthInvalidTokenResponseError") return true
    if (["bad_jwt", "session_not_found", "refresh_token_not_found", "invalid_token"].includes(code)) return true
    if (/invalid (jwt|token)|token (is )?(invalid|expired)|session (not found|missing)|refresh token (not found|revoked|invalid)/.test(message)) return true

    return false
}

export { STORAGE_KEY as SESSION_MIRROR_KEY }
