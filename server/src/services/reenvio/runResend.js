const { sendOrderStatus, EVENT_TYPE_MAP } = require("./orderStatusSender");

const DEFAULT_THREADS = parseInt(process.env.CONCURRENT_THREADS || "8", 10);
const INTER_BATCH_DELAY_MS = parseInt(process.env.INTER_BATCH_DELAY_MS || "150", 10);

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
  if (!orders.length) {
    return {
      ok: false,
      summary: { success: 0, errors: 0 },
      logs: ["No se proporcionaron órdenes"],
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
  log(`Tipo de evento: ${validEventType}`);
  log(`Modo: ${validEventMode}`);
  log(`Total órdenes: ${orders.length}`);
  log(`Concurrencia: ${threads}`);

  let successCount = 0;
  let errorCount = 0;
  const errors = [];
  const startTime = Date.now();

  const chunks = [];
  for (let i = 0; i < orders.length; i += threads) {
    chunks.push(orders.slice(i, i + threads));
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
            validEventType,
            (order.country || validDefaultCountry).toUpperCase(),
            debug,
            null,
            validEventMode,
            { environment: validEnvironment }
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
      total: orders.length,
      seconds: Number(totalTime),
      environment: validEnvironment,
    },
    logs,
    errorDetails: errors,
  };
}

module.exports = { runResend, parseOrdersText, EVENT_TYPE_MAP };
