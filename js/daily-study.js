/* Plan diario de estudio: tres retos cortos al día (principal, repaso y extra),
 * distintos entre sí y distintos a los de ayer. Cada uno programa su próxima
 * aparición con el calendario SM-2 de las frases. Las consultas de IA tienen
 * tarjeta propia y las nuevas entran solas. Todo se guarda en este dispositivo. */

import { scheduleReview } from "./sentences/scheduler.js";

/* Duraciones cortas, en la línea de Duolingo (5-10 min) y Busuu (3-5 min por
 * lección): un reto principal de 5-6 min y un repaso de 4-5 min. */
export const STUDY_ACTIVITIES = Object.freeze([
    { id: "practice", label: "Ejercicios", icon: "✍️", minutes: 5, section: "practice", pane: "general" },
    { id: "listening", label: "Escucha continua", icon: "🎧", minutes: 6, section: "practice", pane: "audio" },
    { id: "shadowing", label: "Shadowing", icon: "🎤", minutes: 6, section: "practice", pane: "shadowing" },
    { id: "vocabulary", label: "Mi vocabulario", icon: "📚", minutes: 5, section: "mysentences", screen: "vocabulary" },
    { id: "sentences", label: "Frases · Repaso", icon: "💬", minutes: 4, section: "mysentences", screen: "review" },
    { id: "ai", label: "Consultas IA", icon: "🤖", minutes: 4, section: "browser-ai" }
]);

export const MAIN_SLOT = "main";
export const REVIEW_SLOT = "review";
export const EXTRA_SLOT = "extra";
export const DAILY_SLOTS = Object.freeze([MAIN_SLOT, REVIEW_SLOT, EXTRA_SLOT]);
export const MAIN_ACTIVITY_IDS = Object.freeze(["practice", "listening", "shadowing", "vocabulary"]);
export const REVIEW_ACTIVITY_IDS = Object.freeze(["sentences", "vocabulary", "ai"]);
export const EXTRA_ACTIVITY_IDS = Object.freeze(["sentences", "vocabulary", "ai"]);
export const MIN_REAL_INTERACTIONS = 3;

const STATE_VERSION = 2;
const MAX_HISTORY = 180;
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

/* Tiempo real del día: solo los tres retos asignados hoy, no el total del catálogo. */
export function getDailyTotalMinutes(missions = {}) {
    return DAILY_SLOTS.reduce((total, slot) =>
        total + (missions[slot] ? getActivityMinutes(missions[slot].activityId) : 0), 0);
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

function randomFor(dateKey, slot, previousId = "") {
    return seededRandom(hashString(`${dateKey}|${slot}|${previousId}`));
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
    excludeId = "",
    excludeIds = [],
    allowedIds = [],
    dateKey = "",
    now = new Date(),
    random
} = {}) {
    const key = dateKey || getLocalDateKey(now);
    const nextRandom = typeof random === "function" ? random : createDailyRandom(key, previousId);
    const universe = allowedIds.length
        ? STUDY_ACTIVITIES.filter(activity => allowedIds.includes(activity.id))
        : STUDY_ACTIVITIES;
    let pool = universe.map(activity => activity.id).filter(id => isActivityDue(cards[id], now));
    if (!pool.length) pool = universe.map(activity => activity.id);
    const withoutPrevious = pool.filter(id =>
        id !== previousId && id !== excludeId && !excludeIds.includes(id));
    if (withoutPrevious.length) pool = withoutPrevious;
    const index = Math.min(pool.length - 1, Math.floor(nextRandom() * pool.length));
    return pool[index];
}

function cardKeyForMission(mission) {
    return mission.activityId === "ai" && mission.targetId
        ? `ai:${mission.targetId}`
        : mission.activityId;
}

/* Igual que la actividad diaria, pero aplicado a los temas guardados de IA:
 * cada consulta tiene su tarjeta de repaso y las nuevas entran solas. */
