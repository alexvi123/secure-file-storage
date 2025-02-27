const path = require("path");
const fs = require("fs");
const { promisify } = require("util");
const crypto = require("crypto");
const { ApiError } = require("../middlewares/error.middleware");
const fileProcessorService = require("./file-processor.service");
const containerService = require("./container.service");

// Promisificarea funcțiilor fs
const readFileAsync = promisify(fs.readFile);
const writeFileAsync = promisify(fs.writeFile);
const unlinkAsync = promisify(fs.unlink);
const statAsync = promisify(fs.stat);
const mkdirAsync = promisify(fs.mkdir);

/**
 * Service pentru gestionarea stocării fișierelor
 */
class StorageService {
  /**
   * Inițializează serviciul de stocare
   * @param {Object} db - Conexiunea la baza de date
   */
  constructor(db) {
    this.db = db;
    this.File = require("../models/file.model");
    this.Fragment = require("../models/fragment.model");

    this.fileModel = new this.File(db);
    this.fragmentModel = new this.Fragment(db);

    // Directoarele pentru stocare temporară și log-uri
    this.tempDir = path.join(__dirname, "../uploads/temp");
    this.logsDir = path.join(__dirname, "../logs");

    // Asigură-te că directoarele necesare există
    this.ensureDirectoriesExist();
  }

  /**
   * Asigură că directoarele necesare există
   */
  async ensureDirectoriesExist() {
    try {
      if (!fs.existsSync(this.tempDir)) {
        await mkdirAsync(this.tempDir, { recursive: true });
      }
      if (!fs.existsSync(this.logsDir)) {
        await mkdirAsync(this.logsDir, { recursive: true });
      }
    } catch (error) {
      console.error("Eroare la crearea directoarelor:", error);
    }
  }

  /**
   * Procesează și stochează un fișier încărcat
   * @param {Object} fileInfo - Informații despre fișier
   * @param {number} userId - ID-ul utilizatorului
   * @returns {Promise<Object>} Informații despre fișierul stocat
   */
  async storeFile(fileInfo, userId) {
    try {
      // Citește fișierul
      const fileBuffer = await readFileAsync(fileInfo.path);

      // Calculează hash pentru fișier (pentru verificări de duplicare)
      const fileHash = crypto
        .createHash("sha256")
        .update(fileBuffer)
        .digest("hex");

      // Numără containerele disponibile
      const numContainers = await containerService.getContainerCount();
      if (numContainers === 0) {
        throw new Error("Nu sunt disponibile containere de stocare.");
      }

      // Prepară datele fișierului pentru baza de date
      const fileData = {
        user_id: userId,
        filename: fileHash,
        original_name: fileInfo.originalName,
        mime_type: fileInfo.mimeType,
        size_bytes: fileInfo.size,
      };

      // Începe tranzacția
      await this.db.query("BEGIN");

      try {
        // Stochează metadatele fișierului în baza de date
        const file = await this.fileModel.create(fileData);

        // Fragmentează fișierul
        const fragments = fileProcessorService.splitFile(
          fileBuffer,
          numContainers
        );

        // Stochează fragmentele și metadatele lor
        await Promise.all(
          fragments.map(async (fragment, index) => {
            // Alege un container aleatoriu
            const containerId = await containerService.getRandomContainerId();

            // Generează un nume unic pentru fragment
            const fragmentName = `${fileHash}_${index}_${Date.now()}`;

            // Calculează un checksum pentru fragment (pentru verificarea integrității)
            const fragmentChecksum = crypto
              .createHash("md5")
              .update(fragment)
              .digest("hex");

            // Trimite fragmentul la container
            await containerService.storeFragment(
              containerId,
              fragmentName,
              fragment
            );

            // Înregistrează fragmentul în baza de date
            await this.fragmentModel.create({
              file_id: file.id,
              fragment_index: index,
              container_id: containerId,
              fragment_name: fragmentName,
              size_bytes: fragment.length,
              checksum: fragmentChecksum,
            });
          })
        );

        // Comite tranzacția
        await this.db.query("COMMIT");

        // Șterge fișierul temporar
        await unlinkAsync(fileInfo.path);

        return {
          id: file.id,
          name: file.original_name,
          size: file.size_bytes,
          fragmentCount: fragments.length,
        };
      } catch (error) {
        // Anulează tranzacția în caz de eroare
        await this.db.query("ROLLBACK");
        throw error;
      }
    } catch (error) {
      // Asigură-te că fișierul temporar este șters în caz de eroare
      try {
        if (fileInfo.path && fs.existsSync(fileInfo.path)) {
          await unlinkAsync(fileInfo.path);
        }
      } catch (unlinkError) {
        console.error("Eroare la ștergerea fișierului temporar:", unlinkError);
      }

      throw error;
    }
  }

