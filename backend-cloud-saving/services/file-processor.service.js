/**
 * Service pentru procesarea, fragmentarea și reasamblarea fișierelor
 */

/**
 * Împarte un fișier în numărul specificat de fragmente
 * @param {Buffer} fileBuffer - Buffer-ul fișierului original
 * @param {number} numFragments - Numărul de fragmente dorit
 * @returns {Array<Buffer>} Array cu fragmentele de fișier
 */
const splitFile = (fileBuffer, numFragments) => {
  // Verifică dacă avem un buffer valid
  if (!Buffer.isBuffer(fileBuffer)) {
    throw new Error("Datele fișierului trebuie să fie un Buffer");
  }

  // Verifică dacă numărul de fragmente este valid
  if (!Number.isInteger(numFragments) || numFragments < 1) {
    throw new Error(
      "Numărul de fragmente trebuie să fie un număr întreg pozitiv"
    );
  }

  const fileSize = fileBuffer.length;

  // Asigură-te că nu fragmentăm fișierele foarte mici în prea multe părți
  const actualNumFragments = Math.min(
    numFragments,
    Math.max(1, Math.floor(fileSize / 1024))
  );

  // Calculează dimensiunea fiecărui fragment
  const fragmentSize = Math.ceil(fileSize / actualNumFragments);

  // Împarte fișierul în fragmente
  const fragments = [];

  for (let i = 0; i < actualNumFragments; i++) {
    const start = i * fragmentSize;
    const end = Math.min(start + fragmentSize, fileSize);

    // Creează un nou buffer pentru fragment
    const fragmentBuffer = Buffer.alloc(end - start);
    fileBuffer.copy(fragmentBuffer, 0, start, end);

    fragments.push(fragmentBuffer);
  }

  return fragments;
};

/**
 * Reasamblează fragmentele într-un fișier complet
 * @param {Array<Buffer>} fragments - Array cu fragmentele de fișier
 * @returns {Buffer} Buffer-ul fișierului reasamblat
 */
const reassembleFile = (fragments) => {
  // Verifică dacă avem fragmente valide
  if (!Array.isArray(fragments) || fragments.length === 0) {
    throw new Error("Fragmentele trebuie să fie un array non-gol de buffer-e");
  }

  // Verifică dacă toate elementele sunt buffer-e
  fragments.forEach((fragment, index) => {
    if (!Buffer.isBuffer(fragment)) {
      throw new Error(`Fragmentul la index ${index} nu este un Buffer valid`);
    }
  });

  // Calculează dimensiunea totală a fișierului
  const totalSize = fragments.reduce(
    (size, fragment) => size + fragment.length,
    0
  );

  // Creează un buffer pentru fișierul complet
  const fileBuffer = Buffer.alloc(totalSize);

  // Copiază fiecare fragment în poziția corectă
  let position = 0;

  fragments.forEach((fragment) => {
    fragment.copy(fileBuffer, position);
    position += fragment.length;
  });

  return fileBuffer;
};

/**
 * Obține informații despre un fișier din buffer-ul său
 * @param {Buffer} fileBuffer - Buffer-ul fișierului
 * @returns {Object} Obiect cu informații despre fișier
 */
const getFileInfo = (fileBuffer) => {
  if (!Buffer.isBuffer(fileBuffer)) {
    throw new Error("Datele fișierului trebuie să fie un Buffer");
  }

  // Detectează tipul de fișier bazat pe magic numbers
  // Acesta este un set limitat de verificări; într-o implementare reală s-ar putea folosi o bibliotecă specializată
  let fileType = "unknown";
  let extension = "bin";

  // Verifică semnături comune
  if (fileBuffer.length >= 4) {
    // PNG
    if (
      fileBuffer[0] === 0x89 &&
      fileBuffer[1] === 0x50 &&
      fileBuffer[2] === 0x4e &&
      fileBuffer[3] === 0x47
    ) {
      fileType = "image/png";
      extension = "png";
    }
    // JPEG
    else if (fileBuffer[0] === 0xff && fileBuffer[1] === 0xd8) {
      fileType = "image/jpeg";
      extension = "jpg";
    }
    // GIF
    else if (
      fileBuffer[0] === 0x47 &&
      fileBuffer[1] === 0x49 &&
      fileBuffer[2] === 0x46
    ) {
      fileType = "image/gif";
      extension = "gif";
    }
    // PDF
    else if (
      fileBuffer[0] === 0x25 &&
      fileBuffer[1] === 0x50 &&
      fileBuffer[2] === 0x44 &&
      fileBuffer[3] === 0x46
    ) {
      fileType = "application/pdf";
      extension = "pdf";
    }
    // ZIP
    else if (fileBuffer[0] === 0x50 && fileBuffer[1] === 0x4b) {
      fileType = "application/zip";
      extension = "zip";
    }
  }

  return {
    size: fileBuffer.length,
    type: fileType,
    extension,
  };
};

