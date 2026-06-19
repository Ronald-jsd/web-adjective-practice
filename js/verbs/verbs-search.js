import { supabase } from '../app.js'
import { store } from '../config.js'
import { showToast } from '../cache.js'
import {
    verbsData, currentVerbCategory,
    verbSortState, verbPaginationState,
    setPaginationState
} from './verbs-state.js'
import { renderVerbTable, renderVerbCategories, openVerbCategory, showVerbAIPreview, VERB_FIELDS } from './verbs-render.js'
import { sortVerbs } from './verbs-sort.js'
import { renderVerbPagination } from './verbs-pagination.js'

window.searchVerbs = function () {
    const input = document.getElementById('verbs-search-input')
    const query = input?.value?.toLowerCase().trim() || ''

    const resultsContainer = document.getElementById('verbs-search-results')
    const resultsTbody = document.getElementById('verbs-search-tbody')
    const resultsCount = document.getElementById('verbs-search-count')
    const grid = document.getElementById('verbs-category-grid')
    const view = document.getElementById('verbs-table-view')
    const aiContainer = document.getElementById('verbs-ai-suggestion-container')

    if (!query) {
        if (resultsContainer) resultsContainer.classList.add('hidden')
        if (grid) grid.classList.remove('hidden')
        if (view) view.classList.add('hidden')
        if (aiContainer) aiContainer.classList.add('hidden')

        const previewCard = document.getElementById('verbs-ai-preview-card')
        if (previewCard) previewCard.remove()

        setPaginationState({ currentPage: 1 })
        renderVerbCategories()
        return
    }

    if (grid) grid.classList.add('hidden')
    if (view) view.classList.add('hidden')

    let results = verbsData.filter(v =>
        (v.verb || '').toLowerCase().includes(query) ||
        (v.translation || '').toLowerCase().includes(query) ||
        (v.past_simple || '').toLowerCase().includes(query) ||
        (v.category || '').toLowerCase().includes(query)
    )

    console.log(`Resultados filtrados: ${results.length} verbos`)

    results = sortVerbs(results, verbSortState.column, verbSortState.direction)

    const totalPages = Math.ceil(results.length / verbPaginationState.itemsPerPage) || 1
    const currentPage = Math.min(verbPaginationState.currentPage, totalPages)

    setPaginationState({
        currentData: results,
        totalItems: results.length,
        totalPages,
        currentPage
    })

    const thead = resultsContainer?.querySelector('thead')
    if (thead) {
        thead.innerHTML = `<tr>
            ${VERB_FIELDS.map(f => `<th class="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase">${f.label}</th>`).join('')}
            <th class="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase">Progreso</th>
        </tr>`
    }

    if (aiContainer) {
        aiContainer.classList.remove('hidden')
        document.getElementById('verbs-ai-search-word').textContent = query

        import('../ai.js').then(module => {
            const noKeyWarning = document.getElementById('verbs-ai-no-key-warning')
            if (noKeyWarning) {
                if (!module.hasApiKey('groq') && !module.hasApiKey('gemini')) {
                    noKeyWarning.classList.remove('hidden')
                } else {
                    noKeyWarning.classList.add('hidden')
                }
            }
        })
    }

    if (results.length === 0) {
        if (resultsContainer) resultsContainer.classList.remove('hidden')
        if (resultsCount) resultsCount.textContent = `0 resultados para "${query}"`
        if (resultsTbody) resultsTbody.innerHTML = `
            <tr>
                <td colspan="${VERB_FIELDS.length + 1}" class="text-center py-8">
                    <div class="flex flex-col items-center gap-2">
                        <p class="text-gray-500">No se encontraron verbos para "<strong>${query}</strong>"</p>
                        <p class="text-xs text-gray-400">Usa el botón de abajo para generar este verbo con IA</p>
                    </div>
                </td>
            </tr>
        `
        const pagContainer = document.getElementById('verbs-search-pagination')
        if (pagContainer) pagContainer.innerHTML = ''
        return
    }

    if (resultsContainer) resultsContainer.classList.remove('hidden')
    if (resultsCount) resultsCount.textContent = `${results.length} resultado(s) encontrado(s)`

    const start = (currentPage - 1) * verbPaginationState.itemsPerPage
    const pageData = results.slice(start, start + verbPaginationState.itemsPerPage)

    const { buildSearchRows } = buildSearchRowsHelper(pageData)
    if (resultsTbody) resultsTbody.innerHTML = buildSearchRows

    renderVerbPagination()
}

