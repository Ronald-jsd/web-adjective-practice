/* Plan diario de estudio: tres retos cortos (principal, repaso y extra) con su
 * tiempo, tema concreto de IA y verificación: el reloj se pausa al salir de la
 * sección y hay que interactuar de verdad antes de poder puntuar. */

import { showToast } from "./cache.js";
import { formatInterval, isDue } from "./sentences/scheduler.js";
import {
    MAIN_SLOT,
    REVIEW_SLOT,
    EXTRA_SLOT,
    DAILY_SLOTS,
    MIN_REAL_INTERACTIONS,
    getActivity,
    getActivityMinutes,
    getDailyTotalMinutes,
    loadDailyState,
    saveDailyState,
    markDailyIntroShown,
    ensureDailyMissions,
    findDailyMissions,
    refreshMissionTarget,
    recordCommitment,
    recordInteraction,
    recordCompletion,
    resetMission,
    saveReminderSettings,
    getLocalDateKey
} from "./daily-study.js";

const STYLE_ID = "daily-study-styles";
const OVERLAY_ID = "daily-study-overlay";
const BADGE_ID = "daily-study-badge";
const TICK_MS = 1000;

let state = null;
let missions = { main: null, review: null, extra: null };
let activeSlot = MAIN_SLOT;
let storage = null;
let userId = "";
let navigate = () => {};
let getStudyQueries = () => [];
let openStudyTarget = null;
let overlay = null;
let badge = null;
let reminderTimer = null;
let session = null;
let tickTimer = null;
let interactionTimer = null;
let api = null;

