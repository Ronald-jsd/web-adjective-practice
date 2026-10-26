import { playAudioEnhanced, getBestVoice } from "./audio.js";
import { createPracticeProgressSync } from "./practice-progress.js";
import { showToast } from "./cache.js";
import {
    filterAudioPracticeItems,
    getPracticeFillHint,
    rankPracticeReviews,
    selectPracticeDistractors
} from "./practice-utils.js";
import { createPracticeAudioPlayer } from "./practice-audio.js";
import { store } from "./config.js";
import {
    createAIPracticeCategory,
    createAIExamplePrompt,
    createVerbPracticeCategory,
    createFavoritesPracticeCategory,
    AI_PRACTICE_CATEGORY_ID,
    VERB_PRACTICE_CATEGORY_ID,
    FAVORITE_ADJECTIVES_PRACTICE_CATEGORY_ID,
    FAVORITE_VERBS_PRACTICE_CATEGORY_ID,
    FAVORITES_PRACTICE_CATEGORY_ID,
    createPersonalVocabularyPracticeCategory
} from "./ai-practice.js";
import { getSelectedNotionPageIds, loadNotionPracticeCategories } from "./notion.js";
import { parsePracticeTable } from "./practice-import.js";

const PROGRESS_STORAGE_KEY = "vocabulary_practice_progress_v1";
const CATEGORY_SELECTION_STORAGE_KEY = "practice_selected_categories_v1";
const AUDIO_FILTER_STORAGE_KEY = "practice_audio_course_filter_v1";
const DAY_IN_MS = 24 * 60 * 60 * 1000;

let practiceItems = [];
let selectedCategories = new Set();
let currentItem = null;
let questionHistory = [];
let questionHistoryIndex = -1;
let importedPracticeItems = [];
let practiceSourceCategories = [];
let practiceSourceOptions = {};
let selectedExerciseType = "mixed";
let currentExerciseType = "listening";
let correctAnswers = 0;
let answeredQuestions = 0;
let isAnswered = false;
let initialized = false;
let categoriesInitialized = false;
let previousAvailableCategoryIds = new Set();
let forgottenQueue = [];
let questionsSinceForgotten = 0;
let progressByItem = loadProgress();
let progressSync = null;
let progressWriteQueue = Promise.resolve();
let audioCourse = null;
let audioCourseFilter = "all";
let practiceVerbsCache = null;
let practiceVerbsUserId = null;
let practiceVerbCategoryCache = null;
let practiceAIQueriesCache = null;
let practiceAIQueriesUserId = null;
let practiceSentencesCache = null;
let practiceSentencesUserId = null;
let practiceVocabularyCache = null;
let practiceVocabularyUserId = null;
let practiceNotionCache = null;
let practiceNotionUserId = null;

function getAudioSessionScope() {
    return `${audioCourseFilter}:${[...selectedCategories].sort().join(",")}`;
}

function getAudioCourseItems() {
    return filterAudioPracticeItems(getSelectedItems(), audioCourseFilter, getItemProgress);
}

function saveCategorySelection() {
    try {
        localStorage.setItem(CATEGORY_SELECTION_STORAGE_KEY, JSON.stringify([...selectedCategories]));
    } catch (error) {
        console.warn("No se pudo guardar la selección de categorías:", error);
    }
}

function renderAudioCourseState(state) {
    const status = document.getElementById("practice-audio-course-status");
    const current = document.getElementById("practice-audio-course-current");
    const start = document.getElementById("practice-audio-course-start");
    const pause = document.getElementById("practice-audio-course-pause");
    const skip = document.getElementById("practice-audio-course-skip");
    const stop = document.getElementById("practice-audio-course-stop");
    if (!status || !start || !pause || !skip || !stop) return;

    const active = state.status === "playing" || state.status === "paused";
    const audioItems = getAudioCourseItems();
    const selectedItemCount = audioItems.length;
    const canResume = audioCourse?.canResume(audioItems, getAudioSessionScope()) || false;
    const rateSelect = document.getElementById("practice-audio-course-rate");
    if (rateSelect && state.rate) rateSelect.value = String(state.rate);
    start.disabled = state.status === "playing" || selectedItemCount === 0 || !window.speechSynthesis;
    if (state.status === "paused" || canResume) start.textContent = "▶ Reanudar";
    else if (state.status === "complete") start.textContent = "↻ Repetir";
    else start.textContent = "▶ Empezar";
    pause.disabled = state.status !== "playing";
    pause.textContent = state.status === "paused" ? "⏸ Pausado" : "⏸ Pausar";
    skip.disabled = !active;
    stop.disabled = !active;

    if (state.status === "playing" && state.item) {
        status.textContent = `Elemento ${state.itemIndex + 1} de ${state.total} · ${state.segmentLabel || "Reproduciendo"} · ${Math.round(state.rate * 100)}%`;
        current.textContent = [
            `${state.item.word} — ${state.item.spanish}`,
            state.item.example,
            state.item.exampleSpanish
        ].filter(Boolean).join("\n");
        current.classList.remove("hidden");
    } else if (state.status === "paused") {
        status.textContent = `Pausado · elemento ${state.itemIndex + 1} de ${state.total}`;
    } else if (state.status === "complete") {
        status.textContent = `Terminaste los ${state.total} elementos seleccionados.`;
        current.classList.add("hidden");
    } else if (state.status === "error") {
        status.textContent = `No se pudo reproducir el audio: ${state.error}`;
    } else if (state.status === "idle") {
        status.textContent = selectedItemCount
            ? `${selectedItemCount} elementos en esta selección · ${canResume ? "puedes reanudar donde lo dejaste." : "se reproducen en orden aleatorio."}`
            : "No hay elementos para este filtro en las categorías elegidas.";
        current.classList.add("hidden");
    }
}

