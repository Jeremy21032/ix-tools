/**
 * Generadores de documentos sintéticos con formato / dígito verificador válidos.
 * NO representan identidades reales; solo para testing de formularios y validadores.
 */

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randDigits(n) {
  let s = "";
  for (let i = 0; i < n; i++) s += String(randInt(0, 9));
  return s;
}

function randDigitsNoLeadingZero(n) {
  if (n <= 0) return "";
  return String(randInt(1, 9)) + randDigits(n - 1);
}

// ——— Chile RUT ———
function chileRutCheckDigit(body) {
  const digits = String(body).replace(/\D/g, "");
  let sum = 0;
  let mul = 2;
  for (let i = digits.length - 1; i >= 0; i--) {
    sum += Number(digits[i]) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const rem = 11 - (sum % 11);
  if (rem === 11) return "0";
  if (rem === 10) return "K";
  return String(rem);
}

function generateChileRut() {
  const body = randDigitsNoLeadingZero(randInt(7, 8));
  const dv = chileRutCheckDigit(body);
  const formatted = `${body.slice(0, -3).replace(/\B(?=(\d{3})+(?!\d))/g, ".")}.${body.slice(-3)}-${dv}`;
  return {
    raw: `${body}-${dv}`,
    formatted,
    validChecksum: true,
  };
}

function validateChileRut(value) {
  const clean = String(value).toUpperCase().replace(/[^0-9K]/g, "");
  if (clean.length < 2) return false;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  return chileRutCheckDigit(body) === dv;
}

// ——— Colombia NIT ———
const CO_NIT_WEIGHTS = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];

function colombiaNitCheckDigit(body) {
  const digits = String(body).replace(/\D/g, "");
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    const d = Number(digits[digits.length - 1 - i]);
    const w = CO_NIT_WEIGHTS[i];
    if (w == null) break;
    sum += d * w;
  }
  const rem = sum % 11;
  return String(rem < 2 ? rem : 11 - rem);
}

function generateColombiaNit() {
  const body = randDigitsNoLeadingZero(9);
  const dv = colombiaNitCheckDigit(body);
  return {
    raw: `${body}${dv}`,
    formatted: `${body}-${dv}`,
    validChecksum: true,
  };
}

function validateColombiaNit(value) {
  const digits = String(value).replace(/\D/g, "");
  if (digits.length < 2) return false;
  const body = digits.slice(0, -1);
  const dv = digits.slice(-1);
  return colombiaNitCheckDigit(body) === dv;
}

/** Cédula CO: numérica 6–10 dígitos (sin DV oficial uniforme). */
function generateColombiaCedula() {
  const raw = randDigitsNoLeadingZero(randInt(7, 10));
  return { raw, formatted: raw, validChecksum: true };
}

function validateColombiaCedula(value) {
  return /^\d{6,10}$/.test(String(value).replace(/\D/g, ""));
}

// ——— Perú RUC / DNI ———
function peruRucCheckDigit(body10) {
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const digits = String(body10).replace(/\D/g, "").padStart(10, "0").slice(0, 10);
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(digits[i]) * weights[i];
  const rem = 11 - (sum % 11);
  if (rem === 10) return "0";
  if (rem === 11) return "1";
  return String(rem);
}

function generatePeruRuc({ juridica = false } = {}) {
  const prefix = juridica ? "20" : "10";
  const mid = randDigits(8);
  const body10 = prefix + mid;
  const dv = peruRucCheckDigit(body10);
  const raw = body10 + dv;
  return { raw, formatted: raw, validChecksum: true };
}

function validatePeruRuc(value) {
  const digits = String(value).replace(/\D/g, "");
  if (digits.length !== 11) return false;
  if (!/^(10|15|17|20)/.test(digits)) return false;
  return peruRucCheckDigit(digits.slice(0, 10)) === digits.slice(-1);
}

function generatePeruDni() {
  const raw = randDigits(8);
  return { raw, formatted: raw, validChecksum: true };
}

