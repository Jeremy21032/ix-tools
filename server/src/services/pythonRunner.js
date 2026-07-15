const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const DOWNLOADS_DIR = path.join(__dirname, "../../downloads");
const TMP_DIR = path.join(__dirname, "../../tmp");
const SCRIPTS_DIR = path.join(__dirname, "../../scripts");

function ensureDirs() {
  for (const d of [DOWNLOADS_DIR, TMP_DIR]) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }
}

function pythonBin() {
  return process.env.PYTHON_BIN || "python";
}

/**
 * Run a python script and capture stdout/stderr.
 * @param {string} scriptName relative to scripts/
 * @param {string[]} args
 * @param {object} [opts]
 * @param {number} [opts.timeoutMs]
 * @param {object} [opts.env]
 * @param {string} [opts.cwd]
 */
function runPython(scriptName, args = [], opts = {}) {
  ensureDirs();
  const scriptPath = path.join(SCRIPTS_DIR, scriptName);
  if (!fs.existsSync(scriptPath)) {
    return Promise.reject(new Error(`Script no encontrado: ${scriptName}`));
  }

  const timeoutMs = opts.timeoutMs || 15 * 60 * 1000;
  const jobId = opts.jobId || uuidv4();
  const jobDir = path.join(DOWNLOADS_DIR, jobId);
  fs.mkdirSync(jobDir, { recursive: true });

  return new Promise((resolve) => {
    const logs = [];
    const proc = spawn(pythonBin(), [scriptPath, ...args], {
      cwd: opts.cwd || jobDir,
      env: { ...process.env, ...(opts.env || {}) },
      windowsHide: true,
    });

    let killed = false;
    const timer = setTimeout(() => {
      killed = true;
      proc.kill("SIGTERM");
    }, timeoutMs);

    proc.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      logs.push(...text.split(/\r?\n/).filter(Boolean));
    });
    proc.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      logs.push(...text.split(/\r?\n/).filter((l) => l.trim()));
    });

    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        ok: !killed && code === 0,
        code: killed ? -1 : code,
        killed,
        logs,
        jobId,
        jobDir,
      });
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        ok: false,
        code: -1,
        logs: [...logs, String(err.message)],
        jobId,
        jobDir,
        error: err.message,
      });
    });
  });
}

function writeTempFile(content, ext = ".txt") {
  ensureDirs();
  const id = uuidv4();
  const filePath = path.join(TMP_DIR, `${id}${ext}`);
  fs.writeFileSync(filePath, content, "utf8");
  return filePath;
}

function listJobFiles(jobDir) {
  if (!fs.existsSync(jobDir)) return [];
  const walk = (dir, base = "") => {
    const out = [];
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const rel = path.join(base, name);
      if (fs.statSync(full).isDirectory()) out.push(...walk(full, rel));
      else out.push(rel.replace(/\\/g, "/"));
    }
    return out;
  };
  return walk(jobDir);
}

function findNewestFile(jobDir, exts = [".xlsx", ".csv", ".json", ".zip"]) {
  const files = listJobFiles(jobDir).filter((f) =>
    exts.some((e) => f.toLowerCase().endsWith(e))
  );
  if (!files.length) return null;
  files.sort((a, b) => {
    const sa = fs.statSync(path.join(jobDir, a)).mtimeMs;
    const sb = fs.statSync(path.join(jobDir, b)).mtimeMs;
    return sb - sa;
  });
  return files[0];
}

module.exports = {
  runPython,
  writeTempFile,
  listJobFiles,
  findNewestFile,
  DOWNLOADS_DIR,
  TMP_DIR,
  SCRIPTS_DIR,
  ensureDirs,
};
