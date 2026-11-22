/* Modo Preguntas: formar y responder interrogativas con datos verificados.
 * El audio usa el mismo TTS que el resto de la app; la IA es opcional. */

import { QUESTIONS_TEACHING } from "../../data/questions-teaching.module.js";
import { playAudioEnhanced } from "../audio.js";
import { showToast } from "../cache.js";
import {
    VERIFIED_QUESTIONS,
    buildQuestionExercise,
    checkFormedAnswer,
    checkWrittenAnswer,
    filterQuestions,
    getQuestionFilterOptions,
    getQuestionProgress,
    loadAIQuestions,
    loadQuestionProgress,
    recordQuestionOutcome,
    saveQuestionProgress,
    selectNextQuestion,
    summaryQuestionProgress,
    withAIQuestions
} from "./model.js";
import { addGeneratedQuestions, clearGeneratedQuestions, generateAIQuestions } from "./ai.js";

const state = {
    pool: [],
    current: null,
    exercise: null,
    progress: loadQuestionProgress(),
    history: [],
    historyIndex: -1,
    checked: false,
    correctInSession: 0,
    answeredInSession: 0,
    initialized: false
};

function byId(id) {
    return document.getElementById(id);
}

function setText(id, value) {
    const node = byId(id);
    if (node) node.textContent = value;
}

function setHidden(id, hidden) {
    const node = byId(id);
    if (node) node.hidden = hidden;
}

function currentFilters() {
    return {
        tense: byId("questions-filter-tense")?.value || "all",
        word: byId("questions-filter-word")?.value || "all",
        type: byId("questions-filter-type")?.value || "all",
        section: byId("questions-filter-section")?.value || "all",
        source: byId("questions-filter-source")?.value || "all",
        mode: byId("questions-filter-mode")?.value || "form",
        search: byId("questions-filter-search")?.value || ""
    };
}

function refreshPool({ reset = true } = {}) {
    const filters = currentFilters();
    state.pool = filterQuestions(withAIQuestions(VERIFIED_QUESTIONS, loadAIQuestions()), filters);
    const summary = summaryQuestionProgress(state.progress, state.pool);
    setText("questions-count", `${state.pool.length} preguntas disponibles`);
    setText("questions-summary", `${summary.newCount} nuevas · ${summary.dueCount} para repasar · ${summary.solidCount} firmes`);
    if (reset) {
        state.current = null;
        state.exercise = null;
        state.history = [];
        state.historyIndex = -1;
        state.checked = false;
        state.correctInSession = 0;
        state.answeredInSession = 0;
        byId("questions-exercise")?.closest(".questions-card")?.classList.remove("has-exercise");
        setHidden("questions-exercise", true);
        setHidden("questions-question", true);
        setHidden("questions-options", true);
        setHidden("questions-explanation", true);
        setHidden("questions-answer-listen", true);
        setText("questions-status", state.pool.length
            ? "Pulsa «Empezar» para practicar con esta selección."
            : "No hay preguntas con estos filtros. Prueba otra combinación o genera ejemplos con IA.");
    }
    updateScore();
    return state.pool;
}

function updateScore() {
    setText("questions-score", `${state.correctInSession} correctas · ${state.answeredInSession} respondidas`);
    const bar = byId("questions-progress-bar");
    if (bar) {
        const total = state.pool.length || 1;
        const percent = Math.round((state.answeredInSession / total) * 100);
        bar.style.width = `${state.answeredInSession && percent < 1 ? 1 : Math.min(100, percent)}%`;
    }
}

function fillSelect(id, options, defaultLabel) {
    const select = byId(id);
    if (!select) return;
    select.replaceChildren(
        new Option(defaultLabel, "all"),
        ...options.map(option => new Option(option.label, option.id))
    );
}

function teachingTable(table) {
    const node = document.createElement("table");
    const head = document.createElement("thead");
    const headRow = document.createElement("tr");
    table.headers.forEach(value => {
        const cell = document.createElement("th");
        cell.textContent = value;
        headRow.append(cell);
    });
    head.append(headRow);
    const body = document.createElement("tbody");
    table.rows.forEach(row => {
        const rowNode = document.createElement("tr");
        row.forEach(value => {
            const cell = document.createElement("td");
            cell.textContent = value;
            rowNode.append(cell);
        });
        body.append(rowNode);
    });
    node.append(head, body);
    const scroll = document.createElement("div");
    scroll.className = "questions-table-scroll";
    scroll.append(node);
    return scroll;
}

