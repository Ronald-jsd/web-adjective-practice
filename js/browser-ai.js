import { supabase } from './app.js'
import { store } from './config.js'
import { showToast } from './cache.js'
import { loadUserCustomItems } from './auth.js'
import { loadCategoriesFromSupabase, renderCategories } from './data.js'
import { generateWithAI, hasApiKey } from './ai.js'
import { initializePractice } from './practice.js'

const AI_QUERY_IMAGE_BUCKET = 'ai-query-images'
const MAX_AI_QUERY_IMAGE_SIZE = 5 * 1024 * 1024
const AI_QUERY_IMAGE_TYPES = new Map([
    ['image/jpeg', 'jpg'],
    ['image/png', 'png'],
    ['image/webp', 'webp'],
    ['image/gif', 'gif']
])
const DEFAULT_QUERY_PAGE_SIZE = 12
let savedQueries = []
let querySearch = ''
let queryPage = 0
let queryPageSize = DEFAULT_QUERY_PAGE_SIZE
let querySort = 'newest'
let activeQueryId = null

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

function createQueryDetail(query) {
    const content = document.createElement('div')
    content.className = 'space-y-4 p-5 md:p-7'

    const heading = document.createElement('div')
    heading.className = 'flex items-start justify-between gap-4'
    const title = document.createElement('h3')
    title.className = 'text-xl font-bold text-gray-900'
    title.textContent = query.question
    const closeButton = document.createElement('button')
    closeButton.type = 'button'
    closeButton.className = 'shrink-0 rounded-full border border-gray-200 px-3 py-1 text-gray-600 hover:bg-gray-100'
    closeButton.textContent = 'Cerrar'
    heading.append(title, closeButton)
    content.appendChild(heading)

    const date = document.createElement('p')
    date.className = 'text-xs text-gray-500'
    date.textContent = new Date(query.created_at).toLocaleString()
    content.appendChild(date)

    const deleteButton = document.createElement('button')
    deleteButton.type = 'button'
    deleteButton.className = 'px-3 py-2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-sm font-medium'
    deleteButton.textContent = '🗑️ Eliminar consulta y sus tarjetas'
    deleteButton.addEventListener('click', () => deleteQuery(query, deleteButton))
    content.appendChild(deleteButton)

    const answer = document.createElement('p')
    answer.className = 'text-sm leading-7 text-gray-700 whitespace-pre-line'
    answer.textContent = query.summary
    content.appendChild(answer)

    if (query.image_url) {
        const imagePreview = document.createElement('button')
        imagePreview.type = 'button'
        imagePreview.className = 'ai-query-image-preview'
        imagePreview.setAttribute('aria-label', 'Abrir imagen de la consulta en tamaño grande')
        const image = document.createElement('img')
        image.src = query.image_url
        image.alt = `Imagen para la consulta: ${query.question}`
        image.loading = 'lazy'
        image.className = 'max-h-80 max-w-full rounded-lg object-contain'
        imagePreview.appendChild(image)
        imagePreview.addEventListener('click', () => openQueryImage(query))
        const previewHint = document.createElement('span')
        previewHint.className = 'ai-query-image-hint'
        previewHint.textContent = 'Haz clic en la imagen para verla grande'
        const preview = document.createElement('div')
        preview.className = 'ai-query-image-container'
        preview.append(imagePreview, previewHint)
        content.appendChild(preview)
    } else if (query.image_error) {
        const imageError = document.createElement('p')
        imageError.className = 'mb-3 text-sm text-red-700'
        imageError.textContent = 'No se pudo cargar la imagen guardada para esta consulta.'
        content.appendChild(imageError)
    }

    const imageActions = document.createElement('div')
    imageActions.className = 'mb-4 flex flex-wrap items-center gap-2'
    const imageLabel = document.createElement('label')
    imageLabel.className = 'inline-flex cursor-pointer items-center gap-2 rounded-lg border border-purple-200 bg-white px-3 py-2 text-sm font-medium text-purple-800 hover:bg-purple-100'
    imageLabel.textContent = query.image_path ? '🖼️ Cambiar imagen' : '🖼️ Elegir imagen'
    const imageInput = document.createElement('input')
    imageInput.type = 'file'
    imageInput.accept = 'image/jpeg,image/png,image/webp,image/gif'
    imageInput.className = 'sr-only'
    imageInput.addEventListener('change', () => saveQueryImage(query, imageInput.files[0], imageInput, dropZone))
    imageLabel.appendChild(imageInput)
    imageActions.appendChild(imageLabel)

    const pasteImageButton = document.createElement('button')
    pasteImageButton.type = 'button'
    pasteImageButton.className = 'rounded-lg border border-purple-200 bg-white px-3 py-2 text-sm font-medium text-purple-800 hover:bg-purple-100'
    pasteImageButton.textContent = '📋 Pegar imagen'
    pasteImageButton.addEventListener('click', async () => {
        if (!navigator.clipboard?.read) {
            dropZone.focus()
            showToast('Este navegador no permite leer imágenes del portapapeles desde un botón. Mantén pulsada la zona de pegado y elige “Pegar”, o usa “Elegir imagen”.', 'warning')
            return
        }
        try {
            const clipboardItems = await navigator.clipboard.read()
            for (const item of clipboardItems) {
                const imageType = item.types.find(type => type.startsWith('image/'))
                if (!imageType) continue
                const blob = await item.getType(imageType)
                const file = new File([blob], `consulta-${Date.now()}.${imageType.split('/')[1] || 'png'}`, { type: imageType })
                await saveQueryImage(query, file, imageInput, dropZone)
                return
            }
            showToast('El portapapeles no contiene una imagen.', 'warning')
        } catch (error) {
            console.error('No se pudo leer una imagen del portapapeles:', error)
            showToast(`No se pudo leer el portapapeles. ${error.message || ''}`, 'warning')
        }
    })
    imageActions.appendChild(pasteImageButton)

    if (query.image_path) {
        const removeImageButton = document.createElement('button')
        removeImageButton.type = 'button'
        removeImageButton.className = 'rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50'
        removeImageButton.textContent = 'Quitar imagen'
        removeImageButton.addEventListener('click', () => removeQueryImage(query, removeImageButton))
        imageActions.appendChild(removeImageButton)
    }
    const imageHint = document.createElement('span')
    imageHint.className = 'text-xs text-gray-500'
    imageHint.textContent = 'Una imagen para toda la consulta · JPG, PNG, WebP o GIF · máximo 5 MB'
    imageActions.appendChild(imageHint)
    content.appendChild(imageActions)
    const dropZone = document.createElement('div')
    dropZone.className = 'ai-image-dropzone'
    dropZone.tabIndex = 0
    dropZone.setAttribute('role', 'textbox')
    dropZone.setAttribute('aria-multiline', 'true')
    dropZone.contentEditable = 'true'
    dropZone.setAttribute('aria-label', 'Suelta una imagen aquí o enfoca esta zona y pega una imagen')
    dropZone.textContent = 'Arrastra una imagen aquí o enfoca esta zona y pega con Ctrl+V'
    dropZone.addEventListener('dragover', event => {
        event.preventDefault()
        dropZone.classList.add('is-dragging')
    })
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('is-dragging'))
    dropZone.addEventListener('drop', event => {
        event.preventDefault()
        dropZone.classList.remove('is-dragging')
        const file = [...(event.dataTransfer?.files || [])].find(item => item.type.startsWith('image/'))
        if (file) saveQueryImage(query, file, imageInput, dropZone)
        else showToast('Suelta un archivo de imagen válido.', 'warning')
    })
    dropZone.addEventListener('paste', event => {
        event.preventDefault()
        const imageItem = [...(event.clipboardData?.items || [])]
            .find(item => item.kind === 'file' && item.type.startsWith('image/'))
        const file = imageItem?.getAsFile()
        if (!file) {
            showToast('El portapapeles no contiene una imagen. Copia una imagen antes de pegar.', 'warning')
            return
        }
        saveQueryImage(query, file, imageInput, dropZone)
    })
    content.appendChild(dropZone)

    if (!query.cards.length) {
        const emptyCards = document.createElement('p')
        emptyCards.className = 'text-sm text-gray-500 mb-3'
        emptyCards.textContent = 'Esta consulta todavía no tiene tarjetas.'
        content.appendChild(emptyCards)
    }

    if (query.cards.length) {
        const cardsGrid = document.createElement('div')
        cardsGrid.className = 'grid gap-3 sm:grid-cols-2'
        query.cards.forEach((card, index) => {
            const section = document.createElement('section')
            section.className = 'bg-purple-50 border border-purple-100 rounded-xl p-4'

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
            cardsGrid.appendChild(section)
        })
        content.appendChild(cardsGrid)
    }

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

    closeButton.addEventListener('click', () => content.closest('dialog')?.close())
    return content
}

