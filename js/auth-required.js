/* Comprobación única de sesión para acciones que guardan en la nube.
 * Si no hay sesión, abre el modal de acceso con un aviso amable en lugar de
 * mostrar alertas, toasts de error o mensajes técnicos de Supabase. */

import { store } from "./config.js";

const DEFAULT_REASON = "continuar";

export function loginRequiredMessage(reason = DEFAULT_REASON) {
    const clean = String(reason || "").trim() || DEFAULT_REASON;
    return `Necesitas iniciar sesión para ${clean}.`;
}

export function isSignedIn() {
    return Boolean(store.currentUser);
}

export function requireSession(reason = DEFAULT_REASON) {
    if (isSignedIn()) return true;
    window.abrirModalLogin?.({ message: loginRequiredMessage(reason) });
    return false;
}

/* Detecta errores de sesión caducada/ausente para convertirlos en el aviso de
 * acceso en vez de enseñar el mensaje crudo de Supabase. */
export function isAuthError(error) {
    const text = String(error?.message || error || "").toLowerCase();
    return /auth session missing|jwt expired|not authenticated|no hay usuario|sesi[oó]n (inv[aá]lida|expirada)|session (missing|expired)|invalid claim|401/.test(text);
}

export function handleAuthError(error, reason = DEFAULT_REASON) {
    if (!isAuthError(error)) return false;
    requireSession(reason);
    return true;
}
