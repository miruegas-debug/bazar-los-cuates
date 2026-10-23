const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const MEXICO_DAY_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Mexico_City",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function mexicoDayKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return MEXICO_DAY_FORMATTER.format(date);
}
const { URL } = require("node:url");
const { createDatabase, nowIso } = require("./lib/db");
const { COMMISSION_RATE, CATEGORIES, CONDITIONS, SERVICE_STATES, NEARBY_CITIES } = require("./lib/constants");
const {
  hashPassword,
  verifyPassword,
  randomToken,
  sha256,
  safeEqualString,
  publicId,
} = require("./lib/security");
const {
  validateRegistration,
  validateLogin,
  validateProduct,
  validateOffer,
  validateOfferMessage,
  toCents,
} = require("./lib/validation");

const SESSION_COOKIE = "bc_session";
const SESSION_DAYS = 7;
const VISITOR_COOKIE = "bc_visitor";
const VISITOR_DAYS = 365;
const PUBLIC_VISIT_PAGES = new Set(["/", "/index.html", "/producto.html"]);
const MAX_JSON_BYTES = 8 * 1024 * 1024;
const ROOT = __dirname;
const DEFAULT_HERO_IMAGE_URL = "/assets/hero-taller.jpg";
const DEEPSEEK_API_KEY = String(process.env.DEEPSEEK_API_KEY || "").trim();
const DEEPSEEK_MODEL = String(process.env.DEEPSEEK_MODEL || "deepseek-flash").trim();
const DEEPSEEK_VISION_MODEL = String(process.env.DEEPSEEK_VISION_MODEL || "").trim();
const DEEPSEEK_BASE_URL = String(process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/$/, "");

const PAGE_FILES = new Map([
  ["/", "index.html"],
  ["/index.html", "index.html"],
  ["/producto.html", "producto.html"],
  ["/vendedor.html", "vendedor.html"],
  ["/oferta.html", "oferta.html"],
  ["/admin.html", "admin.html"],
]);

const STATIC_FILES = new Map([
  ["/styles.css", "styles.css"],
  ["/app.js", "app.js"],
  ["/script.js", "script.js"],
  ["/product.js", "product.js"],
  ["/seller.js", "seller.js"],
  ["/offer.js", "offer.js"],
  ["/admin.js", "admin.js"],
  ["/pwa.js", "pwa.js"],
  ["/manifest.json", "public/manifest.json"],
  ["/sw.js", "public/sw.js"],
  ["/icon-192.png", "public/icon-192.png"],
  ["/icon-512.png", "public/icon-512.png"],
]);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".json": "application/manifest+json; charset=utf-8",
};

const rateBuckets = new Map();

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function createApp(options = {}) {
  const dataDir = path.resolve(options.dataDir || process.env.DATA_DIR || path.join(ROOT, ".data"));
  fs.mkdirSync(dataDir, { recursive: true });
  const { db, uploadsDir } = createDatabase({ ...options, dataDir });

  const context = {
    db,
    dataDir,
    uploadsDir,
    root: ROOT,
  };

  const server = http.createServer(async (req, res) => {
    applySecurityHeaders(res);

    try {
      const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      const pathname = decodeURIComponent(requestUrl.pathname);

      if (pathname.startsWith("/api/")) {
        if (!["GET", "HEAD"].includes(req.method)) {
          verifySameOrigin(req);
        }
        await handleApi(req, res, requestUrl, context);
        return;
      }

      if (req.method !== "GET" && req.method !== "HEAD") {
        throw new HttpError(405, "Método no permitido.");
      }

      const sharePageMatch = pathname.match(/^\/p\/([A-Za-z0-9_-]+)\/?$/);
      if (sharePageMatch) {
        trackPageVisit(req, res, "/p/:id", context);
        serveProductSharePage(req, res, sharePageMatch[1], context);
        return;
      }

      if (PUBLIC_VISIT_PAGES.has(pathname)) {
        trackPageVisit(req, res, pathname, context);
      }
      serveStatic(req, res, pathname, context);
    } catch (error) {
      handleError(res, error);
    }
  });

  return {
    server,
    db,
    dataDir,
    close() {
      try {
        db.close();
      } catch {
        return;
      }
    },
  };
}

function applySecurityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; frame-src https://www.google.com https://maps.google.com; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  );
}

function verifySameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) {
    return;
  }

  const host = req.headers.host;
  try {
    if (new URL(origin).host !== host) {
      throw new HttpError(403, "Origen no permitido.");
    }
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(403, "Origen no permitido.");
  }
}

function sendJson(res, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  for (const [key, value] of Object.entries(extraHeaders)) {
    res.setHeader(key, value);
  }
  res.end(body);
}

function handleError(res, error) {
  if (res.headersSent) {
    res.end();
    return;
  }

  if (error instanceof HttpError) {
    sendJson(res, error.status, { error: error.message });
    return;
  }

  if (error && error.code === "LIMIT_FILE_SIZE") {
    sendJson(res, 413, { error: "El archivo es demasiado grande." });
    return;
  }

  console.error(error);
  sendJson(res, 500, { error: "Ocurrió un error inesperado." });
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const contentLength = Number(req.headers["content-length"] || 0);
    if (contentLength > MAX_JSON_BYTES) {
      reject(new HttpError(413, "La solicitud es demasiado grande."));
      return;
    }

    const chunks = [];
    let size = 0;
    let settled = false;

    req.on("data", (chunk) => {
      if (settled) return;
      size += chunk.length;
      if (size > MAX_JSON_BYTES) {
        settled = true;
        reject(new HttpError(413, "La solicitud es demasiado grande."));
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      if (settled) return;
      if (!chunks.length) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new HttpError(400, "El cuerpo de la solicitud no es válido."));
      }
    });

    req.on("error", reject);
  });
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  const cookies = {};
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
  }
  return cookies;
}

