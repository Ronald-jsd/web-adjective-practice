import { store, GEMINI_KEY_STORAGE, GROQ_KEY_STORAGE } from "../config.js"
import { resolveSessionUser } from "../offline/session.js"
import { showToast } from "../cache.js"
import { parseManualTranscript, splitTranscriptSegments, extractYouTubeId, suggestionWords, normalizeWord, looksLikeYouTubeUrl, activeWordIndex, retimeSegments } from "./model.js"
import { buildSpeechGuide, explainGuide } from "./speech-guide.js"
import { TRANSCRIPT_PROVIDERS, findProvider, providerLabel, transcriptConfig, setTranscriptCredentials, clearTranscriptCredentials } from "./transcript.js"
import { createTranscriptStore } from "./transcript-store.js"
import { createAiCache } from "./ai-cache.js"
import { playWordPronunciation, speakPhrase, stopPhrasePronunciation, getPronunciation } from "./pronunciation.js"
import { createShadowingRepository } from "./repository.js"
import { createSentenceRepository } from "../sentences/repository.js"
import { SAVE_TARGETS, saveTargetKind, saveTargetLabel, catalogRowFor } from "./save-targets.js"
import { resolveSavedLessonId } from "./lesson-dedupe.js"
import { cacheRow, TABLES } from "../offline/cache.js"
import { queueChange, isOnline } from "../offline/sync.js"
import { generateLocalIntegerId } from "../offline/ids.js"
import { updateMediaSession, clearMediaSession } from "../media-session.js"
import { isAuthError, loginRequiredMessage, requireSession } from "../auth-required.js"
import {
    scoreAssessment,
    compareWords,
    phraseKey,
    readBestAttempts,
    writeBestAttempts,
    saveBestAttempt,
    manualScore,
    isDue,
    MASTERY_THRESHOLD
} from "./speaking-practice.js"

let initialized = false
let switchPracticePane = () => {}
let supabaseClient = null
let shadowingRepository = null
let sentenceRepository = null
let transcriptStore = null
let aiCache = null
let ytScript = null

const byId = id => document.getElementById(id)
const state = {
    user: null,
    lessons: [],
    current: null,
    currentIndex: 0,
    player: null,
    playerReady: false,
    speed: 1,
    loopLine: false,
    practiceMode: "manual",
    practiceDelay: 3,
    autoActive: false,
    autoTimer: null,
    countdownTimer: null,
    phraseTimer: null,
    speechUtterance: null,
    speechActive: false,
    speechStartedAt: 0,
    videoUnavailable: false,
    timingOffsets: new Map(),
    translation: "",
    lookupCache: new Map(),
    selectedWord: "",
    wordSpans: [],
    guideDrag: null,
    suppressAssessment: false,
    renderedLessonKey: "",
    speakingIndex: -1,
    externalPhrase: null,
    savedSentences: [],
    lastAssessment: null,
    autoResultReceived: false,
    recordings: new Map(),
    mediaRecorder: null,
    pendingRecording: null,
    chunks: [],
    recognizer: null,
    stream: null
}

const TIMING_STORAGE = "shadowing_phrase_timing_v1"
const GUIDE_POS_STORAGE = "shadowing_guide_window_v1"
const GUIDE_MOBILE_QUERY = "(max-width: 700px)"
const guideIsMobile = () => window.matchMedia(GUIDE_MOBILE_QUERY).matches

function timingKey(index) {
    return `${state.current?.videoId || ""}::${index}`
}

function loadTimingOffsets() {
    try {
        const saved = JSON.parse(localStorage.getItem(TIMING_STORAGE) || "{}")
        state.timingOffsets = new Map(Object.entries(saved || {}).map(([key, value]) => [key, Number(value) || 0]))
    } catch (error) {
        state.timingOffsets = new Map()
    }
}

function saveTimingOffsets() {
    try {
        localStorage.setItem(TIMING_STORAGE, JSON.stringify(Object.fromEntries(state.timingOffsets)))
    } catch (error) {
        console.warn("[shadowing] No se pudo guardar el ajuste de tiempos:", error)
    }
}

function readGuidePosition() {
    try {
        const value = JSON.parse(localStorage.getItem(GUIDE_POS_STORAGE) || "null")
        if (!value || !Number.isFinite(value.left) || !Number.isFinite(value.top)) return null
        // Una posición guardada en otra pantalla puede dejar la ventana sobre
        // el reproductor. Si el viewport cambió mucho, se vuelve al sitio por
        // defecto (abajo a la derecha) en vez de recuperar una ubicación rara.
        if (value.viewportWidth && Math.abs(value.viewportWidth - window.innerWidth) > 160) return null
        if (value.viewportHeight && Math.abs(value.viewportHeight - window.innerHeight) > 160) return null
        return value
    } catch (error) {
        return null
    }
}

function saveGuidePosition(position) {
    try {
        localStorage.setItem(GUIDE_POS_STORAGE, JSON.stringify({
            ...position,
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight
        }))
    } catch (error) {
        console.warn("[shadowing] No se pudo guardar la posición de la guía:", error)
    }
}

/* En móvil la guía es una tarjeta dentro del flujo (justo bajo la frase); en
 * escritorio se mueve al body para que position:fixed no quede atrapado por el
 * transform de #practice-section. */
function syncGuidePlacement(node, originalParent, originalNext) {
    if (!node) return
    if (guideIsMobile()) {
        if (node.parentElement !== originalParent) originalParent.insertBefore(node, originalNext)
        node.removeAttribute("style")
    } else if (node.parentElement !== document.body) {
        document.body.appendChild(node)
    }
}

function placeGuideWindow(node, position = readGuidePosition()) {
    if (!node) return
    if (!position) {
        node.style.left = ""
        node.style.top = ""
        node.style.right = ""
        node.style.bottom = ""
        return
    }
    const width = node.offsetWidth || 320
    const height = node.offsetHeight || 360
    node.style.right = "auto"
    node.style.bottom = "auto"
    node.style.left = `${Math.max(8, Math.min(window.innerWidth - width - 8, position.left))}px`
    node.style.top = `${Math.max(8, Math.min(window.innerHeight - height - 8, position.top))}px`
}

function toggleGuideWindow(open) {
    const node = byId("shadowing-guide-window")
    const button = byId("shadowing-guide-open")
    if (!node) return
    const visible = open ?? node.classList.contains("hidden")
    node.classList.toggle("hidden", !visible)
    button?.setAttribute("aria-expanded", String(visible))
    button?.classList.toggle("active", visible)
    if (visible && !guideIsMobile()) placeGuideWindow(node)
}

function wireGuideWindow() {
    const node = byId("shadowing-guide-window")
    if (!node) return
    const originalParent = node.parentElement
    const originalNext = node.nextSibling
    syncGuidePlacement(node, originalParent, originalNext)
    byId("shadowing-guide-open")?.addEventListener("click", () => toggleGuideWindow())
    byId("shadowing-guide-close")?.addEventListener("click", () => toggleGuideWindow(false))
    const handle = node.querySelector("[data-guide-drag]")
    handle?.addEventListener("pointerdown", event => {
        // En móvil la guía es una tarjeta en flujo: no se arrastra.
        if (guideIsMobile()) return
        if (event.target.closest("button")) return
        const rect = node.getBoundingClientRect()
        state.guideDrag = { x: event.clientX - rect.left, y: event.clientY - rect.top }
        handle.setPointerCapture?.(event.pointerId)
        node.style.right = "auto"
        node.style.bottom = "auto"
        event.preventDefault()
    })
    handle?.addEventListener("pointermove", event => {
        if (!state.guideDrag) return
        placeGuideWindow(node, { left: event.clientX - state.guideDrag.x, top: event.clientY - state.guideDrag.y })
    })
    const stopDrag = () => {
        if (!state.guideDrag) return
        state.guideDrag = null
        saveGuidePosition({ left: node.offsetLeft, top: node.offsetTop })
    }
    handle?.addEventListener("pointerup", stopDrag)
    handle?.addEventListener("pointercancel", stopDrag)
    handle?.addEventListener("dblclick", () => {
        // Doble clic en la cabecera: vuelve a la esquina por defecto.
        localStorage.removeItem(GUIDE_POS_STORAGE)
        node.removeAttribute("style")
        placeGuideWindow(node, null)
    })
    window.addEventListener("resize", () => {
        syncGuidePlacement(node, originalParent, originalNext)
        if (!node.classList.contains("hidden") && !guideIsMobile()) placeGuideWindow(node)
    })
    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && !node.classList.contains("hidden")) toggleGuideWindow(false)
    })
    const section = byId("practice-section")
    if (section) {
        new MutationObserver(() => {
            // Al salir de Practicar se cierra la guía, pero no se vuelve a abrir
            // sola: solo aparece cuando el usuario pulsa el botón 🎯.
            if (section.classList.contains("active") || node.classList.contains("hidden")) return
            toggleGuideWindow(false)
        }).observe(section, { attributes: true, attributeFilter: ["class"] })
    }
}

function phraseAt(index = state.currentIndex) {
    const segment = state.current?.transcript?.[index]
    if (!segment) return null
    const offset = state.timingOffsets.get(timingKey(index)) || 0
    return { ...segment, end: Math.max(segment.start + 0.4, segment.end + offset) }
}

function adjustPhraseEnd(delta) {
    const segment = state.current?.transcript?.[state.currentIndex]
    if (!segment) return
    const key = timingKey(state.currentIndex)
    const next = Math.max(-3, Math.min(3, (state.timingOffsets.get(key) || 0) + delta))
    state.timingOffsets.set(key, Number(next.toFixed(2)))
    saveTimingOffsets()
    renderTimingControl()
}

function renderTimingControl() {
    const value = state.timingOffsets.get(timingKey(state.currentIndex)) || 0
    const node = byId("shadowing-timing-value")
    if (node) node.textContent = `${value > 0 ? "+" : ""}${value.toFixed(1)} s`
}

function showStatus(message, isError = false) {
    const status = byId("shadowing-status")
    if (!status) return
    status.textContent = message || ""
    status.classList.toggle("error", !!isError)
    status.classList.toggle("success", !message ? false : !isError)
}

async function ensureUser() {
    if (!state.user) state.user = await resolveSessionUser(supabaseClient)
    return state.user
}

function youtubeUrl(rawUrl) {
    const value = String(rawUrl || "").trim()
    if (!value) return ""
    try {
        const url = new URL(value, "https://www.youtube.com")
        return url.protocol.startsWith("http") ? url.href : value
    } catch {
        return value
    }
}

/* Las frases externas tienen clave propia: así su grabación no se mezcla con
 * la de una lección de YouTube que estuviera en el mismo índice. */
function recordingKey(index = state.currentIndex) {
    return state.externalPhrase ? `ext:${state.externalPhrase.key}` : index
}

function recordingsFor(index = state.currentIndex) {
    return state.recordings.get(recordingKey(index)) || null
}

async function refreshLessons(selectedId = "") {
    const user = await ensureUser()
    const select = byId("shadowing-lessons")
    if (!select) return
    state.lessons = user && shadowingRepository ? await shadowingRepository.list(user.id) : []
    select.replaceChildren()
    const fresh = document.createElement("option")
    fresh.value = ""
    fresh.textContent = "Nueva lección"
    select.append(fresh)
    for (const lesson of state.lessons) {
        const option = document.createElement("option")
        option.value = lesson.id
        option.textContent = lesson.title || `Lección ${lesson.videoId}`
        select.append(option)
    }
    if (selectedId) select.value = selectedId
    renderLessonLibrary()
}

