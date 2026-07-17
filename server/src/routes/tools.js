const express = require("express");
const fs = require("fs");
const path = require("path");
const { runResend, EVENT_TYPE_MAP } = require("../services/reenvio/runResend");
const {
  runPython,
  writeTempFile,
  findNewestFile,
  listJobFiles,
  DOWNLOADS_DIR,
} = require("../services/pythonRunner");
const { upload } = require("../middleware/upload");
const {
  jsonOneline,
  jsonPretty,
  transformShipment,
  extractBrokered,
} = require("../services/nodeTools");
const { productLookup, productLookupBulk, searchAvailabilityCsv } = require("../services/availabilitySearch");
const {
  buildJobArtifacts,
  saveTextJob,
  tableSummary,
  asTable,
  downloadUrl,
} = require("../services/resultArtifacts");
const {
  getLookupPath,
  readLookup,
  readMeta,
  writeLookup,
  rowsToLookup,
  lookupToRows,
  validateLookup,
} = require("../services/customerLookup");

const router = express.Router();
const CUSTOMER_LOOKUP = getLookupPath();

function okResult(res, payload) {
  res.json({ ok: true, ...payload });
}

function failResult(res, status, error, extra = {}) {
  res.status(status).json({ ok: false, error, ...extra });
}

function respondPythonJob(res, result, preferExts) {
  const artifacts = buildJobArtifacts(result.jobDir, result.jobId, preferExts);
  const summaryFromTable = artifacts.table ? tableSummary(artifacts.table) : null;

  let download = artifacts.downloadUrl;
  let downloadName = artifacts.downloadName;
  if (!download && (result.logs || []).length) {
    const saved = saveTextJob((result.logs || []).join("\n"), "run_logs.txt");
    download = saved.downloadUrl;
    downloadName = saved.downloadName;
  }

  okResult(res, {
    ok: result.ok,
    summary: summaryFromTable || {
      success: result.ok ? 1 : 0,
      errors: result.ok ? 0 : 1,
    },
    logs: result.logs,
    downloadUrl: download,
    downloadName,
    files: artifacts.files,
    table: artifacts.table,
    result: artifacts.result || undefined,
  });
}

/** POST /api/tools/order-status-resender */
router.post("/order-status-resender", async (req, res) => {
  try {
    const {
      orders,
      country = "CO",
      status = "READY_TO_DELIVER",
      eventMode = "requested",
      threads = 8,
      debug = false,
      environment = "PROD",
    } = req.body || {};
    const result = await runResend({
      orders,
      country,
      status,
      eventMode,
      threads: Number(threads) || 8,
      debug: Boolean(debug),
      environment,
    });

    const detailRows = (result.errorDetails || []).map((e) => ({
      orderId: e.orderId,
      status: "error",
      message: e.message,
    }));
    // Also include successes inferred from summary if we only have errors list
    const table = {
      columns: ["orderId", "status", "message"],
      rows: detailRows.length
        ? detailRows
        : result.ok
          ? [{ orderId: "(todas)", status: "ok", message: `OK ${result.summary?.success || 0}` }]
          : [],
    };

    const saved = saveTextJob(
      (result.logs || []).join("\n"),
      `reenvio_${(environment || "PROD").toLowerCase()}_logs.txt`
    );

    okResult(res, {
      ...result,
      table: detailRows.length || result.ok ? table : null,
      downloadUrl: saved.downloadUrl,
      downloadName: saved.downloadName,
    });
  } catch (e) {
    failResult(res, 500, e.message);
  }
});

router.get("/order-status-resender/meta", (_req, res) => {
  const { resolveEnvConfig } = require("../services/reenvio/orderStatusSender");
  const prod = resolveEnvConfig("PROD");
  const uat = resolveEnvConfig("UAT");
  res.json({
    statuses: Object.keys(EVENT_TYPE_MAP),
    eventModes: ["requested", "changed"],
    environments: [
      { value: "PROD", label: "PROD", url: prod.url, hasKey: Boolean(prod.apimKey) },
      { value: "UAT", label: "UAT", url: uat.url, hasKey: Boolean(uat.apimKey) },
    ],
  });
});

/** GET /api/tools/customer-lookup — leer customer_lookup.json */
router.get("/customer-lookup", (_req, res) => {
  try {
    const data = readLookup();
    const meta = readMeta();
    okResult(res, {
      data,
      rows: lookupToRows(data),
      path: CUSTOMER_LOOKUP,
      count: Object.keys(data).length,
      meta,
    });
  } catch (e) {
    failResult(res, 500, e.message);
  }
});

