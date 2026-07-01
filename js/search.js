// search.js - CON DOS MODOS DE BÚSQUEDA
import { store } from './config.js'
import { makeClickableText } from './audio.js'
import { renderCategories } from './data.js'
import { editCell, updateWordStatus, getStatusBadge } from './editing.js'

const PAGE_SIZE_OPTIONS = [10, 15, 25, 50, 100]
const DEFAULT_PAGE_SIZE = 15

export let searchMode = 'partial'

function performSearch(query) {
    store.lastSearchQuery = query
    if (!query?.trim()) {
        renderCategories(store.categoriesData)
        return
    }

    query = query.toLowerCase().trim()
    const results = []

    const matchesSearch = (text) => {
        const lowerText = text.toLowerCase()
        if (searchMode === 'exact') {
            const words = lowerText.split(/\s+/)
            return words.some(word => word === query)
        } else {
            return lowerText.includes(query)
        }
    }

    store.categoriesData.forEach(cat => {
        cat.subcategories.forEach(sub => {
            sub.items.forEach(item => {
                const wordMatch = matchesSearch(item[0])
                const spanishMatch = matchesSearch(item[2])

                if (wordMatch || spanishMatch) {
                    results.push({
                        category: cat.title,
                        categoryId: cat.id,
                        subcategory: sub.title,
                        subcategoryId: sub.id,
                        word: item[0],
                        pronunciation: item[1],
                        spanish: item[2],
                        example_en: item[3],
                        example_es: item[4] || '',
                        id: item[5],
                        isCustom: false,
                        itemIndex: sub.items.indexOf(item)
                    })
                }
            })
        })
    })

    if (store.currentUser && store.userCustomItems?.length > 0) {
        store.userCustomItems.forEach(customItem => {
            const wordMatch = matchesSearch(customItem.word || '')
            const spanishMatch = matchesSearch(customItem.spanish || '')

            if (wordMatch || spanishMatch) {
                results.push({
                    category: '📝 Mis Expresiones',
                    categoryId: null,
                    subcategory: 'Personalizadas',
                    subcategoryId: null,
                    word: customItem.word,
                    pronunciation: customItem.pronunciation || '',
                    spanish: customItem.spanish,
                    example_en: customItem.example_en || '',
                    example_es: customItem.example_es || '',
                    id: `custom_${customItem.id}`,
                    isCustom: true,
                    customData: customItem,
                    itemIndex: 0
                })
            }
        })
    }

    store.currentSearchResults = results
    store.searchPaginationState.currentPage = 1
    store.searchPaginationState.pageSize = store.searchPaginationState.pageSize || DEFAULT_PAGE_SIZE
    store.searchPaginationState.totalPages = Math.ceil(results.length / store.searchPaginationState.pageSize)
    renderSearchResults()
}

