import { store, GEMINI_KEY_STORAGE, GROQ_KEY_STORAGE } from "../config.js"
import { resolveSessionUser } from "../offline/session.js"
import { showToast } from "../cache.js"
import { parseManualTranscript, splitTranscriptSegments, extractYouTubeId, suggestionWords, normalizeWord, looksLikeYouTubeUrl, activeWordIndex, retimeSegments } from "./model.js"
import { buildSpeechGuide, explainGuide } from "./speech-guide.js"
import { TRANSCRIPT_PROVIDERS, findProvider, providerLabel, transcriptConfig, setTranscriptCredentials, clearTranscriptCredentials } from "./transcript.js"
import { createTranscriptStore } from "./transcript-store.js"
import { createAiCache } from "./ai-cache.js"
import { playWordPronunciation, speakPhrase, getPronunciation } from "./pronunciation.js"
import { createShadowingRepository } from "./repository.js"
import { createSentenceRepository } from "../sentences/repository.js"

let initialized = false
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
    phraseTimer: null,
    autoRecording: false,
    timingOffsets: new Map(),
    translation: "",
    lookupCache: new Map(),
    selectedWord: "",
    wordSpans: [],
    guideWindowShown: false,
    guideDrag: null,
    speakingIndex: -1,
    recordings: new Map(),
    mediaRecorder: null,
    chunks: [],
    recognizer: null,
    stream: null
}

const TIMING_STORAGE = "shadowing_phrase_timing_v1"
const GUIDE_POS_STORAGE = "shadowing_guide_window_v1"

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
        return value && Number.isFinite(value.left) && Number.isFinite(value.top) ? value : null
    } catch (error) {
        return null
    }
}