function validatePeruDni(value) {
  return /^\d{8}$/.test(String(value).replace(/\D/g, ""));
}

// ——— Ecuador Cédula / RUC ———
function ecuadorCedulaCheckDigit(body9) {
  const digits = String(body9).replace(/\D/g, "").padStart(9, "0").slice(0, 9);
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let v = Number(digits[i]) * (i % 2 === 0 ? 2 : 1);
    if (v >= 10) v -= 9;
    sum += v;
  }
  const rem = sum % 10;
  return String(rem === 0 ? 0 : 10 - rem);
}

function generateEcuadorCedula() {
  // provincia 01-24, tercer dígito < 6 (persona natural)
  const province = String(randInt(1, 24)).padStart(2, "0");
  const third = String(randInt(0, 5));
  const rest = randDigits(6);
  const body9 = province + third + rest;
  const dv = ecuadorCedulaCheckDigit(body9);
  const raw = body9 + dv;
  return { raw, formatted: raw, validChecksum: true };
}

function validateEcuadorCedula(value) {
  const digits = String(value).replace(/\D/g, "");
  if (digits.length !== 10) return false;
  const prov = Number(digits.slice(0, 2));
  if (prov < 1 || prov > 24) return false;
  if (Number(digits[2]) >= 6) return false;
  return ecuadorCedulaCheckDigit(digits.slice(0, 9)) === digits.slice(-1);
}

function generateEcuadorRuc() {
  const ced = generateEcuadorCedula().raw;
  // RUC persona natural: cédula + 001
  const raw = ced + "001";
  return { raw, formatted: raw, validChecksum: true };
}

function validateEcuadorRuc(value) {
  const digits = String(value).replace(/\D/g, "");
  if (digits.length !== 13) return false;
  if (!digits.endsWith("001")) return false;
  return validateEcuadorCedula(digits.slice(0, 10));
}

// ——— Argentina CUIT / DNI ———
function argentinaCuitCheckDigit(body10) {
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const digits = String(body10).replace(/\D/g, "").padStart(10, "0").slice(0, 10);
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(digits[i]) * weights[i];
  const rem = 11 - (sum % 11);
  if (rem === 11) return "0";
  if (rem === 10) return "9";
  return String(rem);
}

function generateArgentinaCuit({ persona = true } = {}) {
  const prefix = persona ? (Math.random() < 0.5 ? "20" : "27") : "30";
  const dni = randDigits(8);
  const body10 = prefix + dni;
  const dv = argentinaCuitCheckDigit(body10);
  const raw = body10 + dv;
  return {
    raw,
    formatted: `${prefix}-${dni}-${dv}`,
    validChecksum: true,
  };
}

function validateArgentinaCuit(value) {
  const digits = String(value).replace(/\D/g, "");
  if (digits.length !== 11) return false;
  return argentinaCuitCheckDigit(digits.slice(0, 10)) === digits.slice(-1);
}

function generateArgentinaDni() {
  const raw = randDigitsNoLeadingZero(randInt(7, 8));
  return { raw, formatted: raw, validChecksum: true };
}

function validateArgentinaDni(value) {
  return /^\d{7,8}$/.test(String(value).replace(/\D/g, ""));
}

// ——— México RFC (homoclave / formato) ———
const MX_CONSONANTS = "BCDFGHJKLMNPQRSTVWXYZ";
const MX_VOWELS = "AEIOU";
const MX_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function randFrom(alphabet, n = 1) {
  let s = "";
  for (let i = 0; i < n; i++) s += alphabet[randInt(0, alphabet.length - 1)];
  return s;
}

