const express = require("express");
const router = express.Router();
const adminController = require("../controllers/admin.controller");
const containersController = require("../controllers/containers.controller");
const {
  authMiddleware,
  adminMiddleware,
} = require("../middlewares/auth.middleware");

// Toate rutele din acest fișier necesită drepturi de admin
// Middleware-ul adminMiddleware este aplicat la nivel de router în server.js

/**
 * @route GET /api/admin/users
 * @description Obține lista tuturor utilizatorilor
 * @access Admin
 */
router.get("/users", adminController.getAllUsers);

/**
 * @route GET /api/admin/users/:id
 * @description Obține informații detaliate despre un utilizator
 * @access Admin
 */
router.get("/users/:id", adminController.getUserById);

/**
 * @route PUT /api/admin/users/:id
 * @description Actualizează informațiile unui utilizator
 * @access Admin
 */
router.put("/users/:id", adminController.updateUser);

/**
 * @route DELETE /api/admin/users/:id
 * @description Șterge un utilizator și toate fișierele asociate
 * @access Admin
 */
router.delete("/users/:id", adminController.deleteUser);

/**
 * @route GET /api/admin/files
 * @description Obține lista tuturor fișierelor din sistem
 * @access Admin
 */
router.get("/files", adminController.getAllFiles);

/**
 * @route DELETE /api/admin/files/:id
 * @description Șterge un fișier specific
 * @access Admin
 */
router.delete("/files/:id", adminController.deleteFile);

/**
 * @route GET /api/admin/stats
 * @description Obține statistici generale despre sistem
 * @access Admin
 */
router.get("/stats", adminController.getSystemStats);

// Rute pentru gestionarea containerelor

/**
 * @route GET /api/admin/containers
 * @description Obține lista tuturor containerelor
 * @access Admin
 */
router.get("/containers", containersController.getAllContainers);

/**
 * @route GET /api/admin/containers/:id
 * @description Obține informații detaliate despre un container
 * @access Admin
 */
router.get("/containers/:id", containersController.getContainerById);

/**
 * @route POST /api/admin/containers/:id/restart
 * @description Repornește un container
 * @access Admin
 */
router.post("/containers/:id/restart", containersController.restartContainer);

/**
 * @route GET /api/admin/containers/:id/fragments
 * @description Obține lista fragmentelor dintr-un container
 * @access Admin
 */
router.get(
  "/containers/:id/fragments",
  containersController.getContainerFragments
);

/**
 * @route POST /api/admin/containers/move-fragment
 * @description Mută un fragment dintr-un container în altul
 * @access Admin
 */
router.post("/containers/move-fragment", containersController.moveFragment);

/**
 * @route GET /api/admin/containers/health
 * @description Verifică starea de sănătate a tuturor containerelor
 * @access Admin
 */
router.get("/containers/health", containersController.checkContainersHealth);

/**
 * @route GET /api/admin/containers/distribution
 * @description Obține distribuția fragmentelor între containere
 * @access Admin
 */
router.get(
  "/containers/distribution",
  containersController.getFragmentDistribution
);

/**
 * @route POST /api/admin/containers/rebalance
 * @description Reechilibrează distribuția fragmentelor între containere
 * @access Admin
 */
router.post("/containers/rebalance", containersController.rebalanceContainers);

module.exports = router;
