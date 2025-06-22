const path = require("path");
const fs = require("fs");
const { promisify } = require("util");
const crypto = require("crypto");
const { ApiError } = require("../middlewares/error.middleware");
const fileProcessorService = require("./file-processor.service");
const containerService = require("./container.service");

const readFileAsync = promisify(fs.readFile);
const writeFileAsync = promisify(fs.writeFile);
const unlinkAsync = promisify(fs.unlink);
const statAsync = promisify(fs.stat);
const mkdirAsync = promisify(fs.mkdir);

/**
 * Service pentru gestionarea stocării fișierelor
 */
class StorageService {
  constructor(db) {
    this.db = db;
    this.File = require("../models/file.model");
    this.Fragment = require("../models/fragment.model");

    this.fileModel = new this.File(db);
    this.fragmentModel = new this.Fragment(db);

    // Directoarele pentru stocare temporară și log-uri
    this.tempDir = path.join(__dirname, "../uploads/temp");
    this.logsDir = path.join(__dirname, "../logs");

    this.ensureDirectoriesExist();
  }

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
      const fileBuffer = await readFileAsync(fileInfo.path);

      // Calculează hash pentru fișier pentru verificări de duplicare
      const fileHash = crypto
        .createHash("sha256")
        .update(fileBuffer)
        .digest("hex");

      // Numără containerele disponibile
      const numContainers = await containerService.getContainerCount();
      if (numContainers === 0) {
        throw new Error("Nu sunt disponibile containere de stocare.");
      }

      // Pregătește datele fișierului pentru baza de date
      const fileData = {
        user_id: userId,
        filename: fileHash,
        original_name: fileInfo.originalName,
        mime_type: fileInfo.mimeType,
        size_bytes: fileInfo.size,
      };
      await this.db.query("BEGIN");

      try {
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

            // Calculează un checksum pentru fragment pentru verificarea integrității
            const fragmentChecksum = crypto
              .createHash("md5")
              .update(fragment)
              .digest("hex");

            // Trimite fragmentul la container
            await containerService.storeFragmentWithStorageUpdate(
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
        await this.db.query("ROLLBACK");
        throw error;
      }
    } catch (error) {
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
   * @param {number} userId - ID-ul utilizatorului pentru verificarea proprietății
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
          }
        })
      );

      // Șterge înregistrările fragmentelor din baza de date
      await this.fragmentModel.deleteByFileId(fileId);

      // Șterge înregistrarea fișierului
      await this.fileModel.delete(fileId, userId);
      await this.db.query("COMMIT");

      return true;
    } catch (error) {
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
}

module.exports = StorageService;
