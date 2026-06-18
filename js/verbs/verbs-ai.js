import {
    store,
    GEMINI_KEY_STORAGE,
    GROQ_KEY_STORAGE,
    AI_PROVIDER_STORAGE
} from '/js/config.js'
import { showToast } from '../cache.js'
import { loadUserCustomItems } from '../auth.js'
import { renderCategories } from '../data.js'
import { supabase } from '../app.js'

let tempAIData = null

function getApiKey(provider) {
    const key = provider === 'groq' ? GROQ_KEY_STORAGE : GEMINI_KEY_STORAGE
    return localStorage.getItem(key) || ''
}

function setApiKey(provider, key) {
    if (key && key.trim()) {
        const storageKey = provider === 'groq' ? GROQ_KEY_STORAGE : GEMINI_KEY_STORAGE
        localStorage.setItem(storageKey, key.trim())
        return true
    }
    return false
}

function removeApiKey(provider) {
    const storageKey = provider === 'groq' ? GROQ_KEY_STORAGE : GEMINI_KEY_STORAGE
    localStorage.removeItem(storageKey)
}

function hasApiKey(provider) {
    return !!getApiKey(provider)
}

function getPreferredProvider() {
    return localStorage.getItem(AI_PROVIDER_STORAGE) || 'auto'
}

function setPreferredProvider(provider) {
    localStorage.setItem(AI_PROVIDER_STORAGE, provider)
}

function updateAIButton() {
    const btn = document.getElementById('ai-provider-btn')
    if (!btn) return

    const hasGemini = hasApiKey('gemini')
    const hasGroq = hasApiKey('groq')
    const preferred = getPreferredProvider()

    if (hasGroq || hasGemini) {
        let label = ''
        if (preferred === 'groq' && hasGroq) label = '⚡ Groq'
        else if (preferred === 'gemini' && hasGemini) label = '🤖 Gemini'
        else if (hasGroq) label = '⚡ IA Auto'
        else label = '🤖 IA Auto'

        btn.className = 'flex items-center gap-2 px-3 py-2 bg-green-100 hover:bg-green-200 text-green-700 rounded-lg text-xs md:text-sm font-medium transition-colors border border-green-200'
        btn.innerHTML = label
        btn.title = `Proveedor: ${preferred}. Click para gestionar.`
    } else {
        btn.className = 'flex items-center gap-2 px-3 py-2 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded-lg text-xs md:text-sm font-medium transition-colors border border-purple-200'
        btn.innerHTML = '🤖 Configurar IA'
        btn.title = 'Configura tu API Key (Groq recomendado)'
    }
}

window.manageAIKeys = function () {
    const hasGemini = hasApiKey('gemini')
    const hasGroq = hasApiKey('groq')
    const preferred = getPreferredProvider()

    const menu = `🤖 CONFIGURAR PROVEEDORES DE IA

Tienes configurados:
${hasGemini ? '✅' : '❌'} Gemini (Google AI Studio)
${hasGroq ? '✅' : '❌'} Groq (Ultra rápido ⚡)

Proveedor actual: ${preferred.toUpperCase()}

¿Qué quieres hacer?

1 → Configurar/cambiar Gemini
2 → Configurar/cambiar Groq (RECOMENDADO ⚡)
3 → Cambiar proveedor preferido
4 → Borrar todas las keys
0 → Cancelar

Escribe el número:`

    const option = prompt(menu)
    if (!option || option === '0') return

    switch (option.trim()) {
        case '1': configureProviderKey('gemini'); break
        case '2': configureProviderKey('groq'); break
        case '3': changePreferredProvider(); break
        case '4':
            if (confirm('¿Seguro que quieres borrar TODAS las API Keys?')) {
                removeApiKey('gemini')
                removeApiKey('groq')
                alert('✅ Todas las API Keys fueron eliminadas')
                updateAIButton()
            }
            break
        default: alert('⚠️ Opción no válida')
    }
}

