/**
 * Model pentru containere de stocare
 */
class Container {
  /**
   * Inițializăm modelul containerului
   * @param {Object} db - Conexiunea la baza de date
   */
  constructor(db) {
    this.db = db;
    this.tableName = "containers";
  }

  /**
   * Creează sau actualizează un container
   * @param {Object} containerData - Datele containerului
   * @returns {Promise<Object>} Containerul creat/actualizat
   */
  async createOrUpdate(containerData) {
    const {
      id,
      status,
      last_check,
      storage_total = 1073741824,
    } = containerData; // 1GB default

    const result = await this.db.query(
      `INSERT INTO ${this.tableName} 
        (id, status, last_check, storage_total, storage_used) 
        VALUES ($1, $2, $3, $4, 0) 
        ON CONFLICT (id) 
        DO UPDATE SET 
          status = EXCLUDED.status,
          last_check = EXCLUDED.last_check,
          storage_total = EXCLUDED.storage_total
        RETURNING id, status, last_check, storage_used, storage_total`,
      [id, status, last_check || new Date(), storage_total]
    );

    return result.rows[0];
  }

  /**
   * Actualizează spațiul folosit pentru un container
   */
  async updateStorageUsed(containerId) {
    try {
      console.log(`[DB UPDATE] Updating storage for container ${containerId}`);

      // Calculează spațiul folosit din tabela fragments
      const result = await this.db.query(
        `UPDATE ${this.tableName} 
         SET storage_used = (
           SELECT COALESCE(SUM(size_bytes), 0) 
           FROM fragments 
           WHERE container_id = $1
         ),
         last_check = NOW()
         WHERE id = $1 
         RETURNING id, storage_used, storage_total`,
        [containerId]
      );
      console.log(`[DB UPDATE] Query result:`, result.rows);

      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      console.error(
        `Eroare la actualizarea storage pentru containerul ${containerId}:`,
        error
      );
      throw error;
    }
  }
  /**
   * Obține toate containerele cu informații despre stocare
   */
  async getAllWithStorageStats() {
    const result = await this.db.query(
      `SELECT 
        c.id,
        c.status,
        c.last_check,
        c.storage_used,
        c.storage_total,
        c.storage_total - c.storage_used as storage_available,
        ROUND((c.storage_used::FLOAT / c.storage_total::FLOAT) * 100) as usage_percentage,
        COALESCE(f.fragment_count, 0) as fragment_count,
        -- Formatarea spațiului folosit
        CASE 
          WHEN c.storage_used < 1024 THEN c.storage_used || ' B'
          WHEN c.storage_used < 1048576 THEN ROUND(c.storage_used / 1024.0) || ' KB'
          WHEN c.storage_used < 1073741824 THEN ROUND(c.storage_used / 1048576.0) || ' MB'
          ELSE ROUND(c.storage_used / 1073741824.0) || ' GB'
        END as storage_used_formatted,
        -- Formatarea spațiului total
        CASE 
          WHEN c.storage_total < 1024 THEN c.storage_total || ' B'
          WHEN c.storage_total < 1048576 THEN ROUND(c.storage_total / 1024.0) || ' KB'
          WHEN c.storage_total < 1073741824 THEN ROUND(c.storage_total / 1048576.0) || ' MB'
          ELSE ROUND(c.storage_total / 1073741824.0) || ' GB'
        END as storage_total_formatted,
        -- Formatarea spațiului disponibil
        CASE 
          WHEN (c.storage_total - c.storage_used) < 1024 THEN (c.storage_total - c.storage_used) || ' B'
          WHEN (c.storage_total - c.storage_used) < 1048576 THEN ROUND((c.storage_total - c.storage_used) / 1024.0) || ' KB'
          WHEN (c.storage_total - c.storage_used) < 1073741824 THEN ROUND((c.storage_total - c.storage_used) / 1048576.0) || ' MB'
          ELSE ROUND((c.storage_total - c.storage_used) / 1073741824.0) || ' GB'
        END as storage_available_formatted
       FROM ${this.tableName} c
       LEFT JOIN (
         SELECT 
           container_id,
           COUNT(*) as fragment_count
         FROM fragments
         GROUP BY container_id
       ) f ON c.id = f.container_id
       ORDER BY c.id`
    );

    return result.rows;
  }
  /**
   * Găsește un container după ID
   * @param {number} id - ID-ul containerului
   * @returns {Promise<Object|null>} Containerul găsit sau null
   */
  async findById(id) {
    const result = await this.db.query(
      `SELECT * FROM ${this.tableName} WHERE id = $1`,
      [id]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Obține toate containerele cu statistici
   * @returns {Promise<Array>} Lista containerelor cu statistici
   */
  async getAllWithStats() {
    const result = await this.db.query(
      `SELECT 
        c.id,
        c.status,
        c.last_check,
        COALESCE(f.fragment_count, 0) as fragment_count,
        COALESCE(f.total_size, 0) as total_size
       FROM ${this.tableName} c
       LEFT JOIN (
         SELECT 
           container_id,
           COUNT(*) as fragment_count,
           SUM(size_bytes) as total_size
         FROM fragments
         GROUP BY container_id
       ) f ON c.id = f.container_id
       ORDER BY c.id`
    );

    return result.rows;
  }
  /**
   * Găsește containerele cu spațiu redus
   */
  async getContainersWithLowSpace(thresholdPercentage = 80) {
    const result = await this.db.query(
      `SELECT 
        id,
        status,
        storage_used,
        storage_total,
        ROUND(((storage_used::FLOAT / storage_total::FLOAT) * 100)::numeric,2) as usage_percentage
       FROM ${this.tableName}
       WHERE (storage_used::FLOAT / storage_total::FLOAT) * 100 > $1
       ORDER BY usage_percentage DESC`,
      [thresholdPercentage]
    );

    return result.rows;
  }

  /**
   * Actualizează spațiul total pentru un container
   */
  async updateStorageTotal(containerId, newTotal) {
    const result = await this.db.query(
      `UPDATE ${this.tableName} 
       SET storage_total = $1, last_check = NOW() 
       WHERE id = $2 
       RETURNING id, storage_used, storage_total`,
      [newTotal, containerId]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Sincronizează spațiul folosit pentru toate containerele
   */
  async syncAllStorageUsed() {
    try {
      const result = await this.db.query(
        `UPDATE ${this.tableName} 
         SET storage_used = (
           SELECT COALESCE(SUM(size_bytes), 0) 
           FROM fragments 
           WHERE container_id = ${this.tableName}.id
         ),
         last_check = NOW()
         RETURNING id, storage_used`
      );

      return result.rows;
    } catch (error) {
      console.error(
        "Eroare la sincronizarea storage pentru toate containerele:",
        error
      );
      throw error;
    }
  }

  /**
   * Obține statistici generale despre stocare
   */
  async getStorageOverview() {
    const result = await this.db.query(
      `SELECT 
        COUNT(*) as total_containers,
        SUM(storage_used) as total_used,
        SUM(storage_total) as total_capacity,
        SUM(storage_total - storage_used) as total_available,
        ROUND(AVG((storage_used::FLOAT / storage_total::FLOAT) * 100)) as avg_usage_percentage,
        COUNT(CASE WHEN (storage_used::FLOAT / storage_total::FLOAT) * 100 > 80 THEN 1 END) as containers_near_full
       FROM ${this.tableName}`
    );

    return result.rows[0];
  }

  /**
   * Actualizează statusul unui container
   * @param {number} id - ID-ul containerului
   * @param {string} status - Noul status ('active', 'inactive', 'error')
   * @returns {Promise<Object|null>} Containerul actualizat
   */
  async updateStatus(id, status) {
    const result = await this.db.query(
      `UPDATE ${this.tableName} 
       SET status = $1, last_check = NOW() 
       WHERE id = $2 
       RETURNING id, status, last_check`,
      [status, id]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Actualizează last_check pentru un container
   * @param {number} id - ID-ul containerului
   * @returns {Promise<Object|null>} Containerul actualizat
   */
  async updateLastCheck(id) {
    const result = await this.db.query(
      `UPDATE ${this.tableName} 
       SET last_check = NOW() 
       WHERE id = $1 
       RETURNING id, status, last_check`,
      [id]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Obține containere după status
   * @param {string} status - Statusul căutat
   * @returns {Promise<Array>} Lista containerelor
   */
  async findByStatus(status) {
    const result = await this.db.query(
      `SELECT * FROM ${this.tableName} WHERE status = $1 ORDER BY id`,
      [status]
    );

    return result.rows;
  }

  /**
   * Obține statistici generale despre containere
   * @returns {Promise<Object>} Statistici generale
   */
  async getGeneralStats() {
    const result = await this.db.query(
      `SELECT 
        COUNT(*) as total_containers,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_containers,
        COUNT(CASE WHEN status = 'inactive' THEN 1 END) as inactive_containers,
        COUNT(CASE WHEN status = 'error' THEN 1 END) as error_containers
       FROM ${this.tableName}`
    );

    return result.rows[0];
  }

  /**
   * Șterge un container (folosit pentru cleanup)
   * @param {number} id - ID-ul containerului
   * @returns {Promise<boolean>} Succes
   */
  async delete(id) {
    const result = await this.db.query(
      `DELETE FROM ${this.tableName} WHERE id = $1`,
      [id]
    );

    return result.rowCount > 0;
  }
}

module.exports = Container;
