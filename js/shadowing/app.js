import { store, GEMINI_KEY_STORAGE, GROQ_KEY_STORAGE } from "../config.js"
import { resolveSessionUser } from "../offline/session.js"
import { showToast } from "../cache.js"
import { parseManualTranscript, splitTranscriptSegments, extractYouTubeId, suggestionWords, normalizeWord } from "./model.js"
import { createShadowingRepository } from "./repository.js"
import { createSentenceRepository } from "../sentences/repository.js"

let initialized = false
let supabaseClient = null
let shadowingRepository = null
let sentenceRepository = null
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
    translation: "",
    lookupCache: new Map(),
    selectedWord: "",
    recordings: new Map(),
    mediaRecorder: null,
    chunks: [],
    recognizer: null,
    stream: null
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
}

function renderLesson() {
    const current = state.current
    const transcript = current?.transcript || []
    const title = byId("shadowing-lesson-title")
    const count = byId("shadowing-progress")
    if (title) title.textContent = current?.title || "Elige una lección"
    if (count) count.textContent = `${transcript.length ? state.currentIndex + 1 : 0}/${transcript.length}`
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
    if (!container || !lesson) return
    const sentence = lesson.transcript?.[state.currentIndex]?.text || ""
    container.classList.remove("hidden")
    translateButton?.classList.toggle("hidden", !sentence)
    if (translate) translate.classList.toggle("hidden", !state.translation)
    if (translate) translate.textContent = state.translation
    container.replaceChildren()
    const tokens = sentence.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*|\S+/g) || []
    tokens.forEach(token => {
        const isWord = /^[A-Za-z]+(?:['’-][A-Za-z]+)*$/.test(token)
        if (isWord) {
            const button = document.createElement("button")
            button.type = "button"
            button.className = "shadowing-word"
            button.textContent = token
            button.addEventListener("click", () => lookupWord(token))
            container.append(button)
            if (/\s$/.test(token)) container.append(" ")
            else container.append(" ")
            return
        }
        container.append(document.createTextNode(token + " "))
    })
    renderWordList(sentence)
    renderRecording()
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
        button.addEventListener("click", () => lookupWord(word))
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
    state.currentIndex = Math.max(0, Math.min(current.transcript.length - 1, index))
    state.translation = ""
    state.selectedWord = ""
    const segment = current.transcript[state.currentIndex]
    renderLesson()
    if (keepFrame && state.playerReady && state.player?.seekTo && segment) {
        state.player.seekTo(segment.start, true)
        state.player.playVideo?.()
    }
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

function pollShadowing() {
    if (!state.current || !state.playerReady || !state.player) return
    const segment = state.current.transcript?.[state.currentIndex]
    if (!segment) return
    const seconds = Number(state.player.getCurrentTime?.() || 0)
    if (seconds >= segment.end - 0.05) {
        if (state.loopLine) {
            state.player.seekTo?.(segment.start, true)
            state.player.playVideo?.()
        } else {
            state.player.pauseVideo?.()
        }
    }
}

async function createLesson() {
    const input = byId("shadowing-video-url")
    const videoId = extractYouTubeId(input?.value || "")
    if (!videoId) {
        showStatus("Pega un enlace válido de YouTube (youtu.be, watch, shorts o embed).", true)
        return null
    }
    const videoUrl = youtubeUrl(input.value)
    const status = byId("shadowing-status")
    if (status) {
        status.textContent = "Intentando obtener los subtítulos automáticamente…"
        status.classList.remove("error", "success")
    }
    let title = "Lección de YouTube"
    let segments = []
    let source = "auto"
    try {
        const { data, error } = await supabaseClient.functions.invoke("youtube-transcript", { body: { videoId } })
        if (error) throw error
        if (!data?.segments?.length) throw new Error("No se encontraron subtítulos automáticos.")
        title = data.title || title
        segments = splitTranscriptSegments(data.segments)
    } catch (autoError) {
        console.warn("[shadowing] No se obtuvo la transcripción automática:", autoError)
        byId("shadowing-manual")?.classList.remove("hidden")
        showStatus("YouTube no entregó una transcripción reutilizable. Pega el texto, SRT o VTT y pulsa Procesar transcripción.", true)
        return null
    }

    state.current = { id: "", videoId, videoUrl, title, source, transcript: segments }
    state.currentIndex = 0
    state.translation = ""
    state.selectedWord = ""
    await mountVideo(videoId).catch(error => showStatus(error.message, true))
    byId("shadowing-manual")?.classList.add("hidden")
    byId("shadowing-video-url").value = videoUrl
    renderLesson()
    renderPlayerState()
    showStatus(`Lección lista · ${segments.length} frases ${source === "auto" ? "(transcripción automática)" : ""}.`)
    return state.current
}

function parseManual() {
    const input = byId("shadowing-transcript-input")
    const segments = parseManualTranscript(input?.value || "")
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
    if (!state.current || state.current.videoId !== videoId) state.current = { id: "", videoId, videoUrl: youtubeUrl(raw), title: "Lección de YouTube", source: "manual", transcript: segments }
    else state.current = { ...state.current, transcript: segments, source: "manual" }
    state.currentIndex = 0
    state.translation = ""
    state.selectedWord = ""
    mountVideo(videoId).catch(error => showStatus(error.message, true))
    renderLesson()
    renderPlayerState()
    showStatus(`Transcripción procesada · ${segments.length} frases.`)
}

function loadManualState() {
    byId("shadowing-manual")?.classList.remove("hidden")
}

async function lookupWord(word) {
    const term = normalizeWord(word)
    if (!term) return
    state.selectedWord = term
    const host = byId("shadowing-word-definition")
    const cached = state.lookupCache.get(term)
    if (cached) {
        renderWordLookup(cached)
        updateWordActions(true)
        return
    }
    if (host) host.innerHTML = `<p>Buscando “${term}”…</p>`
    const hasAIKeys = Boolean(localStorage.getItem(GROQ_KEY_STORAGE) || localStorage.getItem(GEMINI_KEY_STORAGE))
    if (!hasAIKeys) {
        try {
            const lookup = await dictionaryFallback(term)
            state.lookupCache.set(term, lookup)
            renderWordLookup(lookup)
            updateWordActions(true)
        } catch (error) {
            if (host) host.textContent = "No se pudo buscar esa palabra."
        }
        return
    }
    try {
        const { lookupEnglishWord } = await import("../ai-translation.js")
        const lookup = await lookupEnglishWord(term, state.current?.transcript?.[state.currentIndex]?.text || "")
        state.lookupCache.set(term, lookup)
        renderWordLookup(lookup)
        updateWordActions(true)
    } catch (error) {
        console.warn("[shadowing] IA no disponible, usando diccionario:", error)
        const lookup = await dictionaryFallback(term)
        state.lookupCache.set(term, lookup)
        renderWordLookup(lookup)
        updateWordActions(true)
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
    if (button) {
        button.disabled = true
        button.textContent = "Traduciendo…"
    }
    try {
        const { translateEnglishSentence } = await import("../ai-translation.js")
        const result = await translateEnglishSentence(current)
        state.translation = result.spanish
        if (node) {
            node.classList.remove("hidden")
            node.textContent = result.spanish
        }
    } catch (error) {
        showStatus(error.message || "No se pudo traducir la frase.", true)
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
    if (state.recognizer) assessSpeech(state.current?.transcript?.[state.currentIndex]?.text || "")
}

function wordAccuracy(target, hypothesis) {
    const normalize = text => String(text || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").split(/\s+/).filter(Boolean)
    const reference = normalize(target)
    const spoken = normalize(hypothesis)
    if (!reference.length) return 0
    const remaining = [...spoken]
    let matched = 0
    for (const word of reference) {
        const index = remaining.indexOf(word)
        if (index >= 0) {
            matched += 1
            remaining.splice(index, 1)
        }
    }
    return Math.round((matched / reference.length) * 100)
}

function assessSpeech(target) {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!Recognition) return
    state.recognizer = new Recognition()
    state.recognizer.lang = "en-US"
    state.recognizer.continuous = false
    state.recognizer.interimResults = false
    state.recognizer.addEventListener("result", event => {
        const transcript = Array.from(event.results).map(result => result[0]?.transcript || "").join(" ")
        const score = wordAccuracy(target, transcript)
        state.recordings.set(state.currentIndex, { ...(state.recordings.get(state.currentIndex) || {}), score })
        if (byId("shadowing-score")) byId("shadowing-score").textContent = `Tu pronunciación coincidió un ${score}% con la frase.`
        if (byId("shadowing-recording-status")) byId("shadowing-recording-status").textContent = `Resultado: ${score}% de palabras correctas.`
    })
    try { state.recognizer.start() } catch { /* sin reconocimiento */ }
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
    const lesson = state.lessons.find(item => item.id === id)
    if (!lesson) return
    state.current = { ...lesson }
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
        const segment = state.current?.transcript?.[state.currentIndex]
        if (!segment || !state.playerReady) return
        state.player.seekTo?.(segment.start, true)
        state.player.playVideo?.()
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
    byId("shadowing-translate")?.addEventListener("click", () => translateCurrentSentence())
    byId("shadowing-add-vocabulary")?.addEventListener("click", () => saveSelectedWord())
    byId("shadowing-add-review")?.addEventListener("click", () => saveSelectedSentence())
    byId("shadowing-record")?.addEventListener("click", () => startRecording())
    byId("shadowing-play-recording")?.addEventListener("click", playLastRecording)
    window.setInterval(() => pollShadowing(), 500)
}

export async function initializeShadowing(supabase) {
    if (initialized) return
    initialized = true
    supabaseClient = supabase || null
    shadowingRepository = createShadowingRepository(supabaseClient)
    sentenceRepository = createSentenceRepository(supabaseClient)
    wireEvents()
    setupPracticePaneTabs()
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