function renderLessonLibrary() {
    const grid = byId("shadowing-library-grid")
    if (!grid) return
    const count = byId("shadowing-library-count")
    if (count) count.textContent = String(state.lessons.length)
    grid.replaceChildren()
    if (!state.lessons.length) {
        const empty = document.createElement("p")
        empty.className = "shadowing-dialog-note"
        empty.textContent = "Todavía no guardaste ningún video. Pega un enlace de YouTube y pulsa «Crear lección»."
        grid.append(empty)
        return
    }
    for (const lesson of state.lessons) {
        const card = document.createElement("article")
        card.className = "shadowing-library-card"
        card.dataset.lessonId = lesson.id

        const image = document.createElement("img")
        image.className = "shadowing-library-thumb"
        image.alt = "Miniatura del video"
        image.loading = "lazy"
        if (lesson.videoId) {
            image.src = `https://i.ytimg.com/vi/${encodeURIComponent(lesson.videoId)}/mqdefault.jpg`
        }
        card.append(image)

        const body = document.createElement("div")
        body.className = "shadowing-library-body"
        const title = document.createElement("h4")
        title.textContent = lesson.title || `Lección ${lesson.videoId}`
        title.title = title.textContent
        const meta = document.createElement("p")
        meta.className = "shadowing-library-meta"
        const parts = [`${lesson.transcript?.length || 0} frases`]
        const date = formatSavedDate(lesson.createdAt)
        if (date) parts.push(date)
        meta.textContent = parts.join(" · ")
        body.append(title, meta)

        const actions = document.createElement("div")
        actions.className = "shadowing-library-actions"
        const open = document.createElement("button")
        open.type = "button"
        open.className = "button primary shadowing-library-open"
        open.textContent = "Abrir lección"
        open.addEventListener("click", () => openLesson(lesson.id))
        const link = document.createElement("a")
        link.className = "shadowing-library-link"
        link.textContent = "YouTube ↗"
        link.href = lesson.videoUrl || `https://www.youtube.com/watch?v=${encodeURIComponent(lesson.videoId || "")}`
        link.target = "_blank"
        link.rel = "noopener noreferrer"
        actions.append(open, link)
        body.append(actions)
        card.append(body)
        grid.append(card)
    }
    markLibraryActive()
}

function markLibraryActive() {
    document.querySelectorAll(".shadowing-library-card").forEach(card => {
        card.classList.toggle("active", card.dataset.lessonId === state.current?.id)
    })
}

function renderLesson() {
    const current = state.current
    const transcript = current?.transcript || []
    const title = byId("shadowing-lesson-title")
    const count = byId("shadowing-progress")
    if (title) title.textContent = current?.title || "Elige una lección"
    if (count) count.textContent = `${transcript.length ? state.currentIndex + 1 : 0}/${transcript.length}`
    markLibraryActive()
    renderTimingControl()
    const lines = byId("shadowing-lines")
    if (!lines) return
    // Reconstruir la lista en cada cambio de frase hacía parpadear el texto y
    // perdía el desplazamiento. Solo se reconstruye si cambia la lección.
    const key = `${current?.id || ""}|${current?.videoId || ""}|${current?.source || ""}|${transcript.length}|${transcript[0]?.text || ""}|${transcript[transcript.length - 1]?.text || ""}`
    if (state.renderedLessonKey !== key) {
        lines.replaceChildren()
        transcript.forEach((segment, index) => {
            const button = document.createElement("button")
            button.type = "button"
            button.className = "shadowing-line"
            const number = document.createElement("span")
            number.textContent = String(index + 1)
            const text = document.createElement("strong")
            text.textContent = segment.text
            button.append(number, text)
            button.addEventListener("click", () => seekToLine(index, true))
            lines.append(button)
        })
        state.renderedLessonKey = key
    }
    lines.querySelectorAll(".shadowing-line").forEach((element, index) => {
        const active = index === state.currentIndex
        element.classList.toggle("active", active)
        element.setAttribute("aria-current", active ? "true" : "false")
    })
    // Desplaza solo la lista lateral: scrollIntoView también movería la página
    // y sacaría de su sitio la barra de controles fija en móvil.
    const activeLine = lines.querySelector(".shadowing-line.active")
    if (activeLine) {
        const lineRect = activeLine.getBoundingClientRect()
        const listRect = lines.getBoundingClientRect()
        if (lineRect.top < listRect.top) lines.scrollTop -= listRect.top - lineRect.top
        else if (lineRect.bottom > listRect.bottom) lines.scrollTop += lineRect.bottom - listRect.bottom
    }
    renderTranscript(current)
}

function renderTranscript(lesson = state.current) {
    const container = byId("shadowing-transcript")
    const translate = byId("shadowing-translation")
    const actions = byId("shadowing-phrase-actions")
    if (!container || !lesson) return
    const sentence = lesson.transcript?.[state.currentIndex]?.text || ""
    container.classList.remove("hidden")
    actions?.classList.toggle("hidden", !sentence)
    // Si ya tradujiste esta frase antes, se muestra sin volver a pedirla.
    if (sentence && !state.translation) {
        state.translation = readStoredCache(SENTENCE_CACHE_STORAGE, sentence)?.value || ""
    }
    if (translate) translate.classList.toggle("hidden", !state.translation)
    if (translate) translate.textContent = state.translation
    container.replaceChildren()
    state.speakingIndex = -1

    const segment = lesson.transcript?.[state.currentIndex] || null
    const guide = buildSpeechGuide(segment, lesson.transcript?.[state.currentIndex + 1] || null)
    const buttons = []
    const accuracy = guide.source === "measured" ? "tiempo medido" : "tiempo estimado"

    guide.items.forEach((item, tokenIndex) => {
        if (!item.isWord) {
            container.append(document.createTextNode(item.token + " "))
            if (item.pauseAfter) container.append(makeGuideMark("sh-guide-pause", item.pauseAfter, guidePauseTitle(item)))
            if (item.contour) container.append(makeGuideMark("sh-guide-contour", item.contour, "Tono final estimado por la puntuación"))
            return
        }
        if (item.pauseBefore) {
            container.append(makeGuideMark("sh-guide-pause", item.pauseBefore, `Pausa de ${Math.round(item.gapBeforeMs)} ms`))
            container.append(document.createTextNode(" "))
        }
        const unit = document.createElement("span")
        unit.className = "shadowing-word-unit"
        const button = document.createElement("button")
        button.type = "button"
        button.className = `shadowing-word sh-guide-${item.stress}`
        button.textContent = item.token
        button.title = `${item.posLabel} · ${Math.round(item.durationMs)} ms · ${accuracy}. Clic para escuchar.`
        button.dataset.pos = item.pos
        button.dataset.ms = String(Math.round(item.durationMs))
        button.addEventListener("click", () => playWordPronunciation(item.token))
        const ipa = document.createElement("small")
        ipa.className = "shadowing-word-ipa"
        unit.append(button, ipa)
        container.append(unit)
        if (item.pauseAfter) container.append(makeGuideMark("sh-guide-pause", item.pauseAfter, guidePauseTitle(item)))
        if (item.contour) container.append(makeGuideMark("sh-guide-contour", item.contour, "Tono final estimado por la puntuación"))
        container.append(document.createTextNode(" "))
        buttons.push(button)
        if (tokenIndex < 28) {
            setTimeout(() => fillPronunciation(item.token, ipa), tokenIndex * 60)
        }
    })
    state.wordSpans = guide.spans.map((span, index) => ({ ...span, element: buttons[index] }))
    renderGuideWindow(guide, lesson)
    renderWordList(sentence)
    renderRecording()
}

async function fillPronunciation(word, node) {
    const data = await getPronunciation(word)
    if (data?.ipa && node.isConnected) node.textContent = data.ipa
}

function renderGuideWindow(guide, lesson) {
    const node = byId("shadowing-guide-window")
    const openButton = byId("shadowing-guide-open")
    if (!guide?.items?.length) {
        node?.classList.add("hidden")
        openButton?.classList.add("hidden")
        return
    }
    openButton?.classList.remove("hidden")
    const sentence = String(lesson?.transcript?.[state.currentIndex]?.text || "")
    const lead = node?.querySelector("[data-guide-lead]")
    if (lead) lead.textContent = sentence
        ? `En esta frase: «${sentence.length > 90 ? `${sentence.slice(0, 87)}…` : sentence}». Imita las marcas con tu voz.`
        : "Imita las marcas con tu voz."

    const host = byId("shadowing-guide-examples")
    if (host) {
        host.replaceChildren()
        for (const entry of explainGuide(guide)) {
            const row = document.createElement("div")
            row.className = "shadowing-guide-row"
            const sample = document.createElement("span")
            sample.className = "shadowing-guide-sample"
            sample.dataset.key = entry.key
            sample.textContent = entry.sample
            const body = document.createElement("div")
            const title = document.createElement("strong")
            title.textContent = entry.label
            const detail = document.createElement("span")
            detail.textContent = entry.description
            body.append(title, detail)
            row.append(sample, body)
            host.append(row)
        }
    }
    const source = node?.querySelector("[data-guide-source]")
    if (source) {
        const timing = guide.pauseSource === "timing"
            ? "Las pausas salen de los huecos reales entre frases."
            : "Las pausas se estiman por la puntuación."
        source.textContent = guide.source === "measured"
            ? `Tiempos medidos palabra por palabra en los subtítulos del video. ${timing}`
            : `Duración y estrés estimados de los subtítulos, no medidos del audio. ${timing}`
    }
}

function guidePauseTitle(item) {
    if (item.pauseAfterSource === "punctuation") return "Pausa breve estimada por la puntuación"
    return `Pausa de ${Math.round(item.pauseAfterMs || 0)} ms entre frases`
}

function makeGuideMark(className, text, title) {
    const mark = document.createElement("span")
    mark.className = className
    mark.textContent = text
    mark.title = title
    return mark
}

/* Reproduce una palabra con la voz unificada (sin créditos). */
function speakWord(word) {
    playWordPronunciation(word)
}

/* Resalta la palabra que se está oyendo. Cuando hay tiempos por palabra el
 * resaltado los sigue; si no, se reparte la frase por el largo de las palabras. */
function highlightSpokenWord(seconds, segment) {
    const spans = state.wordSpans || []
    if (!spans.length) return
    const active = activeWordIndex(spans, seconds, segment)
    if (active === state.speakingIndex) return
    state.speakingIndex = active
    spans.forEach((span, index) => span.element.classList.toggle("speaking", index === active))
}

function renderWordList(sentence) {
    const host = byId("shadowing-word-list")
    if (!host) return
    host.replaceChildren()
    const words = suggestionWords(sentence)
    for (const word of words) {
        const button = document.createElement("button")
        button.type = "button"
        button.className = `shadowing-word${normalizeWord(state.selectedWord) === word ? " active" : ""}`
        button.textContent = word
        button.title = "Escuchar y traducir con IA"
        button.addEventListener("click", () => {
            speakWord(word)
            lookupWord(word)
        })
        host.append(button)
    }
    updateWordButtons()
}

function updateWordButtons() {
    document.querySelectorAll(".shadowing-word").forEach(button => button.classList.toggle("active", normalizeWord(button.textContent) === normalizeWord(state.selectedWord)))
    const actions = byId("shadowing-word-actions")
}

