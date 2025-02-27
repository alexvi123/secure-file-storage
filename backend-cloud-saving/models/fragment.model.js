/**
 * Model pentru fragmente de fișiere
 */
class Fragment {
  /**
   * Inițializează modelul fragmentului
   * @param {Object} db - Conexiunea la baza de date
   */
  constructor(db) {
    this.db = db;
    this.tableName = "fragments";
  }

  /**
   * Creează un fragment nou
   * @param {Object} fragmentData - Datele fragmentului
   * @returns {Promise<Object>} Fragmentul creat
   */
  async create(fragmentData) {
    const {
      file_id,
      fragment_index,
      container_id,
      fragment_name,
      size_bytes,
      checksum,
    } = fragmentData;

    const result = await this.db.query(
      `INSERT INTO ${this.tableName} 
        (file_id, fragment_index, container_id, fragment_name, size_bytes, checksum) 
        VALUES ($1, $2, $3, $4, $5, $6) 
        RETURNING id, file_id, fragment_index, container_id, fragment_name, size_bytes, checksum`,
      [
        file_id,
        fragment_index,
        container_id,
        fragment_name,
        size_bytes,
        checksum,
      ]
    );

    return result.rows[0];
  }

  /**
   * Găsește un fragment după ID
   * @param {number} id - ID-ul fragmentului
   * @returns {Promise<Object|null>} Fragmentul găsit sau null
   */
  async findById(id) {
    const result = await this.db.query(
      `SELECT * FROM ${this.tableName} WHERE id = $1`,
      [id]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Găsește toate fragmentele unui fișier
   * @param {number} fileId - ID-ul fișierului
   * @returns {Promise<Array>} Lista de fragmente
   */
  async findByFileId(fileId) {
    const result = await this.db.query(
      `SELECT * FROM ${this.tableName} 
        WHERE file_id = $1 
        ORDER BY fragment_index`,
      [fileId]
    );

    return result.rows;
  }

  /**
   * Găsește toate fragmentele stocate într-un container
   * @param {number} containerId - ID-ul containerului
   * @returns {Promise<Array>} Lista de fragmente
   */
  async findByContainerId(containerId) {
    const result = await this.db.query(
      `SELECT fr.*, f.original_name as file_name
        FROM ${this.tableName} fr
        JOIN files f ON fr.file_id = f.id
        WHERE fr.container_id = $1
        ORDER BY fr.id`,
      [containerId]
    );

    return result.rows;
  }

  /**
   * Actualizează un fragment
   * @param {number} id - ID-ul fragmentului
   * @param {Object} fragmentData - Datele actualizate
   * @returns {Promise<Object|null>} Fragmentul actualizat sau null
   */
  async update(id, fragmentData) {
    // Construiește setările pentru actualizare
    const setValues = [];
    const queryParams = [];
    let paramCounter = 1;

    // Adaugă câmpurile care trebuie actualizate
    for (const [key, value] of Object.entries(fragmentData)) {
      if (
        key !== "id" &&
        key !== "file_id" &&
        key !== "fragment_index" &&
        value !== undefined
      ) {
        setValues.push(`${key} = $${paramCounter}`);
        queryParams.push(value);
        paramCounter++;
      }
    }

    // Adaugă ID-ul ca ultimul parametru
    queryParams.push(id);

    // Execută query-ul numai dacă există câmpuri de actualizat
    if (setValues.length === 0) {
      return null;
    }

    const result = await this.db.query(
      `UPDATE ${this.tableName} 
        SET ${setValues.join(", ")} 
        WHERE id = $${paramCounter} 
        RETURNING id, file_id, fragment_index, container_id, fragment_name, size_bytes, checksum`,
      queryParams
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Actualizează containerul unui fragment
   * @param {number} id - ID-ul fragmentului
   * @param {number} containerId - Noul ID al containerului
   * @returns {Promise<boolean>} Succes
   */
  async updateContainer(id, containerId) {
    const result = await this.db.query(
      `UPDATE ${this.tableName} 
        SET container_id = $1 
        WHERE id = $2`,
      [containerId, id]
    );

    return result.rowCount > 0;
  }

  /**
   * Șterge un fragment
   * @param {number} id - ID-ul fragmentului
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
   * Șterge toate fragmentele unui fișier
   * @param {number} fileId - ID-ul fișierului
   * @returns {Promise<number>} Numărul de fragmente șterse
   */
  async deleteByFileId(fileId) {
    const result = await this.db.query(
      `DELETE FROM ${this.tableName} WHERE file_id = $1`,
      [fileId]
    );

    return result.rowCount;
  }

  /**
   * Numără fragmentele unui fișier
   * @param {number} fileId - ID-ul fișierului
   * @returns {Promise<number>} Numărul de fragmente
   */
  async countByFileId(fileId) {
    const result = await this.db.query(
      `SELECT COUNT(*) as count FROM ${this.tableName} WHERE file_id = $1`,
      [fileId]
    );

    return parseInt(result.rows[0].count);
  }

  /**
   * Numără fragmentele dintr-un container
   * @param {number} containerId - ID-ul containerului
   * @returns {Promise<number>} Numărul de fragmente
   */
  async countByContainerId(containerId) {
    const result = await this.db.query(
      `SELECT COUNT(*) as count FROM ${this.tableName} WHERE container_id = $1`,
      [containerId]
    );

    return parseInt(result.rows[0].count);
  }

  /**
   * Calculează spațiul utilizat într-un container
   * @param {number} containerId - ID-ul containerului
   * @returns {Promise<number>} Spațiul utilizat în bytes
   */
  async totalSizeByContainerId(containerId) {
    const result = await this.db.query(
      `SELECT SUM(size_bytes) as total_size FROM ${this.tableName} WHERE container_id = $1`,
      [containerId]
    );

    return parseInt(result.rows[0].total_size || 0);
  }

  /**
   * Găsește containerele cu cele mai multe fragmente (pentru reechilibrare)
   * @param {number} limit - Numărul de containere de returnat
   * @returns {Promise<Array>} Lista de containere cu numărul de fragmente
   */
  async findMostLoadedContainers(limit = 5) {
    const result = await this.db.query(
      `SELECT container_id, COUNT(*) as fragment_count, SUM(size_bytes) as total_size
        FROM ${this.tableName}
        GROUP BY container_id
        ORDER BY fragment_count DESC
        LIMIT $1`,
      [limit]
    );

    return result.rows;
  }

  /**
   * Găsește containerele cu cele mai puține fragmente (pentru reechilibrare)
   * @param {number} limit - Numărul de containere de returnat
   * @returns {Promise<Array>} Lista de containere cu numărul de fragmente
   */
  async findLeastLoadedContainers(limit = 5) {
    const result = await this.db.query(
      `SELECT container_id, COUNT(*) as fragment_count, SUM(size_bytes) as total_size
        FROM ${this.tableName}
        GROUP BY container_id
        ORDER BY fragment_count ASC
        LIMIT $1`,
      [limit]
    );

    return result.rows;
  }

  /**
   * Obține distribuția fragmentelor pe containere
   * @returns {Promise<Array>} Distribuția fragmentelor
   */
  async getContainerDistribution() {
    const result = await this.db.query(
      `SELECT container_id, COUNT(*) as fragment_count, SUM(size_bytes) as total_size
        FROM ${this.tableName}
        GROUP BY container_id
        ORDER BY container_id`
    );

    return result.rows;
  }
}

module.exports = Fragment;
