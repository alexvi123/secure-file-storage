const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const speakeasy = require("speakeasy");
const { ApiError } = require("../middlewares/error.middleware");

/**
 * Service pentru gestionarea autentificării
 */
class AuthService {
  constructor(db) {
    this.db = db;
  }

  /**
   * Generează token JWT pentru un utilizator
   * @param {Object} user - Obiectul utilizator
   * @param {boolean} include2FAFlag - Dacă include flag-ul pentru 2FA verificat
   * @returns {string} Token-ul JWT
   */
  generateToken(user, include2FAFlag = false) {
    const payload = {
      id: user.id,
      email: user.email,
      name: user.name || "",
      surname: user.surname || "",
    };

    // Adaugă flag-ul pentru 2FA verificat dacă este solicitat
    if (include2FAFlag) {
      payload.twoFactorVerified = true;
    }

    return jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRATION || "24h",
    });
  }

  /**
   * Generează un token temporar pentru verificarea 2FA
   * @param {number} userId - ID-ul utilizatorului
   * @returns {string} Token-ul temporar
   */
  generateTempToken(userId) {
    return jwt.sign({ userId, require2FA: true }, process.env.JWT_SECRET, {
      expiresIn: "5m",
    });
  }

  /**
   * Generează un token de reîmprospătare (refresh)
   * @param {Object} user - Obiectul utilizator
   * @returns {string} Token-ul de reîmprospătare
   */
  generateRefreshToken(user) {
    return jwt.sign(
      { id: user.id },
      process.env.REFRESH_TOKEN_SECRET || process.env.JWT_SECRET,
      { expiresIn: process.env.REFRESH_TOKEN_EXPIRATION || "7d" }
    );
  }

  /**
   * Verifică token-ul JWT
   * @param {string} token - Token-ul JWT
   * @returns {Object} Payload-ul decodificat sau null
   */
  verifyToken(token) {
    try {
      return jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      return null;
    }
  }

  /**
   * Verifică token-ul de reîmprospătare
   * @param {string} token - Token-ul de reîmprospătare
   * @returns {Object} Payload-ul decodificat sau null
   */
  verifyRefreshToken(token) {
    try {
      return jwt.verify(
        token,
        process.env.REFRESH_TOKEN_SECRET || process.env.JWT_SECRET
      );
    } catch (error) {
      return null;
    }
  }

  /**
   * Hash-ează o parolă folosind bcrypt
   * @param {string} password - Parola în text clar
   * @returns {Promise<string>} Parola hash-ată
   */
  async hashPassword(password) {
    const saltRounds = 10;
    return await bcrypt.hash(password, saltRounds);
  }

  /**
   * Compară o parolă cu hash-ul său
   * @param {string} password - Parola în text clar
   * @param {string} hashedPassword - Parola hash-ată
   * @returns {Promise<boolean>} True dacă parola se potrivește
   */
  async comparePassword(password, hashedPassword) {
    return await bcrypt.compare(password, hashedPassword);
  }

  /**
   * Generează un secret pentru 2FA
   * @param {string} email - Email-ul utilizatorului
   * @returns {Object} Obiect cu secretul și URL-ul pentru QR
   */
  generateTwoFactorSecret(email) {
    const appName = process.env.APP_NAME || "CloudStorage";

    return speakeasy.generateSecret({
      name: `${appName}:${email}`,
    });
  }

  /**
   * Verifică un cod 2FA
   * @param {string} token - Codul TOTP
   * @param {string} secret - Secretul 2FA
   * @returns {boolean} True dacă codul este valid
   */
  verifyTwoFactorToken(token, secret) {
    return speakeasy.totp.verify({
      secret: secret,
      encoding: "base32",
      token: token,
      window: 1,
    });
  }

  /**
   * Înregistrează un utilizator nou
   * @param {Object} userData - Datele utilizatorului
   * @returns {Promise<Object>} Utilizatorul creat
   */
  async registerUser(userData) {
    // Verifică dacă email-ul este deja folosit
    const existingUser = await this.db.query(
      "SELECT id FROM users WHERE email = $1",
      [userData.email]
    );

    if (existingUser.rows.length > 0) {
      throw ApiError.conflict("Un utilizator cu acest email există deja.");
    }

    // Hash-ează parola
    const hashedPassword = await this.hashPassword(userData.password);

    // Inserează utilizatorul în baza de date
    const result = await this.db.query(
      `INSERT INTO users (email, password_hash, name, surname, phone_number)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, name, surname, phone_number, created_at`,
      [
        userData.email,
        hashedPassword,
        userData.name || null,
        userData.surname || null,
        userData.phone_number || null,
      ]
    );

    return result.rows[0];
  }

  /**
   * Autentifică un utilizator
   * @param {string} email - Email-ul utilizatorului
   * @param {string} password - Parola utilizatorului
   * @returns {Promise<Object>} Rezultatul autentificării
   */
  async loginUser(email, password) {
    // Găsește utilizatorul după email
    const result = await this.db.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);

    if (result.rows.length === 0) {
      throw ApiError.unauthorized("Email sau parolă incorecte.");
    }

    const user = result.rows[0];

    // Verifică parola
    const passwordMatch = await this.comparePassword(
      password,
      user.password_hash
    );
    if (!passwordMatch) {
      throw ApiError.unauthorized("Email sau parolă incorecte.");
    }

    // Verifică dacă 2FA este activat
    if (user.two_factor_enabled) {
      return {
        require2FA: true,
        tempToken: this.generateTempToken(user.id),
        userId: user.id,
      };
    }

    // Generează token-ul JWT
    const token = this.generateToken(user);
    const refreshToken = this.generateRefreshToken(user);

    // Elimină datele sensibile
    delete user.password_hash;
    delete user.two_factor_secret;

    return {
      user,
      token,
      refreshToken,
    };
  }

  /**
   * Verifică un cod 2FA și finalizează autentificarea
   * @param {string} code - Codul 2FA
   * @param {number} userId - ID-ul utilizatorului
   * @returns {Promise<Object>} Rezultatul autentificării
   */
  async verifyTwoFactorAndLogin(code, userId) {
    // Obține secretul 2FA al utilizatorului
    const result = await this.db.query("SELECT * FROM users WHERE id = $1", [
      userId,
    ]);

    if (result.rows.length === 0) {
      throw ApiError.notFound("Utilizator negăsit.");
    }

    const user = result.rows[0];

    if (!user.two_factor_enabled || !user.two_factor_secret) {
      throw ApiError.badRequest(
        "Autentificarea cu doi factori nu este activată pentru acest utilizator."
      );
    }

    // Verifică codul 2FA
    const isValid = this.verifyTwoFactorToken(code, user.two_factor_secret);
    if (!isValid) {
      throw ApiError.unauthorized("Cod de verificare invalid.");
    }

    // Generează token-ul JWT cu flag-ul 2FA verificat
    const token = this.generateToken(user, true);
    const refreshToken = this.generateRefreshToken(user);

    // Elimină datele sensibile
    delete user.password_hash;
    delete user.two_factor_secret;

    return {
      user,
      token,
      refreshToken,
    };
  }

  /**
   * Generează un secret 2FA pentru un utilizator
   * @param {number} userId - ID-ul utilizatorului
   * @returns {Promise<Object>} Secretul și URL-ul pentru QR
   */
  async generateTwoFactorSecret(userId) {
    // Obține informații despre utilizator
    const result = await this.db.query(
      "SELECT email FROM users WHERE id = $1",
      [userId]
    );

    if (result.rows.length === 0) {
      throw ApiError.notFound("Utilizator negăsit.");
    }

    const user = result.rows[0];

    // Generează secretul 2FA
    const secret = this.generateTwoFactorSecret(user.email);

    // Stochează secretul temporar
    await this.db.query(
      "UPDATE users SET two_factor_secret = $1 WHERE id = $2",
      [secret.base32, userId]
    );

    return {
      secret: secret.base32,
      otpauthUrl: secret.otpauth_url,
    };
  }

  /**
   * Activează 2FA pentru un utilizator după verificarea codului
   * @param {number} userId - ID-ul utilizatorului
   * @param {string} code - Codul 2FA
   * @returns {Promise<boolean>} Succes
   */
  async activateTwoFactor(userId, code) {
    // Obține secretul 2FA al utilizatorului
    const result = await this.db.query(
      "SELECT two_factor_secret FROM users WHERE id = $1",
      [userId]
    );

    if (result.rows.length === 0) {
      throw ApiError.notFound("Utilizator negăsit.");
    }

    const user = result.rows[0];

    if (!user.two_factor_secret) {
      throw ApiError.badRequest(
        "Niciun secret 2FA găsit. Generați mai întâi un secret."
      );
    }

    // Verifică codul 2FA
    const isValid = this.verifyTwoFactorToken(code, user.two_factor_secret);
    if (!isValid) {
      throw ApiError.badRequest("Cod de verificare invalid.");
    }

    // Activează 2FA pentru utilizator
    await this.db.query(
      "UPDATE users SET two_factor_enabled = true WHERE id = $1",
      [userId]
    );

    return true;
  }

  /**
   * Dezactivează 2FA pentru un utilizator
   * @param {number} userId - ID-ul utilizatorului
   * @param {string} code - Codul 2FA pentru confirmare
   * @returns {Promise<boolean>} Succes
   */
  async disableTwoFactor(userId, code) {
    // Obține secretul 2FA al utilizatorului
    const result = await this.db.query(
      "SELECT two_factor_secret, two_factor_enabled FROM users WHERE id = $1",
      [userId]
    );

    if (result.rows.length === 0) {
      throw ApiError.notFound("Utilizator negăsit.");
    }

    const user = result.rows[0];

    if (!user.two_factor_enabled) {
      throw ApiError.badRequest(
        "Autentificarea cu doi factori nu este activată."
      );
    }

    // Verifică codul 2FA
    const isValid = this.verifyTwoFactorToken(code, user.two_factor_secret);
    if (!isValid) {
      throw ApiError.badRequest("Cod de verificare invalid.");
    }

    // Dezactivează 2FA pentru utilizator și șterge secretul
    await this.db.query(
      "UPDATE users SET two_factor_enabled = false, two_factor_secret = NULL WHERE id = $1",
      [userId]
    );

    return true;
  }

  /**
   * Schimbă parola unui utilizator
   * @param {number} userId - ID-ul utilizatorului
   * @param {string} currentPassword - Parola curentă
   * @param {string} newPassword - Noua parolă
   * @returns {Promise<boolean>} Succes
   */
  async changePassword(userId, currentPassword, newPassword) {
    // Obține hash-ul parolei curente
    const result = await this.db.query(
      "SELECT password_hash FROM users WHERE id = $1",
      [userId]
    );

    if (result.rows.length === 0) {
      throw ApiError.notFound("Utilizator negăsit.");
    }

    const { password_hash } = result.rows[0];

    // Verifică parola curentă
    const isValid = await this.comparePassword(currentPassword, password_hash);
    if (!isValid) {
      throw ApiError.badRequest("Parola curentă este incorectă.");
    }

    // Hash-ează noua parolă
    const newPasswordHash = await this.hashPassword(newPassword);

    // Actualizează parola în baza de date
    await this.db.query(
      "UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2",
      [newPasswordHash, userId]
    );

    return true;
  }

  /**
   * Generează un token pentru resetarea parolei
   * @param {string} email - Email-ul utilizatorului
   * @returns {Promise<string|null>} Token-ul generat sau null dacă utilizatorul nu există
   */
  async generatePasswordResetToken(email) {
    // Verifică dacă utilizatorul există
    const result = await this.db.query(
      "SELECT id FROM users WHERE email = $1",
      [email]
    );

    if (result.rows.length === 0) {
      // Pentru securitate, nu dezvăluim dacă email-ul există sau nu
      return null;
    }

    const userId = result.rows[0].id;

    // Generează un token de resetare
    const resetToken = jwt.sign(
      { userId, purpose: "password-reset" },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );
    return resetToken;
  }

  /**
   * Resetează parola unui utilizator cu un token
   * @param {string} token - Token-ul de resetare
   * @param {string} newPassword - Noua parolă
   * @returns {Promise<boolean>} Succes
   */
  async resetPassword(token, newPassword) {
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      throw ApiError.unauthorized("Token invalid sau expirat.");
    }

    // Verifică dacă token-ul este pentru resetarea parolei
    if (!decoded.userId || decoded.purpose !== "password-reset") {
      throw ApiError.unauthorized("Token invalid.");
    }

    // Hash-ează noua parolă
    const newPasswordHash = await this.hashPassword(newPassword);

    // Actualizează parola în baza de date
    const result = await this.db.query(
      "UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2 RETURNING id",
      [newPasswordHash, decoded.userId]
    );

    if (result.rows.length === 0) {
      throw ApiError.notFound("Utilizator negăsit.");
    }

    return true;
  }

  /**
   * Reînnoiește un token expirat folosind refresh token
   * @param {string} refreshToken - Token-ul de reîmprospătare
   * @returns {Promise<Object>} Noul token JWT
   */
  async refreshAccessToken(refreshToken) {
    // Verifică refresh token-ul
    const decoded = this.verifyRefreshToken(refreshToken);
    if (!decoded) {
      throw ApiError.unauthorized("Refresh token invalid sau expirat.");
    }

    // Obține informații despre utilizator
    const result = await this.db.query(
      "SELECT id, email, name, surname FROM users WHERE id = $1",
      [decoded.id]
    );

    if (result.rows.length === 0) {
      throw ApiError.notFound("Utilizator negăsit.");
    }

    const user = result.rows[0];

    // Generează un nou token JWT
    const newToken = this.generateToken(user);

    return {
      token: newToken,
    };
  }

  /**
   * Obține profilul unui utilizator după ID
   * @param {number} userId - ID-ul utilizatorului
   * @returns {Promise<Object>} Datele utilizatorului
   */
  async getUserProfile(userId) {
    const result = await this.db.query(
      `SELECT id, email, name, surname, phone_number, 
              two_factor_enabled, created_at, updated_at
       FROM users
       WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      throw ApiError.notFound("Utilizator negăsit.");
    }

    return result.rows[0];
  }

  /**
   * Actualizează profilul unui utilizator
   * @param {number} userId - ID-ul utilizatorului
   * @param {Object} userData - Datele de actualizat
   * @returns {Promise<Object>} Datele actualizate
   */
  async updateUserProfile(userId, userData) {
    const setValues = [];
    const queryParams = [];
    let paramCounter = 1;

    if (userData.name !== undefined) {
      setValues.push(`name = $${paramCounter++}`);
      queryParams.push(userData.name);
    }

    if (userData.surname !== undefined) {
      setValues.push(`surname = $${paramCounter++}`);
      queryParams.push(userData.surname);
    }

    if (userData.phone_number !== undefined) {
      setValues.push(`phone_number = $${paramCounter++}`);
      queryParams.push(userData.phone_number);
    }

    setValues.push(`updated_at = NOW()`);

    queryParams.push(userId);

    if (setValues.length === 0) {
      throw ApiError.badRequest("Niciun câmp furnizat pentru actualizare.");
    }

    const result = await this.db.query(
      `UPDATE users 
       SET ${setValues.join(", ")} 
       WHERE id = $${paramCounter} 
       RETURNING id, email, name, surname, phone_number, updated_at`,
      queryParams
    );

    if (result.rows.length === 0) {
      throw ApiError.notFound("Utilizator negăsit.");
    }

    return result.rows[0];
  }
}

module.exports = AuthService;