function configureProviderKey(provider) {
    const providerInfo = provider === 'groq' ? {
        name: 'Groq (RECOMENDADO ⚡)',
        url: 'https://console.groq.com/keys',
        instructions: `🚀 Groq es ULTRA RÁPIDO (10x más que Gemini)

📋 Pasos para obtener tu API Key GRATIS:
1. Ve a: https://console.groq.com/keys
2. Regístrate con Google/GitHub (no pide tarjeta)
3. Click en "Create API Key"
4. Dale un nombre (ej: "vocab-app")
5. Copia la key (empieza con "gsk_")
6. Pégala abajo

✅ Límite: 30 requests/min, 14,400/día
⚡ Velocidad: ~0.5 segundos por respuesta
🧠 Modelo: Llama 3.3 70B (muy potente)`
    } : {
        name: 'Gemini (Google)',
        url: 'https://aistudio.google.com/app/apikey',
        instructions: `🤖 Gemini de Google

📋 Pasos para obtener tu API Key GRATIS:
1. Ve a: https://aistudio.google.com/app/apikey
2. Inicia sesión con Google
3. Click en "Create API Key"
4. Copia la key y pégala abajo

✅ Límite: 15 requests/min
🧠 Modelo: Gemini 2.5 Flash`
    }

    const currentKey = getApiKey(provider)
    let message = providerInfo.instructions + '\n\n'

    if (currentKey) {
        message += `🔑 Tu key actual: ••••••${currentKey.slice(-8)}\n\n`
    }

    message += 'Pega tu API Key (o escribe "borrar" para eliminarla):'

    const action = prompt(message)
    if (action === null) return

    const trimmed = action.trim()
    if (!trimmed) { alert('⚠️ No ingresaste nada'); return }

    if (trimmed.toLowerCase() === 'borrar' || trimmed.toLowerCase() === 'delete') {
        removeApiKey(provider)
        alert(`✅ API Key de ${providerInfo.name} eliminada`)
        updateAIButton()
        return
    }

    if (provider === 'groq' && !trimmed.startsWith('gsk_')) {
        if (!confirm('⚠️ Las keys de Groq normalmente empiezan con "gsk_"\n\n¿Estás seguro de que es correcta?')) {
            return
        }
    }

    if (trimmed.length < 20) {
        alert('❌ La API Key parece muy corta. Verifica que copiaste la key completa.')
        return
    }

    setApiKey(provider, trimmed)

    if (confirm(`✅ API Key guardada.\n\n¿Quieres usar ${providerInfo.name} como tu proveedor preferido?`)) {
        setPreferredProvider(provider)
    }

    alert(`🎉 ¡Configuración completada!\n\nYa puedes usar la IA para generar vocabulario.`)
    updateAIButton()
}

function changePreferredProvider() {
    const hasGemini = hasApiKey('gemini')
    const hasGroq = hasApiKey('groq')
    const current = getPreferredProvider()

    const options = []
    options.push(`auto → Automático (prueba ambos) [actual: ${current === 'auto' ? '✅' : ''}]`)
    if (hasGroq) options.push(`groq → Groq ⚡ (ULTRA RÁPIDO) [actual: ${current === 'groq' ? '✅' : ''}]`)
    if (hasGemini) options.push(`gemini → Gemini [actual: ${current === 'gemini' ? '✅' : ''}]`)

    if (!hasGemini && !hasGroq) {
        alert('⚠️ No tienes ninguna API Key configurada.\n\nConfigura al menos una primero.')
        return
    }

    const choice = prompt(`🎯 ELIGE TU PROVEEDOR PREFERIDO:\n\nEscribe exactamente una de estas opciones:\n\n${options.join('\n')}\n\nTu elección:`)
    if (!choice) return

    const normalized = choice.trim().toLowerCase()
    if (['auto', 'groq', 'gemini'].includes(normalized)) {
        setPreferredProvider(normalized)
        alert(`✅ Proveedor preferido cambiado a: ${normalized.toUpperCase()}`)
        updateAIButton()
    } else {
        alert('⚠️ Opción no válida. Debe ser: auto, groq o gemini')
    }
}