function saveGuidePosition(position) {
    try {
        localStorage.setItem(GUIDE_POS_STORAGE, JSON.stringify(position))
    } catch (error) {
        console.warn("[shadowing] No se pudo guardar la posición de la guía:", error)
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
    if (visible) {
        placeGuideWindow(node)
        state.guideWindowShown = true
    }
}

function wireGuideWindow() {
    const node = byId("shadowing-guide-window")
    if (!node) return
    // #practice-section mantiene un transform de su animación de entrada; eso
    // convierte cualquier position:fixed en hijo en posición relativa al
    // contenedor. Al mover la guía al body se ancla de verdad al viewport.
    if (node.parentElement !== document.body) document.body.appendChild(node)
    byId("shadowing-guide-open")?.addEventListener("click", () => toggleGuideWindow())
    byId("shadowing-guide-close")?.addEventListener("click", () => toggleGuideWindow(false))
    const handle = node.querySelector("[data-guide-drag]")
    handle?.addEventListener("pointerdown", event => {
        // En móvil la guía es una hoja fija abajo: no se arrastra.
        if (window.matchMedia("(max-width: 700px)").matches) return
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
    window.addEventListener("resize", () => {
        if (!node.classList.contains("hidden")) placeGuideWindow(node)
    })
    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && !node.classList.contains("hidden")) toggleGuideWindow(false)
    })
    const section = byId("practice-section")
    if (section) {
        new MutationObserver(() => {
            if (section.classList.contains("active") || node.classList.contains("hidden")) return
            toggleGuideWindow(false)
            state.guideWindowShown = false // se reabre al volver a Practicar si estaba abierta
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

function recordingsFor(index) {
    return state.recordings.get(index) || null
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
    lines.replaceChildren()
    transcript.forEach((segment, index) => {
        const button = document.createElement("button")
        button.type = "button"
        button.className = `shadowing-line${index === state.currentIndex ? " active" : ""}`
        button.setAttribute("aria-current", index === state.currentIndex ? "true" : "false")
        const number = document.createElement("span")
        number.textContent = String(index + 1)
        const text = document.createElement("strong")
        text.textContent = segment.text
        button.append(number, text)
        button.addEventListener("click", () => seekToLine(index, true))
        lines.append(button)
    })
    lines.querySelector(".shadowing-line.active")?.scrollIntoView({ block: "nearest" })
    renderTranscript(current)
}

function renderTranscript(lesson = state.current) {
    const container = byId("shadowing-transcript")
    const translate = byId("shadowing-translation")
    const translateButton = byId("shadowing-translate")
    const speakButton = byId("shadowing-speak-line")
    if (!container || !lesson) return
    const sentence = lesson.transcript?.[state.currentIndex]?.text || ""
    container.classList.remove("hidden")
    translateButton?.classList.toggle("hidden", !sentence)
    speakButton?.classList.toggle("hidden", !sentence)
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
    if (!state.guideWindowShown) toggleGuideWindow(true)
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
    const addVocab = byId("shadowing-add-vocabulary")
    const addReview = byId("shadowing-add-review")
    if (addVocab) addVocab.disabled = !enabled
    if (addReview) addReview.disabled = !enabled
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
}

function seekToLine(index, keepFrame = false) {
    const current = state.current
    if (!current?.transcript?.length) return
    if (state.autoActive) stopAutoPractice("Práctica detenida.")
    state.currentIndex = Math.max(0, Math.min(current.transcript.length - 1, index))
    state.translation = ""
    state.selectedWord = ""
    stopPhraseTimer()
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
        controls?.classList.remove("hidden")
        byId("shadowing-practice-bar")?.classList.remove("hidden")
        player?.classList.remove("hidden")
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
    pollShadowing()
}

function stopPhraseTimer() {
    if (state.phraseTimer) {
        clearTimeout(state.phraseTimer)
        state.phraseTimer = null
    }
}

function finishPhrase() {
    if (!state.player) return
    stopPhraseTimer()
    state.player.pauseVideo?.()
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

/* Va al inicio exacto de la frase y vigila su final con el tiempo del video. */
function playPhrase(index = state.currentIndex) {
    const segment = phraseAt(index)
    if (!segment || !state.playerReady || !state.player) return
    stopPhraseTimer()
    state.currentIndex = Math.max(0, Math.min(state.current.transcript.length - 1, index))
    state.player.seekTo(segment.start, true)
    state.player.playVideo()
    const startedAt = performance.now()
    state.phraseStartedAt = startedAt
    state.phraseTimer = setTimeout(() => watchPhraseEnd(segment, startedAt), 40)
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

function setPracticeStatus(message) {
    const node = byId("shadowing-practice-status")
    if (node) node.textContent = message || ""
}

function updateAutoButton() {
    const button = byId("shadowing-auto-toggle")
    if (!button) return
    button.textContent = state.autoActive ? "■ Detener práctica" : "▶ Iniciar práctica"
    button.setAttribute("aria-pressed", String(state.autoActive))
}

function stopAutoPractice(message = "") {
    if (state.autoTimer) {
        clearTimeout(state.autoTimer)
        state.autoTimer = null
    }
    stopPhraseTimer()
    if (state.autoRecording && state.mediaRecorder) {
        try { state.mediaRecorder.stop() } catch { /* ya detenido */ }
        stopSpeechAssessment()
    }
    state.autoActive = false
    state.awaitingTurn = false
    state.autoRecording = false
    state.player?.pauseVideo?.()
    updateAutoButton()
    setPracticeStatus(message)
}

function startAutoPractice() {
    if (state.autoActive) {
        stopAutoPractice("Práctica detenida.")
        return
    }
    const segment = state.current?.transcript?.[state.currentIndex]
    if (!segment || !state.playerReady) return
    if (state.practiceMode === "manual") {
        setPracticeStatus("Elige «Automático» o «Automático + grabar» para usar esta opción.")
        return
    }
    state.autoActive = true
    state.awaitingTurn = false
    updateAutoButton()
    playPhrase(state.currentIndex)
    setPracticeStatus("Reproduciendo frase…")
}

function handleAutoAdvance() {
    if (state.awaitingTurn) return
    state.awaitingTurn = true
    const record = state.practiceMode === "auto-record"
    setPracticeStatus(record ? "Tu turno: graba tu frase…" : `Tu turno: espera ${state.practiceDelay} s…`)
    if (record) {
        startRecording().then(() => { state.autoRecording = Boolean(state.mediaRecorder) })
    }
    state.autoTimer = setTimeout(() => {
        if (!state.autoActive) return
        if (state.autoRecording && state.mediaRecorder) {
            try { state.mediaRecorder.stop() } catch { /* ya detenido */ }
            stopSpeechAssessment()
            state.autoRecording = false
        }
        if (state.currentIndex >= state.current.transcript.length - 1) {
            stopAutoPractice("Práctica terminada.")
            return
        }
        state.awaitingTurn = false
        state.translation = ""
        state.selectedWord = ""
        renderLesson()
        playPhrase(state.currentIndex + 1)
        setPracticeStatus("Reproduciendo frase…")
    }, state.practiceDelay * 1000)
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
                if (rebuilt) segments = rebuilt
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
 * habla. En ese formato casi todas las frases se solapan con la siguiente. */
function needsTimingRebuild(transcript) {
    if (!Array.isArray(transcript) || transcript.length < 3) return false
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
    const timed = retimeSegments(segments)
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
        button.textContent = "Traduciendo…"
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
            button.textContent = "Traducir frase"
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

async function saveSelectedWord() {
    const sentence = state.current?.transcript?.[state.currentIndex]?.text || ""
    const word = state.selectedWord || suggestionWords(sentence)[0]
    if (!word) return showStatus("Toca una palabra primero.", true)
    const user = await ensureUser()
    if (!user) return showStatus("Inicia sesión para guardar palabras.", true)
    const lookup = state.lookupCache.get(normalizeWord(word)) || await lookupWord(word) || {}
    if (!state.translation) await translateCurrentSentence()
    const vocabulary = shadowingVocabularyValues(lookup, sentence, state.translation)
    try {
        const category = (store.categoriesData || []).find(category => category.id === "grammar")?.title || "Mis Expresiones"
        const saved = await sentenceRepository.saveVocabulary(user.id, vocabulary, null, category)
        showToast(`Se agregó “${saved.word}” a Mi vocabulario.`, "success")
        window.dispatchEvent(new CustomEvent("personal-vocabulary-changed"))
        byId("shadowing-add-vocabulary").disabled = true
    } catch (error) {
        console.error("[shadowing] No se pudo guardar la palabra:", error)
        showStatus(error.message || "No se pudo guardar la palabra.", true)
    }
}

async function saveSelectedSentence() {
    const sentence = state.current?.transcript?.[state.currentIndex]?.text || ""
    if (!sentence) return
    const user = await ensureUser()
    if (!user) return showStatus("Inicia sesión para guardar frases.", true)
    if (!state.translation) await translateCurrentSentence()
    try {
        const saved = await sentenceRepository.save(user.id, {
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
        byId("shadowing-add-review").disabled = true
    } catch (error) {
        console.error("[shadowing] No se pudo guardar la frase:", error)
        showStatus(error.message || "No se pudo guardar la frase.", true)
    }
}

async function startRecording() {
    const button = byId("shadowing-record")
    if (state.mediaRecorder) {
        state.mediaRecorder.stop()
        stopSpeechAssessment()
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
            const blob = new Blob(state.chunks, { type: recorder.mimeType || "audio/webm" })
            const recordings = state.recordings.get(state.currentIndex) || {}
            recordings.blob = blob
            recordings.url = URL.createObjectURL(blob)
            state.recordings.set(state.currentIndex, recordings)
            state.chunks = []
            state.stream?.getTracks().forEach(track => track.stop())
            state.stream = null
            state.mediaRecorder = null
            if (button) {
                button.dataset.recording = "false"
                button.textContent = "● Grabar"
            }
            renderRecording()
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
    const recordings = state.recordings.get(state.currentIndex) || {}
    if (!recordings?.url) return
    const audio = new Audio(recordings.url)
    audio.play().catch(error => console.warn("[shadowing] No se pudo reproducir la grabación:", error))
}

function normalizedWords(text) {
    return String(text || "").toLowerCase().replace(/[^a-z0-9']+/g, " ").split(/\s+/).filter(Boolean)
}

function editDistance(left, right) {
    const rows = left.length + 1
    const columns = right.length + 1
    const matrix = Array.from({ length: rows }, () => Array(columns).fill(0))
    for (let leftIndex = 0; leftIndex < rows; leftIndex += 1) matrix[leftIndex][0] = leftIndex
    for (let rightIndex = 0; rightIndex < columns; rightIndex += 1) matrix[0][rightIndex] = rightIndex
    for (let leftIndex = 1; leftIndex < rows; leftIndex += 1) {
        for (let rightIndex = 1; rightIndex < columns; rightIndex += 1) {
            const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1
            matrix[leftIndex][rightIndex] = Math.min(matrix[leftIndex - 1][rightIndex] + 1, matrix[leftIndex][rightIndex - 1] + 1, matrix[leftIndex - 1][rightIndex - 1] + cost)
        }
    }
    return matrix[rows - 1][columns - 1]
}

/* Mínimo Levenshtein realizado por el navegador con la transcripción hablada;
 * es una aproximación, pero permite colorear palabra por palabra. */
function compareWords(target, spoken) {
    const targetWords = normalizedWords(target)
    const spokenWords = [...normalizedWords(spoken)]
    let spokenCursor = 0
    let matched = 0
    let close = 0
    const result = []
    for (const referenceWord of targetWords) {
        const lookAhead = spokenWords.slice(spokenCursor, spokenCursor + 4)
        const exact = lookAhead.findIndex(word => word === referenceWord)
        if (exact >= 0) {
            const spokenWord = lookAhead[exact]
            spokenCursor += exact + 1
            matched += 1
            result.push({ text: referenceWord, status: "match", spoken: spokenWord })
            continue
        }
        const near = lookAhead.findIndex(word => editDistance(word, referenceWord) <= Math.max(1, Math.floor(referenceWord.length / 3)))
        if (near >= 0) {
            const spokenWord = lookAhead[near]
            spokenCursor += near + 1
            matched += 1
            close += 1
            result.push({ text: referenceWord, status: "near", spoken: spokenWord })
            continue
        }
        result.push({ text: referenceWord, status: "miss", spoken: null })
    }
    return { result, matched, close, total: targetWords.length, spoken: spokenWords.length }
}

function renderScoreCard(target, hypothesis) {
    const container = byId("shadowing-score")
    const status = byId("shadowing-recording-status")
    if (!container) return
    const comparison = compareWords(target, hypothesis)
    const completeness = comparison.total ? Math.round(((comparison.matched - comparison.close * 0.5) / comparison.total) * 100) : 0
    const accuracy = comparison.spoken ? Math.round(((comparison.matched - comparison.close * 0.5) / comparison.spoken) * 100) : 0
    const fluency = Math.max(0, Math.min(100, Math.round((completeness * 0.75) + (accuracy * 0.25))))
    const renderPanel = (value, label, tone) => `<div class="shadowing-score-panel ${tone || value >= 90 ? "good" : value >= 70 ? "warn" : "bad"}"><span>${label}</span><strong>${value}%</strong></div>`
    const words = comparison.result.map(item => `<span class="shadowing-${item.status}">${item.text}${item.status === "near" && item.spoken ? `<small>≈ ${item.spoken}</small>` : ""}</span>`).join(" ")
    container.innerHTML = `<section class="shadowing-score-card" aria-label="Análisis de pronunciación"><h4><span>SOUND BY SOUND CHECK</span><small>${Math.max(0, comparison.matched - comparison.close) + comparison.close}/${comparison.total} words clear</small></h4><div class="shadowing-score-grid">${renderPanel(Math.max(0, accuracy), "Accuracy")}${renderPanel(fluency, "Fluency")}${renderPanel(completeness, "Completeness")}</div><div class="shadowing-you-said"><label>YOU SAID</label><div class="shadowing-comparison">${words || "<em>No se detectaron palabras.</em>"}</div></div><small class="shadowing-comparison">Green = clear · amber = similar · red = unclear. La calificación es aproximada basada en el reconocimiento de voz.</small></section>`
    if (status) {
        status.textContent = `Resultado: ${completeness}% de la frase.`
        status.classList.remove("error")
    }
}

function startSpeechAssessment(target) {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!Recognition) {
        if (byId("shadowing-recording-status")) byId("shadowing-recording-status").textContent = "Grabación lista. Este navegador no puede puntuación automática."
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
        renderScoreCard(target, transcript)
    })
    try { recognizer.start() } catch { /* mic unavailable */ }
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
    stopPhraseTimer()
    state.currentIndex = 0
    state.translation = ""
    state.selectedWord = ""
    renderLesson()
    renderPlayerState()
    showStatus("Tiempos corregidos: cada frase empieza y termina donde debe.")
}

async function saveCurrentLesson() {
    const user = await ensureUser()
    if (!user) return showStatus("Inicia sesión para guardar la lección.", true)
    const current = state.current
    if (!current) return showStatus("Crea una lección antes de guardarla.", true)
    const lesson = await shadowingRepository.save(user.id, { ...current, title: current.title || `Lección ${current.videoId}` })
    state.current = lesson
    await refreshLessons(lesson.id)
    showToast("Lección guardada.", "success")
}

async function openLesson(id) {
    let lesson = state.lessons.find(item => item.id === id)
    if (!lesson) return
    if (state.autoActive) stopAutoPractice("")
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
            showStatus("Tiempos de las frases corregidos.")
        }
    }
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

function wireEvents() {
    byId("shadowing-load-video")?.addEventListener("click", () => createLesson().catch(error => showStatus(error.message || "No se pudo crear la lección.", true)))
    byId("shadowing-parse-manual")?.addEventListener("click", parseManual)
    byId("shadowing-lessons")?.addEventListener("change", event => openLesson(event.target.value))
    byId("toggle-shadowing")?.addEventListener("click", () => {})
    byId("shadowing-play")?.addEventListener("click", () => {
        if (state.autoActive) stopAutoPractice("Práctica detenida.")
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
        event.currentTarget.textContent = state.loopLine ? "↻ Frase en bucle" : "↻ Repetir frase"
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
        setPracticeStatus(state.practiceMode === "manual" ? "Modo manual: usa «Escuchar» y «Grabar» en cada frase." : "Pulsa «Iniciar práctica» para reproducir frase por frase.")
    })
    byId("shadowing-practice-delay")?.addEventListener("change", event => {
        state.practiceDelay = Number(event.target.value) || 3
    })
    byId("shadowing-auto-toggle")?.addEventListener("click", startAutoPractice)
    byId("shadowing-timing-minus")?.addEventListener("click", () => adjustPhraseEnd(-0.1))
    byId("shadowing-timing-plus")?.addEventListener("click", () => adjustPhraseEnd(0.1))
    byId("shadowing-add-vocabulary")?.addEventListener("click", () => saveSelectedWord())
    byId("shadowing-add-review")?.addEventListener("click", () => saveSelectedSentence())
    byId("shadowing-record")?.addEventListener("click", () => {
        if (state.autoActive) stopAutoPractice("Práctica detenida.")
        startRecording()
    })
    byId("shadowing-play-recording")?.addEventListener("click", playLastRecording)
    byId("shadowing-transcript-config")?.addEventListener("click", openTranscriptDialog)
    byId("shadowing-manual-open")?.addEventListener("click", () => showManualPanel(true))
    byId("shadowing-transcript-close")?.addEventListener("click", closeTranscriptDialog)
    byId("shadowing-transcript-save")?.addEventListener("click", saveTranscriptConfig)
    byId("shadowing-transcript-clear")?.addEventListener("click", clearTranscriptConfig)
    byId("shadowing-transcript-provider")?.addEventListener("change", syncTranscriptProviderHints)
    wireGuideWindow()
    window.setInterval(() => pollShadowing(), 100)
    updateAutoButton()
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
    await refreshLessons().catch(error => console.warn("[shadowing] No se pudieron cargar las lecciones:", error))
}

function setupPracticePaneTabs() {
    const tabs = document.querySelectorAll("#practice-pane-tabs [data-practice-pane]")
    const switchPane = name => {
        document.querySelectorAll("#practice-pane-tabs [data-practice-pane]").forEach(tab => {
            const isActive = tab.dataset.practicePane === name
            tab.classList.toggle("active", isActive)
            tab.setAttribute("aria-selected", String(isActive))
        })
        byId("practice-pane-general")?.classList.toggle("hidden", name !== "general")
        const pane = byId("shadowing-pane")
        if (pane) pane.hidden = name !== "shadowing"
    }
    tabs.forEach(tab => tab.addEventListener("click", () => switchPane(tab.dataset.practicePane)))
}
