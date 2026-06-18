import {
    verbPaginationState,
    setPaginationState,
    currentViewVerbs,
    verbsData,
} from "./verbs-state.js";

export function renderVerbPagination() {
    const searchContainer = document.getElementById("verbs-search-results");
    const isSearch =
        searchContainer && !searchContainer.classList.contains("hidden");

    const pagContainer = isSearch
        ? document.getElementById("verbs-search-pagination")
        : document.getElementById("verbs-table-pagination");

    if (!pagContainer) return;

    const { totalPages, currentPage, totalItems, itemsPerPage } =
        verbPaginationState;

    const start = totalItems > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0;
    const end = Math.min(currentPage * itemsPerPage, totalItems);

    let html = `
        <div class="flex items-center justify-between flex-wrap gap-4">
            <div class="text-sm text-gray-600">
                Mostrando ${start} - ${end} de ${totalItems} verbos
            </div>
            <div class="flex items-center gap-2 flex-wrap">
    `;

    if (totalPages > 1) {
        html += `
            <button onclick="window.goToVerbPage(1)"
                    class="px-3 py-1.5 border rounded-lg text-sm hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    ${currentPage === 1 ? "disabled" : ""}>⏮ Inicio</button>
            <button onclick="window.goToVerbPage(${currentPage - 1})"
                    class="px-3 py-1.5 border rounded-lg text-sm hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    ${currentPage === 1 ? "disabled" : ""}>◀ Anterior</button>
        `;

        const maxPagesToShow = 7;
        let startPage = Math.max(1, currentPage - Math.floor(maxPagesToShow / 2));
        let endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);
        if (endPage - startPage < maxPagesToShow - 1)
            startPage = Math.max(1, endPage - maxPagesToShow + 1);

        if (startPage > 1) {
            html += `<span class="px-3 py-1.5 text-sm">1</span>`;
            if (startPage > 2) html += `<span class="px-2 text-gray-400">...</span>`;
        }

        for (let i = startPage; i <= endPage; i++) {
            html += `<button onclick="window.goToVerbPage(${i})"
                            class="px-3 py-1.5 rounded-lg text-sm ${i === currentPage ? "bg-blue-500 text-white" : "hover:bg-gray-100 border"}"
                    >${i}</button>`;
        }

        if (endPage < totalPages) {
            if (endPage < totalPages - 1)
                html += `<span class="px-2 text-gray-400">...</span>`;
            html += `<span class="px-3 py-1.5 text-sm">${totalPages}</span>`;
        }

        html += `
            <button onclick="window.goToVerbPage(${currentPage + 1})"
                    class="px-3 py-1.5 border rounded-lg text-sm hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    ${currentPage === totalPages ? "disabled" : ""}>Siguiente ▶</button>
            <button onclick="window.goToVerbPage(${totalPages})"
                    class="px-3 py-1.5 border rounded-lg text-sm hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    ${currentPage === totalPages ? "disabled" : ""}>Final ⏭</button>
        `;
    }

    html += `
                <select onchange="window.changeVerbItemsPerPage(this.value)"
                        class="px-2 py-1.5 border rounded-lg text-sm bg-white">
                    <option value="5"  ${itemsPerPage === 5 ? "selected" : ""}>5</option>
                    <option value="10"  ${itemsPerPage === 10 ? "selected" : ""}>10</option>
                    <option value="15"  ${itemsPerPage === 15 ? "selected" : ""}>15</option>
                    <option value="25"  ${itemsPerPage === 25 ? "selected" : ""}>25</option>
                    <option value="50"  ${itemsPerPage === 50 ? "selected" : ""}>50</option>
                    <option value="100" ${itemsPerPage === 100 ? "selected" : ""}>100</option>
                </select>
            </div>
        </div>
    `;

    pagContainer.innerHTML = html;
}

window.goToVerbPage = async function (page) {
    const { totalPages } = verbPaginationState;
    if (page < 1 || page > totalPages) return;

    setPaginationState({ currentPage: page });

    const searchContainer = document.getElementById("verbs-search-results");
    const isSearch =
        searchContainer && !searchContainer.classList.contains("hidden");

    if (isSearch) {
        window.searchVerbs(); // ← usa la lógica de búsqueda completa
    } else {
        const { renderVerbTable } = await import("./verbs-render.js");
        const { currentViewVerbs } = await import("./verbs-state.js");
        renderVerbTable(currentViewVerbs);
    }
};

window.changeVerbItemsPerPage = async function (value) {
    const newItemsPerPage = parseInt(value);

    const searchContainer = document.getElementById("verbs-search-results");
    const isSearch =
        searchContainer && !searchContainer.classList.contains("hidden");

    if (isSearch) {
        const query =
            document
                .getElementById("verbs-search-input")
                ?.value?.toLowerCase()
                .trim() || "";
        const { verbsData } = await import("./verbs-state.js");
        const results = verbsData.filter(
            (v) =>
                (v.verb || "").toLowerCase().includes(query) ||
                (v.translation || "").toLowerCase().includes(query) ||
                (v.past_simple || "").toLowerCase().includes(query) ||
                (v.category || "").toLowerCase().includes(query),
        );
        setPaginationState({
            itemsPerPage: newItemsPerPage,
            currentPage: 1,
            currentData: results,
            totalItems: results.length,
            totalPages: Math.ceil(results.length / newItemsPerPage),
        });
        window.searchVerbs(); // ← re-renderiza con nueva cantidad
    } else {
        const { renderVerbTable } = await import("./verbs-render.js");
        const { currentViewVerbs } = await import("./verbs-state.js");
        setPaginationState({
            itemsPerPage: newItemsPerPage,
            currentPage: 1,
            currentData: currentViewVerbs,
            totalItems: currentViewVerbs.length,
            totalPages: Math.ceil(currentViewVerbs.length / newItemsPerPage),
        });
        renderVerbTable(currentViewVerbs);
    }
};
