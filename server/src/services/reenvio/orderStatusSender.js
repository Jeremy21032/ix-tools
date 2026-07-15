const axios = require("axios");
const http = require("http");
const https = require("https");

const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 100 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 100 });

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitMsFrom429Response(response) {
  const ra = response?.headers?.["retry-after"];
  if (ra != null && String(ra).trim() !== "") {
    const sec = parseInt(String(ra).trim(), 10);
    if (!Number.isNaN(sec) && sec >= 0) {
      return Math.min(Math.max(sec * 1000, 400), 120_000);
    }
  }
  const data = response?.data;
  const msg =
    (data && typeof data === "object" && data.message != null && String(data.message)) ||
    (typeof data === "string" ? data : "") ||
    "";
  const m = /(\d+)\s*seconds?/i.exec(msg);
  if (m) {
    const sec = parseInt(m[1], 10);
    return Math.min(Math.max(sec * 1000, 400), 120_000);
  }
  return 1200;
}

const EVENT_TYPE_MAP = {
  PACK: {
    statusCode: "ORDER_PACK",
    statusDescription: "ORDEN EN PROCESO",
    subStatus: "Orden con pack",
    entityStatus: "ORDER_PACK",
  },
  PICK: {
    statusCode: "ORDER_PICK",
    statusDescription: "ORDEN EN PROCESO",
    subStatus: "ORDEN CON PICK",
    entityStatus: "ORDER_PICK",
  },
  READY_TO_DELIVER: {
    statusCode: "READY_TO_DELIVER",
    statusDescription: "ORDEN EN PROCESO",
    subStatus: "Lista para despacho Operador logistico",
    entityStatus: "READY_TO_DELIVER",
  },
  PROVIDER_ORDER_RELEASED: {
    statusCode: "PROVIDER_ORDER_RELEASED",
    statusDescription: "ORDEN EN PROCESO",
    subStatus: "LISTO PARA RETIRAR",
    entityStatus: "PROVIDER_ORDER_RELEASED",
    capability: "CORD",
    xChannel: "OMNI",
    headerXCountry: "CL",
    payloadCountry: "CO",
    headerCustomerId: "ICMX",
    payloadCustomerId: process.env.IXC_PROVIDER_PAYLOAD_CUSTOMER_ID || "XCLN22730",
    syncUpdateDateWithOrderCreation: true,
  },
};

function generateCurlCommand(url, payload, headers) {
  let curl = `curl -X POST "${url}" \\\n`;
  const headerOrder = [
    "Content-Type",
    "Ocp-Apim-Subscription-Key",
    "x-api-version",
    "x-channel",
    "x-commerce",
    "x-country",
    "x-customerid",
  ];
  for (const key of headerOrder) {
    if (headers[key]) curl += `  -H "${key}: ${headers[key]}" \\\n`;
  }
  for (const [key, value] of Object.entries(headers)) {
    if (!headerOrder.includes(key)) curl += `  -H "${key}: ${value}" \\\n`;
  }
  const escapedPayload = JSON.stringify(payload, null, 2)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\$/g, "\\$")
    .replace(/`/g, "\\`");
  curl += `  -d '${escapedPayload}'`;
  return curl;
}

function resolveEnvConfig(environment = "PROD") {
  const env = String(environment || "PROD").toUpperCase() === "UAT" ? "UAT" : "PROD";

  if (env === "UAT") {
    return {
      environment: "UAT",
      url:
        process.env.EVENT_PUBLISH_URL_UAT ||
        "https://integration-uat.ixcomerciolabs.com/api/event-adapter/event-publish",
      apimKey:
        process.env.OCP_APIM_SUBSCRIPTION_KEY_UAT ||
        process.env.OCP_APIM_SUBSCRIPTION_KEY ||
        "",
      providerReleasedKey:
        process.env.OCP_APIM_SUBSCRIPTION_KEY_PROVIDER_RELEASED_UAT ||
        process.env.OCP_APIM_SUBSCRIPTION_KEY_PROVIDER_RELEASED ||
        process.env.OCP_APIM_SUBSCRIPTION_KEY_UAT ||
        process.env.OCP_APIM_SUBSCRIPTION_KEY ||
        "",
    };
  }

  return {
    environment: "PROD",
    url:
      process.env.EVENT_PUBLISH_URL_PROD ||
      process.env.EVENT_PUBLISH_URL ||
      "https://integration.ixcomerciolabs.com/api/event-adapter/event-publish",
    apimKey:
      process.env.OCP_APIM_SUBSCRIPTION_KEY_PROD ||
      process.env.OCP_APIM_SUBSCRIPTION_KEY ||
      "",
    providerReleasedKey:
      process.env.OCP_APIM_SUBSCRIPTION_KEY_PROVIDER_RELEASED_PROD ||
      process.env.OCP_APIM_SUBSCRIPTION_KEY_PROVIDER_RELEASED ||
      process.env.OCP_APIM_SUBSCRIPTION_KEY_PROD ||
      process.env.OCP_APIM_SUBSCRIPTION_KEY ||
      "",
  };
}

function resolveApimKey(eventType, envConfig) {
  if (eventType.toUpperCase() === "PROVIDER_ORDER_RELEASED") {
    return envConfig.providerReleasedKey || envConfig.apimKey || "";
  }
  return envConfig.apimKey || "";
}

