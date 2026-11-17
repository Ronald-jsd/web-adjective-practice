import { playAudioEnhanced } from "../audio.js"

/* Pronunciación gratuita sin IA:
 *  1) voz del navegador (funciona sin internet con voces locales),
 *  2) audio y IPA del diccionario público dictionaryapi.dev (gratis, sin key). */

const PRONUNCIATION_CACHE = "shadowing_pronunciation_v2"

function readCache() {
    try {
        return JSON.parse(localStorage.getItem(PRONUNCIATION_CACHE) || "{}") || {}
    } catch (error) {
        return {}
    }
}

function remember(term, data) {
    try {
        const cache = readCache()
        const keys = Object.keys(cache)
        if (keys.length >= 600) delete cache[keys[0]]
        cache[term] = data
        localStorage.setItem(PRONUNCIATION_CACHE, JSON.stringify(cache))
    } catch (error) {
        /* sin espacio: se ignora */
    }
}

export function speakPhrase(text, lang = "en") {
    return playAudioEnhanced(text, lang)
}

export function speakWordInstant(word) {
    return playAudioEnhanced(word, "en")
}

/* Devuelve { ipa, audio } desde la caché o desde el diccionario público. */
export async function getPronunciation(word) {
    const term = String(word || "").trim().toLowerCase()
    if (!term) return null
    const cached = readCache()[term]
    if (cached && typeof cached === "object") return cached

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 1800)
    try {
        const response = await fetch(
            `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(term)}`,
            { signal: controller.signal }
        )
        if (!response.ok) return null
        const data = await response.json()
        const phonetics = data?.[0]?.phonetics || []
        const withAudio = phonetics.find(item => item?.audio)
        const withText = phonetics.find(item => item?.text)
        const entry = {
            ipa: String(withText?.text || data?.[0]?.phonetic || "").trim(),
            audio: String(withAudio?.audio || "").trim()
        }
        if (entry.ipa || entry.audio) {
            remember(term, entry)
            return entry
        }
    } catch (error) {
        return null
    } finally {
        clearTimeout(timer)
    }
    return null
}

/* Reproduce una palabra garantizando una sola fuente de sonido:
 * si ya tenemos el audio real del diccionario, se usa él; si no, la voz del
 * dispositivo. Nunca se cancela una voz que acaba de empezar ( eso era lo
 * que dejaba mudas a algunas palabras). */
export async function playWordPronunciation(word) {
    const term = String(word || "").trim()
    if (!term) return false
    const cached = readCache()[term.toLowerCase()]
    const url = typeof cached === "object" ? cached?.audio : cached
    if (url && await playAudioUrl(url)) return true
    return Boolean(speakWordInstant(term))
}

function playAudioUrl(url) {
    return new Promise(resolve => {
        try {
            const audio = new Audio(url.startsWith("//") ? `https:${url}` : url)
            const done = result => {
                clearTimeout(timer)
                resolve(result)
            }
            const timer = setTimeout(() => {
                try { audio.pause() } catch { /* ignore */ }
                done(false)
            }, 900)
            audio.addEventListener("canplay", () => {
                audio.play().then(() => done(true)).catch(() => done(false))
            }, { once: true })
            audio.addEventListener("error", () => done(false), { once: true })
            audio.preload = "auto"
            audio.load()
        } catch (error) {
            resolve(false)
        }
    })
}
