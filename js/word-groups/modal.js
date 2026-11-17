import { store } from "../config.js"
import { resolveSessionUser } from "../offline/session.js"
import { playAudioEnhanced } from "../audio.js"
import { showToast } from "../cache.js"
import { collectWordCandidates, filterCandidates } from "./candidates.js"
import { missingTranslationCandidates } from "./similarity.js"
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
    updateMember,
    upsertExample
} from "./model.js"
import { createWordGroupRepository } from "./repository.js"

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
    candidates: [],
    candidateQuery: "",
    view: "table"
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
    const status = byId("word-groups-status")
    if (status) {
        status.textContent = message || ""
        status.classList.toggle("error", isError)
    }
}

function setDirty(dirty) {
    state.dirty = dirty
    const save = byId("word-groups-save")
    if (save) save.textContent = dirty ? "Guardar cambios *" : "Guardar grupo"
}

function currentMember() {
    return state.draft?.members.find(member => String(member.id) === String(state.activeMemberId)) || null
}

function cloneGroup(group) {
    return normalizeGroup(JSON.parse(JSON.stringify(group)))
}

function ensureCandidates() {
    if (!state.candidates.length) state.candidates = collectWordCandidates()
    return state.candidates
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
        state.groups = state.user && repository ? await repository.list(state.user.id) : []
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

export function renderGroupWordButton(text, payload, className = "", editItem = null) {
    const encoded = encodeURIComponent(JSON.stringify(payload || {}))
    const extra = className ? ` ${className}` : ""
    const editButton = renderInlineWordEditButton(text, editItem)
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
    button.addEventListener("click", () => {
        state.activeMemberId = member.id
        state.candidateQuery = ""
        renderDialog()
    })
    return button
}

function renderCandidates() {
    const host = byId("word-group-candidate-results")
    if (!host) return
    const query = state.candidateQuery.trim()
    if (!query) {
        host.replaceChildren(el("p", "word-group-search-hint", "Escribe para buscar en todas las listas."))
        return
    }
    const candidates = filterCandidates(state.candidates, query, 40)
    host.replaceChildren()
    if (!candidates.length) {
        host.append(el("p", "word-group-search-empty", "No hay resultados."))
        return
    }
    for (const candidate of candidates) {
        const existing = findMemberByIdentity(state.draft, candidate)
        const button = el("button", "word-group-candidate")
        button.type = "button"
        button.disabled = !!existing
        const title = el("span", "word-group-candidate-word", candidate.word || "Palabra")
        const meta = el("span", "word-group-candidate-meta", candidate.context ? `${candidate.context}${candidate.spanish ? ` · ${candidate.spanish}` : ""}` : candidate.spanish || "")
        const status = el("span", "word-group-candidate-status", existing ? "Ya está" : "Agregar")
        button.append(title, meta, status)
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

function renderExamples() {
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

        const exampleRow = el("div", "word-group-example-row")
        const en = el("textarea", "word-group-example-en")
        en.value = example.en || ""
        en.rows = 2
        en.maxLength = 1000
        en.setAttribute("aria-label", `Ejemplo en inglés ${index + 1}`)
        en.addEventListener("input", () => {
            const updated = state.draft.members.map(row => String(row.id) === String(member.id)
                ? { ...row, examples: row.examples.map(ex => String(ex.id) === String(example.id) ? { ...ex, en: en.value } : ex) }
                : row)
            state.draft = { ...state.draft, members: updated }
            setDirty(true)
        })
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
            setDirty(true)
            renderDialog()
        })

        const es = el("textarea", "word-group-example-es")
        es.value = example.es || ""
        es.rows = 2
        es.maxLength = 1000
        es.setAttribute("aria-label", `Traducción del ejemplo ${index + 1}`)
        es.addEventListener("input", () => {
            const updated = state.draft.members.map(row => String(row.id) === String(member.id)
                ? { ...row, examples: row.examples.map(ex => String(ex.id) === String(example.id) ? { ...ex, es: es.value } : ex) }
                : row)
            state.draft = { ...state.draft, members: updated }
            setDirty(true)
        })

        exampleRow.append(en, audio, remove)
        item.append(exampleRow, es)
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

function bindEditor() {
    const member = currentMember()
    if (!member) return

    const bindField = (id, field, isSelect = false) => {
        const element = byId(id)
        if (!element) return
        element.value = member[field] || ""
        const event = isSelect ? "change" : "input"
        element.addEventListener(event, () => {
            state.draft = updateMember(state.draft, member.id, { [field]: element.value })
            setDirty(true)
        })
    }

    bindField("word-group-word-input", "word")
    bindField("word-group-pronunciation-input", "pronunciation")
    bindField("word-group-spanish-input", "spanish")
    bindField("word-group-part-input", "partOfSpeech", true)
    bindField("word-group-position-input", "position", true)
    bindField("word-group-uses-input", "uses")
    bindField("word-group-difference-input", "difference")

    byId("word-group-audio-button")?.addEventListener("click", () => playAudioEnhanced(member.word, "en"))
    byId("word-group-add-example")?.addEventListener("click", () => {
        const empty = { id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, en: "", es: "" }
        state.draft = upsertExample(state.draft, member.id, empty)
        setDirty(true)
        renderDialog()
    })
}

function selectMember(memberId, view = "detail") {
    state.activeMemberId = memberId
    state.candidateQuery = ""
    state.view = view
    modalStatus("")
    renderDialog()
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

function renderComparisonTable() {
    const wrap = el("div", "word-groups-table-wrap")
    const table = el("table", "word-groups-table")
    table.setAttribute("aria-label", "Comparación de palabras similares")
    const thead = el("thead")
    const headRow = el("tr")
    const headings = [
        "Conector y pronunciación",
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
        row.tabIndex = 0
        row.setAttribute("role", "button")
        row.setAttribute("aria-label", `Comparar y editar ${member.word}`)
        row.addEventListener("click", () => selectMember(member.id, "detail"))
        row.addEventListener("keydown", event => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault()
                selectMember(member.id, "detail")
            }
        })

        const wordCell = el("td", "word-groups-table-word-cell")
        const wordTop = el("div", "word-groups-table-word-top")
        const wordWrap = el("div", "word-groups-table-word-wrap")
        const word = el("strong", "word-groups-table-word", member.word || "Palabra")
        const meta = el("small", "word-groups-table-meta", [
            member.pronunciation ? member.pronunciation : "",
            member.spanish ? member.spanish : "",
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

        const differenceCell = el("td", "word-groups-table-cell-wrap")
        const difference = el("p", "word-groups-table-difference", member.difference || "Sin diferencia registrada.")
        const uses = el("p", "word-groups-table-uses", member.uses || "Sin usos registrados.")
        differenceCell.append(difference, uses)

        const relationshipsCell = el("td", "word-groups-table-cell-wrap word-groups-table-relationships")
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

        const positionCell = el("td", "word-groups-table-position", member.position || "En cualquier posición")
        const examplesCell = el("td")
        examplesCell.append(renderExamplesCell(member))

        const actionCell = el("td", "word-groups-table-actions")
        const edit = el("button", "button secondary word-groups-table-edit", "Editar")
        edit.type = "button"
        edit.addEventListener("click", event => {
            event.stopPropagation()
            selectMember(member.id, "detail")
        })
        actionCell.append(edit)
        wordCell.dataset.label = headings[0]
        differenceCell.dataset.label = headings[1]
        relationshipsCell.dataset.label = headings[2]
        positionCell.dataset.label = headings[3]
        examplesCell.dataset.label = headings[4]
        actionCell.dataset.label = headings[5]
        row.append(wordCell, differenceCell, relationshipsCell, positionCell, examplesCell, actionCell)
        tbody.append(row)
    }
    table.append(thead, tbody)
    wrap.append(table)
    return wrap
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
    const viewSwitch = el("div", "word-groups-view-switch")
    for (const [view, label] of [["table", "Tabla"], ["detail", "Detalle"]]) {
        const button = el("button", `word-groups-view-button${state.view === view ? " active" : ""}`, label)
        button.type = "button"
        button.setAttribute("aria-pressed", String(state.view === view))
        button.addEventListener("click", () => {
            state.view = view
            renderDialog()
        })
        viewSwitch.append(button)
    }
    const viewActions = el("div", "word-groups-view-actions")
    const addWord = el("button", "button secondary word-groups-add-member", "＋ Agregar")
    addWord.type = "button"
    addWord.addEventListener("click", () => {
        state.view = "detail"
        state.candidateQuery = ""
        renderDialog()
        window.requestAnimationFrame(() => byId("word-groups-dialog")?.querySelector(".word-groups-search")?.focus())
    })
    const autoButton = el("button", "button secondary word-groups-add-member word-groups-auto-button", missingByTranslation ? `＋ Autos ${missingByTranslation}` : "＋ Autos")
    autoButton.type = "button"
    autoButton.disabled = !missingByTranslation
    autoButton.title = missingByTranslation
        ? `Agregar ${missingByTranslation} términos con traducción equivalente`
        : "No hay coincidencias pendientes con esta traducción"
    autoButton.setAttribute("aria-label", autoButton.title)
    autoButton.addEventListener("click", () => {
        const target = currentMember()
        const result = autoAddTranslationMatches(state.draft, target)
        state.draft = result.group
        if (result.added) {
            state.activeMemberId = target?.id || state.activeMemberId
            setDirty(true)
            renderDialog()
            modalStatus(`Se agregaron ${result.added} términos con traducción equivalente.`)
        } else {
            modalStatus("No hay coincidencias pendientes con esta traducción.", true)
        }
    })
    viewActions.append(addWord, autoButton)
    viewControls.append(viewSwitch, viewActions)
    titleBlock.append(titleInput, viewControls)
    const close = el("button", "word-groups-close", "✕")
    close.type = "button"
    close.setAttribute("aria-label", "Cerrar ventana")
    close.addEventListener("click", closeDialog)
    header.append(titleBlock, close)

    const body = el("div", `word-groups-body${state.view === "table" ? " word-groups-body-table" : " word-groups-body-detail"}`)
    const members = el("aside", "word-groups-members")
    members.append(el("p", "word-groups-section-label", "Palabras del grupo"))
    const memberList = el("div", "word-groups-member-list")
    draft.members.forEach(item => memberList.append(renderMemberButton(item)))
    members.append(memberList)
    const searchLabel = el("label", "word-groups-search-label", "Buscar para agregar")
    const search = el("input", "word-groups-search")
    search.type = "search"
    search.placeholder = "in addition, además, thereby…"
    search.value = state.candidateQuery
    search.autocomplete = "off"
    search.addEventListener("input", event => {
        state.candidateQuery = event.target.value
        renderCandidates()
    })
    const searchArea = el("div", "word-groups-search-area")
    const results = el("div", "word-groups-candidate-results")
    results.id = "word-group-candidate-results"
    searchArea.append(searchLabel, search, results)
    members.append(searchArea)

    if (state.view === "table") {
        body.append(renderComparisonTable())
    } else {
        const editor = el("section", "word-groups-editor")
        if (!member) {
            editor.append(el("p", "word-groups-empty-state", "No hay palabra seleccionada."))
        } else {
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

            const grid = el("div", "word-groups-grid")
            const pronunciation = el("input", "word-groups-input")
            pronunciation.id = "word-group-pronunciation-input"
            pronunciation.placeholder = "/bɪˈsaɪdz/"
            const spanish = el("input", "word-groups-input")
            spanish.id = "word-group-spanish-input"
            spanish.placeholder = "Traducción"
            grid.append(pronunciation, spanish)

            const selectGrid = el("div", "word-groups-grid word-groups-select-grid")
            const part = el("select", "word-groups-select")
            part.id = "word-group-part-input"
            part.innerHTML = `<option>Adjetivo</option><option>Verbo</option><option>Sustantivo</option><option>Adverbio</option><option>Preposición</option><option>Conector</option><option>Frase</option><option>Otro</option>`
            const position = el("select", "word-groups-select")
            position.id = "word-group-position-input"
            position.innerHTML = `<option>Inicio</option><option>Medio</option><option>Final</option><option>En cualquier posición</option>`
            selectGrid.append(part, position)

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

            const exampleHost = el("div", "word-groups-section")
            const exampleHeader = el("div", "word-groups-section-header")
            exampleHeader.append(el("p", "word-groups-section-label", "Ejemplos"))
            const addExample = el("button", "button secondary word-groups-add-example", "＋ Add example")
            addExample.id = "word-group-add-example"
            addExample.type = "button"
            exampleHeader.append(addExample)
            const examples = el("div", "word-groups-examples")
            examples.id = "word-group-examples-list"
            exampleHost.append(exampleHeader, examples)

            const relationshipHost = el("div", "word-groups-section")
            relationshipHost.append(el("p", "word-groups-section-label", "Intercambiabilidad"))
            const relationships = el("div", "word-groups-relationships")
            relationships.id = "word-group-relationships"
            relationshipHost.append(relationships)

            editor.append(wordRow, grid, selectGrid, usesWrap, differenceWrap, exampleHost, relationshipHost)
        }

        body.append(members, editor)
    }

    const footer = el("footer", "word-groups-footer")
    const status = el("small", "word-groups-status")
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
    const save = el("button", "button primary", "Guardar grupo")
    save.id = "word-groups-save"
    save.type = "button"
    save.addEventListener("click", saveCurrentGroup)
    actions.append(cancel, save)
    footer.append(status, deleteActions, actions)
    removeGroup.addEventListener("click", deleteCurrentGroup)
    removeMemberButton.addEventListener("click", removeCurrentMember)

    shell.append(header, body, footer)
    dialog.append(shell)
    document.body.append(dialog)
    dialog.addEventListener("cancel", event => {
        event.preventDefault()
        closeDialog()
    })
    dialog.addEventListener("close", () => dialog.remove())
    dialog.showModal()

    if (state.view === "detail") {
        bindEditor()
        renderExamples()
        renderRelationshipRows()
        renderCandidates()
    }
}

function closeDialog() {
    const dialog = byId("word-groups-dialog")
    if (!dialog) return
    if (state.dirty && !window.confirm("¿Descartar los cambios sin guardar?")) return
    dialog.close()
}

async function saveCurrentGroup() {
    const dialog = byId("word-groups-dialog")
    if (!dialog || !state.draft) return
    if (!state.user) state.user = await resolveSessionUser(supabaseClient)
    if (!state.user) {
        modalStatus("Inicia sesión para guardar en tu cuenta.", true)
        return
    }
    const clean = normalizeGroup({ ...state.draft, title: byId("word-group-title-input")?.value || state.draft.title }, { createId: true })
    if (!clean.members.length) {
        modalStatus("Agrega al menos una palabra al grupo.", true)
        return
    }
    try {
        const saved = await repository.save(state.user.id, clean)
        state.groups = [saved, ...state.groups.filter(group => group.id !== saved.id)]
        state.draft = cloneGroup(saved)
        state.activeMemberId = currentMember()?.id || state.draft.members[0]?.id || null
        setDirty(false)
        modalStatus("Grupo guardado.")
        showToast("Grupo guardado.", "success")
        renderDialog()
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
            if (!state.user) state.user = await resolveSessionUser(supabaseClient)
            await repository.remove(state.user.id, state.draft.id)
            state.groups = state.groups.filter(group => group.id !== state.draft.id)
        }
        state.draft = null
        state.activeMemberId = null
        setDirty(false)
        byId("word-groups-dialog")?.close()
        showToast("Grupo eliminado.", "info")
    } catch (error) {
        console.error("[word-groups] No se pudo eliminar:", error)
        modalStatus(error?.message || "No se pudo eliminar el grupo.", true)
    }
}

async function removeCurrentMember() {
    const member = currentMember()
    if (!member) return
    if (!window.confirm(`¿Quitar “${member.word}” de este grupo?`)) return
    const next = removeMember(state.draft, member.id)
    const wasOnly = state.draft.members.length <= 1
    state.draft = next
    state.activeMemberId = next.members[0]?.id || null
    setDirty(true)
    if (wasOnly && state.groups.some(group => group.id === state.draft.id)) {
        if (!window.confirm("El grupo quedó vacío. ¿Quieres eliminarlo en lugar de guardarlo vacío?")) return
        state.dirty = true
        await deleteCurrentGroup()
        return
    }
    renderDialog()
}

export async function openWordGroup(payload) {
    await ensureLoaded()
    if (!payload?.word) return
    const matches = relatedGroups(payload).sort((left, right) => new Date(right.updatedAt || right.updated_at || 0) - new Date(left.updatedAt || left.updated_at || 0))
    let autoIncluded = 0
    if (matches.length) {
        const group = cloneGroup(matches[0])
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
    renderDialog()
    if (autoIncluded) {
        modalStatus(`Se incluyeron ${autoIncluded} términos con traducción equivalente.`)
    }
}

async function handleDelegatedClick(event) {
    const target = event.target.closest("[data-word-group-open='true']")
    if (!target) return
    event.preventDefault()
    event.stopPropagation()
    const payload = decodePayload(target.dataset.wordGroupPayload || target.getAttribute("data-word-group-payload"))
    if (payload) await openWordGroup(payload)
}

export async function initializeWordGroups(supabase) {
    if (initialized) return
    initialized = true
    supabaseClient = supabase
    repository = createWordGroupRepository(supabase)
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
