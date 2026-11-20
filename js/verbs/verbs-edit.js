import { store } from '../config.js'
import { showToast } from '../cache.js'
import { playAudioEnhanced } from '../audio.js'
import { openInlineEditor } from '../editing.js'
import { cacheRow, readCachedRow, removeCachedRow, TABLES } from '../offline/cache.js'
import { queueChange, isOnline } from '../offline/sync.js'
import {
    verbsData,
    currentVerbCategory,
    isVerbEditing,
    setIsVerbEditing
} from './verbs-state.js'
import { requireSession } from '../auth-required.js'

/* Edición igual que Adjetivos: se abre el modal compartido y la celda nunca se
 * convierte en editable. Así no queda texto seleccionado, ni el borde naranja,
 * ni se desordena la tabla al tocar y soltar o al cancelar. */
const FIELD_MAP = {
    verb: 'verb', pronunciation: 'pronunciation', translation: 'translation',
    exampleBase: 'example_base', example_base: 'example_base', usage: 'usage',
    pastSimple: 'past_simple', past_simple: 'past_simple',
    pronunciationPs: 'pronunciation_ps', pronunciation_ps: 'pronunciation_ps',
    translationPs: 'translation_ps', translation_ps: 'translation_ps',
    examplePs: 'example_ps', example_ps: 'example_ps',
    pastParticiple: 'past_participle', past_participle: 'past_participle',
    pronunciationPp: 'pronunciation_pp', pronunciation_ps_pp: 'pronunciation_ps_pp',
    translationPp: 'translation_pp', translation_pp: 'translation_pp',
    examplePp: 'example_pp', example_pp: 'example_pp',
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

const FIELD_NAMES = {
    verb: 'verbo', pronunciation: 'pronunciación', translation: 'traducción',
    type: 'tipo', example_base: 'ejemplo', usage: 'uso', notes: 'notas',
    past_simple: 'past simple', pronunciation_ps: 'pronunciación del pasado',
    translation_ps: 'traducción del pasado', example_ps: 'ejemplo del pasado',
    past_participle: 'participio pasado', pronunciation_pp: 'pronunciación del participio',
    translation_pp: 'traducción del participio', example_pp: 'ejemplo del participio',
    adjective: 'adjetivo', pronunciation_adj: 'pronunciación del adjetivo',
    translation_adj: 'traducción del adjetivo', example_adj: 'ejemplo del adjetivo',
    example_adj_translation: 'traducción del ejemplo del adjetivo',
    adverb: 'adverbio', pronunciation_adv: 'pronunciación del adverbio',
    translation_adv: 'traducción del adverbio', example_adv: 'ejemplo del adverbio',
    example_adv_translation: 'traducción del ejemplo del adverbio',
    noun: 'sustantivo', pronunciation_noun: 'pronunciación del sustantivo',
    translation_noun: 'traducción del sustantivo', example_noun: 'ejemplo del sustantivo',
    example_noun_translation: 'traducción del ejemplo del sustantivo',
    translation_example_noun: 'traducción del ejemplo del sustantivo'
}

const MULTILINE_FIELDS = new Set([
    'example_base', 'usage', 'notes', 'example_ps', 'example_pp',
    'example_adj', 'example_adj_translation',
    'example_adv', 'example_adv_translation',
    'example_noun', 'example_noun_translation', 'translation_example_noun'
])

function markTruncated(cell) {
    const content = cell.querySelector('.verb-cell-content')
    if (!content) return
    const text = content.textContent.trim()
    cell.classList.toggle(
        'is-truncated',
        content.scrollHeight > content.clientHeight + 2 || text.length > 110
    )
}

/* Solo se sustituye la celda editada, sin recargar ni redibujar la tabla
 * completa. Se actualizan todas las vistas (categoría y búsqueda) que muestren
 * el mismo verbo/campo. */
async function refreshVerbCells(verbId, field, value) {
    try {
        const { buildVerbCell } = await import('./verbs-render.js')
        const base = verbsData.find(item => String(item.id) === String(verbId))
            || (await readCachedRow(TABLES.verbs, verbId))
            || { id: verbId }
        const source = { ...base, [field]: value, [FIELD_MAP[field] || field]: value }
        const holder = document.createElement('tbody')
        holder.innerHTML = buildVerbCell(source, { key: field })
        const fresh = holder.firstElementChild
        if (!fresh) return
        document.querySelectorAll('.editable-cell[data-field]').forEach(cell => {
            if (cell.getAttribute('data-verb-id') !== String(verbId)) return
            if (cell.getAttribute('data-field') !== field) return
            const replacement = fresh.cloneNode(true)
            markTruncated(replacement)
            cell.replaceWith(replacement)
        })
    } catch (error) {
        console.warn('[verbs] No se pudo refrescar la celda:', error)
    }
}

window.editVerbCell = async function (cell, field, verbId) {
    if (!requireSession('editar este verbo')) return
    if (isVerbEditing || !cell || !field || !verbId) return

    const dbField = FIELD_MAP[field] || field
    const currentValue = cell.getAttribute('data-audio-text') || ''
    const fieldName = FIELD_NAMES[dbField] || FIELD_NAMES[field] || field
    const multiline = MULTILINE_FIELDS.has(dbField)

    setIsVerbEditing(true)
    let newValue
    try {
        newValue = await openInlineEditor(fieldName, currentValue, field, { multiline })
    } catch (error) {
        console.error('No se pudo abrir el editor de verbo:', error)
        showToast(`No se pudo abrir el editor: ${error.message}`, 'error')
        return
    } finally {
        setIsVerbEditing(false)
    }

    // Cancelar o pulsar Escape no toca la celda: no hay selección que limpiar.
    if (newValue === null || newValue === currentValue) return

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

        if (verb) {
            verb[field] = newValue
            verb[dbField] = newValue
        }

        showToast(
            isOnline()
                ? '✅ Guardado'
                : 'Guardado en el dispositivo; se sincronizará al volver la conexión.',
            'success'
        )
        await refreshVerbCells(verbId, field, newValue)
        await window.refreshPracticeCategories?.()
    } catch (error) {
        console.error('No se pudo guardar el verbo:', error)
        showToast('Error al guardar: ' + error.message, 'error')
    }
}

window.playVerbAudio = function (cell) {
    const text = cell.getAttribute('data-audio-text')
    const lang = cell.getAttribute('data-audio-lang') || 'en-US'
    if (text && text !== '—' && text !== '') {
        playAudioWithLang(text, lang)
    }
}

window.deleteVerbRow = async function (verbId) {
    if (!requireSession('eliminar este verbo')) return

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
        window.dispatchEvent(new CustomEvent("word-catalog-changed"))

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