function stopAudioCourse(preserveProgress = false) {
    audioCourse?.stop(preserveProgress);
}

function loadProgress() {
    try {
        const savedProgress = JSON.parse(localStorage.getItem(PROGRESS_STORAGE_KEY) || "{}");
        return savedProgress && typeof savedProgress === "object" && !Array.isArray(savedProgress)
            ? savedProgress
            : {};
    } catch {
        return {};
    }
}

function saveProgress() {
    try {
        localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(progressByItem));
    } catch (error) {
        console.warn("No se pudo guardar el progreso de práctica:", error);
    }
}

function getItemProgress(item) {
    return progressByItem[item.id] || {
        attempts: 0,
        correct: 0,
        repetitions: 0,
        intervalDays: 0,
        ease: 2.5,
        dueAt: 0,
        lapses: 0
    };
}

function getPracticeItems(categories) {
    return categories.flatMap(category =>
        (category.subcategories || []).flatMap(subcategory =>
            (subcategory.items || [])
                .filter(item => item[0] && item[2])
                .map((item, index) => ({
                    word: String(item[0]).trim(),
                    spanish: String(item[2]).trim(),
                    example: String(item[3] || "").trim(),
                    exampleSpanish: String(item[4] || "").trim(),
                    categoryId: String(category.id),
                    categoryTitle: category.title || "Sin categoría",
                    categoryIcon: category.icon || "📚",
                    id: `${category.id}:${subcategory.id}:${item[5] || `${item[0]}-${index}`}`
                }))
        )
    );
}

function updateScore() {
    const score = document.getElementById("practice-score");
    if (score) score.textContent = `${correctAnswers} correctas · ${answeredQuestions} respondidas`;
    updateReviewSummary();
}

function updateReviewSummary() {
    const summary = document.getElementById("practice-review-summary");
    if (!summary) return;

    let newCount = 0;
    let dueCount = 0;
    let inProgressCount = 0;
    let solidCount = 0;
    const now = Date.now();

    getSelectedItems().forEach(item => {
        const progress = getItemProgress(item);
        if (progress.attempts === 0) newCount += 1;
        else if (progress.dueAt <= now) dueCount += 1;
        else if (progress.intervalDays >= 6) solidCount += 1;
        else inProgressCount += 1;
    });

    summary.textContent = `${newCount} nuevas · ${dueCount} para repasar · ${inProgressCount} en curso · ${solidCount} firmes`;
}

function getSelectedItems() {
    return practiceItems.filter(item => selectedCategories.has(item.categoryId));
}

function isTemporaryNotionItem(itemId) {
    return itemId.startsWith("notion-page-");
}

function normalizeAnswer(value) {
    return value.trim().toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function chooseExerciseType() {
    if (selectedExerciseType === "mixed" && currentItem?.categoryId === AI_PRACTICE_CATEGORY_ID) return "fill";
    if (selectedExerciseType !== "mixed") return selectedExerciseType;
    const exerciseTypes = ["listening", "translation", "choice", "fill"];
    return exerciseTypes[Math.floor(Math.random() * exerciseTypes.length)];
}

function getPromptText() {
    if (currentExerciseType === "listening") return "Escucha y escribe la palabra en inglés";
    if (currentExerciseType === "translation") return `Traduce: ${currentItem.spanish}`;
    if (currentExerciseType === "choice") return `¿Qué palabra corresponde a “${currentItem.spanish}”?`;

    if (currentItem.categoryId === AI_PRACTICE_CATEGORY_ID) {
        return createAIExamplePrompt(currentItem.word, currentItem.example, currentItem.exampleSpanish);
    }

    if (currentItem.example) {
        const escapedWord = currentItem.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const wordPattern = new RegExp(`\\b${escapedWord}\\b`, "i");
        if (wordPattern.test(currentItem.example)) {
            return currentItem.example.replace(wordPattern, "_____").replace(/\s+([.,!?;:])/g, "$1");
        }
    }
    return `Completa con la palabra en inglés: ${currentItem.spanish}`;
}

function renderChoiceOptions() {
    const optionsContainer = document.getElementById("practice-choice-options");
    if (!optionsContainer || !currentItem) return;

    const distractors = selectPracticeDistractors(getSelectedItems(), currentItem.word);

    const options = [currentItem, ...distractors.slice(0, 3)];
    for (let index = options.length - 1; index > 0; index -= 1) {
        const randomIndex = Math.floor(Math.random() * (index + 1));
        [options[index], options[randomIndex]] = [options[randomIndex], options[index]];
    }

    optionsContainer.replaceChildren();
    options.forEach(option => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "practice-choice-button";
        button.dataset.answer = option.word;
        button.textContent = option.word;
        button.disabled = isAnswered;
        button.addEventListener("click", () => recordAnswer(option.word, button));
        optionsContainer.appendChild(button);
    });
}

