const fs = require("fs");
const path = require("path");

const LOOKUP_PATH = path.join(__dirname, "../../data/customer_lookup.json");
const META_PATH = path.join(__dirname, "../../data/customer_lookup.meta.json");
const REQUIRED = ["country", "customerId", "type", "channel"];

function getLookupPath() {
  return LOOKUP_PATH;
}

function fileMtimeIso(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return fs.statSync(filePath).mtime.toISOString();
  } catch {
    return null;
  }
}

function readMeta() {
  let meta = {};
  if (fs.existsSync(META_PATH)) {
    try {
      meta = JSON.parse(fs.readFileSync(META_PATH, "utf8")) || {};
    } catch {
      meta = {};
    }
  }
  const mtime = fileMtimeIso(LOOKUP_PATH);
  return {
    updatedAt: meta.updatedAt || mtime || null,
    note: typeof meta.note === "string" ? meta.note : "",
    count: meta.count != null ? Number(meta.count) : null,
    source: meta.source || null,
  };
}

function writeMeta({ count, note, source = "ui" }) {
  const prev = readMeta();
  const meta = {
    updatedAt: new Date().toISOString(),
    count: count != null ? count : prev.count,
    note: note != null ? String(note) : prev.note || "",
    source,
  };
  const dir = path.dirname(META_PATH);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(META_PATH, JSON.stringify(meta, null, 2) + "\n", "utf8");
  return meta;
}

function readLookup() {
  if (!fs.existsSync(LOOKUP_PATH)) {
    return {};
  }
  const raw = fs.readFileSync(LOOKUP_PATH, "utf8");
  const data = JSON.parse(raw);
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("customer_lookup.json debe ser un objeto { customerCode: { ... } }");
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

/** Convert UI rows → lookup object */
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

function writeLookup(data, { note, source = "ui" } = {}) {
  const validated = validateLookup(data);
  if (!validated.ok) return validated;

  const dir = path.dirname(LOOKUP_PATH);
  fs.mkdirSync(dir, { recursive: true });
  const pretty = JSON.stringify(validated.data, null, 2) + "\n";
  const tmp = LOOKUP_PATH + ".tmp";
  fs.writeFileSync(tmp, pretty, "utf8");
  fs.renameSync(tmp, LOOKUP_PATH);

  const count = Object.keys(validated.data).length;
  const meta = writeMeta({ count, note, source });

  return {
    ok: true,
    data: validated.data,
    path: LOOKUP_PATH,
    count,
    meta,
  };
}

module.exports = {
  getLookupPath,
  readLookup,
  readMeta,
  validateLookup,
  writeLookup,
  rowsToLookup,
  lookupToRows,
};
