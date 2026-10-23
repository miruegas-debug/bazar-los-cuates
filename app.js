const BC = (() => {
  const WHATSAPP_NUMBER = "524491883244";
  const PHONE_NUMBER = "+524491883244";
  const ADDRESS = "Av. Constitución 216, CP 20922, Jesús María, Aguascalientes";
  let currentProduct = null;

  const moneyFormatter = new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  });

  class ApiError extends Error {
    constructor(message, status) {
      super(message);
      this.status = status;
    }
  }

  async function api(path, options = {}) {
    const fetchOptions = {
      method: options.method || "GET",
      credentials: "same-origin",
      headers: { ...(options.headers || {}) },
    };

    if (options.body !== undefined) {
      fetchOptions.headers["Content-Type"] = "application/json";
      fetchOptions.body = JSON.stringify(options.body);
    }

    let response;
    try {
      response = await fetch(path, fetchOptions);
    } catch {
      throw new ApiError("No pudimos conectar con el servidor.", 0);
    }

    let data = {};
    try {
      data = await response.json();
    } catch {
      data = {};
    }

    if (!response.ok) {
      throw new ApiError(data.error || "No pudimos completar la operación.", response.status);
    }

    return data;
  }

  function money(cents) {
    return moneyFormatter.format(Number(cents || 0) / 100);
  }

  function formatDate(value, withTime = false) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat("es-MX", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    }).format(date);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function normalizeText(value) {
    return String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  function findContactLeak(value) {
    const text = normalizeText(value);
    const contactWords = /(whats\s*app|whatsapp|wasap|guasap|wsp|wa\.me|telegram|telefono|celular|llamadas|llamar|marcar|\btel\b|contacto directo|instagram|facebook)/i;
    const digitSequence = /(?:\+?\d[\s().-]*){7,}/;
    const linkPattern = /(https?:\/\/|www\.|[a-z0-9-]+\.(com|mx|net|org)\b)/i;
    return contactWords.test(text) || digitSequence.test(text) || linkPattern.test(text);
  }

  function statusLabel(status) {
    const labels = {
      active: "Activo",
      paused: "Pausado",
      sold: "Vendido",
      suspended: "Suspendido",
      pending: "Pendiente",
      accepted: "Aceptada",
      rejected: "Rechazada",
      paid: "Pagada",
    };
    return labels[status] || status;
  }

  function statusPill(status) {
    return `<span class="status-pill status-${escapeHtml(status)}">${escapeHtml(statusLabel(status))}</span>`;
  }

  function commissionStatusLabel(status) {
    const labels = {
      pending: "Pendiente de comisión",
      paid: "Comisión recibida",
    };
    return labels[status] || status;
  }

  function commissionPill(status) {
    const safeStatus = status === "paid" ? "paid" : "pending";
    return `<span class="status-pill status-${safeStatus}">${escapeHtml(commissionStatusLabel(safeStatus))}</span>`;
  }

  function getQuery(name) {
    return new URLSearchParams(window.location.search).get(name) || "";
  }

  function toast(message, type = "success") {
    let container = document.querySelector(".toast-stack");
    if (!container) {
      container = document.createElement("div");
      container.className = "toast-stack";
      container.setAttribute("aria-live", "polite");
      document.body.appendChild(container);
    }

    const element = document.createElement("div");
    element.className = `toast toast-${type}`;
    element.textContent = message;
    container.appendChild(element);
    window.setTimeout(() => element.classList.add("is-visible"), 20);
    window.setTimeout(() => {
      element.classList.remove("is-visible");
      window.setTimeout(() => element.remove(), 250);
    }, 4200);
  }

  function setLoading(button, loading, label) {
    if (!button) return;
    if (loading) {
      button.dataset.originalLabel = button.innerHTML;
      button.disabled = true;
      button.innerHTML = `<span class="spinner" aria-hidden="true"></span>${escapeHtml(label || "Procesando...")}`;
    } else {
      button.disabled = false;
      if (button.dataset.originalLabel) {
        button.innerHTML = button.dataset.originalLabel;
        delete button.dataset.originalLabel;
      }
    }
  }

  function openDialog(id) {
    const dialog = document.getElementById(id);
    if (!dialog) return;
    dialog.hidden = false;
    document.body.classList.add("modal-open");
    const focusable = dialog.querySelector("input, select, textarea, button");
    if (focusable) window.setTimeout(() => focusable.focus(), 40);
  }

  function closeDialog(id) {
    const dialog = document.getElementById(id);
    if (!dialog) return;
    dialog.hidden = true;
    if (!document.querySelector(".modal:not([hidden])")) {
      document.body.classList.remove("modal-open");
    }
  }

  function initSiteAlert() {
    if (document.querySelector(".site-alert")) return;
    const alert = document.createElement("div");
    alert.className = "site-alert";
    alert.setAttribute("role", "note");
    alert.textContent = "⚠️ Entrega en Bazar Los Cuates, Av. Constitución 216, Jesús María. Pago en efectivo.";
    document.body.prepend(alert);

    const updateHeight = () => {
      document.documentElement.style.setProperty("--alert-height", `${alert.offsetHeight}px`);
    };
    updateHeight();
    window.addEventListener("resize", updateHeight, { passive: true });
    if (document.fonts?.ready) document.fonts.ready.then(updateHeight);
  }

  function initBusinessPopup() {
    const popup = document.getElementById("popup-negocio");
    if (!popup) return;

    const close = () => {
      popup.hidden = true;
    };

    popup.addEventListener("click", (event) => {
      if (event.target === popup || event.target.closest("[data-popup-close]")) {
        close();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !popup.hidden) close();
    });

    window.setTimeout(() => {
      popup.hidden = false;
    }, 2000);
  }

  function initFloatingContact() {
    const page = window.location.pathname.split("/").pop() || "index.html";
    if (page === "admin.html" || document.querySelector("#floating-contact")) return;

    const widget = document.createElement("aside");
    widget.className = "floating-contact";
    widget.id = "floating-contact";
    widget.innerHTML = `
      <p>¿Te interesa algo? <strong>Mándame WhatsApp</strong></p>
      <div class="floating-contact-actions">
        <button class="floating-wa" type="button" data-floating-whatsapp aria-label="Contactar por WhatsApp">
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.6 14.2c-.2.7-1.4 1.3-2 1.4-.5.1-1.2.1-1.9-.1-.4-.1-1-.3-1.7-.6-3-1.3-5-4.4-5.1-4.6-.2-.2-1.3-1.7-1.3-3.2s.8-2.2 1.1-2.5c.3-.3.6-.4.8-.4h.6c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .6l-.5.7c-.2.2-.3.4-.1.7.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.4 2.4 1.5.3.1.5.1.7-.1l1-1.1c.2-.2.4-.2.6-.1l2 .9c.2.1.4.2.4.3.1.2.1.8-.1 1.5Z"/></svg>
          <span>WhatsApp</span>
        </button>
        <a class="floating-call" href="tel:${PHONE_NUMBER}" aria-label="Llamar a Bazar Los Cuates">
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.8a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.8 2.1Z"/></svg>
          <span>Llamar</span>
        </a>
      </div>
    `;
    document.body.appendChild(widget);

    widget.querySelector("[data-floating-whatsapp]").addEventListener("click", () => {
      if (currentProduct) {
        window.open(whatsappUrl(currentProduct), "_blank", "noopener");
        return;
      }
      window.open(whatsappUrl(null), "_blank", "noopener");
    });
  }

  function initDialogs() {
    document.addEventListener("click", (event) => {
      const close = event.target.closest("[data-close-modal]");
      if (!close) return;
      const dialog = close.closest(".modal");
      if (dialog) closeDialog(dialog.id);
    });

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      const open = document.querySelector(".modal:not([hidden])");
      if (open) closeDialog(open.id);
    });
  }

  function initHeader() {
    const header = document.querySelector("#site-header");
    const toggle = document.querySelector("#menu-toggle");
    const nav = document.querySelector("#main-nav");
    const year = document.querySelector("#year");

    if (year) year.textContent = new Date().getFullYear();

    if (header) {
      const onScroll = () => header.classList.toggle("is-scrolled", window.scrollY > 12);
      onScroll();
      window.addEventListener("scroll", onScroll, { passive: true });
    }

    if (!toggle || !nav) return;

    const close = () => {
      nav.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-label", "Abrir menú");
    };

    toggle.addEventListener("click", () => {
      const open = !nav.classList.contains("is-open");
      nav.classList.toggle("is-open", open);
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Cerrar menú" : "Abrir menú");
    });

    nav.querySelectorAll("a").forEach((link) => link.addEventListener("click", close));

    document.addEventListener("click", (event) => {
      if (!nav.contains(event.target) && !toggle.contains(event.target)) close();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") close();
    });
  }

  function saveOfferAccess(offerId, token) {
    const current = JSON.parse(localStorage.getItem("bc_offer_access") || "{}");
    current[offerId] = { token, savedAt: new Date().toISOString() };
    localStorage.setItem("bc_offer_access", JSON.stringify(current));
  }

  function getOfferAccess(offerId) {
    try {
      const current = JSON.parse(localStorage.getItem("bc_offer_access") || "{}");
      return current[offerId]?.token || "";
    } catch {
      return "";
    }
  }

  function offerUrl(offerId, token) {
    return `oferta.html?id=${encodeURIComponent(offerId)}&token=${encodeURIComponent(token)}`;
  }

  function productShareUrl(publicId) {
    return `${window.location.origin}/p/${encodeURIComponent(publicId)}`;
  }

  function shareText(product) {
    return `¡En venta en Bazar Los Cuates! ${product.title} - ${money(product.priceCents)} - Av. Constitución 216 - ¡Contáctame por WhatsApp!`;
  }

  function whatsappUrl(product) {
    const message = product
      ? `Hola, me interesa ${product.title} de Bazar Los Cuates. ¿Sigue disponible?\n${productShareUrl(product.publicId)}`
      : "Hola, vi el catálogo de Bazar Los Cuates y quiero más información.";
    return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
  }

  function setFloatingProduct(product) {
    currentProduct = product;
  }

  async function copyText(value) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      return false;
    }
  }

  function compressImage(file, maxDimension = 1400) {
    return new Promise((resolve, reject) => {
      if (!file || !file.type.startsWith("image/")) {
        reject(new Error("Selecciona una imagen válida."));
        return;
      }

      const reader = new FileReader();
      reader.onerror = () => reject(new Error("No pudimos leer la imagen."));
      reader.onload = () => {
        const image = new Image();
        image.onerror = () => reject(new Error("No pudimos procesar la imagen."));
        image.onload = () => {
          const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
          const width = Math.max(1, Math.round(image.width * scale));
          const height = Math.max(1, Math.round(image.height * scale));
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext("2d");
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, width, height);
          context.drawImage(image, 0, 0, width, height);

          let quality = 0.84;
          let dataUrl = canvas.toDataURL("image/jpeg", quality);
          while (dataUrl.length > 3.6 * 1024 * 1024 && quality > 0.4) {
            quality -= 0.1;
            dataUrl = canvas.toDataURL("image/jpeg", quality);
          }

          if (dataUrl.length > 4.2 * 1024 * 1024) {
            reject(new Error("La imagen es demasiado grande. Usa una foto más ligera."));
            return;
          }

          resolve(dataUrl);
        };
        image.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function debounce(callback, delay = 300) {
    let timeout;
    return (...args) => {
      window.clearTimeout(timeout);
      timeout = window.setTimeout(() => callback(...args), delay);
    };
  }

  function emptyState(title, text, actionHtml = "") {
    return `
      <div class="empty-state inline-empty">
        <span class="empty-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M8.5 11h5"/></svg>
        </span>
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(text)}</p>
        ${actionHtml}
      </div>
    `;
  }


  const DEFAULT_GROUP_CHIPS = ["Jesús María", "Aguascalientes"];
  const GROUP_STORAGE_KEY = "bc_fb_groups";
  let shareProduct = null;
  let shareChips = new Set(DEFAULT_GROUP_CHIPS);
  let shareSelected = new Set();

  function readGroups() {
    try {
      const rows = JSON.parse(localStorage.getItem(GROUP_STORAGE_KEY) || "[]");
      return Array.isArray(rows) ? rows.filter((row) => row && row.id && row.name && row.url) : [];
    } catch {
      return [];
    }
  }

  function writeGroups(groups) {
    localStorage.setItem(GROUP_STORAGE_KEY, JSON.stringify(groups));
  }

  function normalizeGroupText(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function editDistance(a, b) {
    const rows = Array.from({ length: a.length + 1 }, (_, index) => [index]);
    for (let column = 1; column <= b.length; column += 1) rows[0][column] = column;
    for (let row = 1; row <= a.length; row += 1) {
      for (let column = 1; column <= b.length; column += 1) {
        rows[row][column] = Math.min(
          rows[row - 1][column] + 1,
          rows[row][column - 1] + 1,
          rows[row - 1][column - 1] + (a[row - 1] === b[column - 1] ? 0 : 1),
        );
      }
    }
    return rows[a.length][b.length];
  }

  function fuzzyWordMatch(words, term) {
    return term.split(" ").filter(Boolean).every((part) => words.some((word) => {
      if (word.includes(part) || part.includes(word)) return true;
      const tolerance = part.length >= 5 ? 2 : 1;
      return part.length >= 4 && editDistance(word, part) <= tolerance;
    }));
  }

  function groupMatchesTerm(group, rawTerm) {
    const term = normalizeGroupText(rawTerm);
    if (!term) return true;
    const haystack = normalizeGroupText(`${group.name} ${group.url}`);
    const words = haystack.split(" ").filter(Boolean);
    const compactHaystack = haystack.replaceAll(" ", "");
    const compactTerm = term.replaceAll(" ", "");
    return haystack.includes(term)
      || compactHaystack.includes(compactTerm)
      || fuzzyWordMatch(words, term);
  }

  function groupMatches(group, chips, query) {
    const chipMatch = chips.size === 0 || [...chips].some((chip) => groupMatchesTerm(group, chip));
    return chipMatch && groupMatchesTerm(group, query);
  }

  function facebookGroupUrl(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (/^https?:\/\/(www\.)?facebook\.com\/groups\//i.test(raw)) return raw;
    if (/^facebook\.com\/groups\//i.test(raw)) return `https://${raw}`;
    if (/^groups\//i.test(raw)) return `https://www.facebook.com/${raw}`;
    if (/^[A-Za-z0-9._-]+$/.test(raw)) return `https://www.facebook.com/groups/${raw}/`;
    return "";
  }

  function ensureShareModal() {
    let modal = document.querySelector("#share-blast-modal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.className = "modal";
    modal.id = "share-blast-modal";
    modal.hidden = true;
    modal.innerHTML = `
      <div class="modal-backdrop" data-close-modal></div>
      <div class="modal-card share-blast-card" role="dialog" aria-modal="true" aria-labelledby="share-blast-title">
        <button class="modal-close" type="button" data-close-modal aria-label="Cerrar">×</button>
        <p class="eyebrow"><span class="eyebrow-dot"></span> Blast a grupos</p>
        <h2 class="modal-title" id="share-blast-title">Compartir en un grupo</h2>
        <div class="share-preview" id="share-preview"></div>
        <p class="share-caption" id="share-caption"></p>
        <div class="share-chip-row" id="share-chip-row"></div>
        <label class="share-search">
          <span>Buscar grupo</span>
          <input id="share-group-search" type="search" placeholder="Ej. jesus maria, aguascalientes, ventas..." autocomplete="off">
        </label>
        <div class="share-group-tools">
          <label class="check-field"><input type="checkbox" id="share-select-all"> Seleccionar visibles</label>
          <button class="text-link" type="button" data-share-add-toggle>+ Agregar grupo</button>
        </div>
        <form class="share-add-form" id="share-add-form" hidden>
          <div class="form-grid two">
            <label>
              <span>Nombre del grupo</span>
              <input name="name" type="text" maxlength="120" placeholder="Ej. Ventas Jesús María" required>
            </label>
            <label>
              <span>Link del grupo</span>
              <input name="url" type="url" maxlength="400" placeholder="https://facebook.com/groups/..." required>
            </label>
          </div>
          <p class="form-error" id="share-add-error" hidden></p>
          <div class="share-add-actions">
            <button class="btn btn-primary btn-small" type="submit">Guardar grupo</button>
            <button class="btn btn-outline btn-small" type="button" data-share-add-cancel>Cancelar</button>
          </div>
        </form>
        <div class="share-group-list" id="share-group-list"></div>
        <p class="share-note">Facebook no permite publicar automáticamente desde una página web. Copiamos tu texto y abrimos los grupos seleccionados para que pegues la publicación.</p>
        <div class="share-actions">
          <button class="btn btn-primary" type="button" id="share-groups-submit">Compartir en 0 grupos</button>
          <button class="btn btn-outline" type="button" id="share-copy-text">Copiar texto</button>
          <button class="btn btn-outline" type="button" id="share-wall">Mi muro</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    bindShareModal(modal);
    return modal;
  }

  function shareCaption(product) {
    return `${shareText(product)}\n${productShareUrl(product.publicId)}\n${ADDRESS}\nPago en efectivo.`;
  }

  function renderShareModal() {
    if (!shareProduct) return;
    const modal = ensureShareModal();
    const caption = shareCaption(shareProduct);
    modal.querySelector("#share-preview").innerHTML = `
      <img src="${escapeHtml(shareProduct.imageUrl)}" alt="${escapeHtml(shareProduct.title)}">
      <span>
        <strong>${escapeHtml(shareProduct.title)}</strong>
        <small>${escapeHtml(shareProduct.condition || "")} · ${escapeHtml(shareProduct.city || "")}, ${escapeHtml(shareProduct.state || "")}</small>
        <b>${money(shareProduct.priceCents)}</b>
      </span>
    `;
    modal.querySelector("#share-caption").textContent = caption;
    modal.querySelector("#share-chip-row").innerHTML = DEFAULT_GROUP_CHIPS.map((chip) => `
      <button class="share-chip ${shareChips.has(chip) ? "is-active" : ""}" type="button" data-share-chip="${escapeHtml(chip)}">${escapeHtml(chip)}</button>
    `).join("");

    const query = modal.querySelector("#share-group-search").value;
    const groups = readGroups().filter((group) => groupMatches(group, shareChips, query));
    const list = modal.querySelector("#share-group-list");
    list.innerHTML = groups.length
      ? groups.map((group) => `
          <div class="share-group-item ${shareSelected.has(group.id) ? "is-selected" : ""}">
            <label class="check-field">
              <input type="checkbox" data-share-group="${escapeHtml(group.id)}" ${shareSelected.has(group.id) ? "checked" : ""}>
              <span>
                <strong>${escapeHtml(group.name)}</strong>
                <small>${escapeHtml(group.url)}</small>
              </span>
            </label>
            <button class="share-group-delete" type="button" data-share-group-delete="${escapeHtml(group.id)}" aria-label="Eliminar ${escapeHtml(group.name)}">×</button>
          </div>
        `).join("")
      : `<div class="share-empty">No hay grupos guardados que coincidan. Agrega el link de un grupo de Facebook para empezar.</div>`;

    const allVisible = groups.length > 0 && groups.every((group) => shareSelected.has(group.id));
    modal.querySelector("#share-select-all").checked = allVisible;
    modal.querySelector("#share-groups-submit").textContent = `Compartir en ${shareSelected.size} ${shareSelected.size === 1 ? "grupo" : "grupos"}`;
    modal.querySelector("#share-groups-submit").disabled = shareSelected.size === 0;
  }

  function bindShareModal(modal) {
    modal.addEventListener("click", (event) => {
      const chip = event.target.closest("[data-share-chip]");
      if (chip) {
        const value = chip.dataset.shareChip;
        if (shareChips.has(value)) shareChips.delete(value);
        else shareChips.add(value);
        renderShareModal();
        return;
      }

      const remove = event.target.closest("[data-share-group-delete]");
      if (remove) {
        if (!window.confirm("¿Eliminar este grupo de tu lista?")) return;
        writeGroups(readGroups().filter((group) => group.id !== remove.dataset.shareGroupDelete));
        shareSelected.delete(remove.dataset.shareGroupDelete);
        renderShareModal();
        return;
      }

      if (event.target.closest("[data-share-add-toggle]")) {
        modal.querySelector("#share-add-form").hidden = false;
        modal.querySelector("#share-add-form input[name='name']").focus();
        return;
      }

      if (event.target.closest("[data-share-add-cancel]")) {
        modal.querySelector("#share-add-form").hidden = true;
        modal.querySelector("#share-add-form").reset();
        modal.querySelector("#share-add-error").hidden = true;
      }
    });

    modal.querySelector("#share-group-search").addEventListener("input", renderShareModal);

    modal.querySelector("#share-group-list").addEventListener("change", (event) => {
      const input = event.target.closest("[data-share-group]");
      if (!input) return;
      if (input.checked) shareSelected.add(input.dataset.shareGroup);
      else shareSelected.delete(input.dataset.shareGroup);
      input.closest(".share-group-item")?.classList.toggle("is-selected", input.checked);
      modal.querySelector("#share-groups-submit").textContent = `Compartir en ${shareSelected.size} ${shareSelected.size === 1 ? "grupo" : "grupos"}`;
      modal.querySelector("#share-groups-submit").disabled = shareSelected.size === 0;
    });

    modal.querySelector("#share-select-all").addEventListener("change", (event) => {
      const query = modal.querySelector("#share-group-search").value;
      const visible = readGroups().filter((group) => groupMatches(group, shareChips, query));
      visible.forEach((group) => {
        if (event.target.checked) shareSelected.add(group.id);
        else shareSelected.delete(group.id);
      });
      renderShareModal();
    });

    modal.querySelector("#share-add-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const form = event.target;
      const data = new FormData(form);
      const name = String(data.get("name") || "").trim();
      const url = facebookGroupUrl(data.get("url"));
      const error = modal.querySelector("#share-add-error");
      error.hidden = true;
      if (name.length < 3) {
        error.textContent = "Escribe el nombre del grupo.";
        error.hidden = false;
        return;
      }
      if (!url) {
        error.textContent = "Pega un link válido de Facebook Groups.";
        error.hidden = false;
        return;
      }
      const groups = readGroups();
      if (groups.some((group) => group.url === url)) {
        error.textContent = "Ese grupo ya está en la lista.";
        error.hidden = false;
        return;
      }
      const group = { id: `g_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, name, url, createdAt: new Date().toISOString() };
      groups.unshift(group);
      writeGroups(groups);
      form.reset();
      form.hidden = true;
      shareChips.clear();
      shareSelected.add(group.id);
      modal.querySelector("#share-group-search").value = "";
      toast("Grupo guardado.");
      renderShareModal();
    });

    modal.querySelector("#share-copy-text").addEventListener("click", async () => {
      if (!shareProduct) return;
      const copied = await copyText(shareCaption(shareProduct));
      toast(copied ? "Texto copiado. Pégalo en Facebook." : "No pudimos copiar. Selecciona el texto manualmente.", copied ? "success" : "error");
    });

    modal.querySelector("#share-wall").addEventListener("click", () => {
      if (!shareProduct) return;
      const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(productShareUrl(shareProduct.publicId))}&quote=${encodeURIComponent(shareText(shareProduct))}`;
      window.open(url, "_blank", "noopener");
    });

    modal.querySelector("#share-groups-submit").addEventListener("click", async () => {
      if (!shareProduct) return;
      const selected = readGroups().filter((group) => shareSelected.has(group.id));
      if (!selected.length) return;
      const copied = await copyText(shareCaption(shareProduct));
      if (!copied) {
        toast("No pudimos copiar el texto. Usa el botón Copiar texto primero.", "error");
        return;
      }
      if (!window.confirm(`Se abrirán ${selected.length} ${selected.length === 1 ? "grupo" : "grupos"} de Facebook. Pega el texto copiado en cada uno. ¿Continuar?`)) return;
      selected.forEach((group) => window.open(group.url, "_blank", "noopener"));
      toast("Texto copiado. Pega la publicación en cada grupo abierto.");
    });
  }

  function openShareBlast(product) {
    if (!product) return;
    shareProduct = product;
    shareChips = new Set(DEFAULT_GROUP_CHIPS);
    shareSelected = new Set();
    const modal = ensureShareModal();
    modal.querySelector("#share-group-search").value = "";
    modal.querySelector("#share-add-form").hidden = true;
    modal.querySelector("#share-add-error").hidden = true;
    renderShareModal();
    openDialog("share-blast-modal");
  }

  document.addEventListener("DOMContentLoaded", () => {
    initSiteAlert();
    initBusinessPopup();
    initHeader();
    initDialogs();
    initFloatingContact();
  });

  return {
    ApiError,
    api,
    money,
    formatDate,
    escapeHtml,
    findContactLeak,
    statusLabel,
    statusPill,
    commissionStatusLabel,
    commissionPill,
    getQuery,
    toast,
    setLoading,
    openDialog,
    closeDialog,
    saveOfferAccess,
    getOfferAccess,
    offerUrl,
    productShareUrl,
    shareText,
    whatsappUrl,
    setFloatingProduct,
    openShareBlast,
    copyText,
    compressImage,
    debounce,
    emptyState,
    ADDRESS,
    WHATSAPP_NUMBER,
  };
})();