function renderQuestion() {
    const prompt = document.getElementById("practice-prompt");
    const categoryLabel = document.getElementById("practice-category-label");
    const listenButton = document.getElementById("practice-listen");
    const answer = document.getElementById("practice-answer");
    const submit = document.getElementById("practice-submit");
    const answerForm = document.getElementById("practice-answer-form");
    const choices = document.getElementById("practice-choice-options");
    const hint = document.getElementById("practice-hint");
    const meaning = document.getElementById("practice-meaning");
    if (!prompt) return;

    if (!currentItem) {
        prompt.textContent = getSelectedItems().length
            ? "Pulsa comenzar para iniciar el repaso inteligente."
            : "Selecciona al menos una categoría con vocabulario.";
        if (categoryLabel) categoryLabel.textContent = "LISTA PARA PRACTICAR";
        if (listenButton) listenButton.disabled = true;
        if (answer) answer.disabled = true;
        if (submit) submit.disabled = true;
        if (choices) choices.classList.add("hidden");
        if (meaning) {
            meaning.textContent = "";
            meaning.classList.add("hidden");
        }
        return;
    }

    const exerciseLabels = {
        listening: "Listening",
        translation: "Traducción",
        choice: "Opción múltiple",
        fill: "Completar frase"
    };
    prompt.textContent = getPromptText();
    if (meaning) {
        const showHint = currentExerciseType === "fill";
        meaning.textContent = showHint
            ? getPracticeFillHint(currentItem.spanish, currentItem.exampleSpanish)
            : "";
        meaning.classList.toggle("hidden", !showHint);
    }
    if (categoryLabel) categoryLabel.textContent = `${currentItem.categoryIcon} ${currentItem.categoryTitle} · ${exerciseLabels[currentExerciseType]}`;
    if (hint) {
        hint.textContent = currentExerciseType === "listening"
            ? "Escucha la palabra en inglés y escríbela. Puedes reproducirla otra vez."
            : currentExerciseType === "fill"
                ? "Completa el espacio con la palabra que falta."
                : currentExerciseType === "choice"
                    ? "Elige la palabra correcta."
                    : "Lee la traducción y escribe la palabra en inglés.";
    }
    if (listenButton) {
        listenButton.classList.toggle("hidden", currentExerciseType !== "listening");
        listenButton.disabled = isAnswered || !window.speechSynthesis;
    }
    if (answerForm) answerForm.classList.toggle("hidden", currentExerciseType === "choice");
    if (choices) choices.classList.toggle("hidden", currentExerciseType !== "choice");
    if (answer) {
        answer.disabled = isAnswered;
        answer.placeholder = currentExerciseType === "listening"
            ? "Escribe lo que escuchas..."
            : currentExerciseType === "fill"
                ? "Completa la frase..."
                : "Escribe la traducción...";
    }
    if (submit) submit.disabled = isAnswered;
}

function clearFeedback() {
    const feedback = document.getElementById("practice-feedback");
    if (feedback) {
        feedback.textContent = "";
        feedback.className = "practice-feedback";
    }
}

