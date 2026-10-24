import { store } from "../config.js"
import { supabase } from "../app.js"
import { playAudioEnhanced } from "../audio.js"
import { REASONS, TOPICS, suggestGrammarPattern, validateSentence } from "./model.js"
import { isDue, scheduleReview } from "./scheduler.js"
import { createSentenceRepository } from "./repository.js"

const repository = createSentenceRepository(supabase)
const state = { user: null, sentences: [], vocabulary: null, review: null }
const byId = id => document.getElementById(id)

function showNotice(message, isError = false) {
    const notice = byId("notice")
    notice.textContent = message
    notice.classList.toggle("error", isError)
    notice.classList.remove("hidden")
    clearTimeout(showNotice.timer)
    showNotice.timer = setTimeout(() => notice.classList.add("hidden"), 5500)
}

function storageErrorMessage(error, action) {
    const detail = error?.message || "Unknown Supabase error"
    if (error?.code === "PGRST205" || error?.code === "42P01" || /could not find the table|relation .* does not exist/i.test(detail)) {
        const table = /my_sentences/i.test(detail) ? "my_sentences" : "requerida"
        return `No existe la tabla ${table} en Supabase. Ejecuta supabase/schema.sql en el SQL Editor del proyecto conectado a la app. Detalle: ${detail}`
    }
    return `${action} Detalle de Supabase: ${detail}`
}

function boxName(box) {
    return box === "mastered" ? "Mastered · 30 days" : `Box ${box} · ${box === 1 ? "daily" : box === 2 ? "3 days" : "7 days"}`
}

function getDue() {
    const now = new Date()
    return state.sentences.filter(sentence => isDue(sentence, now))
}

function updateStats() {
    const due = getDue()
    const today = new Date().toDateString()
    const reviewedToday = state.sentences.filter(sentence => sentence.lastReviewedAt && new Date(sentence.lastReviewedAt).toDateString() === today).length
    const attempts = state.sentences.reduce((sum, sentence) => sum + sentence.totalAttempts, 0)
    const failures = state.sentences.reduce((sum, sentence) => sum + sentence.totalFailures, 0)
    byId("due-count").textContent = due.length
    byId("daily-count").textContent = reviewedToday
    byId("accuracy").textContent = attempts ? `${Math.round((attempts - failures) / attempts * 100)}%` : "—"
    byId("review-tab-count").textContent = due.length
}

function renderTopics() {
    const host = byId("topic-options")
    host.replaceChildren()
    for (const topic of TOPICS) {
        const label = document.createElement("label")
        label.className = "topic-chip"
        const input = document.createElement("input")
        input.type = "checkbox"
        input.name = "topicTags"
        input.value = topic
        const text = document.createElement("span")
        text.textContent = topic
        label.append(input, text)
        host.append(label)
    }
    const reason = document.querySelector('[name="reasonForSaving"]')
    reason.replaceChildren(new Option("Choose a reason", ""))
    REASONS.forEach(value => reason.add(new Option(value, value)))
}

function renderSentenceList(items = state.sentences) {
    const host = byId("sentence-list")
    host.replaceChildren()
    if (!items.length) {
        const empty = document.createElement("div")
        empty.className = "empty"
        empty.textContent = "Todavía no tienes frases guardadas. Añade una frase real de tu día."
        host.append(empty)
        return
    }
    for (const sentence of items) {
        const item = document.createElement("article")
        item.className = "sentence-item"
        const content = document.createElement("div")
        content.className = "sentence-content"
        const sentenceHeading = document.createElement("div")
        sentenceHeading.className = "sentence-item-heading"
        const sentenceText = document.createElement("p")
        sentenceText.textContent = sentence.englishText
        const playSentence = document.createElement("button")
        playSentence.type = "button"
        playSentence.className = "icon-button audio-button"
        playSentence.textContent = "🔊"
        playSentence.disabled = !window.speechSynthesis
        playSentence.title = "Escuchar frase"
        playSentence.setAttribute("aria-label", `Escuchar frase: ${sentence.englishText}`)
        playSentence.addEventListener("click", () => playAudioEnhanced(sentence.englishText, "en"))
        sentenceHeading.append(sentenceText, playSentence)
        const meta = document.createElement("div")
        meta.className = "sentence-meta"
        for (const tag of sentence.topicTags) {
            const chip = document.createElement("span")
            chip.className = "tag"
            chip.textContent = tag
            meta.append(chip)
        }
        const box = document.createElement("span")
        box.className = "box-label"
        box.textContent = boxName(sentence.reviewBox)
        meta.append(box)
        if (sentence.spanishTranslation) {
            const translation = document.createElement("span")
            translation.textContent = `· ${sentence.spanishTranslation}`
            meta.append(translation)
        }
        content.append(sentenceHeading, meta)
        item.append(content)
        const actions = document.createElement("div")
        actions.className = "item-actions"
        const edit = document.createElement("button")
        edit.type = "button"
        edit.className = "icon-button"
        edit.textContent = "✏️"
        edit.title = "Editar frase"
        edit.setAttribute("aria-label", `Editar frase: ${sentence.englishText}`)
        edit.addEventListener("click", () => beginEdit(sentence))
        const remove = document.createElement("button")
        remove.type = "button"
        remove.className = "icon-button delete"
        remove.textContent = "🗑️"
        remove.title = "Eliminar frase"
        remove.setAttribute("aria-label", `Eliminar frase: ${sentence.englishText}`)
        remove.addEventListener("click", () => deleteSentence(sentence))
        actions.append(edit, remove)
        item.append(actions)
        host.append(item)
    }
}

