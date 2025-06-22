const { ApiError } = require("../middlewares/error.middleware");
const containerService = require("../services/container.service");

/**
 * Obținere listă utilizatori
 */
const getAllUsers = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const search = req.query.search || "";
    const db = req.app.locals.db;

    // Query cu search și storage info
    let whereClause = "";
    let queryParams = [limit, offset];

    if (search) {
      whereClause = `WHERE (u.name ILIKE $3 OR u.surname ILIKE $3 OR u.email ILIKE $3)`;
      queryParams.push(`%${search}%`);
    }

    // Obținere utilizatori cu informații de storage
    const usersQuery = `
      SELECT 
        u.id, 
        u.email, 
        u.name, 
        u.surname, 
        u.phone_number, 
        u.two_factor_enabled, 
        u.created_at,
        COUNT(f.id) as file_count,
        COALESCE(SUM(f.size_bytes), 0) as storage_used
      FROM users u
      LEFT JOIN files f ON u.id = f.user_id
      ${whereClause}
      GROUP BY u.id, u.email, u.name, u.surname, u.phone_number, u.two_factor_enabled, u.created_at
      ORDER BY u.created_at DESC
      LIMIT $1 OFFSET $2
    `;

    const usersResult = await db.query(usersQuery, queryParams);

    // Obținere număr total cu search
    const countQuery = search
      ? `SELECT COUNT(DISTINCT u.id) FROM users u ${whereClause}`
      : `SELECT COUNT(*) FROM users`;

    const countParams = search ? [`%${search}%`] : [];
    const countResult = await db.query(countQuery, countParams);
    const totalUsers = parseInt(countResult.rows[0].count);

    // Formatare date utilizator
    const formattedUsers = usersResult.rows.map((user) => ({
      id: user.id,
      email: user.email,
      name: user.name,
      surname: user.surname,
      phone_number: user.phone_number,
      two_factor_enabled: user.two_factor_enabled,
      created_at: user.created_at,
      fileCount: parseInt(user.file_count),
      storageUsed: parseInt(user.storage_used),
      storageUsedFormatted: formatBytes(parseInt(user.storage_used)),
    }));

    // Calculare informații despre paginare
    const totalPages = Math.ceil(totalUsers / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.status(200).json({
      users: formattedUsers,
      pagination: {
        currentPage: page,
        totalPages,
        limit,
        totalUsers,
        hasNextPage,
        hasPrevPage,
      },
    });
  } catch (error) {
    console.error("Eroare la obținerea utilizatorilor:", error);
    next(error);
  }
};

/**
 * Obținere detalii despre un utilizator specific
 */