async function generateWithGroq(word, apiKey) {
    const systemPrompt = `Eres un experto en verbos ingleses. Analiza el verbo "${word}" y proporciona TODOS los siguientes campos.

⚠️ IMPORTANTE: Debes incluir TODOS los campos listados, incluso si no existen (usa "--" o "N/A").
⚠️ Los ejemplos deben incluir la traducción entre paréntesis: "I take out the trash (Yo saco la basura)"
⚠️ El campo "type" debe ser "R" de Regular o "I" de Irregular
⚠️ Si no encuentras una palabra entonces que sea su aproximado y de esa buscas


Responde SOLO en formato JSON válido, sin texto adicional, sin markdown. El JSON debe tener EXACTAMENTE esta estructura:

{
  "category": "Categoría del verbo",
  "type": "R o I",
  "verb": "${word}",
  "pronunciation": "Pronunciación aproximado al español",
  "translation": "Traducción al español",
  "example_base": "Ejemplo en inglés con el verbo base (traducción entre paréntesis)",
  "usage": "Usos y diferencias importantes",
  "past_simple": "Past Simple",
  "pronunciation_ps": "Pronunciación del Past Simple en IPA",
  "translation_ps": "Traducción del Past Simple",
  "example_ps": "Ejemplo con Past Simple (traducción entre paréntesis)",
  "past_participle": "Past Participle",
  "pronunciation_pp": "Pronunciación del Past Participle en IPA",
  "translation_pp": "Traducción del Past Participle",
  "example_pp": "Ejemplo con Past Participle (traducción entre paréntesis)",
  "adjective": "Adjetivo derivado",
  "pronunciation_adj": "Pronunciación del adjetivo en IPA",
  "translation_adj": "Traducción del adjetivo",
  "example_adj": "Ejemplo con adjetivo (traducción entre paréntesis)",
  "example_adj_translation": "Traducción del ejemplo con adjetivo",
  "adverb": "Adverbio derivado",
  "pronunciation_adv": "Pronunciación del adverbio en IPA",
  "translation_adv": "Traducción del adverbio",
  "example_adv": "Ejemplo con adverbio (traducción entre paréntesis)",
  "example_adv_translation": "Traducción del ejemplo con adverbio",
  "noun": "Sustantivo derivado",
  "pronunciation_noun": "Pronunciación del sustantivo en IPA",
  "translation_noun": "Traducción del sustantivo",
  "example_noun": "Ejemplo con sustantivo en inglés",
  "example_noun_translation": "Traducción del ejemplo con sustantivo"
}

Recuerda: ¡RESPONDE SOLO EN FORMATO JSON!`

    const modelsToTry = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'gemma2-9b-it']

    for (const model of modelsToTry) {
        try {
            console.log(`[Groq-Verb] Intentando con modelo: ${model}`)
            const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: `Genera la información completa para el verbo: "${word}"` }
                    ],
                    temperature: 0.3,
                    max_tokens: 2048,
                    response_format: { type: 'json_object' }
                })
            })


            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}))
                console.warn(`[Groq-Verb] Modelo ${model} falló:`, errorData.error?.message || response.status)
                if (response.status === 401) {
                    return { error: 'invalid_key', message: 'API Key inválida' }
                }
                continue
            }

            const data = await response.json()
            const text = data.choices[0].message.content
            console.log(`[Groq-Verb] ✅ Éxito con ${model}`)
            console.log('Resultados: ' + data)
                        console.log('Resultados: ' + text)

            const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()
            const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
            if (!jsonMatch) continue

            const result = JSON.parse(jsonMatch[0])
            result.word = word

            const defaultFields = {
                category: 'Sin Categoría',
                type: 'Regular',
                pronunciation: '--',
                translation: '--',
                example_base: '--',
                usage: '--',
                past_simple: '--',
                pronunciation_ps: '--',
                translation_ps: '--',
                example_ps: '--',
                past_participle: '--',
                pronunciation_pp: '--',
                translation_pp: '--',
                example_pp: '--',
                adjective: '--',
                pronunciation_adj: '--',
                translation_adj: '--',
                example_adj: '--',
                example_adj_translation: '--',
                adverb: '--',
                pronunciation_adv: '--',
                translation_adv: '--',
                example_adv: '--',
                example_adv_translation: '--',
                noun: '--',
                pronunciation_noun: '--',
                translation_noun: '--',
                example_noun: '--',
                example_noun_translation: '--'
            }

            return { ...defaultFields, ...result, modelUsed: `Groq: ${model}`, provider: 'groq' }
        } catch (error) {
            console.warn(`[Groq-Verb] Error con ${model}:`, error.message)
        }
    }
    return null
}

