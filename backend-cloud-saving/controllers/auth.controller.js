const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const speakeasy = require("speakeasy");
const QRCode = require("qrcode");
const { ApiError } = require("../middlewares/error.middleware");

/**
 *  Registering new user
 */
const register = async (req, res, next) => {
  try {
    const { email, password, name, surname, phone_number } = req.body;
    const db = req.app.locals.db;

    //Verificăm dacă email-ul există
    const userExists = await db.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);

    if (userExists.rows.length > 0) {
      throw ApiError.conflict("Email has already been used.");
    }

    // Criptare parolă
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Inserare utilizator nou
    const result = await db.query(
      `INSERT INTO users (email, password_hash, name, surname, phone_number) VALUES ($1,$2,$3,$4,$5) RETURNING id, email, name, surname , phone_number`,
      [email, hashedPassword, name, surname, phone_number]
    );
    const newUser = result.rows[0];

    res.status(201).json({
      message: " Utilizator inregistrat cu succes!",
      user: newUser,
    });
  } catch (error) {
    next(error);
  }
};
/**
 * Autentificare utilizator
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const db = req.app.locals.db;

    // Găsește utilizatorul după email
    const result = await db.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);

    if (result.rows.length === 0) {
      throw ApiError.unauthorized("Email sau parolă incorecte.");
    }

    const user = result.rows[0];

    // Verifică parola
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      throw ApiError.unauthorized("Email sau parolă incorecte.");
    }

    // Verifică dacă 2FA este activat pentru utilizator
    if (user.two_factor_enabled) {
      // Generează un token temporar pentru verificarea 2FA
      const tempToken = jwt.sign(
        { userId: user.id, require2FA: true },
        process.env.JWT_SECRET,
        { expiresIn: "5m" }
      );

      return res.status(200).json({
        message: "Necesită verificare 2FA",
        require2FA: true,
        tempToken,
        userId: user.id,
      });
    }

    // Dacă 2FA nu este activat, generează token direct
    const token = generateToken(user);

    // Elimină parola din obiectul utilizator înainte de a-l trimite
    delete user.password_hash;
    delete user.two_factor_secret;

    res.status(200).json({
      message: "Autentificare reușită",
      token,
      user,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Verificare cod 2FA
 */
