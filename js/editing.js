import { store } from './config.js'
import { showToast } from './cache.js'
import { loadUserCustomItems } from './auth.js'
import { loadCategoriesFromSupabase, updateCachedCategories } from './data.js'
import { cacheRow, removeCachedRow, readCachedRow, TABLES } from './offline/cache.js'
import { queueChange, isOnline } from './offline/sync.js'

const ITEM_FIELD_INDEX = {
    word: 0,
    pronunciation: 1,
    spanish: 2,
    example_en: 3,
    example_es: 4
}

function getStatusBadge(status) {
    switch (status) {
        case 1: return '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-200 text-yellow-800">📚 Por aprender</span>'
        case 2: return '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-200 text-green-800">✅ Aprendido</span>'
        case 3: return '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-200 text-blue-800">⚠️ Poco importante</span>'
        default: return ''
    }
}

function updateItemInSnapshot(snapshot, idKey, field, value) {
    const index = ITEM_FIELD_INDEX[field]
    if (index === undefined) return

    for (const category of snapshot) {
        for (const subcategory of category.subcategories || []) {
            for (const row of subcategory.items || []) {
                if (String(row[5]) === String(idKey)) {
                    row[index] = value
                }
            }
        }
    }
}

function removeItemFromSnapshot(snapshot, idKey) {
    for (const category of snapshot) {
        for (const subcategory of category.subcategories || []) {
            subcategory.items = (subcategory.items || []).filter(row => String(row[5]) !== String(idKey))
        }
    }
}

async function refreshCategoryViewFromLocalCopy() {
    const newData = await loadCategoriesFromSupabase(true, { preferSnapshot: true })
    store.categoriesData = newData

    // Si el usuario está viendo los resultados de una búsqueda, se refrescan
    // con los datos locales recién actualizados (sin cambiar de vista).
    const searchDiv = document.getElementById('search-results')
    if (searchDiv && !searchDiv.classList.contains('hidden')) {
        window.refreshSearchResults?.()
        return newData
    }

    const categoryView = document.getElementById('category-view')
    const categoryViewVisible = categoryView && !categoryView.classList.contains('hidden')
    if (!store.currentCategoryData || !categoryViewVisible) return newData

    const updatedCategory = newData.find(category => String(category.id) === String(store.currentCategoryData.id))
    if (updatedCategory) {
        store.currentCategoryData = updatedCategory
        const { openCategoryView } = await import('./category-view.js')
        openCategoryView(updatedCategory)
    }
    return newData
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

    try {
        const updateData = {}
        updateData[field] = newValue

        if (item && item.isCustom) {
            const userId = store.currentUser.id
            const cached = await readCachedRow(TABLES.customItems, item.id)
            await cacheRow(TABLES.customItems, item.id, {
                ...(cached || {}),
                ...updateData,
                id: item.id,
                user_id: userId
            })
            await queueChange({
                table: TABLES.customItems,
                action: 'update',
                payload: updateData,
                match: { id: item.id, user_id: userId },
                description: 'Editar vocabulario'
            })
        } else {
            await queueChange({
                table: 'items',
                action: 'update',
                payload: updateData,
                match: { id: item.id },
                description: 'Editar palabra'
            })
        }

        await updateCachedCategories(snapshot =>
            updateItemInSnapshot(snapshot, item.isCustom ? `custom_${item.id}` : item.id, field, newValue)
        )

        showToast(
            isOnline()
                ? (item.isCustom ? 'Editado correctamente' : 'Palabra editada correctamente')
                : 'Guardado en el dispositivo; se sincronizará al volver la conexión.',
            'success'
        )

        if (item.isCustom) {
            await loadUserCustomItems({ preferCache: true })
        }
        await refreshCategoryViewFromLocalCopy()
    } catch (error) {
        console.error('No se pudo editar el término:', error)
        showToast(`No se pudo editar: ${error.message}`, 'error')
    } finally {
        store.isEditing = false
    }
}

async function updateWordStatus(itemId, status) {
    if (!store.currentUser) {
        alert('🔐 Inicia sesión para guardar tu progreso');
        return false;
    }

    if (!itemId || itemId === null || itemId === undefined || itemId === '') {
        console.error('❌ Error: itemId inválido:', itemId);
        showToast('Error: No se puede guardar estado sin ID', 'error');
        return false;
    }

    const itemIdStr = itemId.toString();

    if (itemIdStr.startsWith('temp_')) {
        console.warn('⚠️ No se guarda estado para ID temporal:', itemId);
        showToast('Este elemento no se puede guardar en la base de datos', 'warning');
        return false;
    }

    if (itemIdStr.startsWith('custom_')) {
        const customId = parseInt(itemIdStr.replace('custom_', ''));
        if (isNaN(customId)) {
            console.error('❌ Error: customId inválido:', itemId);
            showToast('Error: ID personalizado inválido', 'error');
            return false;
        }
        return await saveStatus(customId, status, itemIdStr);
    }

    const itemIdNumber = parseInt(itemId);
    if (isNaN(itemIdNumber) || itemIdNumber <= 0) {
        console.error('❌ Error: itemId no es un número válido:', itemId);
        showToast('Error: ID de elemento inválido', 'error');
        return false;
    }

    return await saveStatus(itemIdNumber, status, itemIdStr);
}

