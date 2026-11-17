import { store } from '../config.js'
import { showToast } from '../cache.js'
import { playAudioEnhanced } from '../audio.js'
import { cacheRow, readCachedRow, removeCachedRow, TABLES } from '../offline/cache.js'
import { queueChange, isOnline } from '../offline/sync.js'
import {
    verbsData,
    currentVerbCategory,
    isVerbEditing,
    setIsVerbEditing
} from './verbs-state.js'

window.editVerbCell = function (cell, field, verbId) {
    if (!store.currentUser) {
        showToast('🔐 Inicia sesión para editar', 'error')
        return
    }

    if (isVerbEditing) return
    setIsVerbEditing(true)

    const currentValue = cell.getAttribute('data-audio-text') || ''
    let activeCell = cell
    let content = activeCell.querySelector('.verb-cell-content')

    const fieldMap = {
        verb: 'verb', pronunciation: 'pronunciation', translation: 'translation',
        exampleBase: 'example_base', example_base: 'example_base', usage: 'usage',
        pastSimple: 'past_simple', past_simple: 'past_simple',
        pronunciationPs: 'pronunciation_ps', pronunciation_ps: 'pronunciation_ps',
        translationPs: 'translation_ps', translation_ps: 'translation_ps',
        examplePs: 'example_ps', example_ps: 'example_ps',
        pastParticiple: 'past_participle', past_participle: 'past_participle',
        pronunciationPp: 'pronunciation_pp', pronunciation_ps_pp: 'pronunciation_ps_pp',
        pronunciation_pp: 'pronunciation_pp', translationPp: 'translation_pp',
        translation_pp: 'translation_pp', examplePp: 'example_pp', example_pp: 'example_pp',
        adjective: 'adjective', pronunciationAdj: 'pronunciation_adj',
        pronunciation_adj: 'pronunciation_adj', translationAdj: 'translation_adj',
        translation_adj: 'translation_adj', exampleAdj: 'example_adj',
        example_adj: 'example_adj', example_adj_translation: 'example_adj_translation',
        adverb: 'adverb', pronunciationAdv: 'pronunciation_adv',
        pronunciation_adv: 'pronunciation_adv', translationAdv: 'translation_adv',
        translation_adv: 'translation_adv', exampleAdv: 'example_adv',
        example_adv: 'example_adv', example_adv_translation: 'example_adv_translation',
        noun: 'noun', pronunciationNoun: 'pronunciation_noun',
        pronunciation_noun: 'pronunciation_noun', translationNoun: 'translation_noun',
        translation_noun: 'translation_noun', exampleNoun: 'example_noun',
        example_noun: 'example_noun', example_noun_translation: 'example_noun_translation',
        translationExampleNoun: 'translation_example_noun',
        translation_example_noun: 'translation_example_noun', notes: 'notes'
    }
    const dbField = fieldMap[field] || field

    // Se edita solo el texto plano: los botones de audio y de grupo se dejan
    // fuera del área editable y se reconstruyen al terminar, para que nunca
    // se guarden dentro de la palabra ni desaparezcan.
    if (content) {
        content.textContent = currentValue || '—'
        content.contentEditable = 'true'
        content.focus()
    } else {
        activeCell.contentEditable = true
        activeCell.focus()
    }
    activeCell.classList.add('editing')

    const range = document.createRange()
    range.selectNodeContents(content || activeCell)
    const selection = window.getSelection()
    selection.removeAllRanges()
    selection.addRange(range)

    const rebuildCell = async value => {
        try {
            const { buildVerbCell, decorateVerbCells } = await import('./verbs-render.js')
            const base = verbsData.find(item => String(item.id) === String(verbId))
                || (await readCachedRow(TABLES.verbs, verbId))
                || { id: verbId }
            const source = { ...base, [field]: value, [dbField]: value }
            const holder = document.createElement('tbody')
            holder.innerHTML = buildVerbCell(source, { key: field })
            const fresh = holder.firstElementChild
            if (!fresh) return
            activeCell.replaceWith(fresh)
            activeCell = fresh
            content = fresh.querySelector('.verb-cell-content')
            decorateVerbCells(fresh)
        } catch (error) {
            console.warn('[verbs] No se pudo reconstruir la celda:', error)
        }
    }

    const saveEdit = async () => {
        if (!isVerbEditing) return
        if (content) content.contentEditable = 'false'
        activeCell.contentEditable = false
        activeCell.classList.remove('editing')
        setIsVerbEditing(false)

        const rawValue = (content?.innerText ?? activeCell.innerText).trim()
        const newValue = rawValue === '—' ? '' : rawValue
        if (newValue === currentValue) {
            await rebuildCell(currentValue)
            showToast('⚠️ Sin cambios para guardar', 'info')
            return
        }

        // Al salir de la celda no se guarda por sorpresa: primero se confirma.
        if (!window.confirm('¿Guardar los cambios en este campo?')) {
            await rebuildCell(currentValue)
            return
        }

        const update = { [dbField]: newValue || null }
        const verb = verbsData.find(v => String(v.id) === String(verbId))

        try {
            const cached = await readCachedRow(TABLES.verbs, verbId)
            const merged = {
                ...(cached || {}),
                ...(verb || {}),
                ...update,
                id: verb?.id ?? cached?.id ?? verbId
            }
            await cacheRow(TABLES.verbs, verbId, merged)
            await queueChange({
                table: TABLES.verbs,
                action: 'update',
                payload: update,
                match: { id: verbId },
                localId: verbId,
                description: 'Editar verbo'
            })

            showToast(
                isOnline()
                    ? '✅ Guardado'
                    : 'Guardado en el dispositivo; se sincronizará al volver la conexión.',
                'success'
            )
            if (verb) {
                verb[field] = newValue
                verb[dbField] = newValue
            }
            // Se vuelve a dibujar la celda: así el botón de audio vuelve a
            // estar fuera del texto guardado.
            await rebuildCell(newValue)
        } catch (error) {
            showToast('Error al guardar: ' + error.message, 'error')
            await rebuildCell(currentValue)
        }
    }

    const cancelEdit = () => {
        if (!isVerbEditing) return
        if (content) content.contentEditable = 'false'
        activeCell.contentEditable = false
        activeCell.classList.remove('editing')
        setIsVerbEditing(false)
        rebuildCell(currentValue)
    }

    ;(content || activeCell).addEventListener('blur', saveEdit, { once: true })
    activeCell.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            saveEdit()
        } else if (e.key === 'Escape') {
            cancelEdit()
        }
    })
}