  /**
   * Recuperează un fișier
   * @param {number} fileId - ID-ul fișierului
   * @param {number} userId - ID-ul utilizatorului (pentru verificarea proprietății)
   * @returns {Promise<Object>} Fișierul recuperat și metadatele sale
   */
  async retrieveFile(fileId, userId) {
    // Verifică dacă fișierul există și aparține utilizatorului
    const file = await this.fileModel.findById(fileId, userId);
    if (!file) {
      throw ApiError.notFound(
        "Fișierul nu a fost găsit sau nu aveți permisiunea de a-l accesa."
      );
    }

    // Obține toate fragmentele fișierului
    const fragments = await this.fragmentModel.findByFileId(fileId);
    if (fragments.length === 0) {
      throw ApiError.notFound(
        "Nu au fost găsite fragmente pentru acest fișier."
      );
    }

    // Recuperează fragmentele de la containere
    const fragmentBuffers = await Promise.all(
      fragments.map(async (fragment) => {
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
          throw new Error(
            `Integritatea fragmentului ${fragment.id} este compromisă.`
          );
        }

        return {
          index: fragment.fragment_index,
          data: fragmentBuffer,
        };
      })
    );

    // Sortează fragmentele după index
    fragmentBuffers.sort((a, b) => a.index - b.index);

    // Reasamblează fișierul
    const fileBuffer = fileProcessorService.reassembleFile(
      fragmentBuffers.map((f) => f.data)
    );

