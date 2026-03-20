/**
 * Wastage Management Service — Module 10
 * 
 * Handles inventory wastage: spoilage, expiry, damage, cooking loss
 * 
 * Flow:
 *   1. User reports wastage (item, batch, quantity, reason)
 *   2. Deduct from inventory batch (FIFO or specific batch)
 *   3. Record inventory movement (type: 'wastage')
 *   4. Update inventory_items.current_stock
 *   5. Log in wastage_logs for reporting
 * 
 * Expiry: System flags near-expiry batches but does NOT auto-deduct.
 *         Admin/manager must manually record wastage.
 */

const { getPool } = require('../database');
const logger = require('../utils/logger');

const wastageService = {

  /**
   * Record a wastage event
   * @param {number} outletId
   * @param {object} data - { inventoryItemId, batchId?, quantity, unitId, wastageType, reason }
   * @param {number} userId - who reported
   */
  async recordWastage(outletId, data, userId) {
    const pool = getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const {
        inventoryItemId, batchId, quantity, unitId,
        wastageType = 'spoilage', reason, approvedBy, wastageDate
      } = data;

      if (!inventoryItemId) throw new Error('inventoryItemId is required');
      if (!quantity || quantity <= 0) throw new Error('quantity must be > 0');

      // Get inventory item + unit conversion
      const [[item]] = await connection.query(
        `SELECT ii.id, ii.name, ii.current_stock, ii.average_price, ii.base_unit_id,
          COALESCE(pu.conversion_factor, 1) as purchase_cf,
          COALESCE(pu.abbreviation, bu.abbreviation) as display_unit
         FROM inventory_items ii
         LEFT JOIN units bu ON ii.base_unit_id = bu.id
         LEFT JOIN units pu ON ii.purchase_unit_id = pu.id
         WHERE ii.id = ? AND ii.outlet_id = ? FOR UPDATE`,
        [inventoryItemId, outletId]
      );
      if (!item) throw new Error('Inventory item not found');

      // Convert quantity to base units
      let qtyInBase = quantity;
      if (unitId) {
        const [[unit]] = await connection.query(
          'SELECT conversion_factor FROM units WHERE id = ?', [unitId]
        );
        if (unit) {
          qtyInBase = quantity * parseFloat(unit.conversion_factor);
        }
      }

      const currentStock = parseFloat(item.current_stock) || 0;
      const avgPrice = parseFloat(item.average_price) || 0;
      const balanceBefore = currentStock;
      const balanceAfter = Math.max(0, currentStock - qtyInBase);
      const unitCost = avgPrice;
      const totalCost = parseFloat((qtyInBase * avgPrice).toFixed(2));

      // Deduct from specific batch or FIFO
      let firstBatchId = batchId || null;
      if (batchId) {
        // Specific batch deduction
        const [[batch]] = await connection.query(
          'SELECT remaining_quantity FROM inventory_batches WHERE id = ? AND inventory_item_id = ? FOR UPDATE',
          [batchId, inventoryItemId]
        );
        if (!batch) throw new Error('Batch not found for this item');
        
        const batchRemaining = parseFloat(batch.remaining_quantity);
        if (qtyInBase > batchRemaining + 0.01) {
          const cf = parseFloat(item.purchase_cf) || 1;
          throw new Error(
            `Batch has only ${(batchRemaining / cf).toFixed(4)} ${item.display_unit} remaining, ` +
            `cannot deduct ${(qtyInBase / cf).toFixed(4)} ${item.display_unit}`
          );
        }

        await connection.query(
          'UPDATE inventory_batches SET remaining_quantity = GREATEST(0, remaining_quantity - ?) WHERE id = ?',
          [qtyInBase, batchId]
        );
      } else {
        // FIFO deduction
        const [batches] = await connection.query(
          `SELECT id, remaining_quantity FROM inventory_batches
           WHERE inventory_item_id = ? AND remaining_quantity > 0 AND is_active = 1
           ORDER BY purchase_date ASC, id ASC`,
          [inventoryItemId]
        );

        let remaining = qtyInBase;
        for (const batch of batches) {
          if (remaining <= 0) break;
          const batchQty = parseFloat(batch.remaining_quantity);
          const deduct = Math.min(remaining, batchQty);
          if (!firstBatchId) firstBatchId = batch.id;

          await connection.query(
            'UPDATE inventory_batches SET remaining_quantity = remaining_quantity - ? WHERE id = ?',
            [deduct, batch.id]
          );
          remaining -= deduct;
        }
      }

      // Update inventory item stock
      await connection.query(
        'UPDATE inventory_items SET current_stock = ? WHERE id = ?',
        [balanceAfter, inventoryItemId]
      );

      // Record inventory movement
      await connection.query(
        `INSERT INTO inventory_movements (
          outlet_id, inventory_item_id, inventory_batch_id, movement_type,
          quantity, quantity_in_base, unit_cost, total_cost,
          balance_before, balance_after, reference_type, reference_id, notes, created_by
        ) VALUES (?, ?, ?, 'wastage', ?, ?, ?, ?, ?, ?, 'wastage', NULL, ?, ?)`,
        [outletId, inventoryItemId, firstBatchId,
         -qtyInBase, -qtyInBase, unitCost, totalCost,
         balanceBefore, balanceAfter,
         `Wastage: ${wastageType} — ${reason || 'No reason specified'}`,
         userId]
      );

      // Insert wastage log
      const effectiveDate = wastageDate || new Date().toISOString().slice(0, 10);
      const [logResult] = await connection.query(
        `INSERT INTO wastage_logs (
          outlet_id, inventory_item_id, inventory_batch_id, quantity, quantity_in_base,
          unit_id, unit_cost, total_cost, wastage_type, reason,
          reported_by, approved_by, wastage_date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [outletId, inventoryItemId, firstBatchId, quantity, qtyInBase,
         unitId || null, unitCost, totalCost, wastageType, reason || null,
         userId, approvedBy || null, effectiveDate]
      );

      // Update movement reference_id
      await connection.query(
        `UPDATE inventory_movements SET reference_id = ?
         WHERE reference_type = 'wastage' AND reference_id IS NULL AND inventory_item_id = ?
         AND created_by = ? AND created_at >= NOW() - INTERVAL 5 SECOND`,
        [logResult.insertId, inventoryItemId, userId]
      );

      await connection.commit();

      const cf = parseFloat(item.purchase_cf) || 1;
      logger.info(`Wastage recorded: ${item.name} — ${(qtyInBase / cf).toFixed(4)} ${item.display_unit} (${wastageType})`);

      return {
        id: logResult.insertId,
        inventoryItemId,
        itemName: item.name,
        quantity,
        qtyInBase: parseFloat(qtyInBase.toFixed(4)),
        displayQty: parseFloat((qtyInBase / cf).toFixed(4)),
        displayUnit: item.display_unit,
        wastageType,
        reason: reason || null,
        unitCost: parseFloat(unitCost.toFixed(4)),
        totalCost,
        stockBefore: parseFloat((balanceBefore / cf).toFixed(4)),
        stockAfter: parseFloat((balanceAfter / cf).toFixed(4)),
        wastageDate: effectiveDate,
        reportedBy: userId
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

  /**
   * List wastage logs with filters
   */
  async listWastage(outletId, options = {}) {
    const pool = getPool();
    const {
      page = 1, limit = 50, inventoryItemId, wastageType,
      startDate, endDate, sortBy = 'wastage_date', sortOrder = 'DESC'
    } = options;

    const safePage = Math.max(1, parseInt(page) || 1);
    const safeLimit = Math.min(100, Math.max(1, parseInt(limit) || 50));
    const offset = (safePage - 1) * safeLimit;

    const allowedSort = ['wastage_date', 'total_cost', 'quantity_in_base', 'created_at'];
    const safeSortBy = allowedSort.includes(sortBy) ? sortBy : 'wastage_date';
    const safeSortOrder = String(sortOrder).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    let where = 'WHERE wl.outlet_id = ?';
    const params = [outletId];

    if (inventoryItemId) { where += ' AND wl.inventory_item_id = ?'; params.push(inventoryItemId); }
    if (wastageType) { where += ' AND wl.wastage_type = ?'; params.push(wastageType); }
    if (startDate) { where += ' AND wl.wastage_date >= ?'; params.push(startDate); }
    if (endDate) { where += ' AND wl.wastage_date <= ?'; params.push(endDate); }

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) as total FROM wastage_logs wl ${where}`, params
    );

    const [rows] = await pool.query(
      `SELECT wl.*,
        ii.name as item_name, ii.sku as item_sku,
        COALESCE(pu.conversion_factor, 1) as purchase_cf,
        COALESCE(pu.abbreviation, bu.abbreviation) as display_unit,
        ib.batch_code,
        u.name as reported_by_name,
        ua.name as approved_by_name
       FROM wastage_logs wl
       JOIN inventory_items ii ON wl.inventory_item_id = ii.id
       LEFT JOIN units bu ON ii.base_unit_id = bu.id
       LEFT JOIN units pu ON ii.purchase_unit_id = pu.id
       LEFT JOIN inventory_batches ib ON wl.inventory_batch_id = ib.id
       LEFT JOIN users u ON wl.reported_by = u.id
       LEFT JOIN users ua ON wl.approved_by = ua.id
       ${where}
       ORDER BY wl.${safeSortBy} ${safeSortOrder}
       LIMIT ? OFFSET ?`,
      [...params, safeLimit, offset]
    );

    // Summary
    const [[summary]] = await pool.query(
      `SELECT
        COUNT(*) as totalEntries,
        COALESCE(SUM(wl.total_cost), 0) as totalCostLost,
        COALESCE(SUM(wl.quantity_in_base), 0) as totalQtyWasted
       FROM wastage_logs wl ${where}`,
      params
    );

    return {
      wastage: rows.map(r => {
        const cf = parseFloat(r.purchase_cf) || 1;
        return {
          id: r.id,
          inventoryItemId: r.inventory_item_id,
          itemName: r.item_name,
          itemSku: r.item_sku,
          batchId: r.inventory_batch_id,
          batchCode: r.batch_code || null,
          quantity: parseFloat((parseFloat(r.quantity_in_base) / cf).toFixed(4)),
          unit: r.display_unit,
          unitCost: parseFloat((parseFloat(r.unit_cost) * cf).toFixed(4)),
          totalCost: parseFloat(r.total_cost),
          wastageType: r.wastage_type,
          reason: r.reason || null,
          wastageDate: r.wastage_date,
          reportedBy: r.reported_by_name || null,
          approvedBy: r.approved_by_name || null,
          createdAt: r.created_at
        };
      }),
      summary: {
        totalEntries: parseInt(summary.totalEntries),
        totalCostLost: parseFloat(parseFloat(summary.totalCostLost).toFixed(2)),
        totalQtyWasted: parseFloat(parseFloat(summary.totalQtyWasted).toFixed(4))
      },
      pagination: { page: safePage, limit: safeLimit, total, totalPages: Math.ceil(total / safeLimit) }
    };
  },

  /**
   * Get near-expiry batches (for flagging only — no auto-deduction)
   * Returns batches expiring within `daysAhead` days
   */
  async getNearExpiryBatches(outletId, daysAhead = 7) {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT ib.*,
        ii.name as item_name, ii.sku,
        COALESCE(pu.conversion_factor, 1) as purchase_cf,
        COALESCE(pu.abbreviation, bu.abbreviation) as display_unit,
        DATEDIFF(ib.expiry_date, CURDATE()) as days_until_expiry
       FROM inventory_batches ib
       JOIN inventory_items ii ON ib.inventory_item_id = ii.id
       LEFT JOIN units bu ON ii.base_unit_id = bu.id
       LEFT JOIN units pu ON ii.purchase_unit_id = pu.id
       WHERE ii.outlet_id = ? AND ib.is_active = 1 AND ib.remaining_quantity > 0
         AND ib.expiry_date IS NOT NULL AND ib.expiry_date <= DATE_ADD(CURDATE(), INTERVAL ? DAY)
       ORDER BY ib.expiry_date ASC`,
      [outletId, daysAhead]
    );

    return rows.map(r => {
      const cf = parseFloat(r.purchase_cf) || 1;
      return {
        batchId: r.id,
        batchCode: r.batch_code || null,
        inventoryItemId: r.inventory_item_id,
        itemName: r.item_name,
        remainingQty: parseFloat((parseFloat(r.remaining_quantity) / cf).toFixed(4)),
        unit: r.display_unit,
        expiryDate: r.expiry_date,
        daysUntilExpiry: r.days_until_expiry,
        isExpired: r.days_until_expiry <= 0,
        purchasePrice: parseFloat((parseFloat(r.purchase_price) * cf).toFixed(4)),
        estimatedLoss: parseFloat((parseFloat(r.remaining_quantity) * parseFloat(r.purchase_price)).toFixed(2))
      };
    });
  }
};

module.exports = wastageService;
