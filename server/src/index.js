const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const basicAuth = require("express-basic-auth");

dotenv.config({ path: path.join(__dirname, "../../.env") });
dotenv.config({ path: path.join(__dirname, "../../../.env") });

const toolsRouter = require("./routes/tools");
const { DOWNLOADS_DIR, ensureDirs } = require("./services/pythonRunner");

ensureDirs();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(cors());
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

const authUser = process.env.BASIC_AUTH_USER;
const authPass = process.env.BASIC_AUTH_PASSWORD;
if (authUser && authPass) {
  app.use(
    basicAuth({
      users: { [authUser]: authPass },
      challenge: true,
      realm: "IX Tools",
    })
  );
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, name: "ix-tools", ts: new Date().toISOString() });
});

app.use("/api/tools", toolsRouter);

app.get("/api/downloads/:jobId/*", (req, res) => {
  const jobId = req.params.jobId;
  const file = req.params[0];
  if (!file) return res.status(400).json({ ok: false, error: "archivo requerido" });
  const full = path.normalize(path.join(DOWNLOADS_DIR, jobId, file));
  const jobRoot = path.normalize(path.join(DOWNLOADS_DIR, jobId));
  if (!full.startsWith(jobRoot)) {
    return res.status(400).json({ ok: false, error: "path inválido" });
  }
  if (!fs.existsSync(full)) return res.status(404).json({ ok: false, error: "archivo no encontrado" });
  res.download(full);
});

const webDist = path.join(__dirname, "../../web/dist");
const webDistAlt = path.join(__dirname, "../../../web/dist");
const staticRoot = fs.existsSync(webDist) ? webDist : webDistAlt;

if (fs.existsSync(staticRoot)) {
  app.use(express.static(staticRoot));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(staticRoot, "index.html"));
  });
}

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ ok: false, error: err.message || "Error interno" });
});

app.listen(PORT, () => {
  console.log(`IX Tools server on http://localhost:${PORT}`);
  if (authUser) console.log("Basic auth enabled");
});
