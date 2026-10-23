import { supabase } from './app.js'
import { store } from './config.js'
import { showToast } from './cache.js'
import { loadUserCustomItems } from './auth.js'
import { loadCategoriesFromSupabase, renderCategories } from './data.js'
import { generateWithAI, hasApiKey } from './ai.js'
import { initializePractice } from './practice.js'

function updateAvailability() {
    const status = document.getElementById('browser-ai-availability')
    const submit = document.getElementById('browser-ai-submit')
    const configure = document.getElementById('browser-ai-configure')
    if (!status || !submit) return

    const hasProvider = hasApiKey('gemini') || hasApiKey('groq')
    status.textContent = hasProvider
        ? '✅ Se usará el proveedor de IA que ya tienes configurado.'
        : '⚠️ Primero configura una API key de Gemini o Groq para usar la IA.'
    submit.disabled = !hasProvider
    if (configure) configure.classList.toggle('hidden', hasProvider)
}

function createHistoryEntry(query, expanded = false) {
    const details = document.createElement('details')
    details.className = 'bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden'
    details.open = expanded

    const summary = document.createElement('summary')
    summary.className = 'cursor-pointer px-5 py-4 font-semibold text-gray-900 hover:bg-purple-50'
    const date = new Date(query.created_at)
    summary.textContent = `${query.question} · ${date.toLocaleString()}`
    details.appendChild(summary)

    const content = document.createElement('div')
    content.className = 'px-5 pb-5'

    const deleteButton = document.createElement('button')
    deleteButton.type = 'button'
    deleteButton.className = 'mb-4 px-3 py-2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-sm font-medium'
    deleteButton.textContent = '🗑️ Eliminar consulta y sus tarjetas'
    deleteButton.addEventListener('click', () => deleteQuery(query, deleteButton))
    content.appendChild(deleteButton)

    const answer = document.createElement('p')
    answer.className = 'text-sm text-gray-700 mb-4 whitespace-pre-line'
    answer.textContent = query.summary
    content.appendChild(answer)

    query.cards.forEach((card, index) => {
        const section = document.createElement('section')
        section.className = 'bg-purple-50 border border-purple-100 rounded-lg p-4 mb-3'

        const title = document.createElement('h4')
        title.className = 'font-bold text-gray-900 mb-2'
        title.textContent = `${index + 1}. ${card.word}${card.pronunciation ? ` ${card.pronunciation}` : ''}`
        section.appendChild(title)

        const explanation = document.createElement('p')
        explanation.className = 'text-sm text-gray-700 mb-2'
        explanation.textContent = card.spanish
        section.appendChild(explanation)

        const english = document.createElement('p')
        english.className = 'text-sm font-semibold text-gray-900'
        english.textContent = card.example_en
        section.appendChild(english)

        const translation = document.createElement('p')
        translation.className = 'text-sm text-gray-600'
        translation.textContent = card.example_es
        section.appendChild(translation)
        content.appendChild(section)
    })

    details.appendChild(content)
    return details
}

function renderHistory(queries) {
    const history = document.getElementById('browser-ai-history')
    if (!history) return

    history.replaceChildren()
    if (!queries.length) {
        const empty = document.createElement('p')
        empty.className = 'text-sm text-gray-500'
        empty.textContent = 'Aún no tienes consultas guardadas.'
        history.appendChild(empty)
        return
    }

    queries.forEach((query, index) => {
        history.appendChild(createHistoryEntry(query, index === 0))
    })
}

async function deleteQuery(query, button) {
    if (!store.currentUser) {
        showToast('Inicia sesión para eliminar consultas.', 'warning')
        return
    }
    if (!window.confirm('¿Eliminar esta consulta y las tarjetas que generó? Esta acción no se puede deshacer.')) return

    button.disabled = true
    button.textContent = 'Eliminando...'
    try {
        const { error } = await supabase
            .from('user_ai_queries')
            .delete()
            .eq('id', query.id)
            .eq('user_id', store.currentUser.id)

        if (error) throw error

        showToast('Consulta y tarjetas eliminadas.', 'success')
        await loadUserCustomItems()
        const categories = await loadCategoriesFromSupabase(true)
        store.categoriesData = categories
        renderCategories(categories)
        await initializePractice(categories, {
            supabase,
            userId: store.currentUser.id
        })
        await loadQueryHistory()
    } catch (error) {
        console.error('No se pudo eliminar la consulta de IA:', error)
        button.disabled = false
        button.textContent = '🗑️ Eliminar consulta y sus tarjetas'
        showToast(`No se pudo eliminar la consulta: ${error.message}`, 'error')
    }
}

