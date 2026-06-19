import { store } from '../config.js'
import {
    verbsData, verbCategories,
    currentViewVerbs, currentVerbCategory,
    verbSortState, verbPaginationState,
    setCurrentVerbCategory, setCurrentViewVerbs,
    setPaginationState
} from './verbs-state.js'
import { renderVerbPagination } from './verbs-pagination.js'
import { sortVerbs } from './verbs-sort.js'

export const VERB_FIELDS = [
    { key: 'category', label: 'Categoría', isCategory: true },
    { key: 'type', label: 'Tipo' },
    { key: 'verb', label: 'Verbo' },
    { key: 'pronunciation', label: 'Pron.' },
    { key: 'translation', label: 'Traducción' },
    { key: 'example_base', label: 'Ejemplo' },
    { key: 'usage', label: 'Uso' },
    { key: 'past_simple', label: 'Past Simple' },
    { key: 'pronunciation_ps', label: 'Pron. P.S.' },
    { key: 'translation_ps', label: 'Trad. P.S.' },
    { key: 'example_ps', label: 'Ej. P.S.' },
    { key: 'past_participle', label: 'Past Part.' },
    { key: 'pronunciation_pp', label: 'Pron. P.P.' },
    { key: 'translation_pp', label: 'Trad. P.P.' },
    { key: 'example_pp', label: 'Ej. P.P.' },
    { key: 'adjective', label: 'Adjetivo' },
    { key: 'pronunciation_adj', label: 'Pron. Adj.' },
    { key: 'translation_adj', label: 'Trad. Adj.' },
    { key: 'example_adj', label: 'Ej. Adj.' },
    { key: 'example_adj_translation', label: 'Trad. Ej. Adj.' },
    { key: 'adverb', label: 'Adverbio' },
    { key: 'pronunciation_adv', label: 'Pron. Adv.' },
    { key: 'translation_adv', label: 'Trad. Adv.' },
    { key: 'example_adv', label: 'Ej. Adv.' },
    { key: 'example_adv_translation', label: 'Trad. Ej. Adv.' },
    { key: 'noun', label: 'Sustantivo' },
    { key: 'pronunciation_noun', label: 'Pron. Sust.' },
    { key: 'translation_noun', label: 'Trad. Sust.' },
    { key: 'example_noun', label: 'Ej. Sust.' },
    { key: 'example_noun_translation', label: 'Trad. Ej. Sust.' }
]

const SPANISH_FIELDS = new Set([
    'translation', 'translation_ps', 'translation_pp',
    'translation_adj', 'translation_adv', 'translation_noun',
    'example_adj_translation', 'example_adv_translation', 'example_noun_translation'
])

const SORTABLE_FIELDS = new Set(['verb', 'translation'])

function buildThead(includeCategory = true) {
    const cols = VERB_FIELDS
        .filter(f => includeCategory || !f.isCategory)
        .map(f => {
            const sortable = SORTABLE_FIELDS.has(f.key)
            const icon = verbSortState.column === f.key
                ? (verbSortState.direction === 'asc' ? ' ▲' : ' ▼')
                : ''
            return sortable
                ? `<th class="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase cursor-pointer hover:text-blue-600 transition-colors"
                       data-sort-column="${f.key}"
                       onclick="window.sortVerbsBy('${f.key}')">
                       ${f.label}<span class="sort-icon">${icon}</span>
                   </th>`
                : `<th class="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase">${f.label}</th>`
        })
        .join('')

    const progressTh = `<th class="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase">Progreso</th>`
    return `<tr>${cols}${progressTh}</tr>`
}

