/**
 * Cost Calculator Service — Module 7
 * Read-only cost calculation — never writes to items/variants table
 * Shows making cost vs selling price = profit/loss
 * Supports: AVG, LATEST, FIFO, MANUAL costing methods
 */

const { getPool } = require('../database');
const logger = require('../utils/logger');

const costCalculatorService = {

  // ========================
  // COST SETTINGS
  // ========================

  async getSettings(outletId) {
    const pool = getPool();
    const [[settings]] = await pool.query(
      'SELECT * FROM cost_settings WHERE outlet_id = ?', [outletId]
    );

    if (!settings) {
      await pool.query(
        `INSERT INTO cost_settings (outlet_id, costing_method) VALUES (?, 'average')`,
        [outletId]
      );
      return { outletId, costingMethod: 'average' };
    }

    return {
      outletId: settings.outlet_id,
      costingMethod: settings.costing_method,
      updatedAt: settings.updated_at
    };
  },

  async updateSettings(outletId, data, userId = null) {
    const pool = getPool();
    const allowedMethods = ['average', 'latest', 'fifo', 'manual'];

    if (data.costingMethod && !allowedMethods.includes(data.costingMethod)) {
      throw new Error(`Invalid costing method. Allowed: ${allowedMethods.join(', ')}`);
    }

    const fields = [];
    const params = [];

    if (data.costingMethod) {
      fields.push('costing_method = ?');
      params.push(data.costingMethod);
    }
    if (userId) {
      fields.push('updated_by = ?');
      params.push(userId);
    }

    if (fields.length === 0) throw new Error('No fields to update');

    const [[existing]] = await pool.query(
      'SELECT id FROM cost_settings WHERE outlet_id = ?', [outletId]
    );

    if (existing) {
      params.push(outletId);
      await pool.query(`UPDATE cost_settings SET ${fields.join(', ')} WHERE outlet_id = ?`, params);
    } else {
      await pool.query(
        `INSERT INTO cost_settings (outlet_id, costing_method, updated_by) VALUES (?, ?, ?)`,
        [outletId, data.costingMethod || 'average', userId]
      );
    }

    return this.getSettings(outletId);
  },

  // ========================
  // CALCULATE SINGLE RECIPE COST
  // ========================

  async calculateRecipeCost(recipeId, method = null) {
    const pool = getPool();

    const [[recipe]] = await pool.query('SELECT * FROM recipes WHERE id = ?', [recipeId]);
    if (!recipe) throw new Error('Recipe not found');

    const costingMethod = method || await this._getMethod(recipe.outlet_id);

    const [ingredients] = await pool.query(
      `SELECT ri.*, ing.name as ingredient_name, ing.yield_percentage, ing.wastage_percentage,
        ing.inventory_item_id,
        ii.current_stock, ii.average_price, ii.latest_price,
        ii.base_unit_id,
        bu.conversion_factor as base_conversion_factor,
        ru.conversion_factor as recipe_unit_conversion_factor
       FROM recipe_ingredients ri
       JOIN ingredients ing ON ri.ingredient_id = ing.id
       JOIN inventory_items ii ON ing.inventory_item_id = ii.id
       LEFT JOIN units bu ON ii.base_unit_id = bu.id
       LEFT JOIN units ru ON ri.unit_id = ru.id
       WHERE ri.recipe_id = ?`,
      [recipeId]
    );

    let totalCost = 0;
    const breakdown = [];

    for (const ing of ingredients) {
      const recipeQty = parseFloat(ing.quantity) || 0;
      const recipeUnitCf = parseFloat(ing.recipe_unit_conversion_factor) || 1;
      // Convert to system base units (gram/ml/pcs) — matches how prices are stored
      const qtyInBase = recipeQty * recipeUnitCf;

      const wastage = parseFloat(ing.wastage_percentage) || 0;
      const yieldPct = parseFloat(ing.yield_percentage) || 100;
      const effectiveQty = qtyInBase * (1 + wastage / 100) * (100 / yieldPct);

      let ingCost = 0;
      let pricePerBase = 0;

      if (costingMethod === 'fifo') {
        // True FIFO: split across multiple batches
        const fifoResult = await this._getFifoCost(ing.inventory_item_id, effectiveQty);
        ingCost = fifoResult.totalCost;
        pricePerBase = effectiveQty > 0 ? ingCost / effectiveQty : 0;
      } else {
        if (costingMethod === 'average') {
          pricePerBase = parseFloat(ing.average_price) || 0;
        } else if (costingMethod === 'latest') {
          pricePerBase = parseFloat(ing.latest_price) || 0;
        } else {
          pricePerBase = parseFloat(ing.average_price) || 0;
        }
        ingCost = parseFloat((effectiveQty * pricePerBase).toFixed(2));
      }

      totalCost += ingCost;

      breakdown.push({
        ingredientId: ing.ingredient_id,
        ingredientName: ing.ingredient_name,
        recipeQty,
        qtyInBase: parseFloat(qtyInBase.toFixed(4)),
        wastagePercent: wastage,
        yieldPercent: yieldPct,
        effectiveQty: parseFloat(effectiveQty.toFixed(4)),
        pricePerBase: parseFloat(pricePerBase.toFixed(6)),
        cost: parseFloat(ingCost.toFixed(2)),
        calculation: `${recipeQty} × cf(${recipeUnitCf}) = ${parseFloat(qtyInBase.toFixed(2))} base`
          + (wastage > 0 ? ` × (1 + ${wastage}% wastage)` : '')
          + (yieldPct < 100 ? ` ÷ ${yieldPct}% yield` : '')
          + ` = ${parseFloat(effectiveQty.toFixed(2))} effective`
          + ` × ₹${parseFloat(pricePerBase.toFixed(4))}/base = ₹${parseFloat(ingCost.toFixed(2))}`
      });
    }

    return {
      recipeId,
      recipeName: recipe.name,
      costingMethod,
      totalCost: parseFloat(totalCost.toFixed(2)),
      ingredientCount: breakdown.length,
      breakdown
    };
  },

  // ========================
  // CALCULATE ALL — read-only profit analysis for all recipes
  // ========================

  async calculateAllCosts(outletId, method = null) {
    const pool = getPool();
    const costingMethod = method || await this._getMethod(outletId);

    const [recipes] = await pool.query(
      `SELECT r.id, r.name, r.menu_item_id, r.variant_id,
        mi.name as menu_item_name, mi.base_price as selling_price,
        v.name as variant_name, v.price as variant_selling_price
       FROM recipes r
       LEFT JOIN items mi ON r.menu_item_id = mi.id
       LEFT JOIN variants v ON r.variant_id = v.id
       WHERE r.outlet_id = ? AND r.is_active = 1 AND r.is_current = 1`,
      [outletId]
    );

    const results = [];
    let totalProfit = 0;
    let totalMakingCost = 0;
    let totalSellingAmount = 0;

    for (const recipe of recipes) {
      try {
        const cost = await this.calculateRecipeCost(recipe.id, costingMethod);
        const sellingPrice = parseFloat(recipe.variant_selling_price || recipe.selling_price) || 0;
        const makingCost = cost.totalCost;
        const profit = parseFloat((sellingPrice - makingCost).toFixed(2));
        const profitPercentage = sellingPrice > 0
          ? parseFloat(((profit / sellingPrice) * 100).toFixed(2)) : 0;
        const foodCostPercentage = sellingPrice > 0
          ? parseFloat(((makingCost / sellingPrice) * 100).toFixed(2)) : 0;

        totalProfit += profit;
        totalMakingCost += makingCost;
        totalSellingAmount += sellingPrice;

        results.push({
          recipeId: recipe.id,
          recipeName: recipe.name,
          menuItemId: recipe.menu_item_id,
          menuItemName: recipe.menu_item_name,
          variantId: recipe.variant_id,
          variantName: recipe.variant_name,
          sellingPrice,
          makingCost,
          profit,
          profitPercentage,
          foodCostPercentage
        });
      } catch (error) {
        logger.error(`Error calculating cost for recipe ${recipe.id}:`, error);
        results.push({
          recipeId: recipe.id,
          recipeName: recipe.name,
          error: error.message
        });
      }
    }

    return {
      outletId,
      costingMethod,
      totalRecipes: results.length,
      summary: {
        totalSellingAmount: parseFloat(totalSellingAmount.toFixed(2)),
        totalMakingCost: parseFloat(totalMakingCost.toFixed(2)),
        totalProfit: parseFloat(totalProfit.toFixed(2)),
        avgFoodCostPercentage: totalSellingAmount > 0
          ? parseFloat(((totalMakingCost / totalSellingAmount) * 100).toFixed(2)) : 0,
        avgProfitPercentage: totalSellingAmount > 0
          ? parseFloat(((totalProfit / totalSellingAmount) * 100).toFixed(2)) : 0
      },
      results
    };
  },

  // ========================
  // COMPARE ALL 4 METHODS side-by-side for all recipes
  // ========================

  async compareAllMethods(outletId) {
    const methods = ['average', 'latest', 'fifo', 'manual'];
    const comparison = {};

    for (const method of methods) {
      comparison[method] = await this.calculateAllCosts(outletId, method);
    }

    return { outletId, comparison };
  },

  // ========================
  // FIFO COST HELPER — splits quantity across multiple batches
  // ========================

  /**
   * True FIFO: consume from oldest batch first, if not enough take from next batch, etc.
   * Returns { totalCost, batches: [{ batchId, qty, price, cost }] }
   *
   * Example: Need 150g cheese
   *   Batch1 → 100g @ ₹400/kg(base) = 100×0.4 = ₹40
   *   Batch2 → 50g  @ ₹500/kg(base) = 50×0.5  = ₹25
   *   Total FIFO cost = ₹65
   */
  async _getFifoCost(inventoryItemId, quantityNeeded) {
    const pool = getPool();
    const [batches] = await pool.query(
      `SELECT id, remaining_quantity, purchase_price FROM inventory_batches
       WHERE inventory_item_id = ? AND remaining_quantity > 0 AND is_active = 1
       ORDER BY purchase_date ASC, id ASC`,
      [inventoryItemId]
    );

    let remaining = quantityNeeded;
    let totalCost = 0;
    const batchBreakdown = [];

    for (const batch of batches) {
      if (remaining <= 0) break;

      const batchQty = parseFloat(batch.remaining_quantity);
      const batchPrice = parseFloat(batch.purchase_price);
      const take = Math.min(remaining, batchQty);
      const cost = take * batchPrice;

      totalCost += cost;
      batchBreakdown.push({
        batchId: batch.id,
        qty: parseFloat(take.toFixed(4)),
        pricePerBase: batchPrice,
        cost: parseFloat(cost.toFixed(2))
      });

      remaining -= take;
    }

    // If batches exhausted but still need more, use average price for remainder
    if (remaining > 0) {
      const [[item]] = await pool.query(
        'SELECT average_price FROM inventory_items WHERE id = ?', [inventoryItemId]
      );
      const avgPrice = parseFloat(item?.average_price) || 0;
      const cost = remaining * avgPrice;
      totalCost += cost;
      batchBreakdown.push({
        batchId: null,
        qty: parseFloat(remaining.toFixed(4)),
        pricePerBase: avgPrice,
        cost: parseFloat(cost.toFixed(2)),
        note: 'Fallback to average — insufficient batch stock'
      });
    }

    return {
      totalCost: parseFloat(totalCost.toFixed(2)),
      batches: batchBreakdown
    };
  },

  async _getMethod(outletId) {
    const pool = getPool();
    const [[settings]] = await pool.query(
      'SELECT costing_method FROM cost_settings WHERE outlet_id = ?', [outletId]
    );
    return settings?.costing_method || 'average';
  }
};

module.exports = costCalculatorService;
