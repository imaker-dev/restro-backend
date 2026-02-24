const { getPool } = require('../database');
const logger = require('../utils/logger');

const appVersionService = {
  /**
   * Get the latest active app version
   * @param {string} channel - Release channel (stable, beta, alpha)
   * @returns {Object} Latest version info
   */
  async getLatestVersion(channel = 'stable') {
    const pool = getPool();
    
    const [rows] = await pool.query(
      `SELECT 
        id,
        version,
        build,
        force_update,
        release_notes,
        released_at,
        android_url,
        ios_url,
        windows_url,
        mac_url,
        linux_url,
        android_min_version,
        ios_min_version,
        windows_min_version,
        mac_min_version,
        linux_min_version,
        android_sha256,
        ios_sha256,
        windows_sha256,
        mac_sha256,
        linux_sha256,
        channel
      FROM app_versions 
      WHERE is_active = TRUE AND channel = ?
      ORDER BY released_at DESC 
      LIMIT 1`,
      [channel]
    );

    if (rows.length === 0) {
      return null;
    }

    const row = rows[0];
    
    // Return flattened format for frontend compatibility
    return {
      version: row.version,
      build: row.build,
      force_update: Boolean(row.force_update),
      release_notes: row.release_notes,
      release_date: row.released_at,
      android_url: row.android_url,
      ios_url: row.ios_url,
      windows_url: row.windows_url,
      mac_url: row.mac_url,
      linux_url: row.linux_url,
      // Also include nested format for future use
      android: row.android_url ? {
        store: 'play_store',
        url: row.android_url,
        min_supported_version: row.android_min_version,
        sha256: row.android_sha256
      } : null,
      ios: row.ios_url ? {
        store: 'app_store',
        url: row.ios_url,
        min_supported_version: row.ios_min_version,
        sha256: row.ios_sha256
      } : null,
      windows: row.windows_url ? {
        type: 'inno_setup',
        url: row.windows_url,
        min_supported_version: row.windows_min_version,
        sha256: row.windows_sha256
      } : null,
      macos: row.mac_url ? {
        type: 'dmg',
        url: row.mac_url,
        min_supported_version: row.mac_min_version,
        sha256: row.mac_sha256
      } : null,
      linux: row.linux_url ? {
        type: 'appimage',
        url: row.linux_url,
        min_supported_version: row.linux_min_version,
        sha256: row.linux_sha256
      } : null
    };
  },

  /**
   * Check if update is required based on current version
   * @param {string} currentVersion - Current app version
   * @param {string} platform - Platform (android, ios, windows, macos, linux)
   * @param {string} channel - Release channel
   * @returns {Object} Update check result
   */
  async checkForUpdate(currentVersion, platform = null, channel = 'stable') {
    const latestVersion = await this.getLatestVersion(channel);
    
    if (!latestVersion) {
      return {
        update_available: false,
        message: 'No version information available'
      };
    }

    const isNewer = this.compareVersions(latestVersion.version, currentVersion) > 0;
    
    // Check platform-specific minimum version for force update
    let forceUpdate = latestVersion.force_update;
    if (platform && currentVersion) {
      const minVersionKey = `${platform}_min_version`;
      const platformInfo = latestVersion[platform] || latestVersion[platform === 'macos' ? 'macos' : platform];
      if (platformInfo && platformInfo.min_supported_version) {
        const belowMinimum = this.compareVersions(platformInfo.min_supported_version, currentVersion) > 0;
        if (belowMinimum) {
          forceUpdate = true;
        }
      }
    }

    return {
      update_available: isNewer,
      force_update: isNewer ? forceUpdate : false,
      current_version: currentVersion,
      latest_version: latestVersion.version,
      ...latestVersion
    };
  },

  /**
   * Compare two semantic versions
   * @param {string} v1 - First version
   * @param {string} v2 - Second version
   * @returns {number} 1 if v1 > v2, -1 if v1 < v2, 0 if equal
   */
  compareVersions(v1, v2) {
    if (!v1 || !v2) return 0;
    
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);
    
    const maxLength = Math.max(parts1.length, parts2.length);
    
    for (let i = 0; i < maxLength; i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;
      
      if (p1 > p2) return 1;
      if (p1 < p2) return -1;
    }
    
    return 0;
  },

  /**
   * Get all versions (for admin)
   * @param {Object} options - Query options
   * @returns {Array} List of versions
   */
  async getAllVersions(options = {}) {
    const pool = getPool();
    const { channel, limit = 20, offset = 0 } = options;
    
    let query = `SELECT * FROM app_versions`;
    const params = [];
    
    if (channel) {
      query += ` WHERE channel = ?`;
      params.push(channel);
    }
    
    query += ` ORDER BY released_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);
    
    const [rows] = await pool.query(query, params);
    
    // Get total count
    let countQuery = `SELECT COUNT(*) as total FROM app_versions`;
    const countParams = [];
    if (channel) {
      countQuery += ` WHERE channel = ?`;
      countParams.push(channel);
    }
    const [[{ total }]] = await pool.query(countQuery, countParams);
    
    return {
      versions: rows,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + rows.length < total
      }
    };
  },

  /**
   * Create a new version
   * @param {Object} data - Version data
   * @param {number} userId - User creating the version
   * @returns {Object} Created version
   */
  async createVersion(data, userId = null) {
    const pool = getPool();
    
    const {
      version,
      build,
      force_update = false,
      release_notes,
      android_url,
      ios_url,
      windows_url,
      mac_url,
      linux_url,
      android_min_version,
      ios_min_version,
      windows_min_version,
      mac_min_version,
      linux_min_version,
      android_sha256,
      ios_sha256,
      windows_sha256,
      mac_sha256,
      linux_sha256,
      is_active = true,
      channel = 'stable'
    } = data;

    // If this version is active, deactivate others in same channel
    if (is_active) {
      await pool.query(
        `UPDATE app_versions SET is_active = FALSE WHERE channel = ?`,
        [channel]
      );
    }

    const [result] = await pool.query(
      `INSERT INTO app_versions (
        version, build, force_update, release_notes,
        android_url, ios_url, windows_url, mac_url, linux_url,
        android_min_version, ios_min_version, windows_min_version, mac_min_version, linux_min_version,
        android_sha256, ios_sha256, windows_sha256, mac_sha256, linux_sha256,
        is_active, channel, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        version, build, force_update, release_notes,
        android_url, ios_url, windows_url, mac_url, linux_url,
        android_min_version, ios_min_version, windows_min_version, mac_min_version, linux_min_version,
        android_sha256, ios_sha256, windows_sha256, mac_sha256, linux_sha256,
        is_active, channel, userId
      ]
    );

    logger.info(`App version ${version} created by user ${userId}`);
    
    return this.getVersionById(result.insertId);
  },

  /**
   * Update a version
   * @param {number} id - Version ID
   * @param {Object} data - Update data
   * @returns {Object} Updated version
   */
  async updateVersion(id, data) {
    const pool = getPool();
    
    const fields = [];
    const values = [];
    
    const allowedFields = [
      'version', 'build', 'force_update', 'release_notes',
      'android_url', 'ios_url', 'windows_url', 'mac_url', 'linux_url',
      'android_min_version', 'ios_min_version', 'windows_min_version', 'mac_min_version', 'linux_min_version',
      'android_sha256', 'ios_sha256', 'windows_sha256', 'mac_sha256', 'linux_sha256',
      'is_active', 'channel'
    ];
    
    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        fields.push(`${field} = ?`);
        values.push(data[field]);
      }
    }
    
    if (fields.length === 0) {
      return this.getVersionById(id);
    }

    // If setting this version as active, deactivate others
    if (data.is_active === true) {
      const [existing] = await pool.query(`SELECT channel FROM app_versions WHERE id = ?`, [id]);
      if (existing.length > 0) {
        await pool.query(
          `UPDATE app_versions SET is_active = FALSE WHERE channel = ? AND id != ?`,
          [existing[0].channel, id]
        );
      }
    }
    
    values.push(id);
    
    await pool.query(
      `UPDATE app_versions SET ${fields.join(', ')} WHERE id = ?`,
      values
    );
    
    logger.info(`App version ${id} updated`);
    
    return this.getVersionById(id);
  },

  /**
   * Get version by ID
   * @param {number} id - Version ID
   * @returns {Object} Version
   */
  async getVersionById(id) {
    const pool = getPool();
    const [rows] = await pool.query(`SELECT * FROM app_versions WHERE id = ?`, [id]);
    return rows[0] || null;
  },

  /**
   * Delete a version
   * @param {number} id - Version ID
   * @returns {boolean} Success
   */
  async deleteVersion(id) {
    const pool = getPool();
    const [result] = await pool.query(`DELETE FROM app_versions WHERE id = ?`, [id]);
    return result.affectedRows > 0;
  },

  /**
   * Get checksum for a specific platform and version
   * @param {string} platform - Platform
   * @param {string} version - Version
   * @returns {Object} Checksum info
   */
  async getChecksum(platform, version) {
    const pool = getPool();
    
    const sha256Field = `${platform}_sha256`;
    const urlField = `${platform}_url`;
    
    const [rows] = await pool.query(
      `SELECT ${sha256Field} as sha256, ${urlField} as url FROM app_versions WHERE version = ?`,
      [version]
    );
    
    if (rows.length === 0) {
      return null;
    }
    
    return {
      sha256: rows[0].sha256,
      url: rows[0].url
    };
  }
};

module.exports = appVersionService;