async function generateWithGemini(word, apiKey) {
    const prompt = `Eres un experto en verbos ingleses. Analiza el verbo "${word}" y proporciona TODOS los siguientes campos en formato JSON.

⚠️ IMPORTANTE: Debes incluir TODOS los campos listados. Si un campo no existe, usa "--".
⚠️ El campo "type" debe ser "Regular" o "Irregular"
⚠️ Los ejemplos deben incluir la traducción entre paréntesis: "I take out the trash (Yo saco la basura)"

Responde SOLO en formato JSON válido, sin texto adicional. El JSON debe tener EXACTAMENTE esta estructura:

{
  "category": "Categoría del verbo",
  "type": "Regular o Irregular",
  "verb": "${word}",
  "pronunciation": "Pronunciación en IPA",
  "translation": "Traducción al español",
  "example_base": "Ejemplo en inglés con el verbo base (traducción entre paréntesis)",
  "usage": "Usos y diferencia importante",
  "past_simple": "Past Simple",
  "pronunciation_ps": "Pronunciación del Past Simple en IPA",
  "translation_ps": "Traducción del Past Simple",
  "example_ps": "Ejemplo con Past Simple (traducción entre paréntesis)",
  "past_participle": "Past Participle",
  "pronunciation_pp": "Pronunciación del Past Participle en IPA",
  "translation_pp": "Traducción del Past Participle",
  "example_pp": "Ejemplo con Past Participle (traducción entre paréntesis)",
  "adjective": "Adjetivo derivado",
  "pronunciation_adj": "Pronunciación del adjetivo en IPA",
  "translation_adj": "Traducción del adjetivo",
  "example_adj": "Ejemplo con adjetivo (traducción entre paréntesis)",
  "example_adj_translation": "Traducción del ejemplo con adjetivo",
  "adverb": "Adverbio derivado",
  "pronunciation_adv": "Pronunciación del adverbio en IPA",
  "translation_adv": "Traducción del adverbio",
  "example_adv": "Ejemplo con adverbio (traducción entre paréntesis)",
  "example_adv_translation": "Traducción del ejemplo con adverbio",
  "noun": "Sustantivo derivado",
  "pronunciation_noun": "Pronunciación del sustantivo en IPA",
  "translation_noun": "Traducción del sustantivo",
  "example_noun": "Ejemplo con sustantivo en inglés",
  "example_noun_translation": "Traducción del ejemplo con sustantivo"
}

Recuerda: ¡RESPONDE SOLO EN FORMATO JSON!`

    const modelsToTry = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash']

    const requestBody = {
        contents: [{
            parts: [{
                text: prompt
            }]
        }],
        generationConfig: {
            temperature: 0.3,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 2048,
        }
    }

    for (const model of modelsToTry) {
        try {
            console.log(`[Gemini-Verb] Intentando con modelo: ${model}`)
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            })

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}))
                const errorMsg = errorData.error?.message || ''
                if (response.status === 400 || response.status === 403) {
                    if (errorMsg.toLowerCase().includes('api key') ||
                        errorMsg.toLowerCase().includes('invalid') ||
                        errorMsg.toLowerCase().includes('unauthorized')) {
                        return { error: 'invalid_key', message: 'API Key inválida' }
                    }
                }
                console.warn(`[Gemini-Verb] Modelo ${model} falló:`, errorMsg || response.status)
                continue
            }

            const data = await response.json()
            if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) continue

            const text = data.candidates[0].content.parts[0].text
            console.log(`[Gemini-Verb] ✅ Éxito con ${model}`)

            const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()
            const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
            if (!jsonMatch) {
                console.warn('⚠️ No se encontró JSON en la respuesta de Gemini')
                continue
            }

            const result = JSON.parse(jsonMatch[0])
            result.word = word

            const defaultFields = {
                category: 'Sin Categoría',
                type: 'Regular',
                pronunciation: '--',
                translation: '--',
                example_base: '--',
                usage: '--',
                past_simple: '--',
                pronunciation_ps: '--',
                translation_ps: '--',
                example_ps: '--',
                past_participle: '--',
                pronunciation_pp: '--',
                translation_pp: '--',
                example_pp: '--',
                adjective: '--',
                pronunciation_adj: '--',
                translation_adj: '--',
                example_adj: '--',
                example_adj_translation: '--',
                adverb: '--',
                pronunciation_adv: '--',
                translation_adv: '--',
                example_adv: '--',
                example_adv_translation: '--',
                noun: '--',
                pronunciation_noun: '--',
                translation_noun: '--',
                example_noun: '--',
                example_noun_translation: '--'
            }

            return { ...defaultFields, ...result, modelUsed: `Gemini: ${model}`, provider: 'gemini' }
        } catch (error) {
            console.warn(`[Gemini-Verb] Error con ${model}:`, error.message)
        }
    }
    return null
}

async function generateWithAI(word) {
    if (!store.currentUser) {
        alert('🔐 Debes iniciar sesión para usar la IA')
        return null
    }

    const preferred = getPreferredProvider()
    const hasGemini = hasApiKey('gemini')
    const hasGroq = hasApiKey('groq')

    if (!hasGemini && !hasGroq) {
        const shouldConfigure = confirm(
            '🤖 Para usar la IA necesitas una API Key GRATIS.\n\n' +
            '🏆 RECOMENDADO: Groq (10x más rápido que Gemini)\n\n' +
            '¿Quieres configurarla ahora?'
        )
        if (shouldConfigure) window.manageAIKeys()
        return null
    }

    let providersToTry = []
    if (preferred === 'groq' && hasGroq) {
        providersToTry.push('groq')
        if (hasGemini) providersToTry.push('gemini')
    } else if (preferred === 'gemini' && hasGemini) {
        providersToTry.push('gemini')
        if (hasGroq) providersToTry.push('groq')
    } else {
        if (hasGroq) providersToTry.push('groq')
        if (hasGemini) providersToTry.push('gemini')
    }

    console.log(`🎯 Orden de proveedores: ${providersToTry.join(' → ')}`)

    for (const provider of providersToTry) {
        const apiKey = getApiKey(provider)
        const providerName = provider === 'groq' ? 'Groq ⚡' : 'Gemini 🤖'
        showToast(`Consultando con ${providerName}...`, 'info')

        let result = provider === 'groq'
            ? await generateWithGroq(word, apiKey)
            : await generateWithGemini(word, apiKey)

        if (result && result.error === 'invalid_key') {
            removeApiKey(provider)
            updateAIButton()
            alert(`❌ La API Key de ${providerName} es inválida y fue eliminada.\n\nConfigura una nueva.`)
            continue
        }

        if (result && !result.error && result.verb) {
            return result
        }
        console.warn(`⚠️ ${providerName} falló, intentando con el siguiente...`)
    }

    alert('❌ Ningún proveedor de IA funcionó.\n\nRevisa la consola (F12) para más detalles.')
    return null
}

