const fs = require("fs");
const path = require("path");
const axios = require("axios");

const AVAILABILITY_DIR = path.join(__dirname, "../../data/availability");

function listCsvFiles() {
  if (!fs.existsSync(AVAILABILITY_DIR)) return [];
  return fs
    .readdirSync(AVAILABILITY_DIR)
    .filter((f) => f.toLowerCase().endsWith(".csv"))
    .map((f) => path.join(AVAILABILITY_DIR, f));
}

function parseCsvLine(line) {
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
}

async function searchAvailabilityCsv({ column, query }) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return { rows: [], files: [] };
  const files = listCsvFiles();
  const rows = [];
  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (!lines.length) continue;
    const header = parseCsvLine(lines[0]);
    const colIdx =
      column && header.includes(column)
        ? header.indexOf(column)
        : -1;
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i]);
      const hay =
        colIdx >= 0
          ? String(cols[colIdx] || "").toLowerCase()
          : cols.join(" ").toLowerCase();
      if (hay.includes(q)) {
        const obj = { _file: path.basename(file) };
        header.forEach((h, idx) => {
          obj[h] = cols[idx];
        });
        rows.push(obj);
        if (rows.length >= 500) break;
      }
    }
    if (rows.length >= 500) break;
  }
  return {
    rows,
    files: files.map((f) => path.basename(f)),
    columnsHint: "Pon CSV en server/data/availability/",
  };
}

async function productLookup(mpn, country) {
  const key = process.env.PRODUCT_CATALOG_APIM_KEY || "";
  const code = process.env.PRODUCT_CATALOG_CODE || "";
  if (!key) throw new Error("Falta PRODUCT_CATALOG_APIM_KEY");
  const base =
    process.env.PRODUCT_CATALOG_BASE ||
    "https://integration.ixcomerciolabs.com/api/product-catalog/products";
  const url = `${base}/${encodeURIComponent(mpn)}/identifiers/MPN?code=${code}`;
  const headers = {
    Accept: "application/json",
    "Ocp-Apim-Subscription-Key": key,
    "x-api-version": "3",
    "x-channel": "WL180",
    "x-commerce": "IXC",
    "x-country": country || process.env.PRODUCT_CATALOG_COUNTRY || "PE",
    "x-customerid": process.env.PRODUCT_CATALOG_CUSTOMER || "JBL",
  };
  const response = await axios.get(url, { headers, timeout: 60000, validateStatus: () => true });
  return { status: response.status, data: response.data, mpn };
}

async function productLookupBulk(mpns, country) {
  const results = [];
  for (const mpn of mpns.map((m) => String(m).trim()).filter(Boolean)) {
    try {
      results.push(await productLookup(mpn, country));
    } catch (e) {
      results.push({ mpn, error: e.message });
    }
  }
  return results;
}

module.exports = {
  searchAvailabilityCsv,
  productLookup,
  productLookupBulk,
  AVAILABILITY_DIR,
};
