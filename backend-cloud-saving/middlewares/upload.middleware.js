const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { promisify } = require("util");
const { ApiError } = require("./error.middleware");

// Promisificăm funcțiile fs
const unlinkAsync = promisify(fs.unlink);
const mkdirAsync = promisify(fs.mkdir);

// Directorul pentru fișierele temporare încărcate
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, "../uploads");
const TEMP_DIR = path.join(UPLOAD_DIR, "temp");

// Asigură-te că directoarele necesare există
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

// Configurează stocarea pentru multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, TEMP_DIR);
  },
  filename: function (req, file, cb) {
    // Generează un nume unic pentru fișier
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const fileExt = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${fileExt}`);
  },
});

// Configurează filtrarea fișierelor
const fileFilter = (req, file, cb) => {
  // Lista tipurilor de fișiere permise
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
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: limits,
});

/**
 * Middleware pentru a trata erorile multer
 */
const handleMulterError = (err, req, res, next) => {
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
      case "LIMIT_UNEXPECTED_FILE":
        message = "Fișier neașteptat. Verificați numele câmpului de încărcare.";
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
const cleanupTempFile = async (filePath) => {
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
const cleanupOnFinish = (req, res, next) => {
  // Adaugă un listener pentru evenimentul de finalizare al cererii
  res.on("finish", () => {
    // Curăță orice fișier temporar atașat la cerere
    if (req.file) {
      cleanupTempFile(req.file.path);
    }
    if (req.files) {
      // Dacă sunt mai multe fișiere
      if (Array.isArray(req.files)) {
        req.files.forEach((file) => cleanupTempFile(file.path));
      } else {
        // Dacă este un obiect cu grupuri de fișiere
        Object.keys(req.files).forEach((key) => {
          req.files[key].forEach((file) => cleanupTempFile(file.path));
        });
      }
    }
  });

  next();
};

/**
 * Funcție pentru a valida și procesa fișierul încărcat
 * @param {object} file - Obiectul fișier de la multer
 * @returns {Promise<object>} - Informații despre fișier
 */
const validateAndProcessFile = async (file) => {
  if (!file) {
    throw ApiError.badRequest("Niciun fișier furnizat.");
  }

  // Extrage informații despre fișier
  const fileInfo = {
    originalName: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
    path: file.path,
  };

  // Aici poți adăuga validări suplimentare sau procesare
  // De exemplu, verificarea unui virus, metadata, etc.

  return fileInfo;
};

module.exports = {
  upload,
  handleMulterError,
  cleanupTempFile,
  cleanupOnFinish,
  validateAndProcessFile,
  uploadDir: UPLOAD_DIR,
  tempDir: TEMP_DIR,
};