function renderHistory(queries) {
    const history = document.getElementById('browser-ai-history')
    if (!history) return
    savedQueries = queries

    history.replaceChildren()
    const normalizedSearch = querySearch.trim().toLowerCase()
    const filtered = queries.filter(query =>
        `${query.question} ${query.summary} ${query.cards.map(card => Object.values(card).join(' ')).join(' ')}`
            .toLowerCase()
            .includes(normalizedSearch)
    )
    const sorted = [...filtered]
    if (querySort === 'oldest') sorted.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    if (querySort === 'alphabetical') sorted.sort((a, b) => a.question.localeCompare(b.question, 'es', { sensitivity: 'base' }))
    if (querySort === 'cards') sorted.sort((a, b) => b.cards.length - a.cards.length || new Date(b.created_at) - new Date(a.created_at))
    if (querySort === 'newest') sorted.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    const totalPages = queryPageSize === 0 ? 1 : Math.ceil(sorted.length / queryPageSize)
    queryPage = Math.min(queryPage, Math.max(totalPages - 1, 0))
    if (!filtered.length) {
        const empty = document.createElement('p')
        empty.className = 'text-sm text-gray-500'
        empty.textContent = queries.length ? 'No hay consultas que coincidan con la búsqueda.' : 'Aún no tienes consultas guardadas.'
        history.appendChild(empty)
        return
    }

    const grid = document.createElement('div')
    grid.className = 'ai-query-grid'
    const pageQueries = queryPageSize === 0
        ? sorted
        : sorted.slice(queryPage * queryPageSize, (queryPage + 1) * queryPageSize)
    pageQueries.forEach(query => {
        const tile = document.createElement('article')
        tile.className = 'ai-query-tile'
        if (query.image_url) {
            const imageButton = document.createElement('button')
            imageButton.type = 'button'
            imageButton.className = 'ai-query-tile-image-button'
            imageButton.setAttribute('aria-label', 'Abrir imagen de la consulta')
            const image = document.createElement('img')
            image.src = query.image_url
            image.alt = ''
            image.loading = 'lazy'
            image.className = 'ai-query-tile-image'
            imageButton.appendChild(image)
            imageButton.addEventListener('click', () => openQueryImage(query))
            tile.appendChild(imageButton)
        } else {
            const icon = document.createElement('span')
            icon.className = 'ai-query-tile-icon'
            icon.textContent = '✦'
            tile.appendChild(icon)
        }
        const title = document.createElement('h4')
        title.className = 'ai-query-tile-title'
        title.textContent = query.question
        const excerpt = document.createElement('p')
        excerpt.className = 'ai-query-tile-excerpt'
        excerpt.textContent = query.summary
        const meta = document.createElement('span')
        meta.className = 'ai-query-tile-meta'
        meta.textContent = `${query.cards.length} ${query.cards.length === 1 ? 'tarjeta' : 'tarjetas'} · ${new Date(query.created_at).toLocaleDateString()}`
        const open = document.createElement('button')
        open.type = 'button'
        open.className = 'ai-query-tile-open'
        open.textContent = 'Abrir consulta →'
        open.addEventListener('click', () => openQueryDetails(query))
        tile.append(title, excerpt, meta, open)
        grid.appendChild(tile)
    })
    history.appendChild(grid)

    if (queryPageSize > 0 && totalPages > 1) {
        const pagination = document.createElement('nav')
        pagination.className = 'mt-5 flex items-center justify-center gap-3'
        pagination.setAttribute('aria-label', 'Paginación de consultas')
        const previous = document.createElement('button')
        previous.type = 'button'
        previous.className = 'rounded-lg border border-gray-200 px-3 py-2 text-sm disabled:opacity-40'
        previous.textContent = '← Anterior'
        previous.disabled = queryPage === 0
        previous.addEventListener('click', () => {
            queryPage--
            renderHistory(queries)
        })
        const count = document.createElement('span')
        count.className = 'text-sm text-gray-500'
        count.textContent = `${queryPage + 1} / ${totalPages}`
        const next = document.createElement('button')
        next.type = 'button'
        next.className = 'rounded-lg border border-gray-200 px-3 py-2 text-sm disabled:opacity-40'
        next.textContent = 'Siguiente →'
        next.disabled = queryPage >= totalPages - 1
        next.addEventListener('click', () => {
            queryPage++
            renderHistory(queries)
        })
        pagination.append(previous, count, next)
        history.appendChild(pagination)
    }
}