/** POST /api/tools/customer-lookup — guardar (body.data objeto o body.rows tabla) */
router.post("/customer-lookup", (req, res) => {
  try {
    let payload = req.body?.data;
    if (payload == null && Array.isArray(req.body?.rows)) {
      payload = rowsToLookup(req.body.rows);
    }
    if (payload == null && req.body?.text) {
      payload = JSON.parse(String(req.body.text));
    }
    const result = writeLookup(payload, {
      note: req.body?.note,
      source: req.body?.source || "ui",
    });
    if (!result.ok) return failResult(res, 400, result.error);
    okResult(res, {
      data: result.data,
      rows: lookupToRows(result.data),
      count: result.count,
      path: result.path,
      meta: result.meta,
      summary: { success: result.count, errors: 0 },
      logs: [
        `Guardado ${result.count} customer(s) en customer_lookup.json`,
        result.meta?.updatedAt ? `Última actualización: ${result.meta.updatedAt}` : "",
      ].filter(Boolean),
    });
  } catch (e) {
    failResult(res, 400, e.message);
  }
});

/** POST /api/tools/customer-lookup/validate — dry-run sin escribir */
router.post("/customer-lookup/validate", (req, res) => {
  try {
    let payload = req.body?.data;
    if (payload == null && Array.isArray(req.body?.rows)) {
      payload = rowsToLookup(req.body.rows);
    }
    const result = validateLookup(payload);
    if (!result.ok) return failResult(res, 400, result.error);
    okResult(res, { data: result.data, count: Object.keys(result.data).length });
  } catch (e) {
    failResult(res, 400, e.message);
  }
});

/** POST /api/tools/get-order-excel */
router.post("/get-order-excel", upload.single("ordersFile"), async (req, res) => {
  try {
    let ordersPath = req.file?.path;
    if (!ordersPath && req.body?.ordersText) {
      ordersPath = writeTempFile(req.body.ordersText, ".txt");
    }
    if (!ordersPath) return failResult(res, 400, "Se requiere ordersFile o ordersText");

    const customersFile = req.body?.customersFile || CUSTOMER_LOOKUP;
    const result = await runPython("fetch_orders_to_excel.py", [
      "--orders-file",
      ordersPath,
      "--customers-file",
      customersFile,
      "--output-dir",
      ".",
      "--json-out",
      "report.json",
      "--yes",
      ...(req.body?.debug === "true" || req.body?.debug === true ? ["--debug"] : []),
    ]);
    return respondPythonJob(res, result, [".xlsx", ".json"]);
  } catch (e) {
    failResult(res, 500, e.message);
  }
});

/** POST /api/tools/fema-consumer-order */
router.post("/fema-consumer-order", async (req, res) => {
  try {
    const ordersText = req.body?.orders || "";
    const ids = String(ordersText)
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!ids.length) return failResult(res, 400, "orders vacío");

    const outName = "orders_result.xlsx";
    const result = await runPython("fetch_order_to_excel_new.py", [
      "--orders",
      ids.join(","),
      "--output",
      outName,
      "--json-out",
      "report.json",
    ]);
    return respondPythonJob(res, result, [".xlsx", ".json"]);
  } catch (e) {
    failResult(res, 500, e.message);
  }
});

/** Shopify: credenciales por request (multi-tienda). Env solo como fallback opcional. */
function resolveShopifyCreds(req) {
  const body = req.body || {};
  const shop = String(
    body.shopifyStore || body.shop || body.store || body.SHOPIFY_STORE || body.SHOPIFY_SHOP || ""
  )
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
  const token = String(
    body.shopifyToken || body.token || body.accessToken || body.SHOPIFY_ACCESS_TOKEN || ""
  ).trim();
  return { shop, token };
}

function shopifyCredArgs(shop, token) {
  return ["--shop", shop, "--token", token];
}

async function runShopifyScript(script, extraArgs, req, res) {
  try {
    const { shop, token } = resolveShopifyCreds(req);
    if (!shop || !token) {
      return failResult(
        res,
        400,
        "Indica shopifyStore (ej. mi-tienda.myshopify.com) y shopifyToken en el formulario"
      );
    }
    const args = [...shopifyCredArgs(shop, token), ...extraArgs];
    const result = await runPython(script, args, {
      env: {
        SHOPIFY_STORE: shop,
        SHOPIFY_SHOP: shop,
        SHOPIFY_ACCESS_TOKEN: token,
      },
    });
    return respondPythonJob(res, result, [".xlsx", ".csv", ".json"]);
  } catch (e) {
    failResult(res, 500, e.message);
  }
}