function updateWordButtonsReset() {
    // Kept intentionally tiny to make vocabulary action refreshes easy to extend.
    updateWordButtons()
}

function updateWordActions(enabled) {
    const button = byId("shadowing-save-selected")
    const target = byId("shadowing-save-target")?.value || "vocabulary"
    if (button) {
        button.disabled = !enabled
        button.textContent = target === "sentence" ? "＋ Guardar frase" : `＋ Guardar en ${saveTargetLabel(target)}`
    }
}

function renderRecording() {
    const button = byId("shadowing-record")
    const play = byId("shadowing-play-recording")
    const status = byId("shadowing-recording-status")
    const score = byId("shadowing-score")
    const recording = recordingsFor(state.currentIndex)
    if (play) play.disabled = !recording
    if (status) status.textContent = recording ? "Grabación lista." : "Aún no grabaste esta frase."
    if (score && !recording) score.textContent = ""
    renderBestAttempt()
}

function seekToLine(index, keepFrame = false) {
    const current = state.current
    if (!current?.transcript?.length) return
    if (state.autoActive) stopAutoPractice("Práctica detenida.")
    stopRecording({ silent: true })
    stopPhraseTimer()
    state.currentIndex = Math.max(0, Math.min(current.transcript.length - 1, index))
    state.translation = ""
    state.selectedWord = ""
    renderLesson()
    if (keepFrame) playPhrase(state.currentIndex)
}

function markLine(index) {
    document.querySelectorAll(".shadowing-line").forEach((element, elementIndex) => element.classList.toggle("active", elementIndex === index))
}

function renderPlayerState() {
    const controls = byId("shadowing-controls")
    const player = byId("shadowing-player")
    const transcript = byId("shadowing-transcript")
    if (state.current) {
        // Una frase guardada no tiene video: se ocultan solo los controles de
        // YouTube y se dejan visibles la frase, la grabación y la puntuación.
        const external = Boolean(state.externalPhrase)
        controls?.classList.toggle("hidden", external)
        byId("shadowing-practice-bar")?.classList.toggle("hidden", external)
        player?.classList.toggle("hidden", external)
        transcript?.classList.remove("hidden")
    }
}

function loadYouTubeIFrameApi() {
    if (window.YT?.Player) return Promise.resolve(window.YT)
    if (ytScript) return ytScript
    ytScript = new Promise((resolve, reject) => {
        const script = document.createElement("script")
        script.src = "https://www.youtube.com/iframe_api"
        script.onload = () => {
            const deadline = Date.now() + 15000
            const check = () => window.YT?.Player ? resolve(window.YT) : Date.now() > deadline ? reject(new Error("No se pudo cargar el reproductor de YouTube.")) : setTimeout(check, 100)
            check()
        }
        script.onerror = () => reject(new Error("No se pudo cargar el reproductor de YouTube."))
        document.head.append(script)
    })
    return ytScript
}

async function mountVideo(videoId) {
    const host = byId("shadowing-player")
    if (!host) return null
    host.replaceChildren()
    const mount = document.createElement("div")
    host.append(mount)
    const YT = await loadYouTubeIFrameApi()
    const player = new YT.Player(mount, {
        videoId,
        playerVars: { autoplay: 0, rel: 0, modestbranding: 1, playsinline: 1, controls: 1 },
        events: {
            onReady: event => { state.player = event.target; state.playerReady = true },
            onStateChange: event => { state.playerReady = true; handlePlaybackState(event.data) }
        }
    })
    state.player = player
    state.playerReady = false
    return player
}

function handlePlaybackState(data) {
    // YT.PlayerState: -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued.
    if (data !== 0 && data !== 2 && data !== 1) return
    const segment = phraseAt()

    if (data === 1) {
        // Si el usuario da play directo en YouTube, sincronizamos la frase actual:
        // activamos el watcher de fin, resaltado y estado del botón.
        if (!state.phraseTimer && !state.speechActive && segment && !useSystemVoice()) {
            const seconds = Number(state.player?.getCurrentTime?.() || 0)
            if (seconds < segment.end + 0.6) {
                state.phraseStartedAt = performance.now()
                state.phraseTimer = setTimeout(() => watchPhraseEnd(segment, state.phraseStartedAt), 40)
                updatePlayButton()
                syncMediaSession("playing")
            }
        }
        pollShadowing()
        return
    }

    if (data === 2) {
        // Pausa manual desde YouTube: detener watcher/botón, sin avanzar.
        if (state.phraseTimer && !state.speechActive) {
            stopPhraseTimer()
            syncMediaSession("paused")
        }
        return
    }

    // ended
    if (state.phraseTimer && !state.speechActive) {
        stopPhraseTimer()
        syncMediaSession("paused")
    }
}

/* Sin red (o sin YouTube disponible) la frase se reproduce con la voz del
 * sistema. Las lecciones guardadas viven en IndexedDB, así que siguen
 * funcionando aunque no haya conexión. */
function useSystemVoice() {
    return Boolean(state.externalPhrase) || !isOnline() || state.videoUnavailable === true
}

function stopSpeechPlayback() {
    const utterance = state.speechUtterance
    state.speechUtterance = null
    state.speechActive = false
    if (utterance) {
        utterance.onend = null
        utterance.onerror = null
    }
    stopPhrasePronunciation()
}

function stopPhraseTimer() {
    if (state.phraseTimer) {
        clearTimeout(state.phraseTimer)
        state.phraseTimer = null
    }
    stopSpeechPlayback()
    updatePlayButton()
}

function waitForPlayerReady(timeoutMs = 10000) {
    if (state.playerReady && state.player) return Promise.resolve(true)
    return new Promise(resolve => {
        const deadline = Date.now() + timeoutMs
        const check = () => {
            if (state.playerReady && state.player) return resolve(true)
            if (Date.now() >= deadline) return resolve(false)
            setTimeout(check, 100)
        }
        check()
    })
}

async function ensureVideoReady() {
    if (state.playerReady && state.player) return true
    if (!state.current?.videoId) return false
    if (!state.player) {
        await mountVideo(state.current.videoId).catch(error => {
            console.warn("[shadowing] No se pudo montar el video:", error)
        })
    }
    return waitForPlayerReady()
}

function playPhraseWithVoice(segment) {
    const utterance = speakPhrase(segment.text, "en")
    if (!utterance) {
        showStatus("Este navegador no ofrece voz del sistema para reproducir sin conexión.", true)
        updatePlayButton()
        syncMediaSession("paused")
        return false
    }
    state.speechUtterance = utterance
    state.speechActive = true
    state.phraseStartedAt = performance.now()
    // La voz avisa al terminar; el temporizador evita quedarse colgado si el
    // navegador no dispara onend (ocurre en algunos móviles).
    const words = String(segment.text || "").trim().split(/\s+/).filter(Boolean).length
    const safetyMs = Math.max(2000, words * 550)
    utterance.onend = () => { if (state.speechActive) finishPhrase() }
    utterance.onerror = () => { if (state.speechActive) finishPhrase() }
    state.phraseTimer = setTimeout(() => { if (state.speechActive) finishPhrase() }, safetyMs)
    updatePlayButton()
    setPracticeStatus(useSystemVoice() && !isOnline()
        ? "Sin conexión: reproduciendo con la voz del sistema."
        : "Reproduciendo con la voz del sistema.")
    return true
}

function finishPhrase() {
    if (!state.current) return
    stopPhraseTimer()
    if (!useSystemVoice()) state.player?.pauseVideo?.()
    if (state.autoActive && state.practiceMode !== "manual") {
        handleAutoAdvance()
    } else if (state.loopLine) {
        playPhrase(state.currentIndex)
    }
}

/* El reloj del video es la única fuente válida: para en cuanto getCurrentTime
 * alcanza el final de la frase. El tiempo transcurrido solo sirve como tope de
 * seguridad si YouTube deja de informar (por ejemplo, durante un buffering). */
function watchPhraseEnd(segment, startedAt) {
    if (!state.player) return
    const current = Number(state.player.getCurrentTime?.() || 0)
    const elapsed = performance.now() - startedAt
    // Justo después de un seek, YouTube puede seguir informando del tiempo
    // anterior. Parar con ese valor dejaría la frase sin reproducir.
    if (current < segment.start - 0.6 || current > segment.end + 0.6) {
        if (elapsed > 8000) {
            finishPhrase()
            return
        }
        state.phraseTimer = setTimeout(() => watchPhraseEnd(segment, startedAt), 40)
        return
    }
    if (current < segment.end - 0.03) {
        const limit = Math.max(3000, (segment.end - segment.start) * 1000 / Math.max(0.5, state.speed || 1) + 6000)
        if (elapsed > limit) {
            finishPhrase()
            return
        }
        state.phraseTimer = setTimeout(() => watchPhraseEnd(segment, startedAt), 40)
        return
    }
    finishPhrase()
}

/* Con internet se usa el video; sin él, la misma frase con voz del sistema.
 * Texto y audio avanzan juntos porque el índice se fija antes de reproducir. */
function playPhrase(index = state.currentIndex) {
    const segment = phraseAt(index)
    if (!segment) return
    stopPhraseTimer()
    const nextIndex = Math.max(0, Math.min(state.current.transcript.length - 1, index))
    const indexChanged = nextIndex !== state.currentIndex
    if (indexChanged) stopRecording({ silent: true })
    state.currentIndex = nextIndex
    if (indexChanged) {
        state.translation = ""
        state.selectedWord = ""
        renderLesson()
    }
    updatePlayButton()

    if (useSystemVoice()) {
        if (playPhraseWithVoice(segment)) syncMediaSession("playing")
        return
    }

    if (!state.playerReady || !state.player) {
        setPracticeStatus("Preparando el video…")
        ensureVideoReady().then(ready => {
            if (!ready) {
                state.videoUnavailable = true
                showStatus("YouTube no está disponible; se usa la voz del sistema.", true)
            }
            if (state.currentIndex !== nextIndex) return
            playPhrase(nextIndex)
        })
        return
    }

    state.player.seekTo(segment.start, true)
    state.player.playVideo()
    const startedAt = performance.now()
    state.phraseStartedAt = startedAt
    state.phraseTimer = setTimeout(() => watchPhraseEnd(segment, startedAt), 40)
    updatePlayButton()
    setPracticeStatus("")
    syncMediaSession("playing")
}

function pollShadowing() {
    if (!state.current || !state.playerReady || !state.player) return
    const segment = phraseAt()
    if (!segment) return
    const seconds = Number(state.player.getCurrentTime?.() || 0)
    // El resaltado es solo visual: nunca decide cuándo se detiene el video.
    highlightSpokenWord(seconds, segment)
    // Respaldo si el usuario reproduce con los controles del propio YouTube.
    // Se ignoran valores fuera de la frase (tiempo anterior al terminar un seek).
    if (seconds < segment.end || seconds > segment.end + 0.6 || !state.phraseTimer) return
    if (performance.now() - (state.phraseStartedAt || 0) < 300) return
    finishPhrase()
}

function setPracticeStatus(message, { counting = false } = {}) {
    const node = byId("shadowing-practice-status")
    if (!node) return
    node.textContent = message || ""
    node.classList.toggle("is-counting", counting)
}

function clearCountdown() {
    if (state.countdownTimer) {
        clearInterval(state.countdownTimer)
        state.countdownTimer = null
    }
}