/**
 * Verifică integritatea unui fișier reasamblat
 * @param {Buffer} originalChecksum - Checksum-ul fișierului original
 * @param {Buffer} reassembledFile - Buffer-ul fișierului reasamblat
 * @param {string} algorithm - Algoritmul de hash (default: 'sha256')
 * @returns {boolean} True dacă checksumurile se potrivesc
 */
const verifyFileIntegrity = (
  originalChecksum,
  reassembledFile,
  algorithm = "sha256"
) => {
  const crypto = require("crypto");

  const reassembledChecksum = crypto
    .createHash(algorithm)
    .update(reassembledFile)
    .digest("hex");

  return originalChecksum === reassembledChecksum;
};

/**
 * Criptează un fragment de fișier (opțional pentru securitate suplimentară)
 * @param {Buffer} fragmentBuffer - Buffer-ul fragmentului
 * @param {string} key - Cheia de criptare
 * @returns {Buffer} Fragment criptat
 */
const encryptFragment = (fragmentBuffer, key) => {
  const crypto = require("crypto");

  // Generează un vector de inițializare aleatoriu
  const iv = crypto.randomBytes(16);

  // Creează un cifru
  const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(key), iv);

  // Criptează fragmentul
  const encryptedFragment = Buffer.concat([
    cipher.update(fragmentBuffer),
    cipher.final(),
  ]);

  // Adaugă IV-ul la începutul fragmentului criptat pentru a putea decripta mai târziu
  return Buffer.concat([iv, encryptedFragment]);
};

/**
 * Decriptează un fragment de fișier
 * @param {Buffer} encryptedFragment - Buffer-ul fragmentului criptat
 * @param {string} key - Cheia de decriptare
 * @returns {Buffer} Fragment decriptat
 */
const decryptFragment = (encryptedFragment, key) => {
  const crypto = require("crypto");

  // Extrage IV-ul din primii 16 bytes
  const iv = encryptedFragment.slice(0, 16);

  // Restul este fragmentul criptat
  const encryptedData = encryptedFragment.slice(16);

  // Creează un decifrator
  const decipher = crypto.createDecipheriv("aes-256-cbc", Buffer.from(key), iv);

  // Decriptează fragmentul
  return Buffer.concat([decipher.update(encryptedData), decipher.final()]);
};

/**
 * Adaugă metadate la un fragment pentru procesare ulterioară
 * @param {Buffer} fragmentBuffer - Buffer-ul fragmentului
 * @param {Object} metadata - Metadatele de adăugat
 * @returns {Buffer} Fragment cu metadate
 */
const addMetadataToFragment = (fragmentBuffer, metadata) => {
  // Convertește metadatele în JSON
  const metadataString = JSON.stringify(metadata);

  // Codifică lungimea metadatelor (4 bytes)
  const metadataLength = Buffer.alloc(4);
  metadataLength.writeUInt32BE(metadataString.length, 0);

  // Creează buffer pentru metadate
  const metadataBuffer = Buffer.from(metadataString, "utf8");

  // Combină totul: lungime metadate (4 bytes) + metadate + fragment
  return Buffer.concat([metadataLength, metadataBuffer, fragmentBuffer]);
};

/**
 * Extrage metadatele și fragmentul dintr-un fragment cu metadate
 * @param {Buffer} fragmentWithMetadata - Buffer-ul fragmentului cu metadate
 * @returns {Object} Obiect cu metadatele și fragmentul
 */
const extractMetadataFromFragment = (fragmentWithMetadata) => {
  // Citește lungimea metadatelor din primii 4 bytes
  const metadataLength = fragmentWithMetadata.readUInt32BE(0);

  // Extrage metadatele
  const metadataBuffer = fragmentWithMetadata.slice(4, 4 + metadataLength);
  const metadataString = metadataBuffer.toString("utf8");
  const metadata = JSON.parse(metadataString);

  // Extrage fragmentul original
  const fragment = fragmentWithMetadata.slice(4 + metadataLength);

  return { metadata, fragment };
};

/**
 * Comprimă un fragment pentru a economisi spațiu
 * @param {Buffer} fragmentBuffer - Buffer-ul fragmentului
 * @returns {Promise<Buffer>} Fragment comprimat
 */
const compressFragment = async (fragmentBuffer) => {
  const zlib = require("zlib");
  const { promisify } = require("util");

  const gzip = promisify(zlib.gzip);
  return await gzip(fragmentBuffer);
};

/**
 * Decomprimă un fragment comprimat
 * @param {Buffer} compressedFragment - Buffer-ul fragmentului comprimat
 * @returns {Promise<Buffer>} Fragment decomprimat
 */
const decompressFragment = async (compressedFragment) => {
  const zlib = require("zlib");
  const { promisify } = require("util");

  const gunzip = promisify(zlib.gunzip);
  return await gunzip(compressedFragment);
};

module.exports = {
  splitFile,
  reassembleFile,
  getFileInfo,
  verifyFileIntegrity,
  encryptFragment,
  decryptFragment,
  addMetadataToFragment,
  extractMetadataFromFragment,
  compressFragment,
  decompressFragment,
};