function renderVocabularyList() {
    const host = byId("vocabulary-list")
    host.replaceChildren()
    const items = state.vocabulary || []
    if (!items.length) {
        const empty = document.createElement("div")
        empty.className = "empty"
        empty.textContent = "Todavía no guardas vocabulario personal. Añade una palabra o expresión para empezar."
        host.append(empty)
        return
    }
    for (const vocabulary of items) {
        const item = document.createElement("article")
        item.className = "sentence-item"
        const content = document.createElement("div")
        content.className = "sentence-content"
        const word = document.createElement("p")
        word.textContent = `${vocabulary.word}${vocabulary.pronunciation ? ` ${vocabulary.pronunciation}` : ""}`
        const playWord = document.createElement("button")
        playWord.type = "button"
        playWord.className = "icon-button audio-button"
        playWord.textContent = "🔊"
        playWord.disabled = !window.speechSynthesis
        playWord.title = "Escuchar palabra"
        playWord.setAttribute("aria-label", `Escuchar ${vocabulary.word}`)
        playWord.addEventListener("click", () => playAudioEnhanced(vocabulary.word, "en"))
        const wordHeading = document.createElement("div")
        wordHeading.className = "sentence-item-heading"
        wordHeading.append(word, playWord)
        const meaning = document.createElement("div")
        meaning.className = "sentence-meta"
        meaning.textContent = vocabulary.spanish || ""
        content.append(wordHeading, meaning)
        if (vocabulary.example_en) {
            const example = document.createElement("p")
            example.className = "mt-2 text-sm"
            const exampleText = document.createElement("span")
            exampleText.textContent = `${vocabulary.example_en}${vocabulary.example_es ? ` — ${vocabulary.example_es}` : ""}`
            const playExample = document.createElement("button")
            playExample.type = "button"
            playExample.className = "icon-button audio-button ml-2"
            playExample.textContent = "🔊"
            playExample.disabled = !window.speechSynthesis
            playExample.title = "Escuchar ejemplo"
            playExample.setAttribute("aria-label", `Escuchar ejemplo: ${vocabulary.example_en}`)
            playExample.addEventListener("click", () => playAudioEnhanced(vocabulary.example_en, "en"))
            example.append(exampleText, playExample)
            content.append(example)
        }
        const actions = document.createElement("div")
        actions.className = "item-actions"
        const edit = document.createElement("button")
        edit.type = "button"
        edit.className = "icon-button"
        edit.textContent = "✏️"
        edit.title = "Editar vocabulario"
        edit.setAttribute("aria-label", `Editar ${vocabulary.word}`)
        edit.addEventListener("click", () => {
            const form = byId("vocabulary-form")
            form.elements.id.value = vocabulary.id
            form.elements.word.value = vocabulary.word || ""
            form.elements.pronunciation.value = vocabulary.pronunciation || ""
            form.elements.spanish.value = vocabulary.spanish || ""
            form.elements.exampleEn.value = vocabulary.example_en || ""
            form.elements.exampleEs.value = vocabulary.example_es || ""
            form.querySelector('[type="submit"]').textContent = "Guardar cambios"
            byId("cancel-vocabulary-edit").classList.remove("hidden")
            form.elements.word.focus()
        })
        const remove = document.createElement("button")
        remove.type = "button"
        remove.className = "icon-button delete"
        remove.textContent = "🗑️"
        remove.title = "Eliminar vocabulario"
        remove.setAttribute("aria-label", `Eliminar ${vocabulary.word}`)
        remove.addEventListener("click", () => deleteVocabulary(vocabulary))
        actions.append(edit, remove)
        item.append(content, actions)
        host.append(item)
    }
}