function buildCategoryOptions(selectedCategory) {
    let options = '<option value="">-- Selecciona una categoría --</option>'

    if (!selectedCategory) {
        store.categoriesData.forEach(cat => {
            options += `<option value="${cat.title.replace(/"/g, '&quot;')}">${cat.icon || '📚'} ${cat.title}</option>`
        })
        return options
    }

    const selectedNormalized = selectedCategory.toLowerCase().trim()

    let exactMatch = store.categoriesData.find(cat =>
        cat.title.toLowerCase().trim() === selectedNormalized
    )

    let partialMatch = null
    if (!exactMatch) {
        partialMatch = store.categoriesData.find(cat => {
            const catTitle = cat.title.toLowerCase().trim()
            return catTitle.includes(selectedNormalized) || selectedNormalized.includes(catTitle)
        })
    }

    let keywordMatch = null
    if (!exactMatch && !partialMatch) {
        const keywords = selectedNormalized.split(/\s+/).filter(w => w.length > 3)
        keywordMatch = store.categoriesData.find(cat => {
            const catTitle = cat.title.toLowerCase()
            return keywords.some(kw => catTitle.includes(kw))
        })
    }

    const bestMatch = exactMatch || partialMatch || keywordMatch

    if (!bestMatch && selectedCategory) {
        options += `<option value="${selectedCategory.replace(/"/g, '&quot;')}" selected class="bg-yellow-100">
            🆕 ${selectedCategory} (nueva categoría)
        </option>`
        options += `<option value="" disabled>─────────────────</option>`
    }

    store.categoriesData.forEach(cat => {
        let isSelected = false
        if (exactMatch && cat === exactMatch) isSelected = true
        else if (partialMatch && cat === partialMatch) isSelected = true
        else if (keywordMatch && cat === keywordMatch) isSelected = true

        options += `<option value="${cat.title.replace(/"/g, '&quot;')}" ${isSelected ? 'selected' : ''}>${cat.icon || '📚'} ${cat.title}</option>`
    })

    return options
}

function buildSubcategoryOptions(categoryTitle, selectedSubcategory) {
    let options = '<option value="">-- Selecciona una subcategoría --</option>'

    if (!categoryTitle) return options

    let category = store.categoriesData.find(cat =>
        cat.title.toLowerCase().trim() === categoryTitle.toLowerCase().trim()
    )

    if (!category) {
        category = store.categoriesData.find(cat => {
            const catTitle = cat.title.toLowerCase().trim()
            const searchTitle = categoryTitle.toLowerCase().trim()
            return catTitle.includes(searchTitle) || searchTitle.includes(catTitle)
        })
    }

    if (!category) {
        const keywords = categoryTitle.toLowerCase().split(/\s+/).filter(w => w.length > 3)
        category = store.categoriesData.find(cat => {
            const catTitle = cat.title.toLowerCase()
            return keywords.some(kw => catTitle.includes(kw))
        })
    }

    if (!category) {
        options += `<option value="" disabled>⚠️ Categoría no encontrada</option>`
        return options
    }

    const existingSubcats = category.subcategories.map(sub => sub.title)
    const recommendedSubcatNormalized = (selectedSubcategory || '').toLowerCase().trim()
    const recommendedExists = existingSubcats.some(sub =>
        sub.toLowerCase().trim() === recommendedSubcatNormalized
    )

    let partialMatch = null
    if (!recommendedExists && selectedSubcategory) {
        partialMatch = existingSubcats.find(sub => {
            const subNormalized = sub.toLowerCase().trim()
            return subNormalized.includes(recommendedSubcatNormalized) ||
                recommendedSubcatNormalized.includes(subNormalized)
        })
    }

    if (selectedSubcategory && !recommendedExists && !partialMatch) {
        options += `<option value="${selectedSubcategory.replace(/"/g, '&quot;')}" selected class="bg-yellow-100">
            🆕 ${selectedSubcategory} (nueva subcategoría)
        </option>`
        options += `<option value="" disabled>─────────────────</option>`
    }

    category.subcategories.forEach(sub => {
        const subNormalized = sub.title.toLowerCase().trim()
        let isSelected = false
        if (selectedSubcategory) {
            if (subNormalized === recommendedSubcatNormalized) isSelected = true
            else if (partialMatch && sub.title === partialMatch) isSelected = true
        }
        options += `<option value="${sub.title.replace(/"/g, '&quot;')}" ${isSelected ? 'selected' : ''}>${sub.title}</option>`
    })

    return options
}

