const { sendOrderStatus, EVENT_TYPE_MAP } = require("./orderStatusSender");

const DEFAULT_THREADS = parseInt(process.env.CONCURRENT_THREADS || "8", 10);
const INTER_BATCH_DELAY_MS = parseInt(process.env.INTER_BATCH_DELAY_MS || "150", 10);

function entriesFromParsed(value, country) {
  if (typeof value === "string") return entriesFromParsed(JSON.parse(value), country);
  const list = Array.isArray(value) ? value : [value];
  if (!list.length) throw new Error("Event data vacío");
  return list.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("Cada event data debe ser un objeto JSON");
    }
    if (!String(item.orderNumber || "").trim()) {
      throw new Error("Event data requiere orderNumber");
    }
    return { eventData: item, country: country || null };
  });
}

function readJsonValue(raw, start) {
  let i = start;
  let depth = 0;
  let inString = false;
  let escape = false;
  const opener = raw[start];
  const closer = opener === "{" ? "}" : "]";
  for (; i < raw.length; i++) {
    const ch = raw[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{" || ch === "[") depth++;
    else if (ch === "}" || ch === "]") {
      depth--;
      if (depth === 0) {
        if (ch !== closer) throw new Error("JSON incompleto en event data");
        return { jsonText: raw.slice(start, i + 1), end: i + 1 };
      }
    }
  }
  throw new Error("JSON incompleto en event data");
}

function parseEventDataInput(text) {
  const raw = String(text || "").trim();
  if (!raw) return [];

  const records = [];
  let i = 0;
  while (i < raw.length) {
    while (i < raw.length && /\s/.test(raw[i])) i++;
    if (i >= raw.length) break;
    if (raw[i] !== "{" && raw[i] !== "[") {
      throw new Error("Cada event data debe ser un objeto JSON. Formato: JSON o JSON,PAIS");
    }
    const { jsonText, end } = readJsonValue(raw, i);
    i = end;
    let country = null;
    const countryMatch = raw.slice(i).match(/^\s*,\s*([A-Za-z]{2})(?=\s|$)/);
    if (raw.slice(i).trim().startsWith(",")) {
      if (!countryMatch) {
        throw new Error("Después del JSON se espera ,PAIS con un código de 2 letras (ej. ,CL)");
      }
      country = countryMatch[1].toUpperCase();
      i += countryMatch[0].length;
    }
    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (error) {
      throw new Error(`Event data no es JSON válido: ${error.message}`);
    }
    records.push(...entriesFromParsed(parsed, country));
  }
  return records;
}

function eventTypeForData(eventData, fallbackStatus) {
  const info =
    eventData?.statusInformation && typeof eventData.statusInformation === "object"
      ? eventData.statusInformation
      : {};
  const sub = String(info.subStatus || "").trim().toUpperCase();
  const code = String(info.statusCode || "").trim().toUpperCase();
  if (sub && EVENT_TYPE_MAP[sub]) return sub;
  if (code && EVENT_TYPE_MAP[code]) return code;
  for (const [key, cfg] of Object.entries(EVENT_TYPE_MAP)) {
    if (code && String(cfg.statusCode || "").toUpperCase() === code) return key;
    if (sub && String(cfg.subStatus || "").toUpperCase() === sub) return key;
    if (code && String(cfg.entityStatus || "").toUpperCase() === code) return key;
  }
  const fallback = String(fallbackStatus || "").trim().toUpperCase();
  return EVENT_TYPE_MAP[fallback] ? fallback : "";
}

function parseOrdersText(text, defaultCountry) {
  const orders = [];
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  for (const line of lines) {
    const parts = line.split(",");
    const orderId = parts[0]?.trim();
    const country = parts[1]?.trim() || null;
    if (orderId) orders.push({ orderId, country });
  }
  if (!orders.length && defaultCountry) {
    // no-op
  }
  return orders;
}

/**
 * @param {object} opts
 * @param {string} opts.country
 * @param {string} opts.status
 * @param {string} opts.eventMode
 * @param {Array<{orderId:string,country?:string|null}>|string} opts.orders
 * @param {boolean} [opts.debug]
 * @param {number} [opts.threads]
 * @param {(line:string)=>void} [opts.onLog]
 */
async function runResend(opts) {
  const {
    country = "CO",
    status = "READY_TO_DELIVER",
    eventMode = "requested",
    debug = false,
    threads = DEFAULT_THREADS,
    environment = "PROD",
    message = "",
    eventData = "",
    onLog = () => {},
  } = opts;

  const orders =
    typeof opts.orders === "string"
      ? parseOrdersText(opts.orders, country)
      : Array.isArray(opts.orders)
        ? opts.orders
        : [];

  const logs = [];
  const log = (line) => {
    logs.push(line);
    onLog(line);
  };

  if (!EVENT_TYPE_MAP[status.toUpperCase()]) {
    return {
      ok: false,
      summary: { success: 0, errors: 0 },
      logs: [`Tipo de evento inválido: ${status}`],
      error: `Tipos: ${Object.keys(EVENT_TYPE_MAP).join(", ")}`,
    };
  }

  let eventDataList = [];
  if (String(eventData || "").trim()) {
    try {
      eventDataList = parseEventDataInput(eventData);
    } catch (error) {
      return {
        ok: false,
        summary: { success: 0, errors: 0 },
        logs: [error.message],
        error: error.message,
      };
    }
  }

  const sendOrders = eventDataList.length
    ? eventDataList.map((item) => {
        const resolvedType = eventTypeForData(item.eventData, status);
        const orderNumber = String(item.eventData.orderNumber).trim();
        return {
          orderId: orderNumber,
          country: item.country,
          eventData: item.eventData,
          eventType: resolvedType,
          eventTypeError: resolvedType
            ? ""
            : `No se reconoce el status del event data de ${orderNumber}`,
        };
      })
    : orders.map((order) => ({ ...order, eventData: null, eventType: "" }));

  const unknown = sendOrders.find((order) => order.eventTypeError);
  if (unknown) {
    return {
      ok: false,
      summary: { success: 0, errors: 0 },
      logs: [unknown.eventTypeError],
      error: unknown.eventTypeError,
    };
  }

  if (!sendOrders.length) {
    return {
      ok: false,
      summary: { success: 0, errors: 0 },
      logs: ["No se proporcionaron órdenes ni event data"],
      error: "orders vacío",
    };
  }

  const validDefaultCountry = country.toUpperCase();
  const validEventType = status.toUpperCase();
  const validEventMode = eventMode.toLowerCase();
  const validEnvironment = String(environment || "PROD").toUpperCase() === "UAT" ? "UAT" : "PROD";
  if (validEventMode !== "requested" && validEventMode !== "changed") {
    return {
      ok: false,
      summary: { success: 0, errors: 0 },
      logs: [`Modo inválido: ${eventMode}`],
      error: "eventMode must be requested|changed",
    };
  }

  log(`Ambiente: ${validEnvironment}`);
  log(`País por defecto: ${validDefaultCountry}`);
  log(`Modo: ${validEventMode}`);
  if (eventDataList.length) {
    const types = [...new Set(sendOrders.map((order) => order.eventType))].join(", ");
    log(`Event data: ${eventDataList.length}. El campo data sale con ese JSON. Status: ${types}`);
    if (orders.length) log("La lista de órdenes no se envía por separado.");
  } else {
    log(`Tipo de evento: ${validEventType}`);
  }
  log(`Total órdenes: ${sendOrders.length}`);
  log(`Concurrencia: ${threads}`);

  let successCount = 0;
  let errorCount = 0;
  const errors = [];
  const startTime = Date.now();

  const chunks = [];
  for (let i = 0; i < sendOrders.length; i += threads) {
    chunks.push(sendOrders.slice(i, i + threads));
  }

  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
    const chunk = chunks[chunkIndex];
    log(`Lote ${chunkIndex + 1}/${chunks.length}`);

    const results = await Promise.all(
      chunk
        .filter((o) => o.orderId)
        .map((order) =>
          sendOrderStatus(
            order.orderId,
            order.eventType || validEventType,
            (order.country || validDefaultCountry).toUpperCase(),
            debug,
            null,
            validEventMode,
            { environment: validEnvironment, message, eventData: order.eventData || null }
          )
        )
    );

    for (const r of results) {
      for (const line of r.logs || []) log(line);
      if (r.ok) successCount++;
      else {
        errorCount++;
        errors.push({ orderId: r.orderId, message: r.message });
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    log(`Progreso: OK=${successCount} ERR=${errorCount} t=${elapsed}s`);

    if (chunkIndex < chunks.length - 1 && INTER_BATCH_DELAY_MS > 0) {
      await new Promise((res) => setTimeout(res, INTER_BATCH_DELAY_MS));
    }
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  log(`Finalizado en ${totalTime}s — OK ${successCount} / ERR ${errorCount}`);

  return {
    ok: errorCount === 0,
    summary: {
      success: successCount,
      errors: errorCount,
      total: sendOrders.length,
      seconds: Number(totalTime),
      environment: validEnvironment,
    },
    logs,
    errorDetails: errors,
  };
}

module.exports = { runResend, parseOrdersText, parseEventDataInput, EVENT_TYPE_MAP };