export function chooseDailyTarget({ targets = [], cards = {}, previousId = "", excludeId = "", dateKey = "", now = new Date(), random } = {}) {
    if (!targets.length) return null;
    const key = dateKey || getLocalDateKey(now);
    const nextRandom = typeof random === "function"
        ? random
        : createDailyRandom(`${key}|target|${previousId}`);
    let pool = targets.filter(target => isActivityDue(cards[`ai:${target.id}`], now));
    if (!pool.length) pool = [...targets];
    const withoutPrevious = pool.filter(target =>
        String(target.id) !== String(previousId) && String(target.id) !== String(excludeId));
    if (withoutPrevious.length) pool = withoutPrevious;
    return pool[Math.min(pool.length - 1, Math.floor(nextRandom() * pool.length))];
}

function slotOf(entry) {
    return DAILY_SLOTS.includes(entry?.slot) ? entry.slot : MAIN_SLOT;
}

function makeMission(date, slot, activityId, target = null) {
    return {
        date,
        slot,
        activityId,
        commitmentAt: null,
        completedAt: null,
        grade: null,
        recall: "",
        interactions: 0,
        targetId: target ? String(target.id) : "",
        targetLabel: target ? String(target.label || "") : ""
    };
}

export function normalizeDailyState(raw) {
    const history = Array.isArray(raw?.history)
        ? raw.history
            .filter(entry => entry && typeof entry.date === "string" && getActivity(entry.activityId))
            .map(entry => ({
                date: entry.date,
                slot: slotOf(entry),
                activityId: entry.activityId,
                commitmentAt: entry.commitmentAt || null,
                completedAt: entry.completedAt || null,
                grade: entry.grade || null,
                recall: entry.recall || "",
                interactions: Math.max(0, Number(entry.interactions) || 0),
                targetId: entry.targetId || "",
                targetLabel: entry.targetLabel || ""
            }))
            .slice(-MAX_HISTORY)
        : [];
    const cards = {};
    for (const activity of STUDY_ACTIVITIES) {
        if (raw?.cards?.[activity.id]) cards[activity.id] = normalizeCard(raw.cards[activity.id]);
    }
    for (const [key, card] of Object.entries(raw?.cards || {})) {
        if (key.startsWith("ai:")) cards[key] = normalizeCard(card);
    }
    const time = typeof raw?.notifications?.time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(raw.notifications.time)
        ? raw.notifications.time
        : "20:00";
    return {
        version: STATE_VERSION,
        cards,
        history,
        introShownDate: typeof raw?.introShownDate === "string" ? raw.introShownDate : "",
        notifications: {
            enabled: Boolean(raw?.notifications?.enabled),
            time
        }
    };
}

export function findMission(state, dateKey, slot = MAIN_SLOT) {
    return normalizeDailyState(state).history.find(entry =>
        entry.date === dateKey && slotOf(entry) === slot) || null;
}

export function findDailyMissions(state, dateKey) {
    const normalized = normalizeDailyState(state);
    const result = {};
    for (const slot of DAILY_SLOTS) {
        result[slot] = normalized.history.find(entry =>
            entry.date === dateKey && slotOf(entry) === slot) || null;
    }
    return result;
}

function replaceMission(state, mission) {
    return {
        ...state,
        history: [
            ...state.history.filter(entry =>
                !(entry.date === mission.date && slotOf(entry) === slotOf(mission))),
            { ...mission, slot: slotOf(mission) }
        ].slice(-MAX_HISTORY)
    };
}

function previousDate(state, dateKey) {
    return [...new Set(state.history.filter(entry => entry.date < dateKey).map(entry => entry.date))]
        .sort((left, right) => left.localeCompare(right))
        .at(-1) || "";
}

function previousAiTarget(state, dateKey) {
    return [...state.history]
        .filter(entry => entry.date < dateKey && entry.activityId === "ai" && entry.targetId)
        .sort((left, right) => left.date.localeCompare(right.date))
        .at(-1) || null;
}

