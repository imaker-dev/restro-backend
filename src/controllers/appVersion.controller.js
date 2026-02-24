const appVersionService = require('../services/appVersion.service');
const logger = require('../utils/logger');

const appVersionController = {
  /**
   * GET /api/v1/app/version
   * Get latest app version (public endpoint for update checks)
   */
  async getLatestVersion(req, res) {
    try {
      const channel = req.query.channel || 'stable';
      const currentVersion = req.headers['x-app-version'] || req.query.version;
      const platform = req.headers['x-platform'] || req.query.platform;
      
      let result;
      
      if (currentVersion) {
        // If current version provided, do full update check
        result = await appVersionService.checkForUpdate(currentVersion, platform, channel);
      } else {
        // Just return latest version info
        result = await appVersionService.getLatestVersion(channel);
      }
      
      if (!result) {
        return res.status(404).json({
          success: false,
          message: 'No version information available'
        });
      }
      
      return res.json({
        success: true,
        message: 'OK',
        data: result
      });
    } catch (error) {
      logger.error('Error fetching app version:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch update info'
      });
    }
  },

  /**
   * GET /api/v1/app/version/checksum
   * Get checksum for a specific platform and version
   */
  async getChecksum(req, res) {
    try {
      const { platform, version } = req.query;
      
      if (!platform || !version) {
        return res.status(400).json({
          success: false,
          message: 'Platform and version are required'
        });
      }
      
      const validPlatforms = ['android', 'ios', 'windows', 'mac', 'linux'];
      if (!validPlatforms.includes(platform)) {
        return res.status(400).json({
          success: false,
          message: `Invalid platform. Must be one of: ${validPlatforms.join(', ')}`
        });
      }
      
      const result = await appVersionService.getChecksum(platform, version);
      
      if (!result) {
        return res.status(404).json({
          success: false,
          message: 'Version not found'
        });
      }
      
      return res.json({
        success: true,
        data: result
      });
    } catch (error) {
      logger.error('Error fetching checksum:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch checksum'
      });
    }
  },

  /**
   * GET /api/v1/app/versions
   * Get all versions (admin)
   */
  async getAllVersions(req, res) {
    try {
      const { channel, limit = 20, offset = 0 } = req.query;
      
      const result = await appVersionService.getAllVersions({
        channel,
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
      
      return res.json({
        success: true,
        data: result.versions,
        pagination: result.pagination
      });
    } catch (error) {
      logger.error('Error fetching app versions:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch versions'
      });
    }
  },

  /**
   * GET /api/v1/app/versions/:id
   * Get version by ID (admin)
   */
  async getVersionById(req, res) {
    try {
      const { id } = req.params;
      
      const version = await appVersionService.getVersionById(id);
      
      if (!version) {
        return res.status(404).json({
          success: false,
          message: 'Version not found'
        });
      }
      
      return res.json({
        success: true,
        data: version
      });
    } catch (error) {
      logger.error('Error fetching app version:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch version'
      });
    }
  },

  /**
   * POST /api/v1/app/versions
   * Create new version (admin)
   */
  async createVersion(req, res) {
    try {
      const userId = req.user?.userId;
      
      if (!req.body.version) {
        return res.status(400).json({
          success: false,
          message: 'Version is required'
        });
      }
      
      // Validate version format
      const versionRegex = /^\d+\.\d+(\.\d+)?$/;
      if (!versionRegex.test(req.body.version)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid version format. Use semantic versioning (e.g., 1.0.0 or 1.0)'
        });
      }
      
      const version = await appVersionService.createVersion(req.body, userId);
      
      return res.status(201).json({
        success: true,
        message: 'Version created successfully',
        data: version
      });
    } catch (error) {
      logger.error('Error creating app version:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to create version'
      });
    }
  },

  /**
   * PUT /api/v1/app/versions/:id
   * Update version (admin)
   */
  async updateVersion(req, res) {
    try {
      const { id } = req.params;
      
      // Check if version exists
      const existing = await appVersionService.getVersionById(id);
      if (!existing) {
        return res.status(404).json({
          success: false,
          message: 'Version not found'
        });
      }
      
      // Validate version format if provided
      if (req.body.version) {
        const versionRegex = /^\d+\.\d+(\.\d+)?$/;
        if (!versionRegex.test(req.body.version)) {
          return res.status(400).json({
            success: false,
            message: 'Invalid version format. Use semantic versioning (e.g., 1.0.0 or 1.0)'
          });
        }
      }
      
      const version = await appVersionService.updateVersion(id, req.body);
      
      return res.json({
        success: true,
        message: 'Version updated successfully',
        data: version
      });
    } catch (error) {
      logger.error('Error updating app version:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to update version'
      });
    }
  },

  /**
   * DELETE /api/v1/app/versions/:id
   * Delete version (admin)
   */
  async deleteVersion(req, res) {
    try {
      const { id } = req.params;
      
      const deleted = await appVersionService.deleteVersion(id);
      
      if (!deleted) {
        return res.status(404).json({
          success: false,
          message: 'Version not found'
        });
      }
      
      return res.json({
        success: true,
        message: 'Version deleted successfully'
      });
    } catch (error) {
      logger.error('Error deleting app version:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to delete version'
      });
    }
  }
};

module.exports = appVersionController;