function openQueryImage(query) {
    if (!query.image_url) return
    const dialog = document.createElement('dialog')
    dialog.className = 'ai-query-image-dialog'
    const controls = document.createElement('div')
    controls.className = 'ai-query-image-controls'
    const closeButton = document.createElement('button')
    closeButton.type = 'button'
    closeButton.className = 'ai-query-image-close'
    closeButton.textContent = 'Cerrar'
    closeButton.addEventListener('click', () => dialog.close())
    const zoomOut = document.createElement('button')
    zoomOut.type = 'button'
    zoomOut.className = 'ai-query-image-zoom-button'
    zoomOut.textContent = '−'
    zoomOut.setAttribute('aria-label', 'Reducir zoom')
    const zoomIn = document.createElement('button')
    zoomIn.type = 'button'
    zoomIn.className = 'ai-query-image-zoom-button'
    zoomIn.textContent = '+'
    zoomIn.setAttribute('aria-label', 'Aumentar zoom')
    const zoomRange = document.createElement('input')
    zoomRange.type = 'range'
    zoomRange.min = '50'
    zoomRange.max = '300'
    zoomRange.step = '10'
    zoomRange.value = '100'
    zoomRange.setAttribute('aria-label', 'Nivel de zoom')
    const zoomLabel = document.createElement('output')
    zoomLabel.className = 'ai-query-image-zoom-label'
    zoomLabel.textContent = '100%'
    const zoomReset = document.createElement('button')
    zoomReset.type = 'button'
    zoomReset.className = 'ai-query-image-zoom-reset'
    zoomReset.textContent = 'Restablecer'
    const image = document.createElement('img')
    image.src = query.image_url
    image.alt = `Imagen para la consulta: ${query.question}`
    const stage = document.createElement('div')
    stage.className = 'ai-query-image-stage'
    const canvas = document.createElement('div')
    canvas.className = 'ai-query-image-canvas'
    canvas.appendChild(image)
    stage.appendChild(canvas)
    controls.append(zoomOut, zoomRange, zoomIn, zoomLabel, zoomReset, closeButton)
    dialog.append(controls, stage)

    let zoom = 1
    let fitWidth = 0
    let fitHeight = 0
    const setZoom = value => {
        zoom = Math.max(0.5, Math.min(3, value))
        zoomRange.value = String(Math.round(zoom * 100))
        zoomLabel.textContent = `${zoomRange.value}%`
        canvas.style.width = `${fitWidth * zoom}px`
        canvas.style.height = `${fitHeight * zoom}px`
    }
    const fitImage = () => {
        if (!image.naturalWidth || !stage.clientWidth || !stage.clientHeight) return
        const fit = Math.min(
            stage.clientWidth / image.naturalWidth,
            stage.clientHeight / image.naturalHeight,
            1
        )
        fitWidth = image.naturalWidth * fit
        fitHeight = image.naturalHeight * fit
        setZoom(zoom)
    }
    image.addEventListener('load', fitImage, { once: true })
    zoomOut.addEventListener('click', () => setZoom(zoom - 0.1))
    zoomIn.addEventListener('click', () => setZoom(zoom + 0.1))
    zoomRange.addEventListener('input', () => setZoom(Number(zoomRange.value) / 100))
    zoomReset.addEventListener('click', () => setZoom(1))
    dialog.addEventListener('keydown', event => {
        if (event.key === '+' || event.key === '=') {
            event.preventDefault()
            setZoom(zoom + 0.1)
        } else if (event.key === '-') {
            event.preventDefault()
            setZoom(zoom - 0.1)
        } else if (event.key === '0') {
            setZoom(1)
        }
    })
    dialog.addEventListener('click', event => {
        if (event.target === dialog) dialog.close()
    })
    dialog.addEventListener('close', () => {
        window.removeEventListener('resize', fitImage)
        dialog.remove()
    }, { once: true })
    document.body.appendChild(dialog)
    dialog.showModal()
    window.addEventListener('resize', fitImage)
    if (image.complete) fitImage()
}