export function ensureDailyMissions(state, { dateKey = "", now = new Date(), random, targets = [] } = {}) {
    const normalized = normalizeDailyState(state);
    const key = dateKey || getLocalDateKey(now);
    const previous = previousDate(normalized, key);
    let result = normalized;
    let created = false;

    if (!findMission(result, key, MAIN_SLOT)) {
        const prevMain = findMission(result, previous, MAIN_SLOT);
        const activityId = chooseDailyActivity({
            cards: result.cards,
            previousId: prevMain?.activityId || "",
            allowedIds: MAIN_ACTIVITY_IDS,
            dateKey: key,
            now,
            random: typeof random === "function" ? random : randomFor(key, MAIN_SLOT, prevMain?.activityId || "")
        });
        result = replaceMission(result, makeMission(key, MAIN_SLOT, activityId));
        created = true;
    }

    if (!findMission(result, key, REVIEW_SLOT)) {
        const prevReview = findMission(result, previous, REVIEW_SLOT);
        const mainId = findMission(result, key, MAIN_SLOT)?.activityId || "";
        const activityId = chooseDailyActivity({
            cards: result.cards,
            previousId: prevReview?.activityId || "",
            excludeId: mainId,
            allowedIds: REVIEW_ACTIVITY_IDS,
            dateKey: `${key}|review`,
            now,
            random: randomFor(key, REVIEW_SLOT, prevReview?.activityId || "")
        });
        let mission = makeMission(key, REVIEW_SLOT, activityId);
        if (activityId === "ai" && targets.length) {
            const prevTarget = previousAiTarget(result, key);
            const target = chooseDailyTarget({
                targets,
                cards: result.cards,
                previousId: prevTarget?.targetId || "",
                dateKey: key,
                now,
                random: randomFor(key, "ai-target", prevTarget?.targetId || "")
            });
            if (target) mission = { ...mission, targetId: String(target.id), targetLabel: target.label };
        }
        result = replaceMission(result, mission);
        created = true;
    }

    if (!findMission(result, key, EXTRA_SLOT)) {
        const prevExtra = findMission(result, previous, EXTRA_SLOT);
        const mainId = findMission(result, key, MAIN_SLOT)?.activityId || "";
        const reviewId = findMission(result, key, REVIEW_SLOT)?.activityId || "";
        const freeIds = EXTRA_ACTIVITY_IDS.filter(id => id !== mainId && id !== reviewId);
        const activityId = chooseDailyActivity({
            cards: result.cards,
            previousId: prevExtra?.activityId || "",
            allowedIds: freeIds.length ? freeIds : EXTRA_ACTIVITY_IDS,
            dateKey: `${key}|extra`,
            now,
            random: randomFor(key, EXTRA_SLOT, prevExtra?.activityId || "")
        });
        let mission = makeMission(key, EXTRA_SLOT, activityId);
        if (activityId === "ai" && targets.length) {
            const prevTarget = previousAiTarget(result, key);
            const reviewTargetId = findMission(result, key, REVIEW_SLOT)?.targetId || "";
            const target = chooseDailyTarget({
                targets,
                cards: result.cards,
                previousId: prevTarget?.targetId || "",
                excludeId: reviewTargetId,
                dateKey: key,
                now,
                random: randomFor(key, "ai-extra-target", prevTarget?.targetId || "")
            });
            if (target) mission = { ...mission, targetId: String(target.id), targetLabel: target.label };
        }
        result = replaceMission(result, mission);
        created = true;
    }

    return {
        state: result,
        missions: findDailyMissions(result, key),
        created
    };
}

/* Cuando cargan las consultas IA (o se añade una nueva) se elige tema para el
 * reto de repaso de hoy si todavía no se ha empezado. */
