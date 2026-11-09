import { resolveSessionUser } from "../offline/session.js"
import { createNotionEmbedRepository } from "./repository.js"
import { normalizeNotionUrl, normalizeTitle } from "./model.js"
import { loadingMarkup } from "../ui-status.js"

const byId = id => document.getElementById(id)
let initialized = false
let supabaseClient = null
let repository = null
const state = { user: null, embeds: null, loading: false, editingId: null }

function storageErrorMessage(error, action) {
    const detail = error?.message || "Unknown Supabase error"
    if (error?.code === "PGRST205" || error?.code === "42P01" || /could not find the table|relation .* does not exist/i.test(detail)) {
        return `No existe la tabla user_notion_pages en Supabase. Ejecuta supabase/notion_embeds.sql. Detalle: ${detail}`
    }
    return `${action}. Detalle de Supabase: ${detail}`
}

function showStatus(message, isError = false) {
    const status = byId("notion-embed-status")
    if (!status) return
    status.textContent = message || ""
    status.classList.toggle("error", isError)
    status.classList.toggle("hidden", !message)
    clearTimeout(showStatus.timer)
    if (message) {
        showStatus.timer = setTimeout(() => status.classList.add("hidden"), 6000)
    }
}

function setFormBusy(busy) {
    const form = byId("notion-embed-form")
    if (!form) return
    for (const control of form.elements) {
        if (control.tagName !== "BUTTON" || control.type === "submit") control.disabled = busy
    }
    const submit = form.querySelector('[type="submit"]')
    if (submit) submit.textContent = busy ? "Guardando…" : state.editingId ? "Guardar cambios" : "Guardar iframe"
}

function resetForm() {
    const form = byId("notion-embed-form")
    if (!form) return
    form.reset()
    form.elements.id.value = ""
    state.editingId = null
    byId("cancel-notion-edit")?.classList.add("hidden")
    const submit = form.querySelector('[type="submit"]')
    if (submit) submit.textContent = "Guardar iframe"
    byId("notion-name-hint").textContent = "Opcional · Si no escribes nombre, usaremos el título de la página."
    byId("notion-url-input")?.focus()
}

function emptyState(message = "Aún no has guardado páginas de Notion.") {
    const empty = document.createElement("div")
    empty.className = "empty notion-embed-empty"
    empty.textContent = message
    return empty
}

function createIconButton(label, text) {
    const button = document.createElement("button")
    button.type = "button"
    button.className = "icon-button"
    button.textContent = text
    button.title = label
    button.setAttribute("aria-label", label)
    return button
}

function renderEmbeds() {
    const list = byId("notion-embed-list")
    const count = byId("notion-embed-count")
    if (!list) return
    list.replaceChildren()

    const embeds = state.embeds || []
    if (count) count.textContent = String(embeds.length)

    if (!state.user) {
        list.append(emptyState("Inicia sesión para guardar tus páginas de Notion en tu cuenta."))
        return
    }
    if (!embeds.length) {
        list.append(emptyState("Pega el enlace público de Notion arriba y pulsa «Guardar iframe»."))
        return
    }

    embeds.forEach((embed, index) => {
        const card = document.createElement("article")
        card.className = "notion-embed-card"
        card.dataset.id = embed.id

        const header = document.createElement("div")
        header.className = "notion-embed-header"

        const heading = document.createElement("div")
        heading.className = "notion-embed-heading"
        const title = document.createElement("h3")
        title.textContent = embed.title || "Página de Notion"
        const open = document.createElement("a")
        open.className = "notion-embed-open"
        open.href = embed.url
        open.target = "_blank"
        open.rel = "noopener noreferrer"
        open.textContent = "Abrir en Notion ↗"
        heading.append(title, open)

        const actions = document.createElement("div")
        actions.className = "item-actions notion-embed-actions"
        const edit = createIconButton(`Editar ${embed.title || "página de Notion"}`, "✏️")
        edit.addEventListener("click", () => beginEdit(embed))
        const remove = createIconButton(`Eliminar ${embed.title || "página de Notion"}`, "🗑️")
        remove.classList.add("delete")
        remove.addEventListener("click", () => deleteEmbed(embed))
        actions.append(edit, remove)
        header.append(heading, actions)

        const frame = document.createElement("iframe")
        frame.className = "notion-embed-frame"
        frame.title = embed.title || `Página de Notion ${index + 1}`
        frame.src = embed.url
        frame.loading = "lazy"
        frame.referrerPolicy = "no-referrer"
        frame.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox")

        const note = document.createElement("p")
        note.className = "notion-embed-note"
        note.textContent = "Si se ve en blanco, revisa que el enlace sea público en Notion («Compartir» → «Publish to web») o pulsa «Abrir en Notion»."

        card.append(header, frame, note)
        list.append(card)
    })
}

