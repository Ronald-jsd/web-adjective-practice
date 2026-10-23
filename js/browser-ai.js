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

    if (!query.cards.length) {
        const emptyCards = document.createElement('p')
        emptyCards.className = 'text-sm text-gray-500 mb-3'
        emptyCards.textContent = 'Esta consulta todavía no tiene tarjetas.'
        content.appendChild(emptyCards)
    }

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

        const editButton = document.createElement('button')
        editButton.type = 'button'
        editButton.className = 'mt-3 px-3 py-2 bg-white hover:bg-purple-100 text-purple-800 border border-purple-200 rounded-lg text-sm font-medium'
        editButton.textContent = 'Editar tarjeta'
        editButton.addEventListener('click', () => {
            section.replaceChildren(createCardEditForm(query, card, index))
        })
        section.appendChild(editButton)

        const removeButton = document.createElement('button')
        removeButton.type = 'button'
        removeButton.className = 'mt-3 ml-2 px-3 py-2 bg-white hover:bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm font-medium'
        removeButton.textContent = 'Eliminar tarjeta'
        removeButton.addEventListener('click', () => {
            if (!window.confirm(`¿Eliminar la tarjeta "${card.word}"?`)) return
            saveQueryCards(query, query.cards.filter((_, cardIndex) => cardIndex !== index), 'delete')
        })
        section.appendChild(removeButton)
        content.appendChild(section)
    })

    const addButton = document.createElement('button')
    addButton.type = 'button'
    addButton.className = 'px-4 py-2 bg-purple-100 hover:bg-purple-200 text-purple-800 rounded-lg text-sm font-medium disabled:opacity-50'
    addButton.textContent = '＋ Agregar tarjeta'
    addButton.addEventListener('click', () => {
        addButton.replaceWith(createCardEditForm(query, {
            word: '',
            pronunciation: '',
            spanish: '',
            example_en: '',
            example_es: ''
        }, query.cards.length))
    })
    content.appendChild(addButton)

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

function createCardEditForm(query, card, index) {
    const form = document.createElement('form')
    form.className = 'space-y-3'

    const fields = [
        ['word', 'Palabra o expresión', 'input'],
        ['pronunciation', 'Pronunciación', 'input'],
        ['spanish', 'Significado y explicación', 'textarea'],
        ['example_en', 'Ejemplo en inglés', 'textarea'],
        ['example_es', 'Traducción del ejemplo', 'textarea']
    ]

    for (const [name, labelText, elementName] of fields) {
        const label = document.createElement('label')
        label.className = 'block text-sm font-medium text-gray-700'
        label.textContent = labelText
        const input = document.createElement(elementName)
        input.name = name
        input.required = true
        input.maxLength = name === 'spanish' || name.startsWith('example_') ? 2000 : 300
        input.className = 'mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none'
        input.value = card[name]
        if (elementName === 'textarea') input.rows = 3
        label.appendChild(input)
        form.appendChild(label)
    }

    const actions = document.createElement('div')
    actions.className = 'flex flex-wrap gap-2'
    const save = document.createElement('button')
    save.type = 'submit'
    save.className = 'px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white rounded-lg text-sm font-medium'
    save.textContent = index === query.cards.length ? 'Agregar y guardar tarjeta' : 'Guardar cambios'
    const cancel = document.createElement('button')
    cancel.type = 'button'
    cancel.className = 'px-4 py-2 bg-white hover:bg-gray-100 text-gray-700 border border-gray-300 rounded-lg text-sm font-medium'
    cancel.textContent = 'Cancelar'
    cancel.addEventListener('click', () => loadQueryHistory())
    actions.append(save, cancel)
    form.appendChild(actions)

    form.addEventListener('submit', async event => {
        event.preventDefault()
        if (!store.currentUser) {
            showToast('Inicia sesión para editar tus tarjetas.', 'warning')
            return
        }

        const updatedCard = Object.fromEntries(
            fields.map(([name]) => [name, String(new FormData(form).get(name) || '').trim()])
        )
        if (Object.values(updatedCard).some(value => !value)) {
            showToast('Completa todos los campos de la tarjeta.', 'warning')
            return
        }

        save.disabled = true
        save.textContent = 'Guardando...'
        cancel.disabled = true
        const updatedCards = query.cards.slice()
        updatedCards[index] = updatedCard
        const saved = await saveQueryCards(
            query,
            updatedCards,
            index === query.cards.length ? 'add' : 'update'
        )
        if (!saved) {
            save.disabled = false
            save.textContent = index === query.cards.length ? 'Agregar y guardar tarjeta' : 'Guardar cambios'
            cancel.disabled = false
        }
    })

    return form
}

