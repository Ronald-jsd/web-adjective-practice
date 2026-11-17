import { splitTranscriptSegments } from "./model.js"
import { cacheSnapshot, readSnapshot } from "../offline/cache.js"

/* Configuración de la transcripción automática.
 * La clave vive solo en este dispositivo (localStorage) y se envía a la
 * Edge Function para consultar al proveedor. Nunca se guarda en la nube. */

export const TRANSCRIPT_KEY_STORAGE = "shadowing_transcript_api_key"
export const TRANSCRIPT_PROVIDER_STORAGE = "shadowing_transcript_provider"

export const TRANSCRIPT_PROVIDERS = [
    {
        id: "supadata",
        label: "Supadata",
        signupUrl: "https://supadata.ai",
        freePlan: "Plan gratis: ~100 transcripciones al mes.",
        steps: [
            "Entra en supadata.ai y crea una cuenta gratis.",
            "Copia la API key del panel de Supadata.",
            "Pégala aquí y guarda."
        ]
    },
    {
        id: "transcriptfetch",
        label: "TranscriptFetch",
        signupUrl: "https://transcriptfetch.com/sign-up",
        freePlan: "50 créditos gratis al registrarte, sin tarjeta.",
        steps: [
            "Regístrate en transcriptfetch.com (sin tarjeta).",
            "Copia la clave de tu cuenta.",
            "Pégala aquí y guarda."
        ]
    }
]

function storage() {
    try {
        return globalThis.localStorage || null
    } catch {
        return null
    }
}

export function findProvider(id) {
    return TRANSCRIPT_PROVIDERS.find(provider => provider.id === id) || TRANSCRIPT_PROVIDERS[0]
}

export function getTranscriptProvider() {
    const value = storage()?.getItem(TRANSCRIPT_PROVIDER_STORAGE) || ""
    return TRANSCRIPT_PROVIDERS.some(provider => provider.id === value) ? value : TRANSCRIPT_PROVIDERS[0].id
}

export function getTranscriptKey() {
    return storage()?.getItem(TRANSCRIPT_KEY_STORAGE) || ""
}

export function setTranscriptCredentials(provider, apiKey) {
    const store = storage()
    if (!store) return false
    const key = String(apiKey || "").trim()
    if (!key) return false
    store.setItem(TRANSCRIPT_PROVIDER_STORAGE, findProvider(provider).id)
    store.setItem(TRANSCRIPT_KEY_STORAGE, key)
    return true
}

export function clearTranscriptCredentials() {
    const store = storage()
    if (!store) return
    store.removeItem(TRANSCRIPT_KEY_STORAGE)
}

export function transcriptConfig() {
    const apiKey = getTranscriptKey()
    return {
        provider: getTranscriptProvider(),
        apiKey,
        configured: Boolean(apiKey)
    }
}

export function providerLabel(id) {
    return findProvider(id).label
}

function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim()
}

/* Convierte texto plano sin tiempos en frases con duraciones estimadas. */
export function segmentsFromPlainText(text) {
    const lines = String(text || "")
        .split(/\n+/)
        .map(line => cleanText(line))
        .filter(Boolean)
    const cues = []
    let cursor = 0
    for (const line of lines) {
        const words = line.split(/\s+/).filter(Boolean).length
        const duration = Math.max(2, words * 0.45)
        cues.push({ start: cursor, duration, text: line })
        cursor += duration
    }
    return splitTranscriptSegments(cues)
}

function cuesFromItems(items, scale) {
    return items.map(item => {
        const cue = item || {}
        const start = Number(cue.start ?? cue.offset ?? 0) * scale
        const rawDuration = cue.duration ?? (Number(cue.end ?? 0) - Number(cue.start ?? cue.offset ?? 0))
        const duration = Math.max(0.3, Number(rawDuration || 0) * scale)
        return {
            start: Number.isFinite(start) ? Math.max(0, start) : 0,
            duration: Number.isFinite(duration) ? duration : 1,
            text: cleanText(cue.text)
        }
    }).filter(cue => cue.text)
}

/* Normaliza la respuesta de cada proveedor a segmentos con tiempos en segundos.
 * Supadata devuelve `content` con offset/duración en milisegundos.
 * TranscriptFetch devuelve `segments` con start/duración en segundos. */
export function normalizeProviderSegments(provider, payload) {
    if (!payload) return []
    if (typeof payload === "string") return segmentsFromPlainText(payload)

    const isSupadata = provider === "supadata"
    const raw = isSupadata
        ? payload.content
        : (payload.segments || payload.structuredContent?.segments)

    if (typeof raw === "string") return segmentsFromPlainText(raw)
    if (!Array.isArray(raw)) {
        return typeof payload.text === "string" ? segmentsFromPlainText(payload.text) : []
    }

    const cues = cuesFromItems(raw, isSupadata ? 1 / 1000 : 1)
    if (!cues.length) return []
    return splitTranscriptSegments(cues)
}

/* Caché local de transcripciones ya descargadas.
 * Evita volver a gastar créditos del proveedor para el mismo video y
 * permite reabrir la lección sin conexión. */
const TRANSCRIPT_CACHE_PREFIX = "shadowing-transcript:"
const TRANSCRIPT_CACHE_INDEX = "shadowing-transcript-index"
const TRANSCRIPT_CACHE_LIMIT = 40

export async function readTranscriptCache(videoId) {
    if (!videoId) return null
    const cached = await readSnapshot(TRANSCRIPT_CACHE_PREFIX + videoId)
    if (!cached || !Array.isArray(cached.segments) || !cached.segments.length) return null
    return cached
}

export async function writeTranscriptCache(videoId, payload) {
    if (!videoId || !Array.isArray(payload?.segments) || !payload.segments.length) return
    const entry = {
        videoId,
        title: String(payload.title || ""),
        language: String(payload.language || "en"),
        source: String(payload.source || "auto"),
        segments: payload.segments,
        savedAt: new Date().toISOString()
    }
    await cacheSnapshot(TRANSCRIPT_CACHE_PREFIX + videoId, entry)

    const previous = (await readSnapshot(TRANSCRIPT_CACHE_INDEX)) || []
    const next = [{ videoId, savedAt: entry.savedAt }, ...previous.filter(item => item?.videoId !== videoId)]
        .slice(0, TRANSCRIPT_CACHE_LIMIT)
    const keep = new Set(next.map(item => item.videoId))
    for (const item of previous) {
        if (item?.videoId && !keep.has(item.videoId)) {
            await cacheSnapshot(TRANSCRIPT_CACHE_PREFIX + item.videoId, null)
        }
    }
    await cacheSnapshot(TRANSCRIPT_CACHE_INDEX, next)
}
