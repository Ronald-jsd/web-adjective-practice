import { playAudioEnhanced } from "./audio.js";
import { createPracticeProgressSync } from "./practice-progress.js";
import { showToast } from "./cache.js";

const PROGRESS_STORAGE_KEY = "vocabulary_practice_progress_v1";
const DAY_IN_MS = 24 * 60 * 60 * 1000;

let practiceItems = [];
let selectedCategories = new Set();
let currentItem = null;
let selectedExerciseType = "mixed";
let currentExerciseType = "listening";
let correctAnswers = 0;
let answeredQuestions = 0;
let isAnswered = false;
let initialized = false;
let categoriesInitialized = false;
let forgottenQueue = [];
let questionsSinceForgotten = 0;
let progressByItem = loadProgress();
let progressSync = null;
let progressWriteQueue = Promise.resolve();

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

function normalizeAnswer(value) {
    return value.trim().toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function chooseExerciseType() {
    if (selectedExerciseType !== "mixed") return selectedExerciseType;
    const exerciseTypes = ["listening", "translation", "choice", "fill"];
    return exerciseTypes[Math.floor(Math.random() * exerciseTypes.length)];
}

function getPromptText() {
    if (currentExerciseType === "listening") return "Escucha y escribe la palabra en inglés";
    if (currentExerciseType === "translation") return `Traduce: ${currentItem.spanish}`;
    if (currentExerciseType === "choice") return `¿Qué palabra corresponde a “${currentItem.spanish}”?`;

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

    const distractors = getSelectedItems()
        .filter(item => normalizeAnswer(item.word) !== normalizeAnswer(currentItem.word))
        .filter((item, index, items) => items.findIndex(candidate => normalizeAnswer(candidate.word) === normalizeAnswer(item.word)) === index);
    for (let index = distractors.length - 1; index > 0; index -= 1) {
        const randomIndex = Math.floor(Math.random() * (index + 1));
        [distractors[index], distractors[randomIndex]] = [distractors[randomIndex], distractors[index]];
    }

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
        const showMeaning = currentExerciseType === "fill" && currentItem.spanish;
        meaning.textContent = showMeaning ? `Significado de la palabra: ${currentItem.spanish}` : "";
        meaning.classList.toggle("hidden", !showMeaning);
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
    })).filter(category => category.itemCount > 0);

    const availableIds = new Set(available.map(category => String(category.id)));
    selectedCategories = new Set([...selectedCategories].filter(id => availableIds.has(id)));
    if (!categoriesInitialized) {
        selectedCategories = new Set(availableIds);
        categoriesInitialized = true;
    }
    list.replaceChildren();

    const masterLabel = document.createElement("label");
    masterLabel.className = "practice-category-option practice-category-all";
    const master = document.createElement("input");
    master.type = "checkbox";
    master.checked = selectedCategories.size === availableIds.size && availableIds.size > 0;
    master.indeterminate = selectedCategories.size > 0 && selectedCategories.size < availableIds.size;
    master.addEventListener("change", () => {
        selectedCategories = master.checked ? new Set(availableIds) : new Set();
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
    currentItem = null;
    isAnswered = false;
    forgottenQueue = forgottenQueue.filter(id => getSelectedItems().some(item => item.id === id));
    clearFeedback();
    document.getElementById("practice-start")?.classList.remove("hidden");
    document.getElementById("practice-next")?.classList.add("hidden");
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
        const reviewedDue = candidates
            .filter(item => getItemProgress(item).attempts > 0 && getItemProgress(item).dueAt <= now)
            .sort((first, second) => getItemProgress(first).dueAt - getItemProgress(second).dueAt);
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
    clearFeedback();
    const answer = document.getElementById("practice-answer");
    if (answer) answer.value = "";
    document.getElementById("practice-start")?.classList.add("hidden");
    document.getElementById("practice-next")?.classList.remove("hidden");
    if (currentExerciseType === "choice") renderChoiceOptions();
    else document.getElementById("practice-choice-options")?.replaceChildren();
    renderQuestion();
    if (currentExerciseType !== "choice") answer?.focus();
}

function recordAnswer(submittedAnswer, selectedButton = null) {
    if (!currentItem || isAnswered) return;

    const isCorrect = normalizeAnswer(submittedAnswer) === normalizeAnswer(currentItem.word);
    isAnswered = true;
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
    if (progressSync) {
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
    practiceItems = getPracticeItems(categories);
    progressSync = options.supabase && options.userId
        ? createPracticeProgressSync(options.supabase, options.userId)
        : null;
    if (progressSync) {
        try {
            progressByItem = await progressSync.loadAndMerge(progressByItem);
            saveProgress();
        } catch (error) {
            console.error("No se pudo sincronizar el progreso de práctica:", error);
            showToast(`El progreso queda guardado en este dispositivo, pero no se pudo sincronizar con la cuenta. Ejecuta supabase/practice_progress.sql y vuelve a intentarlo. ${error.message || ""}`, "warning");
        }
    }
    updateCategoryChoices(categories);
    updateScore();

    if (!initialized) {
        document.getElementById("practice-exercise-mode")?.addEventListener("change", event => {
            selectedExerciseType = event.target.value;
        });
        document.getElementById("practice-start")?.addEventListener("click", nextQuestion);
        document.getElementById("practice-next")?.addEventListener("click", nextQuestion);
        document.getElementById("practice-listen")?.addEventListener("click", () => {
            if (currentItem) playAudioEnhanced(currentItem.word, "en");
        });
        document.getElementById("practice-answer-form")?.addEventListener("submit", submitAnswer);
        initialized = true;
    }

    renderQuestion();
}

export { initializePractice };