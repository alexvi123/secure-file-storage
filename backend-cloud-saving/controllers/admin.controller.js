const { ApiError } = require("../middlewares/error.middleware");
const containerService = require("../services/container.service");

/**
 * Obține lista tuturor utilizatorilor
 */
const getAllUsers = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const db = req.app.locals.db;

    // Obține numărul total de utilizatori
    const countResult = await db.query("SELECT COUNT(*) FROM users");
    const totalUsers = parseInt(countResult.rows[0].count);

    // Obține utilizatorii pentru pagina curentă
    const usersResult = await db.query(
      `SELECT id, email, name, surname, phone_number, two_factor_enabled, created_at, updated_at
       FROM users
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    // Calculează informații despre paginare
    const totalPages = Math.ceil(totalUsers / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.status(200).json({
      users: usersResult.rows,
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
    next(error);
  }
};

/**
 * Obține detalii despre un utilizator specific
 */
const getUserById = async (req, res, next) => {
  try {
    const userId = req.params.id;
    const db = req.app.locals.db;

    // Obține informațiile despre utilizator
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

    // Obține statistici despre fișierele utilizatorului
    const fileStatsResult = await db.query(
      `SELECT COUNT(*) as file_count, SUM(size_bytes) as total_size
       FROM files
       WHERE user_id = $1`,
      [userId]
    );

    // Adaugă statisticile la obiectul utilizator
    user.fileCount = parseInt(fileStatsResult.rows[0].file_count) || 0;
    user.totalStorage = parseInt(fileStatsResult.rows[0].total_size) || 0;
    user.totalStorageFormatted = formatBytes(user.totalStorage);

    // Obține ultimele 5 fișiere
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
 * Actualizează informațiile unui utilizator
 */
const updateUser = async (req, res, next) => {
  try {
    const userId = req.params.id;
    const { name, surname, phone_number, email } = req.body;
    const db = req.app.locals.db;

    // Verifică dacă utilizatorul există
    const userExists = await db.query("SELECT id FROM users WHERE id = $1", [
      userId,
    ]);

    if (userExists.rows.length === 0) {
      throw ApiError.notFound("Utilizatorul nu a fost găsit.");
    }

    // Construiește query-ul de actualizare
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

    if (email !== undefined) {
      // Verifică dacă email-ul este deja utilizat de alt utilizator
      const emailCheck = await db.query(
        "SELECT id FROM users WHERE email = $1 AND id != $2",
        [email, userId]
      );

      if (emailCheck.rows.length > 0) {
        throw ApiError.conflict(
          "Acest email este deja utilizat de alt utilizator."
        );
      }

      updateFields.push(`email = $${paramCounter++}`);
      values.push(email);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        message: "Niciun câmp furnizat pentru actualizare.",
      });
    }

    // Adaugă ID-ul utilizatorului ca ultimul parametru
    values.push(userId);

    // Actualizează utilizatorul
    const updateQuery = `
      UPDATE users 
      SET ${updateFields.join(", ")}, updated_at = NOW() 
      WHERE id = $${paramCounter} 
      RETURNING id, email, name, surname, phone_number, two_factor_enabled, updated_at
    `;

    const result = await db.query(updateQuery, values);

    res.status(200).json({
      message: "Utilizatorul a fost actualizat cu succes.",
      user: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Șterge un utilizator și toate fișierele sale
 */
const deleteUser = async (req, res, next) => {
  try {
    const userId = req.params.id;
    const db = req.app.locals.db;

    // Verifică dacă utilizatorul există
    const userExists = await db.query("SELECT id FROM users WHERE id = $1", [
      userId,
    ]);

    if (userExists.rows.length === 0) {
      throw ApiError.notFound("Utilizatorul nu a fost găsit.");
    }

    // Obține toate fișierele utilizatorului
    const filesResult = await db.query(
      "SELECT id FROM files WHERE user_id = $1",
      [userId]
    );

    // Începe tranzacția
    await db.query("BEGIN");

    try {
      // Pentru fiecare fișier, șterge fragmentele asociate
      for (const file of filesResult.rows) {
        const fileId = file.id;

        // Obține fragmentele fișierului
        const fragmentsResult = await db.query(
          "SELECT container_id, fragment_name FROM fragments WHERE file_id = $1",
          [fileId]
        );

        // Șterge fragmentele din containere
        for (const fragment of fragmentsResult.rows) {
          try {
            await containerService.deleteFragment(
              fragment.container_id,
              fragment.fragment_name
            );
          } catch (error) {
            console.error(`Eroare la ștergerea fragmentului:`, error);
            // Continuă cu celelalte ștergeri chiar dacă una eșuează
          }
        }

        // Șterge fragmentele din baza de date
        await db.query("DELETE FROM fragments WHERE file_id = $1", [fileId]);
      }

      // Șterge toate fișierele utilizatorului
      await db.query("DELETE FROM files WHERE user_id = $1", [userId]);

      // Șterge utilizatorul
      await db.query("DELETE FROM users WHERE id = $1", [userId]);

      // Comite tranzacția
      await db.query("COMMIT");

      res.status(200).json({
        message: "Utilizatorul și toate datele sale au fost șterse cu succes.",
      });
    } catch (error) {
      // Revine la starea anterioară în caz de eroare
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
 * Șterge un fișier și fragmentele sale (similar cu metoda din files.controller, dar fără verificarea proprietarului)
 */
const deleteFile = async (req, res, next) => {
  try {
    const fileId = req.params.id;
    const db = req.app.locals.db;

    // Verifică dacă fișierul există
    const fileResult = await db.query("SELECT id FROM files WHERE id = $1", [
      fileId,
    ]);

    if (fileResult.rows.length === 0) {
      throw ApiError.notFound("Fișierul nu a fost găsit.");
    }

    // Obține toate fragmentele fișierului
    const fragmentsResult = await db.query(
      "SELECT container_id, fragment_name FROM fragments WHERE file_id = $1",
      [fileId]
    );

    // Șterge fragmentele de pe containere
    await Promise.all(
      fragmentsResult.rows.map(async (fragment) => {
        try {
          await containerService.deleteFragment(
            fragment.container_id,
            fragment.fragment_name
          );
        } catch (error) {
          console.error(`Eroare la ștergerea fragmentului:`, error);
          // Continuă cu celelalte ștergeri chiar dacă una eșuează
        }
      })
    );

    // Începe tranzacția pentru ștergerea din baza de date
    await db.query("BEGIN");

    try {
      // Șterge fragmentele din baza de date
      await db.query("DELETE FROM fragments WHERE file_id = $1", [fileId]);

      // Șterge înregistrarea fișierului
      await db.query("DELETE FROM files WHERE id = $1", [fileId]);

      // Comite tranzacția
      await db.query("COMMIT");
    } catch (error) {
      // Revine la starea anterioară în caz de eroare
      await db.query("ROLLBACK");
      throw error;
    }

    res.status(200).json({
      message: "Fișierul și toate fragmentele sale au fost șterse cu succes.",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Obține starea tuturor containerelor de stocare
 */
const getContainersStatus = async (req, res, next) => {
  try {
    // Obține informații despre toate containerele
    const containers = await containerService.getAllContainersStatus();

    // Organizează datele pentru răspuns
    const formattedContainers = containers.map((container) => ({
      id: container.id,
      name: container.name,
      status: container.status,
      fragmentCount: container.fragmentCount,
      totalSize: container.totalSize,
      totalSizeFormatted: formatBytes(container.totalSize),
      health: container.health || "Unknown",
      lastChecked: container.lastChecked,
    }));

    res.status(200).json({
      containers: formattedContainers,
      totalContainers: formattedContainers.length,
      activeContainers: formattedContainers.filter((c) => c.status === "active")
        .length,
      totalFragments: formattedContainers.reduce(
        (sum, c) => sum + c.fragmentCount,
        0
      ),
      totalSize: formattedContainers.reduce((sum, c) => sum + c.totalSize, 0),
      totalSizeFormatted: formatBytes(
        formattedContainers.reduce((sum, c) => sum + c.totalSize, 0)
      ),
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

    // Verifică dacă containerul există
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

    // Calculează statistici lunare (activitate pe ultimele 6 luni)
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

    res.status(200).json({
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

    // Începe procesul de reechilibrare
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
        // Sortează containerele subîncărcate după numărul de fragmente (crescător)
        underloadedContainers.sort((a, b) => a.fragmentCount - b.fragmentCount);

        if (underloadedContainers.length === 0) break;

        const targetContainer = underloadedContainers[0];

        try {
          // Obține conținutul fragmentului de la containerul sursă
          const fragmentContent = await containerService.retrieveFragment(
            sourceContainer.id,
            fragment.fragment_name
          );

          // Stochează fragmentul în containerul țintă
          await containerService.storeFragment(
            targetContainer.id,
            fragment.fragment_name,
            fragmentContent
          );

          // Actualizează înregistrarea în baza de date
          await db.query(
            "UPDATE fragments SET container_id = $1 WHERE id = $2",
            [targetContainer.id, fragment.id]
          );

          // Șterge fragmentul din containerul sursă
          await containerService.deleteFragment(
            sourceContainer.id,
            fragment.fragment_name
          );

          // Actualizează contoarele
          sourceContainer.fragmentCount--;
          targetContainer.fragmentCount++;
          movedFragments++;

          // Adaugă operația la log
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
          // Continuă cu celelalte fragmente
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

module.exports = {
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  getAllFiles,
  deleteFile,
  getContainersStatus,
  restartContainer,
  getSystemStats,
  rebalanceFragments,
};