window.onCategoryChange = function () {
    const categorySelect = document.getElementById('ai-category-select')
    const subcategorySelect = document.getElementById('ai-subcategory-select')
    if (!categorySelect || !subcategorySelect) return
    subcategorySelect.innerHTML = buildSubcategoryOptions(categorySelect.value, '')
    updateDestinationIndicator()
}

window.onSubcategoryChange = function () {
    updateDestinationIndicator()
}

function updateDestinationIndicator() {
    const categorySelect = document.getElementById('ai-category-select')
    const subcategorySelect = document.getElementById('ai-subcategory-select')
    const indicator = document.getElementById('ai-destination-indicator')
    if (!categorySelect || !subcategorySelect || !indicator) return

    const data = store.currentAIData || tempAIData || window._tempVerbData

    if (!data) {
        indicator.className = 'mt-3 p-2 bg-gray-100 border border-gray-300 rounded'
        indicator.innerHTML = '<div class="text-xs text-gray-500">⏳ Esperando datos...</div>'
        return
    }

    const selectedCategory = categorySelect.value
    const selectedSubcategory = subcategorySelect.value

    const originalCategory = (data.category || '').trim()
    const originalSubcategory = (data.subcategory || '').trim()

    const categoryExists = store.categoriesData.some(cat =>
        cat.title.toLowerCase().trim() === selectedCategory.toLowerCase().trim()
    )

    let subcategoryExists = false
    if (categoryExists && selectedCategory) {
        const cat = store.categoriesData.find(c => c.title.toLowerCase().trim() === selectedCategory.toLowerCase().trim())
        if (cat) {
            subcategoryExists = cat.subcategories.some(sub =>
                sub.title.toLowerCase().trim() === selectedSubcategory.toLowerCase().trim()
            )
        }
    }

    const sameAsAI = selectedCategory.toLowerCase().trim() === originalCategory.toLowerCase().trim() &&
        selectedSubcategory.toLowerCase().trim() === originalSubcategory.toLowerCase().trim()

    let statusClass, statusIcon, statusText

    if (!selectedCategory || !selectedSubcategory) {
        statusClass = 'bg-red-100 border-red-300'
        statusIcon = '⚠️'
        statusText = 'Debes seleccionar categoría y subcategoría'
    } else if (!categoryExists) {
        statusClass = 'bg-red-100 border-red-300'
        statusIcon = '❌'
        statusText = `La categoría "${selectedCategory}" no existe en la base de datos`
    } else if (!subcategoryExists) {
        statusClass = 'bg-purple-100 border-purple-300'
        statusIcon = '🆕'
        statusText = `La subcategoría "${selectedSubcategory}" es NUEVA y se guardará tal cual`
    } else if (sameAsAI) {
        statusClass = 'bg-green-100 border-green-300'
        statusIcon = '🎯'
        statusText = 'Coincide con la recomendación de la IA'
    } else {
        statusClass = 'bg-blue-100 border-blue-300'
        statusIcon = '✏️'
        statusText = `Personalizado por ti: ${selectedCategory} → ${selectedSubcategory}`
    }

    const textColor = statusClass.includes('red') ? 'text-red-800' :
        statusClass.includes('yellow') ? 'text-yellow-800' :
            statusClass.includes('purple') ? 'text-purple-800' :
                statusClass.includes('green') ? 'text-green-800' : 'text-blue-800'

    indicator.className = `mt-3 p-2 ${statusClass} border rounded transition-all`
    indicator.innerHTML = `
        <div class="text-xs font-bold ${textColor}">
            ${statusIcon} ${statusText}
        </div>
        ${selectedCategory && selectedSubcategory ? `
            <div class="text-xs mt-1 ${textColor}">
                <strong>Se guardará en:</strong> ${selectedCategory} → ${selectedSubcategory}
            </div>
        ` : ''}
    `

    const saveBtn = document.getElementById('ai-save-btn')
    if (saveBtn) {
        const isValid = selectedCategory && selectedSubcategory && categoryExists
        saveBtn.disabled = !isValid
        saveBtn.className = `flex-1 px-4 py-2 rounded-lg font-medium transition-all ${isValid
            ? 'bg-green-500 text-white hover:bg-green-600'
            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`
    }
}

