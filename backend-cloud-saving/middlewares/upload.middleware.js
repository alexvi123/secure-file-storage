const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { promisify } = require("util");
const { ApiError } = require("./error.middleware");

const unlinkAsync = promisify(fs.unlink);
const mkdirAsync = promisify(fs.mkdir);

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, "../uploads");
const TEMP_DIR = path.join(UPLOAD_DIR, "temp");

(async () => {
  try {
    if (!fs.existsSync(UPLOAD_DIR)) {
      await mkdirAsync(UPLOAD_DIR, { recursive: true });
    }
    if (!fs.existsSync(TEMP_DIR)) {
      await mkdirAsync(TEMP_DIR, { recursive: true });
    }
  } catch (error) {
    console.error("Eroare la crearea directoarelor de încărcare:", error);
  }
})();

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, TEMP_DIR);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const fileExt = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${fileExt}`);
  },
});

// Configurează filtrarea fișierelor
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    // Imagini
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/svg+xml",
    // Documente
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    // Text
    "text/plain",
    "text/csv",
    "text/html",
    "text/css",
    "text/javascript",
    // Arhive
    "application/zip",
    "application/x-rar-compressed",
    "application/x-7z-compressed",
    "application/gzip",
    // Media
    "audio/mpeg",
    "audio/wav",
    "audio/ogg",
    "video/mp4",
    "video/mpeg",
    "video/quicktime",
    "video/webm",
    // Altele
    "application/json",
    "application/xml",
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new ApiError(
        `Tip de fișier neacceptat. Tipurile permise sunt: imagini, documente, texte, arhive și fișiere media.`,
        400
      ),
      false
    );
  }
};

// Configurează limitele multer
const limits = {
  fileSize: parseInt(process.env.MAX_FILE_SIZE) || 100 * 1024 * 1024, // 100MB implicit
  files: 1, // Un singur fișier pe cerere
};

// Inițializează multer cu opțiunile configurate
const uploadMiddleware = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: limits,
});

/**
 * Middleware pentru a trata erorile multer
 */
const handleMulterErrorMiddleware = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    let message;

    switch (err.code) {
      case "LIMIT_FILE_SIZE":
        message = `Fișierul este prea mare. Dimensiunea maximă permisă este ${Math.round(
          limits.fileSize / (1024 * 1024)
        )}MB.`;
        break;
      case "LIMIT_FILE_COUNT":
        message =
          "Prea multe fișiere încărcate. Se permite un singur fișier pe cerere.";
        break;
      default:
        message = `Eroare la încărcarea fișierului: ${err.message}`;
    }

    return res.status(400).json({ message });
  }

  next(err);
};

/**
 * Funcție pentru curățarea fișierelor temporare
 * @param {string} filePath - Calea către fișierul care trebuie șters
 * @returns {Promise<void>}
 */
const cleanupTempFileMiddleware = async (filePath) => {
  if (!filePath) return;

  try {
    // Verifică dacă fișierul există înainte de a încerca să-l ștergi
    if (fs.existsSync(filePath)) {
      await unlinkAsync(filePath);
    }
  } catch (error) {
    console.error(
      `Eroare la ștergerea fișierului temporar ${filePath}:`,
      error
    );
  }
};

/**
 * Middleware pentru a curăța fișierele temporare la finalizarea cererii
 */
const cleanupOnFinishMiddleware = (req, res, next) => {
  res.on("finish", () => {
    if (req.file) {
      cleanupTempFileMiddleware(req.file.path);
    }
    if (req.files) {
      if (Array.isArray(req.files)) {
        req.files.forEach((file) => cleanupTempFileMiddleware(file.path));
      } else {
        Object.keys(req.files).forEach((key) => {
          req.files[key].forEach((file) =>
            cleanupTempFileMiddleware(file.path)
          );
        });
      }
    }
  });

  next();
};

module.exports = {
  uploadMiddleware,
  handleMulterErrorMiddleware,
  cleanupTempFileMiddleware,
  cleanupOnFinishMiddleware,
  uploadDir: UPLOAD_DIR,
  tempDir: TEMP_DIR,
};
