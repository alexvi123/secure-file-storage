const crypto = require("crypto");

/**
 * Utilitar pentru operațiuni criptografice
 */

/**
 * Generează un hash SHA-256 pentru un buffer
 * @param {Buffer} data - Datele pentru hash
 * @returns {string} Hash-ul în format hexadecimal
 */
function generateSHA256Hash(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

/**
 * Generează un hash MD5 pentru un buffer
 * @param {Buffer} data - Datele pentru hash
 * @returns {string} Hash-ul în format hexadecimal
 */
function generateMD5Hash(data) {
  return crypto.createHash("md5").update(data).digest("hex");
}

/**
 * Criptează date cu AES-256-CBC
 * @param {Buffer|string} data - Datele de criptat
 * @param {string} key - Cheia de criptare (32 bytes)
 * @returns {Buffer} Datele criptate (include IV-ul)
 */
function encryptAES(data, key) {
  // Asigură-te că cheia are lungimea corectă
  const aesKey = crypto.createHash("sha256").update(key).digest();

  // Generează un vector de inițializare aleatoriu
  const iv = crypto.randomBytes(16);

  // Creează un cifru
  const cipher = crypto.createCipheriv("aes-256-cbc", aesKey, iv);

  // Convertește string în buffer dacă este necesar
  const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data);

  // Criptează datele
  const encrypted = Buffer.concat([cipher.update(dataBuffer), cipher.final()]);

  // Returnează IV + date criptate
  return Buffer.concat([iv, encrypted]);
}

/**
 * Decriptează date criptate cu AES-256-CBC
 * @param {Buffer} encryptedData - Datele criptate (incluzând IV-ul)
 * @param {string} key - Cheia de decriptare (32 bytes)
 * @returns {Buffer} Datele decriptate
 */
function decryptAES(encryptedData, key) {
  // Asigură-te că cheia are lungimea corectă
  const aesKey = crypto.createHash("sha256").update(key).digest();

  // Extrage IV-ul din primii 16 bytes
  const iv = encryptedData.slice(0, 16);

  // Restul este data criptată
  const encrypted = encryptedData.slice(16);

  // Creează un decifrator
  const decipher = crypto.createDecipheriv("aes-256-cbc", aesKey, iv);

  // Decriptează datele
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

/**
 * Generează o cheie aleatoare
 * @param {number} length - Lungimea cheii în bytes
 * @returns {string} Cheia în format hexadecimal
 */
function generateRandomKey(length = 32) {
  return crypto.randomBytes(length).toString("hex");
}

/**
 * Verifică integritatea unui buffer folosind un HMAC
 * @param {Buffer} data - Datele de verificat
 * @param {string} hmac - HMAC-ul pentru verificare
 * @param {string} key - Cheia pentru verificare
 * @returns {boolean} True dacă HMAC-ul se potrivește
 */
function verifyHMAC(data, hmac, key) {
  const calculatedHMAC = crypto
    .createHmac("sha256", key)
    .update(data)
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(calculatedHMAC, "hex"),
    Buffer.from(hmac, "hex")
  );
}

/**
 * Generează un HMAC pentru date
 * @param {Buffer} data - Datele pentru HMAC
 * @param {string} key - Cheia pentru HMAC
 * @returns {string} HMAC-ul în format hexadecimal
 */
function generateHMAC(data, key) {
  return crypto.createHmac("sha256", key).update(data).digest("hex");
}

/**
 * Derivă o cheie din o parolă folosind PBKDF2
 * @param {string} password - Parola
 * @param {string} salt - Salt-ul
 * @param {number} iterations - Numărul de iterații
 * @param {number} keyLength - Lungimea cheii în bytes
 * @returns {Promise<Buffer>} Cheia derivată
 */
async function deriveKey(password, salt, iterations = 100000, keyLength = 32) {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(
      password,
      salt,
      iterations,
      keyLength,
      "sha512",
      (err, key) => {
        if (err) reject(err);
        else resolve(key);
      }
    );
  });
}

/**
 * Generează un salt aleatoriu
 * @param {number} length - Lungimea salt-ului în bytes
 * @returns {string} Salt-ul în format hexadecimal
 */
function generateSalt(length = 16) {
  return crypto.randomBytes(length).toString("hex");
}

/**
 * Creează o pereche de chei RSA
 * @returns {Object} Obiect cu cheile publică și privată în format PEM
 */
function generateRSAKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: "spki",
      format: "pem",
    },
    privateKeyEncoding: {
      type: "pkcs8",
      format: "pem",
    },
  });

  return { publicKey, privateKey };
}

/**
 * Criptează date cu RSA
 * @param {string|Buffer} data - Datele de criptat
 * @param {string} publicKey - Cheia publică în format PEM
 * @returns {Buffer} Datele criptate
 */