export function setSearchMode(mode) {
    searchMode = mode
    const partialBtn = document.getElementById('search-mode-partial')
    const exactBtn = document.getElementById('search-mode-exact')
    const hint = document.getElementById('search-mode-hint')

    console.log('🔄 Cambiando modo a:', mode)

    if (mode === 'partial') {
        if (partialBtn) {
            partialBtn.className = 'px-4 py-1.5 rounded-md text-sm font-medium transition-all bg-amber-500 text-white'
        }
        if (exactBtn) {
            exactBtn.className = 'px-4 py-1.5 rounded-md text-sm font-medium transition-all text-gray-600 hover:bg-gray-200'
        }
        if (hint) hint.textContent = '(Busca palabras que CONTENGAN el texto)'
    } else {
        if (partialBtn) {
            partialBtn.className = 'px-4 py-1.5 rounded-md text-sm font-medium transition-all text-gray-600 hover:bg-gray-200'
        }
        if (exactBtn) {
            exactBtn.className = 'px-4 py-1.5 rounded-md text-sm font-medium transition-all bg-amber-500 text-white'
        }
        if (hint) hint.textContent = '(Busca palabras EXACTAS)'
    }

    if (store.lastSearchQuery?.trim()) {
        performSearch(store.lastSearchQuery)
    }
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

    const pageSize = store.searchPaginationState.pageSize || DEFAULT_PAGE_SIZE
    const totalResults = store.currentSearchResults.length
    const totalPages = Math.ceil(totalResults / pageSize) || 1

    if (store.searchPaginationState.currentPage > totalPages) {
        store.searchPaginationState.currentPage = totalPages
    }

    const start = (store.searchPaginationState.currentPage - 1) * pageSize
    const pageResults = store.currentSearchResults.slice(start, start + pageSize)

    const countEl = document.getElementById('search-results-count')
    if (countEl) {
        const end = Math.min(start + pageSize, totalResults)
        countEl.textContent = `Mostrando ${totalResults > 0 ? start + 1 : 0}-${end} de ${totalResults} resultados`
    }

    if (tbody) {
        if (pageResults.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="py-8 text-center text-gray-500">
                        No se encontraron resultados para "<strong>${store.lastSearchQuery}</strong>"
                        <br>
                        <span class="text-xs text-gray-400">Modo: ${searchMode === 'exact' ? 'Palabra exacta' : 'Contiene'}</span>
                    </td>
                </tr>
            `
        } else {
            tbody.innerHTML = pageResults.map((r, idx) => {
                const wordWithAudio = makeClickableText(r.word, 'en')
                const spanishWithAudio = makeClickableText(r.spanish, 'es')
                const exampleWithAudio = makeClickableText(r.example_en, 'en')
                const exampleEsWithAudio = makeClickableText(r.example_es || '', 'es')

                const status = store.wordStatusMap.get(r.id.toString()) || 0
                const statusBadge = getStatusBadge(status)

                const itemObj = {
                    id: r.isCustom ? r.customData?.id : r.id,
                    word: r.word,
                    pronunciation: r.pronunciation,
                    spanish: r.spanish,
                    example_en: r.example_en,
                    example_es: r.example_es,
                    isCustom: r.isCustom,
                    subcategoryId: r.subcategoryId,
                    categoryId: r.categoryId
                }

                const itemObjStr = JSON.stringify(itemObj).replace(/"/g, '&quot;')
                const escapedWord = r.word.replace(/'/g, "\\'")
                const escapedSpanish = r.spanish.replace(/'/g, "\\'")
                const escapedPronunciation = (r.pronunciation || '').replace(/'/g, "\\'")
                const escapedExampleEn = (r.example_en || '').replace(/'/g, "\\'")
                const escapedExampleEs = (r.example_es || '').replace(/'/g, "\\'")

                return `
                    <tr class="hover:bg-gray-50 ${r.isCustom ? 'bg-purple-50/50' : ''}">
                        <td class="py-2.5 px-3 text-sm">${r.category || ''}</td>
                        <td class="py-2.5 px-3 text-sm">${r.subcategory || ''}</td>
                        <td class="py-2.5 px-3 font-bold" ondblclick="window.editCell('word', '${escapedWord}', ${itemObjStr})">
                            <div class="flex items-center gap-2 flex-wrap">
                                ${wordWithAudio} ${statusBadge}
                                ${!r.isCustom ? '<span class="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded whitespace-nowrap">📚 DB</span>' : '<span class="text-xs px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded whitespace-nowrap">✏️</span>'}
                            </div>
                        </td>
                        <td class="py-2.5 px-3 text-xs font-mono text-gray-500" ondblclick="window.editCell('pronunciation', '${escapedPronunciation}', ${itemObjStr})">
                            [${r.pronunciation || ''}]
                        </td>
                        <td class="py-2.5 px-3" ondblclick="window.editCell('spanish', '${escapedSpanish}', ${itemObjStr})">
                            ${spanishWithAudio}
                        </td>
                        <td class="py-2.5 px-3 text-sm text-gray-600" ondblclick="window.editCell('example_en', '${escapedExampleEn}', ${itemObjStr})">
                            ${exampleWithAudio}
                        </td>
                        <td class="py-2.5 px-3 text-sm text-gray-600" ondblclick="window.editCell('example_es', '${escapedExampleEs}', ${itemObjStr})">
                            ${exampleEsWithAudio}
                        </td>
                        ${store.currentUser ? `
                        <td class="py-2.5 px-3">
                            <div class="flex gap-1 flex-wrap">
                                <button onclick="event.stopPropagation(); window.updateWordStatus('${r.id}', 1)" class="px-2.5 py-1.5 text-xs rounded ${status === 1 ? 'bg-yellow-500 text-white' : 'bg-gray-200 hover:bg-yellow-200'}">📚</button>
                                <button onclick="event.stopPropagation(); window.updateWordStatus('${r.id}', 2)" class="px-2.5 py-1.5 text-xs rounded ${status === 2 ? 'bg-green-500 text-white' : 'bg-gray-200 hover:bg-green-200'}">✅</button>
                                <button onclick="event.stopPropagation(); window.updateWordStatus('${r.id}', 3)" class="px-2.5 py-1.5 text-xs rounded ${status === 3 ? 'bg-blue-500 text-white' : 'bg-gray-200 hover:bg-blue-200'}">⚠️</button>
                            </div>
                        </td>` : ''}
                    </tr>
                `
            }).join('')
        }
    }

    renderPaginationControls(totalPages, totalResults, pageSize)
    showAISuggestion()
}

function renderPaginationControls(totalPages, totalResults, pageSize) {
    const pagDiv = document.getElementById('search-pagination')
    if (!pagDiv) return

    const currentPage = store.searchPaginationState.currentPage

    if (totalPages <= 1 && totalResults <= pageSize) {
        pagDiv.innerHTML = `
            <div class="flex items-center justify-between w-full">
                <div class="flex items-center gap-2">
                    <span class="text-sm text-gray-600">Mostrar:</span>
                    <select id="page-size-select" class="border rounded-md px-2 py-1 text-sm bg-white">
                        ${PAGE_SIZE_OPTIONS.map(size =>
            `<option value="${size}" ${size === pageSize ? 'selected' : ''}>${size}</option>`
        ).join('')}
                    </select>
                </div>
                <span class="text-sm text-gray-500">${totalResults} resultados</span>
            </div>
        `
    } else {
        const start = (currentPage - 1) * pageSize + 1
        const end = Math.min(currentPage * pageSize, totalResults)

        let paginationHTML = `
            <div class="flex flex-col sm:flex-row items-center justify-between w-full gap-3">
                <div class="flex items-center gap-2">
                    <span class="text-sm text-gray-600">Mostrar:</span>
                    <select id="page-size-select" class="border rounded-md px-2 py-1 text-sm bg-white">
                        ${PAGE_SIZE_OPTIONS.map(size =>
            `<option value="${size}" ${size === pageSize ? 'selected' : ''}>${size}</option>`
        ).join('')}
                    </select>
                </div>
                
                <div class="flex items-center gap-2">
                    <span class="text-sm text-gray-500 mr-2">
                        ${start}-${end} de ${totalResults}
                    </span>
                    
                    <button id="first-page" ${currentPage === 1 ? 'disabled' : ''} 
                        class="px-2.5 py-1.5 border rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50">
                        ««
                    </button>
                    <button id="prev-page" ${currentPage === 1 ? 'disabled' : ''} 
                        class="px-3 py-1.5 border rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50">
                        ← Anterior
                    </button>
                    
                    <select id="page-select" class="border rounded-md px-2 py-1 text-sm bg-white min-w-[60px]">
                        ${Array.from({ length: totalPages }, (_, i) =>
            `<option value="${i + 1}" ${i + 1 === currentPage ? 'selected' : ''}>
                                ${i + 1}/${totalPages}
                            </option>`
        ).join('')}
                    </select>
                    
                    <button id="next-page" ${currentPage === totalPages ? 'disabled' : ''} 
                        class="px-3 py-1.5 border rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50">
                        Siguiente →
                    </button>
                    <button id="last-page" ${currentPage === totalPages ? 'disabled' : ''} 
                        class="px-2.5 py-1.5 border rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50">
                        »»
                    </button>
                </div>
            </div>
        `

        pagDiv.innerHTML = paginationHTML

        const addListener = (id, callback) => {
            const el = document.getElementById(id)
            if (el) el.addEventListener('click', callback)
        }

        addListener('first-page', () => {
            if (currentPage > 1) {
                store.searchPaginationState.currentPage = 1
                renderSearchResults()
            }
        })

        addListener('prev-page', () => {
            if (currentPage > 1) {
                store.searchPaginationState.currentPage--
                renderSearchResults()
            }
        })

        addListener('next-page', () => {
            if (currentPage < totalPages) {
                store.searchPaginationState.currentPage++
                renderSearchResults()
            }
        })

        addListener('last-page', () => {
            if (currentPage < totalPages) {
                store.searchPaginationState.currentPage = totalPages
                renderSearchResults()
            }
        })

        const pageSelect = document.getElementById('page-select')
        if (pageSelect) {
            pageSelect.addEventListener('change', (e) => {
                store.searchPaginationState.currentPage = parseInt(e.target.value)
                renderSearchResults()
            })
        }
    }

    const sizeSelect = document.getElementById('page-size-select')
    if (sizeSelect) {
        sizeSelect.addEventListener('change', (e) => {
            const newSize = parseInt(e.target.value)
            store.searchPaginationState.pageSize = newSize
            store.searchPaginationState.currentPage = 1
            store.searchPaginationState.totalPages = Math.ceil(store.currentSearchResults.length / newSize)
            renderSearchResults()
        })
    }
}

function showAISuggestion() {
    const aiSuggestionDiv = document.getElementById('ai-suggestion-container')
    if (!aiSuggestionDiv) return

    const totalResults = store.currentSearchResults.length
    const query = store.lastSearchQuery?.trim()

    if (totalResults === 0 && query) {
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
        document.getElementById('ai-search-word').textContent = query

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

function initSearchPaginationState() {
    if (!store.searchPaginationState) {
        store.searchPaginationState = {
            currentPage: 1,
            pageSize: DEFAULT_PAGE_SIZE,
            totalPages: 1
        }
    }
}

export function initSearchModeListeners() {
    const partialBtn = document.getElementById('search-mode-partial')
    const exactBtn = document.getElementById('search-mode-exact')

    console.log('🔍 Inicializando listeners de búsqueda...')
    console.log('partialBtn:', partialBtn)
    console.log('exactBtn:', exactBtn)

    if (partialBtn) {
        const newPartialBtn = partialBtn.cloneNode(true)
        partialBtn.parentNode.replaceChild(newPartialBtn, partialBtn)
        newPartialBtn.addEventListener('click', () => {
            console.log('🔄 Click en "Contiene"')
            setSearchMode('partial')
        })
    } else {
        console.warn('⚠️ No se encontró el botón "search-mode-partial"')
    }

    if (exactBtn) {
        const newExactBtn = exactBtn.cloneNode(true)
        exactBtn.parentNode.replaceChild(newExactBtn, exactBtn)
        newExactBtn.addEventListener('click', () => {
            console.log('🔄 Click en "Palabra exacta"')
            setSearchMode('exact')
        })
    } else {
        console.warn('⚠️ No se encontró el botón "search-mode-exact"')
    }
}

export {
    performSearch,
    renderSearchResults,
    initSearchPaginationState,
    PAGE_SIZE_OPTIONS,
    DEFAULT_PAGE_SIZE
}