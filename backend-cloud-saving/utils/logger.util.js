const winston = require("winston");
const path = require("path");
const fs = require("fs");

const logDir = path.join(__dirname, "../logs");
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: "YYYY-MM-DD HH:mm:ss",
  }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Configurație pentru afișarea colorată în consolă
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({
    format: "YYYY-MM-DD HH:mm:ss",
  }),
  winston.format.printf(
    (info) =>
      `${info.timestamp} ${info.level}: ${info.message}${
        info.stack ? "\n" + info.stack : ""
      }`
  )
);

// Creează logger-ul
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: logFormat,
  defaultMeta: { service: "cloud-storage" },
  transports: [
    new winston.transports.File({
      filename: path.join(logDir, "error.log"),
      level: "error",
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join(logDir, "combined.log"),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
});

if (process.env.NODE_ENV !== "production") {
  logger.add(
    new winston.transports.Console({
      format: consoleFormat,
    })
  );
}

/**
 * Adaugă context la logger
 * @param {string} module - Numele modulului
 * @returns {Object} Logger cu context
 */
function getContextLogger(module) {
  return {
    error: (message, meta = {}) => {
      logger.error(message, { ...meta, module });
    },
    warn: (message, meta = {}) => {
      logger.warn(message, { ...meta, module });
    },
    info: (message, meta = {}) => {
      logger.info(message, { ...meta, module });
    },
    debug: (message, meta = {}) => {
      logger.debug(message, { ...meta, module });
    },
    verbose: (message, meta = {}) => {
      logger.verbose(message, { ...meta, module });
    },
  };
}

/**
 * Logger pentru acțiunile utilizatorilor
 * @param {Object} user - Utilizatorul care a efectuat acțiunea
 * @param {string} action - Acțiunea efectuată
 * @param {Object} details - Detalii suplimentare
 */
function logUserAction(user, action, details = {}) {
  const userId = user?.id || "anonymous";
  const userEmail = user?.email || "unknown";

  logger.info(`User action: ${action}`, {
    userId,
    userEmail,
    action,
    details,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Logger pentru activități de securitate
 * @param {string} event - Evenimentul de securitate
 * @param {Object} details - Detalii despre eveniment
 * @param {string} level - Nivelul de log (info, warn, error)
 */
function logSecurity(event, details = {}, level = "info") {
  logger[level](`Security event: ${event}`, {
    event,
    details,
    timestamp: new Date().toISOString(),
    security: true,
  });
}

/**
 * Logger pentru activități de sistem
 * @param {string} event - Evenimentul de sistem
 * @param {Object} details - Detalii despre eveniment
 * @param {string} level - Nivelul de log (info, warn, error)
 */
function logSystem(event, details = {}, level = "info") {
  logger[level](`System event: ${event}`, {
    event,
    details,
    timestamp: new Date().toISOString(),
    system: true,
  });
}

/**
 * Logger pentru operațiuni de stocare
 * @param {string} operation - Operațiunea efectuată
 * @param {Object} fileInfo - Informații despre fișier
 * @param {Object} user - Utilizatorul care a efectuat operațiunea
 * @param {Object} additionalDetails - Detalii suplimentare
 */
function logStorage(operation, fileInfo, user = null, additionalDetails = {}) {
  const userId = user?.id || "system";
  const userEmail = user?.email || "system";

  logger.info(`Storage operation: ${operation}`, {
    operation,
    fileInfo,
    userId,
    userEmail,
    ...additionalDetails,
    timestamp: new Date().toISOString(),
    storage: true,
  });
}

/**
 * Logger pentru erori de aplicație
 * @param {Error} error - Obiectul de eroare
 * @param {string} context - Contextul în care a apărut eroarea
 * @param {Object} additionalDetails - Detalii suplimentare
 */
function logError(error, context, additionalDetails = {}) {
  logger.error(`Application error in ${context}: ${error.message}`, {
    error: {
      message: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code,
    },
    context,
    ...additionalDetails,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Middleware pentru logging-ul requesturilor HTTP
 * @param {Object} req - Obiectul request
 * @param {Object} res - Obiectul response
 * @param {Function} next - Funcția next middleware
 */
function requestLogger(req, res, next) {
  const startTime = new Date();

  // Capturează response pentru a loga rezultatul
  const originalEnd = res.end;
  res.end = function (chunk, encoding) {
    res.end = originalEnd;
    res.end(chunk, encoding);

    const responseTime = new Date() - startTime;

    logger.info("HTTP Request", {
      method: req.method,
      url: req.originalUrl,
      ip: req.ip,
      statusCode: res.statusCode,
      responseTime,
      userAgent: req.get("user-agent"),
      timestamp: new Date().toISOString(),
      http: true,
    });
  };

  next();
}

module.exports = {
  logger,
  getContextLogger,
  logUserAction,
  logSecurity,
  logSystem,
  logStorage,
  logError,
  requestLogger,
};
