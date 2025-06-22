const express = require("express");
const router = express.Router();
const authController = require("../controllers/auth.controller");
const {
  authMiddleware,
  twoFactorMiddleware,
} = require("../middlewares/auth.middleware");

/**
 * @route POST /api/auth/register
 * @description Înregistrează un nou utilizator
 * @access Public
 */
router.post("/register", authController.register);

/**
 * @route POST /api/auth/login
 * @description Autentificare utilizator
 * @access Public
 */
router.post("/login", authController.login);

/**
 * @route POST /api/auth/verify-2fa
 * @description Verifică codul 2FA pentru finalizarea autentificării
 * @access Public (cu token temporar)
 */
router.post("/verify-2fa", twoFactorMiddleware, authController.verify2FA);

/**
 * @route POST /api/auth/enable-2fa
 * @description Generează secretul pentru activarea 2FA
 * @access Private
 */
router.post("/enable-2fa", authMiddleware, authController.enable2FA);

/**
 * @route POST /api/auth/activate-2fa
 * @description Activează 2FA după verificarea codului
 * @access Private
 */
router.post("/activate-2fa", authMiddleware, authController.activate2FA);

/**
 * @route POST /api/auth/disable-2fa
 * @description Dezactivează 2FA
 * @access Private
 */
router.post("/disable-2fa", authMiddleware, authController.disable2FA);

/**
 * @route GET /api/auth/profile
 * @description Obține profilul utilizatorului curent
 * @access Private
 */
router.get("/profile", authMiddleware, authController.getProfile);

/**
 * @route PUT /api/auth/profile
 * @description Actualizează profilul utilizatorului
 * @access Private
 */
router.put("/profile", authMiddleware, authController.updateProfile);

/**
 * @route POST /api/auth/change-password
 * @description Schimbă parola utilizatorului autentificat
 * @access Private
 */
router.post("/change-password", authMiddleware, authController.changePassword);

/**
 * @route POST /api/auth/refresh-token
 * @description Reînnoiește token-ul JWT
 * @access Public (cu refresh token)
 */
router.post("/refresh-token", authController.refreshToken);

/**
 * @route POST /api/auth/forgot-password
 * @description Trimite un email pentru resetarea parolei
 * @access Public
 */
router.post("/forgot-password", authController.forgotPassword);

/**
 * @route POST /api/auth/reset-password
 * @description Resetează parola utilizând token-ul primit
 * @access Public (cu token de resetare)
 */
router.post("/reset-password", authController.resetPassword);

/**
 * @route POST /api/auth/logout
 * @description Delogare
 * @access Private
 */
router.post("/logout", authMiddleware, authController.logout);

module.exports = router;
