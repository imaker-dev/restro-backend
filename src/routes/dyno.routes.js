/**
 * Dyno Webhook Routes
 * 
 * These endpoints are called BY Dyno to push data to your server.
 * Based on Dyno Webhook Implementation Documentation v2.0
 * 
 * Base URL configured in Dyno: https://restro-backend.imaker.in
 * 
 * Order Management Endpoints:
 *   POST /orders                      - Receive new orders from Dyno
 *   GET  /:resId/orders/status        - Dyno fetches order statuses
 *   POST /:resId/orders/status        - Dyno posts accept/ready responses
 *   POST /:resId/orders/history       - Dyno posts order history
 * 
 * Item/Category Management Endpoints:
 *   GET  /:resId/items/status         - Dyno fetches items status
 *   POST /:resId/items/status         - Dyno posts item stock updates
 *   POST /:resId/categories/status    - Dyno posts category stock updates
 *   POST /:resId/items                - Dyno posts all items
 */

const express = require('express');
const router = express.Router();
const dynoWebhookController = require('../controllers/dynoWebhook.controller');
const { verifyDynoWebhookSimple, webhookRateLimit } = require('../middleware/webhookAuth');

// Apply rate limiting to all webhook endpoints
router.use(webhookRateLimit);

// ============================================================
// ORDER MANAGEMENT ENDPOINTS
// ============================================================

/**
 * POST /orders
 * Receive new orders from Swiggy/Zomato via Dyno
 * This is the main order ingestion endpoint
 */
router.post('/orders',
  verifyDynoWebhookSimple,
  dynoWebhookController.receiveOrder
);

/**
 * GET /:resId/orders/status
 * Dyno fetches current order statuses from your POS
 * Returns list of orders with their current status
 */
router.get('/:resId/orders/status',
  verifyDynoWebhookSimple,
  dynoWebhookController.getOrdersStatus
);

/**
 * POST /:resId/orders/status
 * Dyno posts accept/ready response confirmations
 * Called after your POS sends status update to Dyno
 */
router.post('/:resId/orders/status',
  verifyDynoWebhookSimple,
  dynoWebhookController.updateOrderStatus
);

/**
 * POST /:resId/orders/history
 * Dyno posts order history data
 * Used for syncing historical orders
 */
router.post('/:resId/orders/history',
  verifyDynoWebhookSimple,
  dynoWebhookController.receiveOrderHistory
);

// ============================================================
// ITEM/CATEGORY MANAGEMENT ENDPOINTS
// ============================================================

/**
 * GET /:resId/items/status
 * Dyno fetches current item stock statuses
 * Returns list of items with in_stock/out_of_stock status
 */
router.get('/:resId/items/status',
  verifyDynoWebhookSimple,
  dynoWebhookController.getItemsStatus
);

/**
 * POST /:resId/items/status
 * Dyno posts item stock update responses
 * Confirms stock updates were applied on platform
 */
router.post('/:resId/items/status',
  verifyDynoWebhookSimple,
  dynoWebhookController.updateItemsStatus
);

/**
 * POST /:resId/categories/status
 * Dyno posts category stock update responses
 */
router.post('/:resId/categories/status',
  verifyDynoWebhookSimple,
  dynoWebhookController.updateCategoriesStatus
);

/**
 * POST /:resId/items
 * Dyno posts all items from platform (menu sync)
 * Used for initial menu sync or refresh
 */
router.post('/:resId/items',
  verifyDynoWebhookSimple,
  dynoWebhookController.receiveAllItems
);

module.exports = router;
