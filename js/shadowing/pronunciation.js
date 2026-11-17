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

/* Reproduce la palabra al instante con la voz del dispositivo. Si el
 * diccionario público tiene audio real, sustituye la voz sintética. */
export async function playWordPronunciation(word) {
    const term = String(word || "").trim()
    if (!term) return false
    const utterance = speakWordInstant(term)
    const data = await getPronunciation(term)
    const url = data?.audio || ""
    if (!url) return Boolean(utterance)
    try {
        window.speechSynthesis?.cancel()
        const audio = new Audio(url.startsWith("//") ? `https:${url}` : url)
        await audio.play()
        return true
    } catch (error) {
        console.warn("[shadowing] No se pudo reproducir el audio del diccionario:", error)
        return Boolean(utterance)
    }
}
