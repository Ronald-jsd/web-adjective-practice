import { store } from './config.js'
import { showToast } from './cache.js'
import { updateCachedCategories } from './data.js'
import { cacheRow, readCachedRow, TABLES } from './offline/cache.js'
import { queueChange, isOnline } from './offline/sync.js'

function withNewOrder(row, index) {
    const copy = [...row]
    if (String(copy[5] || '').startsWith('custom_')) {
        copy[7] = index
    } else {
        copy[6] = index
    }
    return copy
}

async function saveItemOrder(items, subcategoryId) {
    if (!store.currentUser) {
        showToast('Inicia sesión para guardar el orden', 'error')
        return
    }

    const userId = store.currentUser.id
    const normalizedItems = items.map(withNewOrder)

    for (let idx = 0; idx < items.length; idx++) {
        const item = items[idx]
        const itemId = item[5]
        const isCustom = itemId && itemId.toString().startsWith('custom_')

        if (isCustom) {
            const customId = item[6]
            const cached = await readCachedRow(TABLES.customItems, customId)
            await cacheRow(TABLES.customItems, customId, {
                ...(cached || {}),
                id: cached?.id ?? customId,
                user_id: cached?.user_id || userId,
                sort_order: idx
            })
            await queueChange({
                table: TABLES.customItems,
                action: 'update',
                payload: { sort_order: idx },
                match: { id: customId, user_id: userId },
                localId: customId,
                description: 'Reordenar vocabulario'
            })
        } else {
            const numericId = parseInt(itemId)
            if (!isNaN(numericId)) {
                await queueChange({
                    table: 'items',
                    action: 'update',
                    payload: { sort_order: idx },
                    match: { id: numericId },
                    description: 'Reordenar palabras'
                })
            }
        }
    }

    const updated = await updateCachedCategories(snapshot => {
        for (const category of snapshot) {
            for (const subcategory of category.subcategories || []) {
                if (String(subcategory.id) === String(subcategoryId)) {
                    subcategory.items = normalizedItems
                }
            }
        }
    })
    if (updated) store.categoriesData = updated

    showToast(
        isOnline()
            ? '✅ Orden guardado'
            : 'Orden guardado en el dispositivo; se sincronizará al volver la conexión.',
        'success'
    )
}

function initDragAndDrop(tbody, allItems, subcategoryId, refreshCallback) {
    let dragState = { active: false, sourceIndex: null, targetIndex: null }

    function getRows() { return Array.from(tbody.querySelectorAll('tr')) }
    
    function clearHighlights() {
        getRows().forEach(row => {
            row.classList.remove('drag-over-top', 'drag-over-bottom', 'dragging-source')
            row.style.opacity = ''
        })
    }

    function findTargetIndex(clientY) {
        const rows = getRows()
        for (let i = 0; i < rows.length; i++) {
            const rect = rows[i].getBoundingClientRect()
            if (clientY >= rect.top && clientY <= rect.bottom) {
                return { index: i, above: clientY < rect.top + rect.height / 2 }
            }
        }
        return null
    }

    function onMove(clientY) {
        if (!dragState.active) return
        const found = findTargetIndex(clientY)
        if (!found) return
        clearHighlights()
        const rows = getRows()
        if (rows[dragState.sourceIndex]) {
            rows[dragState.sourceIndex].classList.add('dragging-source')
            rows[dragState.sourceIndex].style.opacity = '0.4'
        }
        let insertAtIndex = found.index
        if (!found.above) insertAtIndex = found.index + 1
        if (dragState.sourceIndex < insertAtIndex) insertAtIndex--
        dragState.targetIndex = insertAtIndex
        if (found.index !== dragState.sourceIndex) {
            rows[found.index].classList.add(found.above ? 'drag-over-top' : 'drag-over-bottom')
        }
    }

    async function endDrag() {
        if (!dragState.active) return
        dragState.active = false
        clearHighlights()
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', endDrag)
        document.removeEventListener('touchmove', onTouchMove)
        document.removeEventListener('touchend', endDrag)
        document.body.classList.remove('dragging')

        const src = dragState.sourceIndex
        const tgt = dragState.targetIndex

        if (src !== null && tgt !== null && src !== tgt && tgt >= 0 && tgt <= allItems.length) {
            showToast('Guardando orden...', 'info')
            const [movedItem] = allItems.splice(src, 1)
            allItems.splice(tgt, 0, movedItem)
            await saveItemOrder(allItems, subcategoryId)
            refreshCallback([...allItems])
        }
        dragState.sourceIndex = null
        dragState.targetIndex = null
    }

    function onMouseMove(e) { e.preventDefault(); onMove(e.clientY) }
    function onTouchMove(e) { e.preventDefault(); onMove(e.touches[0].clientY) }

    function startDrag(index, clientY) {
        if (!store.currentUser) {
            showToast('Inicia sesión para reordenar', 'error')
            return
        }
        dragState.active = true
        dragState.sourceIndex = index
        dragState.targetIndex = index
        document.body.classList.add('dragging')
        document.addEventListener('mousemove', onMouseMove)
        document.addEventListener('mouseup', endDrag)
        document.addEventListener('touchmove', onTouchMove, { passive: false })
        document.addEventListener('touchend', endDrag)
    }

    function setupHandles() {
        const rows = getRows()
        rows.forEach((row, idx) => {
            const handle = row.querySelector('.drag-handle')
            if (!handle) return
            const newHandle = handle.cloneNode(true)
            handle.parentNode.replaceChild(newHandle, handle)
            newHandle.addEventListener('mousedown', (e) => {
                e.preventDefault();
                startDrag(idx, e.clientY)
            })
            newHandle.addEventListener('touchstart', (e) => {
                e.preventDefault();
                startDrag(idx, e.touches[0].clientY)
            }, { passive: false })
        })
    }

    setupHandles()
    const observer = new MutationObserver(setupHandles)
    observer.observe(tbody, { childList: true })
    return () => observer.disconnect()
}

export { saveItemOrder, initDragAndDrop }