function updateCategoryChoices(categories) {
    const list = document.getElementById("practice-category-list");
    const count = document.getElementById("practice-category-count");
    if (!list) return;

    const available = categories.map(category => ({
        ...category,
        itemCount: (category.subcategories || []).reduce((total, subcategory) =>
            total + (subcategory.items || []).filter(item => item[0] && item[2]).length, 0),
    })).filter(category => category.itemCount > 0
        || [
            FAVORITES_PRACTICE_CATEGORY_ID,
            FAVORITE_ADJECTIVES_PRACTICE_CATEGORY_ID,
            FAVORITE_VERBS_PRACTICE_CATEGORY_ID
        ].includes(String(category.id)));

    const availableIds = new Set(available.map(category => String(category.id)));
    let savedCategoryIds = null;
    if (!categoriesInitialized) {
        try {
            const storedIds = JSON.parse(localStorage.getItem(CATEGORY_SELECTION_STORAGE_KEY) || "null");
            if (Array.isArray(storedIds) && storedIds.every(id => typeof id === "string")) {
                savedCategoryIds = storedIds
                    .flatMap(id => id === FAVORITES_PRACTICE_CATEGORY_ID
                        ? [FAVORITE_ADJECTIVES_PRACTICE_CATEGORY_ID, FAVORITE_VERBS_PRACTICE_CATEGORY_ID]
                        : [id])
                    .filter(id => availableIds.has(id));
            }
        } catch (error) {
            console.warn("No se pudo leer la selección de categorías guardada:", error);
        }
    }
    const wereAllPreviouslySelected = categoriesInitialized
        && previousAvailableCategoryIds.size > 0
        && previousAvailableCategoryIds.size === selectedCategories.size
        && [...previousAvailableCategoryIds].every(id => selectedCategories.has(id));
    selectedCategories = new Set([...selectedCategories].filter(id => availableIds.has(id)));
    if (!categoriesInitialized) {
        selectedCategories = new Set(savedCategoryIds ?? availableIds);
        categoriesInitialized = true;
    } else if (wereAllPreviouslySelected) {
        selectedCategories = new Set(availableIds);
    }
    previousAvailableCategoryIds = availableIds;
    list.replaceChildren();

    const masterLabel = document.createElement("label");
    masterLabel.className = "practice-category-option practice-category-all";
    const master = document.createElement("input");
    master.type = "checkbox";
    master.checked = selectedCategories.size === availableIds.size && availableIds.size > 0;
    master.indeterminate = selectedCategories.size > 0 && selectedCategories.size < availableIds.size;
    master.addEventListener("change", () => {
        selectedCategories = master.checked ? new Set(availableIds) : new Set();
        saveCategorySelection();
        updateCategoryChoices(categories);
        onSelectionChanged();
    });
    const masterName = document.createElement("span");
    masterName.textContent = "Todas las categorías";
    masterLabel.append(master, masterName);
    list.appendChild(masterLabel);

    available.forEach(category => {
        const label = document.createElement("label");
        label.className = "practice-category-option";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = String(category.id);
        checkbox.checked = selectedCategories.has(checkbox.value);
        checkbox.addEventListener("change", () => {
            if (checkbox.checked) selectedCategories.add(checkbox.value);
            else selectedCategories.delete(checkbox.value);
            saveCategorySelection();
            updateCategoryChoices(categories);
            onSelectionChanged();
        });
        const name = document.createElement("span");
        name.textContent = `${category.icon || "📚"} ${category.title || "Sin categoría"}`;
        const itemCount = document.createElement("small");
        itemCount.textContent = category.itemCount;
        label.append(checkbox, name, itemCount);
        list.appendChild(label);
    });

    const selectedCount = practiceItems.filter(item => selectedCategories.has(item.categoryId)).length;
    if (count) count.textContent = `${selectedCount} palabras`;
    const startButton = document.getElementById("practice-start");
    if (startButton) startButton.disabled = selectedCount === 0;
    updateReviewSummary();
}

function onSelectionChanged() {
    stopAudioCourse(true);
    currentItem = null;
    isAnswered = false;
    questionHistory = [];
    questionHistoryIndex = -1;
    forgottenQueue = forgottenQueue.filter(id => getSelectedItems().some(item => item.id === id));
    clearFeedback();
    document.getElementById("practice-start")?.classList.remove("hidden");
    document.getElementById("practice-next")?.classList.add("hidden");
    updatePreviousButton();
    renderQuestion();
}

function nextQuestion() {
    const eligibleItems = getSelectedItems();
    if (eligibleItems.length === 0) return;

    forgottenQueue = forgottenQueue.filter(id => eligibleItems.some(item => item.id === id));
    let nextItem = null;

    if (forgottenQueue.length > 0 && questionsSinceForgotten >= 2) {
        const forgottenId = forgottenQueue.shift();
        nextItem = eligibleItems.find(item => item.id === forgottenId) || null;
        questionsSinceForgotten = 0;
    }

    if (!nextItem) {
        let candidates = eligibleItems.filter(item => item.id !== currentItem?.id && !forgottenQueue.includes(item.id));
        if (candidates.length === 0) candidates = eligibleItems.filter(item => item.id !== currentItem?.id);

        const now = Date.now();
        const reviewedDue = rankPracticeReviews(
            candidates.filter(item => getItemProgress(item).attempts > 0 && getItemProgress(item).dueAt <= now),
            getItemProgress
        );
        const newItems = candidates.filter(item => getItemProgress(item).attempts === 0);
        const futureReviews = candidates
            .filter(item => getItemProgress(item).dueAt > now)
            .sort((first, second) => getItemProgress(first).dueAt - getItemProgress(second).dueAt);

        if (reviewedDue.length > 0) nextItem = reviewedDue[0];
        else if (newItems.length > 0) nextItem = newItems[Math.floor(Math.random() * newItems.length)];
        else if (futureReviews.length > 0) nextItem = futureReviews[0];
        else nextItem = eligibleItems.find(item => item.id !== currentItem?.id) || eligibleItems[0];

        if (forgottenQueue.length > 0) questionsSinceForgotten += 1;
    }

    currentItem = nextItem;
    currentExerciseType = chooseExerciseType();
    isAnswered = false;
    questionHistory = questionHistory.slice(0, questionHistoryIndex + 1);
    questionHistory.push({ item: currentItem, exerciseType: currentExerciseType, answered: false });
    questionHistoryIndex = questionHistory.length - 1;
    clearFeedback();
    const answer = document.getElementById("practice-answer");
    if (answer) answer.value = "";
    document.getElementById("practice-start")?.classList.add("hidden");
    document.getElementById("practice-next")?.classList.remove("hidden");
    if (currentExerciseType === "choice") renderChoiceOptions();
    else document.getElementById("practice-choice-options")?.replaceChildren();
    renderQuestion();
    if (currentExerciseType !== "choice") answer?.focus();
    updatePreviousButton();
}

