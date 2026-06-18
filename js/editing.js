import { supabase } from './app.js'
import { store } from './config.js'
import { showToast } from './cache.js'
import { loadUserCustomItems } from './auth.js'
import { loadCategoriesFromSupabase } from './data.js'

// Obtener badge de estado
function getStatusBadge(status) {
    switch (status) {
        case 1: return '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-200 text-yellow-800">📚 Por aprender</span>'
        case 2: return '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-200 text-green-800">✅ Aprendido</span>'
        case 3: return '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-200 text-blue-800">⚠️ Poco importante</span>'
        default: return ''
    }
}

async function editCell(field, currentValue, item) {
    if (store.isEditing) return
    store.isEditing = true

    const fieldNames = {
        word: 'palabra', pronunciation: 'pronunciación', spanish: 'traducción',
        example_en: 'ejemplo en inglés', example_es: 'ejemplo en español'
    }
    const fieldName = fieldNames[field] || field
    const newValue = prompt(`Editar ${fieldName}:`, currentValue)

    if (newValue === null || newValue === currentValue) {
        store.isEditing = false
        return
    }
    if (!store.currentUser) {
        alert('🔐 Inicia sesión para editar')
        store.isEditing = false
        return
    }

    if (item && item.isCustom) {
        const updateData = {}; updateData[field] = newValue
        const { error } = await supabase.from('user_custom_items').update(updateData).eq('id', item.id).eq('user_id', store.currentUser.id)
        if (error) alert('❌ Error: ' + error.message)
        else {
            showToast('Editado correctamente', 'success')
            await loadUserCustomItems()
            if (store.currentCategoryData) {
                const newData = await loadCategoriesFromSupabase(true)
                store.categoriesData = newData
                const updatedCategory = newData.find(c => c.id === store.currentCategoryData.id)
                if (updatedCategory) {
                    store.currentCategoryData = updatedCategory
                    const { openCategoryView } = await import('./category-view.js')
                    openCategoryView(updatedCategory)
                }
            }
        }
    } else {
        const updateData = {}; updateData[field] = newValue
        const { error } = await supabase.from('items').update(updateData).eq('id', item.id)
        if (error) alert('❌ Error al editar: ' + error.message)
        else {
            showToast('Palabra editada correctamente', 'success')
            const newData = await loadCategoriesFromSupabase(true)
            store.categoriesData = newData
            if (store.currentCategoryData) {
                const updatedCategory = newData.find(c => c.id === store.currentCategoryData.id)
                if (updatedCategory) {
                    store.currentCategoryData = updatedCategory
                    const { openCategoryView } = await import('./category-view.js')
                    openCategoryView(updatedCategory)
                }
            }
        }
    }
    store.isEditing = false
}

async function updateWordStatus(itemId, status) {
    if (!store.currentUser) {
        alert('🔐 Inicia sesión para guardar tu progreso')
        return false
    }

    const currentStatus = store.wordStatusMap.get(itemId.toString()) || 0
    let newStatus = currentStatus === status ? 0 : status

    const { error } = await supabase
        .from('user_word_status')
        .upsert({
            user_id: store.currentUser.id,
            item_id: parseInt(itemId),
            status: newStatus,
            updated_at: new Date()
        }, { onConflict: 'user_id, item_id' })

    if (error) {
        alert('❌ Error: ' + error.message)
        return false
    }

    if (newStatus === 0) store.wordStatusMap.delete(itemId.toString())
    else store.wordStatusMap.set(itemId.toString(), newStatus)

    const targetRow = document.querySelector(`tr[data-item-id="${itemId}"]`)
    if (targetRow) {
        const badgeContainer = targetRow.querySelector('.flex.items-center.gap-2.flex-wrap')
        if (badgeContainer) {
            const oldBadge = badgeContainer.querySelector('.inline-flex.items-center.px-2.py-0\\.5')
            if (oldBadge) oldBadge.remove()
            if (newStatus !== 0) {
                const statusBadge = getStatusBadge(newStatus)
                const wordSpan = badgeContainer.querySelector('.audio-clickable')
                if (wordSpan) wordSpan.insertAdjacentHTML('afterend', statusBadge)
            }
        }

        const btnContainer = targetRow.querySelector('.flex.gap-1')
        if (btnContainer) {
            const btns = btnContainer.querySelectorAll('button')
            btns.forEach((btn, idx) => {
                const btnStatus = idx === 0 ? 1 : idx === 1 ? 2 : 3
                if (newStatus === btnStatus) {
                    if (btnStatus === 1) btn.className = 'px-2 py-1 text-xs rounded bg-yellow-500 text-white'
                    else if (btnStatus === 2) btn.className = 'px-2 py-1 text-xs rounded bg-green-500 text-white'
                    else btn.className = 'px-2 py-1 text-xs rounded bg-blue-500 text-white'
                } else {
                    btn.className = 'px-2 py-1 text-xs rounded bg-gray-200 hover:bg-yellow-200'
                }
            })
        }
    }

    if (newStatus === 0) showToast(`Estado eliminado`, 'info')
    else {
        const statusText = newStatus === 1 ? '📚 Por aprender' : newStatus === 2 ? '✅ Aprendido' : '⚠️ Poco importante'
        showToast(`Estado cambiado a: ${statusText}`, 'success')
    }
    return true
}

export { editCell, getStatusBadge, updateWordStatus }

window.editCell = editCell
window.updateWordStatus = updateWordStatus