const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
const { TMP_DIR, ensureDirs } = require("../services/pythonRunner");

ensureDirs();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(TMP_DIR, uuidv4());
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    cb(null, file.originalname.replace(/[^\w.\-]+/g, "_"));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 80 * 1024 * 1024 },
});

module.exports = { upload };
