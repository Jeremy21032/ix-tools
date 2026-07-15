function jsonOneline(text, stringify = false) {
  const data = JSON.parse(String(text || ""));
  const compact = JSON.stringify(data);
  if (stringify) return JSON.stringify(compact);
  return compact;
}

/**
 * Pretty-print JSON. Opposite of jsonOneline.
 * @param {string} text
 * @param {{ unwrap?: boolean, spaces?: number }} [opts]
 *   unwrap: if true (default), keep parsing while the value is a JSON string
 *           (undo doble stringify / escaped payloads).
 */
function jsonPretty(text, opts = {}) {
  const unwrap = opts.unwrap !== false;
  const spaces = opts.spaces != null ? Number(opts.spaces) : 2;
  let raw = String(text || "").trim();
  if (!raw) throw new Error("JSON vacío");

  let data = JSON.parse(raw);
  let unwrapped = 0;
  if (unwrap) {
    while (typeof data === "string") {
      const next = data.trim();
      if (!(next.startsWith("{") || next.startsWith("[") || next.startsWith('"'))) {
        break;
      }
      try {
        data = JSON.parse(next);
        unwrapped += 1;
      } catch {
        break;
      }
      if (unwrapped > 10) break;
    }
  }
  return JSON.stringify(data, null, Number.isFinite(spaces) ? spaces : 2);
}

const TOP_LEVEL_KEYS = ["cid", "status", "code", "timestamp", "data", "error"];
const SHIPMENT_KEYS = [
  "id",
  "customer",
  "countryId",
  "carrier",
  "service",
  "creationTimestamp",
  "updateTimestamp",
  "status",
  "trackingNumber",
  "packages",
  "items",
];

function pick(obj, keys) {
  if (!obj || typeof obj !== "object") return obj;
  const out = {};
  for (const k of keys) {
    if (k in obj) out[k] = obj[k];
  }
  return out;
}

function transformShipment(text, asString = false) {
  const parsed = JSON.parse(String(text || ""));
  let shipmentDetails = parsed;
  if (parsed && typeof parsed === "object") {
    if (parsed.shipmentDetails) shipmentDetails = parsed.shipmentDetails;
    else if (parsed.data) shipmentDetails = parsed.data;
  }
  if (Array.isArray(shipmentDetails)) {
    shipmentDetails = shipmentDetails.map((s) => pick(s, SHIPMENT_KEYS));
  } else if (shipmentDetails && typeof shipmentDetails === "object") {
    const maybeTop = pick(shipmentDetails, TOP_LEVEL_KEYS);
    if (Object.keys(maybeTop).length > 2 && shipmentDetails.data) {
      shipmentDetails = pick(shipmentDetails.data, SHIPMENT_KEYS);
    } else {
      shipmentDetails = pick(shipmentDetails, SHIPMENT_KEYS);
    }
  }
  const result = { shipmentDetails };
  const json = JSON.stringify(result, null, 2);
  return asString ? JSON.stringify(json) : json;
}

function extractBrokered(text) {
  const data = JSON.parse(String(text || ""));
  const rows = Array.isArray(data) ? data : [data];
  const header = ["OrderNumber", "PickNumber", "PackNumber", "CustomerId", "fordNotification"];
  const lines = [header.join(",")];
  for (const item of rows) {
    let body = item;
    if (item?.body) {
      try {
        body = typeof item.body === "string" ? JSON.parse(item.body) : item.body;
      } catch {
        body = item;
      }
    }
    const orderNumber = body?.orderNumber || body?.OrderNumber || "";
    const pick = body?.pickNumber || body?.PickNumber || "";
    const pack = body?.packNumber || body?.PackNumber || "";
    const customerId = body?.customerId || body?.CustomerId || "";
    const ford = body?.fordNotification != null ? String(body.fordNotification) : "";
    const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
    lines.push([orderNumber, pick, pack, customerId, ford].map(esc).join(","));
  }
  return lines.join("\n");
}

module.exports = { jsonOneline, jsonPretty, transformShipment, extractBrokered };
