import { store } from "../config.js"
import { resolveSessionUser } from "../offline/session.js"
import { playAudioEnhanced } from "../audio.js"
import { showToast } from "../cache.js"
import {
    availableMemberIdentities,
    collectWordCandidates,
    filterCandidates,
    isVerbCatalogLoaded,
    pruneUnavailableMembers,
    syncGroupWithCatalog
} from "./candidates.js"
import { missingTranslationCandidates } from "./similarity.js"
import { requireSession } from "../auth-required.js"
import {
    addMember,
    createDraftGroup,
    findMemberByIdentity,
    normalizeGroup,
    relationshipWith,
    removeExample,
    removeMember,
    sameIdentity,
    setRelationship,
    SYNCED_FIELDS,
    syncedFieldsFrom,
    updateMember,
    upsertExample
} from "./model.js"
import { createWordGroupRepository } from "./repository.js"
import { deleteMemberFromCatalog, pushMemberToCatalog } from "./catalog-bridge.js"

const byId = id => document.getElementById(id)
let initialized = false
let supabaseClient = null
let repository = null

const state = {
    user: null,
    groups: [],
    loaded: false,
    loadPromise: null,
    draft: null,
    activeMemberId: null,
    dirty: false,
    statusMessage: "",
    statusError: false,
    candidates: [],
    candidateQuery: "",
    syncedCount: 0,
    syncedByGroup: new Map(),
    editedMemberIds: new Set()
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;")
}

function escapeAttr(value) {
    return escapeHtml(value).replace(/"/g, "&quot;")
}

function el(tag, className = "", text) {
    const element = document.createElement(tag)
    if (className) element.className = className
    if (text !== undefined) element.textContent = text
    return element
}

function modalStatus(message, isError = false) {
    state.statusMessage = message || ""
    state.statusError = isError
    const status = byId("word-groups-status")
    if (status) {
        status.textContent = state.statusMessage
        status.classList.toggle("error", isError)
    }
}

function setDirty(dirty) {
    state.dirty = dirty
    const save = byId("word-groups-save")
    if (save) save.textContent = dirty ? "Guardar cambios *" : "Guardar grupo"
}

/* Marca un miembro tocado para empujar solo esos datos a la tabla principal al
 * guardar, sin sobrescribir los demás con copias antiguas. */
function markMemberEdited(memberId) {
    if (memberId) state.editedMemberIds.add(String(memberId))
}

function currentMember() {
    return state.draft?.members.find(member => String(member.id) === String(state.activeMemberId)) || null
}

function cloneGroup(group) {
    return normalizeGroup(JSON.parse(JSON.stringify(group)))
}

function ensureCandidates() {
    state.candidates = collectWordCandidates()
    return state.candidates
}

function reconcileGroupAgainstCatalog(group, candidates = null, report = false) {
    if (!store.categoriesData?.length) return group
    const list = candidates || ensureCandidates()
    const preserveVerbs = !isVerbCatalogLoaded()
    const pruned = normalizeGroup(pruneUnavailableMembers(group, availableMemberIdentities(list), { preserveVerbs }))
    const { group: synced, changed } = syncGroupWithCatalog(pruned, list)
    const result = changed ? normalizeGroup(synced) : pruned
    if (typeof report === "function") report(changed)
    else if (report) state.syncedCount = changed
    return result
}

/* El catálogo se carga justo después de inicializar este módulo. Si el usuario
 * abre un grupo muy rápido, esperamos unos instantes para comparar con los
 * datos vivos en vez de mostrar la copia guardada. */
async function waitForCatalog() {
    for (let attempt = 0; attempt < 30 && !store.categoriesData?.length; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 100))
    }
}

/* Agrega como miembros los términos con al menos una traducción equivalente.
 * Las palabras ya presentes o idénticas se omiten. */
function autoAddTranslationMatches(group, target) {
    if (!group || !target) return { group, added: 0 }
    const candidates = ensureCandidates()
    const missing = missingTranslationCandidates(candidates, target, group)
    let next = group
    let added = 0
    for (const candidate of missing) {
        const result = addMember(next, candidate)
        if (result.added) {
            next = result.group
            added += 1
        }
    }
    return { group: next, added }
}

function countMissingTranslationMatches(group, target) {
    if (!group || !target) return 0
    return missingTranslationCandidates(ensureCandidates(), target, group).length
}

function findMemberForPayload(group, payload) {
    const byId = findMemberByIdentity(group, payload)
    if (byId) return byId
    const needle = String(payload?.word || "").trim().toLowerCase()
    return group.members.find(member => String(member.word || "").trim().toLowerCase() === needle) || null
}

function relatedGroups(payload) {
    return (state.groups || []).filter(group => findMemberForPayload(group, payload))
}

async function ensureLoaded() {
    if (state.loaded) return true
    if (state.loadPromise) return state.loadPromise
    state.loadPromise = (async () => {
        state.user = state.user || await resolveSessionUser(supabaseClient)
        const groups = state.user && repository ? await repository.list(state.user.id) : []
        const candidates = store.categoriesData?.length ? ensureCandidates() : null
        state.groups = groups.map(group => {
            if (!candidates) return group
            let changed = 0
            const reconciled = reconcileGroupAgainstCatalog(group, candidates, count => { changed = count })
            if (changed) state.syncedByGroup.set(group.id, changed)
            return reconciled
        })
        state.loaded = true
        state.loadPromise = null
        return true
    })().catch(error => {
        console.warn("[word-groups] No se pudieron cargar los grupos:", error)
        state.groups = []
        state.loaded = true
        state.loadPromise = null
        return true
    })
    return state.loadPromise
}

function renderInlineWordEditButton(text, item) {
    if (!item || typeof item !== "object") return ""
    if (String(item.id ?? "").startsWith("temp_")) return ""
    const encoded = encodeURIComponent(JSON.stringify({
        field: "word",
        current: String(text || ""),
        item
    }))
    return `<button type="button" class="icon-button word-edit-button" onclick="event.stopPropagation(); window.editWordInline(decodeURIComponent('${encoded}'))" title="Editar palabra" aria-label="Editar palabra ${escapeHtml(text)}">✏️</button>`
}

export function renderGroupWordButton(text, payload, className = "", editItem = null, editButtonHtml = null) {
    const encoded = encodeURIComponent(JSON.stringify(payload || {}))
    const extra = className ? ` ${className}` : ""
    const editButton = editButtonHtml === null
        ? renderInlineWordEditButton(text, editItem)
        : editButtonHtml
    const trigger = `<button type="button" class="word-group-trigger${extra}" data-word-group-open="true" data-word-group-payload="${escapeAttr(encoded)}" title="Ver palabras similares y diferencias" aria-label="Ver palabras similares a ${escapeHtml(text)}"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false"><path fill="currentColor" d="M10.8 6.2l4.5 4.5-4.5 4.5-1.4-1.4 3.1-3.1-3.1-3.1 1.4-1.4zm5.2 1.4l1.4 1.4-2.9 2.9 2.9 2.9-1.4 1.4-4.3-4.3 4.3-4.3z"/></svg><span>${escapeHtml(text)}</span></button>`
    const audio = `<button type="button" class="icon-button audio-button word-group-audio" onclick="window.playAudioFromGlobal('${String(text || "").replace(/'/g, "\\'").replace(/"/g, '&quot;')}', 'en')" title="Escuchar palabra" aria-label="Escuchar ${escapeHtml(text)}">🔊</button>`
    return `<span class="word-group-stack">${trigger}${editButton}${audio}</span>`
}