    return {
      buffer: fileBuffer,
      metadata: {
        id: file.id,
        name: file.original_name,
        mimeType: file.mime_type,
        size: file.size_bytes,
      },
    };
  }

  /**
   * Șterge un fișier
   * @param {number} fileId - ID-ul fișierului
   * @param {number} userId - ID-ul utilizatorului (pentru verificarea proprietății)
   * @returns {Promise<boolean>} Succes
   */
  async deleteFile(fileId, userId) {
    // Verifică dacă fișierul există și aparține utilizatorului
    const file = await this.fileModel.findById(fileId, userId);
    if (!file) {
      throw ApiError.notFound(
        "Fișierul nu a fost găsit sau nu aveți permisiunea de a-l șterge."
      );
    }

    // Obține toate fragmentele fișierului
    const fragments = await this.fragmentModel.findByFileId(fileId);

    // Începe tranzacția
    await this.db.query("BEGIN");

    try {
      // Șterge fragmentele din containere
      await Promise.all(
        fragments.map(async (fragment) => {
          try {
            await containerService.deleteFragment(
              fragment.container_id,
              fragment.fragment_name
            );
          } catch (error) {
            console.error(
              `Eroare la ștergerea fragmentului ${fragment.id}:`,
              error
            );
            // Continuă cu celelalte ștergeri chiar dacă una eșuează
          }
        })
      );

      // Șterge înregistrările fragmentelor din baza de date
      await this.fragmentModel.deleteByFileId(fileId);

      // Șterge înregistrarea fișierului
      await this.fileModel.delete(fileId, userId);

      // Comite tranzacția
      await this.db.query("COMMIT");

      return true;
    } catch (error) {
      // Anulează tranzacția în caz de eroare
      await this.db.query("ROLLBACK");
      throw error;
    }
  }

  /**
   * Verifică dacă un utilizator are suficient spațiu disponibil
   * @param {number} userId - ID-ul utilizatorului
   * @param {number} requiredSpace - Spațiul necesar în bytes
   * @returns {Promise<boolean>} True dacă există suficient spațiu
   */
  async hasEnoughStorageSpace(userId, requiredSpace) {
    // Obține limita de stocare a utilizatorului și spațiul utilizat
    const storageLimit =
      process.env.USER_STORAGE_LIMIT || 10 * 1024 * 1024 * 1024; // 10GB implicit
    const usedSpace = await this.fileModel.totalSizeByUserId(userId);

    return usedSpace + requiredSpace <= storageLimit;
  }

  /**
   * Obține informații despre spațiul de stocare al unui utilizator
   * @param {number} userId - ID-ul utilizatorului
   * @returns {Promise<Object>} Informații despre stocare
   */
  async getUserStorageInfo(userId) {
    const storageLimit =
      process.env.USER_STORAGE_LIMIT || 10 * 1024 * 1024 * 1024; // 10GB implicit
    const usedSpace = await this.fileModel.totalSizeByUserId(userId);
    const fileCount = await this.fileModel.countByUserId(userId);

    return {
      totalSpace: storageLimit,
      usedSpace,
      availableSpace: storageLimit - usedSpace,
      usedPercentage: (usedSpace / storageLimit) * 100,
      fileCount,
    };
  }

  /**
   * Redenumește un fișier
   * @param {number} fileId - ID-ul fișierului
   * @param {number} userId - ID-ul utilizatorului
   * @param {string} newName - Noul nume al fișierului
   * @returns {Promise<Object>} Fișierul actualizat
   */
  async renameFile(fileId, userId, newName) {
    // Actualizează numele fișierului
    const updatedFile = await this.fileModel.update(fileId, userId, {
      original_name: newName,
    });

    if (!updatedFile) {
      throw ApiError.notFound(
        "Fișierul nu a fost găsit sau nu aveți permisiunea de a-l modifica."
      );
    }

    return updatedFile;
  }

  /**
   * Caută fișiere ale unui utilizator
   * @param {number} userId - ID-ul utilizatorului
   * @param {string} searchTerm - Termenul de căutare
   * @param {number} page - Pagina curentă
   * @param {number} limit - Numărul de rezultate per pagină
   * @returns {Promise<Object>} Rezultatele căutării cu informații de paginare
   */
  async searchUserFiles(userId, searchTerm, page = 1, limit = 10) {
    const offset = (page - 1) * limit;

    // Caută fișierele
    const files = await this.fileModel.search(
      userId,
      searchTerm,
      limit,
      offset
    );

    // Numără rezultatele totale
    const totalFiles = await this.fileModel.countSearch(userId, searchTerm);

    // Calculează informații despre paginare
    const totalPages = Math.ceil(totalFiles / limit);

    return {
      files,
      pagination: {
        currentPage: page,
        totalPages,
        totalFiles,
        limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  /**
   * Verifică integritatea unui fișier
   * @param {number} fileId - ID-ul fișierului
   * @param {number} userId - ID-ul utilizatorului
   * @returns {Promise<Object>} Rezultatul verificării
   */
  async verifyFileIntegrity(fileId, userId) {
    // Verifică dacă fișierul există și aparține utilizatorului
    const file = await this.fileModel.findById(fileId, userId);
    if (!file) {
      throw ApiError.notFound(
        "Fișierul nu a fost găsit sau nu aveți permisiunea de a-l accesa."
      );
    }

    // Obține toate fragmentele fișierului
    const fragments = await this.fragmentModel.findByFileId(fileId);
    if (fragments.length === 0) {
      throw ApiError.notFound(
        "Nu au fost găsite fragmente pentru acest fișier."
      );
    }

    // Verifică fragmentele
    const fragmentChecks = await Promise.all(
      fragments.map(async (fragment) => {
        try {
          // Încearcă să recupereze fragmentul
          const fragmentBuffer = await containerService.retrieveFragment(
            fragment.container_id,
            fragment.fragment_name
          );

          // Calculează și verifică checksum-ul
          const fragmentChecksum = crypto
            .createHash("md5")
            .update(fragmentBuffer)
            .digest("hex");

          const isIntegrityOk = fragmentChecksum === fragment.checksum;

          return {
            fragmentId: fragment.id,
            fragmentIndex: fragment.fragment_index,
            containerId: fragment.container_id,
            isIntegrityOk,
            isAccessible: true,
          };
        } catch (error) {
          return {
            fragmentId: fragment.id,
            fragmentIndex: fragment.fragment_index,
            containerId: fragment.container_id,
            isIntegrityOk: false,
            isAccessible: false,
            error: error.message,
          };
        }
      })
    );

    // Analizează rezultatele
    const corruptedFragments = fragmentChecks.filter((f) => !f.isIntegrityOk);
    const inaccessibleFragments = fragmentChecks.filter((f) => !f.isAccessible);

    return {
      fileId,
      fileName: file.original_name,
      totalFragments: fragments.length,
      integrityStatus:
        corruptedFragments.length === 0 && inaccessibleFragments.length === 0
          ? "ok"
          : "compromised",
      corruptedFragmentsCount: corruptedFragments.length,
      inaccessibleFragmentsCount: inaccessibleFragments.length,
      fragmentDetails: fragmentChecks,
    };
  }

  /**
   * Repară un fișier cu fragmente corupte sau inaccesibile
   * @param {number} fileId - ID-ul fișierului
   * @param {number} userId - ID-ul utilizatorului
   * @returns {Promise<Object>} Rezultatul reparării
   */
  async repairFile(fileId, userId) {
    // Verifică întâi integritatea fișierului
    const integrityCheck = await this.verifyFileIntegrity(fileId, userId);

    // Dacă totul este în regulă, nu este nevoie de reparații
    if (integrityCheck.integrityStatus === "ok") {
      return {
        fileId,
        fileName: integrityCheck.fileName,
        status: "no_repair_needed",
        message: "Fișierul este intact și nu necesită reparații.",
      };
    }

    // Identifică fragmentele care necesită reparații
    const fragmentsToRepair = integrityCheck.fragmentDetails.filter(
      (f) => !f.isIntegrityOk || !f.isAccessible
    );

    // Dacă prea multe fragmente sunt compromise, fișierul nu poate fi reparat
    if (fragmentsToRepair.length > integrityCheck.totalFragments / 2) {
      return {
        fileId,
        fileName: integrityCheck.fileName,
        status: "beyond_repair",
        message:
          "Prea multe fragmente sunt compromise. Fișierul nu poate fi reparat.",
      };
    }

    // Încearcă să recuperezi fișierul cu fragmentele disponibile
    try {
      // Obține toate fragmentele disponibile
      const fragments = await this.fragmentModel.findByFileId(fileId);
      const goodFragments = [];

      for (const fragment of fragments) {
        // Verifică dacă fragmentul este în lista celor de reparat
        const needsRepair = fragmentsToRepair.some(
          (f) => f.fragmentId === fragment.id
        );

        if (!needsRepair) {
          try {
            // Recuperează fragmentul
            const fragmentBuffer = await containerService.retrieveFragment(
              fragment.container_id,
              fragment.fragment_name
            );

            // Verifică integritatea
            const fragmentChecksum = crypto
              .createHash("md5")
              .update(fragmentBuffer)
              .digest("hex");

            if (fragmentChecksum === fragment.checksum) {
              goodFragments.push({
                index: fragment.fragment_index,
                data: fragmentBuffer,
              });
            }
          } catch (error) {
            console.error(
              `Eroare la recuperarea fragmentului ${fragment.id}:`,
              error
            );
          }
        }
      }

      // Dacă nu sunt suficiente fragmente bune, nu putem repara
      if (goodFragments.length < integrityCheck.totalFragments / 2) {
        return {
          fileId,
          fileName: integrityCheck.fileName,
          status: "beyond_repair",
          message: "Nu sunt suficiente fragmente intacte pentru reparare.",
        };
      }

      // Începe tranzacția
      await this.db.query("BEGIN");

      try {
        // Pentru fiecare fragment compromis
        for (const badFragment of fragmentsToRepair) {
          // Alege un container nou
          const newContainerId = await containerService.getRandomContainerId();

          // Obține metadatele fragmentului
          const fragmentData = fragments.find(
            (f) => f.id === badFragment.fragmentId
          );

          if (fragmentData) {
            // Găsește fragmentele adiacente pentru reconstrucție (dacă este posibil)
            // Acest pas ar necesita un algoritm de reconstrucție mai complex
            // Pentru simplitate, doar relocăm fragmentul într-un container nou

            // Actualizează containerul în baza de date
            await this.db.query(
              "UPDATE fragments SET container_id = $1 WHERE id = $2",
              [newContainerId, badFragment.fragmentId]
            );

            // Notează reparația în log
            console.log(
              `Fragment ${badFragment.fragmentId} mutat la containerul ${newContainerId} pentru reparare`
            );
          }
        }

        // Comite tranzacția
        await this.db.query("COMMIT");

        return {
          fileId,
          fileName: integrityCheck.fileName,
          status: "partially_repaired",
          message:
            "Fișierul a fost parțial reparat. Unele fragmente au fost relocate.",
          repairedFragments: fragmentsToRepair.length,
        };
      } catch (error) {
        // Anulează tranzacția în caz de eroare
        await this.db.query("ROLLBACK");
        throw error;
      }
    } catch (error) {
      console.error(`Eroare la repararea fișierului ${fileId}:`, error);
      throw ApiError.internalError(
        `Nu s-a putut repara fișierul: ${error.message}`
      );
    }
  }

  /**
   * Obține statistici despre stocarea fragmentelor
   * @returns {Promise<Object>} Statistici despre stocare
   */
  async getStorageStatistics() {
    // Obține distribuția fragmentelor pe containere
    const containerDistribution =
      await this.fragmentModel.getContainerDistribution();

    // Obține informații despre containere
    const containers = await containerService.getAllContainersStatus();

    // Combină informațiile
    const containerStats = containers.map((container) => {
      const distribution = containerDistribution.find(
        (d) => parseInt(d.container_id) === container.id
      );

      return {
        id: container.id,
        name: container.name,
        status: container.status,
        fragmentCount: distribution ? parseInt(distribution.fragment_count) : 0,
        totalSize: distribution ? parseInt(distribution.total_size || 0) : 0,
        health: container.health || "unknown",
      };
    });

    // Calculează statistici generale
    const totalFragments = containerStats.reduce(
      (sum, container) => sum + container.fragmentCount,
      0
    );
    const totalSize = containerStats.reduce(
      (sum, container) => sum + container.totalSize,
      0
    );
    const activeContainers = containerStats.filter(
      (c) => c.status === "active"
    ).length;
    const avgFragmentsPerContainer = Math.round(
      totalFragments / (activeContainers || 1)
    );

    return {
      containers: containerStats,
      summary: {
        totalContainers: containers.length,
        activeContainers,
        totalFragments,
        totalSize,
        avgFragmentsPerContainer,
      },
    };
  }
}

module.exports = StorageService;