function renderReview() {
    const host = byId("review-card")
    const due = getDue()
    state.review = due[0] || null
    host.replaceChildren()
    if (!state.review) {
        const empty = document.createElement("div")
        empty.className = "empty"
        empty.textContent = state.sentences.length ? "No sentences due right now. Great work — come back when it's time." : "Add your first sentence to start a review habit."
        host.append(empty)
        return
    }
    const sentence = state.review
    const kicker = document.createElement("div")
    kicker.className = "exercise-kicker"
    kicker.textContent = `${sentence.topicTags.join(" · ")}  /  ${boxName(sentence.reviewBox)}  /  ${due.length} due`
    const prompt = document.createElement("div")
    prompt.className = "exercise-prompt"
    prompt.textContent = sentence.spanishTranslation || `Recall your saved sentence. Think of the situation where you heard it${sentence.topicTags[0] ? ` (${sentence.topicTags[0].toLowerCase()})` : ""}.`
    const answerArea = document.createElement("div")
    answerArea.id = "review-answer"
    const reveal = document.createElement("button")
    reveal.type = "button"
    reveal.className = "button secondary"
    reveal.textContent = "Reveal answer"
    reveal.addEventListener("click", () => {
        answerArea.replaceChildren()
        const answer = document.createElement("div")
        answer.className = "feedback"
        answer.textContent = sentence.englishText
        answerArea.append(answer)
        reveal.classList.add("hidden")
        buttons.classList.remove("hidden")
    })
    const buttons = document.createElement("div")
    buttons.className = "exercise-actions hidden"
    const remembered = document.createElement("button")
    remembered.type = "button"
    remembered.className = "button primary"
    remembered.textContent = "I remembered it"
    remembered.addEventListener("click", () => submitReview(sentence, true))
    const forgotten = document.createElement("button")
    forgotten.type = "button"
    forgotten.className = "button secondary"
    forgotten.textContent = "I forgot / made a mistake"
    forgotten.addEventListener("click", () => submitReview(sentence, false))
    buttons.append(remembered, forgotten)
    host.append(kicker, prompt, reveal, answerArea, buttons)
}

async function submitReview(sentence, remembered) {
    try {
        const stateUpdate = scheduleReview(sentence, remembered)
        const updated = await repository.updateReview(state.user.id, sentence.id, stateUpdate)
        state.sentences = state.sentences.map(item => item.id === updated.id ? updated : item)
        showNotice(remembered ? "Saved — the next review is scheduled." : "Saved — this sentence is back in Box 1.")
        renderAll()
    } catch (error) {
        console.error("Unable to save review result", error)
        showNotice(storageErrorMessage(error, "No se pudo guardar el repaso."), true)
    }
}

function renderAll() {
    updateStats()
    renderSentenceList(filteredSentences())
    renderReview()
}

function filteredSentences() {
    const query = byId("search-input").value.trim().toLowerCase()
    return state.sentences.filter(sentence => `${sentence.englishText} ${sentence.spanishTranslation} ${sentence.topicTags.join(" ")}`.toLowerCase().includes(query))
}

function beginEdit(sentence) {
    const form = byId("sentence-form")
    form.elements.id.value = sentence.id
    form.elements.englishText.value = sentence.englishText
    form.elements.spanishTranslation.value = sentence.spanishTranslation
    form.elements.reasonForSaving.value = sentence.reasonForSaving
    form.elements.grammarPattern.value = sentence.grammarPattern
    form.querySelectorAll('[name="topicTags"]').forEach(input => { input.checked = sentence.topicTags.includes(input.value) })
    byId("form-title").textContent = "Edit your sentence"
    form.querySelector('[type="submit"]').textContent = "Save changes"
    byId("cancel-edit").classList.remove("hidden")
    switchScreen("add")
    form.elements.englishText.focus()
}

function resetForm() {
    byId("sentence-form").reset()
    byId("sentence-form").elements.id.value = ""
    byId("form-title").textContent = "Una frase que quieres recordar"
    byId("sentence-form").querySelector('[type="submit"]').textContent = "Guardar frase"
    byId("cancel-edit").classList.add("hidden")
}

function resetVocabularyForm() {
    const form = byId("vocabulary-form")
    form.reset()
    form.elements.id.value = ""
    form.querySelector('[type="submit"]').textContent = "Guardar vocabulario"
    byId("cancel-vocabulary-edit").classList.add("hidden")
}