export function renderSpeakerButton(text, lang = "en", label = "Escuchar") {
    const escaped = String(text || "").replace(/'/g, "\\'").replace(/"/g, "&quot;")
    return `<button type="button" class="icon-button audio-button" onclick="window.playAudioFromGlobal('${escaped}', '${lang}')" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">🔊</button>`
}

function decodePayload(encoded) {
    try {
        return JSON.parse(decodeURIComponent(encoded))
    } catch (error) {
        console.warn("[word-groups] Payload inválido:", error)
        return null
    }
}

function renderMemberButton(member) {
    const button = el("button", "word-groups-member")
    button.type = "button"
    button.textContent = member.word || "Palabra"
    button.classList.toggle("active", String(member.id) === String(state.activeMemberId))
    button.addEventListener("click", () => openEditorDialog(member.id, "all"))
    return button
}

function candidateSourceInfo(candidate) {
    const source = candidate.source
    if (source === "verb") return { kind: "verbo", type: "Verbo", shortType: "Verbo", origin: "Verbos", shortOrigin: "V" }
    if (source === "custom") return { kind: "personal", type: "Personal", shortType: "Tuyo", origin: "Tu lista", shortOrigin: "T" }
    if (source === "inline") return { kind: "inline", type: "En línea", shortType: "Directo", origin: "En línea", shortOrigin: "D" }
    return { kind: "adjetivo", type: candidate.partOfSpeech || "Adjetivo", shortType: "Adj.", origin: "Catálogo", shortOrigin: "C" }
}

function appendHighlightedText(parent, text, query) {
    const value = String(text ?? "")
    const needle = String(query ?? "").trim()
    if (!needle) {
        parent.textContent = value
        return
    }
    const haystack = value.toLocaleLowerCase("es")
    const target = needle.toLocaleLowerCase("es")
    let from = 0
    let index = haystack.indexOf(target, from)
    while (index !== -1) {
        if (index > from) parent.append(document.createTextNode(value.slice(from, index)))
        parent.append(el("mark", "word-group-candidate-highlight", value.slice(index, index + target.length)))
        from = index + target.length
        index = haystack.indexOf(target, from)
    }
    if (from < value.length) parent.append(document.createTextNode(value.slice(from)))
}

function renderCandidates() {
    const host = byId("word-group-candidate-results")
    if (!host) return
    const count = byId("word-group-candidate-count")
    const query = state.candidateQuery.trim()
    if (!query) {
        if (count) count.textContent = ""
        host.replaceChildren(el("p", "word-group-search-hint", "Escribe para buscar en adjetivos, verbos y tus palabras guardadas."))
        return
    }
    const candidates = filterCandidates(state.candidates, query, 40)
    if (count) count.textContent = candidates.length ? `${candidates.length} resultado${candidates.length === 1 ? "" : "s"}` : "0 resultados"
    host.replaceChildren()
    if (!candidates.length) {
        host.append(el("p", "word-group-search-empty", "No hay resultados con ese texto."))
        return
    }
    for (const candidate of candidates) {
        const existing = findMemberByIdentity(state.draft, candidate)
        const info = candidateSourceInfo(candidate)
        const button = el("button", `word-group-candidate word-group-candidate--${info.kind}`)
        button.type = "button"
        button.disabled = !!existing
        button.setAttribute("aria-label", `${existing ? "Ya está en el grupo" : "Agregar al grupo"}: ${candidate.word || "Palabra"} (${info.type}, ${info.origin})`)

        const top = el("span", "word-group-candidate-top")
        const type = el("span", "word-group-candidate-type", info.type)
        type.dataset.short = info.shortType
        const status = el("span", "word-group-candidate-status", existing ? "✓ Ya está" : "＋ Agregar")
        status.dataset.short = existing ? "✓" : "＋"
        top.append(type, status)

        const word = el("span", "word-group-candidate-word")
        appendHighlightedText(word, candidate.word || "Palabra", query)

        const detail = el("span", "word-group-candidate-detail")
        if (candidate.spanish) {
            const translation = el("span", "word-group-candidate-translation")
            appendHighlightedText(translation, candidate.spanish, query)
            detail.append(translation)
        }
        if (candidate.pronunciation) detail.append(el("span", "word-group-candidate-pron", candidate.pronunciation))
        if (!detail.childNodes.length) detail.append(el("span", "word-group-candidate-translation word-group-candidate-translation--empty", "Sin traducción"))

        const context = el("span", "word-group-candidate-context")
        appendHighlightedText(context, candidate.context || info.origin, query)
        const origin = el("span", "word-group-candidate-origin", info.origin)
        origin.dataset.short = info.shortOrigin

        button.append(top, word, detail, context, origin)
        button.addEventListener("click", () => {
            const result = addMember(state.draft, candidate)
            if (!result.added) {
                modalStatus("Esta palabra ya está en el grupo.")
                renderCandidates()
                return
            }
            state.draft = result.group
            state.activeMemberId = result.member.id
            state.candidateQuery = ""
            setDirty(true)
            renderDialog()
        })
        host.append(button)
    }
}

function renderExamples(onStructureChange = null) {
    const host = byId("word-group-examples-list")
    if (!host) return
    host.replaceChildren()
    const member = currentMember()
    if (!member) return
    if (!member.examples.length) {
        host.append(el("div", "word-group-examples-empty", "Todavía no hay ejemplos."))
        return
    }
    member.examples.forEach((example, index) => {
        const item = el("div", "word-group-example")

        const head = el("div", "word-group-example-head")
        head.append(el("span", "word-group-example-index", String(index + 1)))
        head.append(el("span", "word-group-example-caption", index === 0 ? "Ejemplo principal" : `Ejemplo ${index + 1}`))
        const tools = el("div", "word-group-example-tools")
        const audio = el("button", "icon-button audio-button", "🔊")
        audio.type = "button"
        audio.title = "Escuchar ejemplo"
        audio.setAttribute("aria-label", `Escuchar ejemplo ${index + 1}`)
        audio.addEventListener("click", () => playAudioEnhanced(example.en, "en"))
        const remove = el("button", "icon-button delete", "🗑️")
        remove.type = "button"
        remove.title = "Eliminar ejemplo"
        remove.setAttribute("aria-label", `Eliminar ejemplo ${index + 1}`)
        remove.addEventListener("click", () => {
            state.draft = removeExample(state.draft, member.id, example.id)
            markMemberEdited(member.id)
            setDirty(true)
            if (onStructureChange) onStructureChange()
            else renderDialog()
        })
        tools.append(audio, remove)
        head.append(tools)

        const fields = el("div", "word-group-example-fields")
        const enWrap = el("label", "word-group-example-field")
        enWrap.append(el("span", "word-group-example-lang", "EN · Inglés"))
        const en = el("textarea", "word-group-example-en")
        en.value = example.en || ""
        en.rows = 2
        en.maxLength = 1000
        en.placeholder = "Escribe el ejemplo en inglés…"
        en.setAttribute("aria-label", `Ejemplo en inglés ${index + 1}`)
        en.addEventListener("input", () => {
            const updated = state.draft.members.map(row => String(row.id) === String(member.id)
                ? { ...row, examples: row.examples.map(ex => String(ex.id) === String(example.id) ? { ...ex, en: en.value } : ex) }
                : row)
            state.draft = { ...state.draft, members: updated }
            markMemberEdited(member.id)
            setDirty(true)
        })
        enWrap.append(en)

        const esWrap = el("label", "word-group-example-field")
        esWrap.append(el("span", "word-group-example-lang", "ES · Español"))
        const es = el("textarea", "word-group-example-es")
        es.value = example.es || ""
        es.rows = 2
        es.maxLength = 1000
        es.placeholder = "Su traducción al español…"
        es.setAttribute("aria-label", `Traducción del ejemplo ${index + 1}`)
        es.addEventListener("input", () => {
            const updated = state.draft.members.map(row => String(row.id) === String(member.id)
                ? { ...row, examples: row.examples.map(ex => String(ex.id) === String(example.id) ? { ...ex, es: es.value } : ex) }
                : row)
            state.draft = { ...state.draft, members: updated }
            markMemberEdited(member.id)
            setDirty(true)
        })
        esWrap.append(es)

        fields.append(enWrap, esWrap)
        item.append(head, fields)
        host.append(item)
    })
}

