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

  const actualNumFragments = Math.min(
    numFragments,
    Math.max(1, Math.floor(fileSize / 1024))
  );
  const fragmentSize = Math.ceil(fileSize / actualNumFragments);
  const fragments = [];

  for (let i = 0; i < actualNumFragments; i++) {
    const start = i * fragmentSize;
    const end = Math.min(start + fragmentSize, fileSize);
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
 * Verifică integritatea unui fișier reasamblat
 * @param {Buffer} originalChecksum - Checksum-ul fișierului original
 * @param {Buffer} reassembledFile - Buffer-ul fișierului reasamblat
 * @param {string} algorithm - Algoritmul de hash
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

module.exports = {
  splitFile,
  reassembleFile,
  verifyFileIntegrity,
};