function updatePreviousButton() {
    const button = document.getElementById("practice-prev");
    if (button) button.classList.toggle("hidden", questionHistoryIndex <= 0);
}

function previousQuestion() {
    if (questionHistoryIndex <= 0) return;
    questionHistoryIndex -= 1;
    const previous = questionHistory[questionHistoryIndex];
    currentItem = previous.item;
    currentExerciseType = previous.exerciseType;
    isAnswered = previous.answered;
    clearFeedback();
    const answer = document.getElementById("practice-answer");
    if (answer) answer.value = "";
    document.getElementById("practice-next")?.classList.remove("hidden");
    document.getElementById("practice-start")?.classList.add("hidden");
    if (currentExerciseType === "choice") renderChoiceOptions();
    else document.getElementById("practice-choice-options")?.replaceChildren();
    renderQuestion();
    updatePreviousButton();
}

function recordAnswer(submittedAnswer, selectedButton = null) {
    if (!currentItem || isAnswered) return;

    const isCorrect = normalizeAnswer(submittedAnswer) === normalizeAnswer(currentItem.word);
    isAnswered = true;
    if (questionHistory[questionHistoryIndex]) {
        questionHistory[questionHistoryIndex].answered = true;
    }
    answeredQuestions += 1;
    if (isCorrect) correctAnswers += 1;

    const progress = { ...getItemProgress(currentItem) };
    const now = Date.now();
    progress.attempts += 1;
    progress.lastReviewedAt = now;
    if (isCorrect) {
        progress.correct += 1;
        progress.repetitions += 1;
        progress.intervalDays = progress.repetitions === 1
            ? 1
            : progress.repetitions === 2
                ? 6
                : Math.max(1, progress.intervalDays * progress.ease);
        progress.ease = Math.min(2.8, progress.ease + 0.05);
        progress.dueAt = now + progress.intervalDays * DAY_IN_MS;
    } else {
        progress.lapses += 1;
        progress.repetitions = 0;
        progress.intervalDays = 0;
        progress.ease = Math.max(1.3, progress.ease - 0.2);
        progress.dueAt = now;
        if (!forgottenQueue.includes(currentItem.id)) forgottenQueue.push(currentItem.id);
        questionsSinceForgotten = 0;
    }
    progressByItem[currentItem.id] = progress;
    saveProgress();
    if (progressSync && !isTemporaryNotionItem(currentItem.id)) {
        const itemId = currentItem.id;
        const savedProgress = { ...progress };
        progressWriteQueue = progressWriteQueue
            .catch(() => {})
            .then(() => progressSync.save(itemId, savedProgress))
            .catch(error => {
                console.error("No se pudo sincronizar el intento de práctica:", error);
                showToast(`La respuesta se guardó en este dispositivo, pero no se sincronizó con tu cuenta. ${error.message || ""}`, "error");
            });
    }

    if (selectedButton) {
        document.querySelectorAll(".practice-choice-button").forEach(button => {
            button.disabled = true;
            if (normalizeAnswer(button.dataset.answer) === normalizeAnswer(currentItem.word)) {
                button.classList.add("is-correct");
            }
            if (button === selectedButton && !isCorrect) button.classList.add("is-incorrect");
        });
    }

    updateScore();
    showFeedback(isCorrect, progress);
    renderQuestion();
    if (selectedButton) selectedButton.focus();
    else document.getElementById("practice-next")?.focus();
}

function showFeedback(isCorrect, progress) {
    const feedback = document.getElementById("practice-feedback");
    if (!feedback || !currentItem) return;
    feedback.className = `practice-feedback ${isCorrect ? "is-correct" : "is-incorrect"}`;

    const result = document.createElement("strong");
    result.textContent = isCorrect ? "¡Correcto!" : `La respuesta es: ${currentItem.word}`;
    const meaning = document.createElement("span");
    meaning.textContent = `${currentItem.spanish} · ${currentItem.categoryTitle}`;
    const schedule = document.createElement("span");
    schedule.className = "practice-schedule-note";
    schedule.textContent = isCorrect
        ? `Próximo repaso: en ${progress.intervalDays === 1 ? "1 día" : `${Math.round(progress.intervalDays)} días`}.`
        : "La volverás a ver durante esta práctica y quedó pendiente para repaso.";
    feedback.append(result, meaning, schedule);
    if (currentItem.example) {
        const example = document.createElement("span");
        example.className = "practice-example";
        example.textContent = currentItem.example;
        feedback.appendChild(example);
        if (window.speechSynthesis) {
            const speakExample = document.createElement("button");
            speakExample.type = "button";
            speakExample.className = "practice-audio-answer";
            speakExample.textContent = "🔊 Escuchar oración";
            speakExample.addEventListener("click", () => playAudioEnhanced(currentItem.example, "en"));
            feedback.appendChild(speakExample);
        }
        if (currentItem.exampleSpanish) {
            const translation = document.createElement("span");
            translation.className = "practice-example-translation";
            translation.textContent = currentItem.exampleSpanish;
            feedback.appendChild(translation);
        }
    }
}