function renderRelationshipRows() {
    const host = byId("word-group-relationships")
    if (!host) return
    host.replaceChildren()
    const member = currentMember()
    if (!member) return
    const others = state.draft.members.filter(row => String(row.id) !== String(member.id))
    if (!others.length) {
        host.append(el("p", "word-group-empty-help", "Agrega otra palabra similar para compararlas."))
        return
    }
    const interchangeable = []
    const notInterchangeable = []
    for (const other of others) {
        const status = relationshipWith(state.draft, member.id, other.id)
        const row = el("label", "word-group-relationship")
        const name = el("span", "word-group-relationship-word", other.word)
        const select = el("select", "word-group-relationship-select")
        select.innerHTML = `<option value="none">Sin marcar</option><option value="interchangeable">Intercambiable</option><option value="not-interchangeable">No intercambiable</option>`
        select.value = status
        select.addEventListener("change", () => {
            state.draft = setRelationship(state.draft, member.id, other.id, select.value)
            setDirty(true)
            renderRelationshipRows()
        })
        row.append(name, select)
        host.append(row)
        if (status === "interchangeable") interchangeable.push(other.word)
        else if (status === "not-interchangeable") notInterchangeable.push(other.word)
    }
    const summary = el("p", "word-group-relationship-summary")
    summary.textContent = [
        interchangeable.length ? `Sí: ${interchangeable.join(", ")}` : "",
        notInterchangeable.length ? `No: ${notInterchangeable.join(", ")}` : ""
    ].filter(Boolean).join("  ·  ")
    if (summary.textContent) host.append(summary)
}

function bindEditor(onStructureChange = null) {
    const member = currentMember()
    if (!member) return

    const bindField = (id, field, isSelect = false) => {
        const element = byId(id)
        if (!element) return
        element.value = member[field] || ""
        const event = isSelect ? "change" : "input"
        element.addEventListener(event, () => {
            state.draft = updateMember(state.draft, member.id, { [field]: element.value })
            if (SYNCED_FIELDS.includes(field)) markMemberEdited(member.id)
            setDirty(true)
        })
    }

    bindField("word-group-word-input", "word")
    bindField("word-group-pronunciation-input", "pronunciation")
    bindField("word-group-spanish-input", "spanish")
    bindField("word-group-part-input", "partOfSpeech", true)
    bindField("word-group-position-input", "position")
    bindField("word-group-uses-input", "uses")
    bindField("word-group-difference-input", "difference")

    byId("word-group-audio-button")?.addEventListener("click", () => playAudioEnhanced(member.word, "en"))
    byId("word-group-add-example")?.addEventListener("click", () => {
        const empty = { id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, en: "", es: "" }
        state.draft = upsertExample(state.draft, member.id, empty)
        markMemberEdited(member.id)
        setDirty(true)
        if (onStructureChange) onStructureChange()
        else renderDialog()
    })
}

function relationshipSummaryFor(member) {
    const interchangeable = []
    const notInterchangeable = []
    for (const other of state.draft.members) {
        if (String(other.id) === String(member.id)) continue
        const status = relationshipWith(state.draft, member.id, other.id)
        if (status === "interchangeable") interchangeable.push(other.word)
        else if (status === "not-interchangeable") notInterchangeable.push(other.word)
    }
    return { interchangeable, notInterchangeable }
}

function renderExamplesCell(member) {
    const cell = el("div", "word-groups-table-examples")
    if (!member.examples.length) {
        cell.append(el("p", "word-groups-table-empty", "Sin ejemplos aún."))
        return cell
    }
    member.examples.forEach((example, index) => {
        const block = el("div", "word-groups-table-example")
        const en = el("span", "word-groups-table-example-en", `${index + 1}. ${example.en || "Sin ejemplo en inglés."}`)
        const es = el("span", "word-groups-table-example-es", example.es ? `↳ ${example.es}` : "")
        const audio = el("button", "word-groups-table-example-audio", "🔊")
        audio.type = "button"
        audio.title = "Escuchar ejemplo"
        audio.setAttribute("aria-label", `Escuchar ejemplo ${index + 1}`)
        audio.addEventListener("click", event => {
            event.stopPropagation()
            playAudioEnhanced(example.en, "en")
        })
        block.append(en, es, audio)
        cell.append(block)
    })
    return cell
}

function renderAutoPanel() {
    const panel = byId("word-groups-autos-panel")
    if (!panel) return
    const target = currentMember()
    const missing = target ? missingTranslationCandidates(ensureCandidates(), target, state.draft) : []
    const list = panel.querySelector(".word-groups-autos-list")
    if (!list) return
    list.textContent = ""
    if (!missing.length) {
        list.append(el("p", "", "No hay coincidencias pendientes con esta traducción."))
        return
    }
    missing.forEach(candidate => {
        const row = el("div", "word-groups-autos-row")
        row.append(el("span", "word-groups-autos-word", candidate.word || ""))
        if (candidate.pronunciation) row.append(el("span", "word-groups-autos-pron", ` [${candidate.pronunciation}]`))
        if (candidate.spanish) row.append(el("span", "word-groups-autos-es", ` — ${candidate.spanish}`))
        const add = el("button", "button secondary word-groups-autos-add", `➕ Agregar ${candidate.word || ""}`)
        add.type = "button"
        add.title = `Agregar ${candidate.word || ""}`
        add.setAttribute("aria-label", add.title)
        add.addEventListener("click", event => {
            event.stopPropagation()
            const result = addMember(state.draft, candidate)
            if (result.added) {
                state.draft = result.group
                state.activeMemberId = target?.id || state.activeMemberId
                setDirty(true)
                renderAutoPanel()
            }
        })
        row.append(add)
        row.addEventListener("click", event => {
            if (!event.target.closest("button")) add.click()
        })
        list.append(row)
    })
}