function openQueryDetails(query) {
    const dialog = document.createElement('dialog')
    dialog.className = 'ai-query-dialog'
    activeQueryId = query.id
    dialog.appendChild(createQueryDetail(query))
    dialog.addEventListener('click', event => {
        if (event.target === dialog) dialog.close()
    })
    dialog.addEventListener('close', () => {
        if (activeQueryId === query.id) activeQueryId = null
        dialog.remove()
    }, { once: true })
    document.body.appendChild(dialog)
    dialog.showModal()
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
        if (fields.some(([name]) => !updatedCard[name])) {
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

function validateQueryImage(file) {
    if (!AI_QUERY_IMAGE_TYPES.has(file.type)) {
        showToast('Elige una imagen JPG, PNG, WebP o GIF.', 'warning')
        return false
    }
    if (file.size > MAX_AI_QUERY_IMAGE_SIZE) {
        showToast('La imagen no puede superar los 5 MB.', 'warning')
        return false
    }
    return true
}

async function uploadQueryImage(queryId, file) {
    const extension = AI_QUERY_IMAGE_TYPES.get(file.type)
    const path = `${store.currentUser.id}/${queryId}/query-${crypto.randomUUID()}.${extension}`
    const { error } = await supabase.storage.from(AI_QUERY_IMAGE_BUCKET).upload(path, file, {
        contentType: file.type,
        upsert: false
    })
    if (error) throw error
    return path
}

async function saveQueryImage(query, file, input, dropZone) {
    if (dropZone.dataset.uploading === 'true') return
    if (!file || !validateQueryImage(file)) {
        if (input) input.value = ''
        return
    }
    dropZone.dataset.uploading = 'true'
    dropZone.setAttribute('aria-busy', 'true')
    if (input) input.disabled = true
    dropZone.classList.add('opacity-60')
    let uploadedPath
    try {
        uploadedPath = await uploadQueryImage(query.id, file)
        const { error } = await supabase.rpc('set_user_ai_query_image', {
            p_query_id: query.id,
            p_image_path: uploadedPath
        })
        if (error) throw error

        if (query.image_path) {
            const { error: cleanupError } = await supabase.storage.from(AI_QUERY_IMAGE_BUCKET).remove([query.image_path])
            if (cleanupError) {
                console.error('La imagen se cambió, pero no se pudo borrar la anterior:', cleanupError)
                showToast('Imagen guardada. No se pudo eliminar la imagen anterior.', 'warning')
            } else {
                showToast('Imagen guardada para toda la consulta.', 'success')
            }
        } else {
            showToast('Imagen guardada para toda la consulta.', 'success')
        }
        await loadQueryHistory()
    } catch (error) {
        console.error('No se pudo guardar la imagen de la consulta:', error)
        showToast(`No se pudo guardar la imagen: ${error.message}`, 'error')
        if (uploadedPath) {
            const { error: cleanupError } = await supabase.storage.from(AI_QUERY_IMAGE_BUCKET).remove([uploadedPath])
            if (cleanupError) {
                console.error('No se pudo limpiar la imagen que no quedó asociada:', cleanupError)
                showToast('La imagen no se asoció y tampoco se pudo borrar del almacenamiento.', 'warning')
            }
        }
    } finally {
        if (input) {
            input.disabled = false
            input.value = ''
        }
        delete dropZone.dataset.uploading
        dropZone.removeAttribute('aria-busy')
        dropZone.classList.remove('opacity-60', 'is-dragging')
    }
}

async function removeQueryImage(query, button) {
    button.disabled = true
    try {
        const { error } = await supabase.rpc('set_user_ai_query_image', {
            p_query_id: query.id,
            p_image_path: null
        })
        if (error) throw error
        const { error: cleanupError } = await supabase.storage.from(AI_QUERY_IMAGE_BUCKET).remove([query.image_path])
        if (cleanupError) {
            console.error('La imagen se quitó de la consulta, pero no se pudo borrar del almacenamiento:', cleanupError)
            showToast('La imagen se quitó de la consulta, pero no se pudo eliminar del almacenamiento.', 'warning')
        } else {
            showToast('Imagen quitada de la consulta.', 'success')
        }
        await loadQueryHistory()
    } catch (error) {
        console.error('No se pudo quitar la imagen de la consulta:', error)
        button.disabled = false
        showToast(`No se pudo quitar la imagen: ${error.message}`, 'error')
    }
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

        if (query.image_path) {
            const { error: storageError } = await supabase.storage.from(AI_QUERY_IMAGE_BUCKET).remove([query.image_path])
            if (storageError) {
                console.error('Consulta eliminada, pero no se pudieron eliminar sus imágenes:', storageError)
                showToast('La consulta se eliminó, pero no se pudieron eliminar sus imágenes.', 'warning')
            } else {
                showToast('Consulta y tarjetas eliminadas.', 'success')
            }
        } else {
            showToast('Consulta y tarjetas eliminadas.', 'success')
        }
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
        document.querySelector('.ai-query-dialog')?.close()
        activeQueryId = null
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
            .select('id, question, summary, provider, cards, image_path, created_at')
            .eq('user_id', store.currentUser.id)
            .order('created_at', { ascending: false })
            .abortSignal(controller.signal)

        if (error) throw error
        const queries = await Promise.all((data || []).map(async query => {
            let imageFields = {}
            if (query.image_path) {
                const { data: signedImage, error: imageError } = await supabase.storage
                    .from(AI_QUERY_IMAGE_BUCKET)
                    .createSignedUrl(query.image_path, 60 * 60)
                if (imageError) {
                    console.error('No se pudo crear un enlace temporal para la imagen de la consulta:', imageError)
                    imageFields = { image_error: true }
                } else {
                    imageFields = { image_url: signedImage.signedUrl }
                }
            }
            return { ...query, ...imageFields }
        }))
        renderHistory(queries)
        const activeDialog = document.querySelector('.ai-query-dialog')
        const activeQuery = queries.find(query => query.id === activeQueryId)
        if (activeDialog && activeQuery) activeDialog.replaceChildren(createQueryDetail(activeQuery))
        else if (activeDialog) activeDialog.close()
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
        !Array.isArray(guide.cards) || guide.cards.length < 1 || guide.cards.length > 20) {
        throw new Error('La respuesta de la IA no contiene una guía válida con entre 1 y 20 tarjetas.')
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
        const migrationHint = error.message.includes('save_user_ai_query') ||
            error.message.includes('between 1 and 6 cards')
            ? ' La base de datos aún tiene el límite anterior: vuelve a ejecutar supabase/ai_queries.sql en el SQL Editor del mismo proyecto Supabase.'
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
    const search = document.getElementById('browser-ai-search')
    const sort = document.getElementById('browser-ai-sort')
    const pageSize = document.getElementById('browser-ai-page-size')
    if (!form || !submit) return

    updateAvailability()
    loadQueryHistory()
    search?.addEventListener('input', () => {
        querySearch = search.value
        queryPage = 0
        renderHistory(savedQueries)
    })
    sort?.addEventListener('change', () => {
        querySort = sort.value
        queryPage = 0
        renderHistory(savedQueries)
    })
    pageSize?.addEventListener('change', () => {
        queryPageSize = Number(pageSize.value)
        queryPage = 0
        renderHistory(savedQueries)
    })
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
