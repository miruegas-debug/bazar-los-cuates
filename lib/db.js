const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");
const { hashPassword } = require("./security");

const DEMO_PRODUCTS = [
  ["demo-taladro", "Taladro percutor 1/2″", "Taladro de 750 W con función de percusión, mango auxiliar y cable en buen estado. Ideal para trabajos de casa y taller.", "herramientas", "Buen estado", 125000, "Aguascalientes", "Jesús María", "/assets/taladro.jpg"],
  ["demo-sierra", "Sierra circular 7 1/4″", "Sierra circular de 1,400 W con guía paralela y disco para madera. Se entrega probada y funcionando.", "herramientas", "Buen estado", 145000, "Aguascalientes", "Jesús María", "/assets/sierra-circular.jpg"],
  ["demo-caja-herramientas", "Caja de herramientas metálica", "Caja resistente con charola interior, organizadores y cierre de seguridad. Tiene marcas leves de uso.", "herramientas", "Buen estado", 65000, "Aguascalientes", "Aguascalientes", "/assets/caja-herramientas.jpg"],
  ["demo-llaves", "Juego de llaves 12 piezas", "Juego de llaves combinadas de acero en medidas estándar. Se entrega completo y ordenado.", "herramientas", "Como nuevo", 48000, "Aguascalientes", "Jesús María", "/assets/juego-llaves.jpg"],
  ["demo-sofa", "Sofá de 3 plazas", "Sofá tapizado en tela gris con cojines cómodos y estructura firme. Medidas disponibles por mensaje dentro de la plataforma.", "muebles", "Buen estado", 380000, "Aguascalientes", "Aguascalientes", "/assets/sofa.jpg"],
  ["demo-sillon", "Sillón individual nórdico", "Sillón compacto con patas de madera y tapiz claro. Queda muy bien en espacios pequeños.", "muebles", "Como nuevo", 230000, "Aguascalientes", "Jesús María", "/assets/sillon.jpg"],
  ["demo-silla-oficina", "Silla de oficina ergonómica", "Silla con respaldo de malla, altura ajustable, descansabrazos y ruedas. Lista para home office.", "muebles", "Buen estado", 135000, "Aguascalientes", "Aguascalientes", "/assets/silla-oficina.jpg"],
  ["demo-mesa", "Mesa de comedor para 6", "Mesa de madera resistente para seis personas. Ideal para espacios familiares y reuniones.", "muebles", "Buen estado", 320000, "Aguascalientes", "Calvillo", "/assets/mesa-comedor.jpg"],
  ["demo-jbl", "Bocina JBL Bluetooth", "Bocina portátil con buen volumen, batería y conexión Bluetooth. Se entrega con cable de carga.", "bocinas", "Buen estado", 120000, "Aguascalientes", "Jesús María", "/assets/bocina-jbl.jpg"],
  ["demo-sonos", "Bocina Sonos multiroom", "Bocina para interiores con sonido equilibrado y conexión WiFi. Funciona correctamente.", "bocinas", "Como nuevo", 260000, "Aguascalientes", "Aguascalientes", "/assets/bocina-sonos.jpg"],
  ["demo-bocina-portatil", "Bocina portátil recargable", "Altavoz compacto con batería recargable y entrada auxiliar. Excelente para llevarla a cualquier lado.", "bocinas", "Buen estado", 55000, "Aguascalientes", "Calvillo", "/assets/bocina-portatil.jpg"],
  ["demo-set-cuchillos", "Set de cuchillos con base", "Juego de seis piezas con base para almacenaje seguro. Cuchillos limpios y con buen filo.", "cuchillos", "Como nuevo", 75000, "Aguascalientes", "Jesús María", "/assets/set-cuchillos.jpg"],
  ["demo-cuchillo-chef", "Cuchillo de chef profesional", "Cuchillo de acero inoxidable con filo parejo y buen agarre. Pieza individual.", "cuchillos", "Buen estado", 42000, "Aguascalientes", "Aguascalientes", "/assets/cuchillo-chef.jpg"],
  ["demo-cuchillos-base", "Cuchillos con base de madera", "Juego de cuchillos de cocina con base de madera natural. Se entrega completo.", "cuchillos", "Como nuevo", 68000, "Aguascalientes", "Jesús María", "/assets/cuchillos-base.jpg"],
  ["demo-microondas", "Microondas 1.1 pies cúbicos", "Microondas de mesa con panel digital, varias funciones y plato giratorio. Funciona bien.", "electrodomesticos", "Buen estado", 110000, "Aguascalientes", "Aguascalientes", "/assets/microondas.jpg"],
  ["demo-cafetera", "Cafetera de goteo 12 tazas", "Cafetera con jarra de vidrio y placa térmica. Ideal para oficina o casa.", "electrodomesticos", "Como nuevo", 85000, "Aguascalientes", "Jesús María", "/assets/cafetera.jpg"],
  ["demo-lavadora", "Lavadora automática 19 kg", "Lavadora de carga superior con ciclos automáticos. Se entrega limpia y probada.", "electrodomesticos", "Buen estado", 350000, "Aguascalientes", "Calvillo", "/assets/lavadora.jpg"],
  ["demo-refrigerador", "Refrigerador 2 puertas", "Refrigerador de 11 pies con congelador y buen enfriamiento. Sin fugas ni ruidos extraños.", "electrodomesticos", "Buen estado", 420000, "Aguascalientes", "Aguascalientes", "/assets/refrigerador.jpg"],
];

function nowIso() {
  return new Date().toISOString();
}

