const { logger } = require("../utils/logger.util");

/**
 * Clasă pentru erori API
 * Permite crearea de erori cu cod de status și mesaj specific
 */
class ApiError extends Error {
  constructor(message, statusCode, errors = null) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Eroare 400 - Bad Request
   * @param {string} message - Mesajul erorii
   * @param {Object} errors - Erori specifice pentru fiecare câmp (opțional)
   * @returns {ApiError} Obiect eroare
   */
  static badRequest(message, errors = null) {
    return new ApiError(message, 400, errors);
  }

  /**
   * Eroare 401 - Unauthorized
   * @param {string} message - Mesajul erorii
   * @returns {ApiError} Obiect eroare
   */
  static unauthorized(message = "Autentificare necesară.") {
    return new ApiError(message, 401);
  }

  /**
   * Eroare 403 - Forbidden
   * @param {string} message - Mesajul erorii
   * @returns {ApiError} Obiect eroare
   */
  static forbidden(message = "Acces interzis.") {
    return new ApiError(message, 403);
  }

  /**
   * Eroare 404 - Not Found
   * @param {string} message - Mesajul erorii
   * @returns {ApiError} Obiect eroare
   */
  static notFound(message = "Resursa nu a fost găsită.") {
    return new ApiError(message, 404);
  }

  /**
   * Eroare 409 - Conflict
   * @param {string} message - Mesajul erorii
   * @param {Object} errors - Detalii despre conflict (opțional)
   * @returns {ApiError} Obiect eroare
   */
  static conflict(message, errors = null) {
    return new ApiError(message, 409, errors);
  }

  /**
   * Eroare 422 - Unprocessable Entity
   * @param {string} message - Mesajul erorii
   * @param {Object} errors - Erori de validare
   * @returns {ApiError} Obiect eroare
   */
  static validationError(message = "Date de intrare invalide.", errors = null) {
    return new ApiError(message, 422, errors);
  }

  /**
   * Eroare 500 - Internal Server Error
   * @param {string} message - Mesajul erorii
   * @returns {ApiError} Obiect eroare
   */
  static internalError(message = "Eroare internă de server.") {
    return new ApiError(message, 500);
  }

  /**
   * Eroare 503 - Service Unavailable
   * @param {string} message - Mesajul erorii
   * @returns {ApiError} Obiect eroare
   */
  static serviceUnavailable(message = "Serviciu indisponibil temporar.") {
    return new ApiError(message, 503);
  }
}

/**
 * Middleware pentru gestionarea erorilor
 * Tratează erorile și returnează un răspuns formatat
 */
const errorHandler = (err, req, res, next) => {
  let statusCode = 500;
  let message = "Eroare internă de server";
  let errors = null;
  if (err instanceof ApiError) {
    statusCode = err.statusCode;
    message = err.message;
    errors = err.errors;
  } else if (err.name === "ValidationError") {
    statusCode = 422;
    message = "Date de intrare invalide";
    errors = err.details || err.errors;
  } else if (err.name === "UnauthorizedError") {
    statusCode = 401;
    message = "Autentificare invalidă sau expirata";
  } else if (err.name === "SyntaxError" && err.status === 400) {
    statusCode = 400;
    message = "JSON invalid";
  }
  // Loghează eroarea
  if (statusCode >= 500) {
    logger.error(`Error ${statusCode}: ${message}`, {
      error: {
        name: err.name,
        message: err.message,
        stack: err.stack,
      },
      path: req.path,
      method: req.method,
      ip: req.ip,
    });
  } else {
    logger.warn(`Error ${statusCode}: ${message}`, {
      error: {
        name: err.name,
        message: err.message,
      },
      path: req.path,
      method: req.method,
    });
  }
  const errorResponse = {
    status: "error",
    statusCode,
    message,
  };
  if (errors) {
    errorResponse.errors = errors;
  }
  if (process.env.NODE_ENV !== "production" && err.stack) {
    errorResponse.stack = err.stack;
  }
  res.status(statusCode).json(errorResponse);
};

module.exports = errorHandler;
module.exports.ApiError = ApiError;