function renderTeaching() {
    const host = byId("questions-teaching-content");
    const select = byId("questions-teaching-filter");
    if (!host || !select) return;
    if (select.options.length <= 1) {
        QUESTIONS_TEACHING.sections.forEach(section => {
            const indent = "— ".repeat(Math.max(0, section.level - 1));
            select.append(new Option(`${indent}${section.title}`, section.id));
        });
    }
    const selected = select.value || "all";
    const sections = selected === "all"
        ? QUESTIONS_TEACHING.sections
        : QUESTIONS_TEACHING.sections.filter(section => section.id === selected);
    host.replaceChildren(...sections.map(section => {
        const article = document.createElement("article");
        article.className = "questions-teaching-block";
        const heading = document.createElement("h3");
        heading.textContent = section.title;
        article.append(heading);
        section.paragraphs.forEach(value => {
            const paragraph = document.createElement("p");
            paragraph.textContent = value;
            article.append(paragraph);
        });
        section.notes.forEach(value => {
            const note = document.createElement("p");
            note.className = "questions-teaching-note";
            note.textContent = value;
            article.append(note);
        });
        section.tables.forEach(table => article.append(teachingTable(table)));
        return article;
    }));
}

function setupFilters() {
    const options = getQuestionFilterOptions();
    fillSelect("questions-filter-tense", options.tenses, "Todos los tiempos");
    fillSelect("questions-filter-word", options.words, "Todas las palabras");
    fillSelect("questions-filter-type", options.types, "Todos los tipos");
    fillSelect("questions-filter-section", options.sections.slice(1), "Todas las estructuras");
    const source = byId("questions-filter-source");
    if (source) {
        source.replaceChildren(
            new Option("Offline + IA", "all"),
            new Option("Solo verificadas", "verified"),
            new Option("Solo IA", "ai")
        );
    }
}

function renderBank(bank) {
    const host = byId("questions-bank");
    if (!host) return;
    host.replaceChildren();
    const label = document.createElement("span");
    label.className = "questions-bank-label";
    label.textContent = "Palabras:";
    host.append(label);
    bank.forEach(token => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "questions-token";
        button.textContent = token;
        button.addEventListener("click", () => {
            const input = byId("questions-answer");
            if (!input) return;
            input.value = `${input.value.trim()} ${token}`.trim();
            button.classList.add("is-used");
            input.focus();
        });
        host.append(button);
    });
}

/* En «Elegir respuesta» la corrección ocurre al tocar una opción: no hace
 * falta pulsar otro botón y el acierto o error se ve al instante. */
function renderOptions(options) {
    const host = byId("questions-options");
    if (!host) return;
    host.replaceChildren();
    options.forEach(option => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "questions-option";
        button.textContent = option;
        button.addEventListener("click", () => checkAnswer(option, { fromChoice: true }));
        host.append(button);
    });
}

function markOptions(selected) {
    byId("questions-options")?.querySelectorAll(".questions-option").forEach(button => {
        const matches = checkWrittenAnswer({ answer: state.exercise?.answer }, button.textContent, { strict: true });
        button.classList.toggle("is-correct", matches);
        button.classList.toggle("is-wrong", !matches && checkWrittenAnswer({ answer: selected }, button.textContent, { strict: true }));
    });
}

function renderExercise() {
    const exercise = state.exercise;
    if (!exercise) return;
    state.checked = false;
    byId("questions-exercise")?.closest(".questions-card")?.classList.add("has-exercise");
    setHidden("questions-exercise", false);
    setText("questions-source-label", exercise.sourceLabel);
    setText("questions-pattern", [exercise.categoryTitle, exercise.questionWord, exercise.tense].filter(Boolean).join(" · "));
    const mixed = currentFilters().mode === "mixed";
    const modeBadge = { form: "✍ Formar", answer: "💬 Responder", choice: "🎯 Elegir" };
    setText("questions-mode-badge", modeBadge[exercise.mode] || "✍ Formar");
    setHidden("questions-mode-badge", !mixed);
    setText("questions-question", exercise.question);
    setHidden("questions-question", exercise.mode === "form");
    setText("questions-prompt", exercise.prompt);
    setText("questions-explanation-title", `📘 ${exercise.explanationLabel}`);
    setText("questions-explanation-text", "");
    setHidden("questions-explanation", true);
    setHidden("questions-answer-listen", true);
    setText("questions-hint", exercise.hint);
    setHidden("questions-hint", true);
    setText("questions-feedback", "");
    byId("questions-feedback")?.classList.remove("is-correct", "is-wrong", "is-guide");
    setHidden("questions-feedback", true);
    setHidden("questions-bank", exercise.mode !== "form");
    renderBank(exercise.bank);
    setHidden("questions-options", exercise.mode !== "choice");
    renderOptions(exercise.options);
    setHidden("questions-answer-label", exercise.mode === "choice");
    setHidden("questions-answer", exercise.mode === "choice");
    setHidden("questions-check", exercise.mode === "choice");
    const check = byId("questions-check");
    if (check) check.disabled = false;
    setText("questions-check", "✅ Comprobar");
    setText("questions-reveal", "📘 Ver explicación");
    const input = byId("questions-answer");
    if (input) {
        input.value = "";
        input.placeholder = exercise.mode === "form" ? "Escribe la pregunta en inglés…" : "Escribe tu respuesta en inglés…";
        input.disabled = false;
        if (exercise.mode !== "choice") input.focus();
    }
    setText("questions-status", `Pregunta ${state.historyIndex + 1} de ${state.history.length}`);
}