let autoPickerDialog = null
function openAutoPicker() {
    if (autoPickerDialog) autoPickerDialog.remove()
    const dialog = el("dialog", "word-groups-autos-picker")
    dialog.id = "word-groups-autos-picker"

    const shell = el("div", "word-groups-autos-shell")
    const header = el("header", "word-groups-autos-header")
    const headerText = el("div", "word-groups-autos-heading")
    headerText.append(
        el("p", "word-groups-autos-eyebrow", "COINCIDENCIAS AUTOS"),
        el("h2", "word-groups-autos-title", "Palabras por traducción equivalente")
    )
    const closeTop = el("button", "word-groups-autos-close-top", "✕")
    closeTop.type = "button"
    closeTop.title = "Cerrar ventana"
    closeTop.setAttribute("aria-label", "Cerrar ventana")
    closeTop.addEventListener("click", () => dialog.close())
    header.append(headerText, closeTop)

    const intro = el("p", "word-groups-autos-intro", "Estas palabras comparten traducción con la palabra seleccionada. Agrégalas con ＋, quítalas con −, o cierra la ventana si no las quieres ahora.")

    const counter = el("p", "word-groups-autos-counter")
    const list = el("div", "word-groups-autos-list")

    const footer = el("footer", "word-groups-autos-footer")
    const hint = el("span", "word-groups-autos-hint", "Guarda el grupo para conservar los cambios.")
    const closeBtn = el("button", "button secondary word-groups-autos-close", "Cerrar ventana")
    closeBtn.type = "button"
    closeBtn.addEventListener("click", () => dialog.close())
    footer.append(hint, closeBtn)

    shell.append(header, intro, counter, list, footer)
    dialog.append(shell)
    document.body.appendChild(dialog)
    autoPickerDialog = dialog
    dialog.addEventListener("close", () => { if (autoPickerDialog === dialog) autoPickerDialog = null })

    const target = currentMember()
    const missing = target ? missingTranslationCandidates(ensureCandidates(), target, state.draft) : []

    const renderList = () => {
        list.textContent = ""
        const addedCount = missing.filter(candidate => findMemberByIdentity(state.draft, candidate)).length
        counter.textContent = `${missing.length} ${missing.length === 1 ? "palabra" : "palabras"} · ${addedCount} agregada${addedCount === 1 ? "" : "s"}`

        if (!missing.length) {
            list.append(el("p", "word-groups-autos-empty", "No hay coincidencias pendientes con esta traducción."))
            return
        }

        missing.forEach((candidate, index) => {
            const row = el("div", "word-groups-autos-row")
            const info = el("div", "word-groups-autos-info")
            const headline = el("div", "word-groups-autos-line")
            headline.append(el("span", "word-groups-autos-index", String(index + 1)), el("span", "word-groups-autos-word", candidate.word || ""))
            info.append(headline)
            const meta = el("div", "word-groups-autos-meta")
            if (candidate.pronunciation) meta.append(el("span", "word-groups-autos-pron", `/${candidate.pronunciation}/`))
            if (candidate.spanish) meta.append(el("span", "word-groups-autos-es", candidate.spanish))
            info.append(meta)
            row.append(info)

            const actions = el("div", "word-groups-autos-actions")
            const existing = findMemberByIdentity(state.draft, candidate)
            const add = el("button", "word-groups-autos-add", existing ? "✓ Agregada" : "＋ Agregar")
            add.type = "button"
            add.classList.add(existing ? "is-added" : "is-add")
            add.disabled = Boolean(existing)
            add.addEventListener("click", () => {
                const result = addMember(state.draft, candidate)
                if (result.added) {
                    state.draft = result.group
                    setDirty(true)
                    renderList()
                }
            })
            const remove = el("button", "word-groups-autos-remove", "− Quitar")
            remove.type = "button"
            remove.disabled = !existing
            remove.addEventListener("click", () => {
                if (!existing) return
                state.draft = removeMember(state.draft, existing.id)
                setDirty(true)
                renderList()
            })
            actions.append(add, remove)
            row.append(actions)
            list.append(row)
        })
    }

    renderList()
    dialog.showModal()
}

function renderComparisonTable() {
    const wrap = el("div", "word-groups-table-wrap")
    const table = el("table", "word-groups-table")
    table.setAttribute("aria-label", "Comparación de palabras similares")
    const thead = el("thead")
    const headRow = el("tr")
    const headings = [
        "Palabra y pronunciación",
        "Traducción",
        "Diferencia y uso exacto",
        "¿Con cuáles es intercambiable?",
        "Posiciones válidas",
        "Ejemplos y traducción",
        ""
    ]
    for (const heading of headings) {
        const th = el("th", "", heading)
        th.scope = "col"
        headRow.append(th)
    }
    thead.append(headRow)

    const tbody = el("tbody")
    for (const member of state.draft.members) {
        const row = el("tr", String(member.id) === String(state.activeMemberId) ? "is-active" : "")
        row.dataset.memberId = String(member.id)

        const makeEditable = (cell, field, label) => {
            cell.classList.add("word-groups-table-cell--editable")
            cell.tabIndex = 0
            cell.setAttribute("role", "button")
            cell.setAttribute("aria-label", `Editar ${label} de ${member.word || "palabra"}`)
            cell.title = `Clic para editar ${label}`
            const open = event => {
                if (event?.target?.closest?.("button")) return
                event?.stopPropagation?.()
                openEditorDialog(member.id, field)
            }
            cell.addEventListener("click", open)
            cell.addEventListener("keydown", event => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault()
                    openEditorDialog(member.id, field)
                }
            })
            return cell
        }

        const wordCell = makeEditable(el("td", "word-groups-table-word-cell"), "word", "palabra, pronunciación y tipo")
        const wordTop = el("div", "word-groups-table-word-top")
        const wordWrap = el("div", "word-groups-table-word-wrap")
        const word = el("strong", "word-groups-table-word", member.word || "Palabra")
        const meta = el("small", "word-groups-table-meta", [
            member.pronunciation ? member.pronunciation : "",
            member.partOfSpeech || ""
        ].filter(Boolean).join(" · "))
        wordWrap.append(word, meta)
        const audio = el("button", "word-groups-table-audio", "🔊")
        audio.type = "button"
        audio.title = "Escuchar palabra"
        audio.setAttribute("aria-label", `Escuchar ${member.word}`)
        audio.addEventListener("click", event => {
            event.stopPropagation()
            playAudioEnhanced(member.word, "en")
        })
        wordTop.append(wordWrap, audio)
        wordCell.append(wordTop)

        const translationCell = makeEditable(
            el("td", `word-groups-table-translation${member.spanish ? "" : " is-empty"}`, member.spanish || "Sin traducción"),
            "spanish",
            "traducción"
        )

        const differenceCell = makeEditable(el("td", "word-groups-table-cell-wrap"), "difference", "diferencia y usos")
        const difference = el("p", "word-groups-table-difference", member.difference || "Sin diferencia registrada.")
        const uses = el("p", "word-groups-table-uses", member.uses || "Sin usos registrados.")
        differenceCell.append(difference, uses)

        const relationshipsCell = makeEditable(el("td", "word-groups-table-cell-wrap word-groups-table-relationships"), "relationships", "intercambiabilidad")
        const relations = relationshipSummaryFor(member)
        if (relations.interchangeable.length) {
            relationshipsCell.append(el("p", "word-groups-table-relation-yes", `Sí: ${relations.interchangeable.join(", ")}`))
        }
        if (relations.notInterchangeable.length) {
            relationshipsCell.append(el("p", "word-groups-table-relation-no", `No: ${relations.notInterchangeable.join(", ")}`))
        }
        if (!relations.interchangeable.length && !relations.notInterchangeable.length) {
            relationshipsCell.append(el("p", "word-groups-table-empty", "Todos sin marcar."))
        }

        const positionCell = makeEditable(el("td", "word-groups-table-position", member.position || "En cualquier posición"), "position", "posición")
        const examplesCell = makeEditable(el("td"), "examples", "ejemplos y traducciones")
        examplesCell.append(renderExamplesCell(member))

        const actionCell = el("td", "word-groups-table-actions")
        const actionStack = el("div", "word-groups-table-action-stack")
        const edit = el("button", "button secondary word-groups-table-edit", "Editar todo")
        edit.type = "button"
        edit.addEventListener("click", event => {
            event.stopPropagation()
            openEditorDialog(member.id, "all")
        })
        const remove = el("button", "button secondary word-groups-table-remove", "Quitar del grupo")
        remove.type = "button"
        remove.title = "Quitar esta palabra solo del grupo"
        remove.addEventListener("click", event => {
            event.stopPropagation()
            removeMemberFromDraft(member)
        })
        const del = el("button", "button danger word-groups-table-delete", "🗑️ Eliminar")
        del.type = "button"
        del.title = "Eliminar esta palabra de la tabla principal"
        del.addEventListener("click", event => {
            event.stopPropagation()
            deleteMemberEverywhere(member)
        })
        actionStack.append(edit, remove, del)
        actionCell.append(actionStack)

        wordCell.dataset.label = headings[0]
        translationCell.dataset.label = headings[1]
        differenceCell.dataset.label = headings[2]
        relationshipsCell.dataset.label = headings[3]
        positionCell.dataset.label = headings[4]
        examplesCell.dataset.label = headings[5]
        actionCell.dataset.label = headings[6]
        row.append(wordCell, translationCell, differenceCell, relationshipsCell, positionCell, examplesCell, actionCell)
        tbody.append(row)
    }
    table.append(thead, tbody)
    wrap.append(table)
    return wrap
}