function sessionCookie(req, token, maxAgeSeconds) {
  const secure = process.env.COOKIE_SECURE === "true" || req.headers["x-forwarded-proto"] === "https";
  const expires = maxAgeSeconds > 0 ? `Max-Age=${maxAgeSeconds}; ` : "Max-Age=0; ";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; ${expires}${secure ? "Secure; " : ""}`.trim();
}

function visitorCookie(req, token, maxAgeSeconds) {
  const secure = process.env.COOKIE_SECURE === "true" || req.headers["x-forwarded-proto"] === "https";
  return `${VISITOR_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds};${secure ? " Secure;" : ""}`;
}

function trackPageVisit(req, res, pathname, context) {
  if (req.method !== "GET") return;

  const userAgent = String(req.headers["user-agent"] || "").toLowerCase();
  if (!userAgent || /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegram|curl|wget|python-requests|headless/.test(userAgent)) {
    return;
  }

  const cookies = parseCookies(req);
  let token = cookies[VISITOR_COOKIE];
  if (!token || !/^[A-Za-z0-9_-]{16,64}$/.test(token)) {
    token = randomToken(18);
    res.setHeader("Set-Cookie", visitorCookie(req, token, VISITOR_DAYS * 24 * 60 * 60));
  }

  const day = mexicoDayKey(new Date());
  context.db.prepare(
    "INSERT OR IGNORE INTO visitor_days (visitor_hash, day, path, created_at) VALUES (?, ?, ?, ?)",
  ).run(sha256(token), day, pathname, nowIso());
}

function createSession(req, res, userId, db) {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(nowIso());
  db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)").run(
    sha256(token),
    userId,
    expiresAt,
    nowIso(),
  );
  res.setHeader("Set-Cookie", sessionCookie(req, token, SESSION_DAYS * 24 * 60 * 60));
}

function destroySession(req, res, db) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (token) {
    db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(token));
  }
  res.setHeader("Set-Cookie", sessionCookie(req, "", 0));
}

function currentUser(req, db) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return null;

  const row = db.prepare(`
    SELECT u.id, u.role, u.name, u.email, u.phone, u.status, u.created_at
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ? AND u.status = 'active'
  `).get(sha256(token), nowIso());

  return row || null;
}

function requireUser(req, db, role) {
  const user = currentUser(req, db);
  if (!user) {
    throw new HttpError(401, "Inicia sesión para continuar.");
  }
  if (role && user.role !== role) {
    throw new HttpError(403, "No tienes permiso para realizar esta acción.");
  }
  return user;
}

function checkRateLimit(key, limit, windowMs) {
  const now = Date.now();
  let bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    rateBuckets.set(key, bucket);
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    throw new HttpError(429, "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.");
  }
}

function clientIp(req) {
  return String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "local").split(",")[0].trim();
}

function userView(user) {
  return {
    id: user.id,
    role: user.role,
    name: user.name,
    email: user.email,
    phone: user.phone,
    createdAt: user.created_at,
  };
}

function productView(row) {
  return {
    publicId: row.public_id,
    title: row.title,
    description: row.description,
    category: row.category,
    categoryLabel: CATEGORIES[row.category] || row.category,
    condition: row.condition,
    priceCents: row.price_cents,
    state: row.state,
    city: row.city,
    imageUrl: row.image_url,
    status: row.status,
    offerCount: Number(row.pending_offers || 0),
    createdAt: row.created_at,
  };
}

function offerBaseView(row, viewer, db) {
  const product = db.prepare(`
    SELECT p.*, u.name AS seller_name, u.phone AS seller_phone
    FROM products p
    JOIN users u ON u.id = p.seller_id
    WHERE p.id = ?
  `).get(row.product_id);
  const sale = db.prepare("SELECT * FROM sales WHERE offer_id = ?").get(row.id);
  const contactsUnlocked = Boolean(sale && sale.status === "paid");
  const isAdmin = viewer === "admin";
  const isBuyer = viewer === "buyer";
  const accepted = row.status === "accepted";

  const events = db.prepare(
    "SELECT actor, type, amount_cents, message, created_at FROM offer_events WHERE offer_id = ? ORDER BY id ASC",
  ).all(row.id).map((event) => ({
    actor: event.actor,
    type: event.type,
    amountCents: event.amount_cents,
    message: event.message,
    createdAt: event.created_at,
  }));

  const buyerVisible = isBuyer || isAdmin || contactsUnlocked;
  const sellerVisible = isAdmin || (accepted && contactsUnlocked);

  return {
    publicId: row.public_id,
    currentCents: row.current_cents,
    status: row.status,
    lastActor: row.last_actor,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    product: product ? {
      publicId: product.public_id,
      title: product.title,
      imageUrl: product.image_url,
      category: product.category,
      categoryLabel: CATEGORIES[product.category] || product.category,
      condition: product.condition,
      priceCents: product.price_cents,
      state: product.state,
      city: product.city,
      status: product.status,
    } : null,
    events,
    buyer: {
      name: buyerVisible ? row.buyer_name : "Comprador anónimo",
      contact: buyerVisible ? row.buyer_contact : null,
    },
    seller: sellerVisible && product ? {
      name: product.seller_name,
      phone: product.seller_phone,
    } : null,
    commission: sale ? {
      publicId: sale.public_id,
      status: sale.status,
      amountCents: sale.amount_cents,
      commissionCents: sale.commission_cents,
      paidAt: sale.paid_at,
    } : null,
    contactsUnlocked,
  };
}

function getOfferByToken(db, offerPublicId, token) {
  const row = db.prepare("SELECT * FROM offers WHERE public_id = ?").get(offerPublicId);
  if (!row || !token || !safeEqualString(sha256(token), row.token_hash)) {
    throw new HttpError(404, "Oferta no encontrada.");
  }
  return row;
}

function insertOfferEvent(db, offerId, actor, type, amountCents, message) {
  db.prepare(
    "INSERT INTO offer_events (offer_id, actor, type, amount_cents, message, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(offerId, actor, type, amountCents ?? null, message || null, nowIso());
}

function acceptOffer(db, offer, actor) {
  if (offer.status !== "pending") {
    throw new HttpError(409, "Esta oferta ya no está pendiente.");
  }
  if (offer.last_actor === actor) {
    throw new HttpError(409, "La otra parte debe responder antes de aceptar.");
  }

  db.exec("BEGIN IMMEDIATE");
  try {
    const current = db.prepare("SELECT * FROM offers WHERE id = ?").get(offer.id);
    if (!current || current.status !== "pending") {
      throw new HttpError(409, "Esta oferta ya fue atendida.");
    }
    if (current.last_actor === actor) {
      throw new HttpError(409, "La otra parte debe responder antes de aceptar.");
    }

    const product = db.prepare("SELECT * FROM products WHERE id = ?").get(current.product_id);
    if (!product || product.status !== "active") {
      throw new HttpError(409, "La publicación ya no está activa.");
    }

    const timestamp = nowIso();
    db.prepare("UPDATE offers SET status = 'accepted', last_actor = ?, updated_at = ? WHERE id = ?").run(
      actor,
      timestamp,
      current.id,
    );
    insertOfferEvent(db, current.id, actor, "accepted", current.current_cents, null);

    const otherOffers = db.prepare(
      "SELECT id FROM offers WHERE product_id = ? AND id <> ? AND status = 'pending'",
    ).all(current.product_id, current.id);
    for (const other of otherOffers) {
      db.prepare("UPDATE offers SET status = 'rejected', last_actor = 'system', updated_at = ? WHERE id = ?").run(
        timestamp,
        other.id,
      );
      insertOfferEvent(db, other.id, "system", "rejected", null, "La pieza se vendió en otra oferta.");
    }

    db.prepare("UPDATE products SET status = 'sold', updated_at = ? WHERE id = ?").run(timestamp, product.id);

    const commissionCents = Math.round(current.current_cents * COMMISSION_RATE);
    db.prepare(`
      INSERT INTO sales (
        public_id, offer_id, product_id, seller_id, amount_cents, commission_cents, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
    `).run(
      publicId("sale"),
      current.id,
      current.product_id,
      product.seller_id,
      current.current_cents,
      commissionCents,
      timestamp,
    );

    db.exec("COMMIT");
    return db.prepare("SELECT * FROM offers WHERE id = ?").get(current.id);
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function getAppMeta(db, key, fallback = "") {
  const row = db.prepare("SELECT value FROM app_meta WHERE key = ?").get(key);
  return row ? String(row.value) : fallback;
}

function setAppMeta(db, key, value) {
  db.prepare("INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)").run(key, value);
}

function getHeroImageUrl(db) {
  const value = getAppMeta(db, "hero_image_url", "");
  return value.startsWith("/uploads/") || value.startsWith("/assets/") ? value : DEFAULT_HERO_IMAGE_URL;
}

function saveUploadedImage(dataUrl, uploadsDir, prefix = "product") {
  if (!dataUrl || typeof dataUrl !== "string") {
    throw new HttpError(400, "Selecciona una foto.");
  }

  const match = dataUrl.match(/^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!match) {
    throw new HttpError(400, "La imagen debe ser JPG, PNG o WebP.");
  }

  const mime = match[1].toLowerCase();
  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length || buffer.length > 4 * 1024 * 1024) {
    throw new HttpError(400, "La imagen debe pesar menos de 4 MB.");
  }

  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPng = buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isWebp = buffer.subarray(0, 4).toString() === "RIFF" && buffer.subarray(8, 12).toString() === "WEBP";

  if ((mime === "jpeg" || mime === "jpg") && !isJpeg) {
    throw new HttpError(400, "El archivo no es una imagen JPG válida.");
  }
  if (mime === "png" && !isPng) {
    throw new HttpError(400, "El archivo no es una imagen PNG válida.");
  }
  if (mime === "webp" && !isWebp) {
    throw new HttpError(400, "El archivo no es una imagen WebP válida.");
  }

  const extension = mime === "jpeg" || mime === "jpg" ? "jpg" : mime;
  const filename = `${prefix}_${Date.now()}_${crypto.randomBytes(5).toString("hex")}.${extension}`;
  fs.writeFileSync(path.join(uploadsDir, filename), buffer, { mode: 0o644 });
  return `/uploads/${filename}`;
}

function removeUploadedImage(uploadsDir, imageUrl) {
  if (!String(imageUrl || "").startsWith("/uploads/")) return;
  const file = path.join(uploadsDir, path.basename(imageUrl));
  if (path.dirname(file) !== path.resolve(uploadsDir)) return;
  fs.rmSync(file, { force: true });
}


function cleanAiText(value, maxLength) {
  return String(value || "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/www\.\S+/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function prettyFileTitle(filename) {
  const base = String(filename || "")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!base || /^(img|image|photo|foto|imagen|whatsapp)[\s\d]*$/i.test(base)) return "";
  return base.replace(/\b\w/g, (letter) => letter.toUpperCase()).slice(0, 80);
}

function localProductSuggestion(input = {}) {
  const categoryLabel = CATEGORIES[input.category] || "Artículo";
  const condition = CONDITIONS.includes(input.condition) ? input.condition : "Buen estado";
  const title = cleanAiText(input.title, 90)
    || prettyFileTitle(input.filename)
    || `${categoryLabel} de segunda mano`;
  const price = Number(input.price) > 0 ? Math.round(Number(input.price)) : 0;
  const priceText = price ? `$${price.toLocaleString("es-MX")}` : "precio a tratar";
  const description = `${title}. Condición: ${condition}. ${categoryLabel} de segunda mano disponible en Bazar Los Cuates. Entrega en Av. Constitución 216, Jesús María. Contáctame por WhatsApp.`;
  return {
    title,
    description,
    facebookText: `¡En venta en Bazar Los Cuates! ${title} - ${priceText} - Av. Constitución 216 - ¡Contáctame por WhatsApp!`,
    source: "local",
  };
}

async function aiProductSuggestion(input = {}) {
  const fallback = localProductSuggestion(input);
  if (!DEEPSEEK_API_KEY) {
    return { ...fallback, notice: "DeepSeek no está configurado. Usamos una sugerencia local." };
  }

  const categoryLabel = CATEGORIES[input.category] || "Artículo";
  const condition = CONDITIONS.includes(input.condition) ? input.condition : "Buen estado";
  const price = Number(input.price) > 0 ? Math.round(Number(input.price)) : 0;
  const imageDataUrl = typeof input.imageDataUrl === "string" && /^data:image\/(jpeg|jpg|png|webp);base64,/i.test(input.imageDataUrl)
    ? input.imageDataUrl
    : "";
  const useVision = Boolean(imageDataUrl);
  const model = useVision ? DEEPSEEK_VISION_MODEL || DEEPSEEK_MODEL : DEEPSEEK_MODEL;

  const prompt = [
    "Eres el asistente de publicaciones de Bazar Los Cuates en Jesús María, Aguascalientes.",
    "Genera una publicación breve en español de México para vender un artículo de segunda mano.",
    "No inventes marcas, modelos, medidas ni defectos que no aparezcan en la foto o en los datos.",
    "No incluyas teléfonos, WhatsApp, correos, redes sociales ni enlaces.",
    "Devuelve únicamente JSON válido con las claves title, description y facebookText.",
    "title: máximo 70 caracteres, concreto y natural.",
    "description: máximo 240 caracteres, menciona condición y que el contacto es directo por WhatsApp.",
    "facebookText: una frase lista para publicar, con el precio si existe, la dirección Av. Constitución 216 y el texto ¡Contáctame por WhatsApp!.",
    `Datos: título actual: ${cleanAiText(input.title, 100) || "(sin título)"}; categoría: ${categoryLabel}; condición: ${condition}; precio MXN: ${price || "(sin precio)"}; archivo: ${cleanAiText(input.filename, 100) || "(sin nombre)"}.`,
  ].join("\n");

  const content = useVision
    ? [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: imageDataUrl, detail: "low" } },
      ]
    : prompt;

  try {
    const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content }],
        response_format: { type: "json_object" },
        temperature: 0.7,
        max_tokens: 500,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) throw new Error(`DeepSeek respondió ${response.status}`);
    const data = await response.json();
    const raw = data?.choices?.[0]?.message?.content;
    const parsed = typeof raw === "string" ? JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, "")) : raw;
    const title = cleanAiText(parsed?.title, 90) || fallback.title;
    const description = cleanAiText(parsed?.description, 600) || fallback.description;
    const facebookText = cleanAiText(parsed?.facebookText, 500) || fallback.facebookText;
    return { title, description, facebookText, source: "deepseek" };
  } catch {
    return { ...fallback, notice: "DeepSeek no respondió. Dejamos una sugerencia local para que puedas editarla." };
  }
}

async function handleApi(req, res, requestUrl, context) {
  const { db, uploadsDir } = context;
  const pathname = requestUrl.pathname;
  const method = req.method;

  if (pathname === "/api/health" && method === "GET") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (pathname === "/api/meta" && method === "GET") {
    const categoryRows = db.prepare(
      "SELECT category, COUNT(*) AS total FROM products WHERE status = 'active' GROUP BY category",
    ).all();
    const categoryCounts = Object.fromEntries(categoryRows.map((row) => [row.category, Number(row.total)]));
    const productCount = db.prepare("SELECT COUNT(*) AS total FROM products WHERE status = 'active'").get();
    const todayKey = mexicoDayKey(new Date());
    const todayProductCount = db.prepare("SELECT created_at FROM products WHERE status = 'active'").all()
      .filter((row) => mexicoDayKey(row.created_at) === todayKey).length;
    const visitsToday = Number(db.prepare(
      "SELECT COUNT(*) AS total FROM visitor_days WHERE day = ?",
    ).get(todayKey).total);
    const visitsTotal = Number(db.prepare(
      "SELECT COUNT(DISTINCT visitor_hash) AS total FROM visitor_days",
    ).get().total);

    sendJson(res, 200, {
      commissionRate: COMMISSION_RATE,
      categories: Object.entries(CATEGORIES).map(([key, label]) => ({
        key,
        label,
        count: categoryCounts[key] || 0,
      })),
      conditions: CONDITIONS,
      states: SERVICE_STATES,
      nearbyCities: NEARBY_CITIES,
      productCount: Number(productCount.total),
      todayProductCount,
      visitsToday,
      visitsTotal,
      heroImageUrl: getHeroImageUrl(db),
      aiEnabled: Boolean(DEEPSEEK_API_KEY),
    });
    return;
  }

  if (pathname === "/api/products" && method === "GET") {
    const category = String(requestUrl.searchParams.get("category") || "").trim();
    const state = String(requestUrl.searchParams.get("state") || "").trim();
    const query = String(requestUrl.searchParams.get("q") || "").trim().slice(0, 100);
    const sort = String(requestUrl.searchParams.get("sort") || "recent");
    const limit = Math.min(Math.max(Number(requestUrl.searchParams.get("limit")) || 24, 1), 60);
    const offset = Math.max(Number(requestUrl.searchParams.get("offset")) || 0, 0);

    const where = ["p.status = 'active'"];
    const params = [];

    if (category && CATEGORIES[category]) {
      where.push("p.category = ?");
      params.push(category);
    }
    if (SERVICE_STATES.includes(state)) {
      where.push("p.state = ?");
      params.push(state);
    }
    if (query) {
      where.push("(p.title LIKE ? COLLATE NOCASE OR p.description LIKE ? COLLATE NOCASE)");
      params.push(`%${query}%`, `%${query}%`);
    }

    const orderBy = sort === "price_asc"
      ? "p.price_cents ASC, p.created_at DESC"
      : sort === "price_desc"
        ? "p.price_cents DESC, p.created_at DESC"
        : "p.created_at DESC";

    const whereSql = where.join(" AND ");
    const total = db.prepare(`SELECT COUNT(*) AS total FROM products p WHERE ${whereSql}`).get(...params);
    const rows = db.prepare(`
      SELECT p.*, (
        SELECT COUNT(*) FROM offers o WHERE o.product_id = p.id AND o.status = 'pending'
      ) AS pending_offers
      FROM products p
      WHERE ${whereSql}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    sendJson(res, 200, {
      products: rows.map(productView),
      total: Number(total.total),
      limit,
      offset,
    });
    return;
  }

  const publicProductMatch = pathname.match(/^\/api\/products\/([A-Za-z0-9_-]+)$/);
  if (publicProductMatch && method === "GET") {
    const row = db.prepare(`
      SELECT p.*, (
        SELECT COUNT(*) FROM offers o WHERE o.product_id = p.id AND o.status = 'pending'
      ) AS pending_offers
      FROM products p
      WHERE p.public_id = ? AND p.status = 'active'
    `).get(publicProductMatch[1]);
    if (!row) throw new HttpError(404, "Producto no encontrado.");
    sendJson(res, 200, { product: productView(row) });
    return;
  }

  const productOfferMatch = pathname.match(/^\/api\/products\/([A-Za-z0-9_-]+)\/offers$/);
  if (productOfferMatch && method === "POST") {
    checkRateLimit(`offer:${clientIp(req)}`, 30, 60 * 60 * 1000);
    const product = db.prepare("SELECT * FROM products WHERE public_id = ? AND status = 'active'").get(
      productOfferMatch[1],
    );
    if (!product) throw new HttpError(404, "Producto no disponible.");

    const body = await readJson(req);
    if (body.termsAccepted !== true) {
      throw new HttpError(400, "Debes aceptar las condiciones de Bazar Los Cuates para ofertar.");
    }
    const validated = validateOffer(body);
    if (validated.error) throw new HttpError(400, validated.error);

    const offerPublicId = publicId("of");
    const token = randomToken(24);
    const timestamp = nowIso();
    const result = db.prepare(`
      INSERT INTO offers (
        public_id, token_hash, product_id, buyer_name, buyer_contact, current_cents,
        status, last_actor, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'pending', 'buyer', ?, ?)
    `).run(
      offerPublicId,
      sha256(token),
      product.id,
      validated.value.buyerName,
      validated.value.buyerContact,
      validated.value.amountCents,
      timestamp,
      timestamp,
    );

    insertOfferEvent(
      db,
      Number(result.lastInsertRowid),
      "buyer",
      "offer",
      validated.value.amountCents,
      validated.value.message,
    );

    sendJson(res, 201, {
      offer: {
        publicId: offerPublicId,
        token,
        currentCents: validated.value.amountCents,
        status: "pending",
      },
    });
    return;
  }

  const publicOfferMatch = pathname.match(/^\/api\/offers\/([A-Za-z0-9_-]+)$/);
  if (publicOfferMatch && method === "GET") {
    const token = requestUrl.searchParams.get("token") || "";
    const offer = getOfferByToken(db, publicOfferMatch[1], token);
    sendJson(res, 200, {
      offer: offerBaseView(offer, "buyer", db),
    });
    return;
  }

  const buyerOfferActionMatch = pathname.match(/^\/api\/offers\/([A-Za-z0-9_-]+)\/actions$/);
  if (buyerOfferActionMatch && method === "POST") {
    checkRateLimit(`offer-action:${clientIp(req)}`, 80, 60 * 60 * 1000);
    const token = requestUrl.searchParams.get("token") || "";
    const offer = getOfferByToken(db, buyerOfferActionMatch[1], token);
    const body = await readJson(req);
    const action = String(body.action || "");

    if (offer.status !== "pending") {
      throw new HttpError(409, "Esta oferta ya no está pendiente.");
    }

    if (action === "counter") {
      if (offer.last_actor !== "seller") {
        throw new HttpError(409, "Espera la respuesta del vendedor antes de contraofertar.");
      }
      const amountCents = toCents(body.amount);
      if (amountCents === null || amountCents < 100 || amountCents > 100000000) {
        throw new HttpError(400, "Escribe una contraoferta válida.");
      }
      const message = validateOfferMessage(body.message);
      if (message.error) throw new HttpError(400, message.error);
      const timestamp = nowIso();
      db.prepare("UPDATE offers SET current_cents = ?, last_actor = 'buyer', updated_at = ? WHERE id = ?").run(
        amountCents,
        timestamp,
        offer.id,
      );
      insertOfferEvent(db, offer.id, "buyer", "counter", amountCents, message.value);
      const updated = db.prepare("SELECT * FROM offers WHERE id = ?").get(offer.id);
      sendJson(res, 200, { offer: offerBaseView(updated, "buyer", db) });
      return;
    }

    if (action === "accept") {
      const updated = acceptOffer(db, offer, "buyer");
      sendJson(res, 200, { offer: offerBaseView(updated, "buyer", db) });
      return;
    }

    if (action === "reject") {
      const timestamp = nowIso();
      db.prepare("UPDATE offers SET status = 'rejected', last_actor = 'buyer', updated_at = ? WHERE id = ?").run(
        timestamp,
        offer.id,
      );
      insertOfferEvent(db, offer.id, "buyer", "rejected", null, null);
      const updated = db.prepare("SELECT * FROM offers WHERE id = ?").get(offer.id);
      sendJson(res, 200, { offer: offerBaseView(updated, "buyer", db) });
      return;
    }

    throw new HttpError(400, "Acción no válida.");
  }

  if (pathname === "/api/auth/register" && method === "POST") {
    throw new HttpError(403, "El registro de vendedores está deshabilitado. Bazar Los Cuates solo publica productos propios.");
  }

  if (pathname === "/api/auth/login" && method === "POST") {
    const body = await readJson(req);
    const validated = validateLogin(body);
    if (validated.error) throw new HttpError(400, validated.error);
    checkRateLimit(`login:${clientIp(req)}:${validated.value.email}`, 12, 15 * 60 * 1000);

    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(validated.value.email);
    if (!user || !verifyPassword(validated.value.password, user.password_hash)) {
      throw new HttpError(401, "Correo o contraseña incorrectos.");
    }
    if (user.status !== "active") {
      throw new HttpError(403, "Esta cuenta está suspendida.");
    }

    createSession(req, res, user.id, db);
    sendJson(res, 200, { user: userView(user) });
    return;
  }

  if (pathname === "/api/auth/logout" && method === "POST") {
    destroySession(req, res, db);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (pathname === "/api/auth/me" && method === "GET") {
    const user = currentUser(req, db);
    sendJson(res, 200, { user: user ? userView(user) : null });
    return;
  }

  if (pathname === "/api/seller/products" && method === "GET") {
    const seller = requireUser(req, db, "seller");
    const rows = db.prepare(`
      SELECT p.*, (
        SELECT COUNT(*) FROM offers o WHERE o.product_id = p.id AND o.status = 'pending'
      ) AS pending_offers,
      (SELECT COUNT(*) FROM offers o WHERE o.product_id = p.id) AS total_offers
      FROM products p
      WHERE p.seller_id = ?
      ORDER BY p.created_at DESC
    `).all(seller.id);

    sendJson(res, 200, {
      products: rows.map((row) => ({
        ...productView(row),
        id: row.id,
        totalOffers: Number(row.total_offers),
      })),
    });
    return;
  }

  if (pathname === "/api/seller/products" && method === "POST") {
    const seller = requireUser(req, db, "seller");
    const body = await readJson(req);
    const validated = validateProduct(body);
    if (validated.error) throw new HttpError(400, validated.error);

    const imageUrl = saveUploadedImage(body.imageDataUrl, uploadsDir);
    const productPublicId = publicId("p");
    const timestamp = nowIso();
    db.prepare(`
      INSERT INTO products (
        public_id, seller_id, title, description, category, condition, price_cents,
        state, city, image_url, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
    `).run(
      productPublicId,
      seller.id,
      validated.value.title,
      validated.value.description,
      validated.value.category,
      validated.value.condition,
      validated.value.priceCents,
      validated.value.state,
      validated.value.city,
      imageUrl,
      timestamp,
      timestamp,
    );

    const row = db.prepare("SELECT * FROM products WHERE public_id = ?").get(productPublicId);
    sendJson(res, 201, { product: productView(row) });
    return;
  }

  const sellerProductMatch = pathname.match(/^\/api\/seller\/products\/(\d+)$/);
  if (sellerProductMatch && method === "PATCH") {
    const seller = requireUser(req, db, "seller");
    const product = db.prepare("SELECT * FROM products WHERE id = ? AND seller_id = ?").get(
      Number(sellerProductMatch[1]),
      seller.id,
    );
    if (!product) throw new HttpError(404, "Producto no encontrado.");
    if (product.status === "sold") throw new HttpError(409, "Una venta cerrada no se puede modificar.");

    const body = await readJson(req);
    const status = String(body.status || "");
    if (!["active", "paused"].includes(status)) {
      throw new HttpError(400, "Estado no válido.");
    }

    db.prepare("UPDATE products SET status = ?, updated_at = ? WHERE id = ?").run(status, nowIso(), product.id);
    const updated = db.prepare("SELECT * FROM products WHERE id = ?").get(product.id);
    sendJson(res, 200, { product: productView(updated) });
    return;
  }

  if (pathname === "/api/seller/offers" && method === "GET") {
    const seller = requireUser(req, db, "seller");
    const rows = db.prepare(`
      SELECT o.*, p.title AS product_title, p.public_id AS product_public_id, p.image_url,
             p.price_cents AS product_price_cents, s.status AS commission_status
      FROM offers o
      JOIN products p ON p.id = o.product_id
      LEFT JOIN sales s ON s.offer_id = o.id
      WHERE p.seller_id = ?
      ORDER BY o.updated_at DESC
      LIMIT 100
    `).all(seller.id);

    sendJson(res, 200, {
      offers: rows.map((row) => ({
        publicId: row.public_id,
        currentCents: row.current_cents,
        status: row.status,
        lastActor: row.last_actor,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        commissionStatus: row.commission_status || null,
        buyer: {
          name: row.commission_status === "paid" ? row.buyer_name : "Comprador anónimo",
          contact: row.commission_status === "paid" ? row.buyer_contact : null,
        },
        product: {
          publicId: row.product_public_id,
          title: row.product_title,
          imageUrl: row.image_url,
          priceCents: row.product_price_cents,
        },
      })),
    });
    return;
  }

  const sellerOfferMatch = pathname.match(/^\/api\/seller\/offers\/([A-Za-z0-9_-]+)$/);
  if (sellerOfferMatch && method === "GET") {
    const seller = requireUser(req, db, "seller");
    const offer = db.prepare(`
      SELECT o.* FROM offers o
      JOIN products p ON p.id = o.product_id
      WHERE o.public_id = ? AND p.seller_id = ?
    `).get(sellerOfferMatch[1], seller.id);
    if (!offer) throw new HttpError(404, "Oferta no encontrada.");
    sendJson(res, 200, { offer: offerBaseView(offer, "seller", db) });
    return;
  }

  const sellerOfferActionMatch = pathname.match(/^\/api\/seller\/offers\/([A-Za-z0-9_-]+)\/actions$/);
  if (sellerOfferActionMatch && method === "POST") {
    const seller = requireUser(req, db, "seller");
    const offer = db.prepare(`
      SELECT o.* FROM offers o
      JOIN products p ON p.id = o.product_id
      WHERE o.public_id = ? AND p.seller_id = ?
    `).get(sellerOfferActionMatch[1], seller.id);
    if (!offer) throw new HttpError(404, "Oferta no encontrada.");
    if (offer.status !== "pending") throw new HttpError(409, "Esta oferta ya no está pendiente.");

    const body = await readJson(req);
    const action = String(body.action || "");

    if (action === "counter") {
      if (offer.last_actor !== "buyer") {
        throw new HttpError(409, "Espera la respuesta del comprador antes de contraofertar.");
      }
      const amountCents = toCents(body.amount);
      if (amountCents === null || amountCents < 100 || amountCents > 100000000) {
        throw new HttpError(400, "Escribe una contraoferta válida.");
      }
      const message = validateOfferMessage(body.message);
      if (message.error) throw new HttpError(400, message.error);
      const timestamp = nowIso();
      db.prepare("UPDATE offers SET current_cents = ?, last_actor = 'seller', updated_at = ? WHERE id = ?").run(
        amountCents,
        timestamp,
        offer.id,
      );
      insertOfferEvent(db, offer.id, "seller", "counter", amountCents, message.value);
      const updated = db.prepare("SELECT * FROM offers WHERE id = ?").get(offer.id);
      sendJson(res, 200, { offer: offerBaseView(updated, "seller", db) });
      return;
    }

    if (action === "accept") {
      const updated = acceptOffer(db, offer, "seller");
      sendJson(res, 200, { offer: offerBaseView(updated, "seller", db) });
      return;
    }

    if (action === "reject") {
      const timestamp = nowIso();
      db.prepare("UPDATE offers SET status = 'rejected', last_actor = 'seller', updated_at = ? WHERE id = ?").run(
        timestamp,
        offer.id,
      );
      insertOfferEvent(db, offer.id, "seller", "rejected", null, null);
      const updated = db.prepare("SELECT * FROM offers WHERE id = ?").get(offer.id);
      sendJson(res, 200, { offer: offerBaseView(updated, "seller", db) });
      return;
    }

    throw new HttpError(400, "Acción no válida.");
  }

  if (pathname === "/api/seller/sales" && method === "GET") {
    const seller = requireUser(req, db, "seller");
    const rows = db.prepare(`
      SELECT s.*, p.title AS product_title, p.public_id AS product_public_id, p.image_url,
             o.buyer_name, o.buyer_contact
      FROM sales s
      JOIN products p ON p.id = s.product_id
      JOIN offers o ON o.id = s.offer_id
      WHERE s.seller_id = ?
      ORDER BY s.created_at DESC
    `).all(seller.id);

    sendJson(res, 200, {
      sales: rows.map((row) => ({
        publicId: row.public_id,
        amountCents: row.amount_cents,
        commissionCents: row.commission_cents,
        status: row.status,
        createdAt: row.created_at,
        paidAt: row.paid_at,
        buyer: {
          name: row.status === "paid" ? row.buyer_name : "Comprador anónimo",
          contact: row.status === "paid" ? row.buyer_contact : null,
        },
        product: {
          publicId: row.product_public_id,
          title: row.product_title,
          imageUrl: row.image_url,
        },
      })),
    });
    return;
  }

  if (pathname === "/api/seller/summary" && method === "GET") {
    const seller = requireUser(req, db, "seller");
    const products = db.prepare("SELECT COUNT(*) AS total FROM products WHERE seller_id = ?").get(seller.id).total;
    const activeProducts = db.prepare(
      "SELECT COUNT(*) AS total FROM products WHERE seller_id = ? AND status = 'active'",
    ).get(seller.id).total;
    const pendingOffers = db.prepare(`
      SELECT COUNT(*) AS total FROM offers o
      JOIN products p ON p.id = o.product_id
      WHERE p.seller_id = ? AND o.status = 'pending'
    `).get(seller.id).total;
    const sales = db.prepare("SELECT COUNT(*) AS total FROM sales WHERE seller_id = ?").get(seller.id).total;
    const commissionPending = db.prepare(
      "SELECT COALESCE(SUM(commission_cents), 0) AS total FROM sales WHERE seller_id = ? AND status = 'pending'",
    ).get(seller.id).total;
    const commissionPaid = db.prepare(
      "SELECT COALESCE(SUM(commission_cents), 0) AS total FROM sales WHERE seller_id = ? AND status = 'paid'",
    ).get(seller.id).total;

    sendJson(res, 200, {
      summary: {
        products: Number(products),
        activeProducts: Number(activeProducts),
        pendingOffers: Number(pendingOffers),
        sales: Number(sales),
        commissionPendingCents: Number(commissionPending),
        commissionPaidCents: Number(commissionPaid),
      },
    });
    return;
  }

  if (pathname === "/api/admin/summary" && method === "GET") {
    requireUser(req, db, "admin");
    const countByStatus = (status) => Number(db.prepare(
      "SELECT COUNT(*) AS total FROM products WHERE status = ?",
    ).get(status).total);
    const todayKey = mexicoDayKey(new Date());
    const visitsToday = Number(db.prepare(
      "SELECT COUNT(*) AS total FROM visitor_days WHERE day = ?",
    ).get(todayKey).total);
    const visitsTotal = Number(db.prepare(
      "SELECT COUNT(DISTINCT visitor_hash) AS total FROM visitor_days",
    ).get().total);
    sendJson(res, 200, {
      summary: {
        totalProducts: countByStatus("active") + countByStatus("paused") + countByStatus("sold"),
        activeProducts: countByStatus("active"),
        pausedProducts: countByStatus("paused"),
        soldProducts: countByStatus("sold"),
        visitsToday,
        visitsTotal,
        heroImageUrl: getHeroImageUrl(db),
      },
    });
    return;
  }

  if (pathname === "/api/admin/ai/suggest" && method === "POST") {
    const admin = requireUser(req, db, "admin");
    checkRateLimit(`ai:${admin.id}`, 40, 60 * 60 * 1000);
    const body = await readJson(req);
    if (typeof body.imageDataUrl === "string" && body.imageDataUrl.length > 6 * 1024 * 1024) {
      throw new HttpError(413, "La foto es demasiado grande para analizarla.");
    }
    const suggestion = await aiProductSuggestion({
      imageDataUrl: body.imageDataUrl,
      title: String(body.title || "").slice(0, 110),
      category: String(body.category || "").slice(0, 40),
      condition: String(body.condition || "").slice(0, 40),
      price: Number(body.price) || 0,
      filename: String(body.filename || "").slice(0, 160),
    });
    sendJson(res, 200, { suggestion, aiEnabled: Boolean(DEEPSEEK_API_KEY) });
    return;
  }

  if (pathname === "/api/admin/hero" && method === "POST") {
    requireUser(req, db, "admin");
    const body = await readJson(req);
    const previousUrl = getHeroImageUrl(db);
    const imageUrl = saveUploadedImage(body.imageDataUrl, uploadsDir, "hero");
    setAppMeta(db, "hero_image_url", imageUrl);
    if (previousUrl !== imageUrl) removeUploadedImage(uploadsDir, previousUrl);
    sendJson(res, 200, { ok: true, url: imageUrl });
    return;
  }

  if ((pathname === "/api/admin/products" || pathname === "/api/productos/todos") && method === "DELETE") {
    requireUser(req, db, "admin");
    const totalProducts = Number(db.prepare("SELECT COUNT(*) AS total FROM products").get().total);
    db.exec("BEGIN");
    try {
      db.prepare("DELETE FROM offer_events").run();
      db.prepare("DELETE FROM offers").run();
      db.prepare("DELETE FROM sales").run();
      db.prepare("DELETE FROM products").run();
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }

    const heroImageUrl = getHeroImageUrl(db);
    const protectedHeroFile = heroImageUrl.startsWith("/uploads/") ? path.basename(heroImageUrl) : "";
    let deletedImages = 0;
    for (const entry of fs.readdirSync(uploadsDir, { withFileTypes: true })) {
      if (!entry.isFile() || entry.name === protectedHeroFile) continue;
      fs.rmSync(path.join(uploadsDir, entry.name), { force: true });
      deletedImages += 1;
    }
    sendJson(res, 200, {
      ok: true,
      deletedProducts: totalProducts,
      deletedImages,
      mensaje: "Catálogo borrado.",
    });
    return;
  }

  if (pathname === "/api/admin/products" && method === "GET") {
    requireUser(req, db, "admin");
    const status = String(requestUrl.searchParams.get("status") || "").trim();
    const where = [];
    const params = [];
    if (["active", "paused", "sold", "suspended"].includes(status)) {
      where.push("p.status = ?");
      params.push(status);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const rows = db.prepare(`
      SELECT p.*, u.name AS seller_name, u.email AS seller_email, u.phone AS seller_phone,
             (SELECT COUNT(*) FROM offers o WHERE o.product_id = p.id) AS total_offers
      FROM products p
      JOIN users u ON u.id = p.seller_id
      ${whereSql}
      ORDER BY p.created_at DESC
    `).all(...params);

    sendJson(res, 200, {
      products: rows.map((row) => ({
        ...productView(row),
        id: row.id,
        totalOffers: Number(row.total_offers),
        seller: { name: row.seller_name, email: row.seller_email, phone: row.seller_phone },
      })),
    });
    return;
  }

  if (pathname === "/api/admin/products" && method === "POST") {
    const admin = requireUser(req, db, "admin");
    const body = await readJson(req);
    const validated = validateProduct(body);
    if (validated.error) throw new HttpError(400, validated.error);

    const imageUrl = saveUploadedImage(body.imageDataUrl, uploadsDir);
    const productPublicId = publicId("p");
    const timestamp = nowIso();
    db.prepare(`
      INSERT INTO products (
        public_id, seller_id, title, description, category, condition, price_cents,
        state, city, image_url, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
    `).run(
      productPublicId,
      admin.id,
      validated.value.title,
      validated.value.description,
      validated.value.category,
      validated.value.condition,
      validated.value.priceCents,
      validated.value.state,
      validated.value.city,
      imageUrl,
      timestamp,
      timestamp,
    );

    const row = db.prepare("SELECT * FROM products WHERE public_id = ?").get(productPublicId);
    sendJson(res, 201, { product: productView(row) });
    return;
  }

  const adminProductMatch = pathname.match(/^\/api\/admin\/products\/(\d+)$/);
  if (adminProductMatch && method === "PATCH") {
    requireUser(req, db, "admin");
    const product = db.prepare("SELECT * FROM products WHERE id = ?").get(Number(adminProductMatch[1]));
    if (!product) throw new HttpError(404, "Producto no encontrado.");

    const body = await readJson(req);
    const status = body.status === undefined ? product.status : String(body.status || "");
    if (!["active", "paused", "suspended", "sold"].includes(status)) {
      throw new HttpError(400, "Estado no válido.");
    }

    const contentKeys = ["title", "description", "price", "category", "condition", "state", "city", "imageDataUrl"];
    const updatesContent = contentKeys.some((key) => Object.prototype.hasOwnProperty.call(body, key));
    if (product.status === "sold" && (updatesContent || status !== "active")) {
      throw new HttpError(409, "Una pieza vendida solo se puede volver a publicar.");
    }
    let values = {
      title: product.title,
      description: product.description,
      category: product.category,
      condition: product.condition,
      priceCents: product.price_cents,
      state: product.state,
      city: product.city,
      image_url: product.image_url,
    };

    if (updatesContent) {
      const validated = validateProduct({
        title: body.title ?? product.title,
        description: body.description ?? product.description,
        price: body.price ?? product.price_cents / 100,
        category: body.category ?? product.category,
        condition: body.condition ?? product.condition,
        state: body.state ?? product.state,
        city: body.city ?? product.city,
      });
      if (validated.error) throw new HttpError(400, validated.error);
      values = {
        ...validated.value,
        image_url: body.imageDataUrl
          ? saveUploadedImage(body.imageDataUrl, uploadsDir)
          : product.image_url,
      };
    }

    db.prepare(`
      UPDATE products
      SET title = ?, description = ?, category = ?, condition = ?, price_cents = ?,
          state = ?, city = ?, image_url = ?, status = ?, updated_at = ?
      WHERE id = ?
    `).run(
      values.title,
      values.description,
      values.category,
      values.condition,
      values.priceCents,
      values.state,
      values.city,
      values.image_url,
      status,
      nowIso(),
      product.id,
    );
    const updated = db.prepare("SELECT * FROM products WHERE id = ?").get(product.id);
    if (body.imageDataUrl) removeUploadedImage(uploadsDir, product.image_url);
    sendJson(res, 200, { product: productView(updated) });
    return;
  }

  const adminProductDeleteMatch = pathname.match(/^\/api\/admin\/products\/(\d+)$/);
  if (adminProductDeleteMatch && method === "DELETE") {
    requireUser(req, db, "admin");
    const product = db.prepare("SELECT * FROM products WHERE id = ?").get(Number(adminProductDeleteMatch[1]));
    if (!product) throw new HttpError(404, "Producto no encontrado.");
    if (product.status === "sold") throw new HttpError(409, "Las piezas vendidas se conservan en el historial.");

    db.exec("BEGIN");
    try {
      db.prepare("DELETE FROM offer_events WHERE offer_id IN (SELECT id FROM offers WHERE product_id = ?)").run(product.id);
      db.prepare("DELETE FROM offers WHERE product_id = ?").run(product.id);
      db.prepare("DELETE FROM sales WHERE product_id = ?").run(product.id);
      db.prepare("DELETE FROM products WHERE id = ?").run(product.id);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    removeUploadedImage(uploadsDir, product.image_url);
    sendJson(res, 200, { ok: true, deleted: true, status: "deleted" });
    return;
  }

  if (pathname === "/api/admin/offers" && method === "GET") {
    requireUser(req, db, "admin");
    const status = String(requestUrl.searchParams.get("status") || "").trim();
    const where = [];
    const params = [];
    if (["pending", "accepted", "rejected"].includes(status)) {
      where.push("o.status = ?");
      params.push(status);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const rows = db.prepare(`
      SELECT o.*, p.title AS product_title, p.public_id AS product_public_id, p.image_url,
             p.price_cents AS product_price_cents,
             seller.name AS seller_name, seller.email AS seller_email, seller.phone AS seller_phone
      FROM offers o
      JOIN products p ON p.id = o.product_id
      JOIN users seller ON seller.id = p.seller_id
      ${whereSql}
      ORDER BY o.updated_at DESC
    `).all(...params);

    sendJson(res, 200, {
      offers: rows.map((row) => ({
        publicId: row.public_id,
        currentCents: row.current_cents,
        status: row.status,
        lastActor: row.last_actor,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        buyer: { name: row.buyer_name, contact: row.buyer_contact },
        seller: { name: row.seller_name, email: row.seller_email, phone: row.seller_phone },
        product: {
          publicId: row.product_public_id,
          title: row.product_title,
          imageUrl: row.image_url,
          priceCents: row.product_price_cents,
        },
      })),
    });
    return;
  }

  const adminOfferMatch = pathname.match(/^\/api\/admin\/offers\/([A-Za-z0-9_-]+)$/);
  if (adminOfferMatch && method === "GET") {
    requireUser(req, db, "admin");
    const offer = db.prepare("SELECT * FROM offers WHERE public_id = ?").get(adminOfferMatch[1]);
    if (!offer) throw new HttpError(404, "Oferta no encontrada.");
    sendJson(res, 200, { offer: offerBaseView(offer, "admin", db) });
    return;
  }

  const adminOfferActionMatch = pathname.match(/^\/api\/admin\/offers\/([A-Za-z0-9_-]+)\/actions$/);
  if (adminOfferActionMatch && method === "POST") {
    requireUser(req, db, "admin");
    const offer = db.prepare("SELECT * FROM offers WHERE public_id = ?").get(adminOfferActionMatch[1]);
    if (!offer) throw new HttpError(404, "Oferta no encontrada.");
    if (offer.status !== "pending") throw new HttpError(409, "Esta oferta ya no está pendiente.");

    const body = await readJson(req);
    const action = String(body.action || "");

    if (action === "counter") {
      if (offer.last_actor !== "buyer") {
        throw new HttpError(409, "El comprador debe responder antes de contraofertar.");
      }
      const amountCents = toCents(body.amount);
      if (amountCents === null || amountCents < 100 || amountCents > 100000000) {
        throw new HttpError(400, "Escribe una contraoferta válida.");
      }
      const message = validateOfferMessage(body.message);
      if (message.error) throw new HttpError(400, message.error);
      const timestamp = nowIso();
      db.prepare("UPDATE offers SET current_cents = ?, last_actor = 'seller', updated_at = ? WHERE id = ?").run(
        amountCents,
        timestamp,
        offer.id,
      );
      insertOfferEvent(db, offer.id, "seller", "counter", amountCents, message.value);
      const updated = db.prepare("SELECT * FROM offers WHERE id = ?").get(offer.id);
      sendJson(res, 200, { offer: offerBaseView(updated, "admin", db) });
      return;
    }

    if (action === "accept") {
      const updated = acceptOffer(db, offer, "seller");
      sendJson(res, 200, { offer: offerBaseView(updated, "admin", db) });
      return;
    }

    if (action === "reject") {
      const timestamp = nowIso();
      db.prepare("UPDATE offers SET status = 'rejected', last_actor = 'seller', updated_at = ? WHERE id = ?").run(
        timestamp,
        offer.id,
      );
      insertOfferEvent(db, offer.id, "seller", "rejected", null, null);
      const updated = db.prepare("SELECT * FROM offers WHERE id = ?").get(offer.id);
      sendJson(res, 200, { offer: offerBaseView(updated, "admin", db) });
      return;
    }

    throw new HttpError(400, "Acción no válida.");
  }

  if (pathname === "/api/admin/sales" && method === "GET") {
    requireUser(req, db, "admin");
    const rows = db.prepare(`
      SELECT s.*, p.title AS product_title, p.public_id AS product_public_id,
             seller.name AS seller_name, seller.email AS seller_email, seller.phone AS seller_phone,
             o.buyer_name, o.buyer_contact
      FROM sales s
      JOIN products p ON p.id = s.product_id
      JOIN users seller ON seller.id = s.seller_id
      JOIN offers o ON o.id = s.offer_id
      ORDER BY s.created_at DESC
    `).all();

    sendJson(res, 200, {
      sales: rows.map((row) => ({
        id: row.id,
        publicId: row.public_id,
        amountCents: row.amount_cents,
        commissionCents: row.commission_cents,
        status: row.status,
        createdAt: row.created_at,
        paidAt: row.paid_at,
        buyer: { name: row.buyer_name, contact: row.buyer_contact },
        seller: { name: row.seller_name, email: row.seller_email, phone: row.seller_phone },
        product: {
          publicId: row.product_public_id,
          title: row.product_title,
        },
      })),
    });
    return;
  }

  const adminSaleMatch = pathname.match(/^\/api\/admin\/sales\/(\d+)$/);
  if (adminSaleMatch && method === "PATCH") {
    requireUser(req, db, "admin");
    const sale = db.prepare("SELECT * FROM sales WHERE id = ?").get(Number(adminSaleMatch[1]));
    if (!sale) throw new HttpError(404, "Venta no encontrada.");
    const body = await readJson(req);
    const status = String(body.status || "");
    if (!["pending", "paid"].includes(status)) {
      throw new HttpError(400, "Estado no válido.");
    }
    db.prepare("UPDATE sales SET status = ?, paid_at = ? WHERE id = ?").run(
      status,
      status === "paid" ? nowIso() : null,
      sale.id,
    );
    sendJson(res, 200, { ok: true, status });
    return;
  }

  if (pathname === "/api/admin/users" && method === "GET") {
    requireUser(req, db, "admin");
    const rows = db.prepare(`
      SELECT u.*, 
             (SELECT COUNT(*) FROM products p WHERE p.seller_id = u.id) AS product_count,
             (SELECT COUNT(*) FROM sales s WHERE s.seller_id = u.id) AS sale_count
      FROM users u
      WHERE u.role = 'seller'
      ORDER BY u.created_at DESC
    `).all();

    sendJson(res, 200, {
      users: rows.map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        phone: row.phone,
        status: row.status,
        createdAt: row.created_at,
        productCount: Number(row.product_count),
        saleCount: Number(row.sale_count),
      })),
    });
    return;
  }

  const adminUserMatch = pathname.match(/^\/api\/admin\/users\/(\d+)$/);
  if (adminUserMatch && method === "PATCH") {
    requireUser(req, db, "admin");
    const user = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'seller'").get(
      Number(adminUserMatch[1]),
    );
    if (!user) throw new HttpError(404, "Vendedor no encontrado.");
    const body = await readJson(req);
    const status = String(body.status || "");
    if (!["active", "suspended"].includes(status)) {
      throw new HttpError(400, "Estado no válido.");
    }
    db.prepare("UPDATE users SET status = ? WHERE id = ?").run(status, user.id);
    if (status === "suspended") {
      db.prepare("DELETE FROM sessions WHERE user_id = ?").run(user.id);
    }
    sendJson(res, 200, { ok: true, status });
    return;
  }

  throw new HttpError(404, "Ruta no encontrada.");
}

function serverEscapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function serveProductSharePage(req, res, publicIdValue, context) {
  const product = context.db.prepare(
    "SELECT * FROM products WHERE public_id = ? AND status = 'active'",
  ).get(publicIdValue);
  if (!product) throw new HttpError(404, "Producto no encontrado.");

  const protocol = String(req.headers["x-forwarded-proto"] || "http").split(",")[0].trim();
  const host = req.headers.host || "localhost";
  const base = `${protocol}://${host}`;
  const pageUrl = `${base}/p/${encodeURIComponent(product.public_id)}`;
  const imageUrl = new URL(product.image_url, base).toString();
  const title = `${product.title} | Bazar Los Cuates - Jesús María`;
  const description = `${product.description}`.replace(/\s+/g, " ").trim().slice(0, 190);
  const price = (Number(product.price_cents) / 100).toFixed(2);

  let html = fs.readFileSync(path.join(context.root, "producto.html"), "utf8");
  html = html
    .replace(/<title>[^<]*<\/title>/i, `<title>${serverEscapeHtml(title)}</title>`)
    .replace(
      /<meta name="description" content="[^"]*">/i,
      `<meta name="description" content="${serverEscapeHtml(description)}">
  <link rel="canonical" href="${serverEscapeHtml(pageUrl)}">
  <meta property="og:type" content="product">
  <meta property="og:site_name" content="Bazar Los Cuates">
  <meta property="og:title" content="${serverEscapeHtml(`${product.title} - Bazar Los Cuates`)}">
  <meta property="og:description" content="${serverEscapeHtml(description)}">
  <meta property="og:url" content="${serverEscapeHtml(pageUrl)}">
  <meta property="og:image" content="${serverEscapeHtml(imageUrl)}">
  <meta property="og:image:alt" content="${serverEscapeHtml(product.title)}">
  <meta property="product:price:amount" content="${price}">
  <meta property="product:price:currency" content="MXN">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${serverEscapeHtml(`${product.title} - Bazar Los Cuates`)}">
  <meta name="twitter:description" content="${serverEscapeHtml(description)}">
  <meta name="twitter:image" content="${serverEscapeHtml(imageUrl)}">`,
    )
    .replace(
      '<link rel="stylesheet" href="styles.css">',
      `<meta name="bc-product-id" content="${serverEscapeHtml(product.public_id)}">\n  <link rel="stylesheet" href="styles.css">`,
    );

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Content-Length", Buffer.byteLength(html));
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  res.end(html);
}

