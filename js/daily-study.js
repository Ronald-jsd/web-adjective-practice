/* Misión diaria de estudio: elige una actividad por día, alterna para no
 * repetir la del día anterior y programa el próximo repaso con el mismo
 * calendario SM-2 que ya usan las frases. Todo se guarda en este dispositivo. */

import { scheduleReview } from "./sentences/scheduler.js";

export const STUDY_ACTIVITIES = Object.freeze([
    { id: "practice", label: "Ejercicios", icon: "✍️", minutes: 10, section: "practice", pane: "general" },
    { id: "listening", label: "Escucha continua", icon: "🎧", minutes: 15, section: "practice", pane: "audio" },
    { id: "shadowing", label: "Shadowing", icon: "🎤", minutes: 15, section: "practice", pane: "shadowing" },
    { id: "vocabulary", label: "Mi vocabulario", icon: "📚", minutes: 10, section: "mysentences", screen: "vocabulary" },
    { id: "sentences", label: "Frases · Repaso", icon: "💬", minutes: 10, section: "mysentences", screen: "review" },
    { id: "ai", label: "Consultas IA", icon: "🤖", minutes: 10, section: "browser-ai" }
]);

const STATE_VERSION = 1;
const MAX_HISTORY = 90;
const STORAGE_PREFIX = "daily_study_v1";

export function getActivity(activityId) {
    return STUDY_ACTIVITIES.find(activity => activity.id === activityId) || null;
}

export function getActivityMinutes(activityId) {
    return getActivity(activityId)?.minutes || 10;
}

export function getTotalPlanMinutes() {
    return STUDY_ACTIVITIES.reduce((total, activity) => total + getActivityMinutes(activity.id), 0);
}

export function getLocalDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