const FIELD_LABELS = {
    word: "palabra, pronunciación y tipo",
    spanish: "traducción al español",
    difference: "diferencia y usos",
    relationships: "intercambiabilidad",
    position: "posiciones válidas",
    examples: "ejemplos y traducciones",
    all: "todos los datos"
}

const SECTION_META = {
    word: { icon: "🔤", title: "Palabra y pronunciación", hint: "Cómo se escribe, se pronuncia y qué tipo de palabra es." },
    spanish: { icon: "🌐", title: "Traducción al español", hint: "El significado que aparece en la tabla general." },
    difference: { icon: "🧭", title: "Diferencia y uso exacto", hint: "Cuándo conviene esta palabra y cuándo no." },
    position: { icon: "📐", title: "Posiciones válidas", hint: "Escribe una posición por línea; puedes indicar varias." },
    examples: { icon: "💬", title: "Ejemplos y traducciones", hint: "Cada ejemplo en inglés junto a su traducción." },
    relationships: { icon: "🔁", title: "Intercambiabilidad", hint: "Marca con qué otras palabras se puede sustituir." }
}

const SECTION_ORDER = Object.keys(SECTION_META)
const SECTION_SHORT = {
    word: "Palabra",
    spanish: "Traducción",
    difference: "Uso",
    position: "Posiciones",
    examples: "Ejemplos",
    relationships: "Relaciones"
}

function fieldSection(field) {
    const meta = SECTION_META[field]
    const section = el("div", "word-groups-field-group")
    section.dataset.field = field
    const heading = el("div", "word-groups-field-heading")
    heading.append(el("span", "word-groups-field-icon", meta.icon))
    const text = el("div", "word-groups-field-heading-text")
    text.append(el("h4", "word-groups-field-heading-title", meta.title))
    text.append(el("p", "word-groups-field-heading-hint", meta.hint))
    heading.append(text)
    section.append(heading)
    return section
}

function renderMemberEditor(member) {
    const panel = el("div", "word-groups-editor")

    const identity = fieldSection("word")
    const wordRow = el("div", "word-groups-word-row")
    const wordWrap = el("div", "word-groups-word-wrap")
    wordWrap.append(el("label", "word-groups-field-label", "Palabra"))
    const wordInput = el("input", "word-groups-word-input")
    wordInput.id = "word-group-word-input"
    wordInput.autocomplete = "off"
    wordInput.maxLength = 300
    wordWrap.append(wordInput)
    const audioButton = el("button", "icon-button audio-button word-groups-inline-audio", "🔊")
    audioButton.id = "word-group-audio-button"
    audioButton.type = "button"
    audioButton.title = "Escuchar palabra"
    audioButton.setAttribute("aria-label", "Escuchar palabra")
    wordRow.append(wordWrap, audioButton)
    const identityGrid = el("div", "word-groups-grid")
    const pronunciationWrap = el("label", "word-groups-field")
    pronunciationWrap.append(el("span", "word-groups-field-label", "Pronunciación"))
    const pronunciation = el("input", "word-groups-input")
    pronunciation.id = "word-group-pronunciation-input"
    pronunciation.placeholder = "/bɪˈsaɪdz/"
    pronunciationWrap.append(pronunciation)
    const partWrap = el("label", "word-groups-field")
    partWrap.append(el("span", "word-groups-field-label", "Tipo de palabra"))
    const part = el("select", "word-groups-select")
    part.id = "word-group-part-input"
    part.innerHTML = `<option>Adjetivo</option><option>Verbo</option><option>Sustantivo</option><option>Adverbio</option><option>Preposición</option><option>Conector</option><option>Frase</option><option>Otro</option>`
    partWrap.append(part)
    identityGrid.append(pronunciationWrap, partWrap)
    identity.append(wordRow, identityGrid)

    const translation = fieldSection("spanish")
    const spanishWrap = el("label", "word-groups-field")
    spanishWrap.append(el("span", "word-groups-field-label", "Traducción al español"))
    const spanish = el("input", "word-groups-input")
    spanish.id = "word-group-spanish-input"
    spanish.placeholder = "Traducción"
    spanishWrap.append(spanish)
    translation.append(spanishWrap)

    const meaning = fieldSection("difference")
    const usesWrap = el("label", "word-groups-field")
    usesWrap.append(el("span", "word-groups-field-label", "Usos / dónde se coloca"))
    const uses = el("textarea", "word-groups-textarea")
    uses.id = "word-group-uses-input"
    uses.rows = 3
    uses.placeholder = "Inicio de frase, antes del verbo, después del sujeto…"
    uses.maxLength = 2000
    usesWrap.append(uses)
    const differenceWrap = el("label", "word-groups-field")
    differenceWrap.append(el("span", "word-groups-field-label", "Diferencia frente a las otras"))
    const difference = el("textarea", "word-groups-textarea")
    difference.id = "word-group-difference-input"
    difference.rows = 5
    difference.placeholder = "Explica cuándo usarla y cuándo no…"
    difference.maxLength = 2000
    differenceWrap.append(difference)
    meaning.append(usesWrap, differenceWrap)

    const positionGroup = fieldSection("position")
    const positionWrap = el("label", "word-groups-field")
    positionWrap.append(el("span", "word-groups-field-label", "Posiciones válidas"))
    const position = el("textarea", "word-groups-textarea")
    position.id = "word-group-position-input"
    position.rows = 3
    position.placeholder = "Inicio\nMedio\nDespués del verbo"
    position.maxLength = 2000
    position.setAttribute("aria-label", "Posiciones válidas, una por línea")
    positionWrap.append(position)
    positionGroup.append(positionWrap)

    const exampleGroup = fieldSection("examples")
    const addExample = el("button", "button secondary word-groups-add-example", "＋ Agregar ejemplo")
    addExample.id = "word-group-add-example"
    addExample.type = "button"
    exampleGroup.querySelector(".word-groups-field-heading")?.append(addExample)
    const examples = el("div", "word-groups-examples")
    examples.id = "word-group-examples-list"
    exampleGroup.append(examples)

    const relationshipGroup = fieldSection("relationships")
    const relationships = el("div", "word-groups-relationships")
    relationships.id = "word-group-relationships"
    relationshipGroup.append(relationships)

    panel.append(identity, translation, meaning, positionGroup, exampleGroup, relationshipGroup)
    return panel
}