function buildSearchRowsHelper(pageData) {
    const SPANISH_FIELDS = new Set([
        'translation', 'translation_ps', 'translation_pp',
        'translation_adj', 'translation_adv', 'translation_noun',
        'example_adj_translation', 'example_adv_translation', 'example_noun_translation'
    ])

    const buildSearchRows = pageData.map(v => {
        const cells = VERB_FIELDS.map(f => {
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
    }).join('')

    return { buildSearchRows }
}

window.generateVerbWithAI = async function (query) {
    if (!store.currentUser) {
        alert('🔐 Debes iniciar sesión para usar la IA')
        return
    }

    if (!query) {
        query = document.getElementById('verbs-search-input')?.value?.trim()
        if (!query) {
            alert('🔍 Ingresa un verbo para buscar')
            return
        }
    }

    const aiBtn = document.getElementById('verbs-ai-generate-btn')
    if (aiBtn) { aiBtn.disabled = true; aiBtn.innerHTML = '⏳ Generando con IA...' }

    try {
        const { generateVerbWithAI: generateVerb } = await import('./verbs-ai.js')
        const result = await generateVerb(query)

        if (result && !result.error) {
            window._tempVerbData = result
            store.currentAIData = result

            showVerbAIPreview(result, query)
        } else {
            alert('❌ No se pudo generar el verbo. Intenta de nuevo.')
        }
    } catch (error) {
        console.error('Error generando verbo:', error)
        alert('❌ Error al generar el verbo: ' + error.message)
    }

    if (aiBtn) { aiBtn.disabled = false; aiBtn.innerHTML = '🤖 Generar verbo con IA' }
}

function clearAfterSave() {
    window._tempVerbData = null
    store.currentAIData = null

    const previewCard = document.getElementById('verbs-ai-preview-card')
    if (previewCard) previewCard.remove()

    const searchInput = document.getElementById('verbs-search-input')
    if (searchInput) searchInput.value = ''

    const resultsContainer = document.getElementById('verbs-search-results')
    if (resultsContainer) resultsContainer.classList.add('hidden')

    const aiContainer = document.getElementById('verbs-ai-suggestion-container')
    if (aiContainer) aiContainer.classList.add('hidden')

    const grid = document.getElementById('verbs-category-grid')
    if (grid) grid.classList.remove('hidden')
}

window.saveGeneratedVerb = async function (data) {
    console.log('saveGeneratedVerb llamado con:', data)

    try {
        const { saveAIResult } = await import('./verbs-ai.js')

        window._tempVerbData = data
        store.currentAIData = data

        let categorySelect = document.getElementById('ai-category-select')
        let subcategorySelect = document.getElementById('ai-subcategory-select')

        if (!categorySelect || !subcategorySelect) {
            console.log('Selects no encontrados, usando datos directamente')

            const finalCategory = data.category || 'Sin Categoría'
            const finalSubcategory = data.subcategory || data.category || 'General'

            const { error } = await supabase
                .from('verbs')
                .insert({
                    category: finalCategory,
                    type: data.type || 'regular',
                    verb: data.verb || data.word || '',
                    pronunciation: data.pronunciation || '',
                    translation: data.translation || '',
                    example_base: data.example_base || '',
                    usage: data.usage || '',
                    past_simple: data.past_simple || '',
                    pronunciation_ps: data.pronunciation_ps || '',
                    translation_ps: data.translation_ps || '',
                    example_ps: data.example_ps || '',
                    past_participle: data.past_participle || '',
                    pronunciation_pp: data.pronunciation_pp || '',
                    translation_pp: data.translation_pp || '',
                    example_pp: data.example_pp || '',
                    adjective: data.adjective || '',
                    pronunciation_adj: data.pronunciation_adj || '',
                    translation_adj: data.translation_adj || '',
                    example_adj: data.example_adj || '',
                    example_adj_translation: data.example_adj_translation || '',
                    adverb: data.adverb || '',
                    pronunciation_adv: data.pronunciation_adv || '',
                    translation_adv: data.translation_adv || '',
                    example_adv: data.example_adv || '',
                    example_adv_translation: data.example_adv_translation || '',
                    noun: data.noun || '',
                    pronunciation_noun: data.pronunciation_noun || '',
                    translation_noun: data.translation_noun || '',
                    example_noun: data.example_noun || '',
                    example_noun_translation: data.example_noun_translation || ''
                })

            if (error) {
                alert('❌ Error al guardar: ' + error.message)
                return
            }

            const providerBadge = data.provider === 'groq' ? '⚡ Groq' : '🤖 Gemini'
            showToast(`✅ Guardado con ${providerBadge} en "${finalSubcategory}"`, 'success')

            clearAfterSave()

            const { loadVerbsFromSupabase } = await import('./verbs-loader.js')
            await loadVerbsFromSupabase(true)

            if (currentVerbCategory) openVerbCategory(currentVerbCategory)
            return
        }

        await saveAIResult()

        clearAfterSave()

        const { loadVerbsFromSupabase } = await import('./verbs-loader.js')
        await loadVerbsFromSupabase(true)

        showToast('✅ Verbo guardado exitosamente', 'success')

        if (currentVerbCategory) openVerbCategory(currentVerbCategory)
    } catch (error) {
        console.error('Error guardando verbo:', error)
        alert('Error al guardar: ' + error.message)
    }
}