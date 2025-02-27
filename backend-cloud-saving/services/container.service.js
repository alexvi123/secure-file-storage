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
    // În implementarea de producție, ar trebui să verificăm containerele active
    // Pentru proiectul tău, vom folosi numărul configurat
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
const getRandomContainerId = async () => {
  const containerCount = await getContainerCount();
  if (containerCount === 0) {
    throw new Error("Nu există containere disponibile");
  }

  // Generează un număr aleatoriu între 1 și containerCount
  return Math.floor(Math.random() * containerCount) + 1;
};

/**
 * Construiește URL-ul pentru un container specific
 * @param {number} containerId - ID-ul containerului
 * @returns {string} URL-ul containerului
 */
const getContainerUrl = (containerId) => {
  // În dezvoltare locală, toate containerele rulează pe localhost pe porturi diferite
  // În producție, ar trebui să utilizeze DNS intern Docker
  if (process.env.NODE_ENV === "production") {
    return `http://${CONTAINER_PREFIX}${containerId}:${CONTAINER_PORT}`;
  } else {
    // Pentru dezvoltarea locală, folosim portul calculat
    // Presupunem că porturile încep de la 3001 și cresc pentru fiecare container
    const containerPort = 3001 + (containerId - 1);
    return `http://localhost:${containerPort}`;
  }
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

    // În dezvoltare, verifică doar dacă ID-ul este valid
    if (process.env.NODE_ENV !== "production") {
      return true;
    }

    // În producție, verifică dacă containerul există cu Docker
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

    // Creează un obiect FormData pentru a trimite fișierul
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
    const containerUrl = getContainerUrl(containerId);

    // Încearcă să obțină starea containerului
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

    // În dezvoltare, simulăm repornirea
    if (process.env.NODE_ENV !== "production") {
      console.log(`[DEV] Simulare repornire container: ${containerName}`);
      return { success: true, message: "Container repornit (simulare)" };
    }

    // În producție, repornește containerul cu Docker
    await exec(`docker restart ${containerName}`);

    return {
      success: true,
      message: `Containerul ${containerName} a fost repornit cu succes`,
    };
  } catch (error) {
    console.error(`Eroare la repornirea containerului ${containerId}:`, error);
    throw new Error(`Nu s-a putut reporni containerul: ${error.message}`);
  }
};

/**
 * Obține lista fragmentelor dintr-un container
 * @param {number} containerId - ID-ul containerului
 * @returns {Promise<Array<Object>>} Lista fragmentelor
 */
const getContainerFragments = async (containerId) => {
  try {
    const containerUrl = getContainerUrl(containerId);

    // Trimite cererea către container
    const response = await axios.get(`${containerUrl}/fragments/list`);

    return response.data.fragments || [];
  } catch (error) {
    console.error(
      `Eroare la obținerea listei de fragmente din containerul ${containerId}:`,
      error
    );
    throw new Error(`Nu s-a putut obține lista de fragmente: ${error.message}`);
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
  getContainerFragments,
};