function generateMexicoRfcPersona() {
  // 4 letters + YYMMDD + homoclave 3
  const l1 = randFrom(MX_CONSONANTS);
  const l2 = randFrom(MX_VOWELS);
  const l3 = randFrom(MX_CONSONANTS);
  const l4 = randFrom(MX_CONSONANTS);
  const yy = String(randInt(70, 99));
  const mm = String(randInt(1, 12)).padStart(2, "0");
  const dd = String(randInt(1, 28)).padStart(2, "0");
  const homo = randFrom(MX_LETTERS + "0123456789", 3);
  const raw = `${l1}${l2}${l3}${l4}${yy}${mm}${dd}${homo}`;
  return { raw, formatted: raw, validChecksum: true };
}

function generateMexicoRfcMoral() {
  // 3 letters + YYMMDD + homoclave 3
  const letters = randFrom(MX_LETTERS, 3);
  const yy = String(randInt(80, 99));
  const mm = String(randInt(1, 12)).padStart(2, "0");
  const dd = String(randInt(1, 28)).padStart(2, "0");
  const homo = randFrom(MX_LETTERS + "0123456789", 3);
  const raw = `${letters}${yy}${mm}${dd}${homo}`;
  return { raw, formatted: raw, validChecksum: true };
}

function validateMexicoRfc(value) {
  return /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/i.test(String(value).trim());
}

function generateMexicoCurp() {
  // Simplified structurally valid CURP (18 chars) — not linked to real people
  const l1 = randFrom(MX_CONSONANTS);
  const l2 = randFrom(MX_VOWELS);
  const l3 = randFrom(MX_CONSONANTS);
  const l4 = randFrom(MX_CONSONANTS);
  const yy = String(randInt(70, 99));
  const mm = String(randInt(1, 12)).padStart(2, "0");
  const dd = String(randInt(1, 28)).padStart(2, "0");
  const sex = Math.random() < 0.5 ? "H" : "M";
  const states = ["DF", "JC", "NL", "GT", "MC", "QR", "YC", "SP", "DG", "BC"];
  const state = states[randInt(0, states.length - 1)];
  const cons = randFrom(MX_CONSONANTS, 3);
  const diff = String(randInt(0, 9));
  const ver = String(randInt(0, 9));
  const raw = `${l1}${l2}${l3}${l4}${yy}${mm}${dd}${sex}${state}${cons}${diff}${ver}`;
  return { raw, formatted: raw, validChecksum: true };
}

function validateMexicoCurp(value) {
  return /^[A-Z]{4}\d{6}[HM][A-Z]{5}[0-9A-Z]\d$/i.test(String(value).trim());
}

// ——— Guatemala NIT ———
function guatemalaNitCheckDigit(body) {
  const digits = String(body).replace(/\D/g, "");
  let sum = 0;
  let pos = digits.length + 1;
  for (let i = 0; i < digits.length; i++) {
    sum += Number(digits[i]) * pos;
    pos--;
  }
  const rem = sum % 11;
  return rem === 10 ? "K" : String(rem === 11 ? 0 : rem);
}

function generateGuatemalaNit() {
  const body = randDigitsNoLeadingZero(randInt(7, 8));
  const dv = guatemalaNitCheckDigit(body);
  return {
    raw: `${body}${dv}`,
    formatted: `${body}-${dv}`,
    validChecksum: true,
  };
}

function validateGuatemalaNit(value) {
  const clean = String(value).toUpperCase().replace(/[^0-9K]/g, "");
  if (clean.length < 2) return false;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  return guatemalaNitCheckDigit(body) === dv;
}

/** DPI / CUI GT: 13 dígitos (departamento/municipio/corr + año) — formato estructural. */
function generateGuatemalaDpi() {
  const depto = String(randInt(1, 22)).padStart(2, "0");
  const muni = String(randInt(1, 20)).padStart(2, "0");
  const corr = randDigits(4);
  const year = String(randInt(1975, 2005));
  // last digit simplistic
  const raw = `${corr}${depto}${muni}${year}${randDigits(1)}`.slice(0, 13).padEnd(13, "0");
  // Better structure often: 4 correlativo + 2 depto + 2 muni + 4 year +1 check-ish
  const structured = `${randDigits(4)}${depto}${muni}${year}${String(randInt(0, 9))}`;
  return { raw: structured, formatted: structured, validChecksum: true };
}