function setCountdownLabel(seconds) {
    setPracticeStatus(`Siguiente frase en ${seconds} s…`, { counting: true })
}

/* Un único botón de play: en modo manual reproduce la frase actual y en
 * automático inicia o detiene la práctica frase por frase. */
function updatePlayButton() {
    const button = byId("shadowing-play")
    if (!button) return
    const auto = state.practiceMode === "auto"
    const running = state.autoActive || Boolean(state.phraseTimer)
    button.textContent = auto
        ? (state.autoActive ? "■" : "▶")
        : (running ? "■" : "▶")
    button.setAttribute("aria-pressed", String(running))
    button.title = auto
        ? (state.autoActive ? "Detener la práctica automática" : "Reproducir frase por frase")
        : (running ? "Detener la reproducción" : "Reproducir la frase actual")
}

/* El reproductor del sistema (notificación / bloqueo) debe reflejar la frase
 * que suena y permitir play/pause y cambio de frase desde fuera de la app. */
function syncMediaSession(playbackState = "playing") {
    const segment = state.current?.transcript?.[state.currentIndex]
    if (!segment) return
    updateMediaSession({
        title: segment.text,
        artist: state.current.title || "Shadowing",
        album: "Práctica de shadowing",
        state: playbackState,
        onPlay: () => {
            if (state.practiceMode === "auto") {
                if (!state.autoActive) startAutoPractice()
            } else if (!state.phraseTimer) {
                playPhrase(state.currentIndex)
            }
        },
        onPause: () => {
            if (state.practiceMode === "auto") stopAutoPractice("Práctica detenida.")
            else {
                stopPhraseTimer()
                state.player?.pauseVideo?.()
                syncMediaSession("paused")
            }
        },
        onNext: () => seekToLine(state.currentIndex + 1, true),
        onPrev: () => seekToLine(state.currentIndex - 1, true),
        onStop: () => {
            if (state.practiceMode === "auto") stopAutoPractice("Práctica detenida.")
            else {
                stopPhraseTimer()
                state.player?.pauseVideo?.()
            }
            syncMediaSession("paused")
        }
    })
}

function stopAutoPractice(message = "") {
    if (state.autoTimer) {
        clearTimeout(state.autoTimer)
        state.autoTimer = null
    }
    clearCountdown()
    stopPhraseTimer()
    state.autoActive = false
    state.awaitingTurn = false
    state.player?.pauseVideo?.()
    updatePlayButton()
    setPracticeStatus(message)
    syncMediaSession("paused")
}

function startAutoPractice() {
    if (state.autoActive) {
        stopAutoPractice("Práctica detenida.")
        return
    }
    const segment = state.current?.transcript?.[state.currentIndex]
    if (!segment) return
    state.autoActive = true
    state.awaitingTurn = false
    playPhrase(state.currentIndex)
    updatePlayButton()
    setPracticeStatus("Reproduciendo frase…")
}

function handleAutoAdvance() {
    if (state.awaitingTurn) return
    state.awaitingTurn = true
    clearCountdown()
    const delay = Math.max(1, Number(state.practiceDelay) || 3)
    let remaining = delay
    setCountdownLabel(remaining)

    // La espera se ve contar 3 → 2 → 1 en el estado de la práctica.
    state.countdownTimer = setInterval(() => {
        if (!state.autoActive) {
            clearCountdown()
            return
        }
        remaining -= 1
        if (remaining > 0) {
            setCountdownLabel(remaining)
            return
        }
        clearCountdown()
    }, 1000)

    state.autoTimer = setTimeout(() => {
        state.autoTimer = null
        clearCountdown()
        if (!state.autoActive) return
        const nextIndex = state.currentIndex + 1
        if (nextIndex >= state.current.transcript.length) {
            stopAutoPractice("Práctica terminada.")
            return
        }
        state.awaitingTurn = false
        // playPhrase fija el índice y vuelve a renderizar la frase escrita
        // antes de mover el video:audio y texto avanzan a la vez.
        playPhrase(nextIndex)
        setPracticeStatus("Reproduciendo frase…")
    }, delay * 1000)
}

async function createLesson() {
    const input = byId("shadowing-video-url")
    const videoId = extractYouTubeId(input?.value || "")
    if (!videoId) {
        showStatus("Pega un enlace válido de YouTube (youtu.be, watch, shorts o embed).", true)
        return null
    }
    const videoUrl = youtubeUrl(input.value)
    const user = await ensureUser()

    // La casilla se consume una sola vez para no gastar créditos por error.
    const forceBox = byId("shadowing-transcript-force")
    const force = Boolean(forceBox?.checked)
    if (forceBox) forceBox.checked = false

    // 1. Si la lección ya está guardada, se reutiliza sin llamar a nadie.
    const saved = state.lessons.find(lesson => lesson.videoId === videoId && lesson.transcript?.length)
    if (saved && !force) {
        await openLesson(saved.id)
        showStatus(`Lección ya guardada · ${saved.transcript.length} frases (sin gastar créditos).`)
        return state.current
    }

    // 2. Transcripción guardada en tu cuenta o en este dispositivo.
    if (!force) {
        const cached = transcriptStore ? await transcriptStore.get(user?.id || null, videoId) : null
        if (cached?.segments?.length) {
            let segments = cached.segments
            if (needsTimingRebuild(segments)) {
                const rebuilt = await fetchRebuiltSegments(videoId)
                if (rebuilt) {
                    segments = rebuilt
                    await transcriptStore?.save(user?.id || null, {
                        videoId,
                        title: cached.title || "Lección de YouTube",
                        language: cached.language || "en",
                        source: cached.source || "auto",
                        segments
                    })
                }
            }
            await applyLesson({
                videoId,
                videoUrl,
                title: cached.title || "Lección de YouTube",
                segments,
                note: `Lección lista desde tus transcripciones · ${segments.length} frases (sin gastar créditos).`
            })
            return state.current
        }
    }

    const config = transcriptConfig()
    const status = byId("shadowing-status")
    if (status) {
        status.textContent = config.configured
            ? `Buscando los subtítulos con ${providerLabel(config.provider)}…`
            : "Intentando obtener los subtítulos automáticamente…"
        status.classList.remove("error", "success")
    }
    let title = "Lección de YouTube"
    let segments = []
    let providerName = ""
    try {
        const body = { videoId }
        if (config.configured) {
            body.provider = config.provider
            body.apiKey = config.apiKey
        }
        if (force) body.force = true
        const { data, error } = await supabaseClient.functions.invoke("youtube-transcript", { body })
        if (error) {
            const details = await readFunctionError(error)
            const failure = new Error(details.message || "No se pudo obtener la transcripción automática.")
            failure.code = details.code
            throw failure
        }
        if (!data?.segments?.length) throw new Error("No se encontraron subtítulos automáticos.")
        title = data.title || title
        segments = retimeSegments(splitTranscriptSegments(data.segments))
        providerName = data.source && data.source !== "youtube" ? String(data.source) : ""
        await transcriptStore?.save(user?.id || null, {
            videoId,
            title,
            language: data.language || "en",
            source: data.source || "youtube",
            segments
        })
    } catch (autoError) {
        console.warn("[shadowing] No se obtuvo la transcripción automática:", autoError)
        showManualPanel()
        showStatus(transcriptFailureMessage(autoError, config), true)
        if (autoError.code === "invalid_key" || autoError.code === "quota") openTranscriptDialog()
        return null
    }

    await applyLesson({
        videoId,
        videoUrl,
        title,
        segments,
        note: `Lección lista · ${segments.length} frases ${providerName ? `(${providerLabel(providerName)})` : "(transcripción automática)"}.`
    })
    return state.current
}

/* Las lecciones antiguas guardaron el "duration" de Supadata como tiempo de
 * habla. En ese formato casi todas las frases se solapan con la siguiente.
 * También detecta transcripciones viejas que quedaron como un solo bloque
 * largo porque no había puntuación de frase. */
function needsTimingRebuild(transcript) {
    if (!Array.isArray(transcript) || !transcript.length) return false
    if (transcript.length === 1) {
        const text = String(transcript[0]?.text || "").trim()
        const wordCount = text ? text.split(/\s+/).length : 0
        return wordCount > 45
    }
    if (transcript.length < 3) return false
    let overlapping = 0
    for (let index = 0; index < transcript.length - 1; index += 1) {
        const end = Number(transcript[index]?.end || 0)
        const nextStart = Number(transcript[index + 1]?.start || 0)
        if (end > nextStart + 0.8) overlapping += 1
    }
    return overlapping / (transcript.length - 1) > 0.2
}

/* La caché compartida guarda los bloques CRUDOS del proveedor, así que se
 * pueden volver a dividir sin gastar créditos ni pedir una key. */
async function fetchRebuiltSegments(videoId) {
    if (!videoId || !supabaseClient) return null
    try {
        const { data, error } = await supabaseClient.functions.invoke("youtube-transcript", { body: { videoId } })
        if (error || !data?.segments?.length) return null
        const segments = retimeSegments(splitTranscriptSegments(data.segments))
        return segments.length ? segments : null
    } catch (error) {
        console.warn("[shadowing] No se pudieron recalcular los tiempos:", error)
        return null
    }
}

async function applyLesson({ videoId, videoUrl, title, segments, note }) {
    if (state.autoActive) stopAutoPractice("")
    stopRecording({ silent: true })
    stopPhraseTimer()
    state.player?.pauseVideo?.()
    const timed = retimeSegments(segments)
    state.externalPhrase = null
    state.current = { id: "", videoId, videoUrl, title, source: "auto", transcript: timed }
    state.currentIndex = 0
    state.translation = ""
    state.selectedWord = ""
    await mountVideo(videoId).catch(error => showStatus(error.message, true))
    byId("shadowing-manual")?.classList.add("hidden")
    byId("shadowing-video-url").value = videoUrl
    renderLesson()
    renderPlayerState()
    showStatus(note)
}

async function readFunctionError(error) {
    const response = error?.context
    if (response && typeof response.clone === "function") {
        try {
            const body = await response.clone().json()
            return { code: String(body?.code || ""), message: String(body?.error || ""), status: response.status }
        } catch {
            // La respuesta no era JSON; usamos el mensaje genérico.
        }
    }
    return { code: "", message: String(error?.message || ""), status: 0 }
}

function transcriptFailureMessage(error, config) {
    const provider = providerLabel(config.provider)
    if (error?.code === "invalid_key") {
        return `La API key de ${provider} no es válida. Revísala en “⚙️ Transcripción automática”.`
    }
    if (error?.code === "quota") {
        return `Se agotó el cupo gratuito de ${provider}. Pega la transcripción manualmente o espera al próximo ciclo.`
    }
    if (!config.configured) {
        return "YouTube no entregó una transcripción reutilizable. Conecta “⚙️ Transcripción automática” (gratis) o pega el texto, SRT o VTT y pulsa Procesar transcripción."
    }
    return `${provider} no encontró subtítulos para este video. Pega el texto, SRT o VTT y pulsa Procesar transcripción.`
}

function renderTranscriptConfig() {
    const config = transcriptConfig()
    const stateLabel = byId("shadowing-transcript-state")
    const button = byId("shadowing-transcript-config")
    if (stateLabel) {
        stateLabel.textContent = config.configured ? `${providerLabel(config.provider)} conectada` : "Pegado manual"
        stateLabel.classList.toggle("on", config.configured)
    }
    if (button) {
        button.title = config.configured
            ? "Cambiar la API key de la transcripción automática"
            : "Conectar una API key gratuita para bajar los subtítulos automáticamente"
    }
}

