const fs = require("fs");
const path = require("path");
const { promisify } = require("util");
const axios = require("axios");
const crypto = require("crypto");
const { ApiError } = require("../middlewares/error.middleware");
const { cleanupTempFiles } = require("../middlewares/upload.middleware");
const fileProcessorService = require("../services/file-processor.service");
const containerService = require("../services/container.service");

// Promisificarea funcțiilor fs
const unlinkAsync = promisify(fs.unlink);
const readFileAsync = promisify(fs.readFile);

/**
 * Încarcă un fișier, îl fragmentează și îl distribuie în containere
 */
const uploadFile = async (req, res, next) => {
  let filePath = null;

  try {
    // Verifică dacă a fost încărcat un fișier
    if (!req.file) {
      throw ApiError.badRequest("Niciun fișier furnizat.");
    }

    filePath = req.file.path;
    const userId = req.user.id;
    const db = req.app.locals.db;

    // Citește fișierul
    const fileBuffer = await readFileAsync(filePath);

    // Generează un hash pentru fișier (pentru integritate și verificări de duplicare)
    const fileHash = crypto
      .createHash("sha256")
      .update(fileBuffer)
      .digest("hex");

    // Fragmente numărul de containere disponibile
    const numContainers = await containerService.getContainerCount();
    if (numContainers === 0) {
      throw ApiError.internalError(
        "Nu sunt disponibile containere de stocare."
      );
    }

    // Fragmentează fișierul
    const fragments = fileProcessorService.splitFile(fileBuffer, numContainers);

    // Stochează metadatele fișierului în baza de date
    const fileResult = await db.query(
      `INSERT INTO files 
       (user_id, filename, original_name, mime_type, size_bytes) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING id`,
      [
        userId,
        fileHash,
        req.file.originalname,
        req.file.mimetype,
        req.file.size,
      ]
    );

    const fileId = fileResult.rows[0].id;

    // Distribuie fragmentele în containere
    const fragmentPromises = fragments.map(async (fragment, index) => {
      // Alege un container aleatoriu
      const containerId = await containerService.getRandomContainerId();

      // Generează un nume unic pentru fragment
      const fragmentName = `${fileHash}_${index}_${Date.now()}`;

      // Calculează un checksum pentru fragment
      const fragmentChecksum = crypto
        .createHash("md5")
        .update(fragment)
        .digest("hex");

      // Trimite fragmentul la containerul ales
      await containerService.storeFragment(containerId, fragmentName, fragment);

      // Stochează informația despre fragment în baza de date
      await db.query(
        `INSERT INTO fragments
         (file_id, fragment_index, container_id, fragment_name, size_bytes, checksum)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          fileId,
          index,
          containerId,
          fragmentName,
          fragment.length,
          fragmentChecksum,
        ]
      );

      return {
        index,
        containerId,
        size: fragment.length,
      };
    });

    // Așteaptă finalizarea tuturor operațiunilor de stocare a fragmentelor
    await Promise.all(fragmentPromises);

    // Returnează răspunsul de succes
    res.status(201).json({
      message: "Fișierul a fost încărcat și fragmentat cu succes.",
      fileId,
      fileName: req.file.originalname,
      size: req.file.size,
      fragments: fragments.length,
    });
  } catch (error) {
    next(error);
  } finally {
    // Curățare fișier temporar după procesare
    if (filePath) {
      cleanupTempFiles(filePath);
    }
  }
};

/**
 * Obține lista de fișiere ale utilizatorului
 */
const getUserFiles = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const db = req.app.locals.db;

    // Obține numărul total de fișiere
    const countResult = await db.query(
      "SELECT COUNT(*) FROM files WHERE user_id = $1",
      [userId]
    );
    const totalFiles = parseInt(countResult.rows[0].count);

    // Obține fișierele pentru pagina curentă
    const filesResult = await db.query(
      `SELECT id, original_name, mime_type, size_bytes, created_at
       FROM files
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    // Calculează informații despre paginare
    const totalPages = Math.ceil(totalFiles / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.status(200).json({
      files: filesResult.rows,
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
 * Obține metadatele unui fișier specific
 */
const getFileById = async (req, res, next) => {
  try {
    const fileId = req.params.id;
    const userId = req.user.id;
    const db = req.app.locals.db;

    // Obține metadatele fișierului
    const fileResult = await db.query(
      `SELECT id, original_name, mime_type, size_bytes, created_at
       FROM files
       WHERE id = $1 AND user_id = $2`,
      [fileId, userId]
    );

    if (fileResult.rows.length === 0) {
      throw ApiError.notFound(
        "Fișierul nu a fost găsit sau nu aveți permisiunea de a-l accesa."
      );
    }

    // Obține informații despre fragmente
    const fragmentsResult = await db.query(
      `SELECT COUNT(*) as fragment_count
       FROM fragments
       WHERE file_id = $1`,
      [fileId]
    );

    const file = fileResult.rows[0];
    file.fragments = parseInt(fragmentsResult.rows[0].fragment_count);

    res.status(200).json(file);
  } catch (error) {
    next(error);
  }
};

/**
 * Descarcă un fișier asamblat din fragmente
 */
const downloadFile = async (req, res, next) => {
  try {
    const fileId = req.params.id;
    const userId = req.user.id;
    const db = req.app.locals.db;

    // Verifică dacă fișierul există și aparține utilizatorului
    const fileResult = await db.query(
      `SELECT original_name, mime_type
       FROM files
       WHERE id = $1 AND user_id = $2`,
      [fileId, userId]
    );

    if (fileResult.rows.length === 0) {
      throw ApiError.notFound(
        "Fișierul nu a fost găsit sau nu aveți permisiunea de a-l accesa."
      );
    }

    const file = fileResult.rows[0];

    // Obține toate fragmentele fișierului, ordonate după index
    const fragmentsResult = await db.query(
      `SELECT f.fragment_index, f.container_id, f.fragment_name, f.checksum
       FROM fragments f
       WHERE f.file_id = $1
       ORDER BY f.fragment_index`,
      [fileId]
    );

    if (fragmentsResult.rows.length === 0) {
      throw ApiError.notFound(
        "Nu au fost găsite fragmente pentru acest fișier."
      );
    }

    // Recuperează fragmentele de la containere
    const fragmentBuffers = await Promise.all(
      fragmentsResult.rows.map(async (fragment) => {
        const fragmentBuffer = await containerService.retrieveFragment(
          fragment.container_id,
          fragment.fragment_name
        );

        // Verifică integritatea fragmentului
        const fragmentChecksum = crypto
          .createHash("md5")
          .update(fragmentBuffer)
          .digest("hex");

        if (fragmentChecksum !== fragment.checksum) {
          throw ApiError.internalError(
            `Integritatea fragmentului ${fragment.fragment_index} este compromisă.`
          );
        }

        return {
          index: fragment.fragment_index,
          data: fragmentBuffer,
        };
      })
    );

    // Sortează fragmentele după index (pentru a ne asigura că sunt în ordinea corectă)
    fragmentBuffers.sort((a, b) => a.index - b.index);

    // Reasamblează fișierul din fragmente
    const completeFile = fileProcessorService.reassembleFile(
      fragmentBuffers.map((f) => f.data)
    );

    // Setează headere pentru descărcare
    res.setHeader("Content-Type", file.mime_type);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(file.original_name)}"`
    );
    res.setHeader("Content-Length", completeFile.length);

    // Trimite fișierul
    res.send(completeFile);
  } catch (error) {
    next(error);
  }
};

/**
 * Șterge un fișier și toate fragmentele sale
 */
const deleteFile = async (req, res, next) => {
  try {
    const fileId = req.params.id;
    const userId = req.user.id;
    const db = req.app.locals.db;

    // Verifică dacă fișierul există și aparține utilizatorului
    const fileResult = await db.query(
      `SELECT id FROM files WHERE id = $1 AND user_id = $2`,
      [fileId, userId]
    );

    if (fileResult.rows.length === 0) {
      throw ApiError.notFound(
        "Fișierul nu a fost găsit sau nu aveți permisiunea de a-l șterge."
      );
    }

    // Obține toate fragmentele fișierului
    const fragmentsResult = await db.query(
      `SELECT container_id, fragment_name FROM fragments WHERE file_id = $1`,
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
          console.error(
            `Eroare la ștergerea fragmentului ${fragment.fragment_name}:`,
            error
          );
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
 * Actualizează metadatele unui fișier
 */
const updateFile = async (req, res, next) => {
  try {
    const fileId = req.params.id;
    const userId = req.user.id;
    const { newName } = req.body;
    const db = req.app.locals.db;

    if (!newName) {
      throw ApiError.badRequest("Numele nou al fișierului este obligatoriu.");
    }

    // Verifică dacă fișierul există și aparține utilizatorului
    const fileResult = await db.query(
      `SELECT id FROM files WHERE id = $1 AND user_id = $2`,
      [fileId, userId]
    );

    if (fileResult.rows.length === 0) {
      throw ApiError.notFound(
        "Fișierul nu a fost găsit sau nu aveți permisiunea de a-l modifica."
      );
    }

    // Actualizează numele original al fișierului
    await db.query(
      `UPDATE files SET original_name = $1, updated_at = NOW() WHERE id = $2`,
      [newName, fileId]
    );

    res.status(200).json({
      message: "Numele fișierului a fost actualizat cu succes.",
      fileId,
      newName,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Caută fișiere după nume sau alte criterii
 */
const searchFiles = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { query } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const db = req.app.locals.db;

    if (!query) {
      throw ApiError.badRequest("Termenul de căutare este obligatoriu.");
    }

    // Caută în numele originale ale fișierelor
    const searchTerm = `%${query}%`;

    // Obține numărul total de rezultate
    const countResult = await db.query(
      `SELECT COUNT(*) FROM files 
       WHERE user_id = $1 AND original_name ILIKE $2`,
      [userId, searchTerm]
    );
    const totalFiles = parseInt(countResult.rows[0].count);

    // Obține rezultatele pentru pagina curentă
    const filesResult = await db.query(
      `SELECT id, original_name, mime_type, size_bytes, created_at
       FROM files
       WHERE user_id = $1 AND original_name ILIKE $2
       ORDER BY created_at DESC
       LIMIT $3 OFFSET $4`,
      [userId, searchTerm, limit, offset]
    );

    // Calculează informații despre paginare
    const totalPages = Math.ceil(totalFiles / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.status(200).json({
      files: filesResult.rows,
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
 * Obține statistici despre fișierele utilizatorului
 */
const getUserStats = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const db = req.app.locals.db;

    // Obține statistici generale
    const statsResult = await db.query(
      `SELECT COUNT(*) as total_files, 
              SUM(size_bytes) as total_size,
              MAX(created_at) as last_upload
       FROM files
       WHERE user_id = $1`,
      [userId]
    );

    // Obține statistici pe tipuri de fișiere
    const typeStatsResult = await db.query(
      `SELECT 
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
       WHERE user_id = $1
       GROUP BY file_type
       ORDER BY count DESC`,
      [userId]
    );

    // Obține statistici lunare (ultimele 6 luni)
    const monthlyStatsResult = await db.query(
      `SELECT 
         TO_CHAR(created_at, 'YYYY-MM') as month,
         COUNT(*) as files_count,
         SUM(size_bytes) as total_size
       FROM files
       WHERE user_id = $1 AND created_at > NOW() - INTERVAL '6 months'
       GROUP BY month
       ORDER BY month DESC`,
      [userId]
    );

    const stats = statsResult.rows[0] || { total_files: 0, total_size: 0 };

    // Formatează statisticile
    const formattedStats = {
      totalFiles: parseInt(stats.total_files),
      totalSize: parseInt(stats.total_size || 0),
      totalSizeFormatted: formatBytes(stats.total_size || 0),
      lastUpload: stats.last_upload,
      fileTypes: typeStatsResult.rows.map((type) => ({
        type: type.file_type,
        count: parseInt(type.count),
        size: parseInt(type.total_size),
        sizeFormatted: formatBytes(type.total_size),
      })),
      monthlyActivity: monthlyStatsResult.rows.map((month) => ({
        month: month.month,
        count: parseInt(month.files_count),
        size: parseInt(month.total_size),
        sizeFormatted: formatBytes(month.total_size),
      })),
    };

    res.status(200).json(formattedStats);
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
  uploadFile,
  getUserFiles,
  getFileById,
  downloadFile,
  deleteFile,
  updateFile,
  searchFiles,
  getUserStats,
};
