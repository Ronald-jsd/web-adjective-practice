/* Controles del sistema (notificación / pantalla de bloqueo) para el audio
 * que reproduce la app. Los navegadores que no lo soportan simplemente
 * ignoran todas las llamadas. */

const ACTIONS = ["play", "pause", "previoustrack", "nexttrack", "stop"]

function session() {
    return typeof navigator !== "undefined" ? navigator.mediaSession || null : null
}

export function updateMediaSession({ title = "", artist = "", album = "", state = "none", onPlay, onPause, onNext, onPrev, onStop } = {}) {
    const media = session()
    if (!media) return
    try {
        if (typeof MediaMetadata === "function") {
            media.metadata = new MediaMetadata({ title, artist, album })
        }
        if (state === "playing" || state === "paused" || state === "none") {
            media.playbackState = state
        }
        const handlers = { play: onPlay, pause: onPause, nexttrack: onNext, previoustrack: onPrev, stop: onStop }
        for (const action of ACTIONS) {
            const handler = typeof handlers[action] === "function" ? handlers[action] : null
            try {
                media.setActionHandler(action, handler)
            } catch (_) {
                // Algunos navegadores no permiten quitar ciertas acciones.
            }
        }
    } catch (error) {
        console.warn("[media-session] No se pudo actualizar el reproductor del sistema:", error)
    }
}

export function clearMediaSession() {
    const media = session()
    if (!media) return
    try {
        media.metadata = null
        media.playbackState = "none"
        for (const action of ACTIONS) {
            try {
                media.setActionHandler(action, null)
            } catch (_) {
                // Acción no soportada: se ignora.
            }
        }
    } catch (_) {
        // Navegador sin soporte real: se ignora.
    }
}