function validateGuatemalaDpi(value) {
  return /^\d{13}$/.test(String(value).replace(/\D/g, ""));
}

/** Costa Rica cédula: 9–12 dígitos, persona física suele ser #-####-#### */
function generateCostaRicaCedula() {
  const a = String(randInt(1, 9));
  const b = randDigits(4);
  const c = randDigits(4);
  const raw = `${a}${b}${c}`;
  return { raw, formatted: `${a}-${b}-${c}`, validChecksum: true };
}

function validateCostaRicaCedula(value) {
  return /^\d{9}$/.test(String(value).replace(/\D/g, ""));
}

/** Panama cédula: X-XXX-XXXX etc */
function generatePanamaCedula() {
  const a = String(randInt(1, 9));
  const b = randDigits(3);
  const c = randDigits(4);
  const raw = `${a}${b}${c}`;
  return { raw, formatted: `${a}-${b}-${c}`, validChecksum: true };
}

function validatePanamaCedula(value) {
  return /^\d{7,9}$/.test(String(value).replace(/\D/g, ""));
}

const DOCUMENT_TYPES = [
  {
    id: "CL_RUT",
    country: "CL",
    countryName: "Chile",
    type: "RUT",
    label: "Chile — RUT",
    generate: generateChileRut,
    validate: validateChileRut,
  },
  {
    id: "CO_CEDULA",
    country: "CO",
    countryName: "Colombia",
    type: "Cédula",
    label: "Colombia — Cédula",
    generate: generateColombiaCedula,
    validate: validateColombiaCedula,
  },
  {
    id: "CO_NIT",
    country: "CO",
    countryName: "Colombia",
    type: "NIT",
    label: "Colombia — NIT",
    generate: generateColombiaNit,
    validate: validateColombiaNit,
  },
  {
    id: "PE_DNI",
    country: "PE",
    countryName: "Perú",
    type: "DNI",
    label: "Perú — DNI",
    generate: generatePeruDni,
    validate: validatePeruDni,
  },
  {
    id: "PE_RUC_NAT",
    country: "PE",
    countryName: "Perú",
    type: "RUC (natural)",
    label: "Perú — RUC persona natural (10…)",
    generate: () => generatePeruRuc({ juridica: false }),
    validate: validatePeruRuc,
  },
  {
    id: "PE_RUC_JUR",
    country: "PE",
    countryName: "Perú",
    type: "RUC (jurídica)",
    label: "Perú — RUC persona jurídica (20…)",
    generate: () => generatePeruRuc({ juridica: true }),
    validate: validatePeruRuc,
  },
  {
    id: "EC_CEDULA",
    country: "EC",
    countryName: "Ecuador",
    type: "Cédula",
    label: "Ecuador — Cédula",
    generate: generateEcuadorCedula,
    validate: validateEcuadorCedula,
  },
  {
    id: "EC_RUC",
    country: "EC",
    countryName: "Ecuador",
    type: "RUC",
    label: "Ecuador — RUC",
    generate: generateEcuadorRuc,
    validate: validateEcuadorRuc,
  },
  {
    id: "MX_RFC_PF",
    country: "MX",
    countryName: "México",
    type: "RFC PF",
    label: "México — RFC persona física",
    generate: generateMexicoRfcPersona,
    validate: validateMexicoRfc,
  },
  {
    id: "MX_RFC_PM",
    country: "MX",
    countryName: "México",
    type: "RFC PM",
    label: "México — RFC persona moral",
    generate: generateMexicoRfcMoral,
    validate: validateMexicoRfc,
  },
  {
    id: "MX_CURP",
    country: "MX",
    countryName: "México",
    type: "CURP",
    label: "México — CURP (formato)",
    generate: generateMexicoCurp,
    validate: validateMexicoCurp,
  },
  {
    id: "GT_NIT",
    country: "GT",
    countryName: "Guatemala",
    type: "NIT",
    label: "Guatemala — NIT",
    generate: generateGuatemalaNit,
    validate: validateGuatemalaNit,
  },
  {
    id: "GT_DPI",
    country: "GT",
    countryName: "Guatemala",
    type: "DPI/CUI",
    label: "Guatemala — DPI / CUI",
    generate: generateGuatemalaDpi,
    validate: validateGuatemalaDpi,
  },
  {
    id: "AR_DNI",
    country: "AR",
    countryName: "Argentina",
    type: "DNI",
    label: "Argentina — DNI",
    generate: generateArgentinaDni,
    validate: validateArgentinaDni,
  },
  {
    id: "AR_CUIT",
    country: "AR",
    countryName: "Argentina",
    type: "CUIT",
    label: "Argentina — CUIT",
    generate: () => generateArgentinaCuit({ persona: true }),
    validate: validateArgentinaCuit,
  },
  {
    id: "CR_CEDULA",
    country: "CR",
    countryName: "Costa Rica",
    type: "Cédula",
    label: "Costa Rica — Cédula",
    generate: generateCostaRicaCedula,
    validate: validateCostaRicaCedula,
  },
  {
    id: "PA_CEDULA",
    country: "PA",
    countryName: "Panamá",
    type: "Cédula",
    label: "Panamá — Cédula",
    generate: generatePanamaCedula,
    validate: validatePanamaCedula,
  },
];