async function saveAIResult() {
    if (!store.currentUser) {
        alert('🔐 Debes iniciar sesión para guardar')
        return
    }

    const data = store.currentAIData || tempAIData || window._tempVerbData

    console.log('🔍 Datos disponibles para guardar:', data)

    if (!data) {
        alert('❌ No hay datos de IA para guardar')
        return
    }

    const categorySelect = document.getElementById('ai-category-select')
    const subcategorySelect = document.getElementById('ai-subcategory-select')

    if (!categorySelect || !subcategorySelect) {
        alert('❌ Error: no se encontraron los selects')
        return
    }

    const finalCategory = categorySelect.value.trim()
    const finalSubcategory = subcategorySelect.value.trim()

    if (!finalCategory || !finalSubcategory) {
        alert('⚠️ Debes seleccionar una categoría y subcategoría')
        return
    }

    const categoryExists = store.categoriesData.some(cat =>
        cat.title.toLowerCase().trim() === finalCategory.toLowerCase().trim()
    )

    if (!categoryExists) {
        alert(`❌ La categoría "${finalCategory}" no existe en la base de datos.\n\nPor favor selecciona una categoría válida.`)
        return
    }

    showToast('Guardando en tu base de datos...', 'info')

    const { error } = await supabase
        .from('verbs')
        .insert({
            category: finalCategory,
            type: data.type || 'regular',
            verb: data.verb || data.word || '',
            pronunciation: data.pronunciation || '',
            translation: data.translation || '',
            example_base: data.example_base || '',
            usage: data.usage || '',
            past_simple: data.past_simple || '',
            pronunciation_ps: data.pronunciation_ps || '',
            translation_ps: data.translation_ps || '',
            example_ps: data.example_ps || '',
            past_participle: data.past_participle || '',
            pronunciation_pp: data.pronunciation_pp || '',
            translation_pp: data.translation_pp || '',
            example_pp: data.example_pp || '',
            adjective: data.adjective || '',
            pronunciation_adj: data.pronunciation_adj || '',
            translation_adj: data.translation_adj || '',
            example_adj: data.example_adj || '',
            example_adj_translation: data.example_adj_translation || '',
            adverb: data.adverb || '',
            pronunciation_adv: data.pronunciation_adv || '',
            translation_adv: data.translation_adv || '',
            example_adv: data.example_adv || '',
            example_adv_translation: data.example_adv_translation || '',
            noun: data.noun || '',
            pronunciation_noun: data.pronunciation_noun || '',
            translation_noun: data.translation_noun || '',
            example_noun: data.example_noun || '',
            example_noun_translation: data.example_noun_translation || ''
        })

    if (error) {
        alert('❌ Error al guardar: ' + error.message)
        return
    }

    const providerBadge = data.provider === 'groq' ? '⚡ Groq' : '🤖 Gemini'
    showToast(`✅ Guardado con ${providerBadge} en "${finalSubcategory}"`, 'success')

    tempAIData = null
    store.currentAIData = null
    window._tempVerbData = null

    try {
        const { loadVerbsFromSupabase } = await import('./verbs-loader.js')
        await loadVerbsFromSupabase(true)
    } catch (e) {
        console.warn('⚠️ Error recargando datos:', e)
    }

    const aiContainer = document.getElementById('ai-suggestion-container')
    if (aiContainer) {
        const existingPreview = document.getElementById('ai-preview')
        if (existingPreview) existingPreview.remove()
        aiContainer.classList.add('hidden')
    }

    renderCategories(store.categoriesData)
}


window.saveAIResultWithData = function (data) {
    console.log('📝 saveAIResultWithData llamado con:', data)
    if (!data) {
        data = store.currentAIData || tempAIData || window._tempVerbData
    }

    if (!data) {
        alert('❌ No hay datos de IA para guardar')
        return
    }

    store.currentAIData = data
    tempAIData = data
    window._tempVerbData = data

    saveAIResult()
}