router.post("/shopify-orders", upload.single("ordersFile"), async (req, res) => {
  let inputPath = req.file?.path;
  if (!inputPath && req.body?.ordersText) {
    inputPath = writeTempFile(req.body.ordersText, ".txt");
  }
  if (!inputPath) return failResult(res, 400, "Se requiere ordersFile o ordersText");
  await runShopifyScript(
    "fetch_orders_shopify.py",
    ["--input", inputPath, "--output-dir", "."],
    req,
    res
  );
});

router.post("/shopify-variants", async (req, res) => {
  await runShopifyScript("shopify_list_variants.py", ["-o", "variants.json"], req, res);
});

router.post("/shopify-catalog-excel", async (req, res) => {
  await runShopifyScript("shopify_products_variants_excel.py", ["-o", "catalog.xlsx"], req, res);
});

router.post("/shopify-shipping-metafields", upload.single("variantsFile"), async (req, res) => {
  try {
    const dryRun = req.body?.dryRun !== "false" && req.body?.dryRun !== false;
    const confirm = req.body?.confirm === true || req.body?.confirm === "true";
    if (!dryRun && !confirm) {
      return failResult(res, 400, "Para escribir requiere confirm=true (dryRun=false)");
    }
    const args = [];
    if (req.file?.path) {
      args.push("--from-json", req.file.path);
    }
    if (req.body?.variantId) {
      args.push("--variant-id", req.body.variantId);
    }
    if (req.body?.allVariants === true || req.body?.allVariants === "true") {
      args.push("--all-variants", "--i-understand");
    }
    if (dryRun) args.push("--dry-run");

    await runShopifyScript("shopify_update_ixc_shipping_metafields.py", args, req, res);
  } catch (e) {
    failResult(res, 500, e.message);
  }
});

/** Availability */
router.post("/sku-availability", upload.single("skusFile"), async (req, res) => {
  try {
    let skusPath = req.file?.path;
    if (!skusPath && req.body?.skusText) {
      skusPath = writeTempFile(req.body.skusText, ".txt");
    }
    if (!skusPath) return failResult(res, 400, "Se requiere skusFile o skusText");
    const out = "disponibilidad.xlsx";
    const result = await runPython("consultar_disponibilidad.py", [
      "--skus",
      skusPath,
      "-o",
      out,
    ]);
    return respondPythonJob(res, result, [".xlsx"]);
  } catch (e) {
    failResult(res, 500, e.message);
  }
});