function openEditorDialog(memberId, field = "all") {
    const member = state.draft?.members.find(row => String(row.id) === String(memberId))
    if (!member) return

    const snapshot = normalizeGroup(JSON.parse(JSON.stringify(state.draft)))
    const wasDirty = state.dirty
    const editedBefore = new Set(state.editedMemberIds)
    state.activeMemberId = member.id
    document.querySelectorAll("#word-groups-dialog .word-groups-table tbody tr").forEach(row => {
        row.classList.toggle("is-active", row.dataset.memberId === String(member.id))
    })

    const dialog = el("dialog", `word-groups-field-dialog word-groups-field-dialog--${field === "all" ? "full" : "single"}`)
    dialog.id = "word-groups-field-dialog"
    const shell = el("div", "word-groups-field-shell")
    const header = el("header", "word-groups-field-header")
    const headerIcon = el("span", "word-groups-field-badge", field === "all" ? "🗂️" : (SECTION_META[field]?.icon || "✏️"))
    const heading = el("div", "word-groups-field-heading-main")
    const eyebrowRow = el("div", "word-groups-field-eyebrow-row")
    eyebrowRow.append(el("p", "eyebrow word-groups-field-eyebrow", "EDITAR DATO"))
    eyebrowRow.append(el("span", "word-groups-field-count", field === "all" ? `${SECTION_ORDER.length} secciones` : (SECTION_META[field]?.title || "Campo")))
    heading.append(eyebrowRow)
    heading.append(el("h3", "word-groups-field-title", `${FIELD_LABELS[field] || "dato"}: ${member.word || "Palabra"}`))
    const subtitle = [member.pronunciation, member.spanish].filter(Boolean).join(" · ")
    heading.append(el("p", "word-groups-field-subtitle", subtitle || "Sin pronunciación ni traducción registradas."))
    const close = el("button", "word-groups-field-close", "✕")
    close.type = "button"
    close.title = "Cerrar y descartar cambios"
    close.setAttribute("aria-label", "Cerrar ventana de edición")
    header.append(headerIcon, heading, close)

    const body = el("div", "word-groups-field-body")
    const footer = el("footer", "word-groups-field-footer")
    footer.append(el("span", "word-groups-field-hint", "Esc para descartar · se aplica al grupo"))
    const actions = el("div", "word-groups-field-actions")
    const cancel = el("button", "button secondary", "✕ Descartar")
    cancel.type = "button"
    const save = el("button", "button primary", "✓ Guardar cambios")
    save.type = "button"
    actions.append(cancel, save)
    footer.append(actions)
    shell.append(header, body, footer)
    dialog.append(shell)
    document.body.append(dialog)

    const renderBody = () => {
        body.replaceChildren()
        const activeMember = currentMember()
        if (field === "all") {
            const nav = el("nav", "word-groups-field-nav")
            nav.setAttribute("aria-label", "Ir a una sección")
            SECTION_ORDER.forEach((key, index) => {
                const button = el("button", "word-groups-field-nav-item", `${SECTION_META[key].icon} ${SECTION_SHORT[key]}`)
                button.type = "button"
                button.dataset.scrollField = key
                if (index === 0) button.classList.add("active")
                nav.append(button)
            })
            body.append(nav)
        }
        const content = el("div", "word-groups-field-content")
        const context = el("div", "word-groups-field-context")
        context.append(el("span", "word-groups-field-context-label", "Editando"))
        context.append(el("strong", "word-groups-field-context-word", activeMember?.word || member.word || "Palabra"))
        if (activeMember?.partOfSpeech) context.append(el("span", "word-groups-field-context-tag", activeMember.partOfSpeech))
        content.append(context)

        const editor = renderMemberEditor(activeMember)
        editor.querySelectorAll("[data-field]").forEach(group => {
            group.hidden = field !== "all" && group.dataset.field !== field
        })
        content.append(editor)
        body.append(content)

        body.querySelectorAll("[data-scroll-field]").forEach(button => {
            button.addEventListener("click", () => {
                const target = content.querySelector(`[data-field="${button.dataset.scrollField}"]`)
                target?.scrollIntoView({ behavior: "smooth", block: "start" })
                body.querySelectorAll("[data-scroll-field]").forEach(item => item.classList.toggle("active", item === button))
            })
        })
        bindEditor(renderBody)
        renderExamples(renderBody)
        renderRelationshipRows()
        const firstField = [...content.querySelectorAll("input, select, textarea")].find(node => !node.closest("[hidden]"))
        if (firstField) window.requestAnimationFrame(() => firstField.focus())
    }

    const closeWithRevert = () => {
        state.draft = snapshot
        state.editedMemberIds = new Set(editedBefore)
        setDirty(wasDirty)
        dialog.close()
    }
    close.addEventListener("click", closeWithRevert)
    cancel.addEventListener("click", closeWithRevert)
    save.addEventListener("click", () => {
        dialog.close()
        renderDialog()
        modalStatus("Cambios aplicados al grupo.")
    })
    dialog.addEventListener("cancel", event => {
        event.preventDefault()
        closeWithRevert()
    })
    dialog.addEventListener("close", () => dialog.remove())

    renderBody()
    dialog.showModal()
}