async function saveStatus(itemIdNumber, status, originalItemId) {
    const currentStatus = store.wordStatusMap.get(originalItemId) || 0;
    let newStatus = currentStatus === status ? 0 : status;

    if (newStatus !== 0 && ![1, 2, 3].includes(newStatus)) {
        console.error('❌ Error: status inválido:', newStatus);
        return false;
    }

    const userId = store.currentUser.id;
    const now = new Date().toISOString();
    const payload = {
        user_id: userId,
        item_id: itemIdNumber,
        status: newStatus,
        updated_at: now
    };
    const cacheId = `${userId}|${itemIdNumber}`;

    await cacheRow(TABLES.wordStatus, cacheId, { ...payload, cache_id: cacheId });
    const queued = await queueChange({
        table: TABLES.wordStatus,
        action: 'upsert',
        payload,
        conflict: 'user_id,item_id',
        localId: cacheId,
        description: 'Estado de palabra'
    });

    if (!queued) {
        showToast('No se pudo guardar el estado en este dispositivo.', 'error');
        return false;
    }

    if (newStatus === 0) {
        store.wordStatusMap.delete(originalItemId);
    } else {
        store.wordStatusMap.set(originalItemId, newStatus);
    }

    const targetRow = document.querySelector(`tr[data-item-id="${originalItemId}"]`);
    if (targetRow) {
        const badgeContainer = targetRow.querySelector('.flex.items-center.gap-2.flex-wrap');
        if (badgeContainer) {
            const oldBadge = badgeContainer.querySelector('.inline-flex.items-center.px-2.py-0\\.5');
            if (oldBadge) oldBadge.remove();
            if (newStatus !== 0) {
                const statusBadge = getStatusBadge(newStatus);
                const wordSpan = badgeContainer.querySelector('.audio-clickable');
                if (wordSpan) wordSpan.insertAdjacentHTML('afterend', statusBadge);
            }
        }

        const btnContainer = targetRow.querySelector('.flex.gap-1');
        if (btnContainer) {
            const btns = btnContainer.querySelectorAll('button');
            btns.forEach((btn, idx) => {
                const btnStatus = idx === 0 ? 1 : idx === 1 ? 2 : 3;
                if (newStatus === btnStatus) {
                    if (btnStatus === 1) btn.className = 'px-2 py-1 text-xs rounded bg-yellow-500 text-white';
                    else if (btnStatus === 2) btn.className = 'px-2 py-1 text-xs rounded bg-green-500 text-white';
                    else btn.className = 'px-2 py-1 text-xs rounded bg-blue-500 text-white';
                } else {
                    btn.className = 'px-2 py-1 text-xs rounded bg-gray-200 hover:bg-yellow-200';
                }
            });
        }
    }

    const statusText = newStatus === 0 ? 'eliminado' :
                      newStatus === 1 ? '📚 Por aprender' :
                      newStatus === 2 ? '✅ Aprendido' : '⚠️ Poco importante';
    showToast(`Estado ${statusText}`, newStatus === 0 ? 'info' : 'success');
    return true;
}

async function deleteAdjectiveRow(item) {
    if (store.isEditing) return
    if (!store.currentUser) {
        alert('🔐 Inicia sesión para eliminar')
        return
    }
    if (!item || item.id === null || item.id === undefined || item.id === '') {
        showToast('Este término no tiene un ID válido para eliminar.', 'error')
        return
    }

    const word = String(item.word || '').trim() || 'este término'
    const isCustom = !!item.isCustom
    const message = isCustom
        ? `¿Eliminar "${word}" de tu vocabulario personal? Esta acción no se puede deshacer.`
        : `¿Eliminar "${word}" de la guía compartida? Se quitará para todos los usuarios y no se puede deshacer.`
    if (!window.confirm(message)) return

    try {
        const table = isCustom ? TABLES.customItems : 'items'
        const match = isCustom
            ? { id: item.id, user_id: store.currentUser.id }
            : { id: item.id }

        await queueChange({
            table,
            action: 'delete',
            match,
            description: isCustom ? 'Eliminar vocabulario' : 'Eliminar palabra'
        })

        if (isCustom) {
            await removeCachedRow(TABLES.customItems, item.id)
        }

        const idKey = isCustom ? `custom_${item.id}` : String(item.id)
        await updateCachedCategories(snapshot => removeItemFromSnapshot(snapshot, idKey))

        showToast(`Se eliminó "${word}".`, 'success')

        if (isCustom) {
            await loadUserCustomItems({ preferCache: true })
        }
        await refreshCategoryViewFromLocalCopy()
        window.refreshSearchResults?.()

        try {
            await window.refreshPracticeCategories?.()
        } catch (refreshError) {
            console.warn('El término se eliminó, pero no se pudo refrescar la práctica:', refreshError)
        }
    } catch (error) {
        console.error('No se pudo eliminar el término:', error)
        showToast(`No se pudo eliminar: ${error.message}`, 'error')
    }
}

export { editCell, deleteAdjectiveRow, getStatusBadge, updateWordStatus }

window.editCell = editCell
window.deleteAdjectiveRow = deleteAdjectiveRow
window.updateWordStatus = updateWordStatus
