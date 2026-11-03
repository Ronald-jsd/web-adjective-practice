import { supabase } from '../app.js'
import { showToast } from '../cache.js'
import { showLoading, hideLoading } from '../ui-status.js'
import { cacheRowsPreservingPending, readCachedRows, TABLES } from '../offline/cache.js'
import { isOnline } from '../offline/sync.js'
import {
    setVerbsData, setVerbCategories,
    verbsData, verbCategories
} from './verbs-state.js'

function mapVerb(v) {
    return {
        ...v,
        exampleBase: v.example_base,
        pronunciationPs: v.pronunciation_ps,
        translationPs: v.translation_ps,
        examplePs: v.example_ps,
        pastParticiple: v.past_participle,
        pronunciationPp: v.pronunciation_pp,
        translationPp: v.translation_pp,
        examplePp: v.example_pp,
        pronunciationAdj: v.pronunciation_adj,
        translationAdj: v.translation_adj,
        exampleAdj: v.example_adj,
        pronunciationAdv: v.pronunciation_adv,
        translationAdv: v.translation_adv,
        exampleAdv: v.example_adv,
        pronunciationNoun: v.pronunciation_noun,
        translationNoun: v.translation_noun,
        exampleNoun: v.example_noun,
        translationExampleNoun: v.translation_example_noun
    }
}

async function fetchVerbsFromNetwork() {
    const allVerbs = []
    const pageSize = 1000

    for (let page = 0; ; page++) {
        const from = page * pageSize
        const to = from + pageSize - 1

        const { data: verbs, error } = await supabase
            .from('verbs')
            .select('*')
            .order('verb')
            .range(from, to)

        if (error) throw error
        if (!verbs || verbs.length === 0) break

        allVerbs.push(...verbs)
        if (verbs.length < pageSize) break
    }

    return allVerbs
}

function applyVerbs(allVerbs) {
    const mapped = allVerbs.map(mapVerb)
    setVerbsData(mapped)

    const categoriesSet = new Set()
    mapped.forEach(v => {
        if (v.category && v.category !== 'Sin Categoría') categoriesSet.add(v.category)
    })
    setVerbCategories(Array.from(categoriesSet).sort())

    return mapped
}

export async function loadVerbsFromSupabase(forceRefresh = false) {
    showLoading('verbs-loading-indicator', 'Cargando verbos…')
    try {
        let allVerbs = null
        let fromCache = false

        if (isOnline()) {
            try {
                console.log('Cargando todos los verbos desde Supabase...')
                const networkVerbs = await fetchVerbsFromNetwork()
                if (networkVerbs.length) {
                    allVerbs = await cacheRowsPreservingPending(TABLES.verbs, networkVerbs)
                }
            } catch (error) {
                console.warn('No se pudieron cargar los verbos desde la nube:', error)
            }
        }

        if (!allVerbs || !allVerbs.length) {
            allVerbs = await readCachedRows(TABLES.verbs)
            fromCache = allVerbs.length > 0
            if (!fromCache) {
                showToast('No hay verbos guardados en este dispositivo y no se pudo conectar.', 'warning')
                return []
            }
            showToast('Mostrando los verbos guardados en el dispositivo.', 'info')
        }

        const mapped = applyVerbs(allVerbs)
        console.log(`Verbos cargados: ${mapped.length}${fromCache ? ' (dispositivo)' : ''}, Categorías: ${verbCategories.length}`)

        const { renderVerbCategories } = await import('./verbs-render.js')
        renderVerbCategories()

        return mapped
    } catch (error) {
        console.error('Error cargando verbos:', error)
        showToast('Error cargando verbos: ' + error.message, 'error')
        return []
    } finally {
        hideLoading('verbs-loading-indicator')
    }
}
