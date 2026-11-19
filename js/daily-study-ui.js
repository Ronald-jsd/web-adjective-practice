/* Plan diario de estudio: muestra las 6 actividades con su tiempo, señala la
 * que toca hoy, la abre con una cuenta atrás y pide un recuerdo activo antes de
 * programar el siguiente repaso. No modifica ninguna pantalla existente. */

import { showToast } from "./cache.js";
import { formatInterval, isDue } from "./sentences/scheduler.js";
import {
    STUDY_ACTIVITIES,
    getActivity,
    getActivityMinutes,
    getTotalPlanMinutes,
    loadDailyState,
    saveDailyState,
    ensureDailyMission,
    recordCommitment,
    recordCompletion,
    resetMission,
    saveReminderSettings,
    findMission,
    getLocalDateKey
} from "./daily-study.js";

const STYLE_ID = "daily-study-styles";
const OVERLAY_ID = "daily-study-overlay";
const BADGE_ID = "daily-study-badge";

let state = null;
let mission = null;
let storage = null;
let userId = "";
let navigate = () => {};
let overlay = null;
let badge = null;
let reminderTimer = null;
let sessionTimer = null;
let sessionDeadline = 0;
let sessionActivity = null;
let api = null;

function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
        .ds-overlay { position: fixed; inset: 0; z-index: 10000; display: flex; align-items: center;
            justify-content: center; padding: 18px; background: rgba(15,23,42,.55); }
        .ds-overlay.hidden, .ds-badge.hidden { display: none !important; }
        .ds-card { position: relative; width: min(100%, 440px); max-height: 92vh; overflow-y: auto;
            background: #fff; border-radius: 20px; padding: 24px; box-shadow: 0 18px 60px rgba(15,23,42,.28);
            font-family: Inter, system-ui, sans-serif; color: #0f172a; }
        .ds-close { position: absolute; top: 12px; right: 12px; border: 0; background: transparent;
            font-size: 20px; cursor: pointer; color: #64748b; }
        .ds-eyebrow { margin: 0 0 6px; font-size: 11px; font-weight: 700; letter-spacing: .12em; color: #4f46e5; }
        .ds-card h2 { margin: 0 0 8px; font-size: 22px; line-height: 1.25; }
        .ds-subtitle { margin: 0 0 18px; font-size: 14px; color: #475569; }
        .ds-plan { margin: 0 0 18px; border: 1px solid #e0e7ff; border-radius: 12px; overflow: hidden; }
        .ds-plan-head { padding: 9px 12px; background: #eef2ff; font-size: 11px; font-weight: 800;
            letter-spacing: .08em; color: #3730a3; }
        .ds-plan-item { display: flex; align-items: center; gap: 10px; padding: 9px 12px;
            border-top: 1px solid #eef2ff; }
        .ds-plan-item.current { background: #fffbeb; box-shadow: inset 3px 0 0 #f59e0b; }
        .ds-plan-icon { font-size: 17px; }
        .ds-plan-info { flex: 1; min-width: 0; }
        .ds-plan-name { font-size: 13px; font-weight: 700; }
        .ds-plan-status { font-size: 11px; color: #64748b; }
        .ds-plan-item.current .ds-plan-status { color: #b45309; font-weight: 700; }
        .ds-plan-minutes { font-size: 12px; font-weight: 800; color: #4338ca; white-space: nowrap; }
        .ds-step label { display: block; margin-bottom: 7px; font-size: 13px; font-weight: 600; }
        .ds-step input { width: 100%; box-sizing: border-box; padding: 11px 12px; border: 1px solid #cbd5e1;
            border-radius: 10px; font: inherit; font-size: 14px; }
        .ds-error { margin: 8px 0 0; font-size: 12px; color: #b91c1c; }
        .ds-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
        .ds-primary { border: 0; border-radius: 10px; padding: 11px 16px; background: #4f46e5;
            color: #fff; font: inherit; font-size: 14px; font-weight: 700; cursor: pointer; }
        .ds-primary:disabled { opacity: .45; cursor: not-allowed; }
        .ds-step .ds-primary { margin-top: 12px; }
        .ds-grade { border: 1px solid #c7d2fe; border-radius: 10px; padding: 10px 13px; background: #eef2ff;
            color: #3730a3; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
        .ds-grade[data-grade="again"] { border-color: #fecaca; background: #fef2f2; color: #b91c1c; }
        .ds-grade[data-grade="easy"] { border-color: #bbf7d0; background: #f0fdf4; color: #15803d; }
        .ds-grades { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 12px; }
        .ds-grades button:disabled { opacity: .45; cursor: not-allowed; }
        .ds-footer { margin-top: 20px; padding-top: 14px; border-top: 1px solid #e2e8f0;
            display: flex; flex-wrap: wrap; align-items: center; gap: 10px; justify-content: space-between; }
        .ds-reminder { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #475569; }
        .ds-reminder input[type="time"] { width: 90px; padding: 5px; border: 1px solid #cbd5e1; border-radius: 8px; font: inherit; }
        .ds-link { border: 0; background: transparent; color: #4f46e5; font: inherit; font-size: 13px; cursor: pointer; }
        .ds-badge { position: fixed; right: 16px; bottom: 16px; z-index: 999; border: 0; border-radius: 999px;
            padding: 10px 15px; background: #4338ca; color: #fff; font: inherit; font-size: 13px;
            font-weight: 700; box-shadow: 0 8px 24px rgba(67,56,202,.35); cursor: pointer; }
        @media (max-width: 480px) { .ds-card { padding: 20px; } .ds-card h2 { font-size: 19px; } }
    `;
    document.head.appendChild(style);
}

function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function mount() {
    injectStyles();
    if (document.getElementById(OVERLAY_ID)) {
        overlay = document.getElementById(OVERLAY_ID);
        badge = document.getElementById(BADGE_ID);
        return;
    }

    overlay = element("div", "ds-overlay hidden");
    overlay.id = OVERLAY_ID;
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "ds-title");

    const card = element("div", "ds-card");
    const close = element("button", "ds-close", "✕");
    close.type = "button";
    close.setAttribute("aria-label", "Cerrar");
    close.addEventListener("click", hide);
    card.appendChild(close);

    card.appendChild(element("p", "ds-eyebrow", "RETO DIARIO · REPASO ACTIVO"));
    const title = element("h2", "", "");
    title.id = "ds-title";
    card.appendChild(title);
    const subtitle = element("p", "ds-subtitle", "");
    card.appendChild(subtitle);

    const plan = element("div", "ds-plan");
    card.appendChild(plan);

    const commitStep = element("div", "ds-step");
    commitStep.appendChild(element("label", "", "Para empezar, escribe: Estudiaré [actividad]"));
    const commitInput = element("input");
    commitInput.type = "text";
    commitInput.id = "ds-commit-input";
    commitInput.placeholder = "Estudiaré Ejercicios";
    commitInput.autocomplete = "off";
    commitStep.appendChild(commitInput);
    const commitError = element("p", "ds-error hidden", "");
    commitStep.appendChild(commitError);
    card.appendChild(commitStep);

    const reviewStep = element("div", "ds-step hidden");
    reviewStep.appendChild(element("label", "", "Recuerda sin mirar: escribe una palabra o frase de tu sesión"));
    const recallInput = element("input");
    recallInput.type = "text";
    recallInput.id = "ds-recall-input";
    recallInput.placeholder = "Una palabra, frase o ejemplo que recuerdes";
    recallInput.autocomplete = "off";
    reviewStep.appendChild(recallInput);
    const grades = element("div", "ds-grades");
    const gradeLabels = [
        ["again", "Otra vez"],
        ["hard", "Difícil"],
        ["good", "Bien"],
        ["easy", "Fácil"]
    ];
    for (const [grade, label] of gradeLabels) {
        const button = element("button", "ds-grade", label);
        button.type = "button";
        button.dataset.grade = grade;
        button.disabled = true;
        button.addEventListener("click", () => finish(grade));
        grades.appendChild(button);
    }
    reviewStep.appendChild(grades);
    card.appendChild(reviewStep);

    const doneStep = element("div", "ds-step hidden");
    card.appendChild(doneStep);

    const footer = element("div", "ds-footer");
    const reminderLabel = element("label", "ds-reminder");
    const reminderEnabled = element("input");
    reminderEnabled.type = "checkbox";
    reminderEnabled.id = "ds-reminder-enabled";
    reminderLabel.appendChild(reminderEnabled);
    reminderLabel.appendChild(document.createTextNode("Avisarme a las "));
    const reminderTime = element("input");
    reminderTime.type = "time";
    reminderTime.id = "ds-reminder-time";
    reminderTime.value = "20:00";
    reminderLabel.appendChild(reminderTime);
    footer.appendChild(reminderLabel);
    const later = element("button", "ds-link", "Ver más tarde");
    later.type = "button";
    later.addEventListener("click", hide);
    footer.appendChild(later);
    card.appendChild(footer);

    overlay.appendChild(card);
    overlay.addEventListener("click", event => {
        if (event.target === overlay) hide();
    });
    document.body.appendChild(overlay);

    badge = element("button", "ds-badge hidden", "🎯 Reto de hoy");
    badge.type = "button";
    badge.addEventListener("click", show);
    document.body.appendChild(badge);

    commitInput.addEventListener("input", () => {
        commitError.classList.add("hidden");
        const valid = commitInput.value.toLocaleLowerCase().normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "").includes("estudiare");
        document.querySelector("#ds-start")?.toggleAttribute("disabled", !valid);
    });
    const start = element("button", "ds-primary", "Sí, estudiaré");
    start.id = "ds-start";
    start.type = "button";
    start.disabled = true;
    start.addEventListener("click", startMission);
    commitStep.appendChild(start);

    recallInput.addEventListener("input", () => {
        const ready = recallInput.value.trim().length >= 2;
        grades.querySelectorAll("button").forEach(button => { button.disabled = !ready; });
    });
    reminderEnabled.addEventListener("change", updateReminder);
    reminderTime.addEventListener("change", updateReminder);
}

function show() {
    if (overlay) overlay.classList.remove("hidden");
}

function hide() {
    if (overlay) overlay.classList.add("hidden");
}

function setStep(name) {
    const steps = overlay.querySelectorAll(".ds-step");
    steps.forEach(step => step.classList.add("hidden"));
    const target = {
        commit: steps[0],
        review: steps[1],
        done: steps[2]
    }[name];
    target?.classList.remove("hidden");
}

function dueLabel(activity, now) {
    const card = state.cards[activity.id];
    if (!card || card.memoryState === "new") return "Nuevo · aún sin repasar";
    if (isDue(card, now)) return "Toca hoy · pendiente";
    return `Próximo en ${formatInterval(new Date(card.nextReviewAt).getTime() - now.getTime())}`;
}

function renderPlan(now) {
    const host = overlay.querySelector(".ds-plan");
    host.textContent = "";
    host.appendChild(element("div", "ds-plan-head", `PLAN DE HOY · ${getTotalPlanMinutes()} MIN EN TOTAL`));
    for (const activity of STUDY_ACTIVITIES) {
        const row = element("div", `ds-plan-item${activity.id === mission.activityId ? " current" : ""}`);
        row.appendChild(element("span", "ds-plan-icon", activity.icon));
        const info = element("div", "ds-plan-info");
        info.appendChild(element("div", "ds-plan-name", activity.label));
        info.appendChild(element("div", "ds-plan-status", dueLabel(activity, now)));
        row.appendChild(info);
        row.appendChild(element("span", "ds-plan-minutes", `${activity.minutes} min`));
        host.appendChild(row);
    }
}

function render() {
    if (!overlay || !mission) return;
    const activity = getActivity(mission.activityId);
    if (!activity) return;
    const now = new Date();
    const title = overlay.querySelector("#ds-title");
    const subtitle = overlay.querySelector(".ds-subtitle");
    title.textContent = `${activity.icon} Hoy te toca: ${activity.label} (${activity.minutes} min)`;
    subtitle.textContent = mission.completedAt
        ? "Reto completado. Tu próxima aparición ya está programada según lo bien que te fue."
        : mission.commitmentAt
            ? "Sesión en marcha. Cuando termines, escribe algo que recuerdes y puntúa tu repaso."
            : "Un reto distinto cada día, elegido entre lo que tienes pendiente. El texto ya está escrito: solo pulsa el botón.";
    renderPlan(now);
    if (!mission.commitmentAt) setStep("commit");
    else if (!mission.completedAt) setStep("review");
    else {
        setStep("done");
        const doneStep = overlay.querySelectorAll(".ds-step")[2];
        doneStep.textContent = "";
        doneStep.appendChild(element("p", "ds-subtitle", `✅ Completaste ${activity.label}. Próximo repaso: ${nextReviewLabel()}`));
        const again = element("button", "ds-primary", "🔄 Hacer otro hoy");
        again.type = "button";
        again.addEventListener("click", () => {
            const result = resetMission(state, mission.date);
            state = result.state;
            mission = result.mission;
            persist();
            render();
            show();
        });
        doneStep.appendChild(again);
    }
    if (!mission.completedAt && !mission.commitmentAt) {
        const input = overlay.querySelector("#ds-commit-input");
        input.value = `Estudiaré ${activity.label}`;
        const start = overlay.querySelector("#ds-start");
        if (start) start.disabled = false;
    }
    if (!sessionActivity) {
        badge.textContent = mission.completedAt
            ? `✅ ${activity.label} hecho`
            : mission.commitmentAt
                ? `⏱ ${activity.minutes} min · ${activity.label}`
                : `🎯 Hoy: ${activity.label} · ${activity.minutes} min`;
    }
    badge.classList.remove("hidden");
    const reminderEnabled = overlay.querySelector("#ds-reminder-enabled");
    const reminderTime = overlay.querySelector("#ds-reminder-time");
    reminderEnabled.checked = Boolean(state.notifications.enabled);
    reminderTime.value = state.notifications.time;
}

function nextReviewLabel() {
    const card = state.cards[mission.activityId];
    if (!card?.nextReviewAt) return "pronto";
    return formatInterval(new Date(card.nextReviewAt).getTime() - Date.now());
}

function updateTimerBadge() {
    if (!sessionActivity) return;
    const remaining = Math.max(0, sessionDeadline - Date.now());
    if (!remaining) {
        const label = sessionActivity.label;
        stopTimer();
        badge.textContent = `⏰ Tiempo · ${label}`;
        showToast("Tiempo terminado. Vuelve al reto y puntúa cómo te fue.", "info");
        show();
        return;
    }
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    badge.textContent = `⏱ ${minutes}:${String(seconds).padStart(2, "0")} · ${sessionActivity.label}`;
}

function startTimer(activity) {
    stopTimer();
    sessionActivity = activity;
    sessionDeadline = Date.now() + getActivityMinutes(activity.id) * 60000;
    updateTimerBadge();
    sessionTimer = setInterval(updateTimerBadge, 1000);
}

function stopTimer() {
    if (sessionTimer) clearInterval(sessionTimer);
    sessionTimer = null;
    sessionDeadline = 0;
    sessionActivity = null;
}

function persist() {
    saveDailyState(state, { storage, userId });
}

function startMission() {
    const input = overlay.querySelector("#ds-commit-input");
    const result = recordCommitment(state, mission.date, input.value, new Date());
    if (!result.valid) {
        const error = overlay.querySelector(".ds-error");
        error.textContent = "Escribe «Estudiaré " + getActivity(mission.activityId).label + "» para aceptar el reto.";
        error.classList.remove("hidden");
        return;
    }
    state = result.state;
    mission = result.mission;
    persist();
    hide();
    const activity = getActivity(mission.activityId);
    navigate(activity);
    showToast(`Reto aceptado: ${activity.label}. Tienes ${activity.minutes} min. ¡A estudiar!`, "success");
    render();
    startTimer(activity);
}

function finish(grade) {
    const recall = overlay.querySelector("#ds-recall-input").value;
    const result = recordCompletion(state, mission.date, { grade, recall }, new Date());
    if (!result.recorded) return;
    state = result.state;
    mission = result.mission;
    persist();
    stopTimer();
    render();
    showToast(`Repaso guardado. Próxima vez: ${nextReviewLabel()}`, "success");
    scheduleNotification();
}

async function updateReminder() {
    const enabledInput = overlay.querySelector("#ds-reminder-enabled");
    const timeInput = overlay.querySelector("#ds-reminder-time");
    if (enabledInput.checked && !("Notification" in window)) {
        enabledInput.checked = false;
        showToast("Este navegador no permite avisos del sistema.", "warning");
        return;
    }
    if (enabledInput.checked && Notification.permission !== "granted") {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
            enabledInput.checked = false;
            showToast("Permiso de avisos denegado. El reto seguirá apareciendo al abrir la app.", "warning");
            return;
        }
    }
    state = saveReminderSettings(state, { enabled: enabledInput.checked, time: timeInput.value });
    persist();
    scheduleNotification();
}

function scheduleNotification() {
    if (reminderTimer) clearTimeout(reminderTimer);
    reminderTimer = null;
    if (!state?.notifications?.enabled || !("Notification" in window) || Notification.permission !== "granted") return;
    const [hours, minutes] = state.notifications.time.split(":").map(Number);
    const now = new Date();
    const target = new Date(now);
    target.setHours(hours, minutes, 0, 0);
    if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1);
    reminderTimer = setTimeout(async () => {
        const fresh = loadDailyState({ storage, userId });
        const current = findMission(fresh, getLocalDateKey(new Date()));
        const activity = getActivity(current?.activityId);
        if (!activity) return;
        const title = "Tu reto de inglés de hoy";
        const body = current.commitmentAt
            ? `Hoy te toca: ${activity.label}. Marca cómo te fue.`
            : `Hoy te toca: ${activity.label}. Escribe «Estudiaré ${activity.label}» para empezar.`;
        try {
            if (navigator.serviceWorker?.ready) {
                const registration = await navigator.serviceWorker.ready;
                await registration.showNotification(title, { body, icon: "./icons/icon-192.png", tag: "daily-study" });
            } else {
                new Notification(title, { body });
            }
        } catch (error) {
            console.warn("No se pudo mostrar el aviso diario:", error);
        }
        state = fresh;
        mission = current;
        render();
        show();
        scheduleNotification();
    }, target.getTime() - now.getTime());
}

export function initializeDailyStudy(options = {}) {
    if (api) return api;
    storage = options.storage || globalThis.localStorage;
    userId = options.userId || "";
    navigate = typeof options.navigate === "function" ? options.navigate : () => {};
    const ensured = ensureDailyMission(loadDailyState({ storage, userId }), { now: new Date() });
    state = ensured.state;
    mission = ensured.mission;
    persist();
    mount();
    render();
    show();
    scheduleNotification();
    api = {
        open: show,
        close: hide,
        getMission: () => ({ ...mission }),
        getState: () => state
    };
    return api;
}
