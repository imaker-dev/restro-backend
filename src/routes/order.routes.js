const express = require('express');
const router = express.Router();
const orderController = require('../controllers/order.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const { validate } = require('../middlewares');
const orderValidation = require('../validations/order.validation');

// All routes require authentication
router.use(authenticate);

// ========================
// ORDER MANAGEMENT
// ========================

/**
 * @route   POST /api/v1/orders
 * @desc    Create new order
 * @access  Private (captain, waiter, manager)
 */
router.post('/', validate(orderValidation.createOrder), orderController.createOrder);

/**
 * @route   GET /api/v1/orders/active/:outletId
 * @desc    Get active orders for outlet
 * @access  Private
 */
router.get('/active/:outletId', orderController.getActiveOrders);

// ========================
// CAPTAIN ORDER HISTORY
// ========================

/**
 * @route   GET /api/v1/orders/captain/history/:outletId
 * @desc    Get captain's own order history with filters
 * @access  Private (captain, waiter)
 * @query   status - 'running' | 'completed' | 'cancelled' | 'all'
 * @query   search - Search by order number, table number, customer name
 * @query   startDate - Filter from date (YYYY-MM-DD)
 * @query   endDate - Filter to date (YYYY-MM-DD)
 * @query   page - Page number (default: 1)
 * @query   limit - Items per page (default: 20)
 * @query   sortBy - Sort column (created_at, order_number, total_amount)
 * @query   sortOrder - ASC or DESC (default: DESC)
 */
router.get('/captain/history/:outletId', orderController.getCaptainOrderHistory);

/**
 * @route   GET /api/v1/orders/captain/stats/:outletId
 * @desc    Get captain's order statistics
 * @access  Private (captain, waiter)
 * @query   startDate - Filter from date (YYYY-MM-DD)
 * @query   endDate - Filter to date (YYYY-MM-DD)
 */
router.get('/captain/stats/:outletId', orderController.getCaptainOrderStats);

/**
 * @route   GET /api/v1/orders/captain/detail/:orderId
 * @desc    Get detailed order view with time logs (captain's own orders only)
 * @access  Private (captain, waiter)
 */
router.get('/captain/detail/:orderId', orderController.getCaptainOrderDetail);

/**
 * @route   GET /api/v1/orders/table/:tableId
 * @desc    Get orders by table
 * @access  Private
 */
router.get('/table/:tableId', orderController.getOrdersByTable);

/**
 * @route   GET /api/v1/orders/cancel-reasons/:outletId
 * @desc    Get cancel reasons
 * @access  Private
 */
router.get('/cancel-reasons/:outletId', orderController.getCancelReasons);

// ========================
// PAYMENTS (before :id routes to prevent conflict)
// ========================

/**
 * @route   POST /api/v1/orders/payment
 * @desc    Process payment
 * @access  Private (cashier, manager)
 */
router.post('/payment', validate(orderValidation.processPayment), orderController.processPayment);

/**
 * @route   POST /api/v1/orders/payment/split
 * @desc    Process split payment
 * @access  Private (cashier, manager)
 */
router.post('/payment/split', validate(orderValidation.splitPayment), orderController.processSplitPayment);

/**
 * @route   POST /api/v1/orders/refund
 * @desc    Initiate refund
 * @access  Private (manager)
 */
router.post('/refund', authorize('super_admin', 'admin', 'manager'), validate(orderValidation.initiateRefund), orderController.initiateRefund);

/**
 * @route   POST /api/v1/orders/refund/:id/approve
 * @desc    Approve refund
 * @access  Private (manager, admin)
 */
router.post('/refund/:id/approve', authorize('super_admin', 'admin', 'manager'), orderController.approveRefund);

/**
 * @route   GET /api/v1/orders/:id
 * @desc    Get order with items
 * @access  Private
 */
router.get('/:id', orderController.getOrder);

/**
 * @route   POST /api/v1/orders/:id/items
 * @desc    Add items to order
 * @access  Private
 */
router.post('/:id/items', validate(orderValidation.addItems), orderController.addItems);

/**
 * @route   PUT /api/v1/orders/:id/status
 * @desc    Update order status
 * @access  Private
 */
router.put('/:id/status', validate(orderValidation.updateStatus), orderController.updateStatus);

/**
 * @route   POST /api/v1/orders/:id/transfer
 * @desc    Transfer order to another table
 * @access  Private
 */
router.post('/:id/transfer', validate(orderValidation.transferTable), orderController.transferTable);

/**
 * @route   POST /api/v1/orders/:id/cancel
 * @desc    Cancel entire order
 * @access  Private (manager approval may be required)
 */
router.post('/:id/cancel', validate(orderValidation.cancelOrder), orderController.cancelOrder);

/**
 * @route   PUT /api/v1/orders/items/:itemId/quantity
 * @desc    Update item quantity (before KOT)
 * @access  Private
 */
router.put('/items/:itemId/quantity', validate(orderValidation.updateItemQuantity), orderController.updateItemQuantity);

/**
 * @route   POST /api/v1/orders/items/:itemId/cancel
 * @desc    Cancel order item
 * @access  Private
 */
router.post('/items/:itemId/cancel', validate(orderValidation.cancelItem), orderController.cancelItem);

// ========================
// KOT MANAGEMENT
// ========================

/**
 * @route   POST /api/v1/orders/:id/kot
 * @desc    Send KOT for order
 * @access  Private
 */
router.post('/:id/kot', orderController.sendKot);

/**
 * @route   GET /api/v1/orders/kot/active
 * @desc    Get active KOTs for user's outlet (polling fallback for socket)
 * @access  Private (kitchen, bar staff)
 * @query   station - Filter by station (kitchen, bar, mocktail, dessert)
 * @query   status - Filter by status (pending, accepted, preparing, ready)
 */
router.get('/kot/active', orderController.getActiveKotsForUser);

/**
 * @route   GET /api/v1/orders/kot/active/:outletId
 * @desc    Get active KOTs for specific outlet (legacy/admin)
 * @access  Private
 * @query   station - Filter by station (kitchen, bar, mocktail, dessert)
 * @query   status - Filter by status (pending, accepted, preparing, ready)
 */
router.get('/kot/active/:outletId', orderController.getActiveKots);

/**
 * @route   GET /api/v1/orders/:orderId/kots
 * @desc    Get KOTs for order
 * @access  Private
 */
router.get('/:orderId/kots', orderController.getKotsByOrder);

/**
 * @route   GET /api/v1/orders/kot/:id
 * @desc    Get KOT by ID
 * @access  Private
 */
router.get('/kot/:id', orderController.getKotById);

/**
 * @route   POST /api/v1/orders/kot/:id/accept
 * @desc    Accept KOT (kitchen acknowledges)
 * @access  Private (kitchen, bar)
 */
router.post('/kot/:id/accept', orderController.acceptKot);

/**
 * @route   POST /api/v1/orders/kot/:id/preparing
 * @desc    Start preparing KOT
 * @access  Private (kitchen, bar)
 */
router.post('/kot/:id/preparing', orderController.startPreparingKot);

/**
 * @route   POST /api/v1/orders/kot/:id/ready
 * @desc    Mark entire KOT as ready
 * @access  Private (kitchen, bar)
 */
router.post('/kot/:id/ready', orderController.markKotReady);

/**
 * @route   POST /api/v1/orders/kot/:id/served
 * @desc    Mark KOT as served
 * @access  Private
 */
router.post('/kot/:id/served', orderController.markKotServed);

/**
 * @route   POST /api/v1/orders/kot/:id/reprint
 * @desc    Reprint KOT
 * @access  Private
 */
router.post('/kot/:id/reprint', orderController.reprintKot);

/**
 * @route   POST /api/v1/orders/kot/items/:itemId/ready
 * @desc    Mark single KOT item as ready
 * @access  Private (kitchen, bar)
 */
router.post('/kot/items/:itemId/ready', orderController.markItemReady);

/**
 * @route   GET /api/v1/orders/station/:station
 * @desc    Get station dashboard for user's outlet (kitchen, bar, mocktail)
 * @access  Private (kitchen, bar staff)
 */
router.get('/station/:station', orderController.getStationDashboardForUser);

/**
 * @route   GET /api/v1/orders/station/:outletId/:station
 * @desc    Get station dashboard for specific outlet (legacy/admin)
 * @access  Private
 */
router.get('/station/:outletId/:station', orderController.getStationDashboard);

// ========================
// BILLING
// ========================

/**
 * @route   POST /api/v1/orders/:id/bill
 * @desc    Generate bill for order
 * @access  Private
 */
router.post('/:id/bill', validate(orderValidation.generateBill), orderController.generateBill);

/**
 * @route   GET /api/v1/orders/:orderId/invoice
 * @desc    Get invoice by order
 * @access  Private
 */
router.get('/:orderId/invoice', orderController.getInvoiceByOrder);

/**
 * @route   GET /api/v1/orders/invoice/:id
 * @desc    Get invoice by ID
 * @access  Private
 */
router.get('/invoice/:id', orderController.getInvoice);

/**
 * @route   POST /api/v1/orders/invoice/:id/duplicate
 * @desc    Print duplicate bill
 * @access  Private
 */
router.post('/invoice/:id/duplicate', orderController.printDuplicateBill);

/**
 * @route   POST /api/v1/orders/:id/split-bill
 * @desc    Split bill into multiple invoices
 * @access  Private
 */
router.post('/:id/split-bill', validate(orderValidation.splitBill), orderController.splitBill);

/**
 * @route   POST /api/v1/orders/invoice/:id/cancel
 * @desc    Cancel invoice
 * @access  Private (manager, admin)
 */
router.post('/invoice/:id/cancel', authorize('super_admin', 'admin', 'manager'), orderController.cancelInvoice);

/**
 * @route   POST /api/v1/orders/:id/discount
 * @desc    Apply discount to order
 * @access  Private
 */
router.post('/:id/discount', validate(orderValidation.applyDiscount), orderController.applyDiscount);

/**
 * @route   GET /api/v1/orders/:orderId/payments
 * @desc    Get payments for order
 * @access  Private
 */
router.get('/:orderId/payments', orderController.getPaymentsByOrder);

// ========================
// CASH DRAWER
// ========================

/**
 * @route   POST /api/v1/orders/cash-drawer/:outletId/open
 * @desc    Open cash drawer (day start)
 * @access  Private (cashier, manager)
 */
router.post('/cash-drawer/:outletId/open', validate(orderValidation.openCashDrawer), orderController.openCashDrawer);

/**
 * @route   POST /api/v1/orders/cash-drawer/:outletId/close
 * @desc    Close cash drawer (day end)
 * @access  Private (cashier, manager)
 */
router.post('/cash-drawer/:outletId/close', validate(orderValidation.closeCashDrawer), orderController.closeCashDrawer);

/**
 * @route   GET /api/v1/orders/cash-drawer/:outletId/status
 * @desc    Get cash drawer status
 * @access  Private
 */
router.get('/cash-drawer/:outletId/status', orderController.getCashDrawerStatus);

// ========================
// REPORTS
// ========================

/**
 * @route   GET /api/v1/orders/reports/:outletId/dashboard
 * @desc    Get live dashboard
 * @access  Private
 */
router.get('/reports/:outletId/dashboard', orderController.getLiveDashboard);

/**
 * @route   GET /api/v1/orders/reports/:outletId/daily-sales
 * @desc    Get daily sales report
 * @access  Private (manager, admin)
 */
router.get('/reports/:outletId/daily-sales', authorize('super_admin', 'admin', 'manager'), orderController.getDailySalesReport);

/**
 * @route   GET /api/v1/orders/reports/:outletId/item-sales
 * @desc    Get item sales report
 * @access  Private (manager, admin)
 */
router.get('/reports/:outletId/item-sales', authorize('super_admin', 'admin', 'manager'), orderController.getItemSalesReport);

/**
 * @route   GET /api/v1/orders/reports/:outletId/staff
 * @desc    Get staff performance report
 * @access  Private (manager, admin)
 */
router.get('/reports/:outletId/staff', authorize('super_admin', 'admin', 'manager'), orderController.getStaffReport);

/**
 * @route   GET /api/v1/orders/reports/:outletId/category-sales
 * @desc    Get category sales report
 * @access  Private (manager, admin)
 */
router.get('/reports/:outletId/category-sales', authorize('super_admin', 'admin', 'manager'), orderController.getCategorySalesReport);

/**
 * @route   GET /api/v1/orders/reports/:outletId/payment-modes
 * @desc    Get payment mode report
 * @access  Private (manager, admin)
 */
router.get('/reports/:outletId/payment-modes', authorize('super_admin', 'admin', 'manager'), orderController.getPaymentModeReport);

/**
 * @route   GET /api/v1/orders/reports/:outletId/tax
 * @desc    Get tax report
 * @access  Private (manager, admin)
 */
router.get('/reports/:outletId/tax', authorize('super_admin', 'admin', 'manager'), orderController.getTaxReport);

/**
 * @route   GET /api/v1/orders/reports/:outletId/hourly
 * @desc    Get hourly sales report
 * @access  Private (manager, admin)
 */
router.get('/reports/:outletId/hourly', authorize('super_admin', 'admin', 'manager'), orderController.getHourlySalesReport);

/**
 * @route   GET /api/v1/orders/reports/:outletId/floor-section
 * @desc    Get floor/section sales report
 * @access  Private (manager, admin)
 */
router.get('/reports/:outletId/floor-section', authorize('super_admin', 'admin', 'manager'), orderController.getFloorSectionReport);

/**
 * @route   GET /api/v1/orders/reports/:outletId/counter
 * @desc    Get counter sales report (Kitchen vs Bar)
 * @access  Private (manager, admin)
 */
router.get('/reports/:outletId/counter', authorize('super_admin', 'admin', 'manager'), orderController.getCounterSalesReport);

/**
 * @route   GET /api/v1/orders/reports/:outletId/cancellations
 * @desc    Get cancellation report
 * @access  Private (manager, admin)
 */
router.get('/reports/:outletId/cancellations', authorize('super_admin', 'admin', 'manager'), orderController.getCancellationReport);

/**
 * @route   POST /api/v1/orders/reports/:outletId/aggregate
 * @desc    Aggregate daily sales (manual trigger)
 * @access  Private (admin)
 */
router.post('/reports/:outletId/aggregate', authorize('super_admin', 'admin'), orderController.aggregateDailySales);

module.exports = router;