function buildVerbRow(v, includeCategory = true) {
    const fields = VERB_FIELDS.filter(f => includeCategory || !f.isCategory)

    const cells = fields.map(f => {
        const value = v[f.key] || ''
        const escaped = String(value).replace(/"/g, '&quot;').replace(/'/g, '&#39;')
        const lang = SPANISH_FIELDS.has(f.key) ? 'es-ES' : 'en-US'

        if (f.isCategory) {
            return `<td class="border-b px-4 py-3 text-sm font-medium text-gray-700">${value || 'Sin Categoría'}</td>`
        }

        return `<td
            class="editable-cell border-b px-4 py-3 hover:bg-gray-50 cursor-pointer text-sm"
            data-verb-id="${v.id}"
            data-field="${f.key}"
            data-audio-text="${escaped}"
            data-audio-lang="${lang}"
            ondblclick="window.editVerbCell(this, '${f.key}', ${v.id})"
            onclick="window.playVerbAudio(this)"
        >${value || '<span class="text-gray-400">—</span>'}</td>`
    }).join('')

    const progressCell = store.currentUser
        ? `<td class="border-b px-4 py-3">
               <div class="flex items-center gap-3">
                   <div class="w-20 h-2.5 bg-gray-200 rounded-full overflow-hidden">
                       <div class="h-full bg-green-500 rounded-full" style="width:${v.percentage || 0}%"></div>
                   </div>
                   <span class="text-xs font-medium text-gray-600">${v.percentage || 0}%</span>
               </div>
           </td>`
        : `<td class="border-b px-4 py-3 text-center text-gray-400">—</td>`

    return `<tr class="hover:bg-gray-50 transition-colors" data-verb-id="${v.id}">${cells}${progressCell}</tr>`
}

export function renderVerbTable(verbs, includeCategory = true) {
    const tbody = document.getElementById('verbs-table-body')
    if (!tbody) return

    const total = verbs?.length || 0
    const totalPages = Math.ceil(total / verbPaginationState.itemsPerPage) || 1
    const currentPage = Math.min(verbPaginationState.currentPage, totalPages)

    setPaginationState({
        currentData: verbs || [],
        totalItems: total,
        totalPages,
        currentPage
    })

    const table = tbody.closest('table')
    if (table) {
        const thead = table.querySelector('thead')
        if (thead) thead.innerHTML = buildThead(includeCategory)
    }

    const start = (currentPage - 1) * verbPaginationState.itemsPerPage
    const pageData = (verbs || []).slice(start, start + verbPaginationState.itemsPerPage)

    if (!pageData.length) {
        tbody.innerHTML = `<tr><td colspan="${VERB_FIELDS.length + 1}" class="text-center py-8 text-gray-500">No hay verbos en esta categoría</td></tr>`
        renderVerbPagination()
        return
    }

    tbody.innerHTML = pageData.map(v => buildVerbRow(v, includeCategory)).join('')
    renderVerbPagination()
}

export function renderVerbCategories() {
    const grid = document.getElementById('verbs-category-grid')
    if (!grid) return

    const resultsContainer = document.getElementById('verbs-search-results')
    if (resultsContainer && !resultsContainer.classList.contains('hidden')) {
        grid.classList.add('hidden')
        return
    }

    grid.classList.remove('hidden')
    grid.innerHTML = ''

    if (verbCategories.length === 0) {
        grid.innerHTML = '<div class="col-span-full text-center py-12 text-gray-500">No hay categorías disponibles</div>'
        return
    }

    verbCategories.forEach(cat => {
        const count = verbsData.filter(v => v.category === cat).length
        const card = document.createElement('div')
        card.className = 'category-card bg-white border border-gray-200 rounded-2xl p-5 cursor-pointer text-center hover:border-gray-300'
        card.innerHTML = `
            <div class="text-4xl mb-2">📂</div>
            <h3 class="font-serif-oxford font-bold text-gray-900">${cat}</h3>
            <div class="mt-3 inline-block px-3 py-1 bg-gray-100 rounded-full text-xs text-gray-600">
                ${count} verbos
            </div>
        `
        card.onclick = () => openVerbCategory(cat)
        grid.appendChild(card)
    })
}

export function openVerbCategory(category) {
    setCurrentVerbCategory(category)
    const filtered = verbsData.filter(v => v.category === category)
    setCurrentViewVerbs(filtered)

    const grid = document.getElementById('verbs-category-grid')
    const view = document.getElementById('verbs-table-view')
    if (grid) grid.classList.add('hidden')
    if (view) view.classList.remove('hidden')

    const title = document.getElementById('verbs-category-title')
    if (title) title.textContent = `📂 Categoría: ${category} (${filtered.length} verbos)`

    renderVerbTable(filtered)
}

window.backToVerbCategories = function () {
    const grid = document.getElementById('verbs-category-grid')
    const view = document.getElementById('verbs-table-view')
    if (grid) grid.classList.remove('hidden')
    if (view) view.classList.add('hidden')

    setCurrentVerbCategory(null)
    setCurrentViewVerbs([])

    const resultsContainer = document.getElementById('verbs-search-results')
    if (resultsContainer) resultsContainer.classList.add('hidden')

    const searchInput = document.getElementById('verbs-search-input')
    if (searchInput) searchInput.value = ''

    const previewCard = document.getElementById('verbs-ai-preview-card')
    if (previewCard) previewCard.remove()

    renderVerbCategories()
}

window.showAllVerbs = function () {
    const grid = document.getElementById('verbs-category-grid')
    const resultsContainer = document.getElementById('verbs-search-results')
    const view = document.getElementById('verbs-table-view')
    if (grid) grid.classList.add('hidden')
    if (resultsContainer) resultsContainer.classList.add('hidden')
    if (view) view.classList.remove('hidden')

    const title = document.getElementById('verbs-category-title')
    if (title) title.textContent = `📚 Todos los verbos (${verbsData.length} total)`

    const searchInput = document.getElementById('verbs-search-input')
    if (searchInput) searchInput.value = ''

    const previewCard = document.getElementById('verbs-ai-preview-card')
    if (previewCard) previewCard.remove()

    setCurrentVerbCategory(null)
    setCurrentViewVerbs([...verbsData])

    const sorted = sortVerbs(currentViewVerbs, verbSortState.column, verbSortState.direction)
    renderVerbTable(sorted)
}

export function showVerbAIPreview(data, query) {
    const resultsContainer = document.getElementById('verbs-search-results')
    const resultsTbody = document.getElementById('verbs-search-tbody')
    const resultsCount = document.getElementById('verbs-search-count')
    if (!resultsContainer || !resultsTbody) return

    resultsContainer.classList.remove('hidden')
    if (resultsCount) resultsCount.textContent = `✨ Verbo generado por IA para "${query}"`

    resultsTbody.innerHTML = `
        <tr>
            <td colspan="${VERB_FIELDS.length + 1}" class="text-center py-6 text-gray-400 text-sm">
                Revisa el verbo generado abajo 👇
            </td>
        </tr>
    `

    const providerLabel = data.provider === 'groq' ? '⚡ Groq (Ultra rápido)' : '🤖 Gemini'
    const safeData = JSON.stringify(data).replace(/"/g, '&quot;').replace(/'/g, '&#39;')

    let previewCard = document.getElementById('verbs-ai-preview-card')
    if (!previewCard) {
        previewCard = document.createElement('div')
        previewCard.id = 'verbs-ai-preview-card'
        const aiContainer = document.getElementById('verbs-ai-suggestion-container')
        if (aiContainer && aiContainer.parentNode) {
            aiContainer.parentNode.insertBefore(previewCard, aiContainer)
        }
    }

    previewCard.innerHTML = `
        <div class="bg-gradient-to-r from-blue-50 to-purple-50 border-2 border-blue-200 rounded-xl p-4 mb-4">
            <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h4 class="font-bold text-blue-900 flex items-center gap-2">
                    ✨ Verbo generado con ${providerLabel}
                    <span class="text-xs text-gray-500 font-normal">(Modelo: ${data.modelUsed || 'N/A'})</span>
                </h4>
                <button onclick="window.saveGeneratedVerb(${safeData})"
                        class="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 text-sm font-medium transition-all">
                    💾 Guardar verbo
                </button>
            </div>
            <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 text-sm bg-white p-3 rounded-lg border border-blue-100">
                <div><span class="text-gray-500">Verbo:</span> <strong>${data.verb || ''}</strong></div>
                <div><span class="text-gray-500">Pronunciación:</span> ${data.pronunciation || '—'}</div>
                <div><span class="text-gray-500">Traducción:</span> ${data.translation || '—'}</div>
                <div><span class="text-gray-500">Categoría:</span> ${data.category || '—'}</div>
                <div><span class="text-gray-500">Tipo:</span> ${data.type || '—'}</div>
                <div><span class="text-gray-500">Past Simple:</span> ${data.past_simple || '—'}</div>
                <div><span class="text-gray-500">Past Participle:</span> ${data.past_participle || '—'}</div>
                <div><span class="text-gray-500">Adjetivo:</span> ${data.adjective || '—'}</div>
                <div class="col-span-2"><span class="text-gray-500">Ejemplo:</span> ${data.example_base || '—'}</div>
            </div>
            <div class="mt-3 text-xs text-gray-400 flex gap-4 flex-wrap">
                <span>🔊 Click en cualquier palabra para escuchar</span>
                <span>✏️ Se guardará como un nuevo verbo en la base de datos</span>
            </div>
        </div>
    `
}