/**
 * Printer Controller
 * Handles printer management, print jobs, and bridge API
 */

const printerService = require('../services/printer.service');
const logger = require('../utils/logger');

function extractBridgeApiKey(headers = {}) {
  const xApiKey = headers['x-api-key'];
  if (typeof xApiKey === 'string' && xApiKey.trim()) {
    return xApiKey.trim();
  }

  const authorization = headers.authorization;
  if (typeof authorization === 'string') {
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (match && match[1].trim()) {
      return match[1].trim();
    }
  }

  return null;
}

const printerController = {
  // ========================
  // PRINTER MANAGEMENT
  // ========================

  async createPrinter(req, res) {
    try {
      // Get outletId from body, query, or user context
      const outletId = req.body.outletId || req.query.outletId || req.user?.outletId;
      
      if (!outletId) {
        return res.status(400).json({ success: false, message: 'outletId is required' });
      }

      const printer = await printerService.createPrinter({
        ...req.body,
        outletId: parseInt(outletId)
      });
      res.status(201).json({ success: true, message: 'Printer created', data: printer });
    } catch (error) {
      logger.error('Create printer error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async getPrinters(req, res) {
    try {
      const { outletId } = req.params;
      const printers = await printerService.getPrinters(outletId, req.query);
      res.json({ success: true, data: printers });
    } catch (error) {
      logger.error('Get printers error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async getPrinter(req, res) {
    try {
      const printer = await printerService.getPrinterById(req.params.id);
      if (!printer) {
        return res.status(404).json({ success: false, message: 'Printer not found' });
      }
      res.json({ success: true, data: printer });
    } catch (error) {
      logger.error('Get printer error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async updatePrinter(req, res) {
    try {
      await printerService.updatePrinter(req.params.id, req.body);
      const printer = await printerService.getPrinterById(req.params.id);
      res.json({ success: true, message: 'Printer updated', data: printer });
    } catch (error) {
      logger.error('Update printer error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // ========================
  // PRINT JOBS
  // ========================

  async createPrintJob(req, res) {
    try {
      const job = await printerService.createPrintJob({
        ...req.body,
        createdBy: req.user.userId
      });
      res.status(201).json({ success: true, message: 'Print job created', data: job });
    } catch (error) {
      logger.error('Create print job error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async getPendingJobs(req, res) {
    try {
      const { outletId, station } = req.params;
      const jobs = await printerService.getPendingJobs(outletId, station);
      res.json({ success: true, data: jobs });
    } catch (error) {
      logger.error('Get pending jobs error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async markJobPrinted(req, res) {
    try {
      await printerService.markJobPrinted(req.params.id, req.body.bridgeId);
      res.json({ success: true, message: 'Job marked as printed' });
    } catch (error) {
      logger.error('Mark job printed error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async markJobFailed(req, res) {
    try {
      await printerService.markJobFailed(req.params.id, req.body.error, req.body.bridgeId);
      res.json({ success: true, message: 'Job marked as failed' });
    } catch (error) {
      logger.error('Mark job failed error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async retryJob(req, res) {
    try {
      await printerService.retryJob(req.params.id);
      res.json({ success: true, message: 'Job queued for retry' });
    } catch (error) {
      logger.error('Retry job error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async cancelJob(req, res) {
    try {
      await printerService.cancelJob(req.params.id, req.body.reason);
      res.json({ success: true, message: 'Job cancelled' });
    } catch (error) {
      logger.error('Cancel job error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // ========================
  // HIGH-LEVEL PRINT ACTIONS
  // ========================

  async printTestPage(req, res) {
    try {
      const { outletId, station } = req.params;
      const job = await printerService.printTestPage(outletId, station, req.user.userId);
      res.json({ success: true, message: 'Test page queued', data: job });
    } catch (error) {
      logger.error('Print test page error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async openCashDrawer(req, res) {
    try {
      const { outletId } = req.params;
      const job = await printerService.openCashDrawer(outletId, req.user.userId);
      res.json({ success: true, message: 'Cash drawer command sent', data: job });
    } catch (error) {
      logger.error('Open cash drawer error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async getJobStats(req, res) {
    try {
      const { outletId } = req.params;
      const stats = await printerService.getJobStats(outletId, req.query.date);
      res.json({ success: true, data: stats });
    } catch (error) {
      logger.error('Get job stats error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // ========================
  // BRIDGE MANAGEMENT
  // ========================

  async createBridge(req, res) {
    try {
      const bridge = await printerService.createBridge({
        outletId: req.body.outletId,
        name: req.body.name,
        bridgeCode: req.body.bridgeCode,
        assignedStations: req.body.assignedStations
      });
      res.status(201).json({ 
        success: true, 
        message: 'Bridge created. Save the API key - it will not be shown again.',
        data: bridge 
      });
    } catch (error) {
      logger.error('Create bridge error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async getBridges(req, res) {
    try {
      const { outletId } = req.params;
      const bridges = await printerService.getBridges(outletId);
      res.json({ success: true, data: bridges });
    } catch (error) {
      logger.error('Get bridges error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // ========================
  // BRIDGE POLLING API (for local bridge agents)
  // ========================

  async bridgePoll(req, res) {
    try {
      const { outletId, bridgeCode } = req.params;
      const apiKey = extractBridgeApiKey(req.headers);

      // API key is now optional - if not provided, uses simple bridge code lookup
      const bridge = await printerService.validateBridgeApiKey(outletId, bridgeCode, apiKey);
      if (!bridge) {
        return res.status(401).json({ success: false, message: 'Bridge not found or inactive' });
      }
      // Get assigned stations
      const stations = bridge.assigned_stations ? JSON.parse(bridge.assigned_stations) : [];
      
      // Check if bridge uses dynamic polling ('*' means poll for ANY pending job)
      const isDynamicPolling = stations.includes('*') || stations.length === 0;
      
      let job = null;
      if (isDynamicPolling) {
        // Dynamic polling - get any pending job for this outlet
        logger.debug(`Bridge ${bridgeCode} polling dynamically for ANY station`);
        job = await printerService.getNextPendingJobAny(outletId);
      } else {
        // Fixed station polling - iterate through assigned stations
        logger.debug(`Bridge ${bridgeCode} polling for stations: [${stations.join(', ')}]`);
        for (const station of stations) {
          job = await printerService.getNextPendingJob(outletId, station);
          if (job) break;
        }
      }


      // Update bridge status
      await printerService.updateBridgeStatus(bridge.id, true, req.ip);

      res.json({ 
        success: true, 
        data: job,
        bridgeId: bridge.id 
      });
    } catch (error) {
      logger.error('Bridge poll error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async bridgeAck(req, res) {
    try {
      const { outletId, bridgeCode, jobId } = req.params;
      const apiKey = extractBridgeApiKey(req.headers);
      const { status, error } = req.body;

      // API key is optional - uses simple bridge lookup if not provided
      const bridge = await printerService.validateBridgeApiKey(outletId, bridgeCode, apiKey);
      if (!bridge) {
        return res.status(401).json({ success: false, message: 'Bridge not found or inactive' });
      }

      if (status === 'printed') {
        await printerService.markJobPrinted(jobId, bridge.id);
      } else if (status === 'failed') {
        await printerService.markJobFailed(jobId, error, bridge.id);
      }

      res.json({ success: true });
    } catch (error) {
      logger.error('Bridge ack error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async bridgeStatus(req, res) {
    try {
      const { outletId, bridgeCode } = req.params;
      const apiKey = extractBridgeApiKey(req.headers);
      const statuses = Array.isArray(req.body?.statuses) ? req.body.statuses : [];

      // API key is optional - uses simple bridge lookup if not provided
      const bridge = await printerService.validateBridgeApiKey(outletId, bridgeCode, apiKey);
      if (!bridge) {
        return res.status(401).json({ success: false, message: 'Bridge not found or inactive' });
      }

      const result = await printerService.reportBridgePrinterStatus({
        outletId,
        bridgeId: bridge.id,
        statuses
      });

      await printerService.updateBridgeStatus(bridge.id, true, req.ip);

      res.json({
        success: true,
        data: {
          ...result,
          reportedAt: new Date().toISOString()
        }
      });
    } catch (error) {
      logger.error('Bridge status report error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async bridgeConfig(req, res) {
    try {
      const { outletId, bridgeCode } = req.params;
      const apiKey = extractBridgeApiKey(req.headers);

      // API key is optional - uses simple bridge lookup if not provided
      const config = await printerService.getBridgePrinterConfig(outletId, bridgeCode, apiKey);
      if (!config) {
        return res.status(401).json({ success: false, message: 'Bridge not found or inactive' });
      }

      res.json({
        success: true,
        data: config
      });
    } catch (error) {
      logger.error('Bridge config fetch error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // ========================
  // PRINTER STATUS CHECK API
  // ========================

  /**
   * Check live status of all printers for an outlet
   * GET /api/v1/printers/:outletId/status
   */
  async checkPrinterStatus(req, res) {
    try {
      const { outletId } = req.params;
      const { station, source } = req.query;
      
      const printers = await printerService.checkPrinterStatus(outletId, station || null, source || 'auto');
      
      const onlineCount = printers.filter(p => p.isOnline).length;
      
      res.json({
        success: true,
        data: {
          checkedAt: new Date().toISOString(),
          source: source || 'auto',
          summary: {
            total: printers.length,
            online: onlineCount,
            offline: printers.length - onlineCount,
            allOnline: onlineCount === printers.length && printers.length > 0
          },
          printers
        }
      });
    } catch (error) {
      logger.error('Check printer status error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  /**
   * Check live status for a specific station type (captain, cashier, kitchen, bar)
   * GET /api/v1/printers/:outletId/status/:stationType
   */
  async checkStationPrinterStatus(req, res) {
    try {
      const { outletId, stationType } = req.params;
      const { source } = req.query;
      
      const validStations = ['captain', 'cashier', 'kitchen', 'bar', 'bill', 'all'];
      if (!validStations.includes(stationType)) {
        return res.status(400).json({
          success: false,
          message: `Invalid station type. Valid options: ${validStations.join(', ')}`
        });
      }
      
      const status = await printerService.checkStationPrinterStatus(outletId, stationType, source || 'auto');
      
      res.json({
        success: true,
        data: {
          checkedAt: new Date().toISOString(),
          ...status
        }
      });
    } catch (error) {
      logger.error('Check station printer status error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  /**
   * Quick ping check for a specific printer
   * GET /api/v1/printers/:printerId/ping
   */
  async pingPrinter(req, res) {
    try {
      const { printerId } = req.params;
      
      const printer = await printerService.getPrinterById(printerId);
      if (!printer) {
        return res.status(404).json({ success: false, message: 'Printer not found' });
      }
      
      if (!printer.ip_address) {
        return res.json({
          success: true,
          data: {
            printerId: printer.id,
            name: printer.name,
            isOnline: false,
            error: 'No IP address configured'
          }
        });
      }
      
      const startTime = Date.now();
      const result = await printerService.testPrinterConnection(printer.ip_address, printer.port || 9100);
      const latency = Date.now() - startTime;
      
      // Update printer status in DB
      await printerService.updatePrinterStatus(printer.id, result.success);
      
      res.json({
        success: true,
        data: {
          printerId: printer.id,
          name: printer.name,
          station: printer.station,
          ipAddress: printer.ip_address,
          port: printer.port || 9100,
          isOnline: result.success,
          latency: `${latency}ms`,
          message: result.message,
          checkedAt: new Date().toISOString()
        }
      });
    } catch (error) {
      logger.error('Ping printer error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }
};

module.exports = printerController;