async function loadQueryHistory() {
    const history = document.getElementById('browser-ai-history')
    if (!history) return
    if (!store.currentUser) {
        history.replaceChildren()
        const loginMessage = document.createElement('p')
        loginMessage.className = 'text-sm text-gray-500'
        loginMessage.textContent = 'Inicia sesión para guardar y consultar tu historial.'
        history.appendChild(loginMessage)
        return
    }

    history.replaceChildren()
    const loading = document.createElement('p')
    loading.className = 'text-sm text-gray-500'
    loading.textContent = 'Cargando consultas guardadas...'
    history.appendChild(loading)

    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 20000)
    try {
        const { data, error } = await supabase
            .from('user_ai_queries')
            .select('id, question, summary, provider, cards, created_at')
            .eq('user_id', store.currentUser.id)
            .order('created_at', { ascending: false })
            .abortSignal(controller.signal)

        if (error) throw error
        renderHistory(data || [])
    } catch (error) {
        history.replaceChildren()
        const errorMessage = document.createElement('p')
        errorMessage.className = 'text-sm text-red-700'
        errorMessage.textContent = error.name === 'AbortError'
            ? 'La carga del historial tardó demasiado. Comprueba tu conexión y vuelve a intentarlo.'
            : `No se pudo cargar el historial: ${error.message}. Verifica que ejecutaste supabase/ai_queries.sql.`
        history.appendChild(errorMessage)

        const retry = document.createElement('button')
        retry.type = 'button'
        retry.className = 'mt-2 px-3 py-2 rounded-lg border border-purple-200 bg-white text-purple-800 text-sm font-medium'
        retry.textContent = 'Reintentar carga'
        retry.addEventListener('click', loadQueryHistory)
        history.appendChild(retry)
    } finally {
        window.clearTimeout(timeout)
    }
}

async function createAndSaveCard(question) {
    if (!store.currentUser) {
        showToast('Inicia sesión para crear y guardar tarjetas.', 'warning')
        window.abrirModalLogin?.()
        return
    }

    const guide = await generateWithAI(question, { guide: true })
    if (!guide) return
    if (typeof guide.summary !== 'string' || !guide.summary.trim() ||
        !Array.isArray(guide.cards) || guide.cards.length < 1 || guide.cards.length > 6) {
        throw new Error('La respuesta de la IA no contiene una guía válida con entre 1 y 6 tarjetas.')
    }

    const fields = ['word', 'pronunciation', 'spanish', 'example_en', 'example_es']
    const cards = guide.cards.map(card => {
        if (!card || fields.some(field => typeof card[field] !== 'string' || !card[field].trim())) {
            throw new Error('Una tarjeta de la respuesta no contiene todos los datos necesarios.')
        }
        return Object.fromEntries(fields.map(field => [field, card[field].trim()]))
    })

    const category = store.categoriesData.find(item => item.id === 'grammar')
    if (!category) throw new Error('No se encontró la categoría donde guardar la tarjeta.')

    const { error } = await supabase.rpc('save_user_ai_query', {
        p_question: question,
        p_summary: guide.summary.trim(),
        p_provider: guide.provider,
        p_cards: cards,
        p_category: category.title
    })

    if (error) {
        const migrationHint = error.message.includes('save_user_ai_query')
            ? ' Ejecuta el archivo supabase/ai_queries.sql en Supabase.'
            : ''
        throw new Error(`No se pudo guardar la consulta y sus tarjetas: ${error.message}.${migrationHint}`)
    }

    showToast(`${cards.length} ${cards.length === 1 ? 'tarjeta guardada' : 'tarjetas guardadas'} en Mis Expresiones.`, 'success')
    await loadUserCustomItems()
    const categories = await loadCategoriesFromSupabase(true)
    store.categoriesData = categories
    renderCategories(categories)
    await initializePractice(categories, {
        supabase,
        userId: store.currentUser.id
    })
    await loadQueryHistory()
}

function initializeBrowserAI() {
    const form = document.getElementById('browser-ai-form')
    const submit = document.getElementById('browser-ai-submit')
    const configure = document.getElementById('browser-ai-configure')
    if (!form || !submit) return

    updateAvailability()
    loadQueryHistory()
    configure?.addEventListener('click', () => {
        window.manageAIKeys()
        updateAvailability()
    })

    form.addEventListener('submit', async event => {
        event.preventDefault()
        const question = document.getElementById('browser-ai-question')?.value.trim()
        if (!question) return

        submit.disabled = true
        submit.textContent = 'Generando y guardando...'
        showToast('Consultando el proveedor de IA configurado...', 'info')
        try {
            await createAndSaveCard(question)
        } catch (error) {
            console.error('Error al crear la tarjeta con IA:', error)
            showToast(error.message || 'No se pudo crear la tarjeta.', 'error')
        } finally {
            submit.textContent = 'Generar explicación y guardar tarjetas'
            updateAvailability()
        }
    })
}

export { initializeBrowserAI }
