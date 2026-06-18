import { store } from './config.js'
import { makeClickableText } from './audio.js'
import { renderCategories } from './data.js'

function performSearch(query) {
    store.lastSearchQuery = query
    if (!query?.trim()) {
        renderCategories(store.categoriesData)
        return
    }

    query = query.toLowerCase().trim()
    const results = []
    store.categoriesData.forEach(cat => {
        cat.subcategories.forEach(sub => {
            sub.items.forEach(item => {
                if (item[0].toLowerCase().includes(query) || item[2].toLowerCase().includes(query)) {
                    results.push({
                        category: cat.title, subcategory: sub.title, word: item[0],
                        pronunciation: item[1], spanish: item[2], example_en: item[3]
                    })
                }
            })
        })
    })

    if (store.currentUser && store.userCustomItems.length > 0) {
        store.userCustomItems.forEach(customItem => {
            if (customItem.word.toLowerCase().includes(query) || customItem.spanish.toLowerCase().includes(query)) {
                results.push({
                    category: '📝 Mis Expresiones', subcategory: 'Personalizadas',
                    word: customItem.word, pronunciation: customItem.pronunciation || '',
                    spanish: customItem.spanish, example_en: customItem.example_en || ''
                })
            }
        })
    }

    store.currentSearchResults = results
    store.searchPaginationState.currentPage = 1
    store.searchPaginationState.totalPages = Math.ceil(results.length / 15)
    renderSearchResults()
}

function renderSearchResults() {
    const grid = document.getElementById('categories-grid')
    const searchDiv = document.getElementById('search-results')
    const categoryView = document.getElementById('category-view')
    const tbody = document.getElementById('search-results-tbody')

    if (!grid || !searchDiv) return

    grid.classList.add('hidden')
    if (categoryView) categoryView.classList.add('hidden')
    searchDiv.classList.remove('hidden')

    const countEl = document.getElementById('search-results-count')
    if (countEl) countEl.textContent = `Se encontraron ${store.currentSearchResults.length} resultados`

    const start = (store.searchPaginationState.currentPage - 1) * 15
    const pageResults = store.currentSearchResults.slice(start, start + 15)

    if (tbody) {
        tbody.innerHTML = pageResults.map(r => {
            const wordWithAudio = makeClickableText(r.word, 'en')
            const spanishWithAudio = makeClickableText(r.spanish, 'es')
            const exampleWithAudio = makeClickableText(r.example_en, 'en')
            return `
                <tr class="hover:bg-gray-50">
                    <td class="py-2.5 px-3 text-sm">${r.category || ''}</td>
                    <td class="py-2.5 px-3 text-sm">${r.subcategory || ''}</td>
                    <td class="py-2.5 px-3 font-bold">${wordWithAudio}</td>
                    <td class="py-2.5 px-3 text-xs font-mono text-gray-500">[${r.pronunciation || ''}]</td>
                    <td class="py-2.5 px-3">${spanishWithAudio}</td>
                    <td class="py-2.5 px-3 text-sm text-gray-600">${exampleWithAudio}</td>
                </tr>
            `
        }).join('')
    }

    const pagDiv = document.getElementById('search-pagination')
    if (pagDiv) {
        if (store.searchPaginationState.totalPages > 1) {
            pagDiv.innerHTML = `
                <button id="prev-page" ${store.searchPaginationState.currentPage === 1 ? 'disabled' : ''} class="px-3 py-1.5 border rounded-md disabled:opacity-50">← Anterior</button>
                <span>Página ${store.searchPaginationState.currentPage} de ${store.searchPaginationState.totalPages}</span>
                <button id="next-page" ${store.searchPaginationState.currentPage === store.searchPaginationState.totalPages ? 'disabled' : ''} class="px-3 py-1.5 border rounded-md disabled:opacity-50">Siguiente →</button>
            `
            document.getElementById('prev-page')?.addEventListener('click', () => {
                if (store.searchPaginationState.currentPage > 1) {
                    store.searchPaginationState.currentPage--;
                    renderSearchResults()
                }
            })
            document.getElementById('next-page')?.addEventListener('click', () => {
                if (store.searchPaginationState.currentPage < store.searchPaginationState.totalPages) {
                    store.searchPaginationState.currentPage++;
                    renderSearchResults()
                }
            })
        } else {
            pagDiv.innerHTML = ''
        }
    }

    showAISuggestion()
}

function showAISuggestion() {
    const aiSuggestionDiv = document.getElementById('ai-suggestion-container')
    if (!aiSuggestionDiv) return

    if (store.currentSearchResults.length === 0 && store.lastSearchQuery.trim()) {
        const existingPreview = document.getElementById('ai-preview')
        if (existingPreview) existingPreview.remove()

        const aiBtn = document.getElementById('ai-generate-btn')
        if (aiBtn) {
            aiBtn.disabled = false
            aiBtn.innerHTML = `
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
                </svg>
                ✨ Generar con IA`
        }

        aiSuggestionDiv.classList.remove('hidden')
        document.getElementById('ai-search-word').textContent = store.lastSearchQuery

        const noKeyWarning = document.getElementById('ai-no-key-warning')
        if (noKeyWarning) {
            import('./ai.js').then(module => {
                if (!module.hasApiKey('groq') && !module.hasApiKey('gemini')) {
                    noKeyWarning.classList.remove('hidden')
                } else {
                    noKeyWarning.classList.add('hidden')
                }
            })
        }
    } else {
        aiSuggestionDiv.classList.add('hidden')
        const existingPreview = document.getElementById('ai-preview')
        if (existingPreview) existingPreview.remove()
    }
}

export { performSearch, renderSearchResults }