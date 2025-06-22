const axios = require("axios");
const { promisify } = require("util");
const exec = promisify(require("child_process").exec);

/**
 * Service pentru gestionarea containerelor Docker și comunicarea cu acestea
 */

// Numărul de containere de stocare disponibile
const NUM_CONTAINERS = parseInt(process.env.NUM_STORAGE_CONTAINERS || "20");

// Prefixul pentru numele containerelor
const CONTAINER_PREFIX = process.env.CONTAINER_PREFIX || "storage-";

// Port-ul pe care rulează serviciile din containere
const CONTAINER_PORT = process.env.CONTAINER_PORT || "3000";

/**
 * Obține numărul total de containere disponibile
 * @returns {number} Numărul de containere
 */
const getContainerCount = async () => {
  try {
    return NUM_CONTAINERS;
  } catch (error) {
    console.error("Eroare la obținerea numărului de containere:", error);
    return 0;
  }
};

/**
 * Generează un ID aleatoriu de container
 * @returns {Promise<number>} ID-ul containerului
 */
const getRandomContainerId = async (db = null) => {
  if (db) {
    try {
      return await getBalancedContainerForFragment(db, 0); // 0 = orice dimensiune
    } catch (error) {
      console.error(
        "Eroare la distribuția echilibrată, folosesc random:",
        error
      );
    }
  }

  // Fallback la distribuția aleatorie
  const containerCount = await getContainerCount();
  if (containerCount === 0) {
    throw new Error("Nu există containere disponibile");
  }
  return Math.floor(Math.random() * containerCount) + 1;
};

/**
 * Construiește URL-ul pentru un container specific
 * @param {number} containerId - ID-ul containerului
 * @returns {string} URL-ul containerului
 */
const getContainerUrl = (containerId) => {
  return `http://${CONTAINER_PREFIX}${containerId}:${CONTAINER_PORT}`;
};

/**
 * Verifică dacă un container există
 * @param {number} containerId - ID-ul containerului
 * @returns {Promise<boolean>} True dacă containerul există
 */
const containerExists = async (containerId) => {
  try {
    if (isNaN(containerId) || containerId < 1 || containerId > NUM_CONTAINERS) {
      return false;
    }

    const containerName = `${CONTAINER_PREFIX}${containerId}`;

    if (process.env.NODE_ENV !== "production") {
      return true;
    }

    const { stdout } = await exec(
      `docker ps --filter "name=${containerName}" --format "{{.Names}}"`
    );
    return stdout.trim() === containerName;
  } catch (error) {
    console.error(
      `Eroare la verificarea existenței containerului ${containerId}:`,
      error
    );
    return false;
  }
};

/**
 * Stochează un fragment în containerul specificat
 * @param {number} containerId - ID-ul containerului
 * @param {string} fragmentName - Numele fragmentului
 * @param {Buffer} fragmentData - Datele fragmentului
 * @returns {Promise<Object>} Rezultatul operației
 */
