(() => {
  let deferredPrompt = null;
  let dismissed = false;

  const modal = document.getElementById("blc-exit-modal");
  if (!modal) return;

  const installButton = modal.querySelector("[data-pwa-install]");
  const closeButtons = modal.querySelectorAll("[data-pwa-close]");

  const hideModal = () => {
    dismissed = true;
    modal.hidden = true;
    document.body.classList.remove("pwa-modal-open");
    sessionStorage.setItem("blc-exit-dismissed", "1");
  };

  const showModal = () => {
    if (dismissed || sessionStorage.getItem("blc-exit-seen") === "1") return;
    if (window.matchMedia("(display-mode: standalone)").matches) return;
    sessionStorage.setItem("blc-exit-seen", "1");
    modal.hidden = false;
    document.body.classList.add("pwa-modal-open");
    installButton.focus();
  };

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
  });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    });
  }

  closeButtons.forEach((button) => button.addEventListener("click", hideModal));

  modal.addEventListener("click", (event) => {
    if (event.target === modal) hideModal();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.hidden) hideModal();
  });

  installButton.addEventListener("click", async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      hideModal();
      return;
    }
    window.alert("Para instalar: abre el menú de Chrome y elige “Instalar app” o “Agregar a pantalla de inicio”.");
    hideModal();
  });

  if (!history.state || history.state.blcGuard !== true) {
    history.pushState({ blcGuard: true }, "", location.href);
  }

  window.addEventListener("popstate", showModal);

  document.addEventListener("mouseleave", (event) => {
    if (event.clientY <= 0) showModal();
  });
})();
