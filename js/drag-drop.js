import { supabase } from './app.js'
import { store } from './config.js'
import { showToast } from './cache.js'

async function saveItemOrder(items, subcategoryId) {
    if (!store.currentUser) return
    for (let idx = 0; idx < items.length; idx++) {
        const item = items[idx]
        const itemId = item[5]
        const isCustom = itemId && itemId.toString().startsWith('custom_')
        if (isCustom) {
            const customId = item[6]
            await supabase.from('user_custom_items').update({ sort_order: idx }).eq('id', customId).eq('user_id', store.currentUser.id)
        } else {
            await supabase.from('items').update({ sort_order: idx }).eq('id', parseInt(itemId))
        }
    }
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
            showToast('Orden guardado', 'success')
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