const storeFragment = async (containerId, fragmentName, fragmentData) => {
  try {
    const containerUrl = getContainerUrl(containerId);

    const FormData = require("form-data");
    const form = new FormData();
    form.append("fragment", fragmentData, {
      filename: fragmentName,
      contentType: "application/octet-stream",
    });
    // Trimite cererea către container
    const response = await axios.post(`${containerUrl}/fragments`, form, {
      headers: {
        ...form.getHeaders(),
        "Content-Length": form.getLengthSync(),
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    return response.data;
  } catch (error) {
    console.error(
      `Eroare la stocarea fragmentului ${fragmentName} în containerul ${containerId}:`,
      error
    );
    throw new Error(`Nu s-a putut stoca fragmentul: ${error.message}`);
  }
};

/**
 * Recuperează un fragment din containerul specificat
 * @param {number} containerId - ID-ul containerului
 * @param {string} fragmentName - Numele fragmentului
 * @returns {Promise<Buffer>} Buffer-ul fragmentului
 */
const retrieveFragment = async (containerId, fragmentName) => {
  try {
    const containerUrl = getContainerUrl(containerId);

    // Trimite cererea către container
    const response = await axios.get(
      `${containerUrl}/fragments/${fragmentName}`,
      {
        responseType: "arraybuffer",
      }
    );

    return Buffer.from(response.data);
  } catch (error) {
    console.error(
      `Eroare la recuperarea fragmentului ${fragmentName} din containerul ${containerId}:`,
      error
    );
    throw new Error(`Nu s-a putut recupera fragmentul: ${error.message}`);
  }
};

/**
 * Șterge un fragment din containerul specificat
 * @param {number} containerId - ID-ul containerului
 * @param {string} fragmentName - Numele fragmentului
 * @returns {Promise<Object>} Rezultatul operației
 */
const deleteFragment = async (containerId, fragmentName) => {
  try {
    const containerUrl = getContainerUrl(containerId);

    // Trimite cererea către container
    const response = await axios.delete(
      `${containerUrl}/fragments/${fragmentName}`
    );

    return response.data;
  } catch (error) {
    console.error(
      `Eroare la ștergerea fragmentului ${fragmentName} din containerul ${containerId}:`,
      error
    );
    throw new Error(`Nu s-a putut șterge fragmentul: ${error.message}`);
  }
};

/**
 * Obține starea unui container specific
 * @param {number} containerId - ID-ul containerului
 * @returns {Promise<Object>} Informații despre starea containerului
 */
const getContainerStatus = async (containerId) => {
  try {
    if (isNaN(containerId) || containerId < 1 || containerId > NUM_CONTAINERS) {
      throw new Error(`Container ID ${containerId} invalid`);
    }
    const containerUrl = getContainerUrl(containerId);

    const response = await axios.get(`${containerUrl}/status`, {
      timeout: 2000,
    });

    return {
      id: containerId,
      name: `${CONTAINER_PREFIX}${containerId}`,
      status: "active",
      health: response.data.status || "healthy",
      fragmentCount: response.data.fragmentCount || 0,
      totalSize: response.data.totalSize || 0,
      lastChecked: new Date().toISOString(),
    };
  } catch (error) {
    // Dacă nu putem obține starea, considerăm containerul inactiv
    console.error(`Error for container ${containerId}:`, error.message);

    return {
      id: containerId,
      name: `${CONTAINER_PREFIX}${containerId}`,
      status: "inactive",
      health: "unhealthy",
      fragmentCount: 0,
      totalSize: 0,
      error: error.message,
      lastChecked: new Date().toISOString(),
    };
  }
};

/**
 * Obține starea tuturor containerelor
 * @returns {Promise<Array<Object>>} Array cu informații despre toate containerele
 */
const getAllContainersStatus = async () => {
  const containerCount = await getContainerCount();
  const statusPromises = [];

  for (let i = 1; i <= containerCount; i++) {
    statusPromises.push(getContainerStatus(i));
  }
  return Promise.all(statusPromises);
};

/**
 * Repornește un container specific
 * @param {number} containerId - ID-ul containerului
 * @returns {Promise<Object>} Rezultatul operației
 */
const restartContainer = async (containerId) => {
  try {
    if (!(await containerExists(containerId))) {
      throw new Error(`Containerul ${containerId} nu există`);
    }

    const containerName = `${CONTAINER_PREFIX}${containerId}`;

    if (process.env.NODE_ENV !== "production") {
      return {
        success: true,
        message: "Container repornit",
        containerId: containerId,
        containerName: containerName,
      };
    }

    const { stdout, stderr } = await exec(`docker restart ${containerName}`);

    return {
      success: true,
      message: `Containerul ${containerName} a fost repornit cu succes`,
      containerId: containerId,
      containerName: containerName,
      dockerOutput: stdout,
    };
  } catch (error) {
    throw new Error(`Nu s-a putut reporni containerul: ${error.message}`);
  }
};

const Container = require("../models/container.model");

/**
 * Actualizează statusul unui container în baza de date
 * @param {Object} db - Conexiunea la baza de date
 * @param {number} containerId - ID-ul containerului
 * @param {string} status - Noul status
 */
const updateContainerStatus = async (db, containerId, status) => {
  try {
    const containerModel = new Container(db);
    await containerModel.updateStatus(containerId, status);
  } catch (error) {
    console.error(
      `Eroare la actualizarea statusului containerului ${containerId}:`,
      error
    );
  }
};

/**
 * Actualizează last_check pentru un container
 * @param {Object} db - Conexiunea la baza de date
 * @param {number} containerId - ID-ul containerului
 */
const updateContainerLastCheck = async (db, containerId) => {
  try {
    const containerModel = new Container(db);
    await containerModel.updateLastCheck(containerId);
  } catch (error) {
    console.error(
      `Eroare la actualizarea last_check pentru containerul ${containerId}:`,
      error
    );
  }
};

/**
 * Verifică statusul unui container și actualizează în baza de date
 * @param {Object} db - Conexiunea la baza de date
 * @param {number} containerId - ID-ul containerului
 * @returns {Promise<Object>} Statusul containerului
 */
const checkAndUpdateContainerStatus = async (db, containerId) => {
  try {
    const status = await getContainerStatus(containerId);
    await updateContainerStatus(db, containerId, status.status);
    return status;
  } catch (error) {
    console.error(
      `Eroare la verificarea statusului containerului ${containerId}:`,
      error
    );
    await updateContainerStatus(db, containerId, "error");
    return { status: "error", message: error.message };
  }
};

/**
 * Verifică toate containerele și actualizează statusurile în baza de date
 * @param {Object} db - Conexiunea la baza de date
 * @returns {Promise<Array>} Lista cu statusurile tuturor containerelor
 */
const checkAllContainersAndUpdate = async (db) => {
  const NUM_CONTAINERS = parseInt(process.env.NUM_STORAGE_CONTAINERS || "20");
  const results = [];

  for (let i = 1; i <= NUM_CONTAINERS; i++) {
    const status = await checkAndUpdateContainerStatus(db, i);
    results.push({
      id: i,
      ...status,
    });
  }

  return results;
};

/**
 * Stochează un fragment și actualizează storage-ul containerului
 */
const storeFragmentWithStorageUpdate = async (
  db,
  containerId,
  fragmentName,
  fragmentData
) => {
  try {
    // Apelează funcția originală de stocare
    const result = await storeFragment(containerId, fragmentName, fragmentData);

    // Actualizează storage-ul folosit în baza de date
    const containerModel = new Container(db);
    const updateResult = await containerModel.updateStorageUsed(containerId);

    return result;
  } catch (error) {
    throw error;
  }
};

/**
 * Șterge un fragment și actualizează storage-ul containerului
 */
const deleteFragmentWithStorageUpdate = async (
  db,
  containerId,
  fragmentName
) => {
  try {
    // Apelează funcția originală de ștergere
    const result = await deleteFragment(containerId, fragmentName);

    // Actualizează storage-ul folosit în baza de date
    const containerModel = new Container(db);
    await containerModel.updateStorageUsed(containerId);

    return result;
  } catch (error) {
    console.error(
      `Eroare la ștergerea fragmentului ${fragmentName} din containerul ${containerId}:`,
      error
    );
    throw error;
  }
};

/**
 * Sincronizează storage-ul pentru toate containerele
 */
const syncAllContainersStorage = async (db) => {
  try {
    const containerModel = new Container(db);
    const result = await containerModel.syncAllStorageUsed();
    console.log(`Storage sincronizat pentru ${result.length} containere`);
    return result;
  } catch (error) {
    console.error("Eroare la sincronizarea storage-ului:", error);
    throw error;
  }
};

/**
 * Obține un raport detaliat despre utilizarea storage-ului
 */
const getStorageReport = async (db) => {
  try {
    const containerModel = new Container(db);
    const [containers, overview, lowSpaceContainers] = await Promise.all([
      containerModel.getAllWithStorageStats(),
      containerModel.getStorageOverview(),
      containerModel.getContainersWithLowSpace(80),
    ]);

    return {
      containers,
      overview,
      lowSpaceContainers,
      recommendations: generateStorageRecommendations(containers, overview),
    };
  } catch (error) {
    console.error("Eroare la generarea raportului de storage:", error);
    throw error;
  }
};

/**
 * Generează recomandări bazate pe utilizarea storage-ului
 */
const generateStorageRecommendations = (containers, overview) => {
  const recommendations = [];

  // Verifică containerele aproape pline
  const nearFullContainers = containers.filter((c) => c.usage_percentage > 80);
  if (nearFullContainers.length > 0) {
    recommendations.push({
      type: "warning",
      message: `${nearFullContainers.length} containere au peste 80% din spațiu ocupat`,
      action:
        "Considerați extinderea capacității sau redistribuirea fragmentelor",
    });
  }

  // Verifică distribuția inegală
  const usagePercentages = containers.map((c) => c.usage_percentage);
  const maxUsage = Math.max(...usagePercentages);
  const minUsage = Math.min(...usagePercentages);

  if (maxUsage - minUsage > 40) {
    recommendations.push({
      type: "info",
      message: "Distribuția storage-ului este inegală între containere",
      action: "Rebalansarea fragmentelor ar putea îmbunătăți eficiența",
    });
  }

  // Verifică utilizarea generală
  const totalUsagePercentage =
    (overview.total_used / overview.total_capacity) * 100;
  if (totalUsagePercentage > 70) {
    recommendations.push({
      type: "warning",
      message: `Utilizarea generală este ${totalUsagePercentage.toFixed(1)}%`,
      action: "Planificați extinderea capacității în curând",
    });
  }

  return recommendations;
};

/**
 * Distribuie uniform fragmentele (algoritm round-robin inteligent)
 * @param {Object} db - Conexiunea la baza de date
 * @param {number} fragmentSize - Dimensiunea fragmentului
 * @returns {Promise<number>} ID-ul containerului
 */
const getBalancedContainerForFragment = async (db, fragmentSize) => {
  try {
    // Obține containerele sortate după numărul de fragmente
    const result = await db.query(
      `
      SELECT 
        c.id,
        COALESCE(f.fragment_count, 0)::INTEGER as fragment_count,
        (c.storage_total - c.storage_used) as available_space
      FROM containers c
      LEFT JOIN (
        SELECT 
          container_id,
          COUNT(*) as fragment_count
        FROM fragments
        GROUP BY container_id
      ) f ON c.id = f.container_id
      WHERE c.status = 'active'
        AND (c.storage_total - c.storage_used) >= $1
      ORDER BY fragment_count ASC, c.id ASC
    `,
      [fragmentSize]
    );

    if (result.rows.length === 0) {
      throw new Error("Nu există containere cu suficient spațiu disponibil");
    }

    // Returnează primul container cu cel mai mic număr de fragmente
    return result.rows[0].id;
  } catch (error) {
    console.error("Eroare la distribuția echilibrată:", error);
    throw error;
  }
};
/**
 * Rebalansează fragmentele între containere - COMPLET REPARAT
 * @param {Object} db - Conexiunea la baza de date
 * @returns {Promise<Object>} Rezultatul rebalansării
 */
/**
 * Rebalansează fragmentele între containere - VERSIUNEA FINALĂ FUNCȚIONALĂ
 * @param {Object} db - Conexiunea la baza de date
 * @returns {Promise<Object>} Rezultatul rebalansării
 */
const rebalanceContainers = async (db) => {
  try {
    console.log("Începe rebalansarea containerelor...");

    // Obține distribuția actuală cu FORȚARE INTEGER
    const distributionResult = await db.query(`
      SELECT 
        c.id,
        COALESCE(f.fragment_count, 0)::INTEGER as fragment_count,
        c.storage_used,
        c.storage_total
      FROM containers c
      LEFT JOIN (
        SELECT 
          container_id,
          COUNT(*)::INTEGER as fragment_count
        FROM fragments
        GROUP BY container_id
      ) f ON c.id = f.container_id
      WHERE c.status = 'active'
      ORDER BY fragment_count DESC
    `);

    const containers = distributionResult.rows;

    // FORȚEAZĂ CONVERSIA LA INTEGER pentru a evita concatenarea
    const totalFragments = containers.reduce(
      (sum, c) => sum + parseInt(c.fragment_count || 0),
      0
    );

    const avgFragmentsPerContainer = Math.floor(
      totalFragments / containers.length
    );
    const upperThreshold = avgFragmentsPerContainer + 1; // ±1 pentru testare
    const lowerThreshold = Math.max(0, avgFragmentsPerContainer - 1);

    console.log(`Total fragmente: ${totalFragments}`);
    console.log(`Media fragmente per container: ${avgFragmentsPerContainer}`);
    console.log(
      `Prag superior: ${upperThreshold}, Prag inferior: ${lowerThreshold}`
    );

    // Identifică containerele supraîncărcate și subîncărcate
    const overloadedContainers = containers.filter(
      (c) => parseInt(c.fragment_count) > upperThreshold
    );
    const underloadedContainers = containers.filter(
      (c) => parseInt(c.fragment_count) < lowerThreshold
    );

    console.log(`Containere supraîncărcate: ${overloadedContainers.length}`);
    console.log(`Containere subîncărcate: ${underloadedContainers.length}`);

    if (
      overloadedContainers.length === 0 ||
      underloadedContainers.length === 0
    ) {
      return {
        success: true,
        message: "Distribuția este deja echilibrată",
        stats: {
          totalFragments,
          avgFragmentsPerContainer,
          movedFragments: 0,
        },
      };
    }

    let movedFragments = 0;

    // Începe tranzacția
    await db.query("BEGIN");

    try {
      // Pentru fiecare container supraîncărcat
      for (const sourceContainer of overloadedContainers) {
        const fragmentsToMove =
          parseInt(sourceContainer.fragment_count) - avgFragmentsPerContainer;

        if (fragmentsToMove <= 0) continue;

        // Obține fragmentele de mutat
        const fragmentsQuery = await db.query(
          `
          SELECT id, fragment_name, size_bytes, checksum
          FROM fragments 
          WHERE container_id = $1
          ORDER BY id DESC
          LIMIT $2
        `,
          [sourceContainer.id, fragmentsToMove]
        );

        // Pentru fiecare fragment de mutat
        for (const fragment of fragmentsQuery.rows) {
          // Găsește cel mai potrivit container destinație
          const targetContainerQuery = await db.query(
            `
            SELECT c.id
            FROM containers c
            LEFT JOIN (
              SELECT container_id, COUNT(*)::INTEGER as fragment_count
              FROM fragments
              GROUP BY container_id
            ) f ON c.id = f.container_id
            WHERE c.status = 'active'
              AND c.id != $1
              AND COALESCE(f.fragment_count, 0) < $2
            ORDER BY COALESCE(f.fragment_count, 0) ASC, c.id ASC
            LIMIT 1
          `,
            [sourceContainer.id, upperThreshold]
          );

          if (targetContainerQuery.rows.length === 0) break;

          const targetContainerId = targetContainerQuery.rows[0].id;

          try {
            // Obține conținutul fragmentului
            const fragmentContent = await retrieveFragment(
              sourceContainer.id,
              fragment.fragment_name
            );

            // Stochează în containerul țintă
            await storeFragment(
              targetContainerId,
              fragment.fragment_name,
              fragmentContent
            );

            // Actualizează baza de date
            await db.query(
              "UPDATE fragments SET container_id = $1 WHERE id = $2",
              [targetContainerId, fragment.id]
            );

            // Șterge din containerul sursă
            await deleteFragment(sourceContainer.id, fragment.fragment_name);

            movedFragments++;
            console.log(
              `Fragment ${fragment.fragment_name} mutat de la container ${sourceContainer.id} la ${targetContainerId}`
            );
          } catch (error) {
            console.error(
              `Eroare la mutarea fragmentului ${fragment.fragment_name}:`,
              error
            );
            // Continuă cu următorul fragment în caz de eroare
          }
        }
      }

      // Finalizează tranzacția
      await db.query("COMMIT");

      // ADAUGĂ SINCRONIZAREA STORAGE-ULUI
      console.log("Sincronizează storage-ul după rebalansare...");
      try {
        await syncAllContainersStorage(db);
        console.log("Storage sincronizat cu succes!");
      } catch (syncError) {
        console.warn(
          "Eroare la sincronizarea storage-ului:",
          syncError.message
        );
      }

      return {
        success: true,
        message: `Rebalansare completă. ${movedFragments} fragmente mutate.`,
        stats: {
          totalFragments,
          avgFragmentsPerContainer,
          movedFragments,
          overloadedContainers: overloadedContainers.length,
          underloadedContainers: underloadedContainers.length,
        },
      };
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    }
  } catch (error) {
    console.error("Eroare la rebalansarea containerelor:", error);
    throw error;
  }
};
module.exports = {
  getContainerCount,
  getRandomContainerId,
  containerExists,
  storeFragment,
  retrieveFragment,
  deleteFragment,
  getContainerStatus,
  getAllContainersStatus,
  restartContainer,
  storeFragmentWithStorageUpdate,
  syncAllContainersStorage,
  getBalancedContainerForFragment,
  updateContainerStatus,
  updateContainerLastCheck,
  checkAndUpdateContainerStatus,
  checkAllContainersAndUpdate,
  getStorageReport,
  rebalanceContainers,
};