function listDocumentTypes() {
  return DOCUMENT_TYPES.map(({ id, country, countryName, type, label }) => ({
    id,
    country,
    countryName,
    type,
    label,
    kind: "document",
  }));
}

function generateDocuments({ documentType, count = 10 }) {
  const def = DOCUMENT_TYPES.find((d) => d.id === documentType);
  if (!def) {
    throw new Error(`Tipo no soportado: ${documentType}`);
  }
  const n = Math.min(Math.max(Number(count) || 1, 1), 500);
  const rows = [];
  for (let i = 0; i < n; i++) {
    const generated = def.generate();
    const passes = def.validate(generated.raw) || def.validate(generated.formatted);
    rows.push({
      country: def.country,
      documentType: def.type,
      raw: generated.raw,
      formatted: generated.formatted,
      checksumOk: passes ? "sí" : "no",
      note: "Sintético — solo testing",
    });
  }
  return {
    columns: ["country", "documentType", "raw", "formatted", "checksumOk", "note"],
    rows,
  };
}

// =============================================================================
// Teléfonos sintéticos (longitud / prefijo de país; no son números reales asignados)
// =============================================================================

/**
 * @param {object} opts
 * @param {string} opts.country
 * @param {string} opts.countryName
 * @param {string} opts.type
 * @param {string} opts.cc - country calling code without +
 * @param {string} opts.nsn - national significant number (sin 0 troncal)
 * @param {string} [opts.nationalWithTrunk] - forma local con 0 (ej EC 09…)
 * @param {string} [opts.nationalFormatted]
 */
function phoneRow({ country, countryName, type, cc, nsn, nationalWithTrunk, nationalFormatted }) {
  const international = `+${cc}${nsn}`;
  const e164 = international;
  const national = nationalWithTrunk || nsn;
  return {
    country,
    countryName,
    type,
    national,
    nationalFormatted: nationalFormatted || national,
    international,
    e164,
    digitsNational: national.replace(/\D/g, ""),
    digitsE164: e164.replace(/\D/g, ""),
    formatOk: "sí",
    note: "Sintético — solo testing",
  };
}

function generateEcuadorMobile() {
  // Móvil: nacional con 0 → 09XXXXXXXX (10); NSN → 9XXXXXXXX (9); intl → +5939XXXXXXXX
  const rest = randDigits(8);
  const nsn = `9${rest}`;
  const with0 = `0${nsn}`;
  return phoneRow({
    country: "EC",
    countryName: "Ecuador",
    type: "Móvil",
    cc: "593",
    nsn,
    nationalWithTrunk: with0,
    nationalFormatted: `${with0.slice(0, 2)} ${with0.slice(2, 5)} ${with0.slice(5)}`,
  });
}

