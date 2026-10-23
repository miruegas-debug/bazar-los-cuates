const categoryIcons = {
  herramientas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-3-3 2.5-2.5Z"/></svg>',
  muebles: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 11V8a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v3M4 11h16a2 2 0 0 1 2 2v5H2v-5a2 2 0 0 1 2-2ZM4 18v2M20 18v2M7 11V8h10v3"/></svg>',
  bocinas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="2.5" width="14" height="19" rx="3"/><circle cx="12" cy="15" r="3.5"/><circle cx="12" cy="7" r="1.5"/></svg>',
  cuchillos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 20 18.5 5.5a2.1 2.1 0 0 0-3-3L1 17l3 3ZM13 6l5 5M2.5 18.5 5 21"/></svg>',
  electrodomesticos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="12" cy="13" r="4.5"/><path d="M12 3v3M7 6h.01M10 6h.01"/></svg>',
  otros: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/></svg>',
};

const catalogState = {
  category: "",
  q: "",
  sort: "recent",
  limit: 24,
  offset: 0,
  total: 0,
  products: new Map(),
  meta: null,
};

document.addEventListener("DOMContentLoaded", () => {
  const searchInput = document.querySelector("#product-search");
  const sortSelect = document.querySelector("#filter-sort");
  const categoryFilters = document.querySelector("#category-filters");
  const categoryGrid = document.querySelector("#category-grid");
  const productGrid = document.querySelector("#product-grid");
  const loading = document.querySelector("#catalog-loading");
  const empty = document.querySelector("#empty-state");
  const loadMore = document.querySelector("#load-more");
  const reset = document.querySelector("#reset-filters");
  const resultCount = document.querySelector("#result-count");

  async function init() {
    try {
      const [meta] = await Promise.all([BC.api("/api/meta"), loadProducts(true)]);
      catalogState.meta = meta;
      populateMeta(meta);
    } catch (error) {
      loading.innerHTML = `<p class="form-error">${BC.escapeHtml(error.message)}</p>`;
    }
  }

  function populateMeta(meta) {
    categoryFilters.innerHTML = [
      `<button class="filter-btn is-active" type="button" data-category="" aria-pressed="true">Todos</button>`,
      ...meta.categories.map((item) => `
        <button class="filter-btn" type="button" data-category="${BC.escapeHtml(item.key)}" aria-pressed="false">
          ${BC.escapeHtml(item.label)}
        </button>
      `),
    ].join("");

    const featuredCategories = meta.categories.filter((item) => item.key !== "otros");
    categoryGrid.innerHTML = featuredCategories.map((item) => `
      <button class="category-card" type="button" data-category-jump="${BC.escapeHtml(item.key)}">
        <span class="category-icon" aria-hidden="true">${categoryIcons[item.key] || categoryIcons.otros}</span>
        <span class="category-info">
          <strong>${BC.escapeHtml(item.label)}</strong>
          <small>${item.count} ${item.count === 1 ? "artículo" : "artículos"}</small>
        </span>
        <span class="category-arrow" aria-hidden="true">↗</span>
      </button>
    `).join("");

    const totalCounter = document.querySelector("#contador-total");
    const todayCounter = document.querySelector("#contador-hoy");
    if (totalCounter) totalCounter.textContent = meta.productCount;
    if (todayCounter) todayCounter.textContent = meta.todayProductCount ?? 0;

    const visitsToday = document.querySelector("#contador-visitas-hoy");
    const visitsTotal = document.querySelector("#contador-visitas-total");
    if (visitsToday) visitsToday.textContent = meta.visitsToday ?? 0;
    if (visitsTotal) visitsTotal.textContent = meta.visitsTotal ?? 0;
  }

  function updateCategoryButtons() {
    categoryFilters.querySelectorAll("[data-category]").forEach((button) => {
      const active = button.dataset.category === catalogState.category;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  async function loadProducts(resetList = true) {
    if (resetList) {
      catalogState.offset = 0;
      loading.hidden = false;
      empty.hidden = true;
      productGrid.hidden = true;
    }

    const params = new URLSearchParams({
      limit: String(catalogState.limit),
      offset: String(resetList ? 0 : catalogState.offset),
      sort: catalogState.sort,
    });
    if (catalogState.category) params.set("category", catalogState.category);
    if (catalogState.q) params.set("q", catalogState.q);

    try {
      const data = await BC.api(`/api/products?${params.toString()}`);
      if (resetList) productGrid.innerHTML = "";
      catalogState.total = data.total;
      catalogState.offset = (resetList ? 0 : catalogState.offset) + data.products.length;

      data.products.forEach((product) => catalogState.products.set(product.publicId, product));
      productGrid.insertAdjacentHTML("beforeend", data.products.map(productCard).join(""));
      productGrid.hidden = data.total === 0;
      empty.hidden = data.total !== 0;
      loading.hidden = true;
      loadMore.hidden = catalogState.offset >= data.total;
      BC.setLoading(loadMore, false);

      if (data.total === 0) {
        resultCount.textContent = "Sin resultados";
      } else {
        resultCount.innerHTML = `Mostrando <strong>${Math.min(catalogState.offset, data.total)}</strong> de <strong>${data.total}</strong> piezas`;
      }
    } catch (error) {
      loading.hidden = true;
      productGrid.hidden = true;
      empty.hidden = false;
      empty.querySelector("h3").textContent = "No pudimos cargar el catálogo";
      empty.querySelector("p").textContent = error.message;
      loadMore.hidden = true;
      BC.setLoading(loadMore, false);
    }
  }

  function productCard(product) {
    const href = `producto.html?id=${encodeURIComponent(product.publicId)}`;
    return `
      <article class="product-card">
        <a class="product-media" href="${href}" aria-label="Ver ${BC.escapeHtml(product.title)}">
          <img src="${BC.escapeHtml(product.imageUrl)}" alt="${BC.escapeHtml(product.title)}" width="640" height="480" loading="lazy" decoding="async">
          <span class="product-category">${BC.escapeHtml(product.categoryLabel)}</span>
          <span class="product-condition">${BC.escapeHtml(product.condition)}</span>
          <span class="product-anonymous">Bazar Los Cuates</span>
        </a>
        <div class="product-info">
          <div class="product-meta-line">
            <span>${BC.escapeHtml(product.city)}, ${BC.escapeHtml(product.state)}</span>
            <span>Disponible</span>
          </div>
          <h3><a href="${href}">${BC.escapeHtml(product.title)}</a></h3>
          <p class="product-desc">${BC.escapeHtml(product.description)}</p>
          <div class="product-bottom">
            <span class="product-price">
              <small>Precio</small>
              <strong>${BC.money(product.priceCents)}</strong>
            </span>
            <button class="product-contact" type="button" data-wa="${BC.escapeHtml(product.publicId)}">WhatsApp</button>
          </div>
          <div class="product-share-row">
            <button class="share-chip share-wa" type="button" data-wa="${BC.escapeHtml(product.publicId)}">WhatsApp</button>
            <button class="share-chip" type="button" data-share-fb="${BC.escapeHtml(product.publicId)}">Facebook</button>
            <button class="share-chip" type="button" data-share-groups="${BC.escapeHtml(product.publicId)}">Grupos</button>
          </div>
        </div>
      </article>
    `;
  }

  function resetCatalog() {
    catalogState.category = "";
    catalogState.q = "";
    catalogState.sort = "recent";
    searchInput.value = "";
    sortSelect.value = "recent";
    updateCategoryButtons();
    empty.querySelector("h3").textContent = "No encontramos esa pieza";
    empty.querySelector("p").textContent = "Prueba con otra palabra o revisa todas las categorías.";
    loadProducts(true);
  }

  searchInput.addEventListener("input", BC.debounce(() => {
    catalogState.q = searchInput.value.trim();
    loadProducts(true);
  }, 350));

  sortSelect.addEventListener("change", () => {
    catalogState.sort = sortSelect.value;
    loadProducts(true);
  });

  categoryFilters.addEventListener("click", (event) => {
    const button = event.target.closest("[data-category]");
    if (!button) return;
    catalogState.category = button.dataset.category;
    updateCategoryButtons();
    loadProducts(true);
  });

  categoryGrid.addEventListener("click", (event) => {
    const button = event.target.closest("[data-category-jump]");
    if (!button) return;
    catalogState.category = button.dataset.categoryJump;
    updateCategoryButtons();
    loadProducts(true);
    document.querySelector("#catalogo").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  productGrid.addEventListener("click", (event) => {
    const waButton = event.target.closest("[data-wa]");
    if (waButton) {
      const product = catalogState.products.get(waButton.dataset.wa);
      if (!product) return;
      BC.setFloatingProduct(product);
      window.open(BC.whatsappUrl(product), "_blank", "noopener");
      return;
    }

    const fbButton = event.target.closest("[data-share-fb]");
    if (fbButton) {
      const product = catalogState.products.get(fbButton.dataset.shareFb);
      if (product) BC.openShareBlast(product);
      return;
    }

    const groupButton = event.target.closest("[data-share-groups]");
    if (groupButton) {
      const product = catalogState.products.get(groupButton.dataset.shareGroups);
      if (product) BC.openShareBlast(product);
    }
  });

  reset.addEventListener("click", resetCatalog);

  loadMore.addEventListener("click", () => {
    BC.setLoading(loadMore, true, "Cargando...");
    loadProducts(false);
  });

  init();
});