async function loadVocabulary() {
    if (state.vocabulary !== null) {
        renderVocabularyList()
        return
    }
    const host = byId("vocabulary-list")
    host.textContent = "Cargando tu vocabulario..."
    try {
        state.vocabulary = await repository.listVocabulary(state.user.id)
        renderVocabularyList()
    } catch (error) {
        console.error("Unable to load personal vocabulary", error)
        host.textContent = storageErrorMessage(error, "No se pudo cargar tu vocabulario.")
        showNotice(storageErrorMessage(error, "No se pudo cargar tu vocabulario."), true)
    }
}

async function deleteVocabulary(vocabulary) {
    if (!window.confirm(`¿Eliminar "${vocabulary.word}" de tu vocabulario?`)) return
    try {
        await repository.removeVocabulary(state.user.id, vocabulary.id)
        state.vocabulary = state.vocabulary.filter(item => item.id !== vocabulary.id)
        renderVocabularyList()
        showNotice("Vocabulario eliminado.")
        window.dispatchEvent(new CustomEvent("personal-vocabulary-changed"))
    } catch (error) {
        console.error("Unable to delete personal vocabulary", error)
        showNotice(storageErrorMessage(error, "No se pudo eliminar el vocabulario."), true)
    }
}

async function deleteSentence(sentence) {
    if (!window.confirm(`Delete “${sentence.englishText}”?`)) return
    try {
        await repository.remove(state.user.id, sentence.id)
        state.sentences = state.sentences.filter(item => item.id !== sentence.id)
        showNotice("Sentence deleted.")
        renderAll()
        window.dispatchEvent(new CustomEvent("personal-sentences-changed"))
    } catch (error) {
        console.error("Unable to delete sentence", error)
        showNotice(storageErrorMessage(error, "No se pudo eliminar la frase."), true)
    }
}

async function loadData() {
    try {
        state.sentences = await repository.list(state.user.id)
        byId("auth-panel").classList.add("hidden")
        byId("app-panel").classList.remove("hidden")
        renderAll()
    } catch (error) {
        console.error("Unable to load MySentences data", error)
        byId("auth-panel").classList.add("hidden")
        byId("app-panel").classList.remove("hidden")
        showNotice(storageErrorMessage(error, "No se pudieron cargar las frases. Revisa que tu sesión y permisos de Supabase sean válidos."), true)
    }
}

function switchScreen(name) {
    document.querySelectorAll(".tab").forEach(tab => tab.classList.toggle("active", tab.dataset.screen === name))
    document.querySelectorAll(".screen").forEach(screen => screen.classList.toggle("active", screen.id === `${name}-screen`))
    if (name === "review") renderReview()
    if (name === "vocabulary") loadVocabulary()
}

