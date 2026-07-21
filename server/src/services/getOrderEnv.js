/**
 * Resolve GetOrder / iws-keys endpoints and keys by environment (PROD | UAT).
 * UAT never silently falls back to PROD URLs/keys — that caused "selected UAT but hit PROD".
 */

function resolveGetOrderEnv(environment = "PROD") {
  const env = String(environment || "PROD").toUpperCase() === "UAT" ? "UAT" : "PROD";

  if (env === "UAT") {
    return {
      environment: "UAT",
      signatureUrlTemplate:
        process.env.SIGNATURE_URL_TEMPLATE_UAT ||
        "https://integration-uat.ixcomerciolabs.com/api/iws-keys/{type}",
      // No fallback to PROD key — must set SIGNATURE_APIM_KEY_UAT
      signatureApimKey: process.env.SIGNATURE_APIM_KEY_UAT || "",
      // No fallback to GET_ORDER_URL (PROD) — must set GET_ORDER_URL_UAT
      getOrderUrl: process.env.GET_ORDER_URL_UAT || "",
      getOrderCookie: process.env.GET_ORDER_COOKIE_UAT || "",
    };
  }

  return {
    environment: "PROD",
    signatureUrlTemplate:
      process.env.SIGNATURE_URL_TEMPLATE_PROD ||
      process.env.SIGNATURE_URL_TEMPLATE ||
      "https://integration.ixcomerciolabs.com/api/iws-keys/{type}",
    signatureApimKey:
      process.env.SIGNATURE_APIM_KEY_PROD ||
      process.env.SIGNATURE_APIM_KEY ||
      "",
    getOrderUrl:
      process.env.GET_ORDER_URL_PROD ||
      process.env.GET_ORDER_URL ||
      "https://intcomex-prod.apigee.net/v1/getorder",
    getOrderCookie:
      process.env.GET_ORDER_COOKIE_PROD ||
      process.env.GET_ORDER_COOKIE ||
      "",
  };
}

module.exports = { resolveGetOrderEnv };
