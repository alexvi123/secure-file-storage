/**
 * Model pentru utilizator
 */
class User {
  constructor(db) {
    this.db = db;
    this.tableName = "users";
  }

  /**
   * Creează un utilizator nou
   * @param {Object} userData - Datele utilizatorului
   * @returns {Promise<Object>} Utilizatorul creat
   */
  async create(userData) {
    const { email, password_hash, name, surname, phone_number } = userData;

    const result = await this.db.query(
      `INSERT INTO ${this.tableName} 
        (email, password_hash, name, surname, phone_number) 
        VALUES ($1, $2, $3, $4, $5) 
        RETURNING id, email, name, surname, phone_number, created_at`,
      [email, password_hash, name, surname, phone_number]
    );

    return result.rows[0];
  }

  /**
   * Găsește un utilizator după email
   * @param {string} email - Email-ul utilizatorului
   * @returns {Promise<Object|null>} Utilizatorul găsit sau null
   */
  async findByEmail(email) {
    const result = await this.db.query(
      `SELECT * FROM ${this.tableName} WHERE email = $1`,
      [email]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Găsește un utilizator după ID
   * @param {number} id - ID-ul utilizatorului
   * @returns {Promise<Object|null>} Utilizatorul găsit sau null
   */
  async findById(id) {
    const result = await this.db.query(
      `SELECT * FROM ${this.tableName} WHERE id = $1`,
      [id]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Actualizează un utilizator
   * @param {number} id - ID-ul utilizatorului
   * @param {Object} userData - Datele actualizate
   * @returns {Promise<Object|null>} Utilizatorul actualizat sau null
   */
  async update(id, userData) {
    const setValues = [];
    const queryParams = [];
    let paramCounter = 1;

    // Adaugă câmpurile care trebuie actualizate
    for (const [key, value] of Object.entries(userData)) {
      if (key !== "id" && key !== "created_at" && value !== undefined) {
        setValues.push(`${key} = $${paramCounter}`);
        queryParams.push(value);
        paramCounter++;
      }
    }
    setValues.push(`updated_at = NOW()`);
    queryParams.push(id);

    if (setValues.length === 0) {
      return null;
    }

    const result = await this.db.query(
      `UPDATE ${this.tableName} 
        SET ${setValues.join(", ")} 
        WHERE id = $${paramCounter} 
        RETURNING id, email, name, surname, phone_number, two_factor_enabled, updated_at`,
      queryParams
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Actualizează secretul 2FA al unui utilizator
   * @param {number} id - ID-ul utilizatorului
   * @param {string} secret - Secretul 2FA
   * @returns {Promise<boolean>} Succes
   */
  async updateTwoFactorSecret(id, secret) {
    const result = await this.db.query(
      `UPDATE ${this.tableName} 
        SET two_factor_secret = $1, updated_at = NOW() 
        WHERE id = $2`,
      [secret, id]
    );

    return result.rowCount > 0;
  }

  /**
   * Activează sau dezactivează 2FA pentru un utilizator
   * @param {number} id - ID-ul utilizatorului
   * @param {boolean} enabled - Starea 2FA
   * @returns {Promise<boolean>} Succes
   */
  async setTwoFactorEnabled(id, enabled) {
    const result = await this.db.query(
      `UPDATE ${this.tableName} 
        SET two_factor_enabled = $1, updated_at = NOW() 
        ${!enabled ? ", two_factor_secret = NULL" : ""} 
        WHERE id = $2`,
      [enabled, id]
    );

    return result.rowCount > 0;
  }

  /**
   * Schimbă parola unui utilizator
   * @param {number} id - ID-ul utilizatorului
   * @param {string} passwordHash - Hash-ul noii parole
   * @returns {Promise<boolean>} Succes
   */
  async updatePassword(id, passwordHash) {
    const result = await this.db.query(
      `UPDATE ${this.tableName} 
        SET password_hash = $1, updated_at = NOW() 
        WHERE id = $2`,
      [passwordHash, id]
    );

    return result.rowCount > 0;
  }

  /**
   * Șterge un utilizator
   * @param {number} id - ID-ul utilizatorului
   * @returns {Promise<boolean>} Succes
   */
  async delete(id) {
    const result = await this.db.query(
      `DELETE FROM ${this.tableName} WHERE id = $1`,
      [id]
    );

    return result.rowCount > 0;
  }

  /**
   * Obține toți utilizatorii cu paginare
   * @param {number} limit - Numărul de rezultate per pagină
   * @param {number} offset - Offset pentru paginare
   * @returns {Promise<Array>} Lista de utilizatori
   */
  async findAll(limit = 10, offset = 0) {
    const result = await this.db.query(
      `SELECT id, email, name, surname, phone_number, two_factor_enabled, created_at, updated_at 
        FROM ${this.tableName} 
        ORDER BY created_at DESC 
        LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return result.rows;
  }

  /**
   * Numără toți utilizatorii
   * @returns {Promise<number>} Numărul total de utilizatori
   */
  async count() {
    const result = await this.db.query(
      `SELECT COUNT(*) as count FROM ${this.tableName}`
    );

    return parseInt(result.rows[0].count);
  }
}

module.exports = User;