const getUserById = async (req, res, next) => {
  try {
    const userId = req.params.id;
    const db = req.app.locals.db;

    // Obținere informații despre utilizator
    const userResult = await db.query(
      `SELECT id, email, name, surname, phone_number, two_factor_enabled, created_at, updated_at
       FROM users
       WHERE id = $1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      throw ApiError.notFound("Utilizatorul nu a fost găsit.");
    }

    const user = userResult.rows[0];

    // Obținere statistici despre fișierele utilizatorului
    const fileStatsResult = await db.query(
      `SELECT COUNT(*) as file_count, SUM(size_bytes) as total_size
       FROM files
       WHERE user_id = $1`,
      [userId]
    );

    // Adăugare statistici la obiectul utilizator
    user.fileCount = parseInt(fileStatsResult.rows[0].file_count) || 0;
    user.totalStorage = parseInt(fileStatsResult.rows[0].total_size) || 0;
    user.totalStorageFormatted = formatBytes(user.totalStorage);

    // Obținere ultimele 5 fișiere
    const recentFilesResult = await db.query(
      `SELECT id, original_name, mime_type, size_bytes, created_at
       FROM files
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 5`,
      [userId]
    );

    user.recentFiles = recentFilesResult.rows;

    res.status(200).json(user);
  } catch (error) {
    next(error);
  }
};

/**
 * Ștergere utilizator și toate fișierele sale
 */
const deleteUser = async (req, res, next) => {
  try {
    const userId = req.params.id;
    const db = req.app.locals.db;

    // Verificăm dacă utilizatorul există
    const userExists = await db.query("SELECT id FROM users WHERE id = $1", [
      userId,
    ]);

    if (userExists.rows.length === 0) {
      throw ApiError.notFound("Utilizatorul nu a fost găsit.");
    }

    // Obținem toate fișierele utilizatorului
    const filesResult = await db.query(
      "SELECT id FROM files WHERE user_id = $1",
      [userId]
    );
    await db.query("BEGIN");

    try {
      // Pentru fiecare fișier, se șterg fragmentele asociate
      for (const file of filesResult.rows) {
        const fileId = file.id;

        // Obținere fragmente fișier
        const fragmentsResult = await db.query(
          "SELECT container_id, fragment_name FROM fragments WHERE file_id = $1",
          [fileId]
        );

        // Ștergere fragmente din containere
        for (const fragment of fragmentsResult.rows) {
          try {
            await containerService.deleteFragmentWithStorageUpdate(
              fragment.container_id,
              fragment.fragment_name
            );
          } catch (error) {
            console.error(`Eroare la ștergerea fragmentului:`, error);
          }
        }

        // Ștergere fragmente din baza de date
        await db.query("DELETE FROM fragments WHERE file_id = $1", [fileId]);
      }

      // Ștergem toate fișierele utilizatorului + utilizatorul
      await db.query("DELETE FROM files WHERE user_id = $1", [userId]);
      await db.query("DELETE FROM users WHERE id = $1", [userId]);

      await db.query("COMMIT");

      res.status(200).json({
        message: "Utilizatorul și toate datele sale au fost șterse cu succes.",
      });
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    }
  } catch (error) {
    next(error);
  }
};

/**
 * Obține lista tuturor fișierelor din sistem
 */
const getAllFiles = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const db = req.app.locals.db;

    // Obține numărul total de fișiere
    const countResult = await db.query("SELECT COUNT(*) FROM files");
    const totalFiles = parseInt(countResult.rows[0].count);

    // Obține fișierele pentru pagina curentă, inclusiv informațiile despre utilizator
    const filesResult = await db.query(
      `SELECT f.id, f.original_name, f.mime_type, f.size_bytes, f.created_at,
              u.id as user_id, u.email as user_email, u.name as user_name, u.surname as user_surname
       FROM files f
       JOIN users u ON f.user_id = u.id
       ORDER BY f.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    // Obține numărul de fragmente pentru fiecare fișier
    const filesWithFragments = await Promise.all(
      filesResult.rows.map(async (file) => {
        const fragmentCountResult = await db.query(
          "SELECT COUNT(*) FROM fragments WHERE file_id = $1",
          [file.id]
        );

        return {
          ...file,
          fragments: parseInt(fragmentCountResult.rows[0].count),
          sizeFormatted: formatBytes(file.size_bytes),
        };
      })
    );

    // Calculează informații despre paginare
    const totalPages = Math.ceil(totalFiles / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.status(200).json({
      files: filesWithFragments,
      pagination: {
        currentPage: page,
        totalPages,
        limit,
        totalFiles,
        hasNextPage,
        hasPrevPage,
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
    const containerId = req.params.id;
    const containerExists = await containerService.containerExists(containerId);

    if (!containerExists) {
      throw ApiError.notFound("Containerul specificat nu a fost găsit.");
    }

    // Repornește containerul
    await containerService.restartContainer(containerId);

    res.status(200).json({
      message: `Containerul ${containerId} a fost repornit cu succes.`,
      containerId,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Obține statistici generale despre sistem
 */
const getSystemStats = async (req, res, next) => {
  try {
    const db = req.app.locals.db;

    // Obține statistici generale
    const [usersResult, filesResult, fragmentsResult, containerResult] =
      await Promise.all([
        db.query("SELECT COUNT(*) as total FROM users"),
        db.query(
          "SELECT COUNT(*) as total, SUM(size_bytes) as total_size FROM files"
        ),
        db.query("SELECT COUNT(*) as total FROM fragments"),
        containerService.getAllContainersStatus(),
      ]);

    const monthlyActivityResult = await db.query(`
      SELECT 
        TO_CHAR(created_at, 'YYYY-MM') as month,
        COUNT(*) as files_count,
        SUM(size_bytes) as total_size
      FROM files
      WHERE created_at > NOW() - INTERVAL '6 months'
      GROUP BY month
      ORDER BY month DESC
    `);

    // Calculeză tipurile de fișiere
    const fileTypesResult = await db.query(`
      SELECT 
        CASE 
          WHEN mime_type LIKE 'image/%' THEN 'Imagini'
          WHEN mime_type LIKE 'video/%' THEN 'Video'
          WHEN mime_type LIKE 'audio/%' THEN 'Audio'
          WHEN mime_type LIKE 'application/pdf' THEN 'PDF'
          WHEN mime_type LIKE 'application/msword' OR mime_type LIKE 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' THEN 'Documente Word'
          WHEN mime_type LIKE 'application/vnd.ms-excel' OR mime_type LIKE 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' THEN 'Foi de calcul'
          WHEN mime_type LIKE 'text/%' THEN 'Text'
          ELSE 'Altele'
        END as file_type,
        COUNT(*) as count,
        SUM(size_bytes) as total_size
      FROM files
      GROUP BY file_type
      ORDER BY count DESC
    `);

    // Formatează răspunsul
    const totalSize = parseInt(filesResult.rows[0].total_size) || 0;
    const totalContainerStorage = containerResult.length * 1073741824;

    const containerStorageResult = await db.query(
      "SELECT SUM(storage_used) as used_storage FROM containers"
    );
    const usedContainerStorage =
      parseInt(containerStorageResult.rows[0].used_storage) || 0;

    // Calculează procentul de utilizare total
    const totalStorageUsagePercent =
      totalContainerStorage > 0
        ? (usedContainerStorage / totalContainerStorage) * 100
        : 0;

    res.status(200).json({
      totalUsers: parseInt(usersResult.rows[0].total),
      totalFiles: parseInt(filesResult.rows[0].total),
      totalSizeFormatted: formatBytes(totalSize),
      activeContainers: containerResult.filter((c) => c.status === "active"),
      healthStatus: "Healthy",
      users: {
        total: parseInt(usersResult.rows[0].total),
      },
      files: {
        total: parseInt(filesResult.rows[0].total),
        totalSize,
        totalSizeFormatted: formatBytes(totalSize),
      },
      fragments: {
        total: parseInt(fragmentsResult.rows[0].total),
      },
      containers: {
        total: containerResult.length,
        active: containerResult.filter((c) => c.status === "active").length,
        inactive: containerResult.filter((c) => c.status !== "active").length,
      },
      storage: {
        totalCapacity: totalContainerStorage,
        totalCapacityFormatted: formatBytes(totalContainerStorage),
        usedStorage: usedContainerStorage,
        usedStorageFormatted: formatBytes(usedContainerStorage),
        availableStorage: totalContainerStorage - usedContainerStorage,
        availableStorageFormatted: formatBytes(
          totalContainerStorage - usedContainerStorage
        ),
        usagePercent: totalStorageUsagePercent,
      },
      monthlyActivity: monthlyActivityResult.rows.map((month) => ({
        month: month.month,
        count: parseInt(month.files_count),
        size: parseInt(month.total_size),
        sizeFormatted: formatBytes(month.total_size),
      })),
      fileTypes: fileTypesResult.rows.map((type) => ({
        type: type.file_type,
        count: parseInt(type.count),
        size: parseInt(type.total_size),
        sizeFormatted: formatBytes(type.total_size),
      })),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Reechilibrează distribuția fragmentelor între containere
 */
const rebalanceFragments = async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    // Obține starea curentă a containerelor
    const containers = await containerService.getAllContainersStatus();

    // Verifică dacă sunt suficiente containere active
    const activeContainers = containers.filter((c) => c.status === "active");

    if (activeContainers.length < 2) {
      throw ApiError.badRequest(
        "Sunt necesare cel puțin două containere active pentru reechilibrare."
      );
    }

    // Sortează containerele după numărul de fragmente (descrescător)
    activeContainers.sort((a, b) => b.fragmentCount - a.fragmentCount);

    // Calculează media de fragmente per container
    const totalFragments = activeContainers.reduce(
      (sum, c) => sum + c.fragmentCount,
      0
    );
    const avgFragmentsPerContainer = Math.ceil(
      totalFragments / activeContainers.length
    );

    // Identifică containerele supraîncărcate și subîncărcate
    const overloadedContainers = activeContainers.filter(
      (c) => c.fragmentCount > avgFragmentsPerContainer + 5
    );
    const underloadedContainers = activeContainers.filter(
      (c) => c.fragmentCount < avgFragmentsPerContainer - 5
    );

    if (overloadedContainers.length === 0) {
      return res.status(200).json({
        message:
          "Containerele sunt deja echilibrate. Nu este necesară reechilibrarea.",
        avgFragmentsPerContainer,
      });
    }

    // Inițializează contoarele pentru statistici
    let movedFragments = 0;
    const operationsLog = [];

    for (const sourceContainer of overloadedContainers) {
      // Calculează câte fragmente trebuie mutate
      const fragmentsToMove =
        sourceContainer.fragmentCount - avgFragmentsPerContainer;

      if (fragmentsToMove <= 0) continue;

      // Obține fragmentele de la containerul sursă
      const fragmentsResult = await db.query(
        `SELECT f.id, f.file_id, f.fragment_name, f.fragment_index, f.size_bytes, f.checksum
         FROM fragments f
         WHERE f.container_id = $1
         ORDER BY f.id DESC
         LIMIT $2`,
        [sourceContainer.id, fragmentsToMove]
      );

      const fragments = fragmentsResult.rows;

      // Mută fragmentele către containerele subîncărcate
      for (const fragment of fragments) {
        // Sortează containerele subîncărcate după numărul de fragmente crescător
        underloadedContainers.sort((a, b) => a.fragmentCount - b.fragmentCount);

        if (underloadedContainers.length === 0) break;

        const targetContainer = underloadedContainers[0];

        try {
          const fragmentContent = await containerService.retrieveFragment(
            sourceContainer.id,
            fragment.fragment_name
          );

          // Stochează fragmentul în containerul țintă
          await containerService.storeFragmentWithStorageUpdate(
            this.db,
            targetContainer.id,
            fragment.fragment_name,
            fragmentContent
          );

          // Actualizează baza de date
          await db.query(
            "UPDATE fragments SET container_id = $1 WHERE id = $2",
            [targetContainer.id, fragment.id]
          );

          // Șterge fragmentul din containerul sursă
          await containerService.deleteFragmentWithStorageUpdate(
            sourceContainer.id,
            fragment.fragment_name
          );

          sourceContainer.fragmentCount--;
          targetContainer.fragmentCount++;
          movedFragments++;

          operationsLog.push({
            fragmentId: fragment.id,
            sourceContainer: sourceContainer.id,
            targetContainer: targetContainer.id,
          });
        } catch (error) {
          console.error(
            `Eroare la mutarea fragmentului ${fragment.id}:`,
            error
          );
        }
      }
    }

    res.status(200).json({
      message: `Reechilibrare completă. ${movedFragments} fragmente au fost mutate.`,
      movedFragments,
      operationsPerformed: operationsLog.length,
      avgFragmentsPerContainer,
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
 * Obține raportul complet de storage pentru containere
 */
const getStorageReport = async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const report = await containerService.getStorageReport(db);

    res.status(200).json({
      success: true,
      data: report,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Rebalansează containerele
 */
const rebalanceContainers = async (req, res, next) => {
  return await rebalanceFragments(req, res, next);
};

module.exports = {
  getAllUsers,
  getUserById,
  deleteUser,
  getAllFiles,
  restartContainer,
  getSystemStats,
  rebalanceFragments,
  getStorageReport,
  rebalanceContainers,
};