export function refreshMissionTarget(state, dateKey, targets = [], now = new Date(), slot = REVIEW_SLOT) {
    const normalized = normalizeDailyState(state);
    const mission = findMission(normalized, dateKey, slot);
    if (!mission || mission.activityId !== "ai" || mission.commitmentAt || !targets.length) {
        return { state: normalized, mission: mission ? { ...mission } : null, changed: false };
    }
    if (targets.some(target => String(target.id) === mission.targetId)) {
        return { state: normalized, mission: { ...mission }, changed: false };
    }
    const previous = previousAiTarget(normalized, dateKey);
    const target = chooseDailyTarget({
        targets,
        cards: normalized.cards,
        previousId: previous?.targetId || "",
        dateKey,
        now,
        random: randomFor(dateKey, "ai-target-refresh", previous?.targetId || "")
    });
    if (!target) return { state: normalized, mission: { ...mission }, changed: false };
    const updated = { ...mission, targetId: String(target.id), targetLabel: target.label };
    return { state: replaceMission(normalized, updated), mission: { ...updated }, changed: true };
}

export function recordCommitment(state, dateKey, slot, value, now = new Date()) {
    const normalized = normalizeDailyState(state);
    const mission = findMission(normalized, dateKey, slot);
    if (!mission || mission.commitmentAt || !isValidCommitment(value)) {
        return { state: normalized, mission: mission ? { ...mission } : null, valid: false };
    }
    const updated = { ...mission, commitmentAt: now.toISOString() };
    return { state: replaceMission(normalized, updated), mission: { ...updated }, valid: true };
}

/* Cada interacción real dentro de la sección cuenta. Se guarda para que no se
 * pueda puntuar un reto sin haber tocado nada en la actividad. */
export function recordInteraction(state, dateKey, slot, now = new Date()) {
    const normalized = normalizeDailyState(state);
    const mission = findMission(normalized, dateKey, slot);
    if (!mission || !mission.commitmentAt || mission.completedAt) {
        return { state: normalized, mission: mission ? { ...mission } : null, counted: false };
    }
    const updated = { ...mission, interactions: Math.min(999, mission.interactions + 1) };
    return { state: replaceMission(normalized, updated), mission: { ...updated }, counted: true };
}

export function recordCompletion(state, dateKey, slot, { grade, recall } = {}, now = new Date()) {
    const normalized = normalizeDailyState(state);
    const mission = findMission(normalized, dateKey, slot);
    if (!mission || !mission.commitmentAt || mission.completedAt ||
        mission.interactions < MIN_REAL_INTERACTIONS) {
        return { state: normalized, mission: mission ? { ...mission } : null, recorded: false, card: null };
    }
    // Esta misión es diaria: el repaso más pronto posible es mañana, no en 1 minuto.
    const card = scheduleReview(
        normalized.cards[cardKeyForMission(mission)] || { memoryState: "new" },
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
    const key = cardKeyForMission(mission);
    return {
        state: {
            ...replaceMission(normalized, updated),
            cards: { ...normalized.cards, [key]: normalizeCard(card) }
        },
        mission: { ...updated },
        recorded: true,
        card: normalizeCard(card),
        cardKey: key
    };
}

export function resetMission(state, dateKey, slot) {
    const normalized = normalizeDailyState(state);
    const mission = findMission(normalized, dateKey, slot);
    if (!mission) return { state: normalized, mission: null, reset: false };
    const updated = { ...mission, commitmentAt: null, completedAt: null, grade: null, recall: "", interactions: 0 };
    return { state: replaceMission(normalized, updated), mission: { ...updated }, reset: true };
}

/* El modal del plan se abre solo una vez al día, aunque se recargue la página. */
export function markDailyIntroShown(state, dateKey) {
    const normalized = normalizeDailyState(state);
    if (normalized.introShownDate === dateKey) return normalized;
    return { ...normalized, introShownDate: String(dateKey || "") };
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
        console.warn("No se pudo leer el plan diario:", error);
        return normalizeDailyState(null);
    }
}

export function saveDailyState(state, { storage = globalThis.localStorage, userId = "" } = {}) {
    try {
        storage?.setItem(getStorageKey(userId), JSON.stringify(normalizeDailyState(state)));
        return true;
    } catch (error) {
        console.warn("No se pudo guardar el plan diario:", error);
        return false;
    }
}
