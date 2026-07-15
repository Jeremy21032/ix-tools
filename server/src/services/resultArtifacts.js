const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const {
  DOWNLOADS_DIR,
  findNewestFile,
  listJobFiles,
  ensureDirs,
} = require("./pythonRunner");

function downloadUrl(jobId, file) {
  const safe = String(file)
    .split(/[/\\]+/)
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
  return `/api/downloads/${jobId}/${safe}`;
}

/**
 * Convert array of objects / {columns,rows} into table shape.
 */
function asTable(input) {
  if (!input) return null;
  if (input.columns && Array.isArray(input.rows)) {
    return {
      columns: input.columns.map(String),
      rows: input.rows,
    };
  }
  if (Array.isArray(input) && input.length) {
    if (typeof input[0] === "object" && input[0] !== null && !Array.isArray(input[0])) {
      const columns = Object.keys(input[0]);
      return {
        columns,
        rows: input.map((row) => {
          const out = {};
          for (const c of columns) out[c] = row[c] ?? "";
          return out;
        }),
      };
    }
  }
  if (typeof input === "object" && input.data && Array.isArray(input.data)) {
    return asTable(input.data);
  }
  if (typeof input === "object" && input.rows && Array.isArray(input.rows)) {
    return asTable(input.rows);
  }
  return null;
}

function readCsvAsTable(filePath, maxRows = 2000) {
  const text = fs.readFileSync(filePath, "utf8");
  const lines = text.split(/\r?\n/).filter((l) => l.length);
  if (!lines.length) return null;
  const parseLine = (line) => {
    const result = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = !inQuotes;
      } else if (c === "," && !inQuotes) {
        result.push(cur);
        cur = "";
      } else cur += c;
    }
    result.push(cur);
    return result;
  };
  const header = parseLine(lines[0]).map((h, i) => h || `col_${i + 1}`);
  const rows = [];
  for (let i = 1; i < lines.length && rows.length < maxRows; i++) {
    const cols = parseLine(lines[i]);
    const row = {};
    header.forEach((h, idx) => {
      row[h] = cols[idx] ?? "";
    });
    rows.push(row);
  }
  return { columns: header, rows };
}

function readExcelAsTable(filePath, maxRows = 2000) {
  // Lazy require so server boots even if not installed yet
  let XLSX;
  try {
    XLSX = require("xlsx");
  } catch {
    return null;
  }
  const wb = XLSX.readFile(filePath, { cellDates: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return null;
  const sheet = wb.Sheets[sheetName];
  const json = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
  if (!json.length) {
    // empty sheet with headers only
    const rows2d = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
    if (!rows2d.length) return null;
    const columns = (rows2d[0] || []).map((h, i) => String(h || `col_${i + 1}`));
    return { columns, rows: [], sheet: sheetName };
  }
  const columns = Object.keys(json[0]);
  return {
    columns,
    rows: json.slice(0, maxRows).map((r) => {
      const out = {};
      for (const c of columns) out[c] = r[c] ?? "";
      return out;
    }),
    sheet: sheetName,
  };
}

function readJsonFileAsTable(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (raw && raw.columns && raw.rows) return asTable(raw);
  return asTable(raw);
}

/**
 * Pick best artifact from a job folder and build table + downloadUrl.
 */
function buildJobArtifacts(jobDir, jobId, preferExts = [".xlsx", ".csv", ".json"]) {
  const files = listJobFiles(jobDir);
  const preferred =
    preferExts.map((ext) => findNewestFile(jobDir, [ext])).find(Boolean) ||
    files[0] ||
    null;

  let table = null;
  let previewText = null;

  // Prefer explicit report.json from our scripts
  if (files.includes("report.json")) {
    try {
      table = readJsonFileAsTable(path.join(jobDir, "report.json"));
    } catch {
      /* ignore */
    }
  }

  if (preferred) {
    const full = path.join(jobDir, preferred);
    const lower = preferred.toLowerCase();
    try {
      if (!table && lower.endsWith(".xlsx")) table = readExcelAsTable(full);
      else if (!table && lower.endsWith(".csv")) table = readCsvAsTable(full);
      else if (!table && lower.endsWith(".json")) {
        const raw = JSON.parse(fs.readFileSync(full, "utf8"));
        table = asTable(raw);
        if (!table) {
          previewText = JSON.stringify(raw, null, 2);
          if (previewText.length > 200_000) {
            previewText = previewText.slice(0, 200_000) + "\n… (truncado)";
          }
        }
      }
    } catch (e) {
      previewText = `No se pudo leer ${preferred}: ${e.message}`;
    }
  }

  return {
    files,
    downloadUrl: preferred ? downloadUrl(jobId, preferred) : null,
    downloadName: preferred || null,
    table,
    result: previewText,
  };
}

/**
 * Persist a text/JSON result into a job dir so the UI can download it.
 */
function saveTextJob(content, filename = "result.txt") {
  ensureDirs();
  const jobId = uuidv4();
  const jobDir = path.join(DOWNLOADS_DIR, jobId);
  fs.mkdirSync(jobDir, { recursive: true });
  const safe = filename.replace(/[^\w.\-]+/g, "_");
  fs.writeFileSync(path.join(jobDir, safe), content, "utf8");
  return {
    jobId,
    jobDir,
    downloadUrl: downloadUrl(jobId, safe),
    downloadName: safe,
  };
}

function tableSummary(table) {
  if (!table?.rows) return { success: 0, errors: 0 };
  const rows = table.rows;
  const errRows = rows.filter((r) => r.error).length;
  return {
    success: rows.length - errRows,
    errors: errRows,
    total: rows.length,
  };
}

module.exports = {
  asTable,
  buildJobArtifacts,
  saveTextJob,
  tableSummary,
  downloadUrl,
  readExcelAsTable,
  readCsvAsTable,
};
