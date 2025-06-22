const containerService = require("../services/container.service");
const { ApiError } = require("../middlewares/error.middleware");
const Fragment = require("../models/fragment.model");

/**
 * Obține lista tuturor containerelor cu procent de utilizare calculat
 */
const getAllContainers = async (req, res, next) => {
  try {
    const containers = await containerService.getAllContainersStatus();
    const db = req.app.locals.db;

    // Query pentru storage data
    const storageResult = await db.query(`
      SELECT id, storage_used, storage_total 
      FROM containers 
      ORDER BY id
    `);

    // Combină datele
    const containersWithStorage = containers.map((container) => {
      const storageData = storageResult.rows.find(
        (row) => row.id === container.id
      );

      const storageUsed = parseInt(storageData?.storage_used || 0);
      const storageTotal = parseInt(storageData?.storage_total || 1073741824); // 1GB default
      const storageUsagePercent =
        storageTotal > 0 ? (storageUsed / storageTotal) * 100 : 0;

      return {
        ...container,
        storageUsed,
        storageTotal,
        storageUsagePercent,
        storageUsedFormatted: formatBytes(storageUsed),
        storageTotalFormatted: formatBytes(storageTotal),
      };
    });

    res.status(200).json({
      containers: containersWithStorage,
      count: containersWithStorage.length,
      activeCount: containersWithStorage.filter((c) => c.status === "active")
        .length,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Obține informații detaliate despre un container specific
 */
const getContainerById = async (req, res, next) => {
  try {
    const containerId = parseInt(req.params.id);

    if (isNaN(containerId) || containerId < 1) {
      console.log("❌ INVALID ID DETECTED!");
      throw ApiError.badRequest(
        `ID invalid: received '${req.params.id}', parsed as ${containerId}`
      );
    }

    const exists = await containerService.containerExists(containerId);
    if (!exists) {
      throw ApiError.notFound(
        `Containerul cu ID-ul ${containerId} nu a fost găsit.`
      );
    }
    // Obține starea containerului
    const containerStatus = await containerService.getContainerStatus(
      containerId
    );

    // Obține informații despre fragmentele din container
    const db = req.app.locals.db;
    const fragmentModel = new Fragment(db);
    const fragments = await fragmentModel.findByContainerId(containerId);

    // Obține statistici de stocare
    const storageStats = {
      fragmentCount: fragments.length,
      totalSize: fragments.reduce(
        (sum, fragment) => sum + parseInt(fragment.size_bytes || 0),
        0
      ),
      filesCount: new Set(fragments.map((fragment) => fragment.file_id)).size,
    };

    res.status(200).json({
      container: {
        id: containerId,
        name: `${process.env.CONTAINER_PREFIX || "storage-"}${containerId}`,
        ...containerStatus,
        storageStats,
        fragmentsInfo: fragments.slice(0, 10).map((f) => ({
          id: f.id,
          fileId: f.file_id,
          fileName: f.file_name,
          fragmentIndex: f.fragment_index,
          size: f.size_bytes,
        })),
        totalFragments: fragments.length,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Repornește un container specific
 */
const restartContainer = async (req, res, next) => {
  try {
    const containerId = parseInt(req.params.id);

    if (isNaN(containerId) || containerId < 1) {
      throw ApiError.badRequest("ID de container invalid.", containerId);
    }

    const exists = await containerService.containerExists(containerId);
    if (!exists) {
      throw ApiError.notFound(
        `Containerul cu ID-ul ${containerId} nu a fost găsit.`
      );
    }

    const result = await containerService.restartContainer(containerId);

    res.status(200).json({
      message: `Containerul ${containerId} a fost repornit cu succes.`,
      details: result,
    });
  } catch (error) {
    console.error("Eroare la repornirea containerului:", error);
    next(error);
  }
};

/**
 * Obține distribuția fragmentelor între containere
 */
const getFragmentDistribution = async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const fragmentModel = new Fragment(db);

    const distribution = await fragmentModel.getContainerDistribution();

    // Obține informații despre toate containerele
    const containers = await containerService.getAllContainersStatus();

    // Combină informațiile pentru a include și containerele fără fragmente
    const result = [];

    for (const container of containers) {
      const containerInfo = distribution.find(
        (d) => parseInt(d.container_id) === container.id
      );

      result.push({
        containerId: container.id,
        name: container.name,
        status: container.status,
        health: container.health,
        fragmentCount: containerInfo
          ? parseInt(containerInfo.fragment_count)
          : 0,
        totalSize: containerInfo ? parseInt(containerInfo.total_size || 0) : 0,
        totalSizeFormatted: formatBytes(
          containerInfo ? parseInt(containerInfo.total_size || 0) : 0
        ),
      });
    }

    // Sortează după numărul de fragmente (descrescător)
    result.sort((a, b) => b.fragmentCount - a.fragmentCount);

    res.status(200).json({
      distribution: result,
      summary: {
        totalFragments: result.reduce(
          (sum, container) => sum + container.fragmentCount,
          0
        ),
        totalSize: result.reduce(
          (sum, container) => sum + container.totalSize,
          0
        ),
        totalSizeFormatted: formatBytes(
          result.reduce((sum, container) => sum + container.totalSize, 0)
        ),
        avgFragmentsPerContainer: Math.round(
          result.reduce((sum, container) => sum + container.fragmentCount, 0) /
            containers.length
        ),
        mostLoadedContainer: result[0] ? result[0].containerId : null,
        leastLoadedContainer: result[result.length - 1]
          ? result[result.length - 1].containerId
          : null,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Formatează bytes într-un format ușor de citit
 */
function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}
/**
 * Reechilibrează distribuția fragmentelor între containere
 */
const rebalanceContainers = async (req, res, next) => {
  try {
    const force = req.query.force === "true";
    const db = req.app.locals.db;

    console.log("Începe rebalansarea containerelor...");

    // Folosește funcția din containerService
    const result = await containerService.rebalanceContainers(db);

    if (force && result.stats.movedFragments === 0) {
      const distributionResult = await db.query(`
        SELECT 
          c.id,
          COALESCE(f.fragment_count, 0) as fragment_count
        FROM containers c
        LEFT JOIN (
          SELECT 
            container_id,
            COUNT(*) as fragment_count
          FROM fragments
          GROUP BY container_id
        ) f ON c.id = f.container_id
        WHERE c.status = 'active'
        ORDER BY fragment_count DESC
      `);

      const containers = distributionResult.rows;
      if (containers.length >= 2) {
        const maxFragments = containers[0].fragment_count;
        const minFragments = containers[containers.length - 1].fragment_count;

        if (maxFragments > minFragments) {
          const sourceContainerId = containers[0].id;
          const targetContainerId = containers[containers.length - 1].id;

          const fragmentQuery = await db.query(
            `SELECT id, fragment_name FROM fragments 
             WHERE container_id = $1 
             ORDER BY id DESC LIMIT 1`,
            [sourceContainerId]
          );

          if (fragmentQuery.rows.length > 0) {
            const fragment = fragmentQuery.rows[0];

            try {
              const fragmentContent = await containerService.retrieveFragment(
                sourceContainerId,
                fragment.fragment_name
              );

              await containerService.storeFragment(
                targetContainerId,
                fragment.fragment_name,
                fragmentContent
              );

              await db.query(
                "UPDATE fragments SET container_id = $1 WHERE id = $2",
                [targetContainerId, fragment.id]
              );

              await containerService.deleteFragment(
                sourceContainerId,
                fragment.fragment_name
              );

              return res.status(200).json({
                message: "Rebalansare forțată completă. 1 fragment mutat.",
                movedFragments: 1,
                forced: true,
                sourceContainerId,
                targetContainerId,
              });
            } catch (error) {
              console.error("Eroare la rebalansarea forțată:", error);
            }
          }
        }
      }
    }

    res.status(200).json({
      message: result.message,
      stats: result.stats,
      success: result.success,
    });
  } catch (error) {
    console.error("Eroare la rebalansarea containerelor:", error);
    next(error);
  }
};

module.exports = {
  getAllContainers,
  getContainerById,
  restartContainer,
  getFragmentDistribution,
  rebalanceContainers,
};
