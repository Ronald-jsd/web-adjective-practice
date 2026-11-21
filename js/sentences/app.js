import { store } from "../config.js"
import { supabase } from "../app.js"
import { playAudioEnhanced } from "../audio.js"
import { REASONS, TOPICS, suggestGrammarPattern, validateSentence } from "./model.js"
import { isDue, scheduleReview, sortReviewQueue, previewReview, reviewStateLabel } from "./scheduler.js"
import { loadReviewSettings, saveReviewSettings, normalizeReviewSettings, normalizeLearningSteps, formatReviewSettings, DEFAULT_REVIEW_SETTINGS } from "./review-settings.js"
import { createSentenceRepository } from "./repository.js"
import { resolveSessionUser } from "../offline/session.js"
import { createNotesView } from "./notes.js"
import { filterVocabulary } from "./vocabulary-search.js"
import { renderGroupWordButton } from "../word-groups/modal.js"
import { showLoading, hideLoading } from "../ui-status.js"
import { isAuthError, loginRequiredMessage, requireSession } from "../auth-required.js"
import { buildReadingQuestion, checkReadingAnswer, readingAnswerText, readingSourceCount } from "../reading/exercises.js"
import { buildDictation, checkDictation, dictationSourceCount } from "../practice/dictation.js"

const repository = createSentenceRepository(supabase)
const state = { user: null, sentences: [], vocabulary: null, review: null, reviewLogs: [], reviewCards: [], settings: loadReviewSettings() }
const readingState = { index: 0, question: null, answered: false, correct: false, seed: Date.now() % 1000 }
const dictationState = { index: 0, question: null, answered: false }
const byId = id => document.getElementById(id)
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char])
const VOCABULARY_AI_HINT = "Escribe la palabra en español y la IA completará el inglés, la pronunciación, el significado y los ejemplos. Puedes elegir si también completa las notas."

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

function enabledCardDirections() {
    return state.settings.cardDirection === "both" ? ["forward", "reverse"] : [state.settings.cardDirection]
}

function todayReviewLogs() {
    const today = new Date().toDateString()
    const directions = enabledCardDirections()
    return state.reviewLogs.filter(log => new Date(log.reviewedAt).toDateString() === today && directions.includes(log.direction || "forward"))
}

function todayReviewedCardIds(type) {
    return new Set(todayReviewLogs()
        .filter(log => type === "new" ? log.previousState === "new" : log.previousState !== "new")
        .map(log => log.cardId || log.sentenceId))
}

function getDue() {
    const now = new Date()
    const enabled = enabledCardDirections()
    state.dailyLimitReached = false
    const due = state.reviewCards
        .filter(card => enabled.includes(card.direction) && isDue(card, now))
        .sort(sortReviewQueue)
    state.allDue = due.length
    let newUsed = todayReviewedCardIds("new").size
    let reviewUsed = todayReviewedCardIds("review").size
    const allowed = []
    for (const card of due) {
        if (card.memoryState === "new") {
            if (newUsed >= state.settings.newCardLimit) continue
            newUsed += 1
        } else if (reviewUsed >= state.settings.reviewLimit) {
            continue
        } else {
            reviewUsed += 1
        }
        allowed.push(card)
    }
    state.dailyLimitReached = allowed.length < due.length
    return allowed
}

function getCompletionSummary() {
    const logs = todayReviewLogs()
    const correct = logs.filter(log => log.grade !== "again").length
    const attempts = logs.length
    return { attempts, correct, accuracy: attempts ? Math.round(correct / attempts * 100) : 0 }
}

function updateStats() {
    const due = getDue()
    const summary = getCompletionSummary()
    byId("due-count").textContent = due.length
    byId("daily-count").textContent = summary.attempts
    byId("accuracy").textContent = summary.attempts ? `${summary.accuracy}%` : "—"
    const details = byId("review-details")
    if (details) {
        const learning = due.filter(item => item.memoryState === "learning" || item.memoryState === "relearning").length
        const newCards = due.filter(item => item.memoryState === "new").length
        details.textContent = due.length
            ? `${newCards} nuevas · ${due.length - newCards - learning} en repaso · ${learning} en aprendizaje/reaprendizaje${state.dailyLimitReached ? ` · límite diario alcanzado en ${state.allDue} pendientes` : ''}`
            : state.dailyLimitReached
                ? `Límite diario alcanzado · ${state.allDue} pendientes esperando mañana.`
                : "Nada pendiente. Tu cola está al día."
    }
    byId("review-tab-count").textContent = due.length
}

