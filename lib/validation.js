const { CATEGORIES, CONDITIONS, SERVICE_STATES, NEARBY_CITIES } = require("./constants");

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function cleanText(value, maxLength) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function cleanMultiline(value, maxLength) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maxLength);
}

function findContactLeak(value) {
  const text = normalizeText(value);
  const contactWords = /(whats\s*app|whatsapp|wasap|guasap|wsp|wa\.me|telegram|telefono|celular|llamadas|llamar|marcar|\btel\b|contacto directo|instagram|facebook)/i;
  const digitSequence = /(?:\+?\d[\s().-]*){7,}/;
  const linkPattern = /(https?:\/\/|www\.|[a-z0-9-]+\.(com|mx|net|org)\b)/i;

  if (contactWords.test(text)) {
    return "No se permite incluir teléfono, WhatsApp, redes sociales ni datos de contacto.";
  }

  if (digitSequence.test(text)) {
    return "No se permite incluir números telefónicos en la publicación.";
  }

  if (linkPattern.test(text)) {
    return "No se permiten enlaces externos en la publicación.";
  }

  return null;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(String(email || ""));
}

function toCents(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return null;
  }

  const cents = Math.round(amount * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}

function validateRegistration(input) {
  const name = cleanText(input.name, 90);
  const email = cleanText(input.email, 150).toLowerCase();
  const phone = cleanText(input.phone, 40);
  const password = String(input.password || "");

  if (name.length < 3) return { error: "Escribe tu nombre completo." };
  if (!isValidEmail(email)) return { error: "Escribe un correo electrónico válido." };
  if (phone.replace(/\D/g, "").length < 10) return { error: "Escribe un teléfono válido." };
  if (password.length < 8) return { error: "La contraseña debe tener al menos 8 caracteres." };
  if (password.length > 200) return { error: "La contraseña es demasiado larga." };

  return { value: { name, email, phone, password } };
}

function validateLogin(input) {
  const email = cleanText(input.email, 150).toLowerCase();
  const password = String(input.password || "");

  if (!isValidEmail(email) || !password) {
    return { error: "Escribe tu correo y contraseña." };
  }

  return { value: { email, password } };
}

function validateProduct(input) {
  const title = cleanText(input.title, 110);
  const description = cleanMultiline(input.description, 3000);
  const category = cleanText(input.category, 40);
  const condition = cleanText(input.condition, 40);
  const state = cleanText(input.state, 60);
  const city = cleanText(input.city, 80);
  const priceCents = toCents(input.price);

  if (title.length < 6) return { error: "El título debe tener al menos 6 caracteres." };
  if (description.length < 20) return { error: "La descripción debe tener al menos 20 caracteres." };
  if (!CATEGORIES[category]) return { error: "Selecciona una categoría válida." };
  if (!CONDITIONS.includes(condition)) return { error: "Selecciona una condición válida." };
  if (!SERVICE_STATES.includes(state)) return { error: "Por ahora solo operamos en Aguascalientes." };
  if (!NEARBY_CITIES.includes(city)) {
    return { error: "Selecciona una ciudad de Aguascalientes o de la zona cercana." };
  }
  if (priceCents === null || priceCents < 100 || priceCents > 100000000) {
    return { error: "El precio debe estar entre $1 y $1,000,000 MXN." };
  }

  const leak = findContactLeak(`${title}\n${description}`);
  if (leak) return { error: leak };

  return {
    value: {
      title,
      description,
      category,
      condition,
      state,
      city,
      priceCents,
    },
  };
}

function validateOffer(input) {
  const buyerName = cleanText(input.buyerName, 90);
  const buyerContact = cleanText(input.buyerContact, 140);
  const message = cleanMultiline(input.message, 600);
  const amountCents = toCents(input.amount);

  if (buyerName.length < 3) return { error: "Escribe tu nombre." };
  if (buyerContact.length < 6) return { error: "Escribe un correo o teléfono de contacto." };
  if (amountCents === null || amountCents < 100 || amountCents > 100000000) {
    return { error: "La oferta debe ser de al menos $1 MXN." };
  }
  if (message) {
    const leak = findContactLeak(message);
    if (leak) return { error: "Por seguridad, no incluyas teléfonos, WhatsApp ni enlaces en el mensaje." };
  }

  return { value: { buyerName, buyerContact, message, amountCents } };
}

function validateOfferMessage(message) {
  const clean = cleanMultiline(message, 600);
  if (clean) {
    const leak = findContactLeak(clean);
    if (leak) return { error: "No incluyas teléfonos, WhatsApp ni enlaces en la contraoferta." };
  }
  return { value: clean };
}

module.exports = {
  normalizeText,
  cleanText,
  cleanMultiline,
  findContactLeak,
  isValidEmail,
  toCents,
  validateRegistration,
  validateLogin,
  validateProduct,
  validateOffer,
  validateOfferMessage,
};