function syncTranscriptProviderHints() {
    const select = byId("shadowing-transcript-provider")
    const provider = findProvider(select?.value || transcriptConfig().provider)
    const plan = byId("shadowing-transcript-plan")
    if (plan) plan.textContent = provider.freePlan
    const steps = byId("shadowing-transcript-steps")
    if (steps) {
        steps.replaceChildren()
        provider.steps.forEach(step => {
            const item = document.createElement("li")
            item.textContent = step
            steps.append(item)
        })
    }
    const link = byId("shadowing-transcript-signup")
    if (link) link.href = provider.signupUrl
}

function openTranscriptDialog() {
    const dialog = byId("shadowing-transcript-dialog")
    if (!dialog) return
    const select = byId("shadowing-transcript-provider")
    if (select && !select.options.length) {
        TRANSCRIPT_PROVIDERS.forEach(provider => {
            const option = document.createElement("option")
            option.value = provider.id
            option.textContent = provider.label
            select.append(option)
        })
    }
    const config = transcriptConfig()
    if (select) select.value = config.provider
    const key = byId("shadowing-transcript-key")
    if (key) key.value = config.apiKey
    const status = byId("shadowing-transcript-dialog-status")
    if (status) {
        status.textContent = ""
        status.classList.remove("error")
    }
    syncTranscriptProviderHints()
    if (typeof dialog.showModal === "function") dialog.showModal()
    else dialog.setAttribute("open", "")
    renderSavedTranscripts().catch(error => console.warn("[shadowing] No se pudo listar las transcripciones:", error))
}

function closeTranscriptDialog() {
    const dialog = byId("shadowing-transcript-dialog")
    if (!dialog) return
    if (typeof dialog.close === "function") dialog.close()
    else dialog.removeAttribute("open")
}

function formatSavedDate(value) {
    if (!value) return ""
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ""
    return date.toLocaleDateString("es", { day: "2-digit", month: "short", year: "numeric" })
}

async function renderSavedTranscripts() {
    const container = byId("shadowing-transcript-saved-list")
    if (!container) return
    container.textContent = "Cargando…"
    const user = await ensureUser()
    const rows = transcriptStore ? await transcriptStore.list(user?.id || null) : []
    container.replaceChildren()
    if (!rows.length) {
        const empty = document.createElement("p")
        empty.className = "shadowing-dialog-note"
        empty.textContent = "Todavía no hay transcripciones guardadas."
        container.append(empty)
        return
    }
    for (const row of rows) {
        const item = document.createElement("div")
        item.className = "shadowing-saved-item"

        const info = document.createElement("div")
        info.className = "shadowing-saved-info"
        const title = document.createElement("strong")
        title.textContent = row.title || row.videoId
        const meta = document.createElement("small")
        const parts = [`${row.segments.length} frases`]
        const date = formatSavedDate(row.updatedAt)
        if (date) parts.push(date)
        if (!user) parts.push("solo en este dispositivo")
        meta.textContent = parts.join(" · ")
        info.append(title, meta)

        const remove = document.createElement("button")
        remove.type = "button"
        remove.className = "shadowing-saved-delete"
        remove.textContent = "Borrar"
        remove.addEventListener("click", async () => {
            remove.disabled = true
            await transcriptStore.remove(user?.id || null, row.videoId)
            await renderSavedTranscripts()
        })

        item.append(info, remove)
        container.append(item)
    }
}

function saveTranscriptConfig() {
    const provider = byId("shadowing-transcript-provider")?.value || TRANSCRIPT_PROVIDERS[0].id
    const key = byId("shadowing-transcript-key")?.value || ""
    const status = byId("shadowing-transcript-dialog-status")
    if (!setTranscriptCredentials(provider, key)) {
        if (status) {
            status.textContent = "Pega una API key antes de guardar."
            status.classList.add("error")
        }
        return
    }
    if (status) {
        status.textContent = `Listo: ${providerLabel(provider)} conectada en este dispositivo.`
        status.classList.remove("error")
    }
    renderTranscriptConfig()
    showToast("Transcripción automática configurada.", "success")
}

function clearTranscriptConfig() {
    clearTranscriptCredentials()
    const key = byId("shadowing-transcript-key")
    if (key) key.value = ""
    const status = byId("shadowing-transcript-dialog-status")
    if (status) {
        status.textContent = "Key borrada. La app vuelve al pegado manual."
        status.classList.remove("error")
    }
    renderTranscriptConfig()
}

function parseManual() {
    const input = byId("shadowing-transcript-input")
    const rawText = String(input?.value || "").trim()
    if (looksLikeYouTubeUrl(rawText)) {
        showStatus("El enlace no es el texto de la transcripción. Abre el video y pulsa “Show transcript” (o descarga/copia el SRT/VTT) y pega el texto aquí.", true)
        return
    }
    const segments = parseManualTranscript(rawText)
    if (!segments.length) {
        showStatus("La transcripción está vacía o no tiene un formato reconocido.", true)
        return
    }
    const raw = byId("shadowing-video-url").value.trim()
    const videoId = extractYouTubeId(raw)
    if (!videoId) {
        showStatus("Primero pega un enlace válido de YouTube.", true)
        byId("shadowing-video-url")?.focus()
        return
    }
    if (state.autoActive) stopAutoPractice("")
    stopRecording({ silent: true })
    stopPhraseTimer()
    state.player?.pauseVideo?.()
    state.externalPhrase = null
    state.videoUnavailable = false
    if (!state.current || state.current.videoId !== videoId) state.current = { id: "", videoId, videoUrl: youtubeUrl(raw), title: "Lección de YouTube", source: "manual", transcript: retimeSegments(segments) }
    else state.current = { ...state.current, transcript: retimeSegments(segments), source: "manual" }
    state.currentIndex = 0
    state.translation = ""
    state.selectedWord = ""
    mountVideo(videoId).catch(error => showStatus(error.message, true))
    renderLesson()
    renderPlayerState()
    showStatus(`Transcripción procesada · ${segments.length} frases.`)
}

function showManualPanel(focus = false) {
    const panel = byId("shadowing-manual")
    if (!panel) return
    panel.classList.remove("hidden")
    panel.open = true
    if (focus) {
        panel.scrollIntoView({ block: "nearest", behavior: "smooth" })
        byId("shadowing-transcript-input")?.focus()
    }
}

/* Caché persistente de definiciones y traducciones.
 * Evita volver a pedir lo mismo a la IA al recargar la app o al cambiar de
 * frase. Se guarda en el dispositivo (localStorage) con un límite de tamaño. */
const WORD_CACHE_STORAGE = "shadowing_word_cache_v1"
const WORD_CACHE_LIMIT = 800
const SENTENCE_CACHE_STORAGE = "shadowing_sentence_cache_v1"
const SENTENCE_CACHE_LIMIT = 400

function readStoredCache(storageKey, id) {
    try {
        const raw = localStorage.getItem(storageKey)
        if (!raw) return null
        const cache = JSON.parse(raw)
        return cache?.[id] || null
    } catch (error) {
        return null
    }
}

function writeStoredCache(storageKey, id, value, limit) {
    try {
        const raw = localStorage.getItem(storageKey)
        const cache = raw ? JSON.parse(raw) || {} : {}
        cache[id] = { value, savedAt: Date.now() }
        const keys = Object.keys(cache)
        if (keys.length > limit) {
            keys.sort((left, right) => (cache[left]?.savedAt || 0) - (cache[right]?.savedAt || 0))
            for (const key of keys.slice(0, keys.length - limit)) delete cache[key]
        }
        localStorage.setItem(storageKey, JSON.stringify(cache))
    } catch (error) {
        console.warn("[shadowing] No se pudo guardar la caché local:", error)
    }
}

function usableCache(entry, hasAIKeys) {
    return Boolean(entry?.value && (entry.source === "ai" || !hasAIKeys))
}

async function lookupWord(word) {
    const term = normalizeWord(word)
    if (!term) return
    state.selectedWord = term
    const host = byId("shadowing-word-definition")
    const hasAIKeys = Boolean(localStorage.getItem(GROQ_KEY_STORAGE) || localStorage.getItem(GEMINI_KEY_STORAGE))
    const user = await ensureUser()

    const apply = lookup => {
        renderWordLookup(lookup)
        updateWordActions(true)
    }
    const remember = (lookup, source) => {
        state.lookupCache.set(term, lookup)
        writeStoredCache(WORD_CACHE_STORAGE, term, { lookup, source }, WORD_CACHE_LIMIT)
        const pending = aiCache?.save(user?.id || null, "word", term, lookup, source)
        if (pending) pending.catch(error => console.warn("[shadowing] No se pudo guardar en la cuenta:", error))
    }

    const memory = state.lookupCache.get(term)
    if (memory) {
        apply(memory)
        return
    }

    // 1. Copia en este dispositivo: la segunda vez no cuesta nada.
    const stored = readStoredCache(WORD_CACHE_STORAGE, term)?.value
    const localEntry = stored?.lookup ? { value: stored.lookup, source: stored.source } : null
    if (usableCache(localEntry, hasAIKeys)) {
        apply(localEntry.value)
        return
    }

    // 2. Copia en la cuenta: funciona también desde otro dispositivo.
    if (aiCache) {
        const remote = await aiCache.get(user?.id || null, "word", term)
        if (usableCache(remote, hasAIKeys)) {
            writeStoredCache(WORD_CACHE_STORAGE, term, { lookup: remote.value, source: remote.source }, WORD_CACHE_LIMIT)
            apply(remote.value)
            return
        }
    }

    if (host) host.innerHTML = `<p>Buscando “${term}”…</p>`
    if (!hasAIKeys) {
        try {
            const lookup = await dictionaryFallback(term)
            remember(lookup, "dictionary")
            apply(lookup)
        } catch (error) {
            if (host) host.textContent = "No se pudo buscar esa palabra."
        }
        return
    }
    try {
        const { lookupEnglishWord } = await import("../ai-translation.js")
        const lookup = await lookupEnglishWord(term, state.current?.transcript?.[state.currentIndex]?.text || "")
        remember(lookup, "ai")
        apply(lookup)
    } catch (error) {
        console.warn("[shadowing] IA no disponible, usando diccionario:", error)
        const lookup = await dictionaryFallback(term)
        remember(lookup, "dictionary")
        apply(lookup)
    }
}

