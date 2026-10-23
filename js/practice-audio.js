const PRACTICE_AUDIO_RATES = [1, 0.9, 0.85, 0.8, 0.75]

function createPracticeAudioPlayer({
    synthesis,
    createUtterance,
    getVoice,
    onState,
    random = Math.random,
    storage,
    storageKey = "practice_audio_course_session"
}) {
    let items = []
    let itemIndex = 0
    let segmentIndex = 0
    let status = "idle"
    let generation = 0
    let rate = 1
    let scopeKey = ""

    function readSavedSession() {
        if (!storage) return null
        try {
            const saved = JSON.parse(storage.getItem(storageKey) || "null")
            if (saved?.version !== 1
                || !Array.isArray(saved.itemIds)
                || !saved.itemIds.every(id => typeof id === "string")
                || !Number.isInteger(saved.itemIndex)
                || !Number.isInteger(saved.segmentIndex)
                || typeof saved.scopeKey !== "string") return null
            return saved
        } catch (error) {
            console.warn("No se pudo leer el progreso de escucha:", error)
            return null
        }
    }

    function clearSavedSession() {
        if (!storage) return
        try {
            storage.removeItem(storageKey)
        } catch (error) {
            console.warn("No se pudo borrar el progreso de escucha:", error)
        }
    }

    function saveSession() {
        if (!storage || !items.length || !["playing", "paused"].includes(status)) return
        try {
            storage.setItem(storageKey, JSON.stringify({
                version: 1,
                itemIds: items.map(item => item.id),
                itemIndex,
                segmentIndex,
                rate,
                scopeKey
            }))
        } catch (error) {
            console.warn("No se pudo guardar el progreso de escucha:", error)
        }
    }

    function shuffle(selectedItems) {
        const shuffled = selectedItems.map(item => ({ ...item }))
        for (let index = shuffled.length - 1; index > 0; index -= 1) {
            const swapIndex = Math.floor(random() * (index + 1))
            ;[shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]]
        }
        return shuffled
    }

    function publish(extra = {}) {
        if (status === "complete") clearSavedSession()
        else saveSession()
        onState({
            status,
            item: items[itemIndex] || null,
            itemIndex,
            total: items.length,
            rate,
            ...extra
        })
    }

    function getSegments(item) {
        return [
            { text: item.word, lang: "en-US", label: "Palabra en inglés" },
            { text: item.spanish, lang: "es-ES", label: "Traducción" },
            item.example ? { text: item.example, lang: "en-US", label: "Ejemplo en inglés" } : null,
            item.exampleSpanish ? { text: item.exampleSpanish, lang: "es-ES", label: "Traducción del ejemplo" } : null
        ].filter(segment => segment?.text?.trim())
    }

    function speakCurrentSegment(runId) {
        if (runId !== generation || status !== "playing") return
        if (itemIndex >= items.length) {
            status = "complete"
            publish()
            return
        }

        const item = items[itemIndex]
        const segments = getSegments(item)
        if (segmentIndex >= segments.length) {
            itemIndex += 1
            segmentIndex = 0
            speakCurrentSegment(runId)
            return
        }

        const segment = segments[segmentIndex]
        const utterance = createUtterance(segment.text)
        utterance.lang = segment.lang
        utterance.rate = rate
        const voice = getVoice?.(segment.lang.startsWith("en") ? "en" : "es")
        if (voice) utterance.voice = voice
        utterance.onend = () => {
            if (runId !== generation || status !== "playing") return
            segmentIndex += 1
            speakCurrentSegment(runId)
        }
        utterance.onerror = event => {
            if (runId !== generation || status !== "playing" || event.error === "canceled" || event.error === "interrupted") return
            status = "error"
            publish({ error: event.error || "No se pudo reproducir el audio." })
        }
        publish({ segmentLabel: segment.label })
        synthesis.speak(utterance)
    }

    return {
        canResume(selectedItems, requestedScopeKey) {
            const saved = readSavedSession()
            if (!saved || saved.scopeKey !== requestedScopeKey) return false
            const itemsById = new Map(selectedItems.map(item => [item.id, item]))
            return saved.itemIds.length > 0 && saved.itemIds.every(id => itemsById.has(id))
        },
        setRate(nextRate) {
            const parsedRate = Number(nextRate)
            if (!PRACTICE_AUDIO_RATES.includes(parsedRate)) {
                throw new RangeError(`Unsupported practice audio rate: ${nextRate}`)
            }
            rate = parsedRate
            publish()
        },
        start(selectedItems, requestedScopeKey = "") {
            if (status === "paused") {
                status = "playing"
                synthesis.resume()
                publish()
                return
            }
            if (status === "playing") return

            const saved = readSavedSession()
            const itemsById = new Map(selectedItems.map(item => [item.id, item]))
            const canResume = saved
                && saved.scopeKey === requestedScopeKey
                && saved.itemIds.length > 0
                && saved.itemIds.every(id => itemsById.has(id))
            if (canResume) {
                items = saved.itemIds.map(id => itemsById.get(id))
                itemIndex = Math.min(Math.max(0, saved.itemIndex), items.length)
                segmentIndex = Math.max(0, saved.segmentIndex || 0)
                rate = PRACTICE_AUDIO_RATES.includes(Number(saved.rate)) ? Number(saved.rate) : rate
            } else {
                items = shuffle(selectedItems)
                itemIndex = 0
                segmentIndex = 0
            }
            scopeKey = requestedScopeKey
            if (!items.length) {
                status = "complete"
                publish()
                return
            }
            status = "playing"
            const runId = ++generation
            synthesis.cancel()
            speakCurrentSegment(runId)
        },
        pause() {
            if (status !== "playing") return
            synthesis.pause()
            status = "paused"
            publish()
        },
        skip() {
            if (status !== "playing" && status !== "paused") return
            generation += 1
            synthesis.cancel()
            itemIndex += 1
            segmentIndex = 0
            status = itemIndex >= items.length ? "complete" : "playing"
            publish()
            if (status === "playing") speakCurrentSegment(generation)
        },
        stop(preserveProgress = false) {
            generation += 1
            synthesis.cancel()
            if (!preserveProgress) clearSavedSession()
            items = []
            itemIndex = 0
            segmentIndex = 0
            status = "idle"
            publish()
        },
        get status() {
            return status
        }
    }
}

export { createPracticeAudioPlayer, PRACTICE_AUDIO_RATES }
