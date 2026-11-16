const SETTINGS_KEY = "visual_guide_review_settings_v1";
export const DEFAULT_REVIEW_SETTINGS = Object.freeze({
    newCardLimit: 10,
    reviewLimit: 100,
    learningSteps: "1,10",
    autoplayAudio: true,
    cardDirection: "both"
});

function browserStorage() {
    try {
        return typeof localStorage !== "undefined" ? localStorage : null;
    } catch {
        return null;
    }
}

function normalizeInt(value, fallback, min, max) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.round(parsed))) : fallback;
}

export function normalizeLearningSteps(value) {
    const raw = String(value || "").trim();
    if (!raw) return [...DEFAULT_REVIEW_SETTINGS.learningSteps.split(",").map(Number)];
    const steps = raw
        .split(/[^0-9]+/)
        .map(Number)
        .filter(step => Number.isFinite(step) && step > 0 && step <= 1440)
        .slice(0, 8);
    return steps.length ? steps : [1, 10];
}

export function normalizeReviewSettings(settings = {}) {
    const record = settings && typeof settings === "object" ? settings : {};
    const direction = String(record.cardDirection || DEFAULT_REVIEW_SETTINGS.cardDirection).toLowerCase();
    return {
        newCardLimit: normalizeInt(record.newCardLimit, DEFAULT_REVIEW_SETTINGS.newCardLimit, 1, 100),
        reviewLimit: normalizeInt(record.reviewLimit, DEFAULT_REVIEW_SETTINGS.reviewLimit, 1, 1000),
        learningSteps: String(record.learningSteps || DEFAULT_REVIEW_SETTINGS.learningSteps).trim() || DEFAULT_REVIEW_SETTINGS.learningSteps,
        autoplayAudio: record.autoplayAudio !== false && record.autoplayAudio !== "false",
        cardDirection: ["both", "forward", "reverse"].includes(direction) ? direction : "both"
    };
}

export function loadReviewSettings() {
    const storage = browserStorage();
    if (!storage) return normalizeReviewSettings();
    try {
        return normalizeReviewSettings(JSON.parse(storage.getItem(SETTINGS_KEY) || "{}"));
    } catch {
        return normalizeReviewSettings();
    }
}

export function saveReviewSettings(settings) {
    const storage = browserStorage();
    const normalized = normalizeReviewSettings(settings);
    storage?.setItem(SETTINGS_KEY, JSON.stringify(normalized));
    return normalized;
}

export function formatReviewSettings(settings) {
    const normalized = normalizeReviewSettings(settings);
    return `${normalized.newCardLimit} nuevas · ${normalized.reviewLimit} repasos · ${normalized.learningSteps} min`;
}
