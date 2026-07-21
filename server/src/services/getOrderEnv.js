/**
 * Resolve GetOrder / iws-keys endpoints and keys by environment (PROD | UAT).
 * Falls back to legacy unsuffixed env vars for PROD.
 */

function resolveGetOrderEnv(environment = "PROD") {
  const env = String(environment || "PROD").toUpperCase() === "UAT" ? "UAT" : "PROD";

  if (env === "UAT") {
    return {
      environment: "UAT",
      signatureUrlTemplate:
        process.env.SIGNATURE_URL_TEMPLATE_UAT ||
        "https://integration-uat.ixcomerciolabs.com/api/iws-keys/{type}",
      signatureApimKey:
        process.env.SIGNATURE_APIM_KEY_UAT ||
        process.env.SIGNATURE_APIM_KEY ||
        "",
      getOrderUrl:
        process.env.GET_ORDER_URL_UAT ||
        process.env.GET_ORDER_URL ||
        "",
      getOrderCookie:
        process.env.GET_ORDER_COOKIE_UAT ||
        process.env.GET_ORDER_COOKIE ||
        "",
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
