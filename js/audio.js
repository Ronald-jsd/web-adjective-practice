let currentUtterance = null

function getBestVoice(lang) {
    const voices = window.speechSynthesis.getVoices()
    if (!voices.length) return null
    const enPriority = ['Google US English', 'Microsoft Jenny', 'Samantha', 'Google UK English Male', 'Microsoft David', 'Alex', 'Microsoft Zira', 'Victoria', 'Karen']
    const esPriority = ['Google español', 'Microsoft Helena', 'Mónica', 'Google español (España)', 'Microsoft Sabina', 'Microsoft Pablo', 'Juan', 'Diego']
    const priorityList = lang === 'en' ? enPriority : esPriority
    const langPrefix = lang === 'en' ? 'en' : 'es'
    for (const name of priorityList) {
        const found = voices.find(v => v.name.includes(name))
        if (found) return found
    }
    const found = voices.find(v => v.lang.startsWith(langPrefix))
    if (found) return found
    return lang === 'en' ? voices.find(v => v.lang.includes('en')) : voices.find(v => v.lang.includes('es'))
}

function playAudioEnhanced(text, lang = 'en') {
    if (!text || !window.speechSynthesis) return
    const cleanText = text.replace(/["""*]/g, '').trim()
    if (currentUtterance) window.speechSynthesis.cancel()
    currentUtterance = new SpeechSynthesisUtterance(cleanText)
    currentUtterance.lang = lang === 'en' ? 'en-US' : 'es-ES'
    currentUtterance.rate = 0.9
    currentUtterance.pitch = 1.0
    currentUtterance.volume = 1.0
    const bestVoice = getBestVoice(lang)
    if (bestVoice) currentUtterance.voice = bestVoice
    window.speechSynthesis.speak(currentUtterance)
}

function initVoices() {
    if (window.speechSynthesis.getVoices().length > 0) {
        console.log('Voces cargadas:', window.speechSynthesis.getVoices().length)
    } else {
        window.speechSynthesis.onvoiceschanged = () => {
            console.log('Voces cargadas:', window.speechSynthesis.getVoices().length)
        }
    }
}

function makeClickableText(text, lang) {
    if (!text) return ''
    const escapedText = text.replace(/'/g, "\\'").replace(/"/g, '&quot;')
    return `<span class="audio-clickable cursor-pointer hover:text-amber-600 transition-colors inline-flex items-center gap-1" onclick="window.playAudioFromGlobal('${escapedText}', '${lang}')">
        <svg class="w-3.5 h-3.5 opacity-60 hover:opacity-100" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15.536H4v-4h1.586l3.414-3.414v10.828L5.586 15.536z"></path>
        </svg>
        ${text}
    </span>`
}

window.playAudioFromGlobal = function (text, lang) {
    playAudioEnhanced(text, lang)
}

initVoices()

export { playAudioEnhanced, makeClickableText, initVoices, currentUtterance }