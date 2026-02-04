const express = require('express');
const router = express.Router();
const taxController = require('../controllers/tax.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const { validate } = require('../middlewares');
const menuValidation = require('../validations/menu.validation');

// All routes require authentication
router.use(authenticate);

// ========================
// TAX TYPES
// ========================

/**
 * @route   POST /api/v1/tax/types
 * @desc    Create tax type (GST, VAT)
 * @access  Private (admin)
 */
router.post('/types', authorize('super_admin', 'admin'), validate(menuValidation.createTaxType), taxController.createTaxType);

/**
 * @route   GET /api/v1/tax/types
 * @desc    Get all tax types
 * @access  Private
 */
router.get('/types', taxController.getTaxTypes);

/**
 * @route   PUT /api/v1/tax/types/:id
 * @desc    Update tax type
 * @access  Private (admin)
 */
router.put('/types/:id', authorize('super_admin', 'admin'), validate(menuValidation.updateTaxType), taxController.updateTaxType);

// ========================
// TAX COMPONENTS
// ========================

/**
 * @route   POST /api/v1/tax/components
 * @desc    Create tax component (CGST, SGST, etc.)
 * @access  Private (admin)
 */
router.post('/components', authorize('super_admin', 'admin'), validate(menuValidation.createTaxComponent), taxController.createTaxComponent);

/**
 * @route   GET /api/v1/tax/components
 * @desc    Get tax components
 * @access  Private
 */
router.get('/components', taxController.getTaxComponents);

/**
 * @route   PUT /api/v1/tax/components/:id
 * @desc    Update tax component
 * @access  Private (admin)
 */
router.put('/components/:id', authorize('super_admin', 'admin'), taxController.updateTaxComponent);

// ========================
// TAX GROUPS
// ========================

/**
 * @route   POST /api/v1/tax/groups
 * @desc    Create tax group
 * @access  Private (admin)
 */
router.post('/groups', authorize('super_admin', 'admin'), validate(menuValidation.createTaxGroup), taxController.createTaxGroup);

/**
 * @route   GET /api/v1/tax/groups
 * @desc    Get tax groups
 * @access  Private
 */
router.get('/groups', taxController.getTaxGroups);

/**
 * @route   GET /api/v1/tax/groups/:id
 * @desc    Get tax group by ID
 * @access  Private
 */
router.get('/groups/:id', taxController.getTaxGroupById);

/**
 * @route   PUT /api/v1/tax/groups/:id
 * @desc    Update tax group
 * @access  Private (admin)
 */
router.put('/groups/:id', authorize('super_admin', 'admin'), validate(menuValidation.updateTaxGroup), taxController.updateTaxGroup);

/**
 * @route   DELETE /api/v1/tax/groups/:id
 * @desc    Delete tax group
 * @access  Private (admin)
 */
router.delete('/groups/:id', authorize('super_admin', 'admin'), taxController.deleteTaxGroup);

// ========================
// SERVICE CHARGES
// ========================

/**
 * @route   POST /api/v1/tax/service-charges
 * @desc    Create service charge
 * @access  Private (admin)
 */
router.post('/service-charges', authorize('super_admin', 'admin'), taxController.createServiceCharge);

/**
 * @route   GET /api/v1/tax/service-charges/:outletId
 * @desc    Get service charges for outlet
 * @access  Private
 */
router.get('/service-charges/:outletId', taxController.getServiceCharges);

// ========================
// DISCOUNTS
// ========================

/**
 * @route   POST /api/v1/tax/discounts
 * @desc    Create discount
 * @access  Private (admin, manager)
 */
router.post('/discounts', authorize('super_admin', 'admin', 'manager'), validate(menuValidation.createDiscount), taxController.createDiscount);

/**
 * @route   GET /api/v1/tax/discounts/:outletId
 * @desc    Get discounts for outlet
 * @access  Private
 */
router.get('/discounts/:outletId', taxController.getDiscounts);

/**
 * @route   POST /api/v1/tax/discounts/:outletId/validate
 * @desc    Validate discount code
 * @access  Private
 */
router.post('/discounts/:outletId/validate', taxController.validateDiscountCode);

// ========================
// TIME SLOTS
// ========================

/**
 * @route   POST /api/v1/tax/time-slots
 * @desc    Create time slot
 * @access  Private (admin, manager)
 */
router.post('/time-slots', authorize('super_admin', 'admin', 'manager'), validate(menuValidation.createTimeSlot), taxController.createTimeSlot);

/**
 * @route   GET /api/v1/tax/time-slots/:outletId
 * @desc    Get time slots for outlet
 * @access  Private
 */
router.get('/time-slots/:outletId', taxController.getTimeSlots);

/**
 * @route   GET /api/v1/tax/time-slots/:outletId/current
 * @desc    Get current time slot
 * @access  Private
 */
router.get('/time-slots/:outletId/current', taxController.getCurrentTimeSlot);

/**
 * @route   PUT /api/v1/tax/time-slots/:id
 * @desc    Update time slot
 * @access  Private (admin, manager)
 */
router.put('/time-slots/:id', authorize('super_admin', 'admin', 'manager'), validate(menuValidation.updateTimeSlot), taxController.updateTimeSlot);

/**
 * @route   DELETE /api/v1/tax/time-slots/:id
 * @desc    Delete time slot
 * @access  Private (admin)
 */
router.delete('/time-slots/:id', authorize('super_admin', 'admin'), taxController.deleteTimeSlot);

// ========================
// PRICE RULES
// ========================

/**
 * @route   POST /api/v1/tax/price-rules
 * @desc    Create price rule
 * @access  Private (admin, manager)
 */
router.post('/price-rules', authorize('super_admin', 'admin', 'manager'), validate(menuValidation.createPriceRule), taxController.createPriceRule);

/**
 * @route   GET /api/v1/tax/price-rules/:outletId
 * @desc    Get price rules for outlet
 * @access  Private
 */
router.get('/price-rules/:outletId', taxController.getPriceRules);

/**
 * @route   PUT /api/v1/tax/price-rules/:id
 * @desc    Update price rule
 * @access  Private (admin, manager)
 */
router.put('/price-rules/:id', authorize('super_admin', 'admin', 'manager'), taxController.updatePriceRule);

/**
 * @route   DELETE /api/v1/tax/price-rules/:id
 * @desc    Delete price rule
 * @access  Private (admin)
 */
router.delete('/price-rules/:id', authorize('super_admin', 'admin'), taxController.deletePriceRule);

/**
 * @route   POST /api/v1/tax/happy-hour/:outletId
 * @desc    Create happy hour rules
 * @access  Private (admin, manager)
 */
router.post('/happy-hour/:outletId', authorize('super_admin', 'admin', 'manager'), validate(menuValidation.createHappyHour), taxController.createHappyHour);

/**
 * @route   GET /api/v1/tax/happy-hour/:outletId/active
 * @desc    Get active happy hours
 * @access  Private
 */
router.get('/happy-hour/:outletId/active', taxController.getActiveHappyHours);

// ========================
// KITCHEN STATIONS
// ========================

/**
 * @route   POST /api/v1/tax/kitchen-stations
 * @desc    Create kitchen station
 * @access  Private (admin, manager)
 */
router.post('/kitchen-stations', authorize('super_admin', 'admin', 'manager'), taxController.createKitchenStation);

/**
 * @route   GET /api/v1/tax/kitchen-stations/:outletId
 * @desc    Get kitchen stations for outlet
 * @access  Private
 */
router.get('/kitchen-stations/:outletId', taxController.getKitchenStations);

/**
 * @route   PUT /api/v1/tax/kitchen-stations/:id
 * @desc    Update kitchen station
 * @access  Private (admin, manager)
 */
router.put('/kitchen-stations/:id', authorize('super_admin', 'admin', 'manager'), taxController.updateKitchenStation);

/**
 * @route   DELETE /api/v1/tax/kitchen-stations/:id
 * @desc    Delete kitchen station
 * @access  Private (admin)
 */
router.delete('/kitchen-stations/:id', authorize('super_admin', 'admin'), taxController.deleteKitchenStation);

// ========================
// COUNTERS
// ========================

/**
 * @route   POST /api/v1/tax/counters
 * @desc    Create counter
 * @access  Private (admin, manager)
 */
router.post('/counters', authorize('super_admin', 'admin', 'manager'), taxController.createCounter);

/**
 * @route   GET /api/v1/tax/counters/:outletId
 * @desc    Get counters for outlet
 * @access  Private
 */
router.get('/counters/:outletId', taxController.getCounters);

/**
 * @route   PUT /api/v1/tax/counters/:id
 * @desc    Update counter
 * @access  Private (admin, manager)
 */
router.put('/counters/:id', authorize('super_admin', 'admin', 'manager'), taxController.updateCounter);

/**
 * @route   DELETE /api/v1/tax/counters/:id
 * @desc    Delete counter
 * @access  Private (admin)
 */
router.delete('/counters/:id', authorize('super_admin', 'admin'), taxController.deleteCounter);

module.exports = router;