function serveStatic(req, res, pathname, context) {
  let filePath = null;

  if (PAGE_FILES.has(pathname)) {
    filePath = path.join(context.root, PAGE_FILES.get(pathname));
  } else if (STATIC_FILES.has(pathname)) {
    filePath = path.join(context.root, STATIC_FILES.get(pathname));
  } else if (pathname.startsWith("/assets/")) {
    filePath = safeJoin(context.root, "assets", pathname.slice("/assets/".length));
  } else if (pathname.startsWith("/uploads/")) {
    filePath = safeJoin(context.uploadsDir, "", pathname.slice("/uploads/".length));
  }

  if (!filePath) {
    throw new HttpError(404, "Página no encontrada.");
  }

  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    throw new HttpError(404, "Archivo no encontrado.");
  }

  if (!stat.isFile()) {
    throw new HttpError(404, "Archivo no encontrado.");
  }

  const extension = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[extension] || "application/octet-stream";
  res.statusCode = 200;
  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Length", stat.size);
  const revalidate = [".html", ".js", ".css"].includes(extension);
  res.setHeader("Cache-Control", revalidate ? "no-cache" : "public, max-age=3600");

  if (req.method === "HEAD") {
    res.end();
    return;
  }

  fs.createReadStream(filePath)
    .on("error", () => {
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end("Error al leer el archivo.");
      } else {
        res.end();
      }
    })
    .pipe(res);
}

function safeJoin(base, subfolder, requestedPath) {
  const basePath = path.resolve(base, subfolder);
  const candidate = path.resolve(basePath, requestedPath);
  if (candidate !== basePath && !candidate.startsWith(`${basePath}${path.sep}`)) {
    throw new HttpError(404, "Archivo no encontrado.");
  }
  return candidate;
}

function start() {
  const port = Number(process.env.PORT) || 3000;
  const app = createApp();
  app.server.listen(port, () => {
    console.log(`Bazar Los Cuates - Jesús María: http://localhost:${port}`);
  });

  const shutdown = () => {
    app.server.close(() => {
      app.close();
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

if (require.main === module) {
  start();
}

module.exports = {
  createApp,
};
