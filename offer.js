document.addEventListener("DOMContentLoaded", () => {
  const loading = document.querySelector("#offer-loading");
  const app = document.querySelector("#offer-app");
  const errorBox = document.querySelector("#offer-error");
  const offerId = BC.getQuery("id");
  const queryToken = BC.getQuery("token");
  const token = queryToken || (offerId ? BC.getOfferAccess(offerId) : "");
  let offer = null;

  async function init() {
    if (!offerId || !token) {
      showError("Abre el enlace privado que se generó cuando enviaste tu oferta.");
      return;
    }

    if (!queryToken) {
      const url = new URL(window.location.href);
      url.searchParams.set("token", token);
      window.history.replaceState({}, "", url);
    }

    try {
      const data = await BC.api(`/api/offers/${encodeURIComponent(offerId)}?token=${encodeURIComponent(token)}`);
      offer = data.offer;
      render();
      loading.hidden = true;
      app.hidden = false;
    } catch (error) {
      showError(error.message);
    }
  }

  function render() {
    document.title = `Oferta por ${offer.product?.title || "producto"} | Bazar Los Cuates - Jesús María`;
    if (offer.product) {
      BC.setFloatingProduct(offer.product, offer.publicId);
    }
    document.querySelector("#offer-title").textContent = offer.product?.title || "Tu oferta";
    const commissionPaid = offer.commission?.status === "paid";
    document.querySelector("#offer-subtitle").textContent = offer.status === "pending"
      ? "Revisa el historial y responde cuando sea tu turno."
      : offer.status === "accepted"
        ? commissionPaid
          ? "Comisión recibida. Los datos de entrega quedaron desbloqueados."
          : "Trato cerrado. Falta pagar la comisión para recibir los datos de entrega."
        : "Esta negociación ya terminó.";
    document.querySelector("#offer-status").innerHTML = [
      BC.statusPill(offer.status),
      offer.commission ? BC.commissionPill(offer.commission.status) : "",
    ].join("");
    document.querySelector("#offer-current-amount").textContent = BC.money(offer.currentCents);
    document.querySelector("#offer-original-price").textContent = BC.money(offer.product?.priceCents || 0);
    document.querySelector("#offer-last-move").textContent = offer.lastActor === "buyer" ? "Tú" : offer.lastActor === "seller" ? "Bazar Los Cuates" : "Sistema";
    document.querySelector("#buyer-contact-display").textContent = offer.buyer.contact;
    document.querySelector("#offer-whatsapp").href = BC.whatsappUrl(offer.product, offer.publicId);

    const sideProduct = document.querySelector("#side-product");
    if (offer.product) {
      sideProduct.innerHTML = `
        <img src="${BC.escapeHtml(offer.product.imageUrl)}" alt="${BC.escapeHtml(offer.product.title)}">
        <strong>${BC.escapeHtml(offer.product.title)}</strong>
        <span>${BC.escapeHtml(offer.product.condition)} · ${BC.escapeHtml(offer.product.city)}, ${BC.escapeHtml(offer.product.state)}</span>
        <a class="text-link" href="producto.html?id=${encodeURIComponent(offer.product.publicId)}">Ver publicación</a>
      `;
    }

    const sellerReveal = document.querySelector("#seller-reveal");
    if (offer.seller) {
      sellerReveal.innerHTML = `
        <small>Datos de entrega desbloqueados</small>
        <strong>${BC.escapeHtml(offer.seller.name)}</strong>
        <span>${BC.escapeHtml(offer.seller.phone)}</span>
        <p>Comisión recibida. Entrega en Av. Constitución 216, Jesús María, Aguascalientes.</p>
      `;
    } else {
      sellerReveal.innerHTML = `
        <small>Contacto del bazar</small>
        <strong>Bazar Los Cuates</strong>
        <span>Av. Constitución 216, CP 20922<br>Jesús María, Aguascalientes</span>
        <p>Los datos de entrega se desbloquean cuando se recibe la comisión del 10% en el local.</p>
      `;
    }

    renderThread();

    const actions = document.querySelector("#buyer-offer-actions");
    const closed = document.querySelector("#buyer-deal-closed");
    closed.hidden = true;

    if (offer.status === "accepted") {
      actions.innerHTML = "";
      closed.hidden = false;
      closed.innerHTML = commissionPaid
        ? `
          <strong>Comisión recibida. Trato completo.</strong>
          <p>Los datos de entrega ya están visibles en esta página. Entrega en Av. Constitución 216, Jesús María.</p>
        `
        : `
          <strong>Trato cerrado por ${BC.money(offer.currentCents)}</strong>
          <p>Trato cerrado. Ven a Av. Constitución 216 a pagar tu comisión para recibir datos de entrega.</p>
          <p class="commission-amount">Comisión del 10%: <b>${BC.money(offer.commission?.commissionCents || Math.round(offer.currentCents * 0.1))}</b> · Pago en efectivo</p>
        `;
      return;
    }

    if (offer.status === "rejected") {
      actions.innerHTML = `
        <div class="waiting-note">Esta oferta fue rechazada o retirada. Puedes volver al catálogo y buscar otra pieza.</div>
      `;
      return;
    }

    if (offer.lastActor === "buyer") {
      actions.innerHTML = `
        <div class="waiting-note">
          <strong>Esperando a Bazar Los Cuates.</strong>
          <span>Tu oferta de ${BC.money(offer.currentCents)} está pendiente de respuesta.</span>
          <button class="btn btn-outline btn-small" type="button" data-buyer-action="reject">Retirar oferta</button>
        </div>
      `;
    } else {
      actions.innerHTML = `
        <div class="buyer-action-panel">
          <div class="action-heading">
            <p class="eyebrow"><span class="eyebrow-dot"></span> Es tu turno</p>
            <h2>Responde a la contraoferta</h2>
            <p>Bazar Los Cuates propuso ${BC.money(offer.currentCents)}. Puedes aceptar, contraofertar o rechazar.</p>
          </div>
          <form class="stack-form" id="buyer-counter-form" novalidate>
            <div class="form-grid two">
              <label>
                <span>Tu contraoferta MXN</span>
                <input name="amount" type="number" min="1" max="1000000" step="1" value="${(offer.currentCents / 100).toFixed(0)}" required>
              </label>
              <label>
                <span>Mensaje <small>(opcional)</small></span>
                <input name="message" type="text" maxlength="600" placeholder="¿Puedes dejarlo en...?">
              </label>
            </div>
            <p class="form-error" id="buyer-action-error" hidden></p>
            <div class="decision-row">
              <button class="btn btn-wa" type="button" data-buyer-action="accept">Aceptar ${BC.money(offer.currentCents)}</button>
              <button class="btn btn-primary" type="submit" id="buyer-counter-submit">Contraofertar</button>
              <button class="btn btn-outline" type="button" data-buyer-action="reject">Rechazar</button>
            </div>
          </form>
        </div>
      `;
    }

    bindActions();
  }

  function renderThread() {
    const typeLabels = {
      offer: "Oferta inicial",
      counter: "Contraoferta",
      accepted: "Trato aceptado",
      rejected: "Oferta rechazada",
    };

    document.querySelector("#offer-thread").innerHTML = offer.events.map((event) => {
      const actor = event.actor === "buyer" ? "Tú" : event.actor === "seller" ? "Bazar Los Cuates" : "Sistema";
      return `
        <article class="negotiation-event event-${BC.escapeHtml(event.actor)}">
          <span class="event-dot" aria-hidden="true"></span>
          <div>
            <div class="event-head">
              <strong>${actor}</strong>
              <span>${BC.escapeHtml(typeLabels[event.type] || event.type)} · ${BC.formatDate(event.createdAt, true)}</span>
            </div>
            ${event.amountCents ? `<b>${BC.money(event.amountCents)}</b>` : ""}
            ${event.message ? `<p>${BC.escapeHtml(event.message)}</p>` : ""}
          </div>
        </article>
      `;
    }).join("");
  }

  function bindActions() {
    const counterForm = document.querySelector("#buyer-counter-form");
    if (counterForm) {
      counterForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const data = new FormData(counterForm);
        const message = String(data.get("message") || "").trim();
        if (message && BC.findContactLeak(message)) {
          showActionError("No incluyas teléfonos, WhatsApp ni enlaces en el mensaje.");
          return;
        }
        submitAction("counter", document.querySelector("#buyer-counter-submit"), {
          amount: Number(data.get("amount")),
          message,
        });
      });
    }

    document.querySelectorAll("[data-buyer-action]").forEach((button) => {
      button.addEventListener("click", () => {
        const action = button.dataset.buyerAction;
        if (action === "accept" && !window.confirm("¿Aceptar esta oferta y cerrar el trato? Después deberás pagar el 10% de comisión en Av. Constitución 216 para recibir los datos de entrega.")) {
          return;
        }
        if (action === "reject" && !window.confirm("¿Retirar o rechazar esta oferta?")) {
          return;
        }
        submitAction(action, button, {});
      });
    });
  }

  async function submitAction(action, button, payload) {
    const errorBox = document.querySelector("#buyer-action-error");
    if (errorBox) errorBox.hidden = true;
    BC.setLoading(button, true, action === "accept" ? "Aceptando..." : action === "reject" ? "Cerrando..." : "Enviando...");

    try {
      const data = await BC.api(`/api/offers/${encodeURIComponent(offer.publicId)}/actions?token=${encodeURIComponent(token)}`, {
        method: "POST",
        body: { action, ...payload },
      });
      offer = data.offer;
      render();
      BC.toast(action === "accept" ? "Trato cerrado. Paga la comisión en el local para recibir los datos de entrega." : action === "reject" ? "Oferta cerrada." : "Contraoferta enviada.");
    } catch (error) {
      showActionError(error.message);
      BC.setLoading(button, false);
    }
  }

  function showActionError(message) {
    const box = document.querySelector("#buyer-action-error");
    if (!box) {
      BC.toast(message, "error");
      return;
    }
    box.textContent = message;
    box.hidden = false;
    document.querySelectorAll("[data-buyer-action], #buyer-counter-submit").forEach((button) => {
      BC.setLoading(button, false);
    });
  }

  function showError(message) {
    loading.hidden = true;
    app.hidden = true;
    errorBox.hidden = false;
    document.querySelector("#offer-error-text").textContent = message;
  }

  init();
});