router.post(
  "/availability-netsuite-diff",
  upload.fields([
    { name: "apiFile", maxCount: 1 },
    { name: "netsuiteFile", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const apiFile = req.files?.apiFile?.[0]?.path;
      const nsFile = req.files?.netsuiteFile?.[0]?.path;
      if (!apiFile || !nsFile) {
        return failResult(res, 400, "Se requieren apiFile (xlsx) y netsuiteFile (csv)");
      }
      const country = req.body?.country || "";
      const out = "comparacion.xlsx";
      const args = ["--api", apiFile, "--netsuite", nsFile, "-o", out];
      if (country) args.push("--country", country);
      if (req.body?.nivel) args.push("--nivel", req.body.nivel);
      const result = await runPython("comparar_disponibilidad_netsuite.py", args);
      return respondPythonJob(res, result, [".xlsx"]);
    } catch (e) {
      failResult(res, 500, e.message);
    }
  }
);

router.post("/availability-search", async (req, res) => {
  try {
    const { mode = "csv", column, query, mpn, mpns, country } = req.body || {};
    if (mode === "product") {
      const list = mpns || (typeof mpn === "string" ? mpn.split(/[\n,]+/) : mpn ? [mpn] : []);
      const cleaned = list.map(String).map((s) => s.trim()).filter(Boolean);
      if (!cleaned.length) return failResult(res, 400, "mpn(s) requerido");
      const data =
        cleaned.length === 1
          ? [await productLookup(cleaned[0], country)]
          : await productLookupBulk(cleaned, country);
      const table = asTable(
        data.map((d) => ({
          mpn: d.mpn || "",
          status: d.status ?? "",
          error: d.error || "",
          preview: d.data != null ? JSON.stringify(d.data).slice(0, 200) : "",
        }))
      );
      const saved = saveTextJob(JSON.stringify(data, null, 2), "product_lookup.json");
      return okResult(res, {
        table,
        result: JSON.stringify(data, null, 2),
        downloadUrl: saved.downloadUrl,
        downloadName: saved.downloadName,
        logs: [`Lookup: ${cleaned.length} MPN`],
        summary: tableSummary(table),
      });
    }
    const data = await searchAvailabilityCsv({ column, query });
    const table = asTable(data.rows || []);
    const saved = saveTextJob(JSON.stringify(data, null, 2), "availability_search.json");
    okResult(res, {
      table,
      result: table ? undefined : JSON.stringify(data, null, 2),
      downloadUrl: saved.downloadUrl,
      downloadName: saved.downloadName,
      logs: [`CSV search column=${column || "*"} q=${query || ""} · files=${(data.files || []).length}`],
      summary: tableSummary(table),
    });
  } catch (e) {
    failResult(res, 500, e.message);
  }
});

/** Node JSON tools */
router.post("/json-oneline", (req, res) => {
  try {
    const { text, stringify = false } = req.body || {};
    const out = jsonOneline(text, Boolean(stringify));
    const saved = saveTextJob(out + "\n", stringify ? "json_stringified.txt" : "json_oneline.json");
    okResult(res, {
      result: out,
      logs: ["OK"],
      downloadUrl: saved.downloadUrl,
      downloadName: saved.downloadName,
      summary: { success: 1, errors: 0 },
    });
  } catch (e) {
    failResult(res, 400, e.message);
  }
});

router.post("/json-pretty", (req, res) => {
  try {
    const { text, unwrap = true } = req.body || {};
    const out = jsonPretty(text, { unwrap: unwrap !== false && unwrap !== "false" });
    const saved = saveTextJob(out + "\n", "json_pretty.json");
    okResult(res, {
      result: out,
      logs: ["OK"],
      downloadUrl: saved.downloadUrl,
      downloadName: saved.downloadName,
      summary: { success: 1, errors: 0 },
    });
  } catch (e) {
    failResult(res, 400, e.message);
  }
});

router.post("/shipment-transform", (req, res) => {
  try {
    const { text, asString = false } = req.body || {};
    const out = transformShipment(text, Boolean(asString));
    const saved = saveTextJob(
      typeof out === "string" ? out : JSON.stringify(out, null, 2),
      "shipment_transform.json"
    );
    okResult(res, {
      result: out,
      logs: ["OK"],
      downloadUrl: saved.downloadUrl,
      downloadName: saved.downloadName,
      summary: { success: 1, errors: 0 },
    });
  } catch (e) {
    failResult(res, 400, e.message);
  }
});

router.post("/brokered-extract", upload.single("jsonFile"), async (req, res) => {
  try {
    let jsonText = req.body?.text;
    if (req.file?.path) jsonText = fs.readFileSync(req.file.path, "utf8");
    if (!jsonText) return failResult(res, 400, "text o jsonFile requerido");

    const inputPath = writeTempFile(jsonText, ".json");
    const out = "brokered.csv";
    const result = await runPython("extract_brokered_order_fields.py", [
      "--input",
      inputPath,
      "-o",
      out,
    ]);
    if (!result.ok) {
      const csv = extractBrokered(jsonText);
      const saved = saveTextJob(csv, out);
      const table = asTable(
        csv
          .trim()
          .split(/\r?\n/)
          .slice(1)
          .filter(Boolean)
          .map((line) => {
            // rough CSV for preview — prefer file download for full fidelity
            const parts = line.match(/("(?:[^"]|"")*"|[^,]*)/g) || [];
            const vals = parts.map((p) => p.replace(/^"|"$/g, "").replace(/""/g, '"'));
            return {
              OrderNumber: vals[0] || "",
              PickNumber: vals[1] || "",
              PackNumber: vals[2] || "",
              CustomerId: vals[3] || "",
              fordNotification: vals[4] || "",
            };
          })
      );
      return okResult(res, {
        summary: tableSummary(table),
        logs: [...result.logs, "Fallback Node extract"],
        downloadUrl: saved.downloadUrl,
        downloadName: saved.downloadName,
        table,
        result: csv.slice(0, 4000),
      });
    }
    return respondPythonJob(res, result, [".csv"]);
  } catch (e) {
    failResult(res, 500, e.message);
  }
});

router.post("/hierarchy-excel", upload.single("jsonFile"), async (req, res) => {
  try {
    let inputPath = req.file?.path;
    if (!inputPath && req.body?.text) {
      inputPath = writeTempFile(req.body.text, ".json");
    }
    if (!inputPath) return failResult(res, 400, "jsonFile o text requerido");
    const out = "hierarchy.xlsx";
    const result = await runPython("hearchy.py", ["--input", inputPath, "--output", out]);
    return respondPythonJob(res, result, [".xlsx"]);
  } catch (e) {
    failResult(res, 500, e.message);
  }
});

router.post("/download-images", upload.single("urlsFile"), async (req, res) => {
  try {
    let urlsPath = req.file?.path;
    if (!urlsPath && req.body?.urlsText) {
      urlsPath = writeTempFile(req.body.urlsText, ".txt");
    }
    if (!urlsPath) return failResult(res, 400, "urlsFile o urlsText requerido");
    const delay = req.body?.delay || "0.5";
    const result = await runPython("download_pixieset_images.py", [
      "--input",
      urlsPath,
      "--output-dir",
      "images",
      "--delay",
      String(delay),
    ]);
    const files = listJobFiles(result.jobDir);
    const imageFiles = files.filter((f) =>
      /\.(jpe?g|png|gif|webp|bmp)$/i.test(f)
    );
    const table = {
      columns: ["file"],
      rows: imageFiles.map((f) => ({ file: f })),
    };
    const manifest = saveTextJob(imageFiles.join("\n") + "\n", "downloaded_files.txt");
    // Prefer a downloadable image or the manifest
    const firstImg = imageFiles[0];
    okResult(res, {
      summary: {
        success: imageFiles.length,
        errors: result.ok ? 0 : 1,
        total: imageFiles.length,
      },
      logs: result.logs,
      table,
      files,
      downloadUrl: firstImg
        ? downloadUrl(result.jobId, firstImg)
        : manifest.downloadUrl,
      downloadName: firstImg || manifest.downloadName,
      result: imageFiles.length
        ? `${imageFiles.length} archivo(s) en el job. Lista también descargable.`
        : undefined,
    });
  } catch (e) {
    failResult(res, 500, e.message);
  }
});

/** Documentos / teléfonos sintéticos (testing de formularios) */
const {
  listDocumentTypes,
  generateDocuments,
  listPhoneTypes,
  generatePhones,
} = require("../services/documentGenerator");

router.get("/fake-documents/meta", (_req, res) => {
  res.json({
    ok: true,
    documents: listDocumentTypes(),
    phones: listPhoneTypes(),
  });
});

router.post("/fake-documents", (req, res) => {
  try {
    const {
      kind = "document",
      documentType,
      phoneType,
      count = 10,
      prefixMode = "both",
    } = req.body || {};

    let table;
    let label;
    if (kind === "phone") {
      if (!phoneType) return failResult(res, 400, "phoneType requerido");
      table = generatePhones({ phoneType, count, prefixMode });
      label = phoneType;
    } else {
      if (!documentType) return failResult(res, 400, "documentType requerido");
      table = generateDocuments({ documentType, count });
      label = documentType;
    }

    const csv = [
      table.columns.join(","),
      ...table.rows.map((r) =>
        table.columns.map((c) => `"${String(r[c] ?? "").replace(/"/g, '""')}"`).join(",")
      ),
    ].join("\n");
    const csvSaved = saveTextJob(csv + "\n", `fake_${kind}_${label}.csv`);

    okResult(res, {
      summary: {
        success: table.rows.length,
        errors: 0,
        total: table.rows.length,
      },
      table,
      logs: [
        `Generados ${table.rows.length} ${kind === "phone" ? "teléfono(s)" : "documento(s)"} sintético(s) (${label}).`,
        kind === "phone" && prefixMode === "both"
          ? "Columnas national (sin +código, ej. 09… EC) e international (con +código, ej. +593…)."
          : null,
        "Solo para testing de validadores/formatos — no usar como datos reales.",
      ].filter(Boolean),
      downloadUrl: csvSaved.downloadUrl,
      downloadName: csvSaved.downloadName,
    });
  } catch (e) {
    failResult(res, 400, e.message);
  }
});

module.exports = router;
