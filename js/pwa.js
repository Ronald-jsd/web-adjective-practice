import { showToast } from "./cache.js";

const INSTALL_DISMISSED_KEY = "vg_pwa_install_dismissed";
const UPDATE_BANNER_ID = "pwa-update-banner";
const CONNECTION_ID = "connection-status";

let deferredInstallPrompt = null;
let refreshing = false;

export function initPWA() {
    setupConnectionStatus();
    setupInstallPrompt();
    requestPersistentStorage();
    registerServiceWorker();
}

/* ------------------------------------------------------------------ */
/* Estado de conexión                                                  */
/* ------------------------------------------------------------------ */

function setupConnectionStatus() {
    if (typeof document === "undefined") return;

    const status = document.createElement("div");
    status.id = CONNECTION_ID;
    status.className = "connection-status hidden";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.innerHTML =
        '<span class="connection-dot" aria-hidden="true"></span><span data-connection-message></span>';
    document.body.appendChild(status);

    const render = () => {
        const online = navigator.onLine;
        document.body.classList.toggle("is-offline", !online);
        if (!online) {
            showConnection("Sin conexión · mostrando los datos guardados en este dispositivo", "offline");
        } else {
            hideConnection();
        }
    };

    window.addEventListener("offline", () => {
        render();
        showToast("Sin conexión. Puedes seguir usando lo que ya está guardado.", "info");
    });

    window.addEventListener("online", () => {
        render();
        showConnection("Conexión restablecida", "online");
        window.setTimeout(hideConnection, 2600);
        window.dispatchEvent(new CustomEvent("app-online"));
    });

    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
            window.dispatchEvent(new CustomEvent("app-foreground"));
        }
    });

    render();
}

function showConnection(message, state) {
    const status = document.getElementById(CONNECTION_ID);
    if (!status) return;
    status.classList.remove("hidden", "offline", "online");
    status.classList.add(state);
    const label = status.querySelector("[data-connection-message]");
    if (label) label.textContent = message;
}

function hideConnection() {
    const status = document.getElementById(CONNECTION_ID);
    if (!status) return;
    status.classList.add("hidden");
}

/* ------------------------------------------------------------------ */
/* Instalación                                                         */
/* ------------------------------------------------------------------ */

function isStandalone() {
    return (
        window.matchMedia?.("(display-mode: standalone)")?.matches ||
        window.matchMedia?.("(display-mode: window-controls-overlay)")?.matches ||
        window.navigator.standalone === true
    );
}

function isIOS() {
    const ua = window.navigator.userAgent || "";
    return (
        /iPad|iPhone|iPod/.test(ua) ||
        (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1)
    );
}

function setupInstallPrompt() {
    if (typeof document === "undefined" || isStandalone()) return;
    if (localStorage.getItem(INSTALL_DISMISSED_KEY) === "1") return;

    window.addEventListener("beforeinstallprompt", (event) => {
        event.preventDefault();
        deferredInstallPrompt = event;
        renderInstallButton();
    });

    window.addEventListener("appinstalled", () => {
        deferredInstallPrompt = null;
        document.getElementById("pwa-install-button")?.remove();
        localStorage.removeItem(INSTALL_DISMISSED_KEY);
        showToast("App instalada. Ábrela desde tu pantalla de inicio.", "success");
    });

    if (isIOS()) {
        renderInstallButton();
    }
}

function renderInstallButton() {
    if (document.getElementById("pwa-install-button")) return;

    const button = document.createElement("button");
    button.id = "pwa-install-button";
    button.type = "button";
    button.className = "pwa-install-button";
    button.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3v12m0 0l4-4m-4 4l-4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"/></svg><span>Instalar app</span>';

    button.addEventListener("click", async () => {
        if (deferredInstallPrompt) {
            deferredInstallPrompt.prompt();
            const choice = await deferredInstallPrompt.userChoice.catch(() => null);
            deferredInstallPrompt = null;
            if (choice?.outcome === "accepted") {
                button.remove();
            } else {
                localStorage.setItem(INSTALL_DISMISSED_KEY, "1");
                button.remove();
            }
            return;
        }
        showIOSInstructions();
    });

    document.body.appendChild(button);
}