function submitAnswer(event) {
    event.preventDefault();
    const answer = document.getElementById("practice-answer");
    if (!answer?.value.trim()) {
        answer?.focus();
        return;
    }
    recordAnswer(answer.value);
}

async function initializePractice(categories = [], options = {}) {
    if (initialized) stopAudioCourse();
    practiceSourceCategories = categories;
    practiceSourceOptions = options;
    const userId = options.userId || null;
    if (practiceSentencesUserId !== userId) {
        practiceSentencesCache = null;
        practiceSentencesUserId = userId;
    }
    if (practiceVocabularyUserId !== userId) {
        practiceVocabularyCache = null;
        practiceVocabularyUserId = userId;
    }
    if (practiceNotionUserId !== userId) {
        practiceNotionCache = null;
        practiceNotionUserId = userId;
    }
    if (!userId) practiceNotionCache = [];
    let practiceCategories = categories.filter(category =>
        ![AI_PRACTICE_CATEGORY_ID, VERB_PRACTICE_CATEGORY_ID].includes(String(category.id))
    );
    if (options.supabase && (practiceVerbsCache === null || options.refreshVerbs || practiceVerbsUserId !== userId)) {
        try {
            const verbs = [];
            const pageSize = 1000;
            for (let start = 0; ; start += pageSize) {
                const { data, error } = await options.supabase
                    .from("verbs")
                    .select("id, verb, pronunciation, translation, example_base, past_simple, pronunciation_ps, translation_ps, example_ps, past_participle, pronunciation_pp, translation_pp, example_pp")
                    .order("verb")
                    .range(start, start + pageSize - 1);
                if (error) throw error;
                verbs.push(...(data || []));
                if (!data || data.length < pageSize) break;
            }

            practiceVerbsCache = verbs;
            practiceVerbsUserId = userId;
            practiceVerbCategoryCache = createVerbPracticeCategory(verbs);
        } catch (error) {
            console.error("No se pudieron cargar los verbos para practicar:", error);
            showToast(`No se pudieron cargar los verbos guardados para practicar. ${error.message || ""}`, "warning");
        }
    }
    if (practiceVerbsCache) {
        try {
            if (!practiceVerbCategoryCache) {
                practiceVerbCategoryCache = createVerbPracticeCategory(practiceVerbsCache);
            }
            if (practiceVerbCategoryCache) {
                practiceCategories = [...practiceCategories, practiceVerbCategoryCache];
            }
        } catch (error) {
            console.error("No se pudieron preparar las categorías de verbos para practicar:", error);
            showToast(`No se pudieron preparar los verbos para practicar. ${error.message || ""}`, "warning");
        }
    }
    if (options.supabase && options.userId && options.refreshNotion) {
        try {
            const selectedPageIds = getSelectedNotionPageIds(userId);
            practiceNotionCache = [];
            practiceNotionCache = await loadNotionPracticeCategories(options.supabase, selectedPageIds);
            practiceNotionUserId = userId;
        } catch (error) {
            console.error("No se pudo cargar el vocabulario de Notion para practicar:", error);
            showToast(`No se pudo cargar Notion para practicar. Verifica la función Edge de Notion. ${error.message || ""}`, "warning");
        }
    }
    if (practiceNotionCache) {
        const selectedPageIds = new Set(getSelectedNotionPageIds(userId));
        practiceCategories = [
            ...practiceCategories,
            ...practiceNotionCache.filter(category => selectedPageIds.has(
                String(category.id).replace(/^notion-page-/, "")
            ))
        ];
    }
    try {
        const favoritesCategories = createFavoritesPracticeCategory(
            categories,
            practiceVerbsCache || [],
            store.favoriteSet
        );
        practiceCategories = [...practiceCategories, ...favoritesCategories];
    } catch (error) {
        console.error("No se pudo preparar la categoría de Favoritos:", error);
        showToast(`No se pudo preparar la categoría de Favoritos. ${error.message || ""}`, "warning");
    }
    if (options.supabase && options.userId
        && (practiceAIQueriesCache === null || options.refreshAIQueries || practiceAIQueriesUserId !== userId)) {
        try {
            const queries = [];
            const pageSize = 1000;
            for (let start = 0; ; start += pageSize) {
                const { data, error } = await options.supabase
                    .from("user_ai_queries")
                    .select("id, cards")
                    .eq("user_id", options.userId)
                    .order("created_at", { ascending: true })
                    .range(start, start + pageSize - 1);
                if (error) throw error;
                queries.push(...(data || []));
                if (!data || data.length < pageSize) break;
            }

            practiceAIQueriesCache = queries;
            practiceAIQueriesUserId = userId;
        } catch (error) {
            console.error("No se pudieron cargar las tarjetas de consultas IA para practicar:", error);
            showToast(`No se pudieron cargar las tarjetas de tus consultas IA. Verifica supabase/ai_queries.sql. ${error.message || ""}`, "warning");
        }
    }
    if (userId && practiceAIQueriesCache && practiceAIQueriesUserId === userId) {
        try {
            const aiCategory = createAIPracticeCategory(practiceAIQueriesCache);
            if (aiCategory) practiceCategories = [...practiceCategories, aiCategory];
        } catch (error) {
            console.error("No se pudieron preparar las tarjetas de consultas IA para practicar:", error);
            showToast(`No se pudieron preparar las tarjetas de tus consultas IA. ${error.message || ""}`, "warning");
        }
    }
    if (options.supabase && userId
        && (practiceVocabularyCache === null || options.refreshPersonalVocabulary || practiceVocabularyUserId !== userId)) {
        try {
            const { data, error } = await options.supabase
                .from("user_custom_items")
                .select("id, word, pronunciation, spanish, example_en, example_es")
                .eq("user_id", userId)
                .eq("subcategory", "Mi vocabulario")
                .order("created_at", { ascending: false });
            if (error) throw error;
            practiceVocabularyCache = data || [];
            practiceVocabularyUserId = userId;
        } catch (error) {
            console.error("No se pudo cargar tu vocabulario personal para practicar:", error);
            showToast(`No se pudo cargar tu vocabulario personal para practicar. ${error.message || ""}`, "warning");
            practiceVocabularyCache = [];
        }
    }
    if (userId && practiceVocabularyCache && practiceVocabularyUserId === userId) {
        try {
            const vocabularyCategory = createPersonalVocabularyPracticeCategory(practiceVocabularyCache);
            if (vocabularyCategory) {
                const vocabularyIds = new Set(practiceVocabularyCache.map(item => String(item.id)));
                practiceCategories = practiceCategories.map(category => ({
                    ...category,
                    subcategories: (category.subcategories || []).map(subcategory => ({
                        ...subcategory,
                        items: (subcategory.items || []).filter(item =>
                            !vocabularyIds.has(String(item[6] || "").replace(/^custom_/, ""))
                        )
                    }))
                }));
                practiceCategories = [...practiceCategories, vocabularyCategory];
            }
        } catch (error) {
            console.error("No se pudo preparar tu vocabulario personal para practicar:", error);
            showToast(`No se pudo preparar tu vocabulario personal para practicar. ${error.message || ""}`, "warning");
        }
    }
    if (options.supabase && userId
        && (practiceSentencesCache === null || options.refreshSentences || practiceSentencesUserId !== userId)) {
        try {
            const { data, error } = await options.supabase
                .from("my_sentences")
                .select("id, english_text, spanish_translation, created_at")
                .eq("user_id", userId)
                .order("created_at", { ascending: false });
            if (error) throw error;
            practiceSentencesCache = data || [];
            practiceSentencesUserId = userId;
        } catch (error) {
            console.error("No se pudieron cargar tus frases guardadas para practicar:", error);
            showToast(`No se pudieron cargar tus frases de Mi aprendizaje para practicar. ${error.message || ""}`, "warning");
            practiceSentencesCache = [];
        }
    }
    if (userId && practiceSentencesCache && practiceSentencesUserId === userId
        && practiceSentencesCache.length) {
        practiceCategories = [...practiceCategories, {
            id: "personal-sentences",
            title: "Mis frases",
            icon: "💬",
            subcategories: [{
                id: "saved-sentences",
                title: "Frases guardadas",
                items: practiceSentencesCache.map(sentence => [
                    sentence.english_text,
                    "",
                    sentence.spanish_translation || "Recuerda la frase que guardaste.",
                    "",
                    "",
                    `sentence-${sentence.id}`
                ])
            }]
        }];
    }
    if (importedPracticeItems.length) {
        practiceCategories = [...practiceCategories, {
            id: "pasted-practice-table",
            title: "Tabla pegada",
            icon: "📋",
            subcategories: [{
                id: "pasted-table-items",
                title: "Material temporal",
                items: importedPracticeItems.map((item, index) => [
                    item.word, item.pronunciation, item.spanish, item.exampleEn, item.exampleEs,
                    `pasted-table-${index}`
                ])
            }]
        }];
    }

    practiceItems = getPracticeItems(practiceCategories);
    progressSync = options.supabase && options.userId
        ? createPracticeProgressSync(options.supabase, options.userId)
        : null;
    if (progressSync && !options.skipProgressSync) {
        try {
            const localNotionProgress = Object.fromEntries(
                Object.entries(progressByItem).filter(([itemId]) => isTemporaryNotionItem(itemId))
            );
            const persistentProgress = Object.fromEntries(
                Object.entries(progressByItem).filter(([itemId]) => !isTemporaryNotionItem(itemId))
            );
            progressByItem = {
                ...await progressSync.loadAndMerge(persistentProgress),
                ...localNotionProgress
            };
            saveProgress();
        } catch (error) {
            console.error("No se pudo sincronizar el progreso de práctica:", error);
            showToast(`El progreso queda guardado en este dispositivo, pero no se pudo sincronizar con la cuenta. Ejecuta supabase/practice_progress.sql y vuelve a intentarlo. ${error.message || ""}`, "warning");
        }
    }
    if (options.favoritesChanged) {
        currentItem = null;
        isAnswered = false;
        clearFeedback();
    }
    updateCategoryChoices(practiceCategories);
    if (audioCourse) renderAudioCourseState({ status: "idle", total: getSelectedItems().length });
    updateScore();

    if (!initialized) {
        if (window.speechSynthesis && typeof window.SpeechSynthesisUtterance === "function") {
            audioCourse = createPracticeAudioPlayer({
                synthesis: window.speechSynthesis,
                createUtterance: text => new SpeechSynthesisUtterance(text),
                getVoice: getBestVoice,
                storage: window.localStorage,
                storageKey: "practice_audio_course_session_v1",
                onState: renderAudioCourseState
            });
            document.getElementById("practice-audio-course-rate")?.addEventListener("change", event => {
                audioCourse.setRate(event.target.value);
            });
            document.getElementById("practice-audio-course-start")?.addEventListener("click", () => {
                audioCourse.start(getAudioCourseItems(), getAudioSessionScope());
            });
            document.getElementById("practice-audio-course-filter")?.addEventListener("change", event => {
                audioCourse.stop(true);
                audioCourseFilter = event.target.value;
                try {
                    localStorage.setItem(AUDIO_FILTER_STORAGE_KEY, audioCourseFilter);
                } catch (error) {
                    console.warn("No se pudo guardar el filtro de escucha:", error);
                }
                renderAudioCourseState({ status: "idle", total: getAudioCourseItems().length, rate: Number(document.getElementById("practice-audio-course-rate")?.value || 1) });
            });
            document.getElementById("practice-audio-course-pause")?.addEventListener("click", () => audioCourse.pause());
            document.getElementById("practice-audio-course-skip")?.addEventListener("click", () => audioCourse.skip());
            document.getElementById("practice-audio-course-stop")?.addEventListener("click", stopAudioCourse);
            const filterSelect = document.getElementById("practice-audio-course-filter");
            try {
                const savedFilter = localStorage.getItem(AUDIO_FILTER_STORAGE_KEY);
                if (["all", "new", "review"].includes(savedFilter)) {
                    audioCourseFilter = savedFilter;
                    if (filterSelect) filterSelect.value = savedFilter;
                }
            } catch (error) {
                console.warn("No se pudo restaurar el filtro de escucha:", error);
            }
            renderAudioCourseState({ status: "idle", total: getAudioCourseItems().length, rate: 1 });
        } else {
            const status = document.getElementById("practice-audio-course-status");
            const start = document.getElementById("practice-audio-course-start");
            const pause = document.getElementById("practice-audio-course-pause");
            const skip = document.getElementById("practice-audio-course-skip");
            const stop = document.getElementById("practice-audio-course-stop");
            if (status) status.textContent = "La reproducción de voz no está disponible en este navegador.";
            if (start) start.disabled = true;
            if (pause) pause.disabled = true;
            if (skip) skip.disabled = true;
            if (stop) stop.disabled = true;
        }
        document.getElementById("practice-exercise-mode")?.addEventListener("change", event => {
            selectedExerciseType = event.target.value;
        });
        document.getElementById("practice-start")?.addEventListener("click", nextQuestion);
        document.getElementById("practice-next")?.addEventListener("click", nextQuestion);
        document.getElementById("practice-prev")?.addEventListener("click", previousQuestion);
        document.getElementById("practice-table-import")?.addEventListener("click", async () => {
            const input = document.getElementById("practice-table-input");
            const status = document.getElementById("practice-table-status");
            const parsed = parsePracticeTable(input?.value || "");
            if (!parsed.length) {
                if (status) status.textContent = "No encontré filas. Revisa que la primera fila tenga encabezados como Adjetivo, Significado y Ejemplo en inglés.";
                return;
            }
            importedPracticeItems = parsed;
            selectedCategories.add("pasted-practice-table");
            questionHistory = [];
            questionHistoryIndex = -1;
            if (status) status.textContent = `${parsed.length} elementos listos en la categoría temporal “Tabla pegada”.`;
            await initializePractice(practiceSourceCategories, practiceSourceOptions);
        });
        document.getElementById("practice-listen")?.addEventListener("click", () => {
            if (currentItem) playAudioEnhanced(currentItem.word, "en");
        });
        document.getElementById("practice-answer-form")?.addEventListener("submit", submitAnswer);
        initialized = true;
    }

    renderQuestion();
    updatePreviousButton();
}

export { initializePractice };

export function setNotionPracticeCategories(categories) {
    practiceNotionCache = categories;
    practiceNotionUserId = store.currentUser?.id || null;
    categories.forEach(category => selectedCategories.add(String(category.id)));
    saveCategorySelection();
}

window.addEventListener("vocabulary-favorites-changed", () => {
    window.refreshPracticeFavorites?.();
});