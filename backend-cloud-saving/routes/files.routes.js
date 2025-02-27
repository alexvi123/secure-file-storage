const express = require("express");
const router = express.Router();
const filesController = require("../controllers/files.controller");
const {
  upload,
  handleMulterError,
  cleanupOnFinish,
} = require("../middlewares/upload.middleware");
const {
  authMiddleware,
  ownershipMiddleware,
} = require("../middlewares/auth.middleware");

/**
 * @route POST /api/files/upload
 * @description Încarcă un fișier, îl fragmentează și îl distribuie în containere
 * @access Private
 */
router.post(
  "/upload",
  upload.single("file"),
  handleMulterError,
  cleanupOnFinish,
  filesController.uploadFile
);

/**
 * @route GET /api/files
 * @description Obține lista de fișiere ale utilizatorului autentificat
 * @access Private
 */
router.get("/", filesController.getUserFiles);

/**
 * @route GET /api/files/search
 * @description Caută fișiere după nume
 * @access Private
 */
router.get("/search", filesController.searchFiles);

/**
 * @route GET /api/files/stats
 * @description Obține statistici despre fișierele utilizatorului
 * @access Private
 */
router.get("/stats", filesController.getUserStats);

/**
 * @route GET /api/files/:id
 * @description Obține metadatele unui fișier specific
 * @access Private
 */
router.get(
  "/:id",
  ownershipMiddleware("id", "file"),
  filesController.getFileById
);

/**
 * @route GET /api/files/:id/download
 * @description Descarcă un fișier asamblat din fragmente
 * @access Private
 */
router.get(
  "/:id/download",
  ownershipMiddleware("id", "file"),
  filesController.downloadFile
);

/**
 * @route PUT /api/files/:id
 * @description Actualizează metadatele unui fișier (nume, etc.)
 * @access Private
 */
router.put(
  "/:id",
  ownershipMiddleware("id", "file"),
  filesController.updateFile
);

/**
 * @route DELETE /api/files/:id
 * @description Șterge un fișier și toate fragmentele sale
 * @access Private
 */
router.delete(
  "/:id",
  ownershipMiddleware("id", "file"),
  filesController.deleteFile
);

/**
 * @route GET /api/files/:id/integrity
 * @description Verifică integritatea unui fișier
 * @access Private
 */
router.get(
  "/:id/integrity",
  ownershipMiddleware("id", "file"),
  filesController.verifyFileIntegrity
);

/**
 * @route POST /api/files/:id/repair
 * @description Încearcă să repare un fișier
 * @access Private
 */
router.post(
  "/:id/repair",
  ownershipMiddleware("id", "file"),
  filesController.repairFile
);

module.exports = router;
