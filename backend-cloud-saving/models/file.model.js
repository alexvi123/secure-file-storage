/**
 * Model pentru fișiere
 */
class File {
  /**
   * Inițializează modelul fișierului
   * @param {Object} db - Conexiunea la baza de date
   */
  constructor(db) {
    this.db = db;
    this.tableName = "files";
  }

  /**
   * Creează un fișier nou
   * @param {Object} fileData - Datele fișierului
   * @returns {Promise<Object>} Fișierul creat
   */
  async create(fileData) {
    const { user_id, filename, original_name, mime_type, size_bytes } =
      fileData;

    const result = await this.db.query(
      `INSERT INTO ${this.tableName} 
        (user_id, filename, original_name, mime_type, size_bytes) 
        VALUES ($1, $2, $3, $4, $5) 
        RETURNING id, user_id, filename, original_name, mime_type, size_bytes, created_at`,
      [user_id, filename, original_name, mime_type, size_bytes]
    );

    return result.rows[0];
  }

  /**
   * Găsește un fișier după ID
   * @param {number} id - ID-ul fișierului
   * @param {number} [userId] - Opțional, ID-ul utilizatorului pentru verificarea proprietății
   * @returns {Promise<Object|null>} Fișierul găsit sau null
   */
  async findById(id, userId = null) {
    let query = `SELECT * FROM ${this.tableName} WHERE id = $1`;
    const params = [id];

    if (userId !== null) {
      query += ` AND user_id = $2`;
      params.push(userId);
    }

    const result = await this.db.query(query, params);

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Găsește toate fișierele unui utilizator cu paginare
   * @param {number} userId - ID-ul utilizatorului
   * @param {number} limit - Numărul de rezultate per pagină
   * @param {number} offset - Offset pentru paginare
   * @returns {Promise<Array>} Lista de fișiere
   */
  async findByUserId(userId, limit = 10, offset = 0) {
    const result = await this.db.query(
      `SELECT id, original_name, mime_type, size_bytes, created_at, updated_at 
        FROM ${this.tableName} 
        WHERE user_id = $1 
        ORDER BY created_at DESC 
        LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    return result.rows;
  }

  /**
   * Actualizează un fișier
   * @param {number} id - ID-ul fișierului
   * @param {number} userId - ID-ul utilizatorului pentru verificarea proprietății
   * @param {Object} fileData - Datele actualizate
   * @returns {Promise<Object|null>} Fișierul actualizat sau null
   */
  async update(id, userId, fileData) {
    // Construiește setările pentru actualizare
    const setValues = [];
    const queryParams = [];
    let paramCounter = 1;

    // Adaugă câmpurile care trebuie actualizate
    for (const [key, value] of Object.entries(fileData)) {
      if (
        key !== "id" &&
        key !== "user_id" &&
        key !== "created_at" &&
        value !== undefined
      ) {
        setValues.push(`${key} = $${paramCounter}`);
        queryParams.push(value);
        paramCounter++;
      }
    }

    // Adaugă timestamp-ul de actualizare
    setValues.push(`updated_at = NOW()`);

    // Adaugă parametrii pentru WHERE
    queryParams.push(id);
    queryParams.push(userId);

    // Execută query-ul numai dacă există câmpuri de actualizat
    if (setValues.length === 0) {
      return null;
    }

    const result = await this.db.query(
      `UPDATE ${this.tableName} 
        SET ${setValues.join(", ")} 
        WHERE id = $${paramCounter++} AND user_id = $${paramCounter} 
        RETURNING id, original_name, mime_type, size_bytes, updated_at`,
      queryParams
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Șterge un fișier
   * @param {number} id - ID-ul fișierului
   * @param {number} [userId] - Opțional, ID-ul utilizatorului pentru verificarea proprietății
   * @returns {Promise<boolean>} Succes
   */
  async delete(id, userId = null) {
    let query = `DELETE FROM ${this.tableName} WHERE id = $1`;
    const params = [id];

    if (userId !== null) {
      query += ` AND user_id = $2`;
      params.push(userId);
    }

    const result = await this.db.query(query, params);

    return result.rowCount > 0;
  }

  /**
   * Numără fișierele unui utilizator
   * @param {number} userId - ID-ul utilizatorului
   * @returns {Promise<number>} Numărul de fișiere
   */
  async countByUserId(userId) {
    const result = await this.db.query(
      `SELECT COUNT(*) as count FROM ${this.tableName} WHERE user_id = $1`,
      [userId]
    );

    return parseInt(result.rows[0].count);
  }

  /**
   * Calculează dimensiunea totală a fișierelor unui utilizator
   * @param {number} userId - ID-ul utilizatorului
   * @returns {Promise<number>} Dimensiunea totală în bytes
   */
  async totalSizeByUserId(userId) {
    const result = await this.db.query(
      `SELECT SUM(size_bytes) as total_size FROM ${this.tableName} WHERE user_id = $1`,
      [userId]
    );

    return parseInt(result.rows[0].total_size || 0);
  }

  /**
   * Caută fișiere după nume
   * @param {number} userId - ID-ul utilizatorului
   * @param {string} searchTerm - Termenul de căutare
   * @param {number} limit - Numărul de rezultate per pagină
   * @param {number} offset - Offset pentru paginare
   * @returns {Promise<Array>} Lista de fișiere
   */
  async search(userId, searchTerm, limit = 10, offset = 0) {
    const result = await this.db.query(
      `SELECT id, original_name, mime_type, size_bytes, created_at 
        FROM ${this.tableName} 
        WHERE user_id = $1 AND original_name ILIKE $2 
        ORDER BY created_at DESC 
        LIMIT $3 OFFSET $4`,
      [userId, `%${searchTerm}%`, limit, offset]
    );

    return result.rows;
  }

  /**
   * Numără rezultatele căutării
   * @param {number} userId - ID-ul utilizatorului
   * @param {string} searchTerm - Termenul de căutare
   * @returns {Promise<number>} Numărul de rezultate
   */
  async countSearch(userId, searchTerm) {
    const result = await this.db.query(
      `SELECT COUNT(*) as count FROM ${this.tableName} 
        WHERE user_id = $1 AND original_name ILIKE $2`,
      [userId, `%${searchTerm}%`]
    );

    return parseInt(result.rows[0].count);
  }

  /**
   * Obține statistici despre fișierele unui utilizator
   * @param {number} userId - ID-ul utilizatorului
   * @returns {Promise<Object>} Statistici
   */
  async getUserStats(userId) {
    const statsQuery = await this.db.query(
      `SELECT COUNT(*) as total_files, 
         SUM(size_bytes) as total_size, 
         MAX(created_at) as last_upload 
         FROM ${this.tableName} 
         WHERE user_id = $1`,
      [userId]
    );

    return statsQuery.rows[0];
  }

  /**
   * Obține toate fișierele cu paginare (pentru admin)
   * @param {number} limit - Numărul de rezultate per pagină
   * @param {number} offset - Offset pentru paginare
   * @returns {Promise<Array>} Lista de fișiere
   */
  async findAll(limit = 10, offset = 0) {
    const result = await this.db.query(
      `SELECT f.id, f.original_name, f.mime_type, f.size_bytes, f.created_at,
                u.id as user_id, u.email as user_email 
         FROM ${this.tableName} f
         JOIN users u ON f.user_id = u.id
         ORDER BY f.created_at DESC
         LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return result.rows;
  }

  /**
   * Numără toate fișierele (pentru admin)
   * @returns {Promise<number>} Numărul total de fișiere
   */
  async count() {
    const result = await this.db.query(
      `SELECT COUNT(*) as count FROM ${this.tableName}`
    );

    return parseInt(result.rows[0].count);
  }
}

module.exports = File;