function showIOSInstructions() {
    if (document.getElementById("pwa-ios-help")) return;

    const overlay = document.createElement("div");
    overlay.id = "pwa-ios-help";
    overlay.className = "pwa-ios-help";
    overlay.innerHTML = `
        <div class="pwa-ios-card" role="dialog" aria-modal="true" aria-labelledby="pwa-ios-title">
            <h2 id="pwa-ios-title">Instalar en iPhone o iPad</h2>
            <ol>
                <li>Abre esta página en <strong>Safari</strong>.</li>
                <li>Toca el botón <strong>Compartir</strong> (el cuadrado con la flecha).</li>
                <li>Elige <strong>Añadir a pantalla de inicio</strong>.</li>
                <li>Confirma con <strong>Añadir</strong>.</li>
            </ol>
            <div class="pwa-ios-actions">
                <button type="button" data-pwa-ios-close>Entendido</button>
            </div>
        </div>
    `;

    const close = () => {
        overlay.remove();
        localStorage.setItem(INSTALL_DISMISSED_KEY, "1");
    };

    overlay.addEventListener("click", (event) => {
        if (event.target === overlay || event.target.closest("[data-pwa-ios-close]")) close();
    });

    document.body.appendChild(overlay);
}

/* ------------------------------------------------------------------ */
/* Service worker                                                      */
/* ------------------------------------------------------------------ */

function registerServiceWorker() {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    const { protocol, hostname } = window.location;
    const secure = protocol === "https:" || hostname === "localhost" || hostname === "127.0.0.1";
    if (!secure) {
        console.info("[pwa] El service worker requiere HTTPS o localhost.");
        return;
    }

    const hadController = !!navigator.serviceWorker.controller;

    onWindowLoad(async () => {
        try {
            const registration = await navigator.serviceWorker.register("./sw.js", { scope: "./" });

            if (registration.waiting && navigator.serviceWorker.controller) {
                showUpdateBanner(registration);
            }

            registration.addEventListener("updatefound", () => {
                const worker = registration.installing;
                if (!worker) return;
                worker.addEventListener("statechange", () => {
                    if (worker.state === "installed" && navigator.serviceWorker.controller) {
                        showUpdateBanner(registration);
                    }
                });
            });

            navigator.serviceWorker.addEventListener("message", (event) => {
                if (event.data?.type === "FLUSH_OUTBOX") {
                    window.dispatchEvent(new CustomEvent("app-flush-outbox"));
                }
            });

            navigator.serviceWorker.addEventListener("controllerchange", () => {
                // En la primera instalación el SW toma el control sin recargar.
                // Solo recargamos cuando una versión nueva reemplaza a la anterior.
                if (!hadController || refreshing) return;
                refreshing = true;
                window.location.reload();
            });

            window.setInterval(() => registration.update().catch(() => {}), 60 * 60 * 1000);
        } catch (error) {
            console.warn("[pwa] No se pudo registrar el service worker:", error);
        }
    });
}

function onWindowLoad(callback) {
    if (document.readyState === "complete") {
        callback();
    } else {
        window.addEventListener("load", callback, { once: true });
    }
}

function showUpdateBanner(registration) {
    if (document.getElementById(UPDATE_BANNER_ID)) return;

    const banner = document.createElement("div");
    banner.id = UPDATE_BANNER_ID;
    banner.className = "pwa-update-banner";
    banner.setAttribute("role", "status");
    banner.innerHTML =
        '<span>Hay una nueva versión de la app.</span><button type="button">Actualizar</button>';

    banner.querySelector("button").addEventListener("click", () => {
        const waiting = registration.waiting;
        if (waiting) {
            waiting.postMessage({ type: "SKIP_WAITING" });
        } else {
            window.location.reload();
        }
    });

    document.body.appendChild(banner);
}

function requestPersistentStorage() {
    if (navigator.storage?.persist) {
        navigator.storage.persist().catch(() => {});
    }
}