function encryptRSA(data, publicKey) {
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
  return crypto.publicEncrypt(publicKey, buffer);
}

/**
 * Decriptează date cu RSA
 * @param {Buffer} encryptedData - Datele criptate
 * @param {string} privateKey - Cheia privată în format PEM
 * @returns {Buffer} Datele decriptate
 */
function decryptRSA(encryptedData, privateKey) {
  return crypto.privateDecrypt(privateKey, encryptedData);
}

/**
 * Semnează date cu RSA
 * @param {string|Buffer} data - Datele de semnat
 * @param {string} privateKey - Cheia privată în format PEM
 * @returns {Buffer} Semnătura
 */
function signRSA(data, privateKey) {
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const sign = crypto.createSign("SHA256");
  sign.update(buffer);
  return sign.sign(privateKey);
}

/**
 * Verifică semnătura RSA
 * @param {string|Buffer} data - Datele originale
 * @param {Buffer} signature - Semnătura de verificat
 * @param {string} publicKey - Cheia publică în format PEM
 * @returns {boolean} True dacă semnătura este validă
 */
function verifyRSA(data, signature, publicKey) {
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const verify = crypto.createVerify("SHA256");
  verify.update(buffer);
  return verify.verify(publicKey, signature);
}

/**
 * Criptează un fișier, segmentându-l în blocuri
 * @param {Buffer} fileData - Datele fișierului
 * @param {string} key - Cheia de criptare
 * @param {number} blockSize - Dimensiunea blocului în bytes (default: 1MB)
 * @returns {Buffer[]} Array de blocuri criptate
 */
function encryptFile(fileData, key, blockSize = 1024 * 1024) {
  const aesKey = crypto.createHash("sha256").update(key).digest();

  const blocks = [];
  const totalBlocks = Math.ceil(fileData.length / blockSize);

  for (let i = 0; i < totalBlocks; i++) {
    const start = i * blockSize;
    const end = Math.min(start + blockSize, fileData.length);
    const blockData = fileData.slice(start, end);

    // Generează un IV unic pentru fiecare bloc
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv("aes-256-cbc", aesKey, iv);

    const encryptedBlock = Buffer.concat([
      iv,
      cipher.update(blockData),
      cipher.final(),
    ]);

    blocks.push(encryptedBlock);
  }

  return blocks;
}

/**
 * Decriptează un fișier din blocuri criptate
 * @param {Buffer[]} encryptedBlocks - Blocurile criptate
 * @param {string} key - Cheia de decriptare
 * @returns {Buffer} Datele fișierului decriptat
 */
function decryptFile(encryptedBlocks, key) {
  const aesKey = crypto.createHash("sha256").update(key).digest();

  const decryptedBlocks = [];

  for (const encryptedBlock of encryptedBlocks) {
    // Extrage IV-ul din blocul criptat
    const iv = encryptedBlock.slice(0, 16);
    const encryptedData = encryptedBlock.slice(16);

    const decipher = crypto.createDecipheriv("aes-256-cbc", aesKey, iv);

    const decryptedBlock = Buffer.concat([
      decipher.update(encryptedData),
      decipher.final(),
    ]);

    decryptedBlocks.push(decryptedBlock);
  }

  return Buffer.concat(decryptedBlocks);
}

/**
 * Generează un identificator unic
 * @returns {string} Identificatorul unic
 */
function generateUUID() {
  return crypto.randomUUID();
}

/**
 * Generează o cheie pentru cifrare simetrică pentru un fișier
 * @returns {Object} Obiect cu cheia și salt-ul
 */
function generateFileEncryptionKey() {
  const salt = generateSalt();
  const key = generateRandomKey();

  return {
    key,
    salt,
  };
}

/**
 * Aplică o funcție de hash repetată pentru derivare de cheie
 * @param {string} input - Input-ul pentru derivare
 * @param {number} rounds - Numărul de runde
 * @returns {string} Cheia derivată în format hex
 */
function iterativeHash(input, rounds = 5000) {
  let result = input;

  for (let i = 0; i < rounds; i++) {
    result = crypto.createHash("sha256").update(result).digest("hex");
  }

  return result;
}

module.exports = {
  generateSHA256Hash,
  generateMD5Hash,
  encryptAES,
  decryptAES,
  generateRandomKey,
  verifyHMAC,
  generateHMAC,
  deriveKey,
  generateSalt,
  generateRSAKeyPair,
  encryptRSA,
  decryptRSA,
  signRSA,
  verifyRSA,
  encryptFile,
  decryptFile,
  generateUUID,
  generateFileEncryptionKey,
  iterativeHash,
};
