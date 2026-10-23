document.addEventListener("DOMContentLoaded", () => {
  const loading = document.querySelector("#product-loading");
  const app = document.querySelector("#product-app");
  const errorBox = document.querySelector("#product-error");
  const productId = document.querySelector('meta[name="bc-product-id"]')?.content || BC.getQuery("id");
  let product = null;

  async function init() {
    if (!productId) {
      showError("No se indicó qué producto quieres consultar.");
      return;
    }

    try {
      const data = await BC.api(`/api/products/${encodeURIComponent(productId)}`);
      product = data.product;
      renderProduct(product);
      loading.hidden = true;
      app.hidden = false;
    } catch (error) {
      showError(error.message);
    }
  }

  function renderProduct(item) {
    document.title = `${item.title} | Bazar Los Cuates - Jesús María`;
    BC.setFloatingProduct(item);
    document.querySelector("#breadcrumb-current").textContent = item.title;
    const image = document.querySelector("#detail-image");
    image.src = item.imageUrl;
    image.alt = item.title;

    document.querySelector("#detail-category").textContent = item.categoryLabel;
    document.querySelector("#detail-condition").textContent = item.condition;
    document.querySelector("#detail-title").textContent = item.title;
    document.querySelector("#detail-location").textContent = `${item.city}, ${item.state}`;
    document.querySelector("#detail-price").textContent = BC.money(item.priceCents);
    document.querySelector("#detail-price-side").textContent = BC.money(item.priceCents);
    document.querySelector("#detail-description").textContent = item.description;
  }

  function showError(message) {
    loading.hidden = true;
    app.hidden = true;
    errorBox.hidden = false;
    document.querySelector("#product-error-text").textContent = message;
  }

  function contact() {
    if (!product) return;
    BC.setFloatingProduct(product);
    window.open(BC.whatsappUrl(product), "_blank", "noopener");
  }

  document.querySelector("#detail-whatsapp").addEventListener("click", contact);
  document.querySelector("#detail-whatsapp-side").addEventListener("click", contact);
  document.querySelector("#detail-bottom-whatsapp").addEventListener("click", contact);

  document.querySelector("#detail-share-fb").addEventListener("click", () => {
    if (product) BC.openShareBlast(product);
  });

  document.querySelector("#detail-share-groups").addEventListener("click", () => {
    if (product) BC.openShareBlast(product);
  });

  init();
});