function setupEvents() {
    renderTopics()
    document.querySelectorAll(".tab").forEach(tab => tab.addEventListener("click", () => switchScreen(tab.dataset.screen)))
    byId("cancel-edit").addEventListener("click", resetForm)
    byId("search-input").addEventListener("input", () => renderSentenceList(filteredSentences()))
    byId("sentence-form").addEventListener("submit", async event => {
        event.preventDefault()
        const form = event.currentTarget
        const sentenceText = form.elements.englishText.value
        const validation = validateSentence(sentenceText)
        const topicTags = [...form.querySelectorAll('[name="topicTags"]:checked')].map(input => input.value)
        if (!validation.valid) return showNotice(validation.message, true)
        if (!topicTags.length) return showNotice("Selecciona al menos un tema (por ejemplo, Trabajo, Entrevista o Vida diaria).", true)
        const sentence = {
            englishText: sentenceText,
            spanishTranslation: form.elements.spanishTranslation.value,
            topicTags,
            reasonForSaving: form.elements.reasonForSaving.value,
            grammarPattern: form.elements.grammarPattern.value || suggestGrammarPattern(sentenceText)
        }
        if (!sentence.reasonForSaving) return showNotice("Choose a reason for saving this sentence.", true)
        try {
            const saved = await repository.save(state.user.id, sentence, form.elements.id.value || null)
            if (form.elements.id.value) state.sentences = state.sentences.map(item => item.id === saved.id ? saved : item)
            else state.sentences.unshift(saved)
            resetForm()
            showNotice("Sentence saved.")
            renderAll()
            window.dispatchEvent(new CustomEvent("personal-sentences-changed"))
        } catch (error) {
            console.error("Unable to save sentence", error)
            showNotice(storageErrorMessage(error, "No se pudo guardar la frase."), true)
        }
    })
    byId("vocabulary-form").addEventListener("submit", async event => {
        event.preventDefault()
        const form = event.currentTarget
        const vocabulary = {
            word: form.elements.word.value,
            pronunciation: form.elements.pronunciation.value,
            spanish: form.elements.spanish.value,
            exampleEn: form.elements.exampleEn.value,
            exampleEs: form.elements.exampleEs.value
        }
        if (!vocabulary.word.trim() || !vocabulary.spanish.trim()) {
            return showNotice("Escribe la palabra y su significado antes de guardar.", true)
        }
        try {
            const grammarCategory = store.categoriesData.find(category => category.id === "grammar")
            const saved = await repository.saveVocabulary(
                state.user.id,
                vocabulary,
                form.elements.id.value || null,
                grammarCategory?.title || "Mis Expresiones"
            )
            if (!state.vocabulary) state.vocabulary = []
            if (form.elements.id.value) {
                state.vocabulary = state.vocabulary.map(item => item.id === saved.id ? saved : item)
            } else {
                state.vocabulary.unshift(saved)
            }
            resetVocabularyForm()
            renderVocabularyList()
            showNotice("Vocabulario guardado.")
            window.dispatchEvent(new CustomEvent("personal-vocabulary-changed"))
        } catch (error) {
            console.error("Unable to save personal vocabulary", error)
            showNotice(storageErrorMessage(error, "No se pudo guardar el vocabulario."), true)
        }
    })
    byId("cancel-vocabulary-edit").addEventListener("click", resetVocabularyForm)
    byId("sentence-form").elements.englishText.addEventListener("blur", event => {
        const pattern = byId("sentence-form").elements.grammarPattern
        if (!pattern.value) pattern.value = suggestGrammarPattern(event.target.value)
    })
    byId("translate-button").addEventListener("click", async event => {
        const button = event.currentTarget
        const status = byId("translation-status")
        const sentence = byId("sentence-form").elements.englishText.value.trim()
        if (!sentence) {
            status.textContent = "Escribe primero la frase en inglés."
            return
        }

        button.disabled = true
        button.textContent = "Preparando…"
        status.textContent = "La IA está corrigiendo la frase y preparando una traducción natural."
        try {
            const { recommendEnglishSentence } = await import("../ai-translation.js")
            const recommendation = await recommendEnglishSentence(sentence)
            byId("recommendation-english").textContent = recommendation.english
            byId("recommendation-spanish").textContent = recommendation.spanish
            byId("recommendation-panel").classList.remove("hidden")
            status.textContent = "Revisa la sugerencia y elige si quieres usarla."
        } catch (error) {
            console.error("Unable to translate sentence", error)
            status.textContent = error.message
        } finally {
            button.disabled = false
            button.textContent = "Mejorar + traducir con IA"
        }
    })
    byId("apply-recommendation").addEventListener("click", () => {
        const form = byId("sentence-form")
        const english = byId("recommendation-english").textContent
        const spanish = byId("recommendation-spanish").textContent
        form.elements.englishText.value = english
        form.elements.spanishTranslation.value = spanish
        const pattern = suggestGrammarPattern(english)
        if (pattern) form.elements.grammarPattern.value = pattern
        byId("recommendation-panel").classList.add("hidden")
        byId("translation-status").textContent = "Frase recomendada y traducción aplicadas. Puedes editarlas antes de guardar."
    })
    byId("auth-form").addEventListener("submit", async event => {
        event.preventDefault()
        const data = new FormData(event.currentTarget)
        const { error } = await supabase.auth.signInWithPassword({ email: data.get("email"), password: data.get("password") })
        if (error) showNotice(error.message, true)
        else location.reload()
    })
    byId("signup-button").addEventListener("click", async () => {
        const form = byId("auth-form")
        const email = form.elements.email.value
        const password = form.elements.password.value
        if (!email || password.length < 6) return showNotice("Enter an email and a password with at least 6 characters.", true)
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) showNotice(error.message, true)
        else showNotice("Account created. Check your email if confirmation is required.")
    })
}

let initialized = false

export async function initializeSentencesApp() {
    if (initialized) return
    initialized = true
    setupEvents()
    const { data, error } = await supabase.auth.getUser()
    if (error && error.name !== "AuthSessionMissingError") console.warn("Unable to read current auth session", error)
    state.user = data?.user || null
    if (state.user) await loadData()
    else {
        byId("auth-panel").classList.remove("hidden")
        byId("app-panel").classList.add("hidden")
    }
}
