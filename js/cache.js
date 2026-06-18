import { CACHE_KEY, CACHE_TIMESTAMP_KEY, CACHE_DURATION } from './config.js'

function saveToCache(data) {
    try {
        const cacheData = { data: data, timestamp: Date.now() }
        localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData))
        localStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString())
    } catch (error) {
        console.error('Error guardando en caché:', error)
    }
}

function loadFromCache() {
    try {
        const cached = localStorage.getItem(CACHE_KEY)
        if (!cached) return null
        const cacheData = JSON.parse(cached)
        const timestamp = parseInt(localStorage.getItem(CACHE_TIMESTAMP_KEY) || '0')
        const now = Date.now()
        if (now - timestamp < CACHE_DURATION) {
            return cacheData.data
        } else {
            localStorage.removeItem(CACHE_KEY)
            localStorage.removeItem(CACHE_TIMESTAMP_KEY)
            return null
        }
    } catch (error) {
        return null
    }
}

function clearCache() {
    localStorage.removeItem(CACHE_KEY)
    localStorage.removeItem(CACHE_TIMESTAMP_KEY)
}

function showToast(message, type = 'info') {
    const existingToast = document.querySelector('.saving-toast')
    if (existingToast) existingToast.remove()

    const toast = document.createElement('div')
    toast.className = `saving-toast ${type}`
    toast.textContent = message
    document.body.appendChild(toast)

    setTimeout(() => {
        toast.style.animation = 'slideOutRight 0.3s ease'
        setTimeout(() => toast.remove(), 300)
    }, 2000)
}

export { saveToCache, loadFromCache, clearCache, showToast }