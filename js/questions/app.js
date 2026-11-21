/* Modo Preguntas: formar y responder interrogativas con datos verificados.
 * El audio usa el mismo TTS que el resto de la app; la IA es opcional. */

import { playAudioEnhanced } from "../audio.js";
import { showToast } from "../cache.js";
import {
    VERIFIED_QUESTIONS,
    buildQuestionExercise,
    checkFormedAnswer,
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
        setHidden("questions-exercise", true);
        setText("questions-status", state.pool.length
            ? "Pulsa «Empezar» para practicar con esta selección."
            : "No hay preguntas con estos filtros. Prueba otra combinación o genera ejemplos con IA.");
    }
    updateScore();
    return state.pool;
}

function updateScore() {
    setText("questions-score", `${state.correctInSession} correctas · ${state.answeredInSession} respondidas`);
}

function fillSelect(id, options, defaultLabel) {
    const select = byId(id);
    if (!select) return;
    select.replaceChildren(
        new Option(defaultLabel, "all"),
        ...options.map(option => new Option(option.label, option.id))
    );
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
            input.focus();
        });
        host.append(button);
    });
}

function renderExercise() {
    const exercise = state.exercise;
    if (!exercise) return;
    state.checked = false;
    setHidden("questions-exercise", false);
    setText("questions-source-label", exercise.sourceLabel);
    setText("questions-pattern", [exercise.categoryTitle, exercise.questionWord, exercise.tense].filter(Boolean).join(" · "));
    setText("questions-prompt", exercise.prompt);
    setText("questions-hint", exercise.hint);
    setHidden("questions-hint", true);
    setText("questions-feedback", "");
    setHidden("questions-feedback", true);
    setHidden("questions-bank", exercise.mode !== "form");
    renderBank(exercise.bank);
    setHidden("questions-good", true);
    setHidden("questions-review", true);
    setHidden("questions-check", false);
    const check = byId("questions-check");
    if (check) check.disabled = false;
    setText("questions-check", exercise.mode === "form" ? "Comprobar" : "Ya respondí");
    const input = byId("questions-answer");
    if (input) {
        input.value = "";
        input.placeholder = exercise.mode === "form" ? "Escribe la pregunta en inglés…" : "Escribe tu respuesta en inglés…";
        input.disabled = false;
        input.focus();
    }
    setText("questions-status", `Pregunta ${state.historyIndex + 1} de ${state.history.length}`);
}

function showQuestion(entry, { push = true } = {}) {
    if (!entry) return;
    state.current = entry;
    state.exercise = buildQuestionExercise(entry, { mode: currentFilters().mode });
    if (push) {
        state.history = state.history.slice(0, state.historyIndex + 1);
        state.history.push(entry);
        state.historyIndex = state.history.length - 1;
    }
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
    state.exercise = buildQuestionExercise(state.current, { mode: currentFilters().mode });
    renderExercise();
}

function showAnswer() {
    const answer = state.exercise?.answer || "";
    const label = state.exercise?.answerLabel || "Guía del documento";
    const text = answer
        ? `${label}: ${answer}`
        : "No hay respuesta modelo verificada. Compara con la traducción y el contexto del documento y decide si la respondiste bien.";
    setText("questions-feedback", text);
    setHidden("questions-feedback", false);
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
}

function checkAnswer() {
    if (!state.exercise) return;
    const input = byId("questions-answer");
    const value = input?.value || "";
    if (!value.trim()) {
        setText("questions-feedback", "Escribe tu respuesta antes de comprobar.");
        setHidden("questions-feedback", false);
        return;
    }
    if (state.exercise.mode === "form") {
        const correct = checkFormedAnswer(state.exercise, value);
        recordOutcome(correct);
        setText("questions-feedback", correct
            ? "✅ Correcta. Escucha la pregunta para fijar la entonación."
            : `❌ La forma correcta es: ${state.exercise.answer}`);
        setHidden("questions-feedback", false);
        if (window.speechSynthesis) playAudioEnhanced(state.exercise.question, "en");
        return;
    }
    setText("questions-feedback", "Guardé tu respuesta. Mira la guía y puntúa con «Bien» o «Repasar».");
    setHidden("questions-feedback", false);
    setHidden("questions-good", false);
    setHidden("questions-review", false);
    setHidden("questions-check", true);
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
    byId("questions-start")?.addEventListener("click", startSession);
    byId("questions-next")?.addEventListener("click", nextQuestion);
    byId("questions-prev")?.addEventListener("click", previousQuestion);
    byId("questions-listen")?.addEventListener("click", () => {
        if (state.exercise?.question) playAudioEnhanced(state.exercise.question, "en");
    });
    byId("questions-hint-button")?.addEventListener("click", () => setHidden("questions-hint", false));
    byId("questions-reveal")?.addEventListener("click", () => {
        showAnswer();
        setHidden("questions-good", false);
        setHidden("questions-review", false);
        setHidden("questions-check", true);
    });
    byId("questions-check")?.addEventListener("click", checkAnswer);
    byId("questions-answer")?.addEventListener("keydown", event => {
        if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            checkAnswer();
        }
    });
    byId("questions-good")?.addEventListener("click", () => {
        recordOutcome(true);
        setText("questions-feedback", "✅ Marcada como respondida bien.");
    });
    byId("questions-review")?.addEventListener("click", () => {
        recordOutcome(false);
        const guide = state.exercise?.answer
            ? ` ${state.exercise.answerLabel || "Guía del documento"}: ${state.exercise.answer}`
            : " No hay respuesta modelo verificada; compara con la traducción y el contexto.";
        setText("questions-feedback", `🔁 La dejamos para repasar.${guide}`);
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
    refreshPool();
}

export { refreshPool as refreshQuestionPool };
