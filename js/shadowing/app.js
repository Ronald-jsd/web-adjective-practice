import { store, GEMINI_KEY_STORAGE, GROQ_KEY_STORAGE } from "../config.js"
import { resolveSessionUser } from "../offline/session.js"
import { showToast } from "../cache.js"
import { parseManualTranscript, splitTranscriptSegments, extractYouTubeId, suggestionWords, normalizeWord, looksLikeYouTubeUrl, activeWordIndex } from "./model.js"
import { TRANSCRIPT_PROVIDERS, findProvider, providerLabel, transcriptConfig, setTranscriptCredentials, clearTranscriptCredentials } from "./transcript.js"
import { createTranscriptStore } from "./transcript-store.js"
import { createShadowingRepository } from "./repository.js"
import { createSentenceRepository } from "../sentences/repository.js"

let initialized = false
let supabaseClient = null
let shadowingRepository = null
let sentenceRepository = null
let transcriptStore = null
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
    wordSpans: [],
    speakingIndex: -1,
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
    state.speakingIndex = -1

    const tokens = sentence.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*|\S+/g) || []
    const words = tokens.filter(token => /^[A-Za-z]+(?:['’-][A-Za-z]+)*$/.test(token))
    const totalWeight = words.reduce((sum, token) => sum + wordWeight(token), 0) || 1
    const spans = []
    let elapsed = 0

    tokens.forEach(token => {
        const isWord = /^[A-Za-z]+(?:['’-][A-Za-z]+)*$/.test(token)
        if (isWord) {
            const button = document.createElement("button")
            button.type = "button"
            button.className = "shadowing-word"
            button.textContent = token
            const weight = wordWeight(token)
            spans.push({ element: button, from: elapsed / totalWeight, to: (elapsed + weight) / totalWeight })
            elapsed += weight
            button.addEventListener("click", () => {
                speakWord(token)
                lookupWord(token)
            })
            container.append(button)
            container.append(" ")
            return
        }
        container.append(document.createTextNode(token + " "))
    })
    state.wordSpans = spans
    renderWordList(sentence)
    renderRecording()
}

function wordWeight(token) {
    return Math.max(3, token.replace(/[^A-Za-z]/g, "").length)
}

/* Reproduce una palabra con la voz del navegador (sin conexión ni créditos). */
let englishVoice = null

function pickEnglishVoice() {
    const synth = window.speechSynthesis
    if (!synth?.getVoices) return null
    const voices = synth.getVoices() || []
    englishVoice = voices.find(voice => /^en[-_]/i.test(voice.lang) && /google|samantha|aria|jenny|zira|natural/i.test(voice.name))
        || voices.find(voice => /^en[-_]/i.test(voice.lang))
        || null
    return englishVoice
}

function speakWord(word) {
    const synth = window.speechSynthesis
    if (!synth || !word) return
    try {
        synth.cancel()
        const utterance = new SpeechSynthesisUtterance(String(word))
        utterance.lang = "en-US"
        utterance.rate = 0.9
        const voice = englishVoice || pickEnglishVoice()
        if (voice) utterance.voice = voice
        synth.speak(utterance)
    } catch (error) {
        console.warn("[shadowing] No se pudo pronunciar la palabra:", error)
    }
}

/* Resalta la palabra que se está oyendo. Los subtítulos solo traen el tiempo
 * de la frase completa, así que se reparte la duración según lo larga que sea
 * cada palabra: es una aproximación, no un karaoke exacto. */
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
    highlightSpokenWord(seconds, segment)
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
            await applyLesson({
                videoId,
                videoUrl,
                title: cached.title || "Lección de YouTube",
                segments: cached.segments,
                note: `Lección lista desde tus transcripciones · ${cached.segments.length} frases (sin gastar créditos).`
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
        segments = splitTranscriptSegments(data.segments)
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
        byId("shadowing-manual")?.classList.remove("hidden")
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

async function applyLesson({ videoId, videoUrl, title, segments, note }) {
    state.current = { id: "", videoId, videoUrl, title, source: "auto", transcript: segments }
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
    byId("shadowing-transcript-config")?.addEventListener("click", openTranscriptDialog)
    byId("shadowing-transcript-close")?.addEventListener("click", closeTranscriptDialog)
    byId("shadowing-transcript-save")?.addEventListener("click", saveTranscriptConfig)
    byId("shadowing-transcript-clear")?.addEventListener("click", clearTranscriptConfig)
    byId("shadowing-transcript-provider")?.addEventListener("change", syncTranscriptProviderHints)
    window.setInterval(() => pollShadowing(), 250)
}

export async function initializeShadowing(supabase) {
    if (initialized) return
    initialized = true
    supabaseClient = supabase || null
    shadowingRepository = createShadowingRepository(supabaseClient)
    sentenceRepository = createSentenceRepository(supabaseClient)
    transcriptStore = createTranscriptStore(supabaseClient)
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
