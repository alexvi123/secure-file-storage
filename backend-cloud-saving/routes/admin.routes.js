const express = require("express");
const router = express.Router();
const adminController = require("../controllers/admin.controller");
const containersController = require("../controllers/containers.controller");
const {
  authMiddleware,
  adminMiddleware,
} = require("../middlewares/auth.middleware");

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
 * @route GET /api/admin/stats
 * @description Obține statistici generale despre sistem
 * @access Admin
 */
router.get("/stats", adminController.getSystemStats);

/**
 * @route GET /api/admin/containers
 * @description Obține lista tuturor containerelor
 * @access Admin
 */
router.get("/containers", containersController.getAllContainers);

/**
 * @route POST /api/admin/containers/rebalance
 * @description Reechilibrează distribuția fragmentelor între containere
 * @access Admin
 */
router.post("/containers/rebalance", containersController.rebalanceContainers);

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
 * @route GET /api/admin/storage/report
 * @description Obține raportul complet de storage
 * @access Admin
 */
router.get("/storage/report", adminController.getStorageReport);

/**
 * @route POST /api/admin/rebalance
 * @description Rebalansează fragmentele între containere
 * @access Admin
 */
router.post("/rebalance", adminController.rebalanceContainers);

module.exports = router;