function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
        .ds-overlay { position: fixed; inset: 0; z-index: 10000; display: flex; align-items: center;
            justify-content: center; padding: 18px; background: rgba(15,23,42,.55); }
        .ds-overlay.hidden, .ds-badge.hidden { display: none !important; }
        .ds-card { position: relative; width: min(100%, 470px); max-height: 92vh; overflow-y: auto;
            background: #fff; border-radius: 20px; padding: 24px; box-shadow: 0 18px 60px rgba(15,23,42,.28);
            font-family: Inter, system-ui, sans-serif; color: #0f172a; }
        .ds-close { position: absolute; top: 12px; right: 12px; border: 0; background: transparent;
            font-size: 20px; cursor: pointer; color: #64748b; }
        .ds-eyebrow { margin: 0 0 6px; font-size: 11px; font-weight: 700; letter-spacing: .12em; color: #4f46e5; }
        .ds-card h2 { margin: 0 0 8px; font-size: 22px; line-height: 1.25; }
        .ds-subtitle { margin: 0 0 14px; font-size: 14px; color: #475569; }
        .ds-plan { margin: 0 0 16px; border: 1px solid #e0e7ff; border-radius: 12px; overflow: hidden; }
        .ds-plan-head { padding: 9px 12px; background: #eef2ff; font-size: 11px; font-weight: 800;
            letter-spacing: .06em; color: #3730a3; }
        .ds-plan-row { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left;
            padding: 10px 12px; border: 0; border-top: 1px solid #eef2ff; background: #fff;
            font: inherit; cursor: pointer; color: inherit; }
        .ds-plan-row.selected { background: #fffbeb; box-shadow: inset 3px 0 0 #f59e0b; }
        .ds-plan-icon { font-size: 18px; }
        .ds-plan-info { flex: 1; min-width: 0; }
        .ds-plan-name { font-size: 13px; font-weight: 700; }
        .ds-plan-status { font-size: 11px; color: #64748b; overflow-wrap: anywhere; }
        .ds-plan-row.selected .ds-plan-status { color: #b45309; font-weight: 700; }
        .ds-plan-minutes { font-size: 12px; font-weight: 800; color: #4338ca; white-space: nowrap; }
        .ds-step label { display: block; margin-bottom: 7px; font-size: 13px; font-weight: 600; }
        .ds-step input { width: 100%; box-sizing: border-box; padding: 11px 12px; border: 1px solid #cbd5e1;
            border-radius: 10px; font: inherit; font-size: 14px; }
        .ds-check { margin: 12px 0; padding: 11px 12px; border-radius: 10px; background: #f8fafc;
            border: 1px solid #e2e8f0; font-size: 12px; color: #475569; }
        .ds-check strong { color: #0f172a; }
        .ds-check.ok { background: #f0fdf4; border-color: #bbf7d0; color: #15803d; }
        .ds-check.ok strong { color: #15803d; }
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
        .ds-link.hidden, .ds-error.hidden { display: none !important; }
        .ds-badge { display: inline-flex; align-items: center; justify-content: center; border: 0; border-radius: 999px;
            max-width: 240px; padding: 8px 12px; background: #4338ca; color: #fff; overflow: hidden;
            font: inherit; font-size: 12px; font-weight: 700; white-space: nowrap;
            box-shadow: 0 4px 12px rgba(67,56,202,.25); cursor: pointer; }
        .ds-badge-short { display: inline; }
        .ds-badge-full { display: none; }
        @media (min-width: 1024px) {
            .ds-badge-short { display: none; }
            .ds-badge-full { display: inline; }
        }
        @media (max-width: 639px) { .ds-badge { padding: 7px 9px; font-size: 11px; } }
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

function currentMission() {
    return missions[activeSlot] || null;
}

function missionCardKey(mission) {
    return mission?.activityId === "ai" && mission.targetId
        ? `ai:${mission.targetId}`
        : mission?.activityId;
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

    card.appendChild(element("p", "ds-eyebrow", "PLAN DIARIO · REPASO ACTIVO"));
    const title = element("h2", "", "");
    title.id = "ds-title";
    card.appendChild(title);
    card.appendChild(element("p", "ds-subtitle", ""));
    card.appendChild(element("div", "ds-plan"));

    const commitStep = element("div", "ds-step");
    commitStep.appendChild(element("label", "", "Para empezar, escribe: Estudiaré [actividad]"));
    const commitInput = element("input");
    commitInput.type = "text";
    commitInput.id = "ds-commit-input";
    commitInput.placeholder = "Estudiaré Ejercicios";
    commitInput.autocomplete = "off";
    commitStep.appendChild(commitInput);
    commitStep.appendChild(element("p", "ds-error hidden", ""));
    const start = element("button", "ds-primary", "Sí, estudiaré");
    start.id = "ds-start";
    start.type = "button";
    start.addEventListener("click", startMission);
    commitStep.appendChild(start);
    card.appendChild(commitStep);

    const verifyStep = element("div", "ds-step hidden");
    verifyStep.appendChild(element("label", "", "¿Cómo te fue? Esto decide cuándo vuelve el reto."));
    const check = element("div", "ds-check", "");
    check.id = "ds-check";
    verifyStep.appendChild(check);
    const resume = element("button", "ds-link", "▶️ Iniciar temporizador");
    resume.id = "ds-resume";
    resume.type = "button";
    resume.addEventListener("click", () => focusMission(currentMission()));
    verifyStep.appendChild(resume);
    const grades = element("div", "ds-grades");
    for (const [grade, label] of [
        ["again", "Otra vez"],
        ["hard", "Difícil"],
        ["good", "Bien"],
        ["easy", "Fácil"]
    ]) {
        const button = element("button", "ds-grade", label);
        button.type = "button";
        button.dataset.grade = grade;
        button.disabled = true;
        button.addEventListener("click", () => finish(grade));
        grades.appendChild(button);
    }
    verifyStep.appendChild(grades);
    card.appendChild(verifyStep);

    card.appendChild(element("div", "ds-step hidden"));

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

    badge = element("button", "ds-badge hidden", "🎯 Plan de hoy");
    badge.type = "button";
    badge.addEventListener("click", show);
    const voiceButton = document.getElementById("voice-settings-button");
    const header = document.querySelector("header");
    if (voiceButton?.parentElement) voiceButton.parentElement.insertBefore(badge, voiceButton);
    else if (header) header.appendChild(badge);
    else {
        badge.style.position = "fixed";
        badge.style.top = "12px";
        badge.style.right = "12px";
        badge.style.zIndex = "999";
        document.body.appendChild(badge);
    }

    commitInput.addEventListener("input", () => {
        overlay.querySelector(".ds-error")?.classList.add("hidden");
        const valid = commitInput.value.toLocaleLowerCase().normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "").includes("estudiare");
        if (start) start.disabled = !valid;
    });
    reminderEnabled.addEventListener("change", updateReminder);
    reminderTime.addEventListener("change", updateReminder);
}

function show() {
    if (overlay) overlay.classList.remove("hidden");
    updateVerificationUi();
}

function hide() {
    if (overlay) overlay.classList.add("hidden");
    updateVerificationUi();
}

function setStep(name) {
    const steps = overlay.querySelectorAll(".ds-step");
    steps.forEach(step => step.classList.add("hidden"));
    const target = {
        commit: steps[0],
        verify: steps[1],
        done: steps[2]
    }[name];
    target?.classList.remove("hidden");
}

function statusLabel(mission, now) {
    if (!mission) return "Sin asignar";
    if (mission.completedAt) return "✅ Hecho hoy";
    if (mission.commitmentAt) return "⏱ En curso";
    const card = state.cards[missionCardKey(mission)];
    if (!card || card.memoryState === "new") return "Nuevo · sin repasar";
    if (isDue(card, now)) return "Toca hoy · pendiente";
    return `Próximo en ${formatInterval(new Date(card.nextReviewAt).getTime() - now.getTime())}`;
}

function missionLabel(mission) {
    const activity = getActivity(mission.activityId);
    if (!activity) return "Actividad";
    if (activity.id === "ai" && mission.targetLabel) return `IA · ${mission.targetLabel}`;
    return activity.label;
}

function renderPlan(now) {
    const host = overlay.querySelector(".ds-plan");
    host.textContent = "";
    host.appendChild(element("div", "ds-plan-head", `HOY · ${getDailyTotalMinutes(missions)} MIN EN 3 RETOS`));
    for (const [slot, tag] of [[MAIN_SLOT, "Principal"], [REVIEW_SLOT, "Repaso"], [EXTRA_SLOT, "Extra"]]) {
        const mission = missions[slot];
        if (!mission) continue;
        const activity = getActivity(mission.activityId);
        if (!activity) continue;
        const row = element("button", `ds-plan-row${slot === activeSlot ? " selected" : ""}`);
        row.type = "button";
        row.setAttribute("aria-pressed", slot === activeSlot ? "true" : "false");
        row.appendChild(element("span", "ds-plan-icon", activity.icon));
        const info = element("div", "ds-plan-info");
        info.appendChild(element("div", "ds-plan-name", `${tag}: ${missionLabel(mission)}`));
        info.appendChild(element("div", "ds-plan-status", statusLabel(mission, now)));
        row.appendChild(info);
        row.appendChild(element("span", "ds-plan-minutes", `${activity.minutes} min`));
        row.addEventListener("click", () => {
            activeSlot = slot;
            render();
            focusMission(mission, { startTimer: Boolean(mission.commitmentAt) });
        });
        host.appendChild(row);
    }
}

function renderDone(mission) {
    const step = overlay.querySelectorAll(".ds-step")[2];
    step.textContent = "";
    step.appendChild(element("p", "ds-subtitle",
        `✅ Completaste ${missionLabel(mission)}. Próximo repaso: ${nextReviewLabel(mission)}`));
    const again = element("button", "ds-primary", "🔄 Hacer otro hoy");
    again.type = "button";
    again.addEventListener("click", () => {
        const result = resetMission(state, mission.date, mission.slot);
        if (!result.reset) return;
        state = result.state;
        missions[activeSlot] = result.mission;
        persist();
        render();
        show();
    });
    step.appendChild(again);

    for (const slot of DAILY_SLOTS) {
        const other = missions[slot];
        if (!other || other.completedAt || slot === mission.slot) continue;
        const next = element("button", "ds-link",
            `➡️ Hacer ${missionLabel(other)} (${getActivityMinutes(other.activityId)} min)`);
        next.type = "button";
        next.addEventListener("click", () => {
            activeSlot = slot;
            render();
        });
        step.appendChild(next);
    }
}

function render() {
    if (!overlay) return;
    const mission = currentMission();
    if (!mission) return;
    const activity = getActivity(mission.activityId);
    if (!activity) return;
    const now = new Date();
    const title = overlay.querySelector("#ds-title");
    const subtitle = overlay.querySelector(".ds-subtitle");
    title.textContent = `🎯 Hoy: ${getDailyTotalMinutes(missions)} min · 3 retos cortos`;
    if (mission.completedAt) {
        subtitle.textContent = "Buen trabajo. Puedes hacer el otro reto o reiniciar este.";
    } else if (mission.commitmentAt) {
        subtitle.textContent = mission.activityId === "ai" && mission.targetLabel
            ? `Tema de hoy: «${mission.targetLabel}». Mantente en la sección y trabaja ${activity.minutes} min.`
            : `Mantente en la sección y trabaja ${activity.minutes} min. El reloj se pausa si sales.`;
    } else {
        subtitle.textContent = "Uno de práctica y uno de repaso, distintos a ayer. El texto ya está escrito: solo pulsa el botón.";
    }
    renderPlan(now);

    if (!mission.commitmentAt) {
        setStep("commit");
        const label = missionLabel(mission);
        overlay.querySelector(".ds-step label").textContent = `Para empezar, escribe: Estudiaré ${label}`;
        const input = overlay.querySelector("#ds-commit-input");
        input.value = `Estudiaré ${label}`;
        input.placeholder = input.value;
        const start = overlay.querySelector("#ds-start");
        if (start) start.disabled = false;
    } else if (!mission.completedAt) {
        setStep("verify");
    } else {
        setStep("done");
        renderDone(mission);
    }

    const reminderEnabled = overlay.querySelector("#ds-reminder-enabled");
    const reminderTime = overlay.querySelector("#ds-reminder-time");
    reminderEnabled.checked = Boolean(state.notifications.enabled);
    reminderTime.value = state.notifications.time;
    updateVerificationUi();
    updateBadge();
    emitSession();
}

function nextReviewLabel(mission) {
    const card = state.cards[missionCardKey(mission)];
    if (!card?.nextReviewAt) return "pronto";
    return formatInterval(new Date(card.nextReviewAt).getTime() - Date.now());
}

function isOverlayOpen() {
    return Boolean(overlay && !overlay.classList.contains("hidden"));
}

function isStudyPresent() {
    const activity = session?.activity;
    if (!activity || document.hidden || isOverlayOpen()) return false;
    const section = document.getElementById(`${activity.section}-section`);
    if (!section || !section.classList.contains("active")) return false;
    if (activity.pane) {
        const tab = document.querySelector(`[data-practice-pane="${activity.pane}"]`);
        if (tab && !tab.classList.contains("active")) return false;
        const pane = document.getElementById(`practice-pane-${activity.pane}`);
        if (pane && pane.hidden) return false;
    }
    if (activity.screen) {
        const tab = document.querySelector(`.tab[data-screen="${activity.screen}"]`);
        if (tab && !tab.classList.contains("active")) return false;
    }
    return true;
}

function pauseReason() {
    if (document.hidden) return "Pestaña en segundo plano";
    if (isOverlayOpen()) return "Modal abierto";
    if (session?.activity) return "Saliste de la sección";
    return "En pausa";
}

function formatRemaining(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function updateVerificationUi() {
    if (!overlay) return;
    const mission = currentMission();
    const check = overlay.querySelector("#ds-check");
    if (!check || !mission) return;
    const interactions = mission.interactions || 0;
    const timeUp = Boolean(session && session.slot === activeSlot && !session.running && session.remainingMs <= 0);
    const enough = interactions >= MIN_REAL_INTERACTIONS;
    const actions = enough
        ? `✅ ${interactions} acciones (mínimo ${MIN_REAL_INTERACTIONS})`
        : `${interactions}/${MIN_REAL_INTERACTIONS} acciones`;
    check.classList.toggle("ok", timeUp && enough);
    check.textContent = timeUp
        ? enough
            ? `✅ Tiempo completado · ${actions}. Elige una opción.`
            : `⏱ Tiempo completado · ${actions}. Usa la sección para interactuar.`
        : session && session.slot === activeSlot
            ? session.paused
                ? `⏸ Reloj pausado: ${pauseReason()} · ${actions}`
                : `⏱ Quedan ${formatRemaining(session.remainingMs)} · ${actions}`
            : `Este reto aún no está en marcha · ${actions}`;

    const resume = overlay.querySelector("#ds-resume");
    if (resume) {
        const needsSession = !session || session.slot !== mission.slot;
        resume.classList.toggle("hidden", !needsSession);
        resume.textContent = session && session.slot === mission.slot && !session.running
            ? "▶️ Reanudar temporizador"
            : "▶️ Iniciar temporizador";
    }
    const ready = timeUp && enough;
    overlay.querySelectorAll(".ds-grade").forEach(button => { button.disabled = !ready; });
}

function sessionSnapshot() {
    const mission = currentMission();
    const activity = session?.activity || (mission ? getActivity(mission.activityId) : null);
    return {
        activityId: mission?.activityId || null,
        slot: mission?.slot || null,
        label: mission ? missionLabel(mission) : "",
        remainingMs: session ? session.remainingMs : null,
        totalMs: activity ? getActivityMinutes(activity.id) * 60000 : 0,
        running: Boolean(session?.running),
        paused: Boolean(session?.paused),
        interactions: mission?.interactions || 0,
        requiredInteractions: MIN_REAL_INTERACTIONS,
        completed: Boolean(mission?.completedAt)
    };
}

/* Otras secciones (por ejemplo Exercise) muestran el mismo reloj dentro de su
 * panel para que no parezca que llevan un sistema de progreso distinto. */
function emitSession() {
    window.dispatchEvent(new CustomEvent("daily-study-session", { detail: sessionSnapshot() }));
}

function updateBadge() {
    if (!badge) return;
    let full;
    let short;
    if (session && session.running) {
        const stateText = session.paused ? "⏸" : "⏱";
        const remaining = formatRemaining(session.remainingMs);
        full = `${stateText} ${remaining} · ${session.activity.label}`;
        short = `${stateText} ${remaining}`;
    } else {
        const pending = DAILY_SLOTS.filter(slot => missions[slot] && !missions[slot].completedAt).length;
        full = pending
            ? `🎯 Hoy: ${getDailyTotalMinutes(missions)} min · ${pending} reto${pending === 1 ? "" : "s"}`
            : "✅ Retos de hoy completados";
        short = pending ? `🎯 ${pending} reto${pending === 1 ? "" : "s"}` : "✅ Listo";
    }
    badge.replaceChildren(
        element("span", "ds-badge-short", short),
        element("span", "ds-badge-full", full)
    );
    badge.title = full;
    badge.classList.remove("hidden");
}

function tick() {
    if (!session || !session.running) return;
    const present = isStudyPresent();
    session.paused = !present;
    if (present) {
        session.remainingMs = Math.max(0, session.remainingMs - TICK_MS);
        if (session.remainingMs === 0) {
            session.running = false;
            showToast("Tiempo terminado. Vuelve al reto, escribe lo que recuerdas y puntúa.", "success");
            if (!isOverlayOpen()) show();
        }
    }
    updateVerificationUi();
    updateBadge();
    emitSession();
}

function stopSession() {
    if (tickTimer) clearInterval(tickTimer);
    if (interactionTimer) clearTimeout(interactionTimer);
    tickTimer = null;
    interactionTimer = null;
    session = null;
    emitSession();
}

function startSession(mission) {
    stopSession();
    const activity = getActivity(mission.activityId);
    session = {
        slot: mission.slot,
        activity,
        remainingMs: getActivityMinutes(mission.activityId) * 60000,
        running: true,
        paused: false
    };
    tickTimer = setInterval(tick, TICK_MS);
    updateVerificationUi();
    updateBadge();
    emitSession();
}

function onRealInteraction(event) {
    if (!session || !session.running || session.paused) return;
    if (!isStudyPresent()) return;
    const target = event.target;
    if (!target || !(target instanceof Node) || !isStudyPresentFor(target)) return;
    if (interactionTimer) return;
    interactionTimer = setTimeout(() => { interactionTimer = null; }, 700);
    const mission = currentMission();
    if (!mission || mission.slot !== session.slot) return;
    const result = recordInteraction(state, mission.date, mission.slot, new Date());
    if (!result.counted) return;
    state = result.state;
    missions[mission.slot] = result.mission;
    persist();
    updateVerificationUi();
}

function isStudyPresentFor(target) {
    const activity = session?.activity;
    if (!activity || !isStudyPresent()) return false;
    const section = document.getElementById(`${activity.section}-section`);
    return Boolean(section && section.contains(target));
}

function persist() {
    saveDailyState(state, { storage, userId });
}

/* Cualquier acceso al reto (botón de actividad, temporizador o fila del plan)
 * lleva a la sección real donde se trabaja. Si ya hay un reloj en marcha para
 * ese mismo reto se conserva; si no, arranca aquí. */
function focusMission(mission, { startTimer = true } = {}) {
    if (!mission) return;
    const activity = getActivity(mission.activityId);
    if (!activity) return;
    hide();
    navigate(activity, mission);
    if (startTimer && (!session || session.slot !== mission.slot || !session.running)) {
        startSession(mission);
    }
}

function startMission() {
    const mission = currentMission();
    if (!mission) return;
    const input = overlay.querySelector("#ds-commit-input");
    const result = recordCommitment(state, mission.date, mission.slot, input.value, new Date());
    if (!result.valid) {
        const error = overlay.querySelector(".ds-error");
        error.textContent = `Escribe «Estudiaré ${missionLabel(mission)}» para aceptar el reto.`;
        error.classList.remove("hidden");
        return;
    }
    state = result.state;
    missions[mission.slot] = result.mission;
    persist();
    focusMission(mission);
    showToast(`Reto aceptado: ${missionLabel(mission)}. Tienes ${getActivityMinutes(mission.activityId)} min. ¡A estudiar!`, "success");
    render();
}

function finish(grade) {
    const mission = currentMission();
    if (!mission) return;
    const result = recordCompletion(state, mission.date, mission.slot, { grade }, new Date());
    if (!result.recorded) return;
    state = result.state;
    missions[mission.slot] = result.mission;
    persist();
    stopSession();
    render();
    showToast(`Repaso guardado. Próxima vez: ${nextReviewLabel(mission)}`, "success");
    scheduleNotification();
}

function handleStudyQueries(event) {
    const targets = Array.isArray(event?.detail?.queries) ? event.detail.queries : (getStudyQueries() || []);
    const dateKey = getLocalDateKey(new Date());
    for (const slot of DAILY_SLOTS) {
        if (missions[slot]?.activityId !== "ai") continue;
        const result = refreshMissionTarget(state, dateKey, targets, new Date(), slot);
        if (result.changed) {
            state = result.state;
            missions[slot] = result.mission;
            persist();
        }
    }
    render();
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
            showToast("Permiso de avisos denegado. El plan seguirá apareciendo al abrir la app.", "warning");
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
        const current = findDailyMissions(fresh, getLocalDateKey(new Date()));
        const labels = DAILY_SLOTS
            .map(slot => current[slot])
            .filter(mission => mission && !mission.completedAt)
            .map(missionLabel);
        if (!labels.length) return;
        try {
            const body = `Hoy te toca: ${labels.join(" y ")}. Ábrelos desde el plan diario.`;
            if (navigator.serviceWorker?.ready) {
                const registration = await navigator.serviceWorker.ready;
                await registration.showNotification("Tu plan de inglés de hoy", { body, icon: "./icons/icon-192.png", tag: "daily-study" });
            } else {
                new Notification("Tu plan de inglés de hoy", { body });
            }
        } catch (error) {
            console.warn("No se pudo mostrar el aviso diario:", error);
        }
        state = fresh;
        missions = current;
        activeSlot = DAILY_SLOTS.find(slot => current[slot] && !current[slot].completedAt) || MAIN_SLOT;
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
    getStudyQueries = typeof options.getStudyQueries === "function" ? options.getStudyQueries : () => [];
    openStudyTarget = typeof options.openStudyTarget === "function" ? options.openStudyTarget : null;

    const stored = loadDailyState({ storage, userId });
    const ensured = ensureDailyMissions(stored, {
        now: new Date(),
        targets: getStudyQueries() || []
    });
    state = ensured.state;
    missions = ensured.missions;
    activeSlot = DAILY_SLOTS.find(slot => missions[slot] && !missions[slot].completedAt) || MAIN_SLOT;
    persist();
    mount();

    window.addEventListener("ai-queries-changed", handleStudyQueries);
    window.addEventListener("visibilitychange", () => {
        if (session) tick();
    });
    for (const type of ["click", "input", "keydown"]) {
        document.addEventListener(type, onRealInteraction, true);
    }

    const dateKey = getLocalDateKey(new Date());
    const firstOpenToday = state.introShownDate !== dateKey;
    if (firstOpenToday) {
        state = markDailyIntroShown(state, dateKey);
        persist();
    }
    render();
    if (firstOpenToday) show();
    scheduleNotification();
    api = {
        open: show,
        close: hide,
        getMission: () => ({ ...(currentMission() || {}) }),
        getMissions: () => Object.fromEntries(DAILY_SLOTS.map(slot =>
            [slot, { ...(missions[slot] || {}) }])),
        getState: () => state,
        getSession: sessionSnapshot,
        openTarget: id => typeof openStudyTarget === "function" ? openStudyTarget(id) : false
    };
    return api;
}
