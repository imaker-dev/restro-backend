/**
 * Cost Snapshot Service
 * Captures recipe making cost at order time → stored in order_item_costs
 * This ensures historical reports remain accurate even if ingredient prices change later
 */

const { getPool } = require('../database');
const logger = require('../utils/logger');

const costSnapshotService = {

  /**
   * Snapshot cost for a single order item
   * Called when order items are added (inside transaction)
   * @param {object} connection - MySQL transaction connection
   * @param {object} params - { orderId, orderItemId, itemId, variantId, quantity, outletId }
   */
  async snapshotOrderItemCost(connection, { orderId, orderItemId, itemId, variantId, quantity, outletId }) {
    try {
      // Find the current recipe for this item/variant
      let recipeQuery, recipeParams;
      if (variantId) {
        recipeQuery = 'SELECT id FROM recipes WHERE menu_item_id = ? AND variant_id = ? AND is_current = 1 AND is_active = 1';
        recipeParams = [itemId, variantId];
      } else {
        recipeQuery = 'SELECT id FROM recipes WHERE menu_item_id = ? AND variant_id IS NULL AND is_current = 1 AND is_active = 1';
        recipeParams = [itemId];
      }

      const [[recipe]] = await connection.query(recipeQuery, recipeParams);
      if (!recipe) return null; // No recipe linked — skip snapshot

      // Get costing method
      const [[settings]] = await connection.query(
        'SELECT costing_method FROM cost_settings WHERE outlet_id = ?', [outletId]
      );
      const costingMethod = settings?.costing_method || 'average';

      // Calculate recipe cost for 1 portion
      const [ingredients] = await connection.query(
        `SELECT ri.*, ing.name as ingredient_name, ing.yield_percentage, ing.wastage_percentage,
          ing.inventory_item_id,
          ii.average_price, ii.latest_price,
          bu.conversion_factor as base_conversion_factor,
          ru.conversion_factor as recipe_unit_conversion_factor
         FROM recipe_ingredients ri
         JOIN ingredients ing ON ri.ingredient_id = ing.id
         JOIN inventory_items ii ON ing.inventory_item_id = ii.id
         LEFT JOIN units bu ON ii.base_unit_id = bu.id
         LEFT JOIN units ru ON ri.unit_id = ru.id
         WHERE ri.recipe_id = ?`,
        [recipe.id]
      );

      let portionCost = 0;
      const breakdown = [];

      for (const ing of ingredients) {
        const recipeQty = parseFloat(ing.quantity) || 0;
        const recipeUnitCf = parseFloat(ing.recipe_unit_conversion_factor) || 1;
        // Convert to system base units (gram/ml/pcs) — matches how prices are stored
        const qtyInBase = recipeQty * recipeUnitCf;

        const wastage = parseFloat(ing.wastage_percentage) || 0;
        const yieldPct = parseFloat(ing.yield_percentage) || 100;
        const effectiveQty = qtyInBase * (1 + wastage / 100) * (100 / yieldPct);

        let pricePerBase = 0;
        if (costingMethod === 'average') {
          pricePerBase = parseFloat(ing.average_price) || 0;
        } else if (costingMethod === 'latest') {
          pricePerBase = parseFloat(ing.latest_price) || 0;
        } else if (costingMethod === 'fifo') {
          // For FIFO in snapshot, use batch-level pricing
          const [batches] = await connection.query(
            `SELECT remaining_quantity, purchase_price FROM inventory_batches
             WHERE inventory_item_id = ? AND remaining_quantity > 0 AND is_active = 1
             ORDER BY purchase_date ASC, id ASC`,
            [ing.inventory_item_id]
          );
          let rem = effectiveQty;
          let fifoCost = 0;
          for (const b of batches) {
            if (rem <= 0) break;
            const take = Math.min(rem, parseFloat(b.remaining_quantity));
            fifoCost += take * parseFloat(b.purchase_price);
            rem -= take;
          }
          if (rem > 0) fifoCost += rem * (parseFloat(ing.average_price) || 0);

          const ingCost = parseFloat(fifoCost.toFixed(2));
          portionCost += ingCost;
          breakdown.push({
            ingredientId: ing.ingredient_id,
            name: ing.ingredient_name,
            qty: parseFloat(effectiveQty.toFixed(4)),
            cost: ingCost
          });
          continue;
        } else {
          pricePerBase = parseFloat(ing.average_price) || 0;
        }

        const ingCost = parseFloat((effectiveQty * pricePerBase).toFixed(2));
        portionCost += ingCost;
        breakdown.push({
          ingredientId: ing.ingredient_id,
          name: ing.ingredient_name,
          qty: parseFloat(effectiveQty.toFixed(4)),
          cost: ingCost
        });
      }

      portionCost = parseFloat(portionCost.toFixed(2));
      const makingCost = parseFloat((portionCost * quantity).toFixed(2));

      // Get selling price from the order item itself
      const [[orderItem]] = await connection.query(
        'SELECT unit_price, total_price FROM order_items WHERE id = ?', [orderItemId]
      );
      const sellingPrice = parseFloat(orderItem?.unit_price) || 0;
      const totalSelling = sellingPrice * quantity;
      const profit = parseFloat((totalSelling - makingCost).toFixed(2));
      const foodCostPct = totalSelling > 0
        ? parseFloat(((makingCost / totalSelling) * 100).toFixed(2)) : 0;

      await connection.query(
        `INSERT INTO order_item_costs (order_id, order_item_id, recipe_id, costing_method,
         making_cost, selling_price, profit, food_cost_percentage, cost_breakdown)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [orderId, orderItemId, recipe.id, costingMethod,
         makingCost, totalSelling, profit, foodCostPct, JSON.stringify(breakdown)]
      );

      return { recipeId: recipe.id, makingCost, profit, foodCostPct };
    } catch (error) {
      // Cost snapshot failure should not block order creation
      logger.error(`Cost snapshot failed for order_item ${orderItemId}:`, error);
      return null;
    }
  },

  /**
   * Get cost snapshot for an order
   */
  async getOrderCosts(orderId) {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT oic.*, oi.item_name, oi.variant_name, oi.quantity,
        r.name as recipe_name
       FROM order_item_costs oic
       JOIN order_items oi ON oic.order_item_id = oi.id
       LEFT JOIN recipes r ON oic.recipe_id = r.id
       WHERE oic.order_id = ?
       ORDER BY oic.id`,
      [orderId]
    );

    let totalMakingCost = 0;
    let totalSellingPrice = 0;

    const items = rows.map(r => {
      totalMakingCost += parseFloat(r.making_cost);
      totalSellingPrice += parseFloat(r.selling_price);
      return {
        orderItemId: r.order_item_id,
        itemName: r.item_name,
        variantName: r.variant_name || null,
        quantity: parseFloat(r.quantity),
        recipeName: r.recipe_name || null,
        costingMethod: r.costing_method,
        makingCost: parseFloat(r.making_cost),
        sellingPrice: parseFloat(r.selling_price),
        profit: parseFloat(r.profit),
        foodCostPercentage: parseFloat(r.food_cost_percentage),
        breakdown: r.cost_breakdown ? JSON.parse(r.cost_breakdown) : null,
        snapshotAt: r.created_at
      };
    });

    const totalProfit = parseFloat((totalSellingPrice - totalMakingCost).toFixed(2));

    return {
      orderId,
      items,
      summary: {
        totalMakingCost: parseFloat(totalMakingCost.toFixed(2)),
        totalSellingPrice: parseFloat(totalSellingPrice.toFixed(2)),
        totalProfit,
        foodCostPercentage: totalSellingPrice > 0
          ? parseFloat(((totalMakingCost / totalSellingPrice) * 100).toFixed(2)) : 0
      }
    };
  }
};

module.exports = costSnapshotService;