async function sendOrderStatus(
  orderId,
  eventType = "READY_TO_DELIVER",
  country = "CO",
  debug = false,
  orderCreationDate = null,
  eventMode = "requested",
  options = {}
) {
  const logs = [];
  const now = new Date().toISOString();
  const timestamp = String(Math.floor(Date.now() / 1000));
  const finalOrderCreationDate = orderCreationDate || now;
  const normalizedEventMode = eventMode.toLowerCase();
  const isChanged = normalizedEventMode === "changed";
  const finalEventType = isChanged ? "orderStatusChanged" : "orderStatusRequested";
  const finalEntityType = isChanged
    ? "ixc-fulfillment-order-status-changed"
    : "ixc-fulfillment-order-status-requested";

  const eventConfig = EVENT_TYPE_MAP[eventType.toUpperCase()];
  if (!eventConfig) {
    const msg = `Tipo de evento inválido: ${eventType}. Debe ser uno de: ${Object.keys(EVENT_TYPE_MAP).join(", ")}`;
    return { ok: false, orderId, message: msg, logs };
  }

  const envConfig = resolveEnvConfig(options.environment || "PROD");
  const derivedCustomerId = orderId.split("_").pop();
  const payloadCustomerId =
    options.payloadCustomerId ?? eventConfig.payloadCustomerId ?? derivedCustomerId;
  const headerCustomerId =
    options.headerCustomerId ?? eventConfig.headerCustomerId ?? payloadCustomerId;
  const headerXCountry = eventConfig.headerXCountry ?? country;
  const envelopeCountry = eventConfig.payloadCountry ?? country;
  const xChannel = eventConfig.xChannel ?? "WL180";
  const apimSubscriptionKey = resolveApimKey(eventType, envConfig);

  if (!apimSubscriptionKey) {
    const keyHint =
      envConfig.environment === "UAT"
        ? "OCP_APIM_SUBSCRIPTION_KEY_UAT"
        : "OCP_APIM_SUBSCRIPTION_KEY_PROD";
    return {
      ok: false,
      orderId,
      message: `Falta ${keyHint} en el .env para ambiente ${envConfig.environment}`,
      logs,
    };
  }

  const statusUpdateDate = eventConfig.syncUpdateDateWithOrderCreation
    ? finalOrderCreationDate
    : now;

  const url = envConfig.url;

  const headers = {
    "Content-Type": "application/json",
    "Ocp-Apim-Subscription-Key": apimSubscriptionKey,
    "x-api-version": "1",
    "x-channel": xChannel,
    "x-commerce": "IXC",
    "x-country": headerXCountry,
    "x-customerid": headerCustomerId,
  };

  const payload = {
    data: JSON.stringify({
      orderNumber: orderId,
      orderCreationDate: finalOrderCreationDate,
      statusInformation: {
        statusCode: eventConfig.statusCode,
        statusDescription: eventConfig.statusDescription,
        subStatus: eventConfig.subStatus,
        updateDate: statusUpdateDate,
      },
    }),
    domain: "OMNI",
    channel: "OMNI",
    country: envelopeCountry,
    version: "1.0",
    commerce: "IXC",
    datetime: now,
    entityId: orderId,
    mimeType: "application/json",
    timestamp,
    capability: eventConfig.capability || "FORD",
    customerId: payloadCustomerId,
    eventType: finalEventType,
    entityType: finalEntityType,
    entityStatus: eventConfig.entityStatus,
  };

  if (debug) {
    logs.push(`Ambiente: ${envConfig.environment} | URL: ${url}`);
    logs.push("DEBUG curl:\n" + generateCurlCommand(url, payload, headers));
  }

  const timeoutMs = parseInt(process.env.AXIOS_TIMEOUT_MS || "60000", 10);
  const max429Retries = parseInt(process.env.RETRY_429_MAX || "15", 10);
  let retries429 = 0;

  while (true) {
    try {
      const response = await axios.post(url, payload, {
        headers,
        timeout: timeoutMs,
        httpAgent,
        httpsAgent,
        validateStatus: (s) => s >= 200 && s < 300,
      });
      const retryNote = retries429 > 0 ? ` | Reintentos 429: ${retries429}` : "";
      const line = `✔ [${envConfig.environment}] ${orderId} | País: ${country} | Evento: ${eventType} | Status: ${response.status}${retryNote}`;
      logs.push(line);
      return { ok: true, orderId, logs };
    } catch (error) {
      const status = error.response?.status;
      if (status === 429 && retries429 < max429Retries) {
        const waitMs = waitMsFrom429Response(error.response);
        const jitter = Math.floor(Math.random() * 400);
        if (process.env.LOG_429 === "1") {
          logs.push(
            `⏳ 429 ${orderId}: espera ${waitMs + jitter}ms (reintento ${retries429 + 1}/${max429Retries})`
          );
        }
        await sleep(waitMs + jitter);
        retries429++;
        continue;
      }
      const detail = error.response?.data || error.message;
      const message = typeof detail === "string" ? detail : JSON.stringify(detail);
      logs.push(
        `❌ [${envConfig.environment}] Error enviando ${orderId} (${country}, ${eventType}): ${message}`
      );
      return { ok: false, orderId, message, logs };
    }
  }
}

module.exports = { sendOrderStatus, EVENT_TYPE_MAP, resolveEnvConfig };
