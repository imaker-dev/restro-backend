const tableService = require('../services/table.service');
const logger = require('../utils/logger');

/**
 * Table Controller - Comprehensive table management
 */
const tableController = {
  // ========================
  // CRUD Operations
  // ========================

  async createTable(req, res, next) {
    try {
      const table = await tableService.create(req.body, req.user.userId);
      res.status(201).json({
        success: true,
        message: 'Table created successfully',
        data: table
      });
    } catch (error) {
      next(error);
    }
  },

  async getTablesByOutlet(req, res, next) {
    try {
      const filters = {
        floorId: req.query.floorId,
        sectionId: req.query.sectionId,
        status: req.query.status,
        isActive: req.query.isActive === 'true' ? true : req.query.isActive === 'false' ? false : undefined
      };
      const tables = await tableService.getByOutlet(req.params.outletId, filters);
      res.json({ success: true, data: tables });
    } catch (error) {
      next(error);
    }
  },

  async getTablesByFloor(req, res, next) {
    try {
      const tables = await tableService.getByFloor(req.params.floorId);
      res.json({ success: true, data: tables });
    } catch (error) {
      next(error);
    }
  },

  async getTableById(req, res, next) {
    try {
      const table = await tableService.getById(req.params.id);
      if (!table) {
        return res.status(404).json({ success: false, message: 'Table not found' });
      }
      res.json({ success: true, data: table });
    } catch (error) {
      next(error);
    }
  },

  async updateTable(req, res, next) {
    try {
      const table = await tableService.update(req.params.id, req.body, req.user.userId);
      if (!table) {
        return res.status(404).json({ success: false, message: 'Table not found' });
      }
      res.json({ success: true, message: 'Table updated successfully', data: table });
    } catch (error) {
      next(error);
    }
  },

  async deleteTable(req, res, next) {
    try {
      await tableService.delete(req.params.id, req.user.userId);
      res.json({ success: true, message: 'Table deleted successfully' });
    } catch (error) {
      next(error);
    }
  },

  // ========================
  // Status Management
  // ========================

  async updateTableStatus(req, res, next) {
    try {
      const table = await tableService.updateStatus(
        req.params.id,
        req.body.status,
        req.user.userId,
        { reason: req.body.reason }
      );
      res.json({
        success: true,
        message: `Table status updated to ${req.body.status}`,
        data: table
      });
    } catch (error) {
      next(error);
    }
  },

  async getRealTimeStatus(req, res, next) {
    try {
      const tables = await tableService.getRealTimeStatus(
        req.params.outletId,
        req.query.floorId || null
      );
      res.json({ success: true, data: tables });
    } catch (error) {
      next(error);
    }
  },

  async getTableStatuses(req, res, next) {
    try {
      const statuses = tableService.getStatuses();
      res.json({ success: true, data: statuses });
    } catch (error) {
      next(error);
    }
  },

  async getTableShapes(req, res, next) {
    try {
      const shapes = tableService.getShapes();
      res.json({ success: true, data: shapes });
    } catch (error) {
      next(error);
    }
  },

  // ========================
  // Session Management
  // ========================

  async startSession(req, res, next) {
    try {
      const result = await tableService.startSession(req.params.id, req.body, req.user.userId);
      res.status(201).json({
        success: true,
        message: 'Table session started',
        data: result
      });
    } catch (error) {
      next(error);
    }
  },

  async endSession(req, res, next) {
    try {
      await tableService.endSession(req.params.id, req.user.userId);
      res.json({ success: true, message: 'Table session ended' });
    } catch (error) {
      next(error);
    }
  },

  async getCurrentSession(req, res, next) {
    try {
      const session = await tableService.getCurrentSession(req.params.id);
      res.json({ success: true, data: session });
    } catch (error) {
      next(error);
    }
  },

  // ========================
  // Merge Operations
  // ========================

  async mergeTables(req, res, next) {
    try {
      const result = await tableService.mergeTables(
        req.params.id,
        req.body.tableIds,
        req.user.userId
      );
      res.json({
        success: true,
        message: 'Tables merged successfully',
        data: result
      });
    } catch (error) {
      next(error);
    }
  },

  async unmergeTables(req, res, next) {
    try {
      await tableService.unmergeTables(req.params.id, req.user.userId);
      res.json({ success: true, message: 'Tables unmerged successfully' });
    } catch (error) {
      next(error);
    }
  },

  async getMergedTables(req, res, next) {
    try {
      const merges = await tableService.getMergedTables(req.params.id);
      res.json({ success: true, data: merges });
    } catch (error) {
      next(error);
    }
  },

  // ========================
  // History & Reports
  // ========================

  async getTableHistory(req, res, next) {
    try {
      const history = await tableService.getHistory(req.params.id, parseInt(req.query.limit) || 50);
      res.json({ success: true, data: history });
    } catch (error) {
      next(error);
    }
  },

  async getSessionHistory(req, res, next) {
    try {
      const sessions = await tableService.getSessionHistory(
        req.params.id,
        req.query.fromDate,
        req.query.toDate,
        parseInt(req.query.limit) || 100
      );
      res.json({ success: true, data: sessions });
    } catch (error) {
      next(error);
    }
  },

  async getTableReport(req, res, next) {
    try {
      const report = await tableService.getTableReport(
        req.params.id,
        req.query.fromDate,
        req.query.toDate
      );
      res.json({ success: true, data: report });
    } catch (error) {
      next(error);
    }
  },

  async getFloorReport(req, res, next) {
    try {
      const report = await tableService.getFloorReport(
        req.params.floorId,
        req.query.fromDate,
        req.query.toDate
      );
      res.json({ success: true, data: report });
    } catch (error) {
      next(error);
    }
  },

  async getRunningKots(req, res, next) {
    try {
      const kots = await tableService.getRunningKots(req.params.id);
      res.json({ success: true, data: kots });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = tableController;
