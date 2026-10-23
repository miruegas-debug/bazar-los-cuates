const COMMISSION_RATE = 0.1;

const CATEGORIES = {
  herramientas: "Herramientas",
  muebles: "Muebles",
  bocinas: "Bocinas",
  cuchillos: "Cuchillos",
  electrodomesticos: "Electrodomésticos",
  otros: "Otros",
};

const CONDITIONS = [
  "Como nuevo",
  "Buen estado",
  "Con detalles",
  "Para refacciones",
];

const SERVICE_STATES = ["Aguascalientes"];

const NEARBY_CITIES = [
  "Aguascalientes",
  "Jesús María",
  "Calvillo",
  "San Francisco de los Romo",
  "Pabellón de Arteaga",
  "Rincón de Romos",
  "Asientos",
  "Tepezalá",
  "Cosío",
  "San José de Gracia",
  "El Llano",
];

const PRODUCT_STATUSES = ["active", "paused", "sold", "suspended"];
const OFFER_STATUSES = ["pending", "accepted", "rejected"];

module.exports = {
  COMMISSION_RATE,
  CATEGORIES,
  CONDITIONS,
  SERVICE_STATES,
  NEARBY_CITIES,
  PRODUCT_STATUSES,
  OFFER_STATUSES,
};