function showQuestion(entry, { push = true } = {}) {
    if (!entry) return;
    state.current = entry;
    if (push) {
        state.history = state.history.slice(0, state.historyIndex + 1);
        state.history.push(entry);
        state.historyIndex = state.history.length - 1;
    }
    state.exercise = buildQuestionExercise(entry, {
        mode: currentFilters().mode,
        index: state.historyIndex,
        pool: state.pool
    });
    renderExercise();
}

function startSession() {
    refreshPool({ reset: true });
    if (!state.pool.length) return;
    const entry = selectNextQuestion(state.pool, state.progress);
    showQuestion(entry);
}

function nextQuestion() {
    if (!state.pool.length) return startSession();
    const entry = selectNextQuestion(state.pool, state.progress, { excludeId: state.current?.id });
    if (entry) showQuestion(entry);
    else setText("questions-status", "Ya practicaste todas las preguntas de esta selección.");
}

function previousQuestion() {
    if (state.historyIndex <= 0) return;
    state.historyIndex -= 1;
    state.current = state.history[state.historyIndex];
    state.exercise = buildQuestionExercise(state.current, {
        mode: currentFilters().mode,
        index: state.historyIndex,
        pool: state.pool
    });
    renderExercise();
}

function finishSentence(value) {
    const text = String(value || "").trim();
    return text && !/[.?!]$/.test(text) ? `${text}.` : text;
}

function setFeedback(text, tone) {
    const node = byId("questions-feedback");
    node?.classList.remove("is-correct", "is-wrong", "is-guide");
    if (tone) node?.classList.add(tone);
    setText("questions-feedback", text);
    setHidden("questions-feedback", false);
}

/* Cada respuesta termina con una explicación derivada del documento: forma
 * correcta o guía, estructura, tiempo, tipo, significado y contexto. */
function showExplanation() {
    const exercise = state.exercise;
    if (!exercise) return;
    setText("questions-explanation-title", `📘 ${exercise.explanationLabel}`);
    setText("questions-explanation-text", exercise.explanation);
    setHidden("questions-explanation", false);
    setHidden("questions-answer-listen", !exercise.answer);
}

function showAnswer() {
    const answer = state.exercise?.answer || "";
    const label = state.exercise?.answerLabel || "Guía del documento";
    const text = answer
        ? `${label}: ${answer}`
        : "No hay respuesta modelo verificada. Compara con la traducción y el contexto del documento y decide si la respondiste bien.";
    setFeedback(text, "is-guide");
    showExplanation();
}

function recordOutcome(isCorrect) {
    if (!state.current || state.checked) return;
    state.checked = true;
    state.progress = recordQuestionOutcome(state.progress, state.current.id, isCorrect, {
        mode: state.exercise?.mode || "form"
    });
    saveQuestionProgress(state.progress);
    state.answeredInSession += 1;
    if (isCorrect) state.correctInSession += 1;
    updateScore();
    const summary = summaryQuestionProgress(state.progress, state.pool);
    setText("questions-summary", `${summary.newCount} nuevas · ${summary.dueCount} para repasar · ${summary.solidCount} firmes`);
    const input = byId("questions-answer");
    if (input) input.disabled = true;
    byId("questions-check")?.setAttribute("disabled", "true");
    byId("questions-bank")?.querySelectorAll("button").forEach(button => button.disabled = true);
    byId("questions-options")?.querySelectorAll("button").forEach(button => button.disabled = true);
}

