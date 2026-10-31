const BULLET_RE = /^[-•*–]\s+(.+)$/
const NUMBERED_RE = /^(\d{1,2})[.)]\s+(.+)$/
const HEADING_RE = /^#{1,3}\s+(.+)$/
const LABEL_RE = /^([^:]{1,48}):\s*$/

let notesViewId = 0

export function parseNotes(text) {
    const raw = String(text || "")
        .replace(/\r\n?/g, "\n")
        .replace(/\t/g, "  ")
    if (!raw.trim()) return []

    const sections = []
    let current = { title: "", items: [] }

    const pushSection = () => {
        if (current.title || current.items.length) sections.push(current)
    }

    for (const originalLine of raw.split("\n")) {
        const line = originalLine
            .trim()
            .replace(/^\*{1,2}(.+?)\*{1,2}$/, "$1")
        if (!line) continue

        const heading = line.match(HEADING_RE)
        if (heading) {
            pushSection()
            current = { title: heading[1].replace(/\*{1,2}/g, "").trim(), items: [] }
            continue
        }

        const label = line.match(LABEL_RE)
        if (label && !BULLET_RE.test(line) && !NUMBERED_RE.test(line)) {
            const title = label[1].replace(/\*{1,2}/g, "").trim()
            if (title) {
                pushSection()
                current = { title, items: [] }
                continue
            }
        }

        const bullet = line.match(BULLET_RE)
        if (bullet) {
            current.items.push({ type: "bullet", text: bullet[1].trim() })
            continue
        }

        const numbered = line.match(NUMBERED_RE)
        if (numbered) {
            current.items.push({ type: "numbered", marker: numbered[1], text: numbered[2].trim() })
            continue
        }

        current.items.push({ type: "paragraph", text: line })
    }

    pushSection()
    return sections.filter(section => section.title || section.items.length)
}

function renderItems(section) {
    const fragment = document.createDocumentFragment()
    let list = null
    let listType = null

    const flush = () => {
        if (!list) return
        fragment.append(list)
        list = null
        listType = null
    }

    for (const item of section.items) {
        if (item.type === "bullet" || item.type === "numbered") {
            const type = item.type === "bullet" ? "ul" : "ol"
            if (!list || listType !== type) {
                flush()
                list = document.createElement(type)
                list.className = "vocab-note-list"
                listType = type
                if (type === "ol" && item.marker) list.start = Number(item.marker) || 1
            }
            const entry = document.createElement("li")
            entry.textContent = item.text
            list.append(entry)
        } else {
            flush()
            const paragraph = document.createElement("p")
            paragraph.className = "vocab-note-paragraph"
            paragraph.textContent = item.text
            fragment.append(paragraph)
        }
    }

    flush()
    return fragment
}

function renderSection(section, withHeading) {
    const container = document.createElement("div")
    container.className = "vocab-note-section"
    if (withHeading && section.title) {
        const heading = document.createElement("h4")
        heading.className = "vocab-note-heading"
        heading.textContent = section.title
        container.append(heading)
    }
    container.append(renderItems(section))
    return container
}

export function createNotesView(text) {
    const sections = parseNotes(text)
    if (!sections.length) return null

    const root = document.createElement("div")
    root.className = "vocab-notes"

    if (sections.length === 1) {
        root.append(renderSection(sections[0], true))
        return root
    }

    const baseId = `vocab-notes-${++notesViewId}`
    const tablist = document.createElement("div")
    tablist.className = "vocab-notes-tabs"
    tablist.setAttribute("role", "tablist")
    tablist.setAttribute("aria-label", "Secciones de notas")

    const panels = document.createElement("div")
    panels.className = "vocab-notes-panels"

    const tabs = []
    const activate = activeIndex => {
        tabs.forEach((tab, index) => {
            const selected = index === activeIndex
            tab.setAttribute("aria-selected", selected ? "true" : "false")
            tab.tabIndex = selected ? 0 : -1
            panels.children[index].hidden = !selected
        })
    }

    sections.forEach((section, index) => {
        const tabId = `${baseId}-tab-${index}`
        const panelId = `${baseId}-panel-${index}`
        const label = section.title || `Sección ${index + 1}`

        const tab = document.createElement("button")
        tab.type = "button"
        tab.className = "vocab-notes-tab"
        tab.id = tabId
        tab.textContent = label
        tab.setAttribute("role", "tab")
        tab.setAttribute("aria-controls", panelId)
        tab.setAttribute("aria-selected", index === 0 ? "true" : "false")
        tab.tabIndex = index === 0 ? 0 : -1
        tab.addEventListener("click", () => activate(index))
        tab.addEventListener("keydown", event => {
            if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return
            event.preventDefault()
            const next = event.key === "ArrowRight"
                ? (index + 1) % sections.length
                : (index - 1 + sections.length) % sections.length
            tabs[next].focus()
            activate(next)
        })

        const panel = document.createElement("div")
        panel.className = "vocab-notes-panel"
        panel.id = panelId
        panel.setAttribute("role", "tabpanel")
        panel.setAttribute("aria-labelledby", tabId)
        panel.hidden = index !== 0
        panel.append(renderItems(section))

        tabs.push(tab)
        tablist.append(tab)
        panels.append(panel)
    })

    root.append(tablist, panels)
    return root
}