function renderDialog() {
    const previous = byId("word-groups-dialog")
    if (previous) previous.remove()

    ensureCandidates()
    const draft = state.draft
    const member = currentMember()
    const missingByTranslation = member ? countMissingTranslationMatches(draft, member) : 0
    const dialog = el("dialog", "word-groups-dialog")
    dialog.id = "word-groups-dialog"

    const shell = el("div", "word-groups-shell")
    const header = el("header", "word-groups-header")
    const titleBlock = el("div", "word-groups-title-block")
    titleBlock.append(el("p", "eyebrow word-groups-eyebrow", "VISTA COMPARADA"))
    const titleInput = el("input", "word-groups-title-input")
    titleInput.id = "word-group-title-input"
    titleInput.maxLength = 160
    titleInput.autocomplete = "off"
    titleInput.value = draft.title
    titleInput.addEventListener("input", () => {
        state.draft = { ...state.draft, title: titleInput.value.trim() || "Grupo de palabras similares" }
        setDirty(true)
    })
    titleBlock.append(titleInput)
    const viewControls = el("div", "word-groups-view-controls")
    const viewActions = el("div", "word-groups-view-actions")
    viewActions.append(el("span", "word-groups-edit-hint", "Clic en una celda para editarla"))
    const addWord = el("button", "button secondary word-groups-add-member", "＋ Agregar")
    addWord.type = "button"
    addWord.addEventListener("click", () => {
        window.requestAnimationFrame(() => {
            const input = byId("word-group-candidate-search")
            input?.focus()
            input?.scrollIntoView({ block: "nearest" })
        })
    })
    const autoButton = el("button", "button secondary word-groups-add-member word-groups-auto-button", `👀 Autos ${missingByTranslation || ""}`.trim())
    autoButton.type = "button"
    autoButton.title = missingByTranslation
        ? `Ver ${missingByTranslation} coincidencias por traducción equivalente`
        : "No hay coincidencias pendientes con esta traducción"
    autoButton.setAttribute("aria-label", autoButton.title)
    autoButton.addEventListener("click", () => {
        openAutoPicker()
        const target = currentMember()
        const missing = target ? missingTranslationCandidates(ensureCandidates(), target, state.draft) : []
        modalStatus(missing.length ? `${missing.length} coincidencias para agregar manualmente.` : "No hay coincidencias pendientes con esta traducción.")
    })
    viewActions.append(addWord, autoButton)
    viewControls.append(viewActions)
    titleBlock.append(titleInput, viewControls)
    const close = el("button", "word-groups-close", "✕")
    close.type = "button"
    close.setAttribute("aria-label", "Cerrar ventana")
    close.addEventListener("click", closeDialog)
    header.append(titleBlock, close)

    const autoPanel = el("div", "word-groups-autos-panel")
    autoPanel.id = "word-groups-autos-panel"
    autoPanel.style.display = "grid"
    const autoLabel = el("div", "word-groups-section-label", "Coincidencias por traducción equivalente")
    const autoList = el("div", "word-groups-autos-list")
    autoList.style.display = "flex"
    autoList.style.flexDirection = "column"
    autoList.style.gap = "6px"
    autoPanel.append(autoLabel, autoList)

    const body = el("div", "word-groups-body")
    const members = el("aside", "word-groups-members")
    members.append(el("p", "word-groups-section-label", "Palabras del grupo"))
    const memberList = el("div", "word-groups-member-list")
    draft.members.forEach(item => memberList.append(renderMemberButton(item)))
    members.append(memberList)
    const searchLabel = el("label", "word-groups-search-label", "Buscar para agregar")
    const search = el("input", "word-groups-search")
    search.id = "word-group-candidate-search"
    search.type = "search"
    search.placeholder = "in addition, además, thereby…"
    search.value = state.candidateQuery
    search.autocomplete = "off"
    searchLabel.htmlFor = search.id
    search.addEventListener("input", event => {
        state.candidateQuery = event.target.value
        renderCandidates()
    })
    const searchHead = el("div", "word-groups-search-head")
    searchHead.append(searchLabel, el("span", "word-group-candidate-count"))
    const searchArea = el("div", "word-groups-search-area")
    const results = el("div", "word-groups-candidate-results")
    results.id = "word-group-candidate-results"
    searchArea.append(searchHead, search, results)
    members.append(searchArea)

    const main = el("section", "word-groups-main")
    main.append(renderComparisonTable())
    body.append(members, main)

    const footer = el("footer", "word-groups-footer")
    const status = el("small", `word-groups-status${state.statusError ? " error" : ""}`, state.statusMessage || "")
    status.id = "word-groups-status"
    const deleteActions = el("div", "word-groups-delete-actions")
    const removeGroup = el("button", "button danger word-groups-delete-group", "Eliminar grupo")
    removeGroup.type = "button"
    const removeMemberButton = el("button", "button secondary word-groups-remove-member", "Quitar esta palabra del grupo")
    removeMemberButton.type = "button"
    deleteActions.append(removeGroup, removeMemberButton)
    const actions = el("div", "word-groups-actions")
    const cancel = el("button", "button secondary", "Descartar")
    cancel.type = "button"
    cancel.addEventListener("click", closeDialog)
    const save = el("button", "button primary", state.dirty ? "Guardar cambios *" : "Guardar grupo")
    save.id = "word-groups-save"
    save.type = "button"
    save.addEventListener("click", saveCurrentGroup)
    actions.append(cancel, save)
    footer.append(status, deleteActions, actions)
    removeGroup.addEventListener("click", deleteCurrentGroup)
    removeMemberButton.addEventListener("click", removeCurrentMember)

    shell.append(header, autoPanel, body, footer)
    dialog.append(shell)
    document.body.append(dialog)
    dialog.addEventListener("cancel", event => {
        event.preventDefault()
        closeDialog()
    })
    dialog.addEventListener("close", () => dialog.remove())
    dialog.showModal()

    renderCandidates()
    renderAutoPanel()
}

function closeDialog() {
    const dialog = byId("word-groups-dialog")
    if (!dialog) return
    if (state.dirty && !window.confirm("¿Descartar los cambios sin guardar?")) return
    state.editedMemberIds.clear()
    dialog.close()
}

async function saveCurrentGroup() {
    const dialog = byId("word-groups-dialog")
    if (!dialog || !state.draft) return
    if (!requireSession("guardar el grupo en tu cuenta")) return
    const source = { ...state.draft, title: byId("word-group-title-input")?.value || state.draft.title }
    const clean = normalizeGroup(reconcileGroupAgainstCatalog(source), { createId: true })
    if (!clean.members.length) {
        modalStatus("Agrega al menos una palabra al grupo.", true)
        return
    }
    // Lo editado dentro del modal también se escribe en la tabla principal.
    // Solo se envían los miembros tocados para no sobrescribir los demás.
    const pushed = []
    for (const id of state.editedMemberIds) {
        const member = clean.members.find(row => String(row.id) === String(id))
        if (!member?.itemId) continue
        try {
            await pushMemberToCatalog(member, state.user.id)
            member.synced = syncedFieldsFrom(member)
            pushed.push(member.word)
        } catch (error) {
            console.warn("[word-groups] No se pudo actualizar la tabla principal:", error)
        }
    }
    state.editedMemberIds.clear()
    try {
        const saved = await repository.save(state.user.id, clean)
        state.syncedByGroup.delete(saved.id)
        state.groups = [saved, ...state.groups.filter(group => group.id !== saved.id)]
        state.draft = cloneGroup(saved)
        state.activeMemberId = currentMember()?.id || state.draft.members[0]?.id || null
        setDirty(false)
        renderDialog()
        modalStatus(pushed.length
            ? `Grupo guardado y ${pushed.length === 1 ? "1 palabra actualizada" : `${pushed.length} palabras actualizadas`} en la tabla principal.`
            : "Grupo guardado.")
    } catch (error) {
        console.error("[word-groups] No se pudo guardar:", error)
        modalStatus(error?.message || "No se pudo guardar el grupo.", true)
    }
}