function checkAnswer(valueOverride = "", { fromChoice = false } = {}) {
    if (!state.exercise || state.checked) return;
    const input = byId("questions-answer");
    const exercise = state.exercise;
    const value = fromChoice ? valueOverride : (input?.value || "");
    if (!String(value).trim()) {
        setFeedback("Escribe o elige una respuesta antes de comprobar.", "is-guide");
        return;
    }
    if (exercise.mode !== "form" && !exercise.answer) {
        setFeedback("No hay respuesta modelo verificada. Compara con la explicación.", "is-guide");
        showExplanation();
        return;
    }
    const correct = exercise.mode === "form"
        ? checkFormedAnswer(exercise, value)
        : checkWrittenAnswer(exercise, value, { strict: fromChoice });
    recordOutcome(correct);

    if (exercise.mode === "form") {
        setFeedback(correct
            ? "✅ Correcta. Lee la explicación y escucha la entonación."
            : `❌ La forma correcta es: ${finishSentence(exercise.answer)}`, correct ? "is-correct" : "is-wrong");
        if (window.speechSynthesis) playAudioEnhanced(exercise.question, "en");
    } else if (exercise.mode === "choice") {
        markOptions(value);
        setFeedback(correct
            ? `✅ Correcta. ${exercise.answerLabel}: ${finishSentence(exercise.answer)}`
            : `❌ La correcta era: ${finishSentence(exercise.answer || "sin respuesta modelo")}`, correct ? "is-correct" : "is-wrong");
        if (exercise.answer && window.speechSynthesis) playAudioEnhanced(exercise.answer, "en");
    } else {
        const label = exercise.answerLabel || "Respuesta modelo";
        setFeedback(correct
            ? `✅ Correcta. Coincide con ${label.toLowerCase()}.`
            : `❌ No coincide. ${label}: ${finishSentence(exercise.answer || "sin respuesta modelo")}`, correct ? "is-correct" : "is-wrong");
        if (exercise.answer && window.speechSynthesis) playAudioEnhanced(exercise.answer, "en");
    }
    showExplanation();
}

async function generateMore() {
    const button = byId("questions-ai-generate");
    const status = byId("questions-status");
    if (button) button.disabled = true;
    setText("questions-status", "Generando ejemplos con IA…");
    try {
        const filters = currentFilters();
        const generated = await generateAIQuestions({
            ...filters,
            examples: state.pool.map(item => item.english)
        });
        const accepted = addGeneratedQuestions(generated, { existing: state.pool });
        if (!accepted.length) {
            setText("questions-status", "La IA devolvió solo preguntas que ya tenías.");
        } else {
            showToast(`Se añadieron ${accepted.length} preguntas con IA.`, "success");
            refreshPool({ reset: false });
            setText("questions-status", `${accepted.length} preguntas nuevas de IA listas para practicar.`);
        }
    } catch (error) {
        setText("questions-status", error?.message || "No se pudieron generar preguntas con IA.");
    } finally {
        if (button) button.disabled = false;
    }
}

function wireEvents() {
    ["questions-filter-tense", "questions-filter-word", "questions-filter-type", "questions-filter-section", "questions-filter-source", "questions-filter-mode"]
        .forEach(id => byId(id)?.addEventListener("change", () => refreshPool()));
    byId("questions-filter-search")?.addEventListener("input", () => refreshPool());
    byId("questions-teaching-filter")?.addEventListener("change", renderTeaching);
    byId("questions-start")?.addEventListener("click", startSession);
    byId("questions-next")?.addEventListener("click", nextQuestion);
    byId("questions-prev")?.addEventListener("click", previousQuestion);
    byId("questions-listen")?.addEventListener("click", () => {
        if (state.exercise?.question) playAudioEnhanced(state.exercise.question, "en");
    });
    byId("questions-answer-listen")?.addEventListener("click", () => {
        if (state.exercise?.answer) playAudioEnhanced(state.exercise.answer, "en");
    });
    byId("questions-hint-button")?.addEventListener("click", () => setHidden("questions-hint", false));
    byId("questions-reveal")?.addEventListener("click", () => {
        showAnswer();
        byId("questions-check")?.setAttribute("disabled", "true");
    });
    byId("questions-check")?.addEventListener("click", () => checkAnswer());
    byId("questions-answer")?.addEventListener("keydown", event => {
        if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            checkAnswer();
        }
    });
    byId("questions-ai-generate")?.addEventListener("click", generateMore);
    byId("questions-ai-clear")?.addEventListener("click", () => {
        clearGeneratedQuestions();
        refreshPool();
        setText("questions-status", "Se borraron tus preguntas generadas con IA.");
    });
}

export function initializeQuestions() {
    if (state.initialized) return;
    if (!byId("practice-pane-questions")) return;
    state.initialized = true;
    setupFilters();
    wireEvents();
    renderTeaching();
    refreshPool();
}

export { refreshPool as refreshQuestionPool };
