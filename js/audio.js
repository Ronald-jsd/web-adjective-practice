/* Voz unificada para toda la aplicación.
 *
 * Todas las secciones (adjetivos, verbos, búsqueda, práctica, mi aprendizaje,
 * grupos de palabras y Shadowing) usan este módulo. Así se consigue la misma
 * voz fluida en todas partes y el usuario puede elegir la suya propia. */

const VOICE_PREF_STORAGE = "speech_voice_preferences_v1"
const DEFAULT_RATE = 0.92

let currentUtterance = null
let voicesReady = false

/* Puntúa una voz para elegir la más natural disponible en el dispositivo. */
export function voiceScore(voice, lang = "en") {
    if (!voice) return -Infinity
    const name = String(voice.name || "")
    const lower = name.toLowerCase()
    const voiceLang = String(voice.lang || "")
    const wantsEs = lang.startsWith("es")

    let score = 0
    if (wantsEs) {
        if (voiceLang === "es-ES") score += 100
        else if (voiceLang.startsWith("es")) score += 70
        else if (voiceLang.startsWith("es-")) score += 65
        else score -= 100
    } else {
        if (voiceLang === "en-US") score += 100
        else if (voiceLang === "en-GB") score += 85
        else if (voiceLang.startsWith("en")) score += 70
        else score -= 100
    }

    // Voces naturales/neurales suenan mucho más fluidas que las clásicas.
    if (/natural|neural|premium|studio/i.test(lower)) score += 90
    if (/\bava\b|jenny|aria|emma|elvira|helena|samantha|google us english|google uk english female|mónica|monica/i.test(lower)) score += 55
    if (/\bkaren\b|zira|daniel|pablo|google español|google spanish/i.test(lower)) score += 35
    if (/\bdavid\b|\balex\b|espeak|compact|robot/i.test(lower)) score -= 25
    if (voice.localService === false) score += 8
    return score
}

function readPreferences() {
    try {
        const raw = localStorage.getItem(VOICE_PREF_STORAGE)
        const parsed = raw ? JSON.parse(raw) : null
        return parsed && typeof parsed === "object" ? parsed : {}
    } catch (error) {
        return {}
    }
}

function writePreferences(preferences) {
    try {
        localStorage.setItem(VOICE_PREF_STORAGE, JSON.stringify(preferences))
    } catch (error) {
        console.warn("[voz] No se pudo guardar la preferencia:", error)
    }
}

export function getAvailableVoices(lang = "en") {
    const voices = window.speechSynthesis?.getVoices?.() || []
    return voices
        .filter(voice => (lang.startsWith("es") ? /^es/i : /^en/i).test(String(voice.lang || "")))
        .sort((left, right) => voiceScore(right, lang) - voiceScore(left, lang))
}

export function getBestVoice(lang = "en") {
    const voices = getAvailableVoices(lang)
    if (!voices.length) return null
    const key = lang.startsWith("es") ? "es" : "en"
    const preferred = readPreferences()[key]
    if (preferred && preferred !== "auto") {
        const chosen = voices.find(voice => voice.voiceURI === preferred || voice.name === preferred)
        if (chosen) return chosen
    }
    return voices[0] || null
}

export function getSpeechRate(lang = "en") {
    const key = lang.startsWith("es") ? "es" : "en"
    const rate = Number(readPreferences()[`${key}Rate`])
    return Number.isFinite(rate) && rate >= 0.5 && rate <= 1.5 ? rate : DEFAULT_RATE
}

/* Reproduce un texto con la mejor voz disponible. Opciones: rate, pitch, volume. */
export function playAudioEnhanced(text, lang = "en", options = {}) {
    const cleanText = String(text || "").replace(/[""*]/g, "").trim()
    const synth = window.speechSynthesis
    if (!cleanText || !synth) return null
    try {
        if (currentUtterance) synth.cancel()
        const utterance = new SpeechSynthesisUtterance(cleanText)
        const wantsEs = lang.startsWith("es")
        utterance.lang = wantsEs ? "es-ES" : "en-US"
        utterance.rate = Number.isFinite(options.rate) ? options.rate : getSpeechRate(lang)
        utterance.pitch = Number.isFinite(options.pitch) ? options.pitch : 1
        utterance.volume = Number.isFinite(options.volume) ? options.volume : 1
        const voice = options.voice || getBestVoice(lang)
        if (voice) utterance.voice = voice
        currentUtterance = utterance
        synth.speak(utterance)
        return utterance
    } catch (error) {
        console.warn("[voz] No se pudo reproducir el texto:", error)
        return null
    }
}

