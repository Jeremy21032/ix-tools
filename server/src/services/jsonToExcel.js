const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const { DOWNLOADS_DIR, ensureDirs } = require("./pythonRunner");
const { downloadUrl, asTable } = require("./resultArtifacts");

const ARRAY_HINT_KEYS = [
  "data",
  "items",
  "results",
  "rows",
  "records",
  "products",
  "variants",
  "orders",
  "list",
  "values",
];

function cellValue(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  return v;
}

/**
 * Normalize arbitrary JSON into an array of flat row objects.
 */
function jsonToRows(input) {
  let data = input;
  if (typeof data === "string") {
    data = JSON.parse(data);
  }

  if (Array.isArray(data)) {
    if (!data.length) return { rows: [], columns: [] };
    if (typeof data[0] !== "object" || data[0] === null || Array.isArray(data[0])) {
      // array of primitives → single column
      return {
        columns: ["value"],
        rows: data.map((v) => ({ value: cellValue(v) })),
      };
    }
    return rowsFromObjectArray(data);
  }

  if (data && typeof data === "object") {
    for (const key of ARRAY_HINT_KEYS) {
      if (Array.isArray(data[key]) && data[key].length && typeof data[key][0] === "object") {
        return rowsFromObjectArray(data[key]);
      }
    }
    // single object → one row
    return rowsFromObjectArray([data]);
  }

  throw new Error("JSON no soportado: se espera un array de objetos o un objeto");
}

function rowsFromObjectArray(arr) {
  const columns = [];
  const seen = new Set();
  for (const item of arr) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    for (const k of Object.keys(item)) {
      if (!seen.has(k)) {
        seen.add(k);
        columns.push(k);
      }
    }
  }
  const rows = arr.map((item) => {
    const out = {};
    for (const c of columns) {
      out[c] = cellValue(item && typeof item === "object" ? item[c] : "");
    }
    return out;
  });
  return { columns, rows };
}

function writeRowsToXlsx(filePath, columns, rows, sheetName = "Datos") {
  const aoa = [columns, ...rows.map((r) => columns.map((c) => r[c] ?? ""))];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = columns.map((c) => ({
    wch: Math.min(40, Math.max(10, String(c).length + 2)),
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31) || "Datos");
  ensureDirs();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  XLSX.writeFile(wb, filePath);
}

/**
 * Convert JSON text/object → Excel job artifact + table preview.
 */
function jsonToExcelJob(jsonInput, { filename = "json_to_excel.xlsx", sheetName = "Datos" } = {}) {
  const { columns, rows } = jsonToRows(jsonInput);
  if (!columns.length) {
    throw new Error("No hay columnas para exportar (JSON vacío o sin objetos)");
  }

  ensureDirs();
  const jobId = uuidv4();
  const jobDir = path.join(DOWNLOADS_DIR, jobId);
  fs.mkdirSync(jobDir, { recursive: true });
  const safe = String(filename).replace(/[^\w.\-]+/g, "_") || "json_to_excel.xlsx";
  const full = path.join(jobDir, safe.endsWith(".xlsx") ? safe : `${safe}.xlsx`);
  writeRowsToXlsx(full, columns, rows, sheetName);

  const table = asTable({ columns, rows });
  return {
    jobId,
    jobDir,
    downloadUrl: downloadUrl(jobId, path.basename(full)),
    downloadName: path.basename(full),
    table,
    summary: { success: rows.length, errors: 0, total: rows.length },
    columns,
    rowCount: rows.length,
  };
}

module.exports = {
  jsonToRows,
  jsonToExcelJob,
  writeRowsToXlsx,
  cellValue,
};