function renderReviewSettings() {
    const form = byId("review-settings-form")
    if (!form) return
    form.elements.newCardLimit.value = String(state.settings.newCardLimit)
    form.elements.reviewLimit.value = String(state.settings.reviewLimit)
    form.elements.learningSteps.value = state.settings.learningSteps
    form.elements.cardDirection.value = state.settings.cardDirection
    form.elements.autoplayAudio.value = String(state.settings.autoplayAudio)
    byId("review-settings-status").textContent = `Ajustes actuales: ${formatReviewSettings(state.settings)}`
    byId("review-settings-status").classList.remove("error")
}

function applyReviewSettings(settings, message = "Ajustes guardados.") {
    state.settings = normalizeReviewSettings(settings)
    renderReviewSettings()
    updateStats()
    renderReview()
    const status = byId("review-settings-status")
    if (status) {
        status.textContent = message
        status.classList.remove("error")
    }
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
        const practiceSpeaking = document.createElement("button")
        practiceSpeaking.type = "button"
        practiceSpeaking.className = "icon-button audio-button"
        practiceSpeaking.textContent = "🎤"
        practiceSpeaking.title = "Practicar pronunciación"
        practiceSpeaking.setAttribute("aria-label", `Practicar pronunciación: ${sentence.englishText}`)
        practiceSpeaking.addEventListener("click", () => {
            if (typeof window.startShadowingSentence !== "function") {
                showNotice("La práctica de pronunciación estará lista en un momento.")
                return
            }
            window.startShadowingSentence(sentence)
        })
        sentenceHeading.append(sentenceText, playSentence, practiceSpeaking)
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
        box.textContent = `${reviewStateLabel(sentence)}${sentence.intervalDays ? ` · ${Math.max(1, Math.round(sentence.intervalDays))}d` : ''}`
        meta.append(box)
        if (sentence.spanishTranslation) {
            const translation = document.createElement("span")
            translation.textContent = `· ${sentence.spanishTranslation}`
            meta.append(translation)
        }
        content.append(sentenceHeading, meta)
        if (sentence.grammarPattern || sentence.grammarPatternTranslation) {
            const pattern = document.createElement("p")
            pattern.className = "sentence-pattern"
            pattern.textContent = [
                sentence.grammarPattern ? `Patrón: ${sentence.grammarPattern}` : "",
                sentence.grammarPatternTranslation ? `→ ${sentence.grammarPatternTranslation}` : ""
            ].filter(Boolean).join(" ")
            content.append(pattern)
        }
        if (sentence.notes) {
            const notesWrap = document.createElement("div")
            notesWrap.className = "sentence-notes"
            const notesLabel = document.createElement("div")
            notesLabel.className = "sentence-notes-label"
            notesLabel.textContent = "Notas"
            const notes = createNotesView(sentence.notes)
            if (notes) {
                notesWrap.append(notesLabel, notes)
                content.append(notesWrap)
            }
        }
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
    const allItems = state.vocabulary || []
    const query = byId("vocabulary-search-input").value.trim()
    const items = filteredVocabulary()
    if (!items.length) {
        const empty = document.createElement("div")
        empty.className = "empty"
        empty.textContent = allItems.length
            ? `No hay vocabulario que coincida con «${query}».`
            : "Todavía no guardas vocabulario personal. Añade una palabra o expresión para empezar."
        host.append(empty)
        return
    }
    for (const vocabulary of items) {
        const item = document.createElement("article")
        item.className = "sentence-item vocab-item"
        const content = document.createElement("div")
        content.className = "sentence-content"

        const head = document.createElement("div")
        head.className = "vocab-entry-head"
        const title = document.createElement("div")
        title.className = "vocab-title"
        const groupPayload = {
            source: "custom",
            itemId: vocabulary.id ? String(vocabulary.id) : null,
            word: vocabulary.word || "",
            pronunciation: vocabulary.pronunciation || "",
            spanish: vocabulary.spanish || "",
            partOfSpeech: "Otro",
            position: "En cualquier posición",
            uses: "",
            difference: vocabulary.notes || "",
            examples: vocabulary.example_en ? [{ id: `example-custom-${vocabulary.id}-0`, en: vocabulary.example_en || "", es: vocabulary.example_es || "" }] : [],
            context: [vocabulary.category || "", vocabulary.subcategory || ""].filter(Boolean).join(" · ")
        }
        title.innerHTML = renderGroupWordButton(vocabulary.word || "", groupPayload, "vocab-word-trigger")
        if (vocabulary.pronunciation) {
            const pronunciation = document.createElement("span")
            pronunciation.className = "vocab-pronunciation"
            pronunciation.textContent = vocabulary.pronunciation
            title.append(pronunciation)
        }
        head.append(title)
        content.append(head)

        if (vocabulary.spanish) {
            const meaning = document.createElement("p")
            meaning.className = "vocab-meaning"
            meaning.textContent = vocabulary.spanish
            content.append(meaning)
        }

        if (vocabulary.example_en) {
            const example = document.createElement("div")
            example.className = "vocab-example"
            const exampleBody = document.createElement("div")
            exampleBody.className = "vocab-example-body"
            const exampleEn = document.createElement("p")
            exampleEn.className = "vocab-example-en"
            exampleEn.textContent = vocabulary.example_en
            exampleBody.append(exampleEn)
            if (vocabulary.example_es) {
                const exampleEs = document.createElement("p")
                exampleEs.className = "vocab-example-es"
                exampleEs.textContent = vocabulary.example_es
                exampleBody.append(exampleEs)
            }
            const playExample = document.createElement("button")
            playExample.type = "button"
            playExample.className = "icon-button audio-button"
            playExample.textContent = "🔊"
            playExample.disabled = !window.speechSynthesis
            playExample.title = "Escuchar ejemplo"
            playExample.setAttribute("aria-label", `Escuchar ejemplo: ${vocabulary.example_en}`)
            playExample.addEventListener("click", () => playAudioEnhanced(vocabulary.example_en, "en"))
            example.append(exampleBody, playExample)
            content.append(example)
        }

        if (vocabulary.notes) {
            const notesWrap = document.createElement("div")
            notesWrap.className = "vocab-notes-wrap"
            const notesLabel = document.createElement("div")
            notesLabel.className = "vocab-notes-label"
            notesLabel.textContent = "Usos y notas"
            const notes = createNotesView(vocabulary.notes)
            if (notes) {
                notesWrap.append(notesLabel, notes)
                content.append(notesWrap)
            }
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
            form.elements.notes.value = vocabulary.notes || ""
            form.querySelector('[type="submit"]').textContent = "Guardar cambios"
            byId("cancel-vocabulary-edit").classList.remove("hidden")
            byId("vocabulary-ai-status").textContent = VOCABULARY_AI_HINT
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
    const summary = getCompletionSummary()

    if (!state.review) {
        const empty = document.createElement("div")
        empty.className = "empty"
        empty.textContent = state.sentences.length
            ? `¡Cola limpia! Hoy repasaste ${summary.attempts} ${summary.attempts === 1 ? "vez" : "veces"}${summary.attempts ? ` · ${summary.accuracy}% de aciertos` : ""}.`
            : "Add your first sentence to start a review habit."
        host.append(empty)
        return
    }
    const sentence = state.review
    const directionLabel = sentence.direction === "reverse" ? "Inglés → Español" : "Español → Inglés"
    const stateLabel = reviewStateLabel(sentence)
    const previews = previewReview(sentence, new Date(), { learningSteps: normalizeLearningSteps(state.settings.learningSteps) })
    const kicker = document.createElement("div")
    kicker.className = "exercise-kicker"
    kicker.textContent = `${sentence.topicTags.join(" · ")}  /  ${stateLabel}  /  ${directionLabel}  /  ${due.length} due`
    const prompt = document.createElement("div")
    prompt.className = "exercise-prompt"
    prompt.setAttribute("lang", sentence.direction === "reverse" ? "en" : "es")
    prompt.textContent = sentence.direction === "reverse"
        ? sentence.englishText
        : (sentence.spanishTranslation || `Recall your saved sentence. Think of the situation where you heard it${sentence.topicTags[0] ? ` (${sentence.topicTags[0].toLowerCase()})` : ""}.`)
    const answerArea = document.createElement("div")
    answerArea.id = "review-answer"
    const reveal = document.createElement("button")
    reveal.type = "button"
    reveal.className = "button secondary"
    reveal.textContent = "Reveal answer"
    reveal.addEventListener("click", () => {
        answerArea.replaceChildren()
        const answerRow = document.createElement("div")
        answerRow.className = "review-answer-row"
        const answer = document.createElement("div")
        answer.className = "feedback"
        answer.textContent = sentence.direction === "reverse" ? sentence.spanishTranslation : sentence.englishText
        const playAnswer = document.createElement("button")
        playAnswer.type = "button"
        playAnswer.className = "icon-button audio-button review-audio-button"
        playAnswer.textContent = "🔊"
        playAnswer.disabled = !window.speechSynthesis
        playAnswer.title = "Escuchar frase en inglés"
        playAnswer.setAttribute("aria-label", `Escuchar frase en inglés: ${sentence.englishText}`)
        playAnswer.addEventListener("click", () => playAudioEnhanced(sentence.englishText, "en"))
        answerRow.append(answer, playAnswer)
        answerArea.append(answerRow)
        reveal.classList.add("hidden")
        buttons.classList.remove("hidden")
        if (state.settings.autoplayAudio) {
            playAudioEnhanced(sentence.englishText, "en")
        }
    })
    const buttons = document.createElement("div")
    buttons.className = "exercise-actions review-rating-actions hidden"
    const ratings = [
        ["again", "Otra vez", "button secondary review-rating-button"],
        ["hard", "Difícil", "button secondary review-rating-button"],
        ["good", "Bien", "button primary review-rating-button"],
        ["easy", "Fácil", "button secondary review-rating-button"]
    ]
    for (const [grade, label, className] of ratings) {
        const button = document.createElement("button")
        button.type = "button"
        button.className = className
        button.innerHTML = `<span>${label}</span><small>${previews[grade]}</small>`
        button.setAttribute("aria-label", `${label}. Próximo repaso en ${previews[grade]}`)
        button.addEventListener("click", () => submitReview(sentence, grade))
        buttons.append(button)
    }
    host.append(kicker, prompt, reveal, answerArea, buttons)
}

/* Lectura y comprensión: las preguntas salen únicamente de las frases que el
 * usuario guardó. Si una frase no sirve para completar huecos, se salta sin
 * inventar nada. */
function nextReadingQuestion() {
    const total = readingSourceCount(state.sentences)
    for (let step = 0; step < total; step += 1) {
        const index = (readingState.index + step) % total
        const question = buildReadingQuestion(state.sentences, index, readingState.seed)
        if (question) {
            readingState.index = index
            return question
        }
    }
    return null
}

function renderReading() {
    const host = byId("reading-card")
    if (!host) return
    host.replaceChildren()
    const total = readingSourceCount(state.sentences)
    if (total < 3) {
        const empty = document.createElement("div")
        empty.className = "empty"
        empty.textContent = `Guarda al menos 3 frases con traducción en «＋ Frases» para tener ejercicios de lectura. Ahora mismo hay ${total} disponibles.`
        host.append(empty)
        return
    }
    const question = nextReadingQuestion()
    if (!question) {
        const empty = document.createElement("div")
        empty.className = "empty"
        empty.textContent = "Tus frases todavía no permiten crear preguntas. Añade frases más largas."
        host.append(empty)
        return
    }
    readingState.question = question
    const kicker = document.createElement("div")
    kicker.className = "exercise-kicker reading-kicker"
    kicker.textContent = `${question.type === "meaning" ? "COMPRENSIÓN" : "LECTURA"} · ${readingState.index + 1}/${total} · solo tus frases`
    const sentenceRow = document.createElement("div")
    sentenceRow.className = "reading-sentence-row"
    const sentence = document.createElement("div")
    sentence.className = "exercise-prompt reading-sentence"
    sentence.lang = "en"
    sentence.textContent = question.type === "cloze" ? question.prompt : question.sentence
    const play = document.createElement("button")
    play.type = "button"
    play.className = "icon-button audio-button"
    play.textContent = "🔊"
    play.title = "Escuchar frase"
    play.setAttribute("aria-label", `Escuchar frase: ${question.sentence}`)
    play.disabled = !window.speechSynthesis
    play.addEventListener("click", () => playAudioEnhanced(question.sentence, "en"))
    sentenceRow.append(sentence, play)
    const prompt = document.createElement("p")
    prompt.className = "reading-prompt"
    prompt.textContent = question.prompt
    const answerArea = document.createElement("div")
    answerArea.className = "reading-answer-area"
    const feedback = document.createElement("div")
    feedback.className = "reading-feedback hidden"
    feedback.setAttribute("role", "status")
    const next = document.createElement("button")
    next.type = "button"
    next.className = "button primary reading-next hidden"
    next.textContent = "Siguiente →"
    next.addEventListener("click", () => {
        readingState.index += 1
        readingState.answered = false
        readingState.correct = false
        renderReading()
    })

    const showResult = correct => {
        readingState.answered = true
        readingState.correct = correct
        feedback.classList.remove("hidden")
        feedback.classList.toggle("correct", correct)
        feedback.classList.toggle("incorrect", !correct)
        feedback.textContent = correct
            ? `✅ Correcto. ${question.type === "meaning" ? question.sentence : question.answer} — ${question.translation || readingAnswerText(question)}`
            : `❌ No era eso. Respuesta: ${readingAnswerText(question)}. ${question.sentence}${question.translation ? ` — ${question.translation}` : ""}`
        next.classList.remove("hidden")
    }

    if (question.type === "meaning") {
        for (const option of question.options) {
            const button = document.createElement("button")
            button.type = "button"
            button.className = "button secondary reading-option"
            button.textContent = option.text
            button.dataset.optionId = option.id
            button.addEventListener("click", () => {
                if (readingState.answered) return
                showResult(checkReadingAnswer(question, option.id))
                answerArea.querySelectorAll("[data-option-id]").forEach(node => node.disabled = true)
            })
            answerArea.append(button)
        }
    } else {
        const form = document.createElement("form")
        form.className = "reading-cloze-form"
        const input = document.createElement("input")
        input.type = "text"
        input.name = "answer"
        input.autocomplete = "off"
        input.autocorrect = "off"
        input.spellcheck = false
        input.placeholder = "Escribe la palabra que falta…"
        input.setAttribute("aria-label", "Palabra que falta")
        const check = document.createElement("button")
        check.type = "submit"
        check.className = "button primary"
        check.textContent = "Comprobar"
        form.append(input, check)
        form.addEventListener("submit", event => {
            event.preventDefault()
            if (readingState.answered) return
            showResult(checkReadingAnswer(question, input.value))
            check.disabled = true
            input.disabled = true
        })
        answerArea.append(form)
        input.focus()
    }
    host.append(kicker, sentenceRow, prompt, answerArea, feedback, next)
}

/* Dictado: se reproduce la frase guardada con la voz del sistema y se compara
 * lo que escribe el usuario. No se genera texto ni se corrige gramática aparte
 * de la coincidencia de palabras. */
function renderDictation() {
    const host = byId("dictation-card")
    if (!host) return
    host.replaceChildren()
    const total = dictationSourceCount(state.sentences)
    if (!total) {
        const empty = document.createElement("div")
        empty.className = "empty"
        empty.textContent = "Guarda al menos una frase en «＋ Frases» para practicar dictado."
        host.append(empty)
        return
    }
    const question = buildDictation(state.sentences, dictationState.index)
    dictationState.question = question
    dictationState.answered = false
    const kicker = document.createElement("div")
    kicker.className = "exercise-kicker dictation-kicker"
    kicker.textContent = `DICTADO · ${dictationState.index + 1}/${total} · ${question.wordCount} palabras`
    const listenRow = document.createElement("div")
    listenRow.className = "dictation-listen-row"
    const listen = document.createElement("button")
    listen.type = "button"
    listen.className = "button primary dictation-listen"
    listen.textContent = "🔊 Escuchar frase"
    listen.disabled = !window.speechSynthesis
    listen.addEventListener("click", () => playAudioEnhanced(question.sentence, "en"))
    const hint = document.createElement("span")
    hint.className = "dictation-hint"
    hint.textContent = "Escucha cuantas veces quieras."
    listenRow.append(listen, hint)

    const form = document.createElement("form")
    form.className = "dictation-form"
    const textarea = document.createElement("textarea")
    textarea.rows = 3
    textarea.placeholder = "Escribe aquí lo que escuchaste…"
    textarea.autocomplete = "off"
    textarea.autocorrect = "off"
    textarea.spellcheck = false
    textarea.setAttribute("aria-label", "Escribe la frase que escuchaste")
    const check = document.createElement("button")
    check.type = "submit"
    check.className = "button secondary"
    check.textContent = "Comprobar"
    form.append(textarea, check)

    const feedback = document.createElement("div")
    feedback.className = "dictation-feedback hidden"
    feedback.setAttribute("role", "status")
    const next = document.createElement("button")
    next.type = "button"
    next.className = "button primary dictation-next hidden"
    next.textContent = "Siguiente →"
    next.addEventListener("click", () => {
        dictationState.index += 1
        renderDictation()
    })

    form.addEventListener("submit", event => {
        event.preventDefault()
        if (dictationState.answered) return
        const result = checkDictation(question.sentence, textarea.value)
        dictationState.answered = true
        check.disabled = true
        textarea.disabled = true
        feedback.classList.remove("hidden")
        feedback.classList.toggle("correct", result.correct)
        feedback.classList.toggle("incorrect", !result.correct)
        const words = result.comparison.result
            .map(item => `<span class="dictation-word ${item.status}">${item.text}</span>`)
            .join(" ")
        feedback.innerHTML = `<strong>${result.correct ? "✅ Correcto." : `📝 ${result.score}% de coincidencia.`}</strong><p>Frase: ${escapeHtml(question.sentence)}</p>${question.translation ? `<p>${escapeHtml(question.translation)}</p>` : ""}<div class="dictation-words">${words}</div><small>Verde = acertada · ámbar = parecida · rojo = no escrita.</small>`
        next.classList.remove("hidden")
    })
    host.append(kicker, listenRow, form, feedback, next)
}

async function submitReview(sentence, grade) {
    if (!requireSession("guardar el repaso")) return
    try {
        const stateUpdate = scheduleReview(sentence, grade, new Date(), { learningSteps: normalizeLearningSteps(state.settings.learningSteps) })
        const updated = await repository.updateReviewCard(state.user.id, sentence.id, stateUpdate)
        await repository.appendReviewLog(state.user.id, sentence, grade, updated)
        state.reviewCards = state.reviewCards.map(item => item.id === updated.id ? updated : item)
        const nextState = updated.memoryState === "relearning" ? "registro para reaprender" : "repaso programado"
        showNotice(`Guardado — ${nextState}.`)
        state.reviewLogs.unshift({
            id: `local-${Date.now()}`,
            sentenceId: sentence.id,
            grade,
            reviewedAt: updated.lastReviewedAt,
            previousState: sentence.memoryState,
            nextState: updated.memoryState,
            nextIntervalDays: updated.intervalDays,
            totalAttempts: updated.totalAttempts,
            totalFailures: updated.totalFailures
        })
        renderAll()
    } catch (error) {
        console.error("Unable to save review result", error)
        if (isAuthError(error)) showNotice(loginRequiredMessage("guardar el repaso"))
        else showNotice(storageErrorMessage(error, "No se pudo guardar el repaso."), true)
    }
}

function renderAll() {
    updateStats()
    renderSentenceList(filteredSentences())
    renderReview()
    renderReading()
    renderDictation()
}

function filteredSentences() {
    const query = byId("search-input").value.trim().toLowerCase()
    return state.sentences.filter(sentence => `${sentence.englishText} ${sentence.spanishTranslation} ${sentence.grammarPattern} ${sentence.grammarPatternTranslation} ${sentence.notes} ${sentence.topicTags.join(" ")}`.toLowerCase().includes(query))
}

function filteredVocabulary() {
    return filterVocabulary(state.vocabulary || [], byId("vocabulary-search-input").value)
}

function beginEdit(sentence) {
    const form = byId("sentence-form")
    form.elements.id.value = sentence.id
    form.elements.englishText.value = sentence.englishText
    form.elements.spanishTranslation.value = sentence.spanishTranslation
    form.elements.reasonForSaving.value = sentence.reasonForSaving
    form.elements.grammarPattern.value = sentence.grammarPattern
    form.elements.grammarPatternTranslation.value = sentence.grammarPatternTranslation || ""
    form.elements.notes.value = sentence.notes || ""
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
    byId("vocabulary-ai-status").textContent = VOCABULARY_AI_HINT
}

async function loadVocabulary() {
    if (!requireSession("cargar tu vocabulario")) return
    if (state.vocabulary !== null) {
        renderVocabularyList()
        return
    }
    const host = byId("vocabulary-list")
    showLoading(host, "Cargando tu vocabulario…")
    try {
        state.vocabulary = await repository.listVocabulary(state.user.id)
        renderVocabularyList()
    } catch (error) {
        console.error("Unable to load personal vocabulary", error)
        if (isAuthError(error)) host.textContent = loginRequiredMessage("cargar tu vocabulario")
        else host.textContent = storageErrorMessage(error, "No se pudo cargar tu vocabulario.")
        showNotice(isAuthError(error) ? loginRequiredMessage("cargar tu vocabulario") : storageErrorMessage(error, "No se pudo cargar tu vocabulario."))
    }
}

async function deleteVocabulary(vocabulary) {
    if (!requireSession("eliminar el vocabulario")) return
    if (!window.confirm(`¿Eliminar "${vocabulary.word}" de tu vocabulario?`)) return
    try {
        await repository.removeVocabulary(state.user.id, vocabulary.id)
        state.vocabulary = state.vocabulary.filter(item => item.id !== vocabulary.id)
        renderVocabularyList()
        showNotice("Vocabulario eliminado.")
        window.dispatchEvent(new CustomEvent("personal-vocabulary-changed"))
    } catch (error) {
        console.error("Unable to delete personal vocabulary", error)
        if (isAuthError(error)) showNotice(loginRequiredMessage("eliminar el vocabulario"))
        else showNotice(storageErrorMessage(error, "No se pudo eliminar el vocabulario."), true)
    }
}

async function deleteSentence(sentence) {
    if (!requireSession("eliminar la frase")) return
    if (!window.confirm(`Delete “${sentence.englishText}”?`)) return
    try {
        await repository.remove(state.user.id, sentence.id)
        state.sentences = state.sentences.filter(item => item.id !== sentence.id)
        state.reviewCards = state.reviewCards.filter(item => item.sentenceId !== sentence.id)
        state.reviewLogs = state.reviewLogs.filter(item => item.sentenceId !== sentence.id)
        showNotice("Sentence deleted.")
        renderAll()
        window.dispatchEvent(new CustomEvent("personal-sentences-changed"))
    } catch (error) {
        console.error("Unable to delete sentence", error)
        if (isAuthError(error)) showNotice(loginRequiredMessage("eliminar la frase"))
        else showNotice(storageErrorMessage(error, "No se pudo eliminar la frase."), true)
    }
}

async function loadData() {
    if (!requireSession("cargar tus frases")) return
    showLoading("sentences-loading-indicator", "Cargando tus frases…")
    try {
        const sentences = await repository.list(state.user.id)
        const [logs, cards] = await Promise.all([
            repository.listReviewLogs(state.user.id).catch(error => {
                console.warn("[sentences] No se pudo cargar el historial de repasos:", error)
                return []
            }),
            repository.listReviewCards(state.user.id, sentences)
        ])
        state.sentences = sentences
        state.reviewLogs = logs
        state.reviewCards = cards
        byId("auth-panel").classList.add("hidden")
        byId("app-panel").classList.remove("hidden")
        renderAll()
    } catch (error) {
        console.error("Unable to load MySentences data", error)
        byId("auth-panel").classList.add("hidden")
        byId("app-panel").classList.remove("hidden")
        if (isAuthError(error)) showNotice(loginRequiredMessage("cargar tus frases"))
        else showNotice(storageErrorMessage(error, "No se pudieron cargar las frases. Revisa que tu sesión y permisos de Supabase sean válidos."), true)
    } finally {
        hideLoading("sentences-loading-indicator")
    }
}

function switchScreen(name) {
    document.querySelectorAll(".tab").forEach(tab => tab.classList.toggle("active", tab.dataset.screen === name))
    document.querySelectorAll(".screen").forEach(screen => screen.classList.toggle("active", screen.id === `${name}-screen`))
    if (name === "review") renderReview()
    if (name === "reading") renderReading()
    if (name === "dictation") renderDictation()
    if (name === "vocabulary") loadVocabulary()
}

function setupEvents() {
    renderTopics()
    document.querySelectorAll(".tab").forEach(tab => tab.addEventListener("click", () => switchScreen(tab.dataset.screen)))
    byId("toggle-review-settings")?.addEventListener("click", () => byId("review-settings-form")?.classList.toggle("hidden"))
    byId("review-settings-form")?.addEventListener("submit", event => {
        event.preventDefault()
        const data = new FormData(event.currentTarget)
        applyReviewSettings({
            newCardLimit: data.get("newCardLimit"),
            reviewLimit: data.get("reviewLimit"),
            learningSteps: data.get("learningSteps"),
            cardDirection: data.get("cardDirection"),
            autoplayAudio: data.get("autoplayAudio") === "true"
        })
    })
    byId("reset-review-settings")?.addEventListener("click", () => {
        applyReviewSettings({ ...DEFAULT_REVIEW_SETTINGS }, "Ajustes restablecidos.")
    })
    byId("cancel-edit").addEventListener("click", resetForm)
    byId("search-input").addEventListener("input", () => renderSentenceList(filteredSentences()))
    byId("vocabulary-search-input").addEventListener("input", renderVocabularyList)
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
            grammarPattern: form.elements.grammarPattern.value || suggestGrammarPattern(sentenceText),
            grammarPatternTranslation: form.elements.grammarPatternTranslation.value,
            notes: form.elements.notes.value
        }
        if (!requireSession("guardar la frase")) return
        if (!sentence.reasonForSaving) return showNotice("Choose a reason for saving this sentence.", true)
        try {
            const saved = await repository.save(state.user.id, sentence, form.elements.id.value || null)
            if (form.elements.id.value) state.sentences = state.sentences.map(item => item.id === saved.id ? saved : item)
            else state.sentences.unshift(saved)
            state.reviewCards = await repository.listReviewCards(state.user.id, state.sentences)
            resetForm()
            showNotice("Sentence saved.")
            renderAll()
            window.dispatchEvent(new CustomEvent("personal-sentences-changed"))
        } catch (error) {
            console.error("Unable to save sentence", error)
            if (isAuthError(error)) showNotice(loginRequiredMessage("guardar la frase"))
            else showNotice(storageErrorMessage(error, "No se pudo guardar la frase."), true)
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
            exampleEs: form.elements.exampleEs.value,
            notes: form.elements.notes.value
        }
        if (!vocabulary.word.trim() || !vocabulary.spanish.trim()) {
            return showNotice("Escribe la palabra y su significado antes de guardar.", true)
        }
        if (!requireSession("guardar el vocabulario")) return
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
            if (isAuthError(error)) showNotice(loginRequiredMessage("guardar el vocabulario"))
            else showNotice(storageErrorMessage(error, "No se pudo guardar el vocabulario."), true)
        }
    })
    byId("vocabulary-ai-button").addEventListener("click", async event => {
        const button = event.currentTarget
        const form = byId("vocabulary-form")
        const status = byId("vocabulary-ai-status")
        const term = form.elements.word.value.trim()
        if (!term) {
            status.textContent = "Escribe primero una palabra o expresión en español."
            form.elements.word.focus()
            return
        }

        const includeNotes = byId("vocabulary-ai-include-notes").checked
        button.disabled = true
        button.textContent = "Completando…"
        status.textContent = includeNotes
            ? "La IA está preparando la ficha con notas y usos."
            : "La IA está preparando la ficha sin notas."
        try {
            const { generateVocabularyEntry } = await import("../ai-vocabulary.js")
            const entry = await generateVocabularyEntry(term, { includeNotes })
            form.elements.word.value = entry.word
            form.elements.pronunciation.value = entry.pronunciation || ""
            form.elements.spanish.value = entry.spanish
            form.elements.exampleEn.value = entry.example_en
            form.elements.exampleEs.value = entry.example_es
            if (includeNotes) form.elements.notes.value = entry.notes || ""
            status.textContent = includeNotes
                ? "Ficha completada con notas y usos. Revísala y guárdala."
                : "Ficha completada sin notas. Se conservaron tus notas actuales."
        } catch (error) {
            console.error("Unable to generate vocabulary with AI", error)
            status.textContent = error.message || "No se pudo completar la ficha."
        } finally {
            button.disabled = false
            button.textContent = "✨ Completar con IA"
        }
    })
    byId("cancel-vocabulary-edit").addEventListener("click", resetVocabularyForm)
    byId("sentence-form").elements.englishText.addEventListener("blur", event => {
        const pattern = byId("sentence-form").elements.grammarPattern
        if (!pattern.value) pattern.value = suggestGrammarPattern(event.target.value)
    })
    byId("sentence-ai-button").addEventListener("click", async event => {
        const button = event.currentTarget
        const form = byId("sentence-form")
        const status = byId("sentence-ai-status")
        const sentence = form.elements.englishText.value.trim()
        const pattern = form.elements.grammarPattern.value.trim()
        if (!sentence && !pattern) {
            status.textContent = "Escribe primero una frase o un patrón en inglés o español."
            form.elements.englishText.focus()
            return
        }

        button.disabled = true
        button.textContent = "Completando…"
        status.textContent = "La IA está completando la frase, la traducción, el patrón y las notas."
        try {
            const { completeSentenceEntry } = await import("../ai-translation.js")
            const entry = await completeSentenceEntry(
                sentence || pattern,
                { pattern: sentence ? pattern : "" }
            )
            form.elements.englishText.value = entry.english
            form.elements.spanishTranslation.value = entry.spanish
            form.elements.grammarPattern.value = entry.pattern
            form.elements.grammarPatternTranslation.value = entry.patternSpanish
            form.elements.notes.value = entry.notes || ""
            status.textContent = "Ficha completada. Revisa los datos, elige tema y motivo, y guarda la frase."
        } catch (error) {
            console.error("Unable to complete sentence with AI", error)
            status.textContent = error.message || "No se pudo completar la ficha."
        } finally {
            button.disabled = false
            button.textContent = "✨ Completar con IA"
        }
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
    renderReviewSettings()
    showLoading("sentences-loading-indicator", "Cargando tu aprendizaje…")
    try {
        let user = await resolveSessionUser(supabase)

        if (!user && navigator.onLine) {
            const { data, error } = await supabase.auth.getUser()
            if (error && error.name !== "AuthSessionMissingError") console.warn("Unable to read current auth session", error)
            user = data?.user || null
        }

        state.user = user
        if (state.user) await loadData()
        else {
            byId("auth-panel").classList.remove("hidden")
            byId("app-panel").classList.add("hidden")
        }
    } finally {
        hideLoading("sentences-loading-indicator")
    }
}
