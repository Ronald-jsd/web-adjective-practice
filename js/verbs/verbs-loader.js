import { supabase } from '../app.js'
import { store } from '../config.js'
import { showToast } from '../cache.js'
import {
    setVerbsData, setVerbCategories,
    verbsData, verbCategories
} from './verbs-state.js'

export async function loadVerbsFromSupabase(forceRefresh = false) {
    try {
        console.log('📚 Cargando todos los verbos desde Supabase...')

        let allVerbs = []
        let page = 0
        const pageSize = 1000
        let hasMore = true

        while (hasMore) {
            const from = page * pageSize
            const to = from + pageSize - 1

            console.log(`📄 Cargando página ${page + 1} (registros ${from} - ${to})...`)

            const { data: verbs, error } = await supabase
                .from('verbs')
                .select('*')
                .order('verb')
                .range(from, to)

            if (error) {
                console.error('❌ Error cargando verbos:', error)
                showToast('Error cargando verbos', 'error')
                return []
            }

            if (!verbs || verbs.length === 0) {
                hasMore = false
                break
            }

            allVerbs = [...allVerbs, ...verbs]
            console.log(`📄 Página ${page + 1}: ${verbs.length} verbos (Total: ${allVerbs.length})`)

            if (verbs.length < pageSize) hasMore = false
            page++
        }

        console.log(`📊 TOTAL CARGADO: ${allVerbs.length} verbos`)

        if (allVerbs.length === 0) {
            console.warn('⚠️ No hay verbos en Supabase')
            return []
        }

        const mapped = allVerbs.map(v => ({
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
            translationExampleNoun: v.translation_example_noun,
            percentage: 0
        }))

        setVerbsData(mapped)

        const categoriesSet = new Set()
        mapped.forEach(v => {
            if (v.category && v.category !== 'Sin Categoría') categoriesSet.add(v.category)
        })
        setVerbCategories(Array.from(categoriesSet).sort())

        if (store.currentUser) await loadUserVerbProgress()

        console.log(`✅ Verbos cargados: ${mapped.length}, Categorías: ${verbCategories.length}`)

        const { renderVerbCategories } = await import('./verbs-render.js')
        renderVerbCategories()

        return mapped

    } catch (error) {
        console.error('❌ Error cargando verbos:', error)
        showToast('Error cargando verbos: ' + error.message, 'error')
        return []
    }
}

export async function loadUserVerbProgress() {
    if (!store.currentUser) return

    const { data, error } = await supabase
        .from('user_verb_progress')
        .select('verb_id, percentage, level, last_practice')
        .eq('user_id', store.currentUser.id)

    if (error) {
        console.error('❌ Error cargando progreso:', error)
        return
    }

    if (data) {
        const progressMap = {}
        data.forEach(p => { progressMap[p.verb_id] = p.percentage || 0 })
        verbsData.forEach(v => { v.percentage = progressMap[v.id] || 0 })
    }
}

export async function saveVerbProgress(verbId, percentage) {
    if (!store.currentUser) return

    const { error } = await supabase
        .from('user_verb_progress')
        .upsert({
            user_id: store.currentUser.id,
            verb_id: verbId,
            percentage: Math.min(100, Math.max(0, percentage)),
            last_practice: new Date().toISOString(),
            level: Math.floor(percentage / 20) + 1
        }, { onConflict: 'user_id, verb_id' })

    if (error) console.error('❌ Error guardando progreso:', error)
}