async function deleteCurrentGroup() {
    if (!state.draft) return
    const title = state.draft.title || "este grupo"
    if (!window.confirm(`¿Eliminar “${title}” y quitar sus palabras relacionadas?`)) return
    const isLocalOnly = !state.groups.some(group => group.id === state.draft.id)
    try {
        if (!isLocalOnly) {
            if (!requireSession("eliminar el grupo de tu cuenta")) return
            await repository.remove(state.user.id, state.draft.id)
            state.groups = state.groups.filter(group => group.id !== state.draft.id)
        }
        state.draft = null
        state.activeMemberId = null
        state.editedMemberIds.clear()
        setDirty(false)
        byId("word-groups-dialog")?.close()
        showToast("Grupo eliminado.", "info")
    } catch (error) {
        console.error("[word-groups] No se pudo eliminar:", error)
        modalStatus(error?.message || "No se pudo eliminar el grupo.", true)
    }
}

/* Quita una palabra solo del grupo. La tabla principal no se toca: es la
 * diferencia entre "quitar del grupo" y "eliminar". */
function removeMemberFromDraft(member) {
    if (!member || !state.draft) return
    if (!window.confirm(`¿Quitar “${member.word}” del grupo? La palabra seguirá en la tabla principal.`)) return
    const snapshot = normalizeGroup(JSON.parse(JSON.stringify(state.draft)))
    const wasDirty = state.dirty
    const editedBefore = new Set(state.editedMemberIds)
    const wasOnly = state.draft.members.length <= 1
    state.editedMemberIds.delete(String(member.id))
    const next = removeMember(state.draft, member.id)
    state.draft = next
    state.activeMemberId = next.members[0]?.id || null
    setDirty(true)
    if (wasOnly && state.groups.some(group => String(group.id) === String(state.draft.id))) {
        if (!window.confirm("El grupo quedó vacío. ¿Quieres eliminarlo en lugar de guardarlo vacío?")) {
            state.draft = snapshot
            state.editedMemberIds = editedBefore
            setDirty(wasDirty)
            return
        }
        state.dirty = true
        void deleteCurrentGroup()
        return
    }
    renderDialog()
    modalStatus(`“${member.word}” quitada del grupo. Guarda para conservar el cambio.`)
}

/* Elimina la palabra también de la tabla principal (catálogo o vocabulario
 * propio) y la quita de todos los grupos abiertos en este dispositivo. */
async function deleteMemberEverywhere(member) {
    if (!member || !state.draft) return
    if (!requireSession("eliminar la palabra de tu vocabulario")) return
    const isCustom = member.source === "custom"
    const message = isCustom
        ? `¿Eliminar “${member.word}” de tu vocabulario personal? Esta acción no se puede deshacer.`
        : `¿Eliminar “${member.word}” de la guía compartida? Se quitará para todos los usuarios y no se puede deshacer.`
    if (!window.confirm(message)) return

    const snapshot = normalizeGroup(JSON.parse(JSON.stringify(state.draft)))
    const editedBefore = new Set(state.editedMemberIds)
    state.editedMemberIds.delete(String(member.id))
    state.draft = removeMember(state.draft, member.id)
    state.activeMemberId = state.draft.members[0]?.id || null
    setDirty(true)
    try {
        await deleteMemberFromCatalog(member, state.user.id)
        renderDialog()
        modalStatus(`“${member.word}” eliminada de la tabla principal y del grupo.`)
    } catch (error) {
        state.draft = snapshot
        state.editedMemberIds = editedBefore
        setDirty(true)
        renderDialog()
        modalStatus(error?.message || "No se pudo eliminar la palabra.", true)
    }
}

async function removeCurrentMember() {
    removeMemberFromDraft(currentMember())
}

export async function openWordGroup(payload) {
    await ensureLoaded()
    await waitForCatalog()
    if (!payload?.word) return
    state.syncedCount = 0
    state.editedMemberIds.clear()
    const matches = relatedGroups(payload).sort((left, right) => new Date(right.updatedAt || right.updated_at || 0) - new Date(left.updatedAt || left.updated_at || 0))
    let autoIncluded = 0
    if (matches.length) {
        state.syncedCount = state.syncedByGroup.get(matches[0].id) || 0
        state.syncedByGroup.delete(matches[0].id)
        const group = reconcileGroupAgainstCatalog(cloneGroup(matches[0]), null, count => { state.syncedCount += count })
        const member = findMemberForPayload(group, payload) || group.members[0]
        state.draft = group
        state.activeMemberId = member?.id || group.members[0]?.id || null
    } else {
        const created = createDraftGroup(payload)
        const result = autoAddTranslationMatches(created, created.members[0])
        state.draft = result.group
        state.activeMemberId = result.group.members[0]?.id || null
        autoIncluded = result.added
    }
    state.dirty = false
    state.candidateQuery = ""
    state.statusMessage = ""
    state.statusError = false
    renderDialog()
    const notes = []
    if (autoIncluded) notes.push(`Se incluyeron ${autoIncluded} términos con traducción equivalente.`)
    if (state.syncedCount) notes.push(`Se actualizaron ${state.syncedCount} palabras desde la tabla general.`)
    if (notes.length) modalStatus(notes.join(" "))
}

async function handleDelegatedClick(event) {
    const target = event.target.closest("[data-word-group-open='true']")
    if (!target) return
    event.preventDefault()
    event.stopPropagation()
    const payload = decodePayload(target.dataset.wordGroupPayload || target.getAttribute("data-word-group-payload"))
    if (payload) await openWordGroup(payload)
}

/* Llamado cuando se edita o elimina una palabra desde la tabla principal.
 * Refresca las copias del modal con los datos reales del catálogo: si la
 * palabra desapareció, se quita; si cambió, se vuelve a sincronizar. */
export function invalidateWordGroupData() {
    if (autoPickerDialog) {
        autoPickerDialog.close()
        autoPickerDialog = null
    }
    byId("word-groups-field-dialog")?.remove()
    state.candidates = store.categoriesData?.length ? collectWordCandidates() : []
    state.syncedByGroup.clear()

    if (state.draft) {
        const wasDirty = state.dirty
        state.draft = reconcileGroupAgainstCatalog(state.draft, state.candidates)
        if (!state.draft.members.some(member => String(member.id) === String(state.activeMemberId))) {
            state.activeMemberId = state.draft.members[0]?.id || null
        }
        setDirty(wasDirty)
    }
    if (byId("word-groups-dialog")) renderDialog()

    // Los grupos guardados también se releen para quitar copias obsoletas.
    state.loaded = false
    state.loadPromise = null
    if (initialized && state.user) {
        ensureLoaded().catch(error => console.warn("[word-groups] No se pudieron recargar los grupos:", error))
    }
}

export async function initializeWordGroups(supabase) {
    if (initialized) return
    initialized = true
    supabaseClient = supabase
    repository = createWordGroupRepository(supabase)
    window.addEventListener("word-catalog-changed", invalidateWordGroupData)
    document.addEventListener("click", event => {
        handleDelegatedClick(event).catch(error => {
            console.error("[word-groups] No se pudo abrir el grupo:", error)
            showToast("No se pudo abrir el grupo de palabras.", "warning")
        })
    })
    loadWordGroups().catch(error => console.warn("[word-groups] No se pudieron preparar los grupos:", error))
}

async function loadWordGroups() {
    await ensureLoaded()
}
