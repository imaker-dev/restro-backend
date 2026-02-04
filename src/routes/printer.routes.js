/**
 * Printer Routes
 * Handles printer management, print jobs, and bridge polling API
 */

const express = require('express');
const router = express.Router();
const printerController = require('../controllers/printer.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

// ========================
// BRIDGE POLLING API (No auth required - uses API key)
// These endpoints are called by local bridge agents
// ========================

/**
 * @route   GET /api/v1/printers/bridge/:outletId/:bridgeCode/poll
 * @desc    Poll for next pending print job (local bridge agent)
 * @access  Bridge API Key
 */
router.get('/bridge/:outletId/:bridgeCode/poll', printerController.bridgePoll);

/**
 * @route   POST /api/v1/printers/bridge/:outletId/:bridgeCode/jobs/:jobId/ack
 * @desc    Acknowledge print job status (printed/failed)
 * @access  Bridge API Key
 */
router.post('/bridge/:outletId/:bridgeCode/jobs/:jobId/ack', printerController.bridgeAck);

// ========================
// AUTHENTICATED ROUTES
// ========================

router.use(authenticate);

// ========================
// PRINTER MANAGEMENT
// ========================

/**
 * @route   POST /api/v1/printers
 * @desc    Create a new printer
 * @access  Private (admin, manager)
 */
router.post('/', authorize('super_admin', 'admin', 'manager'), printerController.createPrinter);

/**
 * @route   GET /api/v1/printers/outlet/:outletId
 * @desc    Get all printers for outlet
 * @access  Private
 */
router.get('/outlet/:outletId', printerController.getPrinters);

/**
 * @route   GET /api/v1/printers/:id
 * @desc    Get printer by ID
 * @access  Private
 */
router.get('/:id', printerController.getPrinter);

/**
 * @route   PUT /api/v1/printers/:id
 * @desc    Update printer
 * @access  Private (admin, manager)
 */
router.put('/:id', authorize('super_admin', 'admin', 'manager'), printerController.updatePrinter);

// ========================
// PRINT JOBS
// ========================

/**
 * @route   POST /api/v1/printers/jobs
 * @desc    Create a print job manually
 * @access  Private
 */
router.post('/jobs', printerController.createPrintJob);

/**
 * @route   GET /api/v1/printers/jobs/:outletId/:station/pending
 * @desc    Get pending print jobs for station
 * @access  Private
 */
router.get('/jobs/:outletId/:station/pending', printerController.getPendingJobs);

/**
 * @route   POST /api/v1/printers/jobs/:id/printed
 * @desc    Mark job as printed
 * @access  Private
 */
router.post('/jobs/:id/printed', printerController.markJobPrinted);

/**
 * @route   POST /api/v1/printers/jobs/:id/failed
 * @desc    Mark job as failed
 * @access  Private
 */
router.post('/jobs/:id/failed', printerController.markJobFailed);

/**
 * @route   POST /api/v1/printers/jobs/:id/retry
 * @desc    Retry a failed job
 * @access  Private
 */
router.post('/jobs/:id/retry', printerController.retryJob);

/**
 * @route   POST /api/v1/printers/jobs/:id/cancel
 * @desc    Cancel a print job
 * @access  Private
 */
router.post('/jobs/:id/cancel', printerController.cancelJob);

// ========================
// PRINT ACTIONS
// ========================

/**
 * @route   POST /api/v1/printers/test/:outletId/:station
 * @desc    Print a test page
 * @access  Private
 */
router.post('/test/:outletId/:station', printerController.printTestPage);

/**
 * @route   POST /api/v1/printers/drawer/:outletId/open
 * @desc    Open cash drawer
 * @access  Private (cashier, manager)
 */
router.post('/drawer/:outletId/open', printerController.openCashDrawer);

/**
 * @route   GET /api/v1/printers/stats/:outletId
 * @desc    Get print job statistics
 * @access  Private (manager, admin)
 */
router.get('/stats/:outletId', authorize('super_admin', 'admin', 'manager'), printerController.getJobStats);

// ========================
// BRIDGE MANAGEMENT
// ========================

/**
 * @route   POST /api/v1/printers/bridges
 * @desc    Create a new bridge agent
 * @access  Private (admin)
 */
router.post('/bridges', authorize('super_admin', 'admin'), printerController.createBridge);

/**
 * @route   GET /api/v1/printers/bridges/:outletId
 * @desc    Get all bridges for outlet
 * @access  Private (admin, manager)
 */
router.get('/bridges/:outletId', authorize('super_admin', 'admin', 'manager'), printerController.getBridges);

module.exports = router;