function generateColombiaMobile() {
  // 10 dígitos empezando en 3: 3XXXXXXXXX ; +57 3XXXXXXXXX
  const nsn = `3${randDigits(9)}`;
  return phoneRow({
    country: "CO",
    countryName: "Colombia",
    type: "Móvil",
    cc: "57",
    nsn,
    nationalFormatted: `${nsn.slice(0, 3)} ${nsn.slice(3, 6)} ${nsn.slice(6)}`,
  });
}

function generateChileMobile() {
  // 9 dígitos empezando en 9; a veces se escribe +56 9 XXXX XXXX
  const nsn = `9${randDigits(8)}`;
  return phoneRow({
    country: "CL",
    countryName: "Chile",
    type: "Móvil",
    cc: "56",
    nsn,
    nationalFormatted: `${nsn.slice(0, 1)} ${nsn.slice(1, 5)} ${nsn.slice(5)}`,
  });
}

function generatePeruMobile() {
  const nsn = `9${randDigits(8)}`;
  return phoneRow({
    country: "PE",
    countryName: "Perú",
    type: "Móvil",
    cc: "51",
    nsn,
    nationalFormatted: `${nsn.slice(0, 3)} ${nsn.slice(3, 6)} ${nsn.slice(6)}`,
  });
}

function generateMexicoMobile() {
  // 10 dígitos; internacional +52 + 10 (sin el '1' legacy obligatorio hoy en día en muchos flujos)
  const nsn = randDigitsNoLeadingZero(10);
  return phoneRow({
    country: "MX",
    countryName: "México",
    type: "Móvil",
    cc: "52",
    nsn,
    nationalFormatted: `${nsn.slice(0, 2)} ${nsn.slice(2, 6)} ${nsn.slice(6)}`,
  });
}

function generateGuatemalaMobile() {
  // 8 dígitos; móviles suelen 3/4/5…
  const first = String(randInt(3, 5));
  const nsn = first + randDigits(7);
  return phoneRow({
    country: "GT",
    countryName: "Guatemala",
    type: "Móvil",
    cc: "502",
    nsn,
    nationalFormatted: `${nsn.slice(0, 4)}-${nsn.slice(4)}`,
  });
}

function generateArgentinaMobile() {
  // Presentación común: 11 15 XXXX-XXXX local BA area; E.164 móvil: +54 9 11 XXXXXXXX
  const area = "11";
  const subscriber = randDigits(8);
  const nsn = `9${area}${subscriber}`; // after country code 54
  const nationalWithTrunk = `15${subscriber}`;
  return phoneRow({
    country: "AR",
    countryName: "Argentina",
    type: "Móvil (CABA)",
    cc: "54",
    nsn,
    nationalWithTrunk: `${area} ${nationalWithTrunk}`,
    nationalFormatted: `(${area}) 15-${subscriber.slice(0, 4)}-${subscriber.slice(4)}`,
  });
}

function generateCostaRicaMobile() {
  // 8 dígitos; móviles 6/7/8…
  const first = String(randInt(6, 8));
  const nsn = first + randDigits(7);
  return phoneRow({
    country: "CR",
    countryName: "Costa Rica",
    type: "Móvil",
    cc: "506",
    nsn,
    nationalFormatted: `${nsn.slice(0, 4)}-${nsn.slice(4)}`,
  });
}

function generatePanamaMobile() {
  // 8 dígitos; móviles 6…
  const nsn = `6${randDigits(7)}`;
  return phoneRow({
    country: "PA",
    countryName: "Panamá",
    type: "Móvil",
    cc: "507",
    nsn,
    nationalFormatted: `${nsn.slice(0, 4)}-${nsn.slice(4)}`,
  });
}

