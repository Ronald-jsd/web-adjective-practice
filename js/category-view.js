import { store } from './config.js'
import { showToast } from './cache.js'
import { editCell, updateWordStatus, getStatusBadge } from './editing.js'
import { loadUserCustomItems } from './auth.js'
import { initDragAndDrop } from './drag-drop.js'
import { makeClickableText } from './audio.js'


// VISTA DE CATEGORÍA (PÁGINA COMPLETA)
function openCategoryView(data) {
    if (!data) return
    store.currentCategoryData = data

    const grid = document.getElementById('categories-grid')
    const searchDiv = document.getElementById('search-results')
    const categoryView = document.getElementById('category-view')

    if (grid) grid.classList.add('hidden')
    if (searchDiv) searchDiv.classList.add('hidden')
    if (categoryView) categoryView.classList.remove('hidden')

    window.scrollTo({ top: 0, behavior: 'smooth' })

    if (store.currentSubcategoryId === null) {
        store.activeSubcatIndex = 0
    } else {
        const foundIndex = data.subcategories.findIndex(sub => sub.id === store.currentSubcategoryId)
        store.activeSubcatIndex = foundIndex !== -1 ? foundIndex : 0
    }

    const titleEl = document.getElementById('category-view-title')
    const subtitleEl = document.getElementById('category-view-subtitle')
    const iconDiv = document.getElementById('category-view-icon')
    const subcatCountSpan = document.getElementById('subcat-count-view')

    if (titleEl) titleEl.textContent = data.title || ''
    if (subtitleEl) subtitleEl.textContent = data.subtitle || ''
    if (iconDiv) {
        iconDiv.textContent = data.icon || '📚'
        iconDiv.className = `p-2 rounded-xl text-2xl shadow-sm ${data.color || 'bg-gray-100'}`
    }
    if (subcatCountSpan) subcatCountSpan.textContent = `${data.subcategories.length} subcategorías`

    const tabsContainer = document.getElementById('subcategories-tabs')
    if (tabsContainer) {
        tabsContainer.innerHTML = ''
        data.subcategories.forEach((sub, idx) => {
            const btn = document.createElement('button')
            const isActive = idx === store.activeSubcatIndex
            btn.className = `px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap flex items-center gap-2 ${isActive
                    ? 'bg-amber-500 text-white shadow-md'
                    : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
                }`
            btn.innerHTML = `
                <span class="text-xs ${isActive ? 'text-amber-100' : 'text-gray-400'} font-bold">${idx + 1}</span>
                <span>${sub.title || 'Sin título'}</span>
                <span class="text-xs ${isActive ? 'text-amber-100' : 'text-gray-400'}">(${sub.items.length})</span>
            `
            btn.onclick = () => {
                store.currentSubcategoryId = sub.id
                selectSubcategory(idx)
            }
            tabsContainer.appendChild(btn)
        })
    }

    function selectSubcategory(index) {
        store.activeSubcatIndex = index
        store.currentSubcategoryId = data.subcategories[index].id

        const tabs = tabsContainer.querySelectorAll('button')
        tabs.forEach((btn, i) => {
            const sub = data.subcategories[i]
            const isActive = i === index
            btn.className = `px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap flex items-center gap-2 ${isActive
                    ? 'bg-amber-500 text-white shadow-md'
                    : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
                }`
            btn.innerHTML = `
                <span class="text-xs ${isActive ? 'text-amber-100' : 'text-gray-400'} font-bold">${i + 1}</span>
                <span>${sub.title || 'Sin título'}</span>
                <span class="text-xs ${isActive ? 'text-amber-100' : 'text-gray-400'}">(${sub.items.length})</span>
            `
        })

        renderActiveContent()
    }

    function renderActiveContent(itemsOverride) {
        const sub = data.subcategories[store.activeSubcatIndex]
        if (!sub) return

        const allItems = itemsOverride ? [...itemsOverride] : [...sub.items]

        if (!itemsOverride && store.currentUser && store.userCustomItems.length > 0) {
            const currentSubcatTitle = sub.title.toLowerCase().trim()
            const currentCatTitle = data.title.toLowerCase().trim()
            const isFirstSubcat = store.activeSubcatIndex === 0

            store.userCustomItems.forEach(customItem => {
                const itemSubcat = (customItem.subcategory || '').toLowerCase().trim()
                const itemCat = (customItem.category || '').toLowerCase().trim()

                if (itemSubcat && itemSubcat === currentSubcatTitle) {
                    allItems.push([customItem.word, customItem.pronunciation || '', customItem.spanish, customItem.example_en || '', customItem.example_es || '', `custom_${customItem.id}`, customItem.id])
                    return
                }
                if (itemSubcat && currentSubcatTitle.includes(itemSubcat)) {
                    allItems.push([customItem.word, customItem.pronunciation || '', customItem.spanish, customItem.example_en || '', customItem.example_es || '', `custom_${customItem.id}`, customItem.id])
                    return
                }
                if (!itemSubcat && itemCat === currentCatTitle && isFirstSubcat) {
                    allItems.push([customItem.word, customItem.pronunciation || '', customItem.spanish, customItem.example_en || '', customItem.example_es || '', `custom_${customItem.id}`, customItem.id])
                    return
                }
                if (itemSubcat && itemCat === currentCatTitle && isFirstSubcat) {
                    const subcatExists = data.subcategories.some(s =>
                        s.title.toLowerCase().trim() === itemSubcat ||
                        s.title.toLowerCase().trim().includes(itemSubcat)
                    )
                    if (!subcatExists) {
                        allItems.push([customItem.word, customItem.pronunciation || '', customItem.spanish, customItem.example_en || '', customItem.example_es || '', `custom_${customItem.id}`, customItem.id])
                    }
                }
            })
        }

        function buildRows(items) {
            return items.map((item, idx) => {
                const itemId = item[5] || `${sub.id}-${idx}`
                const isCustom = itemId.toString().startsWith('custom_')
                const customId = isCustom ? item[6] : null
                const status = store.wordStatusMap.get(itemId.toString()) || 0
                const statusBadge = getStatusBadge(status)

                const itemObj = {
                    id: isCustom ? customId : item[5], word: item[0], pronunciation: item[1],
                    spanish: item[2], example_en: item[3], example_es: item[4],
                    isCustom, subcategoryId: sub.id, categoryId: data.id
                }

                const wordEn = makeClickableText(item[0], 'en')
                const wordEs = makeClickableText(item[2], 'es')
                const exampleEn = makeClickableText(item[3], 'en')
                const exampleEs = makeClickableText(item[4], 'es')

                const itemObjStr = JSON.stringify(itemObj).replace(/"/g, '&quot;')
                const escapedWord = item[0].replace(/'/g, "\\'")
                const escapedSpanish = item[2].replace(/'/g, "\\'")
                const escapedPronunciation = (item[1] || '').replace(/'/g, "\\'")
                const escapedExampleEn = (item[3] || '').replace(/'/g, "\\'")
                const escapedExampleEs = (item[4] || '').replace(/'/g, "\\'")

                const dragHandleHtml = store.currentUser
                    ? `<td class="py-3 px-2 border-b w-12 text-center">
                            <span class="drag-handle inline-flex items-center justify-center cursor-grab active:cursor-grabbing text-gray-400 hover:text-amber-500 transition-all p-1 rounded hover:bg-gray-100">
                                <svg width="14" height="20" viewBox="0 0 10 18" fill="currentColor"><circle cx="2.5" cy="3" r="1.5"/><circle cx="7.5" cy="3" r="1.5"/><circle cx="2.5" cy="9" r="1.5"/><circle cx="7.5" cy="9" r="1.5"/><circle cx="2.5" cy="15" r="1.5"/><circle cx="7.5" cy="15" r="1.5"/></svg>
                            </span>
                       </td>`
                    : ''

                return `
                    <tr data-item-id="${itemId}" class="${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-gray-100 transition-colors ${isCustom ? 'custom-row' : ''}">
                        ${dragHandleHtml}
                        <td class="py-3 px-4 border-b" ondblclick="window.editCell('word', '${escapedWord}', ${itemObjStr})">
                            <div class="flex items-center gap-2 flex-wrap">
                                ${wordEn} ${statusBadge}
                                ${!isCustom ? '<span class="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded whitespace-nowrap">📚 DB</span>' : '<span class="text-xs px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded whitespace-nowrap">✏️</span>'}
                            </div>
                        </td>
                        <td class="py-3 px-4 border-b" ondblclick="window.editCell('pronunciation', '${escapedPronunciation}', ${itemObjStr})">
                            <span class="text-sm text-gray-500 font-mono break-all">[${item[1] || ''}]</span>
                        </td>
                        <td class="py-3 px-4 border-b" ondblclick="window.editCell('spanish', '${escapedSpanish}', ${itemObjStr})">${wordEs}</td>
                        <td class="py-3 px-4 border-b" ondblclick="window.editCell('example_en', '${escapedExampleEn}', ${itemObjStr})">${exampleEn}</td>
                        <td class="py-3 px-4 border-b" ondblclick="window.editCell('example_es', '${escapedExampleEs}', ${itemObjStr})">${exampleEs}</td>
                        ${store.currentUser ? `
                        <td class="py-3 px-4 border-b">
                            <div class="flex gap-1 flex-wrap">
                                <button onclick="event.stopPropagation(); window.updateWordStatus('${itemId}', 1)" class="px-2.5 py-1.5 text-xs rounded ${status === 1 ? 'bg-yellow-500 text-white' : 'bg-gray-200 hover:bg-yellow-200'}">📚</button>
                                <button onclick="event.stopPropagation(); window.updateWordStatus('${itemId}', 2)" class="px-2.5 py-1.5 text-xs rounded ${status === 2 ? 'bg-green-500 text-white' : 'bg-gray-200 hover:bg-green-200'}">✅</button>
                                <button onclick="event.stopPropagation(); window.updateWordStatus('${itemId}', 3)" class="px-2.5 py-1.5 text-xs rounded ${status === 3 ? 'bg-blue-500 text-white' : 'bg-gray-200 hover:bg-blue-200'}">⚠️</button>
                            </div>
                        </td>` : ''}
                    </tr>
                `
            }).join('')
        }

        const dragHandleHeader = store.currentUser ? '<th class="py-3 px-2 text-xs font-bold w-12"></th>' : ''
        const contentEl = document.getElementById('category-view-content')
        const subcatHeaderEl = document.getElementById('subcategory-header')

        if (subcatHeaderEl) {
            subcatHeaderEl.innerHTML = `
                <div class="flex items-center justify-between flex-wrap gap-2">
                    <div>
                        <h3 class="font-serif-oxford font-bold text-xl text-gray-900">${sub.title || 'Sin título'}</h3>
                        <p class="text-sm text-gray-500 mt-1">
                            ${allItems.length} ${allItems.length === 1 ? 'término' : 'términos'} • 
                            🔊 Click para escuchar • ✏️ Doble click para editar${store.currentUser ? ' • ⋮⋮ Arrastra para reordenar' : ''}
                        </p>
                    </div>
                    <div class="text-xs text-gray-400 bg-gray-100 px-3 py-1.5 rounded-full">
                        ${data.title} → ${sub.title}
                    </div>
                </div>
            `
        }

        if (contentEl) {
            contentEl.innerHTML = `
                <div class="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                    <div class="overflow-x-auto">
                        <table class="w-full text-left">
                            <thead class="bg-gray-50 border-b-2 border-gray-200">
                                <tr>
                                    ${dragHandleHeader}
                                    <th class="py-3 px-4 text-xs font-bold text-gray-600 uppercase tracking-wider">Adjective 🔊</th>
                                    <th class="py-3 px-4 text-xs font-bold text-gray-600 uppercase tracking-wider">Pronun.</th>
                                    <th class="py-3 px-4 text-xs font-bold text-gray-600 uppercase tracking-wider">Español 🔊</th>
                                    <th class="py-3 px-4 text-xs font-bold text-gray-600 uppercase tracking-wider">Example EN 🔊</th>
                                    <th class="py-3 px-4 text-xs font-bold text-gray-600 uppercase tracking-wider">Example ES 🔊</th>
                                    ${store.currentUser ? '<th class="py-3 px-4 text-xs font-bold text-gray-600 uppercase tracking-wider">Progreso</th>' : ''}
                                </tr>
                            </thead>
                            <tbody id="sortable-tbody">${buildRows(allItems)}</tbody>
                        </table>
                    </div>
                    ${allItems.length === 0 ? `
                        <div class="py-12 text-center text-gray-400">
                            <div class="text-4xl mb-2">📭</div>
                            <p>No hay términos en esta subcategoría todavía</p>
                        </div>
                    ` : ''}
                </div>
            `

            if (store.currentUser && allItems.length > 0) {
                const tbodyEl = contentEl.querySelector('#sortable-tbody')
                if (tbodyEl) {
                    if (store.dragCleanup) {
                        store.dragCleanup()
                        store.dragCleanup = null
                    }
                    store.dragCleanup = initDragAndDrop(tbodyEl, allItems, sub.id, (newItems) => renderActiveContent(newItems))
                }
            }
        }
    }

    selectSubcategory(store.activeSubcatIndex)
}

function closeCategoryView() {
    const categoryView = document.getElementById('category-view')
    const grid = document.getElementById('categories-grid')

    if (categoryView) categoryView.classList.add('hidden')
    if (grid) grid.classList.remove('hidden')

    if (store.dragCleanup) {
        store.dragCleanup()
        store.dragCleanup = null
    }

    store.currentCategoryData = null
    store.currentSubcategoryId = null

    window.scrollTo({ top: 0, behavior: 'smooth' })
}

export { openCategoryView, closeCategoryView }

window.closeCategoryView = closeCategoryView