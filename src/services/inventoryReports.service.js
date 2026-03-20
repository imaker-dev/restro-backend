/**
 * Inventory Reports Service — Module 11
 * 
 * Reports:
 *   1. Stock Summary Report — current stock + value for all items
 *   2. Batch Report — all batches with remaining qty + cost
 *   3. Stock Ledger — full movement history (the MOST IMPORTANT report)
 *   4. Recipe Consumption Report — ingredient usage from orders
 *   5. Production Report — production history with costs
 *   6. Wastage Report — wastage summary by item/type/period
 *   7. Profit Report — item-level profit (revenue - actual cost)
 *   8. Daily Business Summary — gross sale, net sale, NC, due, collection
 */

const { getPool } = require('../database');
const logger = require('../utils/logger');

const inventoryReportsService = {

  // ============================================================
  // 1. STOCK SUMMARY REPORT
  // ============================================================
  async stockSummary(outletId, options = {}) {
    const pool = getPool();
    const { categoryId, search, lowStockOnly, sortBy = 'name', sortOrder = 'ASC' } = options;

    let where = 'WHERE ii.outlet_id = ? AND ii.is_active = 1';
    const params = [outletId];

    if (categoryId) { where += ' AND ii.category_id = ?'; params.push(categoryId); }
    if (search) { where += ' AND ii.name LIKE ?'; params.push(`%${search}%`); }
    if (lowStockOnly === 'true' || lowStockOnly === true) {
      where += ' AND ii.current_stock <= ii.reorder_level';
    }

    const allowedSort = ['name', 'current_stock', 'average_price', 'stock_value'];
    const safeSortBy = allowedSort.includes(sortBy) ? sortBy : 'name';
    const safeSortOrder = String(sortOrder).toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    const orderClause = safeSortBy === 'stock_value'
      ? `ORDER BY (ii.current_stock * ii.average_price) ${safeSortOrder}`
      : `ORDER BY ii.${safeSortBy} ${safeSortOrder}`;

    const [rows] = await pool.query(
      `SELECT ii.id, ii.name, ii.sku, ii.category_id, ii.current_stock, ii.average_price, ii.latest_price,
        ii.reorder_level, ii.base_unit_id, ii.purchase_unit_id,
        ic.name as category_name,
        bu.abbreviation as base_unit_abbr,
        COALESCE(pu.conversion_factor, 1) as purchase_cf,
        COALESCE(pu.abbreviation, bu.abbreviation) as display_unit,
        (ii.current_stock * ii.average_price) as stock_value,
        (SELECT COUNT(*) FROM inventory_batches ib WHERE ib.inventory_item_id = ii.id AND ib.remaining_quantity > 0 AND ib.is_active = 1) as active_batches
       FROM inventory_items ii
       LEFT JOIN inventory_categories ic ON ii.category_id = ic.id
       LEFT JOIN units bu ON ii.base_unit_id = bu.id
       LEFT JOIN units pu ON ii.purchase_unit_id = pu.id
       ${where}
       ${orderClause}`,
      params
    );

    let totalStockValue = 0;
    let lowStockCount = 0;
    let zeroStockCount = 0;

    const items = rows.map(r => {
      const cf = parseFloat(r.purchase_cf) || 1;
      const rawStock = parseFloat(r.current_stock) || 0;
      const rawAvg = parseFloat(r.average_price) || 0;
      const stockValue = parseFloat(r.stock_value) || 0;
      totalStockValue += stockValue;

      const isLowStock = r.reorder_level && rawStock <= parseFloat(r.reorder_level);
      const isZeroStock = rawStock <= 0;
      if (isLowStock) lowStockCount++;
      if (isZeroStock) zeroStockCount++;

      return {
        id: r.id,
        name: r.name,
        sku: r.sku || null,
        category: r.category_name || null,
        stock: parseFloat((rawStock / cf).toFixed(4)),
        unit: r.display_unit,
        avgPrice: parseFloat((rawAvg * cf).toFixed(4)),
        latestPrice: parseFloat((parseFloat(r.latest_price) * cf).toFixed(4)),
        stockValue: parseFloat(stockValue.toFixed(2)),
        activeBatches: r.active_batches,
        reorderLevel: r.reorder_level ? parseFloat((parseFloat(r.reorder_level) / cf).toFixed(4)) : null,
        isLowStock: !!isLowStock,
        isZeroStock
      };
    });

    return {
      items,
      summary: {
        totalItems: items.length,
        totalStockValue: parseFloat(totalStockValue.toFixed(2)),
        lowStockCount,
        zeroStockCount
      }
    };
  },

  // ============================================================
  // 2. BATCH REPORT
  // ============================================================
  async batchReport(outletId, options = {}) {
    const pool = getPool();
    const { inventoryItemId, activeOnly = true, sortBy = 'purchase_date', sortOrder = 'ASC' } = options;

    let where = 'WHERE ii.outlet_id = ?';
    const params = [outletId];

    if (inventoryItemId) { where += ' AND ib.inventory_item_id = ?'; params.push(inventoryItemId); }
    if (activeOnly === true || activeOnly === 'true') {
      where += ' AND ib.is_active = 1 AND ib.remaining_quantity > 0';
    }

    const [rows] = await pool.query(
      `SELECT ib.*, ii.name as item_name, ii.sku as item_sku,
        COALESCE(pu.conversion_factor, 1) as purchase_cf,
        COALESCE(pu.abbreviation, bu.abbreviation) as display_unit
       FROM inventory_batches ib
       JOIN inventory_items ii ON ib.inventory_item_id = ii.id
       LEFT JOIN units bu ON ii.base_unit_id = bu.id
       LEFT JOIN units pu ON ii.purchase_unit_id = pu.id
       ${where}
       ORDER BY ib.${sortBy === 'item_name' ? 'inventory_item_id' : 'purchase_date'} ${String(sortOrder).toUpperCase() === 'DESC' ? 'DESC' : 'ASC'}, ib.id ASC`,
      params
    );

    let totalBatchValue = 0;
    const batches = rows.map(r => {
      const cf = parseFloat(r.purchase_cf) || 1;
      const remaining = parseFloat(r.remaining_quantity) || 0;
      const price = parseFloat(r.purchase_price) || 0;
      const batchValue = remaining * price;
      totalBatchValue += batchValue;

      return {
        batchId: r.id,
        batchCode: r.batch_code || null,
        inventoryItemId: r.inventory_item_id,
        itemName: r.item_name,
        originalQty: parseFloat((parseFloat(r.quantity) / cf).toFixed(4)),
        remainingQty: parseFloat((remaining / cf).toFixed(4)),
        unit: r.display_unit,
        purchasePrice: parseFloat((price * cf).toFixed(4)),
        batchValue: parseFloat(batchValue.toFixed(2)),
        purchaseDate: r.purchase_date,
        expiryDate: r.expiry_date || null,
        isActive: !!r.is_active,
        usedPercentage: parseFloat(r.quantity) > 0
          ? parseFloat((((parseFloat(r.quantity) - remaining) / parseFloat(r.quantity)) * 100).toFixed(1))
          : 0
      };
    });

    return {
      batches,
      summary: {
        totalBatches: batches.length,
        totalBatchValue: parseFloat(totalBatchValue.toFixed(2))
      }
    };
  },

  // ============================================================
  // 3. STOCK LEDGER (MOST IMPORTANT)
  // ============================================================
  async stockLedger(outletId, options = {}) {
    const pool = getPool();
    const {
      inventoryItemId, movementType, startDate, endDate,
      page = 1, limit = 100, sortOrder = 'DESC'
    } = options;

    const safePage = Math.max(1, parseInt(page) || 1);
    const safeLimit = Math.min(500, Math.max(1, parseInt(limit) || 100));
    const offset = (safePage - 1) * safeLimit;

    let where = 'WHERE im.outlet_id = ?';
    const params = [outletId];

    if (inventoryItemId) { where += ' AND im.inventory_item_id = ?'; params.push(inventoryItemId); }
    if (movementType) { where += ' AND im.movement_type = ?'; params.push(movementType); }
    if (startDate) { where += ' AND DATE(im.created_at) >= ?'; params.push(startDate); }
    if (endDate) { where += ' AND DATE(im.created_at) <= ?'; params.push(endDate); }

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) as total FROM inventory_movements im ${where}`, params
    );

    const safeSortOrder = String(sortOrder).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const [rows] = await pool.query(
      `SELECT im.*,
        ii.name as item_name, ii.sku as item_sku,
        COALESCE(pu.conversion_factor, 1) as purchase_cf,
        COALESCE(pu.abbreviation, bu.abbreviation) as display_unit,
        ib.batch_code,
        u.name as created_by_name
       FROM inventory_movements im
       JOIN inventory_items ii ON im.inventory_item_id = ii.id
       LEFT JOIN units bu ON ii.base_unit_id = bu.id
       LEFT JOIN units pu ON ii.purchase_unit_id = pu.id
       LEFT JOIN inventory_batches ib ON im.inventory_batch_id = ib.id
       LEFT JOIN users u ON im.created_by = u.id
       ${where}
       ORDER BY im.created_at ${safeSortOrder}, im.id ${safeSortOrder}
       LIMIT ? OFFSET ?`,
      [...params, safeLimit, offset]
    );

    // Summary: aggregate by movement type
    const [typeSummary] = await pool.query(
      `SELECT im.movement_type,
        COUNT(*) as count,
        COALESCE(SUM(im.quantity), 0) as total_qty,
        COALESCE(SUM(ABS(im.total_cost)), 0) as total_value
       FROM inventory_movements im
       ${where}
       GROUP BY im.movement_type`,
      params
    );

    const movements = rows.map(r => {
      const cf = parseFloat(r.purchase_cf) || 1;
      const rawQty = parseFloat(r.quantity) || 0;
      return {
        id: r.id,
        date: r.created_at,
        itemName: r.item_name,
        itemSku: r.item_sku,
        movementType: r.movement_type,
        quantity: parseFloat((rawQty / cf).toFixed(4)),
        unit: r.display_unit,
        direction: rawQty >= 0 ? 'IN' : 'OUT',
        unitCost: parseFloat((parseFloat(r.unit_cost || 0) * cf).toFixed(4)),
        totalCost: parseFloat(Math.abs(parseFloat(r.total_cost) || 0).toFixed(2)),
        balanceBefore: parseFloat((parseFloat(r.balance_before) / cf).toFixed(4)),
        balanceAfter: parseFloat((parseFloat(r.balance_after) / cf).toFixed(4)),
        batchCode: r.batch_code || null,
        referenceType: r.reference_type || null,
        referenceId: r.reference_id || null,
        notes: r.notes || null,
        createdBy: r.created_by_name || null
      };
    });

    return {
      movements,
      summary: typeSummary.map(t => ({
        type: t.movement_type,
        count: parseInt(t.count),
        totalQty: parseFloat(parseFloat(t.total_qty).toFixed(4)),
        totalValue: parseFloat(parseFloat(t.total_value).toFixed(2))
      })),
      pagination: { page: safePage, limit: safeLimit, total, totalPages: Math.ceil(total / safeLimit) }
    };
  },

  // ============================================================
  // 4. RECIPE CONSUMPTION REPORT
  // ============================================================
  async recipeConsumption(outletId, options = {}) {
    const pool = getPool();
    const { startDate, endDate, recipeId, menuItemId } = options;

    let dateFilter = '';
    const params = [outletId];
    if (startDate) { dateFilter += ' AND DATE(o.created_at) >= ?'; params.push(startDate); }
    if (endDate) { dateFilter += ' AND DATE(o.created_at) <= ?'; params.push(endDate); }

    let recipeFilter = '';
    if (recipeId) { recipeFilter += ' AND r.id = ?'; params.push(recipeId); }
    if (menuItemId) { recipeFilter += ' AND r.menu_item_id = ?'; params.push(menuItemId); }

    // Aggregate: for each ingredient, sum(recipe_qty × order_qty) across all orders in period
    const [rows] = await pool.query(
      `SELECT
        ing.id as ingredient_id, ing.name as ingredient_name,
        ii.id as inventory_item_id, ii.name as inventory_item_name,
        COALESCE(pu.conversion_factor, 1) as purchase_cf,
        COALESCE(pu.abbreviation, bu.abbreviation) as display_unit,
        ru.conversion_factor as recipe_unit_cf,
        ri.quantity as recipe_qty_per_portion,
        ing.wastage_percentage, ing.yield_percentage,
        SUM(oi.quantity) as total_order_qty,
        COUNT(DISTINCT o.id) as order_count,
        ii.average_price
       FROM order_items oi
       JOIN orders o ON oi.order_id = o.id
       JOIN recipes r ON r.menu_item_id = oi.item_id
         AND (r.variant_id = oi.variant_id OR (r.variant_id IS NULL AND oi.variant_id IS NULL))
         AND r.is_current = 1 AND r.is_active = 1
       JOIN recipe_ingredients ri ON ri.recipe_id = r.id
       JOIN ingredients ing ON ri.ingredient_id = ing.id
       JOIN inventory_items ii ON ing.inventory_item_id = ii.id
       LEFT JOIN units bu ON ii.base_unit_id = bu.id
       LEFT JOIN units pu ON ii.purchase_unit_id = pu.id
       LEFT JOIN units ru ON ri.unit_id = ru.id
       WHERE o.outlet_id = ? AND o.status NOT IN ('cancelled')
         AND oi.status != 'cancelled'
         ${dateFilter}
         ${recipeFilter}
       GROUP BY ing.id, ii.id, ri.id
       ORDER BY ingredient_name`,
      params
    );

    const consumption = rows.map(r => {
      const cf = parseFloat(r.purchase_cf) || 1;
      const recipeUnitCf = parseFloat(r.recipe_unit_cf) || 1;
      const qtyPerPortion = parseFloat(r.recipe_qty_per_portion) || 0;
      const wastage = parseFloat(r.wastage_percentage) || 0;
      const yieldPct = parseFloat(r.yield_percentage) || 100;
      const orderQty = parseFloat(r.total_order_qty) || 0;

      // Effective qty per portion in base units
      const effectivePerPortion = qtyPerPortion * recipeUnitCf * (1 + wastage / 100) * (100 / yieldPct);
      const totalConsumed = effectivePerPortion * orderQty;
      const totalCost = totalConsumed * (parseFloat(r.average_price) || 0);

      return {
        ingredientId: r.ingredient_id,
        ingredientName: r.ingredient_name,
        inventoryItemId: r.inventory_item_id,
        inventoryItemName: r.inventory_item_name,
        recipeQtyPerPortion: parseFloat((qtyPerPortion * recipeUnitCf / cf).toFixed(4)),
        unit: r.display_unit,
        totalOrderQty: orderQty,
        orderCount: parseInt(r.order_count),
        totalConsumed: parseFloat((totalConsumed / cf).toFixed(4)),
        estimatedCost: parseFloat(totalCost.toFixed(2))
      };
    });

    const totalEstimatedCost = consumption.reduce((s, c) => s + c.estimatedCost, 0);

    return {
      consumption,
      summary: {
        totalIngredients: consumption.length,
        totalEstimatedCost: parseFloat(totalEstimatedCost.toFixed(2))
      }
    };
  },

  // ============================================================
  // 5. PRODUCTION REPORT
  // ============================================================
  async productionReport(outletId, options = {}) {
    const pool = getPool();
    const { startDate, endDate, status, outputItemId } = options;

    let where = 'WHERE p.outlet_id = ?';
    const params = [outletId];

    if (startDate) { where += ' AND DATE(p.produced_at) >= ?'; params.push(startDate); }
    if (endDate) { where += ' AND DATE(p.produced_at) <= ?'; params.push(endDate); }
    if (status) { where += ' AND p.status = ?'; params.push(status); }
    if (outputItemId) { where += ' AND p.output_inventory_item_id = ?'; params.push(outputItemId); }

    const [rows] = await pool.query(
      `SELECT p.*,
        ii.name as output_item_name,
        COALESCE(pu.conversion_factor, 1) as purchase_cf,
        COALESCE(pu.abbreviation, bu.abbreviation) as display_unit
       FROM productions p
       LEFT JOIN inventory_items ii ON p.output_inventory_item_id = ii.id
       LEFT JOIN units bu ON ii.base_unit_id = bu.id
       LEFT JOIN units pu ON ii.purchase_unit_id = pu.id
       ${where}
       ORDER BY p.produced_at DESC`,
      params
    );

    let totalInputCost = 0;
    let totalOutputQty = 0;

    const productions = rows.map(r => {
      const cf = parseFloat(r.purchase_cf) || 1;
      const outputQty = parseFloat(r.output_quantity) || 0;
      const inputCost = parseFloat(r.total_input_cost) || 0;
      totalInputCost += inputCost;
      totalOutputQty += outputQty / cf;

      return {
        id: r.id,
        productionNumber: r.production_number,
        name: r.name,
        status: r.status,
        outputItem: r.output_item_name,
        outputQty: parseFloat((outputQty / cf).toFixed(4)),
        unit: r.display_unit,
        totalInputCost: parseFloat(inputCost.toFixed(2)),
        costPerUnit: parseFloat((parseFloat(r.cost_per_output_unit) * cf).toFixed(4)),
        producedAt: r.produced_at,
        reversedAt: r.reversed_at || null,
        reversalNotes: r.reversal_notes || null
      };
    });

    return {
      productions,
      summary: {
        totalProductions: productions.length,
        completedCount: productions.filter(p => p.status === 'completed').length,
        cancelledCount: productions.filter(p => p.status === 'cancelled').length,
        totalInputCost: parseFloat(totalInputCost.toFixed(2)),
        totalOutputQty: parseFloat(totalOutputQty.toFixed(4))
      }
    };
  },

  // ============================================================
  // 6. WASTAGE REPORT
  // ============================================================
  async wastageReport(outletId, options = {}) {
    const pool = getPool();
    const { startDate, endDate, wastageType, inventoryItemId, groupBy = 'item' } = options;

    let where = 'WHERE wl.outlet_id = ?';
    const params = [outletId];

    if (startDate) { where += ' AND wl.wastage_date >= ?'; params.push(startDate); }
    if (endDate) { where += ' AND wl.wastage_date <= ?'; params.push(endDate); }
    if (wastageType) { where += ' AND wl.wastage_type = ?'; params.push(wastageType); }
    if (inventoryItemId) { where += ' AND wl.inventory_item_id = ?'; params.push(inventoryItemId); }

    let groupClause, selectExtra;
    if (groupBy === 'type') {
      groupClause = 'GROUP BY wl.wastage_type';
      selectExtra = "wl.wastage_type as group_key, wl.wastage_type as group_label";
    } else if (groupBy === 'date') {
      groupClause = 'GROUP BY DATE(wl.wastage_date)';
      selectExtra = "DATE(wl.wastage_date) as group_key, DATE(wl.wastage_date) as group_label";
    } else {
      // default: group by item
      groupClause = 'GROUP BY wl.inventory_item_id';
      selectExtra = "wl.inventory_item_id as group_key, ii.name as group_label";
    }

    const [rows] = await pool.query(
      `SELECT ${selectExtra},
        COUNT(*) as incident_count,
        COALESCE(SUM(wl.quantity_in_base), 0) as total_qty_base,
        COALESCE(SUM(wl.total_cost), 0) as total_cost_lost,
        COALESCE(pu.conversion_factor, 1) as purchase_cf,
        COALESCE(pu.abbreviation, bu.abbreviation) as display_unit
       FROM wastage_logs wl
       JOIN inventory_items ii ON wl.inventory_item_id = ii.id
       LEFT JOIN units bu ON ii.base_unit_id = bu.id
       LEFT JOIN units pu ON ii.purchase_unit_id = pu.id
       ${where}
       ${groupClause}
       ORDER BY total_cost_lost DESC`,
      params
    );

    const groups = rows.map(r => {
      const cf = parseFloat(r.purchase_cf) || 1;
      return {
        key: r.group_key,
        label: r.group_label,
        incidentCount: parseInt(r.incident_count),
        totalQty: parseFloat((parseFloat(r.total_qty_base) / cf).toFixed(4)),
        unit: r.display_unit || null,
        totalCostLost: parseFloat(parseFloat(r.total_cost_lost).toFixed(2))
      };
    });

    const totalCost = groups.reduce((s, g) => s + g.totalCostLost, 0);
    const totalIncidents = groups.reduce((s, g) => s + g.incidentCount, 0);

    return {
      groups,
      summary: {
        totalIncidents,
        totalCostLost: parseFloat(totalCost.toFixed(2)),
        groupBy
      }
    };
  },

  // ============================================================
  // 7. PROFIT REPORT — item-level (revenue - actual cost)
  // ============================================================
  async profitReport(outletId, options = {}) {
    const pool = getPool();
    const { startDate, endDate, menuItemId, sortBy = 'profit', sortOrder = 'DESC' } = options;

    let dateFilter = '';
    const params = [outletId];
    if (startDate) { dateFilter += ' AND DATE(o.created_at) >= ?'; params.push(startDate); }
    if (endDate) { dateFilter += ' AND DATE(o.created_at) <= ?'; params.push(endDate); }

    let itemFilter = '';
    if (menuItemId) { itemFilter = ' AND oi.item_id = ?'; params.push(menuItemId); }

    const [rows] = await pool.query(
      `SELECT
        oi.item_id, oi.item_name, oi.variant_id, oi.variant_name,
        COUNT(DISTINCT o.id) as order_count,
        SUM(oi.quantity) as total_qty_sold,
        SUM(oi.total_price) as total_revenue,
        SUM(CASE WHEN oi.is_nc = 1 THEN oi.total_price ELSE 0 END) as nc_revenue,
        COALESCE(SUM(oic.making_cost), 0) as total_making_cost,
        COALESCE(SUM(oic.profit), 0) as total_profit
       FROM order_items oi
       JOIN orders o ON oi.order_id = o.id
       LEFT JOIN order_item_costs oic ON oic.order_item_id = oi.id
       WHERE o.outlet_id = ? AND o.status IN ('paid', 'completed')
         AND oi.status != 'cancelled'
         ${dateFilter}
         ${itemFilter}
       GROUP BY oi.item_id, oi.item_name, oi.variant_id, oi.variant_name
       ORDER BY ${sortBy === 'revenue' ? 'total_revenue' : sortBy === 'cost' ? 'total_making_cost' : sortBy === 'qty' ? 'total_qty_sold' : 'total_profit'} ${String(sortOrder).toUpperCase() === 'ASC' ? 'ASC' : 'DESC'}`,
      params
    );

    let grandRevenue = 0, grandCost = 0, grandProfit = 0, grandNc = 0;

    const items = rows.map(r => {
      const revenue = parseFloat(r.total_revenue) || 0;
      const cost = parseFloat(r.total_making_cost) || 0;
      const profit = parseFloat(r.total_profit) || 0;
      const nc = parseFloat(r.nc_revenue) || 0;
      grandRevenue += revenue;
      grandCost += cost;
      grandProfit += profit;
      grandNc += nc;

      const netRevenue = revenue - nc;

      return {
        itemId: r.item_id,
        itemName: r.item_name,
        variantId: r.variant_id || null,
        variantName: r.variant_name || null,
        orderCount: parseInt(r.order_count),
        qtySold: parseFloat(r.total_qty_sold),
        revenue: parseFloat(revenue.toFixed(2)),
        ncAmount: parseFloat(nc.toFixed(2)),
        netRevenue: parseFloat(netRevenue.toFixed(2)),
        makingCost: parseFloat(cost.toFixed(2)),
        profit: parseFloat(profit.toFixed(2)),
        profitMargin: netRevenue > 0 ? parseFloat(((profit / netRevenue) * 100).toFixed(2)) : 0,
        foodCostPct: netRevenue > 0 ? parseFloat(((cost / netRevenue) * 100).toFixed(2)) : 0
      };
    });

    return {
      items,
      summary: {
        totalItems: items.length,
        grandRevenue: parseFloat(grandRevenue.toFixed(2)),
        grandNc: parseFloat(grandNc.toFixed(2)),
        grandNetRevenue: parseFloat((grandRevenue - grandNc).toFixed(2)),
        grandMakingCost: parseFloat(grandCost.toFixed(2)),
        grandProfit: parseFloat(grandProfit.toFixed(2)),
        overallMargin: (grandRevenue - grandNc) > 0
          ? parseFloat(((grandProfit / (grandRevenue - grandNc)) * 100).toFixed(2)) : 0,
        overallFoodCostPct: (grandRevenue - grandNc) > 0
          ? parseFloat(((grandCost / (grandRevenue - grandNc)) * 100).toFixed(2)) : 0
      }
    };
  },

  // ============================================================
  // 8. DAILY BUSINESS SUMMARY
  // ============================================================
  async dailyBusinessSummary(outletId, options = {}) {
    const pool = getPool();
    const { date, startDate, endDate } = options;

    // Single date or date range
    let dateFilter;
    const params = [outletId];
    if (date) {
      dateFilter = 'AND DATE(o.created_at) = ?';
      params.push(date);
    } else if (startDate && endDate) {
      dateFilter = 'AND DATE(o.created_at) >= ? AND DATE(o.created_at) <= ?';
      params.push(startDate, endDate);
    } else {
      dateFilter = 'AND DATE(o.created_at) = CURDATE()';
    }

    // Sales summary
    const [[sales]] = await pool.query(
      `SELECT
        COUNT(DISTINCT o.id) as total_orders,
        COUNT(DISTINCT CASE WHEN o.status IN ('paid','completed') THEN o.id END) as completed_orders,
        COUNT(DISTINCT CASE WHEN o.status = 'cancelled' THEN o.id END) as cancelled_orders,
        
        COALESCE(SUM(CASE WHEN o.status IN ('paid','completed') THEN o.subtotal ELSE 0 END), 0) as gross_sale,
        COALESCE(SUM(CASE WHEN o.status IN ('paid','completed') THEN o.discount_amount ELSE 0 END), 0) as total_discount,
        COALESCE(SUM(CASE WHEN o.status IN ('paid','completed') THEN o.tax_amount ELSE 0 END), 0) as total_tax,
        COALESCE(SUM(CASE WHEN o.status IN ('paid','completed') THEN o.total_amount ELSE 0 END), 0) as net_sale,
        
        COALESCE(SUM(CASE WHEN o.status IN ('paid','completed') THEN o.nc_amount ELSE 0 END), 0) as nc_amount,
        COALESCE(SUM(CASE WHEN o.status IN ('paid','completed') AND o.due_amount > 0 THEN o.due_amount ELSE 0 END), 0) as due_amount,
        COALESCE(SUM(CASE WHEN o.status IN ('paid','completed') THEN o.paid_amount ELSE 0 END), 0) as collected_amount,
        
        COALESCE(SUM(CASE WHEN o.status IN ('paid','completed') THEN o.round_off_amount ELSE 0 END), 0) as round_off
       FROM orders o
       WHERE o.outlet_id = ? ${dateFilter}`,
      params
    );

    // Cost summary from snapshots
    const costParams = [outletId];
    let costDateFilter;
    if (date) {
      costDateFilter = 'AND DATE(o.created_at) = ?';
      costParams.push(date);
    } else if (startDate && endDate) {
      costDateFilter = 'AND DATE(o.created_at) >= ? AND DATE(o.created_at) <= ?';
      costParams.push(startDate, endDate);
    } else {
      costDateFilter = 'AND DATE(o.created_at) = CURDATE()';
    }

    const [[costs]] = await pool.query(
      `SELECT
        COALESCE(SUM(oic.making_cost), 0) as total_making_cost,
        COALESCE(SUM(oic.selling_price), 0) as total_selling_price,
        COALESCE(SUM(oic.profit), 0) as total_profit
       FROM order_item_costs oic
       JOIN orders o ON oic.order_id = o.id
       WHERE o.outlet_id = ? AND o.status IN ('paid','completed')
         ${costDateFilter}`,
      costParams
    );

    // Wastage for the period
    const wastageParams = [outletId];
    let wastageDateFilter;
    if (date) {
      wastageDateFilter = 'AND wl.wastage_date = ?';
      wastageParams.push(date);
    } else if (startDate && endDate) {
      wastageDateFilter = 'AND wl.wastage_date >= ? AND wl.wastage_date <= ?';
      wastageParams.push(startDate, endDate);
    } else {
      wastageDateFilter = 'AND wl.wastage_date = CURDATE()';
    }

    const [[wastage]] = await pool.query(
      `SELECT
        COALESCE(SUM(wl.total_cost), 0) as wastage_cost,
        COUNT(*) as wastage_count
       FROM wastage_logs wl
       WHERE wl.outlet_id = ? ${wastageDateFilter}`,
      wastageParams
    );

    const grossSale = parseFloat(sales.gross_sale) || 0;
    const netSale = parseFloat(sales.net_sale) || 0;
    const makingCost = parseFloat(costs.total_making_cost) || 0;
    const wastageCost = parseFloat(wastage.wastage_cost) || 0;
    const totalExpense = makingCost + wastageCost;
    const netProfit = netSale - totalExpense;

    return {
      date: date || `${startDate || 'today'} to ${endDate || 'today'}`,
      sales: {
        totalOrders: parseInt(sales.total_orders),
        completedOrders: parseInt(sales.completed_orders),
        cancelledOrders: parseInt(sales.cancelled_orders),
        grossSale: parseFloat(grossSale.toFixed(2)),
        discount: parseFloat(parseFloat(sales.total_discount).toFixed(2)),
        tax: parseFloat(parseFloat(sales.total_tax).toFixed(2)),
        netSale: parseFloat(netSale.toFixed(2)),
        roundOff: parseFloat(parseFloat(sales.round_off).toFixed(2)),
        ncAmount: parseFloat(parseFloat(sales.nc_amount).toFixed(2)),
        dueAmount: parseFloat(parseFloat(sales.due_amount).toFixed(2)),
        collectedAmount: parseFloat(parseFloat(sales.collected_amount).toFixed(2))
      },
      cost: {
        makingCost: parseFloat(makingCost.toFixed(2)),
        wastageCost: parseFloat(wastageCost.toFixed(2)),
        wastageCount: parseInt(wastage.wastage_count),
        totalExpense: parseFloat(totalExpense.toFixed(2))
      },
      profit: {
        grossProfit: parseFloat((netSale - makingCost).toFixed(2)),
        netProfit: parseFloat(netProfit.toFixed(2)),
        profitMargin: netSale > 0 ? parseFloat(((netProfit / netSale) * 100).toFixed(2)) : 0,
        foodCostPct: netSale > 0 ? parseFloat(((makingCost / netSale) * 100).toFixed(2)) : 0
      }
    };
  }
};

module.exports = inventoryReportsService;