export function normalizeCommitment(value) {
    return String(value || "")
        .toLocaleLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

export function isValidCommitment(value) {
    const text = normalizeCommitment(value);
    return /\bestudiare\b/.test(text) || /\bvoy a estudiar\b/.test(text);
}

function hashString(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function seededRandom(seed) {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6D2B79F5) >>> 0;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
}

export function createDailyRandom(dateKey, previousId = "") {
    return seededRandom(hashString(`${dateKey}|${previousId}`));
}

function normalizeCard(raw) {
    const rawState = String(raw?.memoryState || "").toLowerCase();
    const memoryState = ["learning", "review", "relearning"].includes(rawState) ? rawState : "new";
    const nextReviewAt = raw?.nextReviewAt && Number.isFinite(new Date(raw.nextReviewAt).getTime())
        ? new Date(raw.nextReviewAt).toISOString()
        : null;
    return {
        memoryState,
        intervalDays: Number(raw?.intervalDays) || 0,
        easeFactor: Number(raw?.easeFactor) || 2.5,
        repetitions: Number(raw?.repetitions) || 0,
        lapses: Number(raw?.lapses) || 0,
        learningStep: Number(raw?.learningStep) || 0,
        nextReviewAt,
        lastReviewedAt: raw?.lastReviewedAt || null,
        lastGrade: raw?.lastGrade || null
    };
}

function isActivityDue(card, now) {
    if (!card || card.memoryState === "new" || !card.nextReviewAt) return true;
    return new Date(card.nextReviewAt).getTime() <= now.getTime();
}

export function chooseDailyActivity({
    cards = {},
    previousId = "",
    dateKey = "",
    now = new Date(),
    random
} = {}) {
    const key = dateKey || getLocalDateKey(now);
    const nextRandom = typeof random === "function" ? random : createDailyRandom(key, previousId);
    let pool = STUDY_ACTIVITIES
        .map(activity => activity.id)
        .filter(id => isActivityDue(cards[id], now));
    if (!pool.length) pool = STUDY_ACTIVITIES.map(activity => activity.id);
    const withoutYesterday = pool.filter(id => id !== previousId);
    if (withoutYesterday.length) pool = withoutYesterday;
    const index = Math.min(pool.length - 1, Math.floor(nextRandom() * pool.length));
    return pool[index];
}

export function normalizeDailyState(raw) {
    const history = Array.isArray(raw?.history)
        ? raw.history.filter(entry => entry && typeof entry.date === "string" && getActivity(entry.activityId))
            .map(entry => ({
                date: entry.date,
                activityId: entry.activityId,
                commitmentAt: entry.commitmentAt || null,
                completedAt: entry.completedAt || null,
                grade: entry.grade || null,
                recall: entry.recall || ""
            }))
            .slice(-MAX_HISTORY)
        : [];
    const cards = {};
    for (const activity of STUDY_ACTIVITIES) {
        if (raw?.cards?.[activity.id]) cards[activity.id] = normalizeCard(raw.cards[activity.id]);
    }
    const time = typeof raw?.notifications?.time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(raw.notifications.time)
        ? raw.notifications.time
        : "20:00";
    return {
        version: STATE_VERSION,
        cards,
        history,
        notifications: {
            enabled: Boolean(raw?.notifications?.enabled),
            time
        }
    };
}

export function findMission(state, dateKey) {
    return normalizeDailyState(state).history.find(entry => entry.date === dateKey) || null;
}

function replaceMission(state, mission) {
    return {
        ...state,
        history: [...state.history.filter(entry => entry.date !== mission.date), mission].slice(-MAX_HISTORY)
    };
}

export function ensureDailyMission(state, { dateKey = "", now = new Date(), random } = {}) {
    const normalized = normalizeDailyState(state);
    const key = dateKey || getLocalDateKey(now);
    const existing = normalized.history.find(entry => entry.date === key);
    if (existing) return { state: normalized, mission: { ...existing }, created: false };
    const previous = [...normalized.history]
        .filter(entry => entry.date < key)
        .sort((left, right) => left.date.localeCompare(right.date))
        .at(-1);
    const activityId = chooseDailyActivity({
        cards: normalized.cards,
        previousId: previous?.activityId || "",
        dateKey: key,
        now,
        random
    });
    const mission = { date: key, activityId, commitmentAt: null, completedAt: null, grade: null, recall: "" };
    return {
        state: { ...normalized, history: [...normalized.history, mission].slice(-MAX_HISTORY) },
        mission: { ...mission },
        created: true
    };
}

export function recordCommitment(state, dateKey, value, now = new Date()) {
    const normalized = normalizeDailyState(state);
    const mission = normalized.history.find(entry => entry.date === dateKey);
    if (!mission || mission.commitmentAt || !isValidCommitment(value)) {
        return { state: normalized, mission: mission ? { ...mission } : null, valid: false };
    }
    const updated = { ...mission, commitmentAt: now.toISOString() };
    return { state: replaceMission(normalized, updated), mission: { ...updated }, valid: true };
}

export function recordCompletion(state, dateKey, { grade, recall } = {}, now = new Date()) {
    const normalized = normalizeDailyState(state);
    const mission = normalized.history.find(entry => entry.date === dateKey);
    if (!mission || !mission.commitmentAt || mission.completedAt || String(recall || "").trim().length < 2) {
        return { state: normalized, mission: mission ? { ...mission } : null, recorded: false, card: null };
    }
    // Esta misión es diaria: el repaso más pronto posible es mañana, no en 1 minuto.
    const card = scheduleReview(
        normalized.cards[mission.activityId] || { memoryState: "new" },
        grade,
        now,
        { learningSteps: [1440] }
    );
    const updated = {
        ...mission,
        completedAt: now.toISOString(),
        grade: card.lastGrade || String(grade || "again").toLowerCase(),
        recall: String(recall).trim()
    };
    return {
        state: {
            ...replaceMission(normalized, updated),
            cards: { ...normalized.cards, [mission.activityId]: normalizeCard(card) }
        },
        mission: { ...updated },
        recorded: true,
        card: normalizeCard(card)
    };
}

export function resetMission(state, dateKey) {
    const normalized = normalizeDailyState(state);
    const mission = normalized.history.find(entry => entry.date === dateKey);
    if (!mission) return { state: normalized, mission: null, reset: false };
    const updated = {
        ...mission,
        commitmentAt: null,
        completedAt: null,
        grade: null,
        recall: ""
    };
    return { state: replaceMission(normalized, updated), mission: { ...updated }, reset: true };
}

export function saveReminderSettings(state, { enabled = false, time = "20:00" } = {}) {
    const normalized = normalizeDailyState(state);
    const safeTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : normalized.notifications.time;
    return {
        ...normalized,
        notifications: { enabled: Boolean(enabled), time: safeTime }
    };
}

export function getStorageKey(userId) {
    return `${STORAGE_PREFIX}:${userId || "device"}`;
}

export function loadDailyState({ storage = globalThis.localStorage, userId = "" } = {}) {
    try {
        const raw = storage?.getItem(getStorageKey(userId));
        return normalizeDailyState(raw ? JSON.parse(raw) : null);
    } catch (error) {
        console.warn("No se pudo leer la misión diaria:", error);
        return normalizeDailyState(null);
    }
}

export function saveDailyState(state, { storage = globalThis.localStorage, userId = "" } = {}) {
    try {
        storage?.setItem(getStorageKey(userId), JSON.stringify(normalizeDailyState(state)));
        return true;
    } catch (error) {
        console.warn("No se pudo guardar la misión diaria:", error);
        return false;
    }
}
