const jwt = require("jsonwebtoken");
const { ApiError } = require("./error.middleware");

/**
 * Middleware pentru autentificare JWT
 * Verifică și validează token-ul JWT din header-ul de autorizare
 */
const authMiddleware = async (req, res, next) => {
  try {
    // Verifică dacă există header-ul de autorizare
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw ApiError.unauthorized(
        "Acces neautorizat. Autentificarea este necesară."
      );
    }

    // Extrage token-ul din header
    const token = authHeader.split(" ")[1];

    try {
      // Verifică token-ul cu JWT
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Atașează informațiile utilizatorului la obiectul request
      req.user = decoded;

      // Verifică dacă utilizatorul există în baza de date (opțional)
      const db = req.app.locals.db;
      const userResult = await db.query(
        "SELECT id, email, name, surname FROM users WHERE id = $1",
        [decoded.id]
      );

      if (userResult.rows.length === 0) {
        throw ApiError.unauthorized("Utilizatorul nu mai există.");
      }

      next();
    } catch (error) {
      if (error.name === "TokenExpiredError") {
        throw ApiError.unauthorized(
          "Token expirat. Vă rugăm să vă autentificați din nou."
        );
      } else if (error.name === "JsonWebTokenError") {
        throw ApiError.unauthorized("Token invalid.");
      } else {
        throw error;
      }
    }
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware pentru verificarea rolului de admin
 * Trebuie utilizat după authMiddleware
 */
const adminMiddleware = async (req, res, next) => {
  try {
    // Verifică dacă utilizatorul este autentificat
    if (!req.user) {
      throw ApiError.unauthorized("Autentificarea este necesară.");
    }

    // Verifică rolul utilizatorului
    const db = req.app.locals.db;
    const roleResult = await db.query("SELECT role FROM users WHERE id = $1", [
      req.user.id,
    ]);

    if (roleResult.rows.length === 0) {
      throw ApiError.unauthorized("Utilizatorul nu există.");
    }

    if (roleResult.rows[0].role !== "admin") {
      throw ApiError.forbidden(
        "Acces interzis. Necesită drepturi de administrator."
      );
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware pentru verificarea autentificării cu doi factori
 * Verifică dacă utilizatorul are 2FA activat și a fost verificat
 */
const twoFactorMiddleware = async (req, res, next) => {
  try {
    // Verifică dacă utilizatorul este autentificat
    if (!req.user) {
      throw ApiError.unauthorized("Autentificarea este necesară.");
    }

    // Verifică starea 2FA a utilizatorului
    const db = req.app.locals.db;
    const result = await db.query(
      "SELECT two_factor_enabled FROM users WHERE id = $1",
      [req.user.id]
    );

    if (result.rows.length === 0) {
      throw ApiError.unauthorized("Utilizatorul nu există.");
    }

    const user = result.rows[0];

    // Dacă 2FA este activat, verifică dacă token-ul a fost emis după verificarea 2FA
    if (user.two_factor_enabled) {
      // Verifică dacă token-ul conține flag-ul 2FA verificat
      if (!req.user.twoFactorVerified) {
        throw ApiError.forbidden(
          "Verificarea autentificării cu doi factori este necesară.",
          {
            requireTwoFactor: true,
          }
        );
      }
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware pentru cererile temporare cu token-uri speciale
 * Folosit pentru operațiile care nu necesită autentificare completă (ex: verificare 2FA)
 */
const tempTokenMiddleware = async (req, res, next) => {
  try {
    // Verifică mai întâi în header
    const authHeader = req.headers.authorization;
    let token;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    } else if (req.body && req.body.tempToken) {
      // Verifică în corpul cererii
      token = req.body.tempToken;
    } else {
      throw ApiError.unauthorized(
        "Acces neautorizat. Token-ul temporar este necesar."
      );
    }
    try {
      // Verifică token-ul cu JWT
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Verifică dacă este un token temporar valid
      if (!decoded.userId || !decoded.require2FA) {
        throw ApiError.unauthorized("Token temporar invalid.");
      }

      // Atașează informațiile la obiectul request
      req.tempUser = {
        id: decoded.userId,
        require2FA: decoded.require2FA,
      };

      next();
    } catch (error) {
      if (error.name === "TokenExpiredError") {
        throw ApiError.unauthorized(
          "Token temporar expirat. Vă rugăm să vă autentificați din nou."
        );
      } else if (error.name === "JsonWebTokenError") {
        throw ApiError.unauthorized("Token temporar invalid.");
      } else {
        throw error;
      }
    }
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware pentru a forța activarea 2FA
 * Dacă 2FA este obligatoriu dar nu este activat, redirecționează utilizatorul
 */
const require2FAMiddleware = async (req, res, next) => {
  // Verifică dacă este activată opțiunea de forțare 2FA în aplicație
  if (process.env.FORCE_2FA !== "true") {
    return next();
  }

  try {
    // Verifică dacă utilizatorul este autentificat
    if (!req.user) {
      throw ApiError.unauthorized("Autentificarea este necesară.");
    }

    // Verifică starea 2FA a utilizatorului
    const db = req.app.locals.db;
    const result = await db.query(
      "SELECT two_factor_enabled FROM users WHERE id = $1",
      [req.user.id]
    );

    if (result.rows.length === 0) {
      throw ApiError.unauthorized("Utilizatorul nu există.");
    }

    const user = result.rows[0];

    // Dacă 2FA nu este activat, redirecționează la pagina de configurare
    if (!user.two_factor_enabled) {
      return res.status(403).json({
        message: "Autentificarea cu doi factori este obligatorie.",
        requireSetup2FA: true,
        redirectTo: "/setup-2fa",
      });
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware pentru a permite accesul doar posesorului resursei
 * Verifică dacă utilizatorul curent este proprietarul resursei
 * @param {string} paramIdName - Numele parametrului care conține ID-ul resursei
 * @param {string} resourceType - Tipul resursei ('file', 'user', etc.)
 */
const ownershipMiddleware = (paramIdName, resourceType) => {
  return async (req, res, next) => {
    try {
      // Verifică dacă utilizatorul este autentificat
      if (!req.user) {
        throw ApiError.unauthorized("Autentificarea este necesară.");
      }

      // Obține ID-ul resursei din parametrii
      const resourceId = req.params[paramIdName];
      if (!resourceId) {
        throw ApiError.badRequest(`ID-ul ${resourceType} lipsește.`);
      }

      // Verifică proprietatea resursei
      const db = req.app.locals.db;
      let query;

      switch (resourceType) {
        case "file":
          query = "SELECT user_id FROM files WHERE id = $1";
          break;
        case "user":
          // Verifică dacă utilizatorul încearcă să acceseze propriul profil
          if (req.user.id === parseInt(resourceId)) {
            return next();
          }
          throw ApiError.forbidden(
            "Nu aveți permisiunea de a accesa acest profil."
          );
        default:
          throw ApiError.badRequest(
            `Tip de resursă necunoscut: ${resourceType}`
          );
      }

      const result = await db.query(query, [resourceId]);

      if (result.rows.length === 0) {
        throw ApiError.notFound(`${resourceType} nu a fost găsit.`);
      }

      // Verifică dacă utilizatorul curent este proprietarul
      if (result.rows[0].user_id !== req.user.id) {
        throw ApiError.forbidden(
          `Nu aveți permisiunea de a accesa acest ${resourceType}.`
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

module.exports = {
  authMiddleware,
  adminMiddleware,
  twoFactorMiddleware,
  tempTokenMiddleware,
  require2FAMiddleware,
  ownershipMiddleware,
};