async function dictionaryFallback(word) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    try {
        const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`, { signal: controller.signal })
        if (!response.ok) throw new Error("Palabra no encontrada.")
        const data = await response.json()
        const entry = data[0] || {}
        const definitions = []
        for (const meaning of entry.meanings || []) {
            for (const definition of meaning.definitions || []) {
                definitions.push({ partOfSpeech: meaning.partOfSpeech || "palabra", definition: definition.definition })
                if (definitions.length >= 3) break
            }
            if (definitions.length >= 3) break
        }
        return { phonetic: entry.phonetic || String(entry.phonetics?.find(phonetic => phonetic?.text)?.text || ""), translation: definitions[0]?.definition || word, definitions, synonyms: [] }
    } finally {
        clearTimeout(timer)
    }
}

function renderWordLookup(lookup) {
    const host = byId("shadowing-word-definition")
    if (!host) return
    host.replaceChildren()
    const heading = document.createElement("h4")
    heading.textContent = lookup.phonetic ? `${state.selectedWord} · ${lookup.phonetic}` : state.selectedWord
    const translation = document.createElement("p")
    translation.textContent = lookup.translation || lookup.definitions?.[0]?.definition || wordFallback(state.selectedWord)
    const list = document.createElement("ul")
    for (const item of lookup.definitions || []) {
        const row = document.createElement("li")
        row.textContent = `${item.partOfSpeech}: ${item.definition}`
        list.append(row)
    }
    host.append(heading, translation, list)
    renderWordList(state.current?.transcript?.[state.currentIndex]?.text || "")
}

function wordFallback(word) {
    return `Definición de ${word} (diccionario en inglés)`
}

async function translateCurrentSentence() {
    const current = state.current?.transcript?.[state.currentIndex]?.text || ""
    if (!current) return
    const button = byId("shadowing-translate")
    const node = byId("shadowing-translation")

    // Copia en este dispositivo.
    const stored = readStoredCache(SENTENCE_CACHE_STORAGE, current)?.value
    if (stored) {
        state.translation = stored
        if (node) {
            node.classList.remove("hidden")
            node.textContent = stored
        }
        return
    }

    // Copia en la cuenta: otro dispositivo no vuelve a pagar la traducción.
    if (aiCache) {
        const user = await ensureUser()
        const remote = await aiCache.get(user?.id || null, "sentence", current)
        if (remote?.value) {
            state.translation = remote.value
            writeStoredCache(SENTENCE_CACHE_STORAGE, current, remote.value, SENTENCE_CACHE_LIMIT)
            if (node) {
                node.classList.remove("hidden")
                node.textContent = remote.value
            }
            return
        }
    }

    if (!localStorage.getItem(GROQ_KEY_STORAGE) && !localStorage.getItem(GEMINI_KEY_STORAGE)) {
        const message = "Para traducir frases necesitas una API key de IA. Pulsa «🤖 Configurar IA» arriba y pega tu key gratuita de Groq o Gemini."
        if (node) {
            node.classList.remove("hidden")
            node.textContent = message
        }
        showStatus(message, true)
        return
    }
    if (button) {
        button.disabled = true
        button.classList.add("is-busy")
        button.title = "Traduciendo…"
    }
    try {
        const { translateEnglishSentence } = await import("../ai-translation.js")
        const result = await translateEnglishSentence(current)
        state.translation = result.spanish
        writeStoredCache(SENTENCE_CACHE_STORAGE, current, result.spanish, SENTENCE_CACHE_LIMIT)
        const user = await ensureUser()
        const pending = aiCache?.save(user?.id || null, "sentence", current, result.spanish, "ai")
        if (pending) pending.catch(error => console.warn("[shadowing] No se pudo guardar en la cuenta:", error))
        if (node) {
            node.classList.remove("hidden")
            node.textContent = result.spanish
        }
    } catch (error) {
        const message = error.message || "No se pudo traducir la frase."
        if (node) {
            node.classList.remove("hidden")
            node.textContent = message
        }
        showStatus(message, true)
    } finally {
        if (button) {
            button.disabled = false
            button.classList.remove("is-busy")
            button.title = "Traducir frase"
        }
    }
}

function shadowingVocabularyValues(lookup, sentence, spanishTranslation) {
    return {
        word: state.selectedWord,
        pronunciation: lookup?.phonetic || "",
        spanish: lookup?.translation || "",
        exampleEn: sentence,
        exampleEs: spanishTranslation,
        notes: "Guardada desde Shadowing English."
    }
}

function shadowingCategory() {
    const categories = store.categoriesData || []
    return categories.find(category => category.id === "grammar")?.title
        || categories.find(category => category.title && category.title !== "Sin Categoría")?.title
        || "Sin Categoría"
}

async function saveSelectedWord() {
    const sentence = state.current?.transcript?.[state.currentIndex]?.text || ""
    const word = state.selectedWord || suggestionWords(sentence)[0]
    if (!word) return showStatus("Toca una palabra primero.", true)
    if (!requireSession("guardar la palabra")) return
    const user = await ensureUser()
    const lookup = state.lookupCache.get(normalizeWord(word)) || await lookupWord(word) || {}
    if (!state.translation) await translateCurrentSentence()
    const vocabulary = shadowingVocabularyValues(lookup, sentence, state.translation)
    try {
        const saved = await sentenceRepository.saveVocabulary(user.id, vocabulary, null, shadowingCategory())
        showToast(`Se agregó “${saved.word}” a Mi vocabulario.`, "success")
        window.dispatchEvent(new CustomEvent("personal-vocabulary-changed"))
    } catch (error) {
        console.error("[shadowing] No se pudo guardar la palabra:", error)
        if (isAuthError(error)) showStatus(loginRequiredMessage("guardar la palabra"))
        else showStatus(error.message || "No se pudo guardar la palabra.", true)
    }
}

async function saveSelectedSentence() {
    const sentence = state.current?.transcript?.[state.currentIndex]?.text || ""
    if (!sentence) return
    if (!requireSession("guardar la frase")) return
    const user = await ensureUser()
    if (!state.translation) await translateCurrentSentence()
    try {
        await sentenceRepository.save(user.id, {
            englishText: sentence,
            spanishTranslation: state.translation,
            topicTags: ["Other"],
            reasonForSaving: "Useful expression",
            grammarPattern: "",
            grammarPatternTranslation: "",
            notes: `Shadowing English${state.current?.videoId ? ` · ${state.current.videoId}` : ""}`
        })
        showToast("Frase guardada en Mi aprendizaje → Repasar.", "success")
        window.dispatchEvent(new CustomEvent("personal-sentences-changed"))
    } catch (error) {
        console.error("[shadowing] No se pudo guardar la frase:", error)
        if (isAuthError(error)) showStatus(loginRequiredMessage("guardar la frase"))
        else showStatus(error.message || "No se pudo guardar la frase.", true)
    }
}

/* Guarda la palabra seleccionada como verbo o adjetivo del catálogo
 * compartido, usando la misma cola offline que el resto de categorías. */
async function saveCatalogWord(target, word, sentence) {
    if (!requireSession("guardar la palabra en tu cuenta")) return
    const user = await ensureUser()
    const lookup = state.lookupCache.get(normalizeWord(word)) || await lookupWord(word) || {}
    if (!state.translation) await translateCurrentSentence()
    const row = catalogRowFor(target, {
        word,
        lookup,
        sentence,
        translation: state.translation,
        category: shadowingCategory(),
        id: generateLocalIntegerId()
    })
    try {
        await cacheRow(TABLES.verbs, row.id, row)
        await queueChange({
            table: TABLES.verbs,
            action: "upsert",
            payload: row,
            conflict: "id",
            localId: row.id,
            description: target === "verb" ? "Guardar verbo desde Shadowing" : "Guardar adjetivo desde Shadowing"
        })
        showToast(
            isOnline()
                ? `Se agregó “${word}” a ${saveTargetLabel(target)}.`
                : `“${word}” guardado en el dispositivo; se sincronizará al reconectar.`,
            "success"
        )
        window.dispatchEvent(new CustomEvent("catalog-changed"))
        try {
            const { loadVerbsFromSupabase } = await import("../verbs/verbs-loader.js")
            await loadVerbsFromSupabase(true)
            await window.refreshPracticeCategories?.()
        } catch (error) {
            console.warn("[shadowing] No se pudo recargar el catálogo:", error)
        }
    } catch (error) {
        console.error("[shadowing] No se pudo guardar en el catálogo:", error)
        if (isAuthError(error)) showStatus(loginRequiredMessage("guardar la palabra en tu cuenta"))
        else showStatus(error.message || "No se pudo guardar la palabra.", true)
    }
}

async function saveSelectedTarget() {
    const target = byId("shadowing-save-target")?.value || "vocabulary"
    if (saveTargetKind(target) === "sentence") return saveSelectedSentence()
    const sentence = state.current?.transcript?.[state.currentIndex]?.text || ""
    const word = state.selectedWord || suggestionWords(sentence)[0]
    if (!word) return showStatus("Toca una palabra primero.", true)
    if (target === "vocabulary") return saveSelectedWord()
    return saveCatalogWord(target, word, sentence)
}

/* Detiene la grabación antes de cambiar de frase o de lección. Así la toma se
 * guarda con la clave correcta y no se abre la autoevaluación de la frase
 * anterior encima de la nueva. */
function stopRecording({ silent = false } = {}) {
    stopSpeechAssessment()
    if (!state.mediaRecorder) return false
    state.suppressAssessment = silent
    // El evento `stop` llega después de cambiar de lección o de frase. Se guarda
    // aquí la clave y los trozos para que la toma quede en la frase correcta.
    state.pendingRecording = { key: recordingKey(), chunks: state.chunks.slice() }
    try {
        state.mediaRecorder.stop()
    } catch {
        state.mediaRecorder = null
        state.pendingRecording = null
    }
    return true
}

async function startRecording() {
    const button = byId("shadowing-record")
    if (state.mediaRecorder) {
        stopRecording()
        return
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
        byId("shadowing-recording-status").textContent = "Este navegador no soporta grabación."
        return
    }
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
        state.stream = stream
        state.chunks = []
        const recorder = new MediaRecorder(stream)
        state.mediaRecorder = recorder
        recorder.addEventListener("dataavailable", event => {
            if (event.data?.size) state.chunks.push(event.data)
        })
        recorder.addEventListener("stop", () => {
            const pending = state.pendingRecording
            const chunks = pending?.chunks?.length ? pending.chunks : state.chunks
            const key = pending?.key || recordingKey()
            state.pendingRecording = null
            const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" })
            const recordings = state.recordings.get(key) || {}
            recordings.blob = blob
            recordings.url = URL.createObjectURL(blob)
            state.recordings.set(key, recordings)
            const isCurrent = state.mediaRecorder === recorder
            if (isCurrent) {
                state.chunks = []
                state.stream?.getTracks().forEach(track => track.stop())
                state.stream = null
                state.mediaRecorder = null
                if (button) {
                    button.dataset.recording = "false"
                    button.textContent = "● Grabar"
                }
            }
            renderRecording()
            if (isCurrent && !state.suppressAssessment) finishRecordingAssessment()
            if (isCurrent) state.suppressAssessment = false
        })
        recorder.start()
        startSpeechAssessment(state.current?.transcript?.[state.currentIndex]?.text || "")
        if (button) {
            button.dataset.recording = "true"
            button.textContent = "■ Detener"
        }
        byId("shadowing-recording-status").textContent = "Grabando…"
        byId("shadowing-score").textContent = ""
    } catch (error) {
        byId("shadowing-recording-status").textContent = "No se pudo usar el micrófono. Revisa los permisos."
    }
}

function playLastRecording() {
    const recordings = recordingsFor()
    if (!recordings?.url) return
    const audio = new Audio(recordings.url)
    audio.play().catch(error => console.warn("[shadowing] No se pudo reproducir la grabación:", error))
}

/* La comparación palabra por palabra vive en speaking-practice.js para poder
 * probarla sin DOM; aquí solo se consume el resultado. */

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char])
}

function currentPhraseKey() {
    return state.externalPhrase?.key || phraseKey({ id: state.current?.id, text: currentPhraseText() })
}

function currentPhraseText() {
    return state.current?.transcript?.[state.currentIndex]?.text || ""
}

function attemptStorage() {
    try {
        return window.localStorage || null
    } catch {
        return null
    }
}

function persistSpeakingAttempt(result) {
    const key = currentPhraseKey()
    if (!key || !result) return null
    const storage = attemptStorage()
    const saved = saveBestAttempt(readBestAttempts(storage), key, result)
    writeBestAttempts(storage, saved.attempts)
    renderBestAttempt()
    return saved.best
}

function formatDueDate(dueAt) {
    const date = new Date(Number(dueAt) || 0)
    if (Number.isNaN(date.getTime())) return ""
    return date.toLocaleDateString("es-ES", { day: "numeric", month: "short" })
}

function renderBestAttempt() {
    const host = byId("shadowing-best-attempt")
    if (!host) return
    const best = readBestAttempts(attemptStorage())[currentPhraseKey()]
    if (!best) {
        host.textContent = ""
        host.classList.add("hidden")
        return
    }
    host.classList.remove("hidden")
    const label = Number(best.score) >= MASTERY_THRESHOLD ? "✅ Dominada" : "🔁 Por practicar"
    const origin = best.source === "manual" ? "autoevaluación" : "reconocimiento de voz"
    const next = isDue(best) ? " · vuelve a grabar cuando quieras" : ` · próxima práctica: ${formatDueDate(best.dueAt)}`
    host.textContent = `${label} · mejor ${best.score}% (${origin}, ${best.attempts} intentos)${next}`
}

function renderManualAssessment(message = "") {
    const container = byId("shadowing-score")
    if (!container) return
    const lead = message || "Escucha tu grabación y califica cómo te salió. No es una puntuación automática."
    container.innerHTML = `<section class="shadowing-score-card shadowing-manual-score" aria-label="Autoevaluación de pronunciación"><h4><span>TU EVALUACIÓN</span></h4><p>${escapeHtml(lead)}</p><div class="shadowing-manual-buttons"><button type="button" class="button primary" data-speaking-grade="good">✅ Me salió bien</button><button type="button" class="button secondary" data-speaking-grade="ok">🟡 Casi</button><button type="button" class="button secondary" data-speaking-grade="again">🔁 Repetir</button></div></section>`
    container.querySelectorAll("[data-speaking-grade]").forEach(button => button.addEventListener("click", () => {
        const score = manualScore(button.dataset.speakingGrade)
        if (score === null) return
        persistSpeakingAttempt({
            score,
            source: "manual",
            accuracy: score,
            fluency: score,
            completeness: score,
            missed: state.lastAssessment?.missed || []
        })
        const status = byId("shadowing-recording-status")
        if (status) status.textContent = "Autoevaluación guardada. Vuelve a grabar para mejorar."
        if (button.dataset.speakingGrade === "again") playPhrase(state.currentIndex)
    }))
}

function finishRecordingAssessment() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!Recognition) {
        renderManualAssessment("Este navegador no puntúa automáticamente. Escucha tu grabación y califica tú mismo.")
    } else if (!state.autoResultReceived) {
        renderManualAssessment("No se entendió la grabación. Escucha tu grabación y califica tú mismo.")
    }
}

function renderScoreCard(target, hypothesis) {
    const container = byId("shadowing-score")
    const status = byId("shadowing-recording-status")
    if (!container) return
    const assessment = scoreAssessment(target, hypothesis)
    state.lastAssessment = assessment
    const best = persistSpeakingAttempt(assessment)
    const { comparison, completeness, accuracy, fluency } = assessment
    const renderPanel = (value, label) => `<div class="shadowing-score-panel ${value >= 90 ? "good" : value >= 70 ? "warn" : "bad"}"><span>${label}</span><strong>${value}%</strong></div>`
    const words = comparison.result.map(item => `<span class="shadowing-${item.status}">${escapeHtml(item.text)}${item.status === "near" && item.spoken ? `<small>≈ ${escapeHtml(item.spoken)}</small>` : ""}</span>`).join(" ")
    const missed = assessment.missed.length
        ? `<div class="shadowing-missed"><span>Palabras a repetir · tócalas para oírlas</span>${assessment.missed.map(word => `<button type="button" class="shadowing-missed-word" data-speak-word="${escapeHtml(word)}">${escapeHtml(word)}</button>`).join("")}</div>`
        : ""
    container.innerHTML = `<section class="shadowing-score-card" aria-label="Análisis de pronunciación"><h4><span>SOUND BY SOUND CHECK</span><small>${Math.max(0, comparison.matched - comparison.close) + comparison.close}/${comparison.total} words clear</small></h4><div class="shadowing-score-grid">${renderPanel(accuracy, "Accuracy")}${renderPanel(fluency, "Fluency")}${renderPanel(completeness, "Completeness")}</div><div class="shadowing-you-said"><label>YOU SAID</label><div class="shadowing-comparison">${words || "<em>No se detectaron palabras.</em>"}</div></div>${missed}<small class="shadowing-comparison">Verde = claro · ámbar = parecido · rojo = no detectado. La calificación es aproximada, basada en el reconocimiento de voz${best?.source === "manual" ? "; el mejor intento fue una autoevaluación" : ""}.</small></section>`
    container.querySelectorAll("[data-speak-word]").forEach(button => button.addEventListener("click", () => {
        if (button.dataset.speakWord) playWordPronunciation(button.dataset.speakWord, "en")
    }))
    if (status) {
        status.textContent = `Resultado: ${fluency}% de la frase · mejor guardado: ${best?.score ?? fluency}%.`
        status.classList.remove("error")
    }
}

function startSpeechAssessment(target) {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition
    state.autoResultReceived = false
    if (!Recognition) {
        renderManualAssessment("Este navegador no puntúa automáticamente. Escucha tu grabación y califica tú mismo.")
        return
    }
    stopSpeechAssessment()
    const recognizer = new Recognition()
    state.recognizer = recognizer
    recognizer.lang = "en-US"
    recognizer.continuous = false
    recognizer.interimResults = false
    recognizer.addEventListener("result", event => {
        const transcript = Array.from(event.results).map(result => result[0]?.transcript || "").join(" ")
        state.autoResultReceived = true
        renderScoreCard(target, transcript)
    })
    recognizer.addEventListener("error", () => {
        if (!state.autoResultReceived) renderManualAssessment("No se pudo analizar la grabación. Escucha tu grabación y califica tú mismo.")
    })
    recognizer.addEventListener("nomatch", () => {
        if (!state.autoResultReceived) renderManualAssessment("No se entendió la grabación. Escucha tu grabación y califica tú mismo.")
    })
    try {
        recognizer.start()
    } catch {
        renderManualAssessment("No se pudo iniciar el análisis. Escucha tu grabación y califica tú mismo.")
    }
}

function stopSpeechAssessment() {
    if (!state.recognizer) return
    try { state.recognizer.stop() } catch { /* already stopped */ }
    state.recognizer = null
}

function assessSpeech(target) {
    // Compatibility shim kept for previous call sites.
}

async function retimeCurrentLesson() {
    const lesson = state.current
    if (!lesson?.videoId) return showStatus("Abre una lección de YouTube para corregir sus tiempos.", true)
    showStatus("Recalculando los tiempos de las frases…")
    const rebuilt = await fetchRebuiltSegments(lesson.videoId)
    if (!rebuilt) return showStatus("No hay transcripción guardada para recalcular los tiempos.", true)
    lesson.transcript = rebuilt
    const user = await ensureUser()
    if (user && lesson.id) {
        await shadowingRepository?.save(user.id, { ...lesson, title: lesson.title || `Lección ${lesson.videoId}` })
        await refreshLessons(lesson.id)
    }
    await transcriptStore?.save(user?.id || null, {
        videoId: lesson.videoId,
        title: lesson.title || "Lección de YouTube",
        language: lesson.language || "en",
        source: lesson.source || "auto",
        segments: rebuilt
    })
    stopPhraseTimer()
    state.currentIndex = 0
    state.translation = ""
    state.selectedWord = ""
    renderLesson()
    renderPlayerState()
    showStatus("Tiempos corregidos: cada frase empieza y termina donde debe.")
}

async function saveCurrentLesson() {
    if (!requireSession("guardar la lección")) return
    const user = await ensureUser()
    const current = state.current
    if (!current) return showStatus("Crea una lección antes de guardarla.", true)
    // Si el video ya está en la biblioteca se actualiza esa fila; nunca se
    // crea una segunda lección con el mismo videoId.
    const existingId = resolveSavedLessonId(current, state.lessons)
    const lesson = await shadowingRepository.save(user.id, {
        ...current,
        id: existingId || undefined,
        title: current.title || `Lección ${current.videoId}`
    })
    state.current = lesson
    await refreshLessons(lesson.id)
    showToast(existingId ? "Lección actualizada (ya estaba guardada)." : "Lección guardada.", "success")
}

async function openLesson(id) {
    let lesson = state.lessons.find(item => item.id === id)
    if (!lesson) return
    if (state.autoActive) stopAutoPractice("")
    // Cambiar de lección no debe dejar sonando la frase anterior ni guardar la
    // grabación en la lección equivocada.
    stopRecording({ silent: true })
    stopPhraseTimer()
    state.player?.pauseVideo?.()
    state.videoUnavailable = false
    if (needsTimingRebuild(lesson.transcript)) {
        showStatus("Ajustando los tiempos de las frases…")
        const rebuilt = await fetchRebuiltSegments(lesson.videoId)
        if (rebuilt) {
            lesson.transcript = rebuilt
            const user = await ensureUser()
            if (user) {
                await shadowingRepository?.save(user.id, { ...lesson, title: lesson.title || `Lección ${lesson.videoId}` })
                await refreshLessons(lesson.id)
                lesson = state.lessons.find(item => item.id === id) || lesson
            }
            await transcriptStore?.save(user?.id || null, {
                videoId: lesson.videoId,
                title: lesson.title || "Lección de YouTube",
                language: lesson.language || "en",
                source: lesson.source || "auto",
                segments: rebuilt
            })
            showStatus("Tiempos de las frases corregidos.")
        }
    }
    state.externalPhrase = null
    state.current = { ...lesson, transcript: retimeSegments(lesson.transcript) }
    state.currentIndex = 0
    state.translation = ""
    state.selectedWord = ""
    if (lesson.videoId) mountVideo(lesson.videoId).catch(error => showStatus(error.message, true))
    byId("shadowing-video-url").value = lesson.videoUrl
    renderLesson()
    renderPlayerState()
    showStatus("Lección abierta.")
}

/* Al perder la red se detiene YouTube y la frase en curso sigue con la voz. */
function handleConnectionLost() {
    if (!state.current) return
    const wasPlaying = Boolean(state.phraseTimer) || state.autoActive
    stopPhraseTimer()
    state.player?.pauseVideo?.()
    updatePlayButton()
    if (wasPlaying) {
        playPhrase(state.currentIndex)
    } else {
        setPracticeStatus("Sin conexión: tus lecciones guardadas se reproducen con la voz del sistema.")
    }
}

/* Al volver la red se descarta la voz y se retoma el video en la misma frase. */
async function handleConnectionRestored() {
    if (!state.current) return
    const wasPlaying = Boolean(state.phraseTimer) || state.autoActive || state.speechActive
    stopPhraseTimer()
    state.videoUnavailable = false
    const ready = await ensureVideoReady()
    if (!ready) {
        state.videoUnavailable = true
        showStatus("YouTube no responde; se mantiene la voz del sistema.", true)
    } else if (wasPlaying) {
        playPhrase(state.currentIndex)
        setPracticeStatus("Conexión restaurada: usando el video.")
    } else {
        setPracticeStatus("Conexión restaurada.")
    }
}

function wireEvents() {
    window.addEventListener("offline", handleConnectionLost)
    window.addEventListener("online", () => { handleConnectionRestored().catch(error => console.warn("[shadowing] Error al restaurar el video:", error)) })
    byId("shadowing-load-video")?.addEventListener("click", () => createLesson().catch(error => showStatus(error.message || "No se pudo crear la lección.", true)))
    byId("shadowing-parse-manual")?.addEventListener("click", parseManual)
    byId("shadowing-lessons")?.addEventListener("change", event => openLesson(event.target.value))
    byId("toggle-shadowing")?.addEventListener("click", () => {})
    byId("shadowing-play")?.addEventListener("click", () => {
        if (state.practiceMode === "auto") {
            startAutoPractice()
            return
        }
        if (state.phraseTimer) {
            stopPhraseTimer()
            state.player?.pauseVideo?.()
            setPracticeStatus("Reproducción detenida.")
            syncMediaSession("paused")
            return
        }
        playPhrase(state.currentIndex)
    })
    byId("shadowing-restart")?.addEventListener("click", () => seekToLine(state.currentIndex, true))
    byId("shadowing-back")?.addEventListener("click", () => seekToLine(state.currentIndex - 1, true))
    byId("shadowing-next")?.addEventListener("click", () => seekToLine(state.currentIndex + 1, true))
    byId("shadowing-speed")?.addEventListener("change", event => {
        state.speed = Number(event.target.value)
        if (state.playerReady) state.player.setPlaybackRate?.(state.speed)
    })
    byId("shadowing-loop")?.addEventListener("click", event => {
        state.loopLine = !state.loopLine
        event.currentTarget.setAttribute("aria-pressed", String(state.loopLine))
        event.currentTarget.title = state.loopLine ? "Frase en bucle (activada)" : "Repetir frase"
        event.currentTarget.setAttribute("aria-label", event.currentTarget.title)
    })
    byId("shadowing-save")?.addEventListener("click", () => saveCurrentLesson().catch(error => showStatus(error.message || "No se pudo guardar.", true)))
    byId("shadowing-retime")?.addEventListener("click", () => retimeCurrentLesson().catch(error => showStatus(error.message || "No se pudieron corregir los tiempos.", true)))
    byId("shadowing-translate")?.addEventListener("click", () => translateCurrentSentence())
    byId("shadowing-speak-line")?.addEventListener("click", () => {
        const sentence = state.current?.transcript?.[state.currentIndex]?.text || ""
        if (sentence) speakPhrase(sentence, "en")
    })
    byId("shadowing-mode")?.addEventListener("change", event => {
        state.practiceMode = event.target.value
        if (state.autoActive) stopAutoPractice("Modo cambiado: práctica detenida.")
        setPracticeStatus(state.practiceMode === "manual"
            ? "Modo manual: escucha, graba y pulsa › para la siguiente frase."
            : "Pulsa el botón de play para reproducir frase por frase.")
        updatePlayButton()
    })
    byId("shadowing-practice-delay")?.addEventListener("change", event => {
        state.practiceDelay = Number(event.target.value) || 3
    })
    byId("shadowing-timing-minus")?.addEventListener("click", () => adjustPhraseEnd(-0.1))
    byId("shadowing-timing-plus")?.addEventListener("click", () => adjustPhraseEnd(0.1))
    const saveTarget = byId("shadowing-save-target")
    if (saveTarget) {
        saveTarget.replaceChildren(...SAVE_TARGETS.map(target => {
            const option = document.createElement("option")
            option.value = target.value
            option.textContent = target.label
            option.selected = target.value === "vocabulary"
            return option
        }))
    }
    saveTarget?.addEventListener("change", () => updateWordActions(true))
    byId("shadowing-save-selected")?.addEventListener("click", () => saveSelectedTarget())
    byId("shadowing-record")?.addEventListener("click", () => {
        if (state.autoActive) stopAutoPractice("Práctica detenida.")
        startRecording()
    })
    byId("shadowing-play-recording")?.addEventListener("click", playLastRecording)
    byId("shadowing-load-sentence")?.addEventListener("click", () => {
        const id = String(byId("shadowing-sentence-select")?.value || "")
        const sentence = state.savedSentences.find(item => String(item.id ?? "") === id)
        if (!sentence) {
            showStatus("Elige una frase guardada antes de practicar.", true)
            return
        }
        openSpeakingPhrase(sentence)
    })
    byId("shadowing-refresh-sentences")?.addEventListener("click", () => {
        refreshSavedSentences().catch(error => showStatus("No se pudieron cargar tus frases.", true))
    })
    byId("shadowing-transcript-config")?.addEventListener("click", openTranscriptDialog)
    byId("shadowing-manual-open")?.addEventListener("click", () => showManualPanel(true))
    byId("shadowing-transcript-close")?.addEventListener("click", closeTranscriptDialog)
    byId("shadowing-transcript-save")?.addEventListener("click", saveTranscriptConfig)
    byId("shadowing-transcript-clear")?.addEventListener("click", clearTranscriptConfig)
    byId("shadowing-transcript-provider")?.addEventListener("change", syncTranscriptProviderHints)
    wireGuideWindow()
    window.setInterval(() => pollShadowing(), 100)
    updatePlayButton()
}

/* Practicar una frase del usuario sin depender de YouTube: la frase se carga
 * como una "lección" de un solo segmento y se reproduce con voz del sistema.
 * El texto siempre viene de la frase guardada; no se genera contenido. */
export function openSpeakingPhrase(sentence) {
    const english = String(sentence?.englishText || sentence?.english || sentence?.text || "").trim()
    if (!english) return false
    if (state.autoActive) stopAutoPractice("Práctica detenida.")
    stopRecording({ silent: true })
    stopPhraseTimer()
    stopPhrasePronunciation()
    const key = phraseKey(sentence || { text: english })
    state.externalPhrase = {
        key,
        id: String(sentence?.id ?? ""),
        english,
        spanish: String(sentence?.spanishTranslation || sentence?.spanish || "")
    }
    state.current = {
        id: sentence?.id || "",
        videoId: "",
        videoUrl: "",
        title: "Frase guardada",
        source: "external",
        transcript: [{
            start: 0,
            end: Math.max(2.5, english.split(/\s+/).length * 0.6),
            text: english,
            words: suggestionWords(english)
        }]
    }
    state.currentIndex = 0
    state.player = null
    state.playerReady = false
    state.videoUnavailable = false
    state.translation = state.externalPhrase.spanish
    state.selectedWord = ""
    state.lastAssessment = null
    state.autoResultReceived = false
    const score = byId("shadowing-score")
    if (score) score.textContent = ""
    clearMediaSession()
    switchPracticePane("shadowing")
    renderLesson()
    renderPlayerState()
    renderRecording()
    showStatus("Frase cargada. Escúchala y grábate hablándola.")
    byId("shadowing-record")?.focus()
    return true
}

async function refreshSavedSentences() {
    const select = byId("shadowing-sentence-select")
    if (!select) return
    const user = await ensureUser()
    if (!user) {
        requireSession("practicar tus frases guardadas")
        select.replaceChildren(new Option("Inicia sesión para ver tus frases", ""))
        return
    }
    state.savedSentences = sentenceRepository ? await sentenceRepository.list(user.id) : []
    select.replaceChildren()
    const placeholder = document.createElement("option")
    placeholder.value = ""
    placeholder.textContent = state.savedSentences.length ? "Elige una frase guardada…" : "Aún no tienes frases guardadas"
    select.append(placeholder)
    for (const sentence of state.savedSentences) {
        const option = document.createElement("option")
        option.value = String(sentence.id ?? "")
        const english = String(sentence.englishText || "").slice(0, 90)
        const spanish = String(sentence.spanishTranslation || "").slice(0, 40)
        option.textContent = spanish ? `${english} — ${spanish}` : english
        select.append(option)
    }
    const status = byId("shadowing-sentence-status")
    if (status) status.textContent = state.savedSentences.length
        ? `${state.savedSentences.length} frases listas para practicar.`
        : "Guarda frases en Mi aprendizaje para practicarlas aquí."
}

export async function initializeShadowing(supabase) {
    if (initialized) return
    initialized = true
    supabaseClient = supabase || null
    shadowingRepository = createShadowingRepository(supabaseClient)
    sentenceRepository = createSentenceRepository(supabaseClient)
    transcriptStore = createTranscriptStore(supabaseClient)
    aiCache = createAiCache(supabaseClient)
    loadTimingOffsets()
    wireEvents()
    setupPracticePaneTabs()
    renderTranscriptConfig()
    state.user = await resolveSessionUser(supabaseClient)
    window.startShadowingSentence = openSpeakingPhrase
    await refreshLessons().catch(error => console.warn("[shadowing] No se pudieron cargar las lecciones:", error))
    if (state.user) {
        await refreshSavedSentences().catch(error => console.warn("[shadowing] No se pudieron cargar las frases:", error))
    } else {
        byId("shadowing-sentence-select")?.replaceChildren(new Option("Inicia sesión para ver tus frases", ""))
    }
}

function setupPracticePaneTabs() {
    const tabs = document.querySelectorAll("#practice-pane-tabs [data-practice-pane]")
    const general = byId("practice-pane-general")
    // Los controles (Notion, categorías, pegar tabla) están en el panel de
    // ejercicios, pero con display:contents son celdas de la misma rejilla:
    // se mantienen visibles también en Escucha continua. Por eso se ocultan
    // las piezas del panel, no el panel completo.
    const generalParts = general
        ? [general.querySelector(".practice-heading"), general.querySelector(".practice-exercise")]
        : []
    const controls = document.querySelector("#practice-section .practice-controls")
    const practiceSection = byId("practice-section")
    const audioPane = byId("practice-pane-audio")
    const questionsPane = byId("practice-pane-questions")
    const shadowingPane = byId("shadowing-pane")

    const switchPane = name => {
        tabs.forEach(tab => {
            const isActive = tab.dataset.practicePane === name
            tab.classList.toggle("active", isActive)
            tab.setAttribute("aria-selected", String(isActive))
        })
        generalParts.forEach(part => part?.classList.toggle("hidden", name !== "general"))
        if (audioPane) audioPane.hidden = name !== "audio"
        if (questionsPane) questionsPane.hidden = name !== "questions"
        // El iframe de YouTube se mantiene montado para que el audio siga al
        // cambiar de pestaña: se saca de pantalla, no se oculta con display:none.
        if (shadowingPane) {
            shadowingPane.hidden = false
            shadowingPane.classList.toggle("shadowing-pane--background", name !== "shadowing")
            shadowingPane.setAttribute("aria-hidden", String(name !== "shadowing"))
        }
        if (controls) controls.classList.toggle("hidden", name === "shadowing" || name === "questions")
        practiceSection?.classList.toggle("practice-section--audio", name === "audio")
        practiceSection?.classList.toggle("practice-section--questions", name === "questions")
    }
    switchPracticePane = switchPane
    if (shadowingPane?.hidden) {
        shadowingPane.hidden = false
        shadowingPane.classList.add("shadowing-pane--background")
        shadowingPane.setAttribute("aria-hidden", "true")
    }
    tabs.forEach(tab => tab.addEventListener("click", () => switchPane(tab.dataset.practicePane)))
}