const verify2FA = async (req, res, next) => {
  try {
    const { code, tempToken } = req.body;

    if (!code || !tempToken) {
      throw ApiError.badRequest("Codul și token-ul temporar sunt obligatorii.");
    }

    // Decodifică token-ul temporar
    let decoded;
    try {
      decoded = jwt.verify(tempToken, process.env.JWT_SECRET);
    } catch (error) {
      throw ApiError.unauthorized("Token temporar invalid sau expirat.");
    }

    if (!decoded.userId || !decoded.require2FA) {
      throw ApiError.unauthorized("Token temporar invalid.");
    }

    const db = req.app.locals.db;
    const result = await db.query("SELECT * FROM users WHERE id = $1", [
      decoded.userId,
    ]);

    if (result.rows.length === 0) {
      throw ApiError.notFound("Utilizator negăsit.");
    }

    const user = result.rows[0];

    // Verifică codul 2FA
    const verified = speakeasy.totp.verify({
      secret: user.two_factor_secret,
      encoding: "base32",
      token: code,
    });

    if (!verified) {
      throw ApiError.unauthorized("Cod 2FA invalid.");
    }

    // Generează token JWT complet
    const token = generateToken(user);

    // Elimină parola și secretul 2FA din obiectul utilizator
    delete user.password_hash;
    delete user.two_factor_secret;

    res.status(200).json({
      message: "Autentificare reușită",
      token,
      user,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Activează 2FA pentru utilizator
 */
const enable2FA = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const db = req.app.locals.db;

    // Verifică dacă utilizatorul există
    const userResult = await db.query("SELECT * FROM users WHERE id = $1", [
      userId,
    ]);

    if (userResult.rows.length === 0) {
      throw ApiError.notFound("Utilizator negăsit.");
    }

    const user = userResult.rows[0];

    // Verifică dacă 2FA este deja activat
    if (user.two_factor_enabled) {
      throw ApiError.conflict(
        "Autentificarea cu doi factori este deja activată."
      );
    }

    // Generează un secret nou pentru 2FA
    const secret = speakeasy.generateSecret({
      name: `CloudStorage:${user.email}`, // Format pentru aplicațiile autentificator
    });

    // Generează QR code pentru scanare cu aplicația autentificator
    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

    // Stochează secretul în baza de date (nu activăm încă 2FA)
    await db.query("UPDATE users SET two_factor_secret = $1 WHERE id = $2", [
      secret.base32,
      userId,
    ]);

    res.status(200).json({
      message:
        "Secret 2FA generat. Scanați codul QR cu aplicația autentificator.",
      qrCodeUrl,
      secret: secret.base32,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Verifică și activează 2FA după ce utilizatorul scanează QR-ul
 */
const activate2FA = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { code } = req.body;
    const db = req.app.locals.db;

    // Obține secretul utilizatorului
    const result = await db.query(
      "SELECT two_factor_secret FROM users WHERE id = $1",
      [userId]
    );

    if (result.rows.length === 0) {
      throw ApiError.notFound("Utilizator negăsit.");
    }

    const { two_factor_secret } = result.rows[0];

    if (!two_factor_secret) {
      throw ApiError.badRequest(
        "Nu există un secret 2FA. Generați mai întâi un secret."
      );
    }

    // Verifică codul furnizat
    const verified = speakeasy.totp.verify({
      secret: two_factor_secret,
      encoding: "base32",
      token: code,
    });

    if (!verified) {
      throw ApiError.badRequest(
        "Cod invalid. Verificați aplicația autentificator."
      );
    }

    // Activează 2FA pentru utilizator
    await db.query("UPDATE users SET two_factor_enabled = true WHERE id = $1", [
      userId,
    ]);

    res.status(200).json({
      message: "Autentificarea cu doi factori a fost activată cu succes.",
      twoFactorEnabled: true,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Dezactivează 2FA pentru utilizator (după verificarea codului)
 */
const disable2FA = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { code } = req.body;
    const db = req.app.locals.db;

    // Obține informațiile utilizatorului
    const result = await db.query(
      "SELECT two_factor_enabled, two_factor_secret FROM users WHERE id = $1",
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

    // Verifică codul
    const verified = speakeasy.totp.verify({
      secret: user.two_factor_secret,
      encoding: "base32",
      token: code,
    });

    if (!verified) {
      throw ApiError.badRequest(
        "Cod invalid. Verificați aplicația autentificator."
      );
    }

    // Dezactivează 2FA și șterge secretul
    await db.query(
      "UPDATE users SET two_factor_enabled = false, two_factor_secret = NULL WHERE id = $1",
      [userId]
    );

    res.status(200).json({
      message: "Autentificarea cu doi factori a fost dezactivată cu succes.",
      twoFactorEnabled: false,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Obține profilul utilizatorului
 */
const getProfile = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const db = req.app.locals.db;

    const result = await db.query(
      "SELECT id, email, name, surname, phone_number, two_factor_enabled, created_at FROM users WHERE id = $1",
      [userId]
    );

    if (result.rows.length === 0) {
      throw ApiError.notFound("Utilizator negăsit.");
    }

    res.status(200).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
};

/**
 * Actualizează profilul utilizatorului
 */
const updateProfile = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { name, surname, phone_number } = req.body;
    const db = req.app.locals.db;

    // Actualizează doar câmpurile furnizate
    const updateFields = [];
    const values = [];
    let paramCounter = 1;

    if (name !== undefined) {
      updateFields.push(`name = $${paramCounter++}`);
      values.push(name);
    }

    if (surname !== undefined) {
      updateFields.push(`surname = $${paramCounter++}`);
      values.push(surname);
    }

    if (phone_number !== undefined) {
      updateFields.push(`phone_number = $${paramCounter++}`);
      values.push(phone_number);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        message: "Niciun câmp furnizat pentru actualizare.",
      });
    }

    // Adaugă ID-ul utilizatorului ca ultimul parametru
    values.push(userId);

    const updateQuery = `
        UPDATE users 
        SET ${updateFields.join(", ")}, updated_at = NOW() 
        WHERE id = $${paramCounter} 
        RETURNING id, email, name, surname, phone_number, two_factor_enabled, updated_at
      `;

    const result = await db.query(updateQuery, values);

    if (result.rows.length === 0) {
      throw ApiError.notFound("Utilizator negăsit.");
    }

    res.status(200).json({
      message: "Profil actualizat cu succes",
      user: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Schimbă parola utilizatorului
 */
const changePassword = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;
    const db = req.app.locals.db;

    if (!currentPassword || !newPassword) {
      throw ApiError.badRequest(
        "Parola curentă și parola nouă sunt obligatorii."
      );
    }

    // Verifică parola curentă
    const userResult = await db.query(
      "SELECT password_hash FROM users WHERE id = $1",
      [userId]
    );

    if (userResult.rows.length === 0) {
      throw ApiError.notFound("Utilizator negăsit.");
    }

    const { password_hash } = userResult.rows[0];
    const passwordMatch = await bcrypt.compare(currentPassword, password_hash);

    if (!passwordMatch) {
      throw ApiError.badRequest("Parola curentă este incorectă.");
    }

    // Criptează noua parolă
    const saltRounds = 10;
    const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

    // Actualizează parola
    await db.query(
      "UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2",
      [newPasswordHash, userId]
    );

    res.status(200).json({
      message: "Parola a fost schimbată cu succes.",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Trimite un email pentru resetarea parolei
 */
const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    const db = req.app.locals.db;

    if (!email) {
      throw ApiError.badRequest("Email-ul este obligatoriu.");
    }

    // Verifică dacă utilizatorul există
    const userResult = await db.query("SELECT id FROM users WHERE email = $1", [
      email,
    ]);

    // Nu dezvăluim dacă email-ul există în baza de date (pentru securitate)
    if (userResult.rows.length === 0) {
      return res.status(200).json({
        message:
          "Dacă contul există, veți primi instrucțiuni de resetare a parolei.",
      });
    }

    const userId = userResult.rows[0].id;

    // Generează un token pentru resetarea parolei
    const resetToken = jwt.sign(
      { userId, purpose: "password-reset" },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    // Stochează token-ul în baza de date sau trimite-l prin email
    // În prezent doar simulăm trimiterea email-ului
    console.log(`Token de resetare generat pentru ${email}: ${resetToken}`);
    console.log(
      `URL de resetare: ${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`
    );

    // În implementarea reală, aici s-ar trimite email-ul

    res.status(200).json({
      message:
        "Dacă contul există, veți primi instrucțiuni de resetare a parolei.",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Resetează parola cu token-ul primit
 */
const resetPassword = async (req, res, next) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      throw ApiError.badRequest("Token-ul și noua parolă sunt obligatorii.");
    }

    // Verifică token-ul
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      throw ApiError.unauthorized("Token invalid sau expirat.");
    }

    if (!decoded.userId || decoded.purpose !== "password-reset") {
      throw ApiError.unauthorized("Token invalid.");
    }

    // Criptează noua parolă
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    // Actualizează parola
    const db = req.app.locals.db;
    const result = await db.query(
      "UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2 RETURNING id",
      [hashedPassword, decoded.userId]
    );

    if (result.rows.length === 0) {
      throw ApiError.notFound("Utilizator negăsit.");
    }

    res.status(200).json({
      message: "Parola a fost resetată cu succes. Vă puteți autentifica acum.",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Reînnoiește token-ul JWT
 */
const refreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      throw ApiError.badRequest("Refresh token-ul este obligatoriu.");
    }

    // Verifică refresh token-ul
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
    } catch (error) {
      throw ApiError.unauthorized("Refresh token invalid sau expirat.");
    }

    const db = req.app.locals.db;
    const result = await db.query("SELECT * FROM users WHERE id = $1", [
      decoded.id,
    ]);

    if (result.rows.length === 0) {
      throw ApiError.notFound("Utilizator negăsit.");
    }

    const user = result.rows[0];

    // Generează un nou token de acces
    const newAccessToken = generateToken(user);

    res.status(200).json({
      token: newAccessToken,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delogare - în implementare reală s-ar putea adăuga token-ul la o listă neagră
 */
const logout = (req, res) => {
  // În prezent, doar returnăm un mesaj de succes
  // Pentru o implementare mai robustă, s-ar putea stoca token-ul într-o "blacklist"
  res.status(200).json({
    message: "Delogare reușită",
  });
};

/**
 * Generează token JWT pentru utilizator
 */
const generateToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      name: user.name,
      surname: user.surname,
    },
    process.env.JWT_SECRET,
    { expiresIn: "1d" }
  );
};

module.exports = {
  register,
  login,
  verify2FA,
  enable2FA,
  activate2FA,
  disable2FA,
  getProfile,
  updateProfile,
  changePassword,
  forgotPassword,
  resetPassword,
  refreshToken,
  logout,
};
