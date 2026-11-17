import { playAudioEnhanced } from "../audio.js"

/* Pronunciación gratuita sin IA:
 *  1) voz del navegador (funciona sin internet con voces locales),
 *  2) audio real del diccionario público dictionaryapi.dev (gratis, sin key). */

const AUDIO_CACHE_STORAGE = "shadowing_pronunciation_audio_v1"

function readCache() {
    try {
        return JSON.parse(localStorage.getItem(AUDIO_CACHE_STORAGE) || "{}") || {}
    } catch (error) {
        return {}
    }
}

function remember(word, url) {
    try {
        const cache = readCache()
        const keys = Object.keys(cache)
        if (keys.length >= 400) delete cache[keys[0]]
        cache[word] = url
        localStorage.setItem(AUDIO_CACHE_STORAGE, JSON.stringify(cache))
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

async function findDictionaryAudio(word) {
    const term = String(word || "").trim().toLowerCase()
    if (!term) return ""
    const cached = readCache()[term]
    if (cached) return cached
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 1800)
    try {
        const response = await fetch(
            `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(term)}`,
            { signal: controller.signal }
        )
        if (!response.ok) return ""
        const data = await response.json()
        const phonetic = (data?.[0]?.phonetics || []).find(item => item?.audio)
        const url = phonetic?.audio || ""
        if (url) remember(term, url)
        return url
    } catch (error) {
        return ""
    } finally {
        clearTimeout(timer)
    }
}

/* Reproduce la palabra al instante con la voz del dispositivo. Si el
 * diccionario público tiene audio real, sustituye la voz sintética. */
export async function playWordPronunciation(word) {
    const term = String(word || "").trim()
    if (!term) return false
    const utterance = speakWordInstant(term)
    const url = await findDictionaryAudio(term)
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
