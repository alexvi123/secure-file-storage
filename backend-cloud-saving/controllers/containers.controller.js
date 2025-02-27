const containerService = require("../services/container.service");
const { ApiError } = require("../middlewares/error.middleware");
const Fragment = require("../models/fragment.model");

/**
 * Obține lista tuturor containerelor
 */
const getAllContainers = async (req, res, next) => {
  try {
    const containers = await containerService.getAllContainersStatus();

    res.status(200).json({
      containers,
      count: containers.length,
      activeCount: containers.filter((c) => c.status === "active").length,
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
      throw ApiError.badRequest("ID de container invalid.");
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
      throw ApiError.badRequest("ID de container invalid.");
    }

    const exists = await containerService.containerExists(containerId);
    if (!exists) {
      throw ApiError.notFound(
        `Containerul cu ID-ul ${containerId} nu a fost găsit.`
      );
    }

    await containerService.restartContainer(containerId);

    res.status(200).json({
      message: `Containerul ${containerId} a fost repornit cu succes.`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Obține lista fragmentelor dintr-un container
 */
const getContainerFragments = async (req, res, next) => {
  try {
    const containerId = parseInt(req.params.id);
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    if (isNaN(containerId) || containerId < 1) {
      throw ApiError.badRequest("ID de container invalid.");
    }

    const exists = await containerService.containerExists(containerId);
    if (!exists) {
      throw ApiError.notFound(
        `Containerul cu ID-ul ${containerId} nu a fost găsit.`
      );
    }

    // Obține fragmentele
    const db = req.app.locals.db;
    const fragmentModel = new Fragment(db);

    // Obține numărul total de fragmente
    const fragmentCount = await fragmentModel.countByContainerId(containerId);

    // Obține fragmentele cu paginare
    const fragmentsQuery = await db.query(
      `SELECT fr.id, fr.file_id, fr.fragment_index, fr.fragment_name, fr.size_bytes, fr.checksum,
              f.original_name as file_name, u.id as user_id, u.email as user_email
       FROM fragments fr
       JOIN files f ON fr.file_id = f.id
       JOIN users u ON f.user_id = u.id
       WHERE fr.container_id = $1
       ORDER BY fr.id DESC
       LIMIT $2 OFFSET $3`,
      [containerId, limit, offset]
    );

    const fragments = fragmentsQuery.rows;

    // Pregătește răspunsul cu informații despre paginare
    const totalPages = Math.ceil(fragmentCount / limit);

    res.status(200).json({
      containerId,
      fragments: fragments.map((fragment) => ({
        id: fragment.id,
        fileId: fragment.file_id,
        fileName: fragment.file_name,
        fragmentIndex: fragment.fragment_index,
        size: fragment.size_bytes,
        checksum: fragment.checksum,
        userId: fragment.user_id,
        userEmail: fragment.user_email,
      })),
      pagination: {
        currentPage: page,
        totalPages,
        totalFragments: fragmentCount,
        limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Mută un fragment dintr-un container în altul
 */
const moveFragment = async (req, res, next) => {
  try {
    const { fragmentId, targetContainerId } = req.body;

    if (!fragmentId || !targetContainerId) {
      throw ApiError.badRequest(
        "ID-ul fragmentului și ID-ul containerului țintă sunt obligatorii."
      );
    }

    const targetId = parseInt(targetContainerId);
    if (isNaN(targetId) || targetId < 1) {
      throw ApiError.badRequest("ID de container țintă invalid.");
    }

    const targetExists = await containerService.containerExists(targetId);
    if (!targetExists) {
      throw ApiError.notFound(
        `Containerul țintă cu ID-ul ${targetId} nu a fost găsit.`
      );
    }

    // Obține informații despre fragment
    const db = req.app.locals.db;
    const fragmentResult = await db.query(
      "SELECT fragment_name, container_id FROM fragments WHERE id = $1",
      [fragmentId]
    );

    if (fragmentResult.rows.length === 0) {
      throw ApiError.notFound(
        `Fragmentul cu ID-ul ${fragmentId} nu a fost găsit.`
      );
    }

    const fragment = fragmentResult.rows[0];
    const sourceContainerId = fragment.container_id;

    // Verifică dacă fragmentul este deja în containerul țintă
    if (sourceContainerId === targetId) {
      return res.status(200).json({
        message: `Fragmentul este deja în containerul ${targetId}.`,
        fragmentId,
        containerId: targetId,
      });
    }

    // Obține conținutul fragmentului
    const fragmentContent = await containerService.retrieveFragment(
      sourceContainerId,
      fragment.fragment_name
    );

    // Stochează fragmentul în containerul țintă
    await containerService.storeFragment(
      targetId,
      fragment.fragment_name,
      fragmentContent
    );

    // Actualizează înregistrarea în baza de date
    await db.query("UPDATE fragments SET container_id = $1 WHERE id = $2", [
      targetId,
      fragmentId,
    ]);

    // Șterge fragmentul din containerul sursă
    await containerService.deleteFragment(
      sourceContainerId,
      fragment.fragment_name
    );

    res.status(200).json({
      message: `Fragmentul a fost mutat cu succes din containerul ${sourceContainerId} în containerul ${targetId}.`,
      fragmentId,
      sourceContainerId,
      targetContainerId: targetId,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Verifică starea de sănătate a tuturor containerelor
 */
const checkContainersHealth = async (req, res, next) => {
  try {
    const containers = await containerService.getAllContainersStatus();

    const healthReport = {
      totalContainers: containers.length,
      activeContainers: containers.filter((c) => c.status === "active").length,
      inactiveContainers: containers.filter((c) => c.status !== "active")
        .length,
      healthyContainers: containers.filter((c) => c.health === "healthy")
        .length,
      unhealthyContainers: containers.filter((c) => c.health === "unhealthy")
        .length,
      containerStatus: containers.map((c) => ({
        id: c.id,
        name: c.name,
        status: c.status,
        health: c.health,
        lastChecked: c.lastChecked,
      })),
    };

    res.status(200).json(healthReport);
  } catch (error) {
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
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB"];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

/**
 * Reechilibrează distribuția fragmentelor între containere
 */
const rebalanceContainers = async (req, res, next) => {
  try {
    const force = req.query.force === "true";

    // Obține starea curentă a containerelor
    const containers = await containerService.getAllContainersStatus();

    // Verifică dacă sunt suficiente containere active
    const activeContainers = containers.filter((c) => c.status === "active");

    if (activeContainers.length < 2) {
      throw ApiError.badRequest(
        "Sunt necesare cel puțin două containere active pentru reechilibrare."
      );
    }

    // Obține distribuția fragmentelor
    const db = req.app.locals.db;
    const fragmentModel = new Fragment(db);

    const distribution = await fragmentModel.getContainerDistribution();

    // Completează distribuția cu containerele fără fragmente
    const fullDistribution = [];

    for (const container of activeContainers) {
      const containerInfo = distribution.find(
        (d) => parseInt(d.container_id) === container.id
      );

      fullDistribution.push({
        containerId: container.id,
        fragmentCount: containerInfo
          ? parseInt(containerInfo.fragment_count)
          : 0,
        totalSize: containerInfo ? parseInt(containerInfo.total_size || 0) : 0,
      });
    }

    // Calculează media de fragmente per container
    const totalFragments = fullDistribution.reduce(
      (sum, container) => sum + container.fragmentCount,
      0
    );
    const avgFragmentsPerContainer = Math.ceil(
      totalFragments / activeContainers.length
    );

    // Calculează pragul de dezechilibru (20% peste sau sub medie)
    const upperThreshold = avgFragmentsPerContainer * 1.2;
    const lowerThreshold = avgFragmentsPerContainer * 0.8;

    // Identifică containerele supraîncărcate și subîncărcate
    const overloadedContainers = fullDistribution
      .filter((c) => c.fragmentCount > upperThreshold)
      .sort((a, b) => b.fragmentCount - a.fragmentCount);

    const underloadedContainers = fullDistribution
      .filter((c) => c.fragmentCount < lowerThreshold)
      .sort((a, b) => a.fragmentCount - b.fragmentCount);

    // Verifică dacă este necesară reechilibrarea
    if (overloadedContainers.length === 0 && !force) {
      return res.status(200).json({
        message:
          "Containerele sunt deja echilibrate. Nu este necesară reechilibrarea.",
        avgFragmentsPerContainer,
        upperThreshold: Math.round(upperThreshold),
        lowerThreshold: Math.round(lowerThreshold),
        distribution: fullDistribution.sort(
          (a, b) => b.fragmentCount - a.fragmentCount
        ),
      });
    }

    // Inițializează contoare pentru statistici
    let movedFragments = 0;
    const operationsLog = [];

    // Încearpă tranzacția în baza de date
    await db.query("BEGIN");

    try {
      // Pentru fiecare container supraîncărcat
      for (const source of overloadedContainers) {
        // Calculează câte fragmente trebuie mutate
        const fragmentsToMove = source.fragmentCount - avgFragmentsPerContainer;

        if (fragmentsToMove <= 0) continue;

        // Obține fragmentele de la containerul sursă
        const fragmentsQuery = await db.query(
          `SELECT id, fragment_name, file_id
           FROM fragments 
           WHERE container_id = $1
           ORDER BY id DESC
           LIMIT $2`,
          [source.containerId, fragmentsToMove]
        );

        const fragments = fragmentsQuery.rows;

        // Pentru fiecare fragment care trebuie mutat
        for (const fragment of fragments) {
          // Sortează containerele subîncărcate după numărul de fragmente
          underloadedContainers.sort(
            (a, b) => a.fragmentCount - b.fragmentCount
          );

          if (underloadedContainers.length === 0) break;

          const target = underloadedContainers[0];

          try {
            // Obține conținutul fragmentului
            const fragmentContent = await containerService.retrieveFragment(
              source.containerId,
              fragment.fragment_name
            );

            // Stochează fragmentul în containerul țintă
            await containerService.storeFragment(
              target.containerId,
              fragment.fragment_name,
              fragmentContent
            );

            // Actualizează înregistrarea în baza de date
            await db.query(
              "UPDATE fragments SET container_id = $1 WHERE id = $2",
              [target.containerId, fragment.id]
            );

            // Șterge fragmentul din containerul sursă
            await containerService.deleteFragment(
              source.containerId,
              fragment.fragment_name
            );

            // Actualizează contoarele
            source.fragmentCount--;
            target.fragmentCount++;
            movedFragments++;

            // Adaugă operația în log
            operationsLog.push({
              fragmentId: fragment.id,
              fileId: fragment.file_id,
              sourceContainerId: source.containerId,
              targetContainerId: target.containerId,
              timestamp: new Date().toISOString(),
            });
          } catch (error) {
            console.error(
              `Eroare la mutarea fragmentului ${fragment.id}:`,
              error
            );
            // Continuă cu următorul fragment
          }
        }
      }

      // Comite tranzacția
      await db.query("COMMIT");

      res.status(200).json({
        message: `Reechilibrare finalizată. ${movedFragments} fragmente au fost mutate.`,
        movedFragments,
        operations: operationsLog.length,
        avgFragmentsPerContainer,
        upperThreshold: Math.round(upperThreshold),
        lowerThreshold: Math.round(lowerThreshold),
        // Primele 20 de operații
        recentOperations: operationsLog.slice(0, 20),
      });
    } catch (error) {
      // Anulează tranzacția în caz de eroare
      await db.query("ROLLBACK");
      throw error;
    }
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllContainers,
  getContainerById,
  restartContainer,
  getContainerFragments,
  moveFragment,
  checkContainersHealth,
  getFragmentDistribution,
  rebalanceContainers,
};
