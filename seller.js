document.addEventListener("DOMContentLoaded", () => {
  const authPanel = document.querySelector("#seller-auth");
  const dashboard = document.querySelector("#seller-dashboard");
  const loginForm = document.querySelector("#login-form");
  const registerForm = document.querySelector("#register-form");
  const tabLogin = document.querySelector("#tab-login");
  const tabRegister = document.querySelector("#tab-register");
  const productForm = document.querySelector("#product-form");
  const productError = document.querySelector("#product-error");
  const imageInput = document.querySelector("#product-image");
  const imagePreview = document.querySelector("#image-preview");
  const offerModal = document.querySelector("#seller-offer-modal");

  let currentUser = null;
  let meta = null;
  let currentOffer = null;
  let imageDataUrl = "";

  async function init() {
    try {
      const data = await BC.api("/api/auth/me");
      currentUser = data.user;
      if (currentUser?.role === "admin") {
        window.location.href = "admin.html";
        return;
      }
      if (currentUser?.role === "seller") {
        showDashboard();
        await loadMeta();
        await loadDashboard();
      } else {
        showAuth();
      }
    } catch {
      showAuth();
    }
  }

  function showAuth() {
    authPanel.hidden = false;
    dashboard.hidden = true;
    if (window.location.hash === "#registro") {
      setAuthTab("register");
    }
  }

  function showDashboard() {
    authPanel.hidden = true;
    dashboard.hidden = false;
    document.querySelector("#seller-greeting").textContent = `Hola, ${currentUser.name.split(" ")[0]}`;
    document.title = "Mi panel | Bazar Los Cuates";
  }

  function setAuthTab(tab) {
    const register = tab === "register";
    tabLogin.classList.toggle("is-active", !register);
    tabRegister.classList.toggle("is-active", register);
    tabLogin.setAttribute("aria-selected", String(!register));
    tabRegister.setAttribute("aria-selected", String(register));
    loginForm.hidden = register;
    registerForm.hidden = !register;
    document.querySelector("#login-error").hidden = true;
    document.querySelector("#register-error").hidden = true;
  }

  tabLogin.addEventListener("click", () => setAuthTab("login"));
  tabRegister.addEventListener("click", () => setAuthTab("register"));

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = document.querySelector("#login-submit");
    const errorBox = document.querySelector("#login-error");
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
      if (response.user.role === "admin") {
        window.location.href = "admin.html";
        return;
      }
      currentUser = response.user;
      BC.toast("Bienvenido de nuevo.");
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

  registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = document.querySelector("#register-submit");
    const errorBox = document.querySelector("#register-error");
    const data = new FormData(registerForm);
    errorBox.hidden = true;

    if (!data.get("terms")) {
      errorBox.textContent = "Debes aceptar la comisión del 10% para crear tu cuenta.";
      errorBox.hidden = false;
      return;
    }

    BC.setLoading(submit, true, "Creando cuenta...");
    try {
      const response = await BC.api("/api/auth/register", {
        method: "POST",
        body: {
          name: String(data.get("name") || "").trim(),
          email: String(data.get("email") || "").trim(),
          phone: String(data.get("phone") || "").trim(),
          password: String(data.get("password") || ""),
        },
      });
      currentUser = response.user;
      BC.toast("Cuenta creada. Ya puedes publicar.");
      showDashboard();
      await loadMeta();
      await loadDashboard();
      switchTab("publish");
    } catch (error) {
      errorBox.textContent = error.message;
      errorBox.hidden = false;
    } finally {
      BC.setLoading(submit, false);
    }
  });

  document.querySelector("#logout-button").addEventListener("click", async () => {
    try {
      await BC.api("/api/auth/logout", { method: "POST", body: {} });
    } catch {
      return;
    }
    currentUser = null;
    showAuth();
    setAuthTab("login");
    BC.toast("Sesión cerrada.");
  });

  async function loadMeta() {
    if (meta) return;
    meta = await BC.api("/api/meta");
    const categorySelect = document.querySelector("#product-category");
    const conditionSelect = document.querySelector("#product-condition");
    const stateSelect = document.querySelector("#product-state");

    categorySelect.innerHTML = meta.categories.map((item) => (
      `<option value="${BC.escapeHtml(item.key)}">${BC.escapeHtml(item.label)}</option>`
    )).join("");
    conditionSelect.innerHTML = meta.conditions.map((item) => (
      `<option value="${BC.escapeHtml(item)}">${BC.escapeHtml(item)}</option>`
    )).join("");
    stateSelect.innerHTML = `<option value="">Selecciona un estado</option>${meta.states.map((item) => (
      `<option value="${BC.escapeHtml(item)}">${BC.escapeHtml(item)}</option>`
    )).join("")}`;

    stateSelect.addEventListener("change", updateCityOptions);
    updateCityOptions();
  }

  function updateCityOptions() {
    const selectedState = document.querySelector("#product-state").value;
    const cities = meta.cities
      .filter((item) => !selectedState || item.state === selectedState)
      .map((item) => item.city);
    document.querySelector("#city-options").innerHTML = [...new Set(cities)]
      .map((city) => `<option value="${BC.escapeHtml(city)}"></option>`)
      .join("");
  }

  async function loadDashboard() {
    try {
      const [summaryData, productsData, offersData, salesData] = await Promise.all([
        BC.api("/api/seller/summary"),
        BC.api("/api/seller/products"),
        BC.api("/api/seller/offers"),
        BC.api("/api/seller/sales"),
      ]);
      renderSummary(summaryData.summary);
      renderProducts(productsData.products);
      renderOffers(offersData.offers);
      renderSales(salesData.sales);
    } catch (error) {
      BC.toast(error.message, "error");
    }
  }

  function renderSummary(summary) {
    document.querySelector("#seller-summary").innerHTML = [
      summaryCard("Publicaciones", summary.products, `${summary.activeProducts} activas`),
      summaryCard("Ofertas pendientes", summary.pendingOffers, "Por responder"),
      summaryCard("Ventas cerradas", summary.sales, "Tratos aceptados"),
      summaryCard("Comisión pendiente", BC.money(summary.commissionPendingCents), `${BC.money(summary.commissionPaidCents)} pagada`),
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
    const container = document.querySelector("#seller-products-list");
    if (!products.length) {
      container.innerHTML = BC.emptyState(
        "Aún no tienes publicaciones",
        "Publica tu primera pieza y empieza a recibir ofertas.",
        '<button class="btn btn-primary" type="button" data-goto-publish>Publicar producto</button>',
      );
      return;
    }

    container.innerHTML = products.map((product) => {
      const canToggle = product.status === "active" || product.status === "paused";
      const nextStatus = product.status === "active" ? "paused" : "active";
      return `
        <article class="seller-product-row">
          <img src="${BC.escapeHtml(product.imageUrl)}" alt="${BC.escapeHtml(product.title)}" loading="lazy">
          <div class="seller-product-main">
            <div class="seller-row-top">
              ${BC.statusPill(product.status)}
              <span>${product.totalOffers} ${product.totalOffers === 1 ? "oferta" : "ofertas"}</span>
            </div>
            <h3>${BC.escapeHtml(product.title)}</h3>
            <p>${BC.escapeHtml(product.city)}, ${BC.escapeHtml(product.state)} · ${BC.escapeHtml(product.condition)}</p>
          </div>
          <div class="seller-product-price">
            <strong>${BC.money(product.priceCents)}</strong>
            <span>${product.pendingOffers} pendientes</span>
          </div>
          <div class="seller-row-actions">
            ${product.status !== "sold" ? `<a class="btn btn-small btn-outline" href="producto.html?id=${encodeURIComponent(product.publicId)}" target="_blank" rel="noopener">Ver</a>` : ""}
            ${canToggle ? `<button class="btn btn-small btn-outline" type="button" data-product-toggle="${product.id}" data-product-status="${nextStatus}">${nextStatus === "paused" ? "Pausar" : "Activar"}</button>` : ""}
          </div>
        </article>
      `;
    }).join("");
  }

  function renderOffers(offers) {
    const container = document.querySelector("#seller-offers-list");
    if (!offers.length) {
      container.innerHTML = BC.emptyState(
        "Todavía no hay ofertas",
        "Cuando alguien oferte por una de tus piezas, aparecerá aquí para que puedas negociar.",
      );
      return;
    }

    container.innerHTML = offers.map((offer) => `
      <article class="seller-offer-row">
        <img src="${BC.escapeHtml(offer.product.imageUrl)}" alt="${BC.escapeHtml(offer.product.title)}" loading="lazy">
        <div class="seller-offer-main">
          <div class="seller-row-top">
            ${BC.statusPill(offer.status)}
            <span>${BC.formatDate(offer.updatedAt, true)}</span>
          </div>
          <h3>${BC.escapeHtml(offer.product.title)}</h3>
          <p>Comprador: ${BC.escapeHtml(offer.buyer.name)} · Contacto privado: ${BC.escapeHtml(offer.buyer.contact)}</p>
        </div>
        <div class="seller-offer-amount">
          <small>Oferta actual</small>
          <strong>${BC.money(offer.currentCents)}</strong>
          <span>Precio: ${BC.money(offer.product.priceCents)}</span>
        </div>
        <button class="btn btn-small btn-primary" type="button" data-open-offer="${BC.escapeHtml(offer.publicId)}">Negociar</button>
      </article>
    `).join("");
  }

  function renderSales(sales) {
    const container = document.querySelector("#seller-sales-list");
    if (!sales.length) {
      container.innerHTML = BC.emptyState(
        "Sin ventas cerradas",
        "Cuando aceptes una oferta, la venta y la comisión del 10% aparecerán aquí.",
      );
      return;
    }

    container.innerHTML = `
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Producto</th>
              <th>Comprador</th>
              <th>Venta</th>
              <th>Comisión 10%</th>
              <th>Estado</th>
              <th>Fecha</th>
            </tr>
          </thead>
          <tbody>
            ${sales.map((sale) => `
              <tr>
                <td><strong>${BC.escapeHtml(sale.product.title)}</strong></td>
                <td>${BC.escapeHtml(sale.buyer.name)}<br><small>${BC.escapeHtml(sale.buyer.contact)}</small></td>
                <td>${BC.money(sale.amountCents)}</td>
                <td>${BC.money(sale.commissionCents)}</td>
                <td>${BC.statusPill(sale.status)}</td>
                <td>${BC.formatDate(sale.createdAt)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function switchTab(name) {
    document.querySelectorAll("[data-seller-tab]").forEach((button) => {
      const active = button.dataset.sellerTab === name;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
    });
    document.querySelectorAll("[data-seller-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.sellerPanel !== name;
    });
    if (name === "publish") {
      document.querySelector("[data-seller-panel='publish']").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  document.querySelectorAll("[data-seller-tab]").forEach((button) => {
    button.addEventListener("click", () => switchTab(button.dataset.sellerTab));
  });

  document.addEventListener("click", (event) => {
    const publishButton = event.target.closest("[data-goto-publish]");
    if (publishButton) {
      switchTab("publish");
      return;
    }

    const openOfferButton = event.target.closest("[data-open-offer]");
    if (openOfferButton) {
      openOffer(openOfferButton.dataset.openOffer);
      return;
    }

    const toggleButton = event.target.closest("[data-product-toggle]");
    if (toggleButton) {
      toggleProduct(toggleButton);
    }
  });

  async function toggleProduct(button) {
    button.disabled = true;
    try {
      await BC.api(`/api/seller/products/${button.dataset.productToggle}`, {
        method: "PATCH",
        body: { status: button.dataset.productStatus },
      });
      BC.toast(button.dataset.productStatus === "paused" ? "Publicación pausada." : "Publicación activada.");
      await loadDashboard();
    } catch (error) {
      BC.toast(error.message, "error");
      button.disabled = false;
    }
  }

  imageInput.addEventListener("change", async () => {
    const file = imageInput.files[0];
    imageDataUrl = "";
    imagePreview.hidden = true;
    if (!file) return;

    try {
      imageDataUrl = await BC.compressImage(file);
      imagePreview.querySelector("img").src = imageDataUrl;
      imagePreview.hidden = false;
    } catch (error) {
      imageInput.value = "";
      BC.toast(error.message, "error");
    }
  });

  productForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = document.querySelector("#product-submit");
    const data = new FormData(productForm);
    const title = String(data.get("title") || "").trim();
    const description = String(data.get("description") || "").trim();
    const price = Number(data.get("price"));
    productError.hidden = true;

    if (!imageDataUrl) {
      return showProductError("Selecciona y procesa una foto para el producto.");
    }
    if (title.length < 6) {
      return showProductError("El título debe tener al menos 6 caracteres.");
    }
    if (description.length < 20) {
      return showProductError("La descripción debe tener al menos 20 caracteres.");
    }
    if (!Number.isFinite(price) || price < 1) {
      return showProductError("Escribe un precio válido.");
    }
    if (BC.findContactLeak(`${title} ${description}`)) {
      return showProductError("No incluyas teléfonos, WhatsApp, redes ni enlaces en la publicación.");
    }

    BC.setLoading(submit, true, "Publicando...");
    try {
      await BC.api("/api/seller/products", {
        method: "POST",
        body: {
          title,
          description,
          price,
          category: String(data.get("category")),
          condition: String(data.get("condition")),
          state: String(data.get("state")),
          city: String(data.get("city")).trim(),
          imageDataUrl,
        },
      });
      productForm.reset();
      imageDataUrl = "";
      imagePreview.hidden = true;
      productError.hidden = true;
      BC.toast("Producto publicado.");
      await loadDashboard();
      switchTab("products");
    } catch (error) {
      showProductError(error.message);
    } finally {
      BC.setLoading(submit, false);
    }
  });

  function showProductError(message) {
    productError.textContent = message;
    productError.hidden = false;
    BC.setLoading(document.querySelector("#product-submit"), false);
  }

  async function openOffer(publicOfferId) {
    try {
      const data = await BC.api(`/api/seller/offers/${encodeURIComponent(publicOfferId)}`);
      currentOffer = data.offer;
      renderOfferModal(currentOffer);
      BC.openDialog("seller-offer-modal");
    } catch (error) {
      BC.toast(error.message, "error");
    }
  }

  function renderOfferModal(offer) {
    const accepted = offer.status === "accepted";
    const pending = offer.status === "pending";
    const buyerTurn = offer.lastActor === "buyer";
    const commission = Math.round(offer.currentCents * 0.1);

    document.querySelector("#seller-offer-content").innerHTML = `
      <div class="offer-product-preview">
        <img src="${BC.escapeHtml(offer.product.imageUrl)}" alt="${BC.escapeHtml(offer.product.title)}">
        <span>
          <strong>${BC.escapeHtml(offer.product.title)}</strong>
          <small>${BC.escapeHtml(offer.product.city)}, ${BC.escapeHtml(offer.product.state)} · ${BC.escapeHtml(offer.product.condition)}</small>
          <b>Precio publicado: ${BC.money(offer.product.priceCents)}</b>
        </span>
        ${BC.statusPill(offer.status)}
      </div>

      <div class="offer-contact-grid">
        <div><small>Comprador</small><strong>${BC.escapeHtml(offer.buyer.name)}</strong></div>
        <div><small>Contacto privado</small><strong>${BC.escapeHtml(offer.buyer.contact)}</strong></div>
        <div><small>Oferta actual</small><strong>${BC.money(offer.currentCents)}</strong></div>
        <div><small>Comisión 10%</small><strong>${BC.money(commission)}</strong></div>
      </div>

      <div class="negotiation-thread">
        ${offer.events.map(renderEvent).join("")}
      </div>

      ${accepted ? `
        <div class="deal-closed">
          <strong>Trato cerrado</strong>
          <p>La comisión de ${BC.money(commission)} quedó registrada en tu panel de ventas.</p>
        </div>
      ` : ""}

      ${pending && buyerTurn ? `
        <div class="negotiation-actions">
          <form id="seller-counter-form" class="counter-form">
            <label>
              <span>Contraoferta MXN</span>
              <input name="amount" type="number" min="1" max="1000000" step="1" value="${(offer.currentCents / 100).toFixed(0)}" required>
            </label>
            <label>
              <span>Mensaje <small>(opcional)</small></span>
              <textarea name="message" rows="2" maxlength="600" placeholder="Puedo dejarlo en..."></textarea>
            </label>
            <p class="privacy-note">No incluyas teléfonos, WhatsApp ni enlaces antes de cerrar el trato.</p>
            <p class="form-error" id="seller-action-error" hidden></p>
            <div class="decision-row">
              <button class="btn btn-primary" type="submit" id="seller-counter-submit">Contraofertar</button>
              <button class="btn btn-wa" type="button" data-offer-decision="accept">Aceptar oferta</button>
              <button class="btn btn-outline" type="button" data-offer-decision="reject">Rechazar</button>
            </div>
          </form>
        </div>
      ` : ""}

      ${pending && !buyerTurn ? `
        <div class="waiting-note">
          Esperando la respuesta del comprador a tu contraoferta de ${BC.money(offer.currentCents)}.
        </div>
      ` : ""}
    `;

    const counterForm = document.querySelector("#seller-counter-form");
    if (counterForm) {
      counterForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const data = new FormData(counterForm);
        const message = String(data.get("message") || "").trim();
        if (message && BC.findContactLeak(message)) {
          showSellerActionError("No incluyas teléfonos, WhatsApp ni enlaces en el mensaje.");
          return;
        }
        submitOfferAction("counter", counterForm, {
          amount: Number(data.get("amount")),
          message,
        });
      });
    }

    document.querySelectorAll("[data-offer-decision]").forEach((button) => {
      button.addEventListener("click", () => {
        const decision = button.dataset.offerDecision;
        if (decision === "accept" && !window.confirm("¿Aceptar esta oferta y cerrar la venta?")) {
          return;
        }
        submitOfferAction(decision, button, {});
      });
    });
  }

  function renderEvent(event) {
    const actorLabel = event.actor === "seller" ? "Tú" : event.actor === "buyer" ? "Comprador" : "Sistema";
    const typeLabels = {
      offer: "Oferta inicial",
      counter: "Contraoferta",
      accepted: "Trato aceptado",
      rejected: "Oferta rechazada",
    };
    return `
      <article class="negotiation-event event-${BC.escapeHtml(event.actor)}">
        <span class="event-dot" aria-hidden="true"></span>
        <div>
          <div class="event-head">
            <strong>${actorLabel}</strong>
            <span>${BC.escapeHtml(typeLabels[event.type] || event.type)} · ${BC.formatDate(event.createdAt, true)}</span>
          </div>
          ${event.amountCents ? `<b>${BC.money(event.amountCents)}</b>` : ""}
          ${event.message ? `<p>${BC.escapeHtml(event.message)}</p>` : ""}
        </div>
      </article>
    `;
  }

  async function submitOfferAction(action, button, payload) {
    if (!currentOffer) return;
    const errorBox = document.querySelector("#seller-action-error");
    if (errorBox) errorBox.hidden = true;
    BC.setLoading(button, true, action === "accept" ? "Aceptando..." : action === "reject" ? "Rechazando..." : "Enviando...");

    try {
      const response = await BC.api(`/api/seller/offers/${encodeURIComponent(currentOffer.publicId)}/actions`, {
        method: "POST",
        body: { action, ...payload },
      });
      currentOffer = response.offer;
      renderOfferModal(currentOffer);
      await loadDashboard();
      BC.toast(action === "accept" ? "Venta cerrada. Comisión registrada." : action === "reject" ? "Oferta rechazada." : "Contraoferta enviada.");
    } catch (error) {
      if (errorBox) {
        showSellerActionError(error.message);
      } else {
        BC.toast(error.message, "error");
      }
      BC.setLoading(button, false);
    }
  }

  function showSellerActionError(message) {
    const errorBox = document.querySelector("#seller-action-error");
    if (!errorBox) {
      BC.toast(message, "error");
      return;
    }
    errorBox.textContent = message;
    errorBox.hidden = false;
    document.querySelectorAll("#seller-counter-submit, [data-offer-decision]").forEach((button) => {
      BC.setLoading(button, false);
    });
  }

  init();
});
