/**
 * Stock Deduction Service — Module 9
 * 
 * Deducts inventory stock when order items are added.
 * Reverses stock when order items or full orders are cancelled.
 * 
 * Flow:
 *   1. Order item added → load recipe → calculate ingredient qty × order qty
 *   2. Convert to base units → apply wastage/yield
 *   3. FIFO batch deduction → record inventory movements (type: 'sale')
 *   4. Update inventory_items.current_stock
 *   5. Mark order_item.stock_deducted = 1
 * 
 * Cancel Flow:
 *   1. Load movements for that order item (reference_type='order_item')
 *   2. Restore batches → record reversal movements (type: 'sale_reversal')
 *   3. Update inventory_items.current_stock
 * 
 * Golden Rule: ALL stock changes go through inventory_movements
 */

const { getPool } = require('../database');
const logger = require('../utils/logger');
const inventoryService = require('./inventory.service');

const stockDeductionService = {

  /**
   * Deduct stock for a single order item (called inside transaction)
   * @param {object} connection - MySQL transaction connection
   * @param {object} params - { orderId, orderItemId, itemId, variantId, quantity, outletId, userId }
   * @returns {object|null} - deduction summary or null if no recipe
   */
  async deductForOrderItem(connection, { orderId, orderItemId, itemId, variantId, quantity, outletId, userId }) {
    try {
      // Check if auto_deduct_stock is enabled (default: enabled)
      try {
        const [[setting]] = await connection.query(
          "SELECT `value` FROM outlet_settings WHERE outlet_id = ? AND `key` = 'auto_deduct_stock'",
          [outletId]
        );
        if (setting && setting.value === 'false') {
          return null; // Stock deduction disabled
        }
      } catch (settingErr) {
        // Table may not exist yet — default to stock deduction enabled
        logger.debug('outlet_settings not available, defaulting to auto_deduct_stock=true');
      }

      // Find current recipe for this menu item / variant
      let recipeQuery, recipeParams;
      if (variantId) {
        recipeQuery = 'SELECT id FROM recipes WHERE menu_item_id = ? AND variant_id = ? AND is_current = 1 AND is_active = 1';
        recipeParams = [itemId, variantId];
      } else {
        recipeQuery = 'SELECT id FROM recipes WHERE menu_item_id = ? AND variant_id IS NULL AND is_current = 1 AND is_active = 1';
        recipeParams = [itemId];
      }

      const [[recipe]] = await connection.query(recipeQuery, recipeParams);
      if (!recipe) return null; // No recipe linked — skip deduction

      // Get recipe ingredients with inventory + unit info
      const [ingredients] = await connection.query(
        `SELECT ri.*, ing.name as ingredient_name, ing.yield_percentage, ing.wastage_percentage,
          ing.inventory_item_id,
          ii.current_stock, ii.average_price,
          ru.conversion_factor as recipe_unit_cf
         FROM recipe_ingredients ri
         JOIN ingredients ing ON ri.ingredient_id = ing.id
         JOIN inventory_items ii ON ing.inventory_item_id = ii.id
         LEFT JOIN units ru ON ri.unit_id = ru.id
         WHERE ri.recipe_id = ?`,
        [recipe.id]
      );

      if (ingredients.length === 0) return null;

      const deductions = [];
      let totalCostDeducted = 0;

      for (const ing of ingredients) {
        const recipeQty = parseFloat(ing.quantity) || 0;
        const recipeUnitCf = parseFloat(ing.recipe_unit_cf) || 1;

        // Convert to system base units (gram/ml/pcs)
        const qtyInBasePerPortion = recipeQty * recipeUnitCf;

        // Apply wastage + yield
        const wastage = parseFloat(ing.wastage_percentage) || 0;
        const yieldPct = parseFloat(ing.yield_percentage) || 100;
        const effectiveQtyPerPortion = qtyInBasePerPortion * (1 + wastage / 100) * (100 / yieldPct);

        // Multiply by order quantity
        const totalEffectiveQty = effectiveQtyPerPortion * quantity;

        const inventoryItemId = ing.inventory_item_id;

        // Lock inventory item for stock update
        const [[item]] = await connection.query(
          'SELECT current_stock, average_price FROM inventory_items WHERE id = ? FOR UPDATE',
          [inventoryItemId]
        );
        if (!item) {
          logger.warn(`Stock deduction: inventory item ${inventoryItemId} not found, skipping`);
          continue;
        }

        const currentStock = parseFloat(item.current_stock) || 0;
        const avgPrice = parseFloat(item.average_price) || 0;
        const balanceBefore = currentStock;
        const balanceAfter = currentStock - totalEffectiveQty;

        // FIFO batch deduction
        const batchDeductionDetails = await this._deductFromBatchesFIFO(
          connection, inventoryItemId, totalEffectiveQty
        );

        // Update inventory item stock
        await connection.query(
          'UPDATE inventory_items SET current_stock = ? WHERE id = ?',
          [balanceAfter, inventoryItemId]
        );

        // Calculate cost from batch deduction (FIFO cost)
        const deductionCost = batchDeductionDetails.totalCost;
        totalCostDeducted += deductionCost;

        // Record inventory movement
        await connection.query(
          `INSERT INTO inventory_movements (
            outlet_id, inventory_item_id, inventory_batch_id, movement_type,
            quantity, quantity_in_base, unit_cost, total_cost,
            balance_before, balance_after, reference_type, reference_id, notes, created_by
          ) VALUES (?, ?, ?, 'sale', ?, ?, ?, ?, ?, ?, 'order_item', ?, ?, ?)`,
          [outletId, inventoryItemId, batchDeductionDetails.firstBatchId,
           -totalEffectiveQty, -totalEffectiveQty, avgPrice, deductionCost,
           balanceBefore, balanceAfter, orderItemId,
           `Order #${orderId}, ${ing.ingredient_name}: ${totalEffectiveQty.toFixed(2)} base units`,
           userId]
        );

        deductions.push({
          inventoryItemId,
          ingredientName: ing.ingredient_name,
          qtyDeducted: parseFloat(totalEffectiveQty.toFixed(4)),
          cost: parseFloat(deductionCost.toFixed(2)),
          batchDetails: batchDeductionDetails.batches,
          balanceBefore: parseFloat(balanceBefore.toFixed(4)),
          balanceAfter: parseFloat(balanceAfter.toFixed(4))
        });
      }

      // Mark order item as stock_deducted
      await connection.query(
        'UPDATE order_items SET stock_deducted = 1 WHERE id = ?',
        [orderItemId]
      );

      logger.info(`Stock deducted for order_item ${orderItemId}: ${deductions.length} ingredients, cost ₹${totalCostDeducted.toFixed(2)}`);

      return {
        orderItemId,
        recipeId: recipe.id,
        ingredientCount: deductions.length,
        totalCostDeducted: parseFloat(totalCostDeducted.toFixed(2)),
        deductions
      };
    } catch (error) {
      logger.error(`Stock deduction failed for order_item ${orderItemId}:`, error);
      // Stock deduction failure should not block order
      return null;
    }
  },

  /**
   * Reverse stock deduction for a single order item (on cancel)
   * @param {object} connection - MySQL transaction connection
   * @param {object} params - { orderItemId, outletId, userId, reason }
   */
  async reverseForOrderItem(connection, { orderItemId, outletId, userId, reason }) {
    try {
      // Get all sale movements for this order item
      const [movements] = await connection.query(
        `SELECT im.*, ii.current_stock
         FROM inventory_movements im
         JOIN inventory_items ii ON im.inventory_item_id = ii.id
         WHERE im.reference_type = 'order_item' AND im.reference_id = ? AND im.movement_type = 'sale'`,
        [orderItemId]
      );

      if (movements.length === 0) return null; // No stock was deducted

      const restorations = [];

      for (const mov of movements) {
        const inventoryItemId = mov.inventory_item_id;
        const qtyToRestore = Math.abs(parseFloat(mov.quantity)); // movements stored as negative
        const unitCost = parseFloat(mov.unit_cost) || 0;

        // Lock inventory item
        const [[item]] = await connection.query(
          'SELECT current_stock, average_price FROM inventory_items WHERE id = ? FOR UPDATE',
          [inventoryItemId]
        );
        if (!item) continue;

        const currentStock = parseFloat(item.current_stock) || 0;
        const balanceBefore = currentStock;
        const balanceAfter = currentStock + qtyToRestore;

        // Restore to batch — create a small restoration batch
        const batchCode = `REV-ORD-${orderItemId}`;
        const [batchResult] = await connection.query(
          `INSERT INTO inventory_batches (
            inventory_item_id, outlet_id, batch_code, quantity, remaining_quantity,
            purchase_price, purchase_date, notes, is_active
          ) VALUES (?, ?, ?, ?, ?, ?, CURDATE(), ?, 1)`,
          [inventoryItemId, outletId, batchCode, qtyToRestore, qtyToRestore,
           unitCost, `Restored: order item cancel (item ${orderItemId})`]
        );

        // Update stock
        const oldAvg = parseFloat(item.average_price) || 0;
        let newAvg = unitCost;
        if (balanceAfter > 0 && balanceBefore > 0) {
          newAvg = ((balanceBefore * oldAvg) + (qtyToRestore * unitCost)) / balanceAfter;
        }
        newAvg = parseFloat(newAvg.toFixed(4));

        await connection.query(
          'UPDATE inventory_items SET current_stock = ?, average_price = ? WHERE id = ?',
          [balanceAfter, newAvg, inventoryItemId]
        );

        // Record reversal movement
        await connection.query(
          `INSERT INTO inventory_movements (
            outlet_id, inventory_item_id, inventory_batch_id, movement_type,
            quantity, quantity_in_base, unit_cost, total_cost,
            balance_before, balance_after, reference_type, reference_id, notes, created_by
          ) VALUES (?, ?, ?, 'sale_reversal', ?, ?, ?, ?, ?, ?, 'order_item', ?, ?, ?)`,
          [outletId, inventoryItemId, batchResult.insertId,
           qtyToRestore, qtyToRestore, unitCost, parseFloat(mov.total_cost) || 0,
           balanceBefore, balanceAfter, orderItemId,
           `Cancel reversal: ${reason || 'Order item cancelled'}`,
           userId]
        );

        restorations.push({
          inventoryItemId,
          qtyRestored: parseFloat(qtyToRestore.toFixed(4)),
          balanceAfter: parseFloat(balanceAfter.toFixed(4))
        });
      }

      // Reset stock_deducted flag
      await connection.query(
        'UPDATE order_items SET stock_deducted = 0 WHERE id = ?',
        [orderItemId]
      );

      logger.info(`Stock reversed for order_item ${orderItemId}: ${restorations.length} items restored`);

      return {
        orderItemId,
        restoredCount: restorations.length,
        restorations
      };
    } catch (error) {
      logger.error(`Stock reversal failed for order_item ${orderItemId}:`, error);
      return null;
    }
  },

  /**
   * Partial reverse: restore stock proportional to cancelled quantity
   * @param {object} connection - MySQL transaction connection
   * @param {object} params - { orderItemId, outletId, userId, reason, cancelQuantity, originalQuantity }
   */
  async partialReverseForOrderItem(connection, { orderItemId, outletId, userId, reason, cancelQuantity, originalQuantity }) {
    try {
      if (!cancelQuantity || !originalQuantity || cancelQuantity <= 0) return null;
      const ratio = cancelQuantity / originalQuantity;

      // Get all sale movements for this order item
      const [movements] = await connection.query(
        `SELECT im.*, ii.current_stock
         FROM inventory_movements im
         JOIN inventory_items ii ON im.inventory_item_id = ii.id
         WHERE im.reference_type = 'order_item' AND im.reference_id = ? AND im.movement_type = 'sale'`,
        [orderItemId]
      );

      if (movements.length === 0) return null;

      const restorations = [];

      for (const mov of movements) {
        const inventoryItemId = mov.inventory_item_id;
        const fullQty = Math.abs(parseFloat(mov.quantity));
        const qtyToRestore = parseFloat((fullQty * ratio).toFixed(4));
        const unitCost = parseFloat(mov.unit_cost) || 0;

        const [[item]] = await connection.query(
          'SELECT current_stock, average_price FROM inventory_items WHERE id = ? FOR UPDATE',
          [inventoryItemId]
        );
        if (!item) continue;

        const currentStock = parseFloat(item.current_stock) || 0;
        const balanceBefore = currentStock;
        const balanceAfter = currentStock + qtyToRestore;

        // Restore to batch
        const batchCode = `REV-PART-${orderItemId}`;
        const [batchResult] = await connection.query(
          `INSERT INTO inventory_batches (
            inventory_item_id, outlet_id, batch_code, quantity, remaining_quantity,
            purchase_price, purchase_date, notes, is_active
          ) VALUES (?, ?, ?, ?, ?, ?, CURDATE(), ?, 1)`,
          [inventoryItemId, outletId, batchCode, qtyToRestore, qtyToRestore,
           unitCost, `Partial cancel reversal: ${cancelQuantity} of ${originalQuantity} (item ${orderItemId})`]
        );

        // Update stock
        const oldAvg = parseFloat(item.average_price) || 0;
        let newAvg = unitCost;
        if (balanceAfter > 0 && balanceBefore > 0) {
          newAvg = ((balanceBefore * oldAvg) + (qtyToRestore * unitCost)) / balanceAfter;
        }
        newAvg = parseFloat(newAvg.toFixed(4));

        await connection.query(
          'UPDATE inventory_items SET current_stock = ?, average_price = ? WHERE id = ?',
          [balanceAfter, newAvg, inventoryItemId]
        );

        // Record partial reversal movement
        const totalCost = parseFloat((qtyToRestore * unitCost).toFixed(2));
        await connection.query(
          `INSERT INTO inventory_movements (
            outlet_id, inventory_item_id, inventory_batch_id, movement_type,
            quantity, quantity_in_base, unit_cost, total_cost,
            balance_before, balance_after, reference_type, reference_id, notes, created_by
          ) VALUES (?, ?, ?, 'sale_reversal', ?, ?, ?, ?, ?, ?, 'order_item', ?, ?, ?)`,
          [outletId, inventoryItemId, batchResult.insertId,
           qtyToRestore, qtyToRestore, unitCost, totalCost,
           balanceBefore, balanceAfter, orderItemId,
           `Partial cancel: ${cancelQuantity}/${originalQuantity} — ${reason || 'Quantity reduced'}`,
           userId]
        );

        restorations.push({
          inventoryItemId,
          qtyRestored: qtyToRestore,
          balanceAfter: parseFloat(balanceAfter.toFixed(4))
        });
      }

      logger.info(`Partial stock reversed for order_item ${orderItemId}: ${cancelQuantity}/${originalQuantity}, ${restorations.length} ingredients`);

      return {
        orderItemId,
        restoredCount: restorations.length,
        ratio,
        restorations
      };
    } catch (error) {
      logger.error(`Partial stock reversal failed for order_item ${orderItemId}:`, error);
      return null;
    }
  },

  /**
   * Reverse stock for ALL items in an order (on full order cancel)
   */
  async reverseForOrder(connection, { orderId, outletId, userId, reason }) {
    try {
      // Get all order items that had stock deducted
      const [items] = await connection.query(
        'SELECT id FROM order_items WHERE order_id = ? AND stock_deducted = 1',
        [orderId]
      );

      const results = [];
      for (const item of items) {
        const result = await this.reverseForOrderItem(connection, {
          orderItemId: item.id, outletId, userId, reason
        });
        if (result) results.push(result);
      }

      // Mark order as stock_reversed
      await connection.query(
        'UPDATE orders SET stock_reversed = 1 WHERE id = ?',
        [orderId]
      );

      logger.info(`Stock reversed for order ${orderId}: ${results.length} items reversed`);
      return results;
    } catch (error) {
      logger.error(`Stock reversal failed for order ${orderId}:`, error);
      return null;
    }
  },

  /**
   * FIFO batch deduction with cost tracking
   * Returns detailed batch breakdown for cost snapshot
   */
  async _deductFromBatchesFIFO(connection, inventoryItemId, quantity) {
    const [batches] = await connection.query(
      `SELECT id, remaining_quantity, purchase_price FROM inventory_batches
       WHERE inventory_item_id = ? AND remaining_quantity > 0 AND is_active = 1
       ORDER BY purchase_date ASC, id ASC`,
      [inventoryItemId]
    );

    let remaining = quantity;
    let firstBatchId = null;
    let totalCost = 0;
    const batchDetails = [];

    for (const batch of batches) {
      if (remaining <= 0) break;

      const batchQty = parseFloat(batch.remaining_quantity);
      const batchPrice = parseFloat(batch.purchase_price);
      const deduct = Math.min(remaining, batchQty);

      if (!firstBatchId) firstBatchId = batch.id;

      await connection.query(
        'UPDATE inventory_batches SET remaining_quantity = remaining_quantity - ? WHERE id = ?',
        [deduct, batch.id]
      );

      const batchCost = deduct * batchPrice;
      totalCost += batchCost;

      batchDetails.push({
        batchId: batch.id,
        qtyDeducted: parseFloat(deduct.toFixed(4)),
        pricePerUnit: batchPrice,
        cost: parseFloat(batchCost.toFixed(2))
      });

      remaining -= deduct;
    }

    // If remaining > 0, stock insufficient in batches but we still deduct from item
    // (may happen with manual adjustments that don't create batches)
    if (remaining > 0) {
      // Use average price for the un-batched portion
      const [[item]] = await connection.query(
        'SELECT average_price FROM inventory_items WHERE id = ?',
        [inventoryItemId]
      );
      const avgPrice = parseFloat(item?.average_price) || 0;
      totalCost += remaining * avgPrice;
    }

    return {
      firstBatchId,
      totalCost: parseFloat(totalCost.toFixed(2)),
      batches: batchDetails,
      unbatchedQty: remaining > 0 ? parseFloat(remaining.toFixed(4)) : 0
    };
  }
};

module.exports = stockDeductionService;
