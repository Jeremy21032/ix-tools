const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "../../data");
const LEGACY_PATH = path.join(DATA_DIR, "customer_lookup.json");
const REQUIRED = ["country", "customerId", "type", "channel"];

function normalizeEnv(environment) {
  return String(environment || "PROD").toUpperCase() === "UAT" ? "UAT" : "PROD";
}

function getLookupPath(environment = "PROD") {
  const env = normalizeEnv(environment);
  return path.join(DATA_DIR, `customer_lookup_${env.toLowerCase()}.json`);
}

function getMetaPath(environment = "PROD") {
  const env = normalizeEnv(environment);
  return path.join(DATA_DIR, `customer_lookup_${env.toLowerCase()}.meta.json`);
}

function fileMtimeIso(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return fs.statSync(filePath).mtime.toISOString();
  } catch {
    return null;
  }
}

function readMeta(environment = "PROD") {
  const env = normalizeEnv(environment);
  const metaPath = getMetaPath(env);
  const lookupPath = getLookupPath(env);
  let meta = {};
  if (fs.existsSync(metaPath)) {
    try {
      meta = JSON.parse(fs.readFileSync(metaPath, "utf8")) || {};
    } catch {
      meta = {};
    }
  }
  const mtime = fileMtimeIso(lookupPath);
  return {
    environment: env,
    updatedAt: meta.updatedAt || mtime || null,
    note: typeof meta.note === "string" ? meta.note : "",
    count: meta.count != null ? Number(meta.count) : null,
    source: meta.source || null,
  };
}

function writeMeta(environment, { count, note, source = "ui" } = {}) {
  const env = normalizeEnv(environment);
  const metaPath = getMetaPath(env);
  const prev = readMeta(env);
  const meta = {
    environment: env,
    updatedAt: new Date().toISOString(),
    count: count != null ? count : prev.count,
    note: note != null ? String(note) : prev.note || "",
    source,
  };
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + "\n", "utf8");
  return meta;
}

function readLookup(environment = "PROD") {
  const env = normalizeEnv(environment);
  const lookupPath = getLookupPath(env);

  // Migrate legacy single file → PROD once
  if (env === "PROD" && !fs.existsSync(lookupPath) && fs.existsSync(LEGACY_PATH)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.copyFileSync(LEGACY_PATH, lookupPath);
  }

  if (!fs.existsSync(lookupPath)) {
    return {};
  }
  const raw = fs.readFileSync(lookupPath, "utf8");
  const data = JSON.parse(raw);
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("customer_lookup debe ser un objeto { customerCode: { ... } }");
  }
  return data;
}

/**
 * Validate and normalize lookup object.
 * @returns {{ ok: true, data: object } | { ok: false, error: string }}
 */
function validateLookup(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "El lookup debe ser un objeto JSON { código: { country, customerId, type, channel } }" };
  }

  const data = {};
  for (const [key, value] of Object.entries(input)) {
    const code = String(key || "").trim();
    if (!code) {
      return { ok: false, error: "Hay una entrada con código de customer vacío" };
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { ok: false, error: `La entrada "${code}" no es un objeto de config` };
    }
    const missing = REQUIRED.filter((k) => !(k in value));
    if (missing.length) {
      return { ok: false, error: `En "${code}" faltan campos: ${missing.join(", ")}` };
    }
    data[code] = {
      country: String(value.country ?? "").trim(),
      customerId: String(value.customerId ?? "").trim(),
      type: String(value.type ?? "").trim(),
      channel: String(value.channel ?? "").trim(),
    };
    if (!data[code].country) {
      return { ok: false, error: `En "${code}" country no puede estar vacío` };
    }
    if (!data[code].type) {
      return { ok: false, error: `En "${code}" type no puede estar vacío` };
    }
    if (!data[code].channel) {
      return { ok: false, error: `En "${code}" channel no puede estar vacío` };
    }
  }
  return { ok: true, data };
}

function rowsToLookup(rows) {
  const obj = {};
  for (const row of rows || []) {
    const code = String(row.code || row.customer || "").trim();
    if (!code) continue;
    obj[code] = {
      country: row.country ?? "",
      customerId: row.customerId ?? "",
      type: row.type ?? "",
      channel: row.channel ?? "",
    };
  }
  return obj;
}

function lookupToRows(data) {
  return Object.keys(data || {})
    .sort((a, b) => a.localeCompare(b))
    .map((code) => ({
      code,
      country: data[code].country ?? "",
      customerId: data[code].customerId ?? "",
      type: data[code].type ?? "",
      channel: data[code].channel ?? "",
    }));
}

function writeLookup(data, { environment = "PROD", note, source = "ui" } = {}) {
  const env = normalizeEnv(environment);
  const validated = validateLookup(data);
  if (!validated.ok) return validated;

  const lookupPath = getLookupPath(env);
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const pretty = JSON.stringify(validated.data, null, 2) + "\n";
  const tmp = lookupPath + ".tmp";
  fs.writeFileSync(tmp, pretty, "utf8");
  fs.renameSync(tmp, lookupPath);

  // Keep legacy alias for PROD so older scripts still find a file
  if (env === "PROD") {
    fs.writeFileSync(LEGACY_PATH, pretty, "utf8");
  }

  const count = Object.keys(validated.data).length;
  const meta = writeMeta(env, { count, note, source });

  return {
    ok: true,
    data: validated.data,
    path: lookupPath,
    environment: env,
    count,
    meta,
  };
}

module.exports = {
  normalizeEnv,
  getLookupPath,
  readLookup,
  readMeta,
  validateLookup,
  writeLookup,
  rowsToLookup,
  lookupToRows,
};