window.useAIForWord = async function () {
    if (!store.currentUser) {
        alert('🔐 Debes iniciar sesión para usar la IA')
        return
    }

    if (!hasApiKey('groq') && !hasApiKey('gemini')) {
        const shouldConfigure = confirm(
            '🤖 Primero necesitas una API Key GRATIS.\n\n' +
            '🏆 RECOMENDADO: Groq (10x más rápido)\n\n' +
            '¿Quieres configurarla ahora?'
        )
        if (shouldConfigure) window.manageAIKeys()
        return
    }

    const word = store.lastSearchQuery.trim()
    if (!word) return

    const aiBtn = document.getElementById('ai-generate-btn')
    if (aiBtn) {
        aiBtn.disabled = true
        aiBtn.innerHTML = '<span class="loading-spinner" style="width: 16px; height: 16px; border-width: 2px;"></span> Generando con IA...'
    }

    const aiData = await generateWithAI(word)

    if (aiData) {
        tempAIData = aiData
        store.currentAIData = aiData
        window._tempVerbData = aiData

        const providerLabel = aiData.provider === 'groq'
            ? '<span class="inline-block px-2 py-0.5 bg-orange-100 text-orange-700 rounded text-xs font-bold">⚡ Groq (Ultra rápido)</span>'
            : '<span class="inline-block px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-bold">🤖 Gemini</span>'

        const categoryOptions = buildCategoryOptions(aiData.category)
        const subcategoryOptions = buildSubcategoryOptions(aiData.category, aiData.subcategory)
        const saveBtnId = 'ai-save-btn-' + Date.now()

        const preview = `
        <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4" id="ai-preview">
            <h4 class="font-bold text-blue-900 mb-3 flex items-center gap-2">
                ✨ Resultado de IA: ${providerLabel}
            </h4>
            
            <div class="space-y-2 text-sm bg-white p-3 rounded-lg border border-blue-100">
                <div class="flex items-center gap-2">
                    <span class="text-gray-500 w-28 flex-shrink-0">Palabra:</span>
                    <strong class="text-gray-900">${aiData.word}</strong>
                </div>
                <div class="flex items-center gap-2">
                    <span class="text-gray-500 w-28 flex-shrink-0">Pronunciación:</span>
                    <span class="font-mono text-gray-700">${aiData.pronunciation}</span>
                </div>
                <div class="flex items-center gap-2">
                    <span class="text-gray-500 w-28 flex-shrink-0">Español:</span>
                    <span class="text-gray-700">${aiData.spanish}</span>
                </div>
                <div class="flex items-start gap-2">
                    <span class="text-gray-500 w-28 flex-shrink-0">Ejemplo EN:</span>
                    <span class="text-gray-700">${aiData.example_en}</span>
                </div>
                <div class="flex items-start gap-2">
                    <span class="text-gray-500 w-28 flex-shrink-0">Ejemplo ES:</span>
                    <span class="text-gray-700">${aiData.example_es}</span>
                </div>
            </div>
            
            <div class="mt-4 space-y-3">
                <div class="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-2">
                    📂 Ubicación en la base de datos
                    <span class="text-xs font-normal text-gray-500 normal-case">(puedes cambiarla)</span>
                </div>
                
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                        <label class="block text-xs font-medium text-gray-600 mb-1">📁 Categoría</label>
                        <select id="ai-category-select" onchange="window.onCategoryChange()" class="w-full px-3 py-2 bg-white border-2 border-blue-300 rounded-lg text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all cursor-pointer">
                            ${categoryOptions}
                        </select>
                    </div>
                    <div>
                        <label class="block text-xs font-medium text-gray-600 mb-1">📂 Subcategoría</label>
                        <select id="ai-subcategory-select" onchange="window.onSubcategoryChange()" class="w-full px-3 py-2 bg-white border-2 border-blue-300 rounded-lg text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all cursor-pointer">
                            ${subcategoryOptions}
                        </select>
                    </div>
                </div>
                
                <div id="ai-destination-indicator" class="mt-3 p-2 bg-green-100 border border-green-300 rounded transition-all">
                    <div class="text-xs font-bold text-green-800">🎯 Cargando...</div>
                </div>
            </div>
            
            <div class="text-xs text-gray-500 pt-2 mt-3 border-t border-blue-100">
                <em>Modelo: ${aiData.modelUsed}</em>
            </div>
            
            <div class="flex gap-2 mt-4">
                <button id="${saveBtnId}" 
                        onclick="window.saveAIResultWithData(window._tempVerbData)" 
                        class="flex-1 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 font-medium transition-all">
                    💾 Guardar
                </button>
                <button onclick="window.cancelAIPreview()" class="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 font-medium transition-all">
                    ❌ Cancelar
                </button>
            </div>
        </div>`

        const container = document.getElementById('ai-suggestion-container')
        if (container) {
            const existingPreview = document.getElementById('ai-preview')
            if (existingPreview) existingPreview.remove()
            container.insertAdjacentHTML('beforeend', preview)

            setTimeout(() => updateDestinationIndicator(), 50)
        }
    }

    if (aiBtn) {
        aiBtn.disabled = false
        aiBtn.innerHTML = '✨ Generar con IA'
    }
}

function cancelAIPreview() {
    const existingPreview = document.getElementById('ai-preview')
    if (existingPreview) existingPreview.remove()
    store.currentAIData = null
    tempAIData = null
    window._tempVerbData = null
}

export {
    getApiKey, setApiKey, removeApiKey, hasApiKey,
    getPreferredProvider, setPreferredProvider,
    updateAIButton, generateWithAI, saveAIResult,
    buildCategoryOptions, buildSubcategoryOptions,
    updateDestinationIndicator, cancelAIPreview,
    generateWithAI as generateVerbWithAI,
    saveAIResult as saveVerbAIResult
}

window.manageAIKeys = window.manageAIKeys
window.useAIForWord = window.useAIForWord
window.saveAIResult = saveAIResult
window.saveAIResultWithData = window.saveAIResultWithData
window.cancelAIPreview = cancelAIPreview
window.onCategoryChange = window.onCategoryChange
window.onSubcategoryChange = window.onSubcategoryChange