window.playVerbAudio = function (cell) {
    const text = cell.getAttribute('data-audio-text')
    const lang = cell.getAttribute('data-audio-lang') || 'en-US'
    if (text && text !== '—' && text !== '') {
        playAudioWithLang(text, lang)
    }
}

window.deleteVerbRow = async function (verbId) {
    if (!store.currentUser) {
        showToast('Inicia sesión para eliminar verbos.', 'warning')
        return
    }

    const verb = verbsData.find(item => String(item.id) === String(verbId))
    const name = verb?.verb || 'este verbo'
    if (!window.confirm(`¿Eliminar "${name}" de la guía compartida? Se quitará para todos los usuarios y no se puede deshacer.`)) {
        return
    }

    try {
        await removeCachedRow(TABLES.verbs, verbId)
        await queueChange({
            table: TABLES.verbs,
            action: 'delete',
            match: { id: verbId },
            localId: verbId,
            description: 'Eliminar verbo'
        })

        showToast(
            isOnline()
                ? `Se eliminó "${name}" de la guía.`
                : `"${name}" se eliminará de la guía al volver la conexión.`,
            'success'
        )
        const { loadVerbsFromSupabase } = await import('./verbs-loader.js')
        await loadVerbsFromSupabase(true)

        const searchInput = document.getElementById('verbs-search-input')
        if (searchInput?.value.trim()) {
            window.searchVerbs?.()
        } else if (currentVerbCategory) {
            const { openVerbCategory } = await import('./verbs-render.js')
            openVerbCategory(currentVerbCategory)
        } else {
            window.showAllVerbs?.()
        }
        await window.refreshPracticeCategories?.()
    } catch (error) {
        console.error('No se pudo eliminar el verbo:', error)
        showToast(`No se pudo eliminar el verbo: ${error.message}`, 'error')
    }
}

export function playAudioWithLang(text, lang = 'en-US') {
    if (!text || text === '—') return
    return playAudioEnhanced(text, lang.startsWith('es') ? 'es' : 'en')
}