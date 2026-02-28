/**
 * Bulk Upload Controller
 * Handles CSV-based bulk menu upload endpoints
 */

const bulkUploadService = require('../services/bulkUpload.service');
const logger = require('../utils/logger');

const bulkUploadController = {
  /**
   * POST /api/v1/bulk-upload/menu/validate
   * Validate CSV without inserting data
   */
  async validateUpload(req, res) {
    try {
      const outletId = parseInt(req.body.outletId || req.query.outletId || req.user?.outletId);
      
      if (!outletId) {
        return res.status(400).json({ success: false, message: 'outletId is required' });
      }

      if (!req.file && !req.body.csvContent) {
        return res.status(400).json({ success: false, message: 'CSV file or csvContent is required' });
      }

      const csvContent = req.file ? req.file.buffer.toString('utf-8') : req.body.csvContent;

      // Parse CSV
      const parseResult = bulkUploadService.parseCSV(csvContent);
      if (!parseResult.success) {
        return res.status(400).json({ success: false, message: parseResult.error });
      }

      // Validate records
      const validation = await bulkUploadService.validateRecords(parseResult.records, outletId);

      res.json({
        success: true,
        data: {
          isValid: validation.isValid,
          summary: validation.summary,
          errors: validation.errors,
          warnings: validation.warnings
        }
      });
    } catch (error) {
      logger.error('Bulk upload validation error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  /**
   * POST /api/v1/bulk-upload/menu
   * Upload and process CSV to create menu items
   */
  async uploadMenu(req, res) {
    try {
      const outletId = parseInt(req.body.outletId || req.query.outletId || req.user?.outletId);
      const userId = req.user?.userId;

      if (!outletId) {
        return res.status(400).json({ success: false, message: 'outletId is required' });
      }

      if (!req.file && !req.body.csvContent) {
        return res.status(400).json({ success: false, message: 'CSV file or csvContent is required' });
      }

      const csvContent = req.file ? req.file.buffer.toString('utf-8') : req.body.csvContent;
      const filename = req.file?.originalname || 'inline-upload.csv';
      const skipValidation = req.body.skipValidation === 'true' || req.body.skipValidation === true;

      // Parse CSV
      const parseResult = bulkUploadService.parseCSV(csvContent);
      if (!parseResult.success) {
        return res.status(400).json({ success: false, message: parseResult.error });
      }

      // Validate records (unless skipped)
      if (!skipValidation) {
        const validation = await bulkUploadService.validateRecords(parseResult.records, outletId);
        if (!validation.isValid) {
          return res.status(400).json({
            success: false,
            message: 'Validation failed. Fix errors before uploading.',
            data: {
              summary: validation.summary,
              errors: validation.errors,
              warnings: validation.warnings
            }
          });
        }
      }

      // Process records
      const result = await bulkUploadService.processRecords(parseResult.records, outletId, userId);

      // Log the upload
      await bulkUploadService.logUpload(outletId, userId, filename, result);

      if (result.success) {
        res.status(201).json({
          success: true,
          message: 'Bulk upload completed successfully',
          data: {
            created: result.created,
            skipped: result.skipped,
            errors: result.errors
          }
        });
      } else {
        res.status(400).json({
          success: false,
          message: 'Bulk upload failed',
          data: {
            created: result.created,
            skipped: result.skipped,
            errors: result.errors
          }
        });
      }
    } catch (error) {
      logger.error('Bulk upload error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  /**
   * GET /api/v1/bulk-upload/menu/template
   * Download CSV template
   */
  async getTemplate(req, res) {
    try {
      const template = bulkUploadService.generateTemplate();

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=menu-upload-template.csv');
      res.send(template);
    } catch (error) {
      logger.error('Get template error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  /**
   * GET /api/v1/bulk-upload/menu/template/json
   * Get template structure as JSON (for frontend form building)
   */
  async getTemplateStructure(req, res) {
    try {
      const structure = bulkUploadService.getTemplateStructure();
      res.json({ success: true, data: structure });
    } catch (error) {
      logger.error('Get template structure error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  /**
   * GET /api/v1/bulk-upload/history
   * Get upload history for outlet
   */
  async getHistory(req, res) {
    try {
      const outletId = parseInt(req.query.outletId || req.user?.outletId);
      const limit = parseInt(req.query.limit) || 20;

      if (!outletId) {
        return res.status(400).json({ success: false, message: 'outletId is required' });
      }

      const history = await bulkUploadService.getUploadHistory(outletId, limit);
      res.json({ success: true, data: history });
    } catch (error) {
      logger.error('Get upload history error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  /**
   * POST /api/v1/bulk-upload/menu/preview
   * Parse CSV and return preview of what will be created
   */
  async previewUpload(req, res) {
    try {
      const outletId = parseInt(req.body.outletId || req.query.outletId || req.user?.outletId);

      if (!outletId) {
        return res.status(400).json({ success: false, message: 'outletId is required' });
      }

      if (!req.file && !req.body.csvContent) {
        return res.status(400).json({ success: false, message: 'CSV file or csvContent is required' });
      }

      const csvContent = req.file ? req.file.buffer.toString('utf-8') : req.body.csvContent;

      // Parse CSV
      const parseResult = bulkUploadService.parseCSV(csvContent);
      if (!parseResult.success) {
        return res.status(400).json({ success: false, message: parseResult.error });
      }

      // Group records by type for preview
      const preview = {
        categories: [],
        items: [],
        variants: [],
        addonGroups: [],
        addons: []
      };

      let currentCategory = null;
      let currentItem = null;
      let currentGroup = null;

      for (const row of parseResult.records) {
        const type = (row.Type || row.type || '').toUpperCase().trim();
        const name = row.Name || row.name;

        switch (type) {
          case 'CATEGORY':
            currentCategory = name;
            preview.categories.push({
              name,
              parent: row.Parent || row.parent || null,
              description: row.Description || row.description,
              serviceType: row.ServiceType || row.servicetype || 'both'
            });
            break;

          case 'ITEM':
            currentItem = name;
            preview.items.push({
              name,
              category: row.Category || row.category || currentCategory,
              price: row.Price || row.price,
              foodType: row.ItemType || row.itemtype || row.FoodType || row.foodtype || 'veg',
              gst: row.GST || row.gst || null,
              vat: row.VAT || row.vat || null,
              station: row.Station || row.station,
              serviceType: row.ServiceType || row.servicetype || 'both'
            });
            break;

          case 'VARIANT':
            preview.variants.push({
              name,
              item: row.Item || row.item || currentItem,
              price: row.Price || row.price,
              isDefault: row.Default || row.default
            });
            break;

          case 'ADDON_GROUP':
            currentGroup = name;
            preview.addonGroups.push({
              name,
              selectionType: row.SelectionType || row.selectiontype || 'multiple',
              min: row.Min || row.min || 0,
              max: row.Max || row.max || 10
            });
            break;

          case 'ADDON':
            preview.addons.push({
              name,
              group: row.Group || row.group || currentGroup,
              price: row.Price || row.price || 0,
              foodType: row.FoodType || row.foodtype || 'veg'
            });
            break;
        }
      }

      res.json({
        success: true,
        data: {
          totalRows: parseResult.records.length,
          preview
        }
      });
    } catch (error) {
      logger.error('Preview upload error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }
};

module.exports = bulkUploadController;