const PHONE_TYPES = [
  {
    id: "EC_MOBILE",
    country: "EC",
    countryName: "Ecuador",
    type: "Móvil",
    label: "Ecuador — Móvil (+593 / 09…)",
    generate: generateEcuadorMobile,
  },
  {
    id: "CO_MOBILE",
    country: "CO",
    countryName: "Colombia",
    type: "Móvil",
    label: "Colombia — Móvil (+57)",
    generate: generateColombiaMobile,
  },
  {
    id: "CL_MOBILE",
    country: "CL",
    countryName: "Chile",
    type: "Móvil",
    label: "Chile — Móvil (+56)",
    generate: generateChileMobile,
  },
  {
    id: "PE_MOBILE",
    country: "PE",
    countryName: "Perú",
    type: "Móvil",
    label: "Perú — Móvil (+51)",
    generate: generatePeruMobile,
  },
  {
    id: "MX_MOBILE",
    country: "MX",
    countryName: "México",
    type: "Móvil",
    label: "México — Móvil (+52)",
    generate: generateMexicoMobile,
  },
  {
    id: "GT_MOBILE",
    country: "GT",
    countryName: "Guatemala",
    type: "Móvil",
    label: "Guatemala — Móvil (+502)",
    generate: generateGuatemalaMobile,
  },
  {
    id: "AR_MOBILE",
    country: "AR",
    countryName: "Argentina",
    type: "Móvil",
    label: "Argentina — Móvil (+54)",
    generate: generateArgentinaMobile,
  },
  {
    id: "CR_MOBILE",
    country: "CR",
    countryName: "Costa Rica",
    type: "Móvil",
    label: "Costa Rica — Móvil (+506)",
    generate: generateCostaRicaMobile,
  },
  {
    id: "PA_MOBILE",
    country: "PA",
    countryName: "Panamá",
    type: "Móvil",
    label: "Panamá — Móvil (+507)",
    generate: generatePanamaMobile,
  },
];

function listPhoneTypes() {
  return PHONE_TYPES.map(({ id, country, countryName, type, label }) => ({
    id,
    country,
    countryName,
    type,
    label,
    kind: "phone",
  }));
}

/**
 * @param {object} opts
 * @param {string} opts.phoneType
 * @param {number} [opts.count]
 * @param {'both'|'national'|'international'} [opts.prefixMode]
 *   both = columnas national + international
 *   national = sin +código (EC → 09…)
 *   international = con +código (EC → +593…)
 */
function generatePhones({ phoneType, count = 10, prefixMode = "both" }) {
  const def = PHONE_TYPES.find((d) => d.id === phoneType);
  if (!def) {
    throw new Error(`Tipo de teléfono no soportado: ${phoneType}`);
  }
  const mode = ["national", "international", "both"].includes(prefixMode)
    ? prefixMode
    : "both";
  const n = Math.min(Math.max(Number(count) || 1, 1), 500);
  const rows = [];
  for (let i = 0; i < n; i++) {
    const p = def.generate();
    let primary = p.international;
    if (mode === "national") primary = p.national;
    else if (mode === "international") primary = p.international;

    rows.push({
      country: p.country,
      type: p.type,
      primary,
      national: p.national,
      nationalFormatted: p.nationalFormatted,
      international: p.international,
      e164: p.e164,
      digitsNational: p.digitsNational,
      digitsE164: p.digitsE164,
      formatOk: p.formatOk,
      note: p.note,
    });
  }

  const columns =
    mode === "national"
      ? ["country", "type", "primary", "national", "nationalFormatted", "formatOk", "note"]
      : mode === "international"
        ? ["country", "type", "primary", "international", "e164", "formatOk", "note"]
        : [
            "country",
            "type",
            "primary",
            "national",
            "international",
            "e164",
            "nationalFormatted",
            "formatOk",
            "note",
          ];

  return { columns, rows, prefixMode: mode };
}

module.exports = {
  listDocumentTypes,
  generateDocuments,
  DOCUMENT_TYPES,
  listPhoneTypes,
  generatePhones,
  PHONE_TYPES,
};
