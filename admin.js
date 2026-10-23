document.addEventListener("DOMContentLoaded", () => {
  const loginPanel = document.querySelector("#admin-login");
  const dashboard = document.querySelector("#admin-dashboard");
  const loginForm = document.querySelector("#admin-login-form");
  let admin = null;
  let adminProducts = [];
  let meta = null;
  let publishImageDataUrl = "";
  let editImageDataUrl = "";
  let editingProduct = null;
  let aiBusy = false;

  async function init() {
    try {
      const data = await BC.api("/api/auth/me");
      if (data.user?.role === "admin") {
        admin = data.user;
        showDashboard();
        await loadMeta();
        await loadDashboard();
      } else {
        showLogin();
      }
    } catch {
      showLogin();
    }
  }

  function showLogin() {
    loginPanel.hidden = false;
    dashboard.hidden = true;
  }

  function showDashboard() {
    loginPanel.hidden = true;
    dashboard.hidden = false;
    document.title = "Administración | Bazar Los Cuates";
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = document.querySelector("#admin-login-submit");
    const errorBox = document.querySelector("#admin-login-error");
    const data = new FormData(loginForm);
    errorBox.hidden = true;
    BC.setLoading(submit, true, "Entrando...");

    try {
      const response = await BC.api("/api/auth/login", {
        method: "POST",
        body: {
          email: String(data.get("email") || "").trim(),
          password: String(data.get("password") || ""),
        },
      });
      if (response.user.role !== "admin") {
        throw new Error("Esta cuenta no tiene permisos de administración.");
      }
      admin = response.user;
      showDashboard();
      await loadMeta();
      await loadDashboard();
    } catch (error) {
      errorBox.textContent = error.message;
      errorBox.hidden = false;
    } finally {
      BC.setLoading(submit, false);
    }
  });

  document.querySelector("#admin-logout").addEventListener("click", async () => {
    try {
      await BC.api("/api/auth/logout", { method: "POST", body: {} });
    } catch {
      return;
    }
    admin = null;
    showLogin();
    BC.toast("Sesión cerrada.");
  });

  function fillSelects(selector, items, selected = "") {
    document.querySelectorAll(selector).forEach((select) => {
      select.innerHTML = items.map((item) => (
        `<option value="${BC.escapeHtml(item.value)}">${BC.escapeHtml(item.label)}</option>`
      )).join("");
      if (selected) select.value = selected;
    });
  }

  async function loadMeta() {
    if (meta) return;
    meta = await BC.api("/api/meta");
    fillSelects(
      "#admin-category, #admin-edit-category",
      meta.categories.map((item) => ({ value: item.key, label: item.label })),
    );
    fillSelects(
      "#admin-condition, #admin-edit-condition",
      meta.conditions.map((item) => ({ value: item, label: item })),
    );
    fillSelects(
      "#admin-city, #admin-edit-city",
      meta.nearbyCities.map((city) => ({ value: city, label: city })),
      "Jesús María",
    );
  }

  async function loadDashboard() {
    try {
      const [summary, products] = await Promise.all([
        BC.api("/api/admin/summary"),
        BC.api("/api/admin/products"),
      ]);
      adminProducts = products.products;
      renderSummary(summary.summary);
      renderProducts(products.products.filter((product) => product.status !== "sold"));
      renderSold(products.products.filter((product) => product.status === "sold"));
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        showLogin();
        return;
      }
      BC.toast(error.message, "error");
    }
  }

  function renderSummary(summary) {
    document.querySelector("#admin-summary").innerHTML = [
      summaryCard("Productos activos", summary.activeProducts, "Visibles en el catálogo"),
      summaryCard("Pausados", summary.pausedProducts, "Fuera de la tienda"),
      summaryCard("Vendidos", summary.soldProducts, "Guardados en historial"),
      summaryCard("Total", summary.totalProducts, "Publicaciones creadas"),
    ].join("");
  }

  function summaryCard(label, value, note) {
    return `
      <article class="summary-card">
        <small>${BC.escapeHtml(label)}</small>
        <strong>${BC.escapeHtml(String(value))}</strong>
        <span>${BC.escapeHtml(note)}</span>
      </article>
    `;
  }

  function renderProducts(products) {
    const container = document.querySelector("#admin-products");
    if (!products.length) {
      container.innerHTML = BC.emptyState(
        "Sin productos",
        "Publica tu primera pieza con el botón de arriba. Aquí podrás editarla, compartirla o bajarla.",
      );
      return;
    }
    container.innerHTML = `<div class="admin-product-grid">${products.map((product) => adminProductCard(product)).join("")}</div>`;
  }

  function renderSold(products) {
    const container = document.querySelector("#admin-sold");
    if (!products.length) {
      container.innerHTML = BC.emptyState(
        "Historial vacío",
        "Cuando marques una pieza como vendida, quedará guardada aquí con su sello VENDIDO.",
      );
      return;
    }
    container.innerHTML = `<div class="admin-product-grid">${products.map((product) => adminProductCard(product, true)).join("")}</div>`;
  }

  function adminProductCard(product, sold = false) {
    const republish = product.status === "paused" || product.status === "suspended";
    return `
      <article class="admin-product-card ${sold ? "is-sold" : ""}">
        <div class="admin-product-photo">
          <img src="${BC.escapeHtml(product.imageUrl)}" alt="${BC.escapeHtml(product.title)}" loading="lazy">
          ${sold ? `
            <span class="sold-cross" aria-hidden="true">×</span>
            <span class="sold-stamp">VENDIDO</span>
          ` : ""}
          <span class="admin-photo-status">${BC.statusPill(product.status)}</span>
        </div>
        <div class="admin-product-body">
          <div class="admin-product-head">
            <h3>${BC.escapeHtml(product.title)}</h3>
            <strong>${BC.money(product.priceCents)}</strong>
          </div>
          <p>${BC.escapeHtml(product.city)}, ${BC.escapeHtml(product.state)} · ${BC.escapeHtml(product.categoryLabel)}</p>
          <div class="admin-product-meta">
            <span>${BC.escapeHtml(product.condition)}</span>
            <span>${BC.formatDate(product.createdAt)}</span>
          </div>
          <div class="admin-product-actions">
            ${sold ? `
              <button class="btn btn-small btn-outline" type="button" data-admin-product="${product.id}" data-admin-product-status="active">Volver a publicar</button>
            ` : `
              ${republish ? `
                <button class="btn btn-small btn-primary" type="button" data-admin-product="${product.id}" data-admin-product-status="active">Publicar de nuevo</button>
              ` : `
                <button class="btn admin-sold-button" type="button" data-admin-product="${product.id}" data-admin-product-status="sold">MARCAR COMO VENDIDO</button>
              `}
              <button class="btn btn-small btn-outline" type="button" data-admin-edit="${product.id}">Editar</button>
              <a class="btn btn-small btn-outline" href="producto.html?id=${encodeURIComponent(product.publicId)}" target="_blank" rel="noopener">Ver</a>
              <button class="btn btn-small btn-outline" type="button" data-admin-share="${BC.escapeHtml(product.publicId)}">Compartir</button>
            `}
            ${sold ? "" : `<button class="admin-remove-button" type="button" data-admin-delete="${product.id}" aria-label="Eliminar ${BC.escapeHtml(product.title)}" title="Eliminar del catálogo">×</button>`}
          </div>
        </div>
      </article>
    `;
  }

  function switchTab(name) {
    document.querySelectorAll("[data-admin-tab]").forEach((button) => {
      const active = button.dataset.adminTab === name;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
    });
    document.querySelectorAll("[data-admin-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.adminPanel !== name;
    });
    if (name === "publish") {
      document.querySelector("[data-admin-panel='publish']").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  document.querySelectorAll("[data-admin-tab]").forEach((button) => {
    button.addEventListener("click", () => switchTab(button.dataset.adminTab));
  });

  document.addEventListener("click", (event) => {
    const publishShortcut = event.target.closest("[data-admin-goto-publish]");
    if (publishShortcut) {
      switchTab("publish");
      return;
    }

    const productButton = event.target.closest("[data-admin-product]");
    if (productButton) {
      updateProduct(productButton);
      return;
    }

    const editButton = event.target.closest("[data-admin-edit]");
    if (editButton) {
      const product = adminProducts.find((item) => item.id === Number(editButton.dataset.adminEdit));
      if (product) openEdit(product);
      return;
    }

    const deleteButton = event.target.closest("[data-admin-delete]");
    if (deleteButton) {
      removeProduct(deleteButton);
      return;
    }

    const shareButton = event.target.closest("[data-admin-share]");
    if (shareButton) {
      const product = adminProducts.find((item) => item.publicId === shareButton.dataset.adminShare);
      if (product) BC.openShareBlast(product);
    }
  });

  async function updateProduct(button) {
    const status = button.dataset.adminProductStatus;
    if (status === "sold" && !window.confirm("¿Marcar esta pieza como VENDIDA? Se moverá al historial con el sello.")) {
      return;
    }
    button.disabled = true;
    try {
      await BC.api(`/api/admin/products/${button.dataset.adminProduct}`, {
        method: "PATCH",
        body: { status },
      });
      BC.toast(
        status === "sold"
          ? "Pieza marcada como vendida. Ya está en el historial."
          : "Publicación activada.",
      );
      await loadDashboard();
      switchTab(status === "sold" ? "sold" : "products");
    } catch (error) {
      BC.toast(error.message, "error");
      button.disabled = false;
    }
  }

  async function removeProduct(button) {
    if (!window.confirm("¿Eliminar esta publicación y su foto del catálogo? No se puede deshacer.")) return;
    button.disabled = true;
    try {
      await BC.api(`/api/admin/products/${button.dataset.adminDelete}`, { method: "DELETE" });
      BC.toast("Publicación eliminada.");
      await loadDashboard();
    } catch (error) {
      BC.toast(error.message, "error");
      button.disabled = false;
    }
  }

  const publishForm = document.querySelector("#admin-publish-form");
  const imageInput = document.querySelector("#admin-image");
  const imagePreview = document.querySelector("#admin-image-preview");
  const publishError = document.querySelector("#admin-publish-error");
  const aiButton = document.querySelector("#admin-ai-suggest");
  const aiStatus = document.querySelector("#admin-ai-status");

  function setAiStatus(message, isError = false) {
    aiStatus.textContent = message;
    aiStatus.hidden = !message;
    aiStatus.classList.toggle("is-error", isError);
  }

  async function requestAiSuggestion({ auto = false } = {}) {
    if (aiBusy) return;
    if (!publishImageDataUrl) {
      if (!auto) setAiStatus("Primero sube una foto.", true);
      return;
    }

    const titleInput = publishForm.elements.title;
    const descriptionInput = publishForm.elements.description;
    const priceValue = Number(publishForm.elements.price.value) || 0;
    if (!auto && (titleInput.value.trim() || descriptionInput.value.trim())) {
      if (!window.confirm("La IA reemplazará el título y la descripción actuales. ¿Continuar?")) return;
    }

    aiBusy = true;
    setAiStatus("Analizando la foto...");
    BC.setLoading(aiButton, true, "Sugiriendo...");
    try {
      const data = await BC.api("/api/admin/ai/suggest", {
        method: "POST",
        body: {
          imageDataUrl: publishImageDataUrl,
          title: titleInput.value.trim(),
          category: publishForm.elements.category.value,
          condition: publishForm.elements.condition.value,
          price: priceValue,
          filename: imageInput.files[0]?.name || "",
        },
      });
      const suggestion = data.suggestion;
      if (!auto || !titleInput.value.trim()) titleInput.value = suggestion.title;
      if (!auto || !descriptionInput.value.trim()) descriptionInput.value = suggestion.description;
      const source = suggestion.source === "deepseek" ? "DeepSeek" : "Sugerencia local";
      setAiStatus(`${source}: ${suggestion.notice || "Revisa y ajusta antes de publicar."}`);
      if (!auto) BC.toast("Sugerencia aplicada. Revísala antes de publicar.");
    } catch (error) {
      setAiStatus(error.message, true);
      if (!auto) BC.toast(error.message, "error");
    } finally {
      aiBusy = false;
      BC.setLoading(aiButton, false);
    }
  }

  aiButton.addEventListener("click", () => requestAiSuggestion());

  imageInput.addEventListener("change", async () => {
    const file = imageInput.files[0];
    publishImageDataUrl = "";
    imagePreview.hidden = true;
    if (!file) return;
    try {
      publishImageDataUrl = await BC.compressImage(file);
      imagePreview.querySelector("img").src = publishImageDataUrl;
      imagePreview.hidden = false;
      setAiStatus("");
      await requestAiSuggestion({ auto: true });
    } catch (error) {
      imageInput.value = "";
      BC.toast(error.message, "error");
    }
  });

  function validateForm(data) {
    const title = String(data.get("title") || "").trim();
    const description = String(data.get("description") || "").trim();
    const price = Number(data.get("price"));
    if (title.length < 6) return { error: "El título debe tener al menos 6 caracteres." };
    if (description.length < 20) return { error: "La descripción debe tener al menos 20 caracteres." };
    if (!Number.isFinite(price) || price < 1) return { error: "Escribe un precio válido." };
    if (BC.findContactLeak(`${title} ${description}`)) {
      return { error: "No incluyas teléfonos, WhatsApp, redes ni enlaces en la publicación." };
    }
    return {
      title,
      description,
      price,
      category: String(data.get("category")),
      condition: String(data.get("condition")),
      state: "Aguascalientes",
      city: String(data.get("city")),
    };
  }

  publishForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = document.querySelector("#admin-publish-submit");
    const data = new FormData(publishForm);
    const values = validateForm(data);
    publishError.hidden = true;

    if (values.error) return showPublishError(values.error);
    if (!publishImageDataUrl) return showPublishError("Toma o elige una foto para la pieza.");

    BC.setLoading(submit, true, "Publicando...");
    try {
      await BC.api("/api/admin/products", {
        method: "POST",
        body: { ...values, imageDataUrl: publishImageDataUrl },
      });
      publishForm.reset();
      publishImageDataUrl = "";
      imagePreview.hidden = true;
      publishError.hidden = true;
      setAiStatus("");
      document.querySelector("#admin-city").value = "Jesús María";
      BC.toast("Producto publicado. Ya aparece en la tienda.");
      await loadDashboard();
      switchTab("products");
    } catch (error) {
      showPublishError(error.message);
    } finally {
      BC.setLoading(submit, false);
    }
  });

  function showPublishError(message) {
    publishError.textContent = message;
    publishError.hidden = false;
    BC.setLoading(document.querySelector("#admin-publish-submit"), false);
  }

  const editForm = document.querySelector("#admin-edit-form");
  const editImageInput = document.querySelector("#admin-edit-image");
  const editImagePreview = document.querySelector("#admin-edit-image-preview");
  const editError = document.querySelector("#admin-edit-error");

  function openEdit(product) {
    editingProduct = product;
    editImageDataUrl = "";
    editError.hidden = true;
    editForm.reset();
    editImageInput.value = "";
    editForm.elements.title.value = product.title;
    editForm.elements.price.value = (product.priceCents / 100).toFixed(0);
    editForm.elements.category.value = product.category;
    editForm.elements.condition.value = product.condition;
    editForm.elements.city.value = product.city;
    editForm.elements.description.value = product.description;
    editImagePreview.querySelector("img").src = product.imageUrl;
    BC.openDialog("admin-edit-modal");
  }

  editImageInput.addEventListener("change", async () => {
    const file = editImageInput.files[0];
    editImageDataUrl = "";
    if (!file) {
      if (editingProduct) editImagePreview.querySelector("img").src = editingProduct.imageUrl;
      return;
    }
    try {
      editImageDataUrl = await BC.compressImage(file);
      editImagePreview.querySelector("img").src = editImageDataUrl;
    } catch (error) {
      editImageInput.value = "";
      BC.toast(error.message, "error");
    }
  });

  editForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!editingProduct) return;
    const submit = document.querySelector("#admin-edit-submit");
    const data = new FormData(editForm);
    const values = validateForm(data);
    editError.hidden = true;
    if (values.error) return showEditError(values.error);

    BC.setLoading(submit, true, "Guardando...");
    try {
      await BC.api(`/api/admin/products/${editingProduct.id}`, {
        method: "PATCH",
        body: {
          ...values,
          ...(editImageDataUrl ? { imageDataUrl: editImageDataUrl } : {}),
        },
      });
      BC.closeDialog("admin-edit-modal");
      editingProduct = null;
      editImageDataUrl = "";
      BC.toast("Producto actualizado.");
      await loadDashboard();
    } catch (error) {
      showEditError(error.message);
    } finally {
      BC.setLoading(submit, false);
    }
  });

  function showEditError(message) {
    editError.textContent = message;
    editError.hidden = false;
    BC.setLoading(document.querySelector("#admin-edit-submit"), false);
  }

  init();
});
