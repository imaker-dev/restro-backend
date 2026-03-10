/**
 * Integration Controller
 * Handles Dyno API webhooks and online order management
 */

const logger = require('../utils/logger');
const dynoService = require('../services/dyno.service');
const onlineOrderService = require('../services/onlineOrder.service');

const integrationController = {
  // ========================
  // WEBHOOK HANDLERS
  // ========================

  /**
   * Handle Dyno webhook
   * POST /api/v1/integrations/dyno/webhook
   */
  async handleDynoWebhook(req, res) {
    try {
      const payload = req.body;
      const event = payload.event;
      const channelId = req.webhookChannelId || req.headers['x-dyno-channel-id'];

      logger.info(`Dyno webhook received: ${event}`, { channelId });

      // Route based on event type
      switch (event) {
        case 'order.new':
        case 'order.created':
          const result = await onlineOrderService.processIncomingOrder(payload, channelId);
          
          if (result.duplicate) {
            return res.status(200).json({
              success: true,
              message: 'Order already processed',
              onlineOrderId: result.onlineOrderId
            });
          }

          return res.status(201).json({
            success: true,
            message: 'Order created successfully',
            data: {
              onlineOrderId: result.onlineOrderId,
              posOrderId: result.posOrderId,
              orderNumber: result.orderNumber
            }
          });

        case 'order.cancelled':
          const cancelResult = await onlineOrderService.handlePlatformCancel(
            payload.data.external_order_id,
            channelId,
            payload.data.cancel_reason,
            payload.data.cancelled_by || 'platform'
          );
          return res.status(200).json({ success: true, ...cancelResult });

        case 'order.status_update':
          // Handle status updates from platform
          logger.info('Platform status update received', payload.data);
          return res.status(200).json({ success: true, message: 'Status update acknowledged' });

        default:
          logger.warn(`Unknown webhook event: ${event}`);
          return res.status(200).json({ success: true, message: 'Event acknowledged' });
      }

    } catch (error) {
      logger.error('Webhook processing error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  },

  /**
   * Test webhook endpoint (for development)
   * POST /api/v1/integrations/test-webhook
   */
  async testWebhook(req, res) {
    try {
      const { channelId, testOrder } = req.body;

      // Create a mock webhook payload
      const mockPayload = {
        event: 'order.new',
        timestamp: new Date().toISOString(),
        data: {
          platform: 'swiggy',
          external_order_id: `TEST_${Date.now()}`,
          dyno_order_id: `DYNO_TEST_${Date.now()}`,
          customer: {
            name: 'Test Customer',
            phone: '+919876543210',
            address: '123 Test Street, Test City',
            instructions: 'Ring the bell'
          },
          items: testOrder?.items || [
            {
              external_item_id: 'TEST_ITEM_001',
              name: 'Test Item',
              quantity: 1,
              unit_price: 100,
              total_price: 100
            }
          ],
          payment: {
            method: 'prepaid',
            is_paid: true,
            item_total: 100,
            taxes: 5,
            delivery_charge: 20,
            packaging_charge: 10,
            discount: 0,
            total: 135
          },
          timing: {
            placed_at: new Date().toISOString(),
            expected_delivery: new Date(Date.now() + 30 * 60000).toISOString()
          }
        }
      };

      const result = await onlineOrderService.processIncomingOrder(mockPayload, channelId);

      return res.status(201).json({
        success: true,
        message: 'Test order created',
        data: result
      });

    } catch (error) {
      logger.error('Test webhook error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  },

  // ========================
  // CHANNEL MANAGEMENT
  // ========================

  /**
   * Get all channels for outlet
   * GET /api/v1/integrations/channels
   */
  async getChannels(req, res) {
    try {
      const outletId = req.query.outletId || req.user.outletId;
      const channels = await dynoService.getChannelsByOutlet(outletId);

      // Mask sensitive tokens
      const safeChannels = channels.map(ch => ({
        ...ch,
        dyno_access_token: ch.dyno_access_token ? '***' + ch.dyno_access_token.slice(-4) : null,
        webhook_secret: ch.webhook_secret ? '***hidden***' : null
      }));

      return res.json({ success: true, data: safeChannels });
    } catch (error) {
      logger.error('Get channels error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * Create or update channel
   * POST /api/v1/integrations/channels
   */
  async upsertChannel(req, res) {
    try {
      const {
        outletId, channelName, channelDisplayName,
        dynoOrderId, dynoAccessToken, propertyId,
        propertyName, propertyArea, webhookSecret,
        autoAcceptOrders, autoPrintKot, defaultPrepTime
      } = req.body;

      const result = await dynoService.upsertChannel({
        outletId: outletId || req.user.outletId,
        channelName,
        channelDisplayName: channelDisplayName || channelName,
        dynoOrderId,
        dynoAccessToken,
        propertyId,
        propertyName,
        propertyArea,
        webhookSecret,
        autoAcceptOrders,
        autoPrintKot,
        defaultPrepTime
      });

      return res.status(result.created ? 201 : 200).json({
        success: true,
        message: result.created ? 'Channel created' : 'Channel updated',
        data: result
      });
    } catch (error) {
      logger.error('Upsert channel error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * Delete/deactivate channel
   * DELETE /api/v1/integrations/channels/:id
   */
  async deleteChannel(req, res) {
    try {
      const { id } = req.params;
      const { getPool } = require('../database');
      const pool = getPool();

      await pool.query(
        'UPDATE integration_channels SET is_active = 0 WHERE id = ?',
        [id]
      );

      return res.json({ success: true, message: 'Channel deactivated' });
    } catch (error) {
      logger.error('Delete channel error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  },

  // ========================
  // MENU MAPPING
  // ========================

  /**
   * Get menu mappings for channel
   * GET /api/v1/integrations/channels/:channelId/menu-mapping
   */
  async getMenuMappings(req, res) {
    try {
      const { channelId } = req.params;
      const { unmappedOnly } = req.query;
      const { getPool } = require('../database');
      const pool = getPool();

      let query = `
        SELECT cmm.*, i.name as pos_item_name, v.name as pos_variant_name
        FROM channel_menu_mapping cmm
        LEFT JOIN items i ON cmm.pos_item_id = i.id
        LEFT JOIN variants v ON cmm.pos_variant_id = v.id
        WHERE cmm.channel_id = ?
      `;

      if (unmappedOnly === 'true') {
        query += ' AND cmm.is_mapped = 0';
      }

      query += ' ORDER BY cmm.external_item_name';

      const [rows] = await pool.query(query, [channelId]);
      return res.json({ success: true, data: rows });
    } catch (error) {
      logger.error('Get menu mappings error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * Create or update menu mapping
   * POST /api/v1/integrations/channels/:channelId/menu-mapping
   */
  async upsertMenuMapping(req, res) {
    try {
      const { channelId } = req.params;
      const {
        externalItemId, externalItemName,
        externalVariantId, externalVariantName,
        posItemId, posVariantId, isAvailable = true
      } = req.body;

      const { getPool } = require('../database');
      const pool = getPool();

      // Check if mapping exists
      const [existing] = await pool.query(
        `SELECT id FROM channel_menu_mapping 
         WHERE channel_id = ? AND external_item_id = ? 
         AND (external_variant_id = ? OR (external_variant_id IS NULL AND ? IS NULL))`,
        [channelId, externalItemId, externalVariantId, externalVariantId]
      );

      if (existing.length > 0) {
        // Update
        await pool.query(
          `UPDATE channel_menu_mapping SET
            pos_item_id = ?, pos_variant_id = ?, is_mapped = 1, is_available = ?,
            mapped_by = ?, mapped_at = NOW()
          WHERE id = ?`,
          [posItemId, posVariantId, isAvailable, req.user.userId, existing[0].id]
        );
        return res.json({ success: true, message: 'Mapping updated', id: existing[0].id });
      } else {
        // Create
        const [result] = await pool.query(
          `INSERT INTO channel_menu_mapping (
            channel_id, external_item_id, external_item_name,
            external_variant_id, external_variant_name,
            pos_item_id, pos_variant_id, is_mapped, is_available,
            mapped_by, mapped_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NOW())`,
          [
            channelId, externalItemId, externalItemName,
            externalVariantId, externalVariantName,
            posItemId, posVariantId, isAvailable, req.user.userId
          ]
        );
        return res.status(201).json({ success: true, message: 'Mapping created', id: result.insertId });
      }
    } catch (error) {
      logger.error('Upsert menu mapping error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  },

  // ========================
  // ONLINE ORDERS
  // ========================

  /**
   * Get active online orders
   * GET /api/v1/integrations/orders/active
   */
  async getActiveOnlineOrders(req, res) {
    try {
      const outletId = req.query.outletId || req.user.outletId;
      const orders = await onlineOrderService.getActiveOrders(outletId);
      return res.json({ success: true, data: orders });
    } catch (error) {
      logger.error('Get active orders error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * Get online orders with filters
   * GET /api/v1/integrations/orders
   */
  async getOnlineOrders(req, res) {
    try {
      const { outletId, platform, status, startDate, endDate, limit } = req.query;
      const orders = await onlineOrderService.getOrders({
        outletId: outletId || req.user.outletId,
        platform,
        status,
        startDate,
        endDate,
        limit: parseInt(limit) || 50
      });
      return res.json({ success: true, data: orders });
    } catch (error) {
      logger.error('Get online orders error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * Get online order details
   * GET /api/v1/integrations/orders/:id
   */
  async getOnlineOrderDetails(req, res) {
    try {
      const { id } = req.params;
      const order = await onlineOrderService.getOnlineOrderById(id);
      
      if (!order) {
        return res.status(404).json({ success: false, error: 'Order not found' });
      }

      return res.json({ success: true, data: order });
    } catch (error) {
      logger.error('Get order details error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * Accept online order
   * POST /api/v1/integrations/orders/:id/accept
   */
  async acceptOnlineOrder(req, res) {
    try {
      const { id } = req.params;
      const { prepTime } = req.body;
      
      const result = await onlineOrderService.acceptOrder(id, prepTime);
      return res.json({ success: true, ...result });
    } catch (error) {
      logger.error('Accept order error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * Reject online order
   * POST /api/v1/integrations/orders/:id/reject
   */
  async rejectOnlineOrder(req, res) {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      if (!reason) {
        return res.status(400).json({ success: false, error: 'Rejection reason required' });
      }

      const result = await onlineOrderService.rejectOrder(id, reason);
      return res.json({ success: true, ...result });
    } catch (error) {
      logger.error('Reject order error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * Mark order ready for pickup
   * POST /api/v1/integrations/orders/:id/ready
   */
  async markOrderReady(req, res) {
    try {
      const { id } = req.params;
      const result = await onlineOrderService.markReady(id);
      return res.json({ success: true, ...result });
    } catch (error) {
      logger.error('Mark ready error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * Mark order dispatched
   * POST /api/v1/integrations/orders/:id/dispatch
   */
  async markOrderDispatched(req, res) {
    try {
      const { id } = req.params;
      const result = await onlineOrderService.markDispatched(id);
      return res.json({ success: true, ...result });
    } catch (error) {
      logger.error('Mark dispatched error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  },

  // ========================
  // LOGS
  // ========================

  /**
   * Get integration logs
   * GET /api/v1/integrations/logs
   */
  async getLogs(req, res) {
    try {
      const { outletId, channelId, logType, status, limit } = req.query;
      const logs = await dynoService.getLogs({
        outletId: outletId || req.user.outletId,
        channelId,
        logType,
        status,
        limit: parseInt(limit) || 100
      });
      return res.json({ success: true, data: logs });
    } catch (error) {
      logger.error('Get logs error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }
};

module.exports = integrationController;