function createDatabase(options = {}) {
  const dataDir = options.dataDir;
  const uploadsDir = path.join(dataDir, "uploads");
  fs.mkdirSync(uploadsDir, { recursive: true });

  const db = new DatabaseSync(path.join(dataDir, "marketplace.sqlite"));
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT NOT NULL CHECK (role IN ('seller', 'admin')),
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      phone TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      public_id TEXT NOT NULL UNIQUE,
      seller_id INTEGER NOT NULL REFERENCES users(id),
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      condition TEXT NOT NULL,
      price_cents INTEGER NOT NULL,
      state TEXT NOT NULL,
      city TEXT NOT NULL,
      image_url TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'sold', 'suspended')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS visitor_days (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      visitor_hash TEXT NOT NULL,
      day TEXT NOT NULL,
      path TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS offers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      public_id TEXT NOT NULL UNIQUE,
      token_hash TEXT NOT NULL,
      product_id INTEGER NOT NULL REFERENCES products(id),
      buyer_name TEXT NOT NULL,
      buyer_contact TEXT NOT NULL,
      current_cents INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
      last_actor TEXT NOT NULL CHECK (last_actor IN ('buyer', 'seller', 'system')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS offer_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      offer_id INTEGER NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
      actor TEXT NOT NULL CHECK (actor IN ('buyer', 'seller', 'system')),
      type TEXT NOT NULL,
      amount_cents INTEGER,
      message TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      public_id TEXT NOT NULL UNIQUE,
      offer_id INTEGER NOT NULL UNIQUE REFERENCES offers(id),
      product_id INTEGER NOT NULL REFERENCES products(id),
      seller_id INTEGER NOT NULL REFERENCES users(id),
      amount_cents INTEGER NOT NULL,
      commission_cents INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
      created_at TEXT NOT NULL,
      paid_at TEXT
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_visitor_days_unique ON visitor_days(visitor_hash, day);
    CREATE INDEX IF NOT EXISTS idx_visitor_days_day ON visitor_days(day);
    CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
    CREATE INDEX IF NOT EXISTS idx_products_state_city ON products(state, city);
    CREATE INDEX IF NOT EXISTS idx_products_seller ON products(seller_id);
    CREATE INDEX IF NOT EXISTS idx_offers_product ON offers(product_id);
    CREATE INDEX IF NOT EXISTS idx_offers_status ON offers(status);
    CREATE INDEX IF NOT EXISTS idx_sales_seller ON sales(seller_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  `);

  ensureAdmin(db, dataDir, options);
  migrateToSingleOwner(db);

  const shouldSeedDemo = options.seedDemo ?? (
    process.env.SEED_DEMO === "true" ||
    (process.env.SEED_DEMO !== "false" && process.env.RENDER !== "true" && process.env.NODE_ENV !== "production")
  );
  if (shouldSeedDemo) {
    seedDemo(db);
  }

  return { db, uploadsDir };
}

function ensureAdmin(db, dataDir, options) {
  const name = String(options.adminName || process.env.ADMIN_NAME || "Bazar Los Cuates");
  const phone = String(options.adminPhone || process.env.ADMIN_PHONE || "4491883244");
  const existing = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
  if (existing) {
    db.prepare("UPDATE users SET name = ?, phone = ? WHERE id = ?").run(name, phone, existing.id);
    return;
  }

  const email = String(options.adminEmail || process.env.ADMIN_EMAIL || "admin@bazarlos-cuates.local")
    .trim()
    .toLowerCase();
  const generated = !options.adminPassword && !process.env.ADMIN_PASSWORD;
  const password = generated
    ? crypto.randomBytes(9).toString("base64url")
    : String(options.adminPassword || process.env.ADMIN_PASSWORD);

  db.prepare(
    "INSERT INTO users (role, name, email, phone, password_hash, created_at) VALUES ('admin', ?, ?, ?, ?, ?)",
  ).run(name, email, phone, hashPassword(password), nowIso());

  const credentialsFile = path.join(dataDir, "admin-credentials.txt");
  fs.writeFileSync(
    credentialsFile,
    `Panel: /admin.html\nCorreo: ${email}\nContraseña: ${password}\nCambia estas credenciales en producción.\n`,
    { mode: 0o600 },
  );
  fs.chmodSync(credentialsFile, 0o600);

  console.log(`Administrador creado. Credenciales guardadas en ${credentialsFile}`);
}

function migrateToSingleOwner(db) {
  const admin = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
  if (!admin) return;

  const sellers = db.prepare("SELECT id FROM users WHERE role = 'seller'").all();
  if (!sellers.length) return;

  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("UPDATE products SET seller_id = ? WHERE seller_id IN (SELECT id FROM users WHERE role = 'seller')").run(admin.id);
    db.prepare("UPDATE sales SET seller_id = ? WHERE seller_id IN (SELECT id FROM users WHERE role = 'seller')").run(admin.id);
    db.prepare("DELETE FROM users WHERE role = 'seller'").run();
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function seedDemo(db) {
  const seeded = db.prepare("SELECT value FROM app_meta WHERE key = 'demo_seeded'").get();
  if (seeded) return;

  const productCount = Number(db.prepare("SELECT COUNT(*) AS total FROM products").get().total);
  const seller = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
  if (!seller) return;

  if (productCount > 0) {
    db.prepare("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('demo_seeded', ?)").run(nowIso());
    return;
  }

  const insert = db.prepare(`
    INSERT INTO products (
      public_id, seller_id, title, description, category, condition, price_cents,
      state, city, image_url, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
  `);

  const createdAt = nowIso();
  db.exec("BEGIN");
  try {
    for (const product of DEMO_PRODUCTS) {
      insert.run(
        product[0],
        seller.id,
        product[1],
        product[2],
        product[3],
        product[4],
        product[5],
        product[6],
        product[7],
        product[8],
        createdAt,
        createdAt,
      );
    }
    db.prepare("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('demo_seeded', ?)").run(createdAt);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

module.exports = {
  createDatabase,
  nowIso,
};