async function loadEmbeds() {
    const list = byId("notion-embed-list")
    if (!list || !repository) return
    if (state.loading) return
    state.loading = true
    list.innerHTML = `<div class="empty">${loadingMarkup("Cargando páginas de Notion…")}</div>`
    try {
        state.user = state.user || await resolveSessionUser(supabaseClient)
        state.embeds = state.user ? await repository.list(state.user.id) : []
        renderEmbeds()
    } catch (error) {
        console.error("Unable to load Notion embeds", error)
        state.embeds = []
        list.replaceChildren(emptyState("No se pudieron cargar las páginas guardadas."))
        showStatus(storageErrorMessage(error, "No se pudieron cargar las páginas de Notion"), true)
    } finally {
        state.loading = false
    }
}

function beginEdit(embed) {
    const form = byId("notion-embed-form")
    if (!form) return
    state.editingId = embed.id
    form.elements.id.value = embed.id
    form.elements.title.value = embed.title || ""
    form.elements.url.value = embed.url
    byId("cancel-notion-edit")?.classList.remove("hidden")
    const submit = form.querySelector('[type="submit"]')
    if (submit) submit.textContent = "Guardar cambios"
    byId("notion-name-hint").textContent = "Estás editando una página guardada."
    showStatus("")
    form.elements.url.focus()
}

async function deleteEmbed(embed) {
    if (!window.confirm(`¿Eliminar «${embed.title || "Página de Notion"}» de tus páginas guardadas?`)) return
    try {
        await repository.remove(state.user.id, embed.id)
        state.embeds = (state.embeds || []).filter(item => item.id !== embed.id)
        renderEmbeds()
        showStatus("Página eliminada.")
    } catch (error) {
        console.error("Unable to delete Notion embed", error)
        showStatus(storageErrorMessage(error, "No se pudo eliminar la página de Notion"), true)
    }
}

function setupEvents() {
    const form = byId("notion-embed-form")
    if (!form) return
    form.addEventListener("submit", async event => {
        event.preventDefault()
        const elements = form.elements
        const normalized = normalizeNotionUrl(elements.url.value)
        if (normalized.error) {
            showStatus(normalized.error, true)
            elements.url.focus()
            return
        }
        const title = normalizeTitle(elements.title.value, normalized.url)
        setFormBusy(true)
        try {
            state.user = state.user || await resolveSessionUser(supabaseClient)
            if (!state.user) {
                showStatus("No se encontró una sesión activa. Inicia sesión e inténtalo de nuevo.", true)
                return
            }
            const id = state.editingId || elements.id.value || null
            const saved = await repository.save(state.user.id, { title, url: normalized.url }, id)
            const current = state.embeds || []
            state.embeds = id ? current.map(item => item.id === id ? saved : item) : [...current, saved]
            renderEmbeds()
            resetForm()
            showStatus(id ? "Cambios guardados." : "Página guardada. El iframe ya aparece en tu colección.")
        } catch (error) {
            console.error("Unable to save Notion embed", error)
            showStatus(storageErrorMessage(error, "No se pudo guardar la página de Notion"), true)
        } finally {
            setFormBusy(false)
        }
    })
    byId("cancel-notion-edit")?.addEventListener("click", resetForm)
    document.querySelectorAll('.tab[data-screen="notion"]').forEach(tab => tab.addEventListener("click", () => {
        loadEmbeds().catch(error => console.warn("[notion-embeds] Error al recargar las páginas:", error))
    }))
}

export async function initializeNotionEmbeds(supabase) {
    if (initialized) return
    initialized = true
    supabaseClient = supabase
    repository = createNotionEmbedRepository(supabase)
    setupEvents()
    // No bloquea la app: las páginas aparecen en la pestaña y se leen del
    // espejo local si no hay conexión.
    loadEmbeds().catch(error => console.warn("[notion-embeds] No se pudieron preparar las páginas de Notion:", error))
}