async function saveQueryCards(query, cards, operation = 'update') {
    try {
        const category = store.categoriesData.find(item => item.id === 'grammar')
        if (!category) throw new Error('No se encontró la categoría de las tarjetas.')

        const { error } = await supabase.rpc('set_user_ai_query_cards', {
            p_query_id: query.id,
            p_cards: cards,
            p_category: category.title
        })
        if (error) throw error

        const message = operation === 'add'
            ? 'Tarjeta agregada y guardada en Supabase.'
            : operation === 'delete'
                ? 'Tarjeta eliminada y cambios guardados en Supabase.'
                : 'Tarjeta actualizada y guardada en Supabase.'
        showToast(message, 'success')
    } catch (error) {
        console.error('No se pudieron guardar las tarjetas de IA:', error)
        const migrationHint = error.message.includes('set_user_ai_query_cards')
            ? ' Ejecuta de nuevo supabase/ai_queries.sql.'
            : ''
        showToast(`No se pudieron guardar los cambios: ${error.message}.${migrationHint}`, 'error')
        return false
    }

    try {
        await refreshSavedAIItems()
    } catch (error) {
        console.error('Las tarjetas se guardaron, pero no se pudo actualizar la práctica:', error)
        showToast('Los cambios se guardaron. Recarga la práctica para ver las tarjetas actualizadas.', 'warning')
    }
    await loadQueryHistory()
    return true
}

async function refreshSavedAIItems() {
    if (!store.currentUser) return
    await loadUserCustomItems()
    const categories = await loadCategoriesFromSupabase(true)
    store.categoriesData = categories
    renderCategories(categories)
    await initializePractice(categories, {
        supabase,
        userId: store.currentUser.id
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
        await refreshSavedAIItems()
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
        return false
    }

    const guide = await generateWithAI(question, { guide: true })
    if (!guide) return false
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
    await refreshSavedAIItems()
    await loadQueryHistory()
    return true
}

function showBackgroundRequestStatus() {
    document.getElementById('browser-ai-background-status')?.remove()
    const status = document.createElement('div')
    status.id = 'browser-ai-background-status'
    status.className = 'fixed bottom-4 right-4 z-50 max-w-sm rounded-xl bg-gray-900 px-4 py-3 text-sm font-medium text-white shadow-lg'
    status.setAttribute('role', 'status')
    status.setAttribute('aria-live', 'polite')
    status.textContent = '🤖 Generando y guardando tu consulta. Puedes cambiar de sección; seguirá trabajando.'
    document.body.appendChild(status)
    return status
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
        const backgroundStatus = showBackgroundRequestStatus()
        showToast('Consultando el proveedor de IA configurado...', 'info')
        let saved = false
        let failed = false
        try {
            saved = await createAndSaveCard(question)
        } catch (error) {
            failed = true
            console.error('Error al crear la tarjeta con IA:', error)
            showToast(error.message || 'No se pudo crear la tarjeta.', 'error')
        } finally {
            submit.textContent = 'Generar explicación y guardar tarjetas'
            updateAvailability()
            backgroundStatus.textContent = saved
                ? '✅ Consulta y tarjetas guardadas en Supabase.'
                : failed
                    ? '⚠️ No se pudo completar la consulta. Revisa el mensaje de error.'
                    : '⚠️ La consulta no se completó.'
            window.setTimeout(() => backgroundStatus.remove(), 6000)
        }
    })
}

export { initializeBrowserAI }