/* Detiene cualquier voz en curso (por ejemplo al pasar de voz a video). */
export function cancelSpeech() {
    const synth = window.speechSynthesis
    if (!synth) return
    try {
        synth.cancel()
    } catch (error) {
        console.warn("[voz] No se pudo detener la reproducción:", error)
    }
    currentUtterance = null
}

export function makeClickableText(text, lang) {
    if (!text) return ""
    const escapedText = String(text).replace(/'/g, "\\'").replace(/"/g, "&quot;")
    return `<span class="audio-clickable cursor-pointer hover:text-amber-600 transition-colors inline-flex items-center gap-1" onclick="window.playAudioFromGlobal('${escapedText}', '${lang}')">
        <svg class="w-3.5 h-3.5 opacity-60 hover:opacity-100" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15.536H4v-4h1.586l3.414-3.414v10.828L5.586 15.536z"></path>
        </svg>
        ${text}
    </span>`
}

if (typeof window !== "undefined") {
    window.playAudioFromGlobal = function (text, lang) {
        return playAudioEnhanced(text, lang)
    }
}

export function initVoices() {
    const synth = window.speechSynthesis
    if (!synth) return
    const markReady = () => { voicesReady = true }
    if (synth.getVoices?.().length) markReady()
    else if ("onvoiceschanged" in synth) synth.onvoiceschanged = markReady
}

/* Selector opcional de voz, disponible en la cabecera. */
function voiceOption(voice) {
    const option = document.createElement("option")
    option.value = voice.voiceURI || voice.name
    option.textContent = `${voice.name} (${voice.lang})${voice.localService ? "" : " · en línea"}`
    return option
}

function fillVoiceSelect(select, lang) {
    if (!select) return
    const current = readPreferences()[lang] || "auto"
    select.replaceChildren()
    const auto = document.createElement("option")
    auto.value = "auto"
    auto.textContent = "Automática (mejor voz disponible)"
    select.append(auto)
    for (const voice of getAvailableVoices(lang)) select.append(voiceOption(voice))
    select.value = [...select.options].some(option => option.value === current) ? current : "auto"
}

function setupVoiceDialog() {
    if (typeof document === "undefined") return
    const open = () => {
        const dialog = document.getElementById("voice-settings-dialog")
        if (!dialog) return
        fillVoiceSelect(document.getElementById("voice-en"), "en")
        fillVoiceSelect(document.getElementById("voice-es"), "es")
        document.getElementById("voice-en-rate").value = getSpeechRate("en")
        document.getElementById("voice-es-rate").value = getSpeechRate("es")
        if (typeof dialog.showModal === "function") dialog.showModal()
        else dialog.setAttribute("open", "")
    }
    document.addEventListener("click", event => {
        if (event.target?.closest?.("#voice-settings-button")) open()
    })
    document.getElementById("voice-settings-close")?.addEventListener("click", () => {
        const dialog = document.getElementById("voice-settings-dialog")
        if (typeof dialog?.close === "function") dialog.close()
        else dialog?.removeAttribute("open")
    })
    document.getElementById("voice-settings-save")?.addEventListener("click", () => {
        const preferences = readPreferences()
        preferences.en = document.getElementById("voice-en")?.value || "auto"
        preferences.es = document.getElementById("voice-es")?.value || "auto"
        preferences.enRate = Number(document.getElementById("voice-en-rate")?.value || DEFAULT_RATE)
        preferences.esRate = Number(document.getElementById("voice-es-rate")?.value || DEFAULT_RATE)
        writePreferences(preferences)
        const dialog = document.getElementById("voice-settings-dialog")
        if (typeof dialog?.close === "function") dialog.close()
        else dialog?.removeAttribute("open")
    })
    document.getElementById("voice-settings-test")?.addEventListener("click", () => {
        playAudioEnhanced("Welcome to English. This is how your voice sounds.", "en")
    })
}

if (typeof document !== "undefined") {
    initVoices()
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", setupVoiceDialog)
    else setupVoiceDialog()
    if ("onvoiceschanged" in (window.speechSynthesis || {})) {
        window.speechSynthesis.addEventListener?.("voiceschanged", () => { voicesReady = true })
    }
}
