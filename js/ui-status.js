const AI_STATUS_ID = "ai-request-status"
let activeAIRequests = 0

function hasDom() {
    return typeof document !== "undefined" && !!document.body
}

function resolveTarget(target) {
    if (!hasDom()) return null
    return typeof target === "string" ? document.getElementById(target) : target
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
}

export function loadingMarkup(message = "Cargando…") {
    return `<span class="ui-spinner" aria-hidden="true"></span><span>${escapeHtml(message)}</span>`
}

/**
 * Muestra un loader dentro de un elemento dedicado (normalmente oculto por defecto).
 * No lo uses sobre listas cuyo contenido vaya a renderizarse después: usa loadingMarkup.
 */
export function showLoading(target, message = "Cargando…") {
    const element = resolveTarget(target)
    if (!element) return null
    element.classList.remove("hidden")
    element.innerHTML = loadingMarkup(message)
    element.setAttribute("role", "status")
    element.setAttribute("aria-live", "polite")
    return element
}

export function hideLoading(target) {
    const element = resolveTarget(target)
    if (!element) return
    element.classList.add("hidden")
    element.replaceChildren()
}

/**
 * Estado persistente para cualquier solicitud a la IA.
 * Es ref-counted: si hay dos solicitudes a la vez, el aviso no desaparece
 * hasta que termina la última.
 */
export function beginAIRequest(message = "Solicitando a la IA…") {
    if (!hasDom()) {
        return { update() {}, end() {} }
    }
    activeAIRequests += 1
    const status = ensureAIStatus()
    updateAIStatus(message)
    document.body.classList.add("ai-request-active")

    let ended = false
    return {
        update(nextMessage) {
            if (ended || !nextMessage) return
            updateAIStatus(nextMessage)
        },
        end() {
            if (ended) return
            ended = true
            activeAIRequests = Math.max(0, activeAIRequests - 1)
            if (activeAIRequests === 0) {
                document.getElementById(AI_STATUS_ID)?.classList.add("hidden")
                document.body.classList.remove("ai-request-active")
            }
        }
    }
}

export function updateAIStatus(message) {
    if (!message || !hasDom()) return
    const status = ensureAIStatus()
    if (!status) return
    status.classList.remove("hidden")
    const label = status.querySelector("[data-ai-status-message]")
    if (label) label.textContent = message
}

export function isAIRequestActive() {
    return activeAIRequests > 0
}

function ensureAIStatus() {
    if (!hasDom()) return null
    let status = document.getElementById(AI_STATUS_ID)
    if (status) return status

    status = document.createElement("div")
    status.id = AI_STATUS_ID
    status.className = "ui-ai-status hidden"
    status.setAttribute("role", "status")
    status.setAttribute("aria-live", "polite")
    status.innerHTML = '<span class="ui-spinner" aria-hidden="true"></span><span data-ai-status-message>Solicitando a la IA…</span>'
    document.body.appendChild(status)
    return status
}
