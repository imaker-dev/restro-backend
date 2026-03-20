/**
 * Recipe Service — Module 6
 * Manages recipes: creation, ingredient mapping, cost calculation, versioning
 * Each recipe links to a menu item (or variant) and contains ingredient quantities
 */

const { getPool } = require('../database');
const logger = require('../utils/logger');

const recipeService = {

  // ========================
  // LIST RECIPES
  // ========================

  async list(outletId, options = {}) {
    const pool = getPool();
    const {
      page = 1, limit = 50, search, isActive, menuItemId, hasMenuItem,
      currentOnly = true, sortBy = 'name', sortOrder = 'ASC',
      itemType, categoryId, hasProfit, minCost, maxCost
    } = options;

    const safePage = Math.max(1, parseInt(page) || 1);
    const safeLimit = Math.min(100, Math.max(1, parseInt(limit) || 50));
    const offset = (safePage - 1) * safeLimit;

    const allowedSort = ['name', 'created_at', 'updated_at', 'version'];
    const safeSortBy = allowedSort.includes(sortBy) ? sortBy : 'name';
    const safeSortOrder = String(sortOrder).toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    let where = 'WHERE r.outlet_id = ?';
    const params = [outletId];

    if (typeof isActive === 'boolean') {
      where += ' AND r.is_active = ?';
      params.push(isActive ? 1 : 0);
    }
    if (currentOnly) {
      where += ' AND r.is_current = 1';
    }
    if (menuItemId) {
      where += ' AND r.menu_item_id = ?';
      params.push(menuItemId);
    }
    if (typeof hasMenuItem === 'boolean') {
      where += hasMenuItem ? ' AND r.menu_item_id IS NOT NULL' : ' AND r.menu_item_id IS NULL';
    }
    if (itemType) {
      where += ' AND mi.item_type = ?';
      params.push(itemType);
    }
    if (categoryId) {
      where += ' AND mi.category_id = ?';
      params.push(categoryId);
    }
    if (search) {
      where += ' AND (r.name LIKE ? OR mi.name LIKE ? OR cat.name LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s);
    }

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) as total FROM recipes r
       LEFT JOIN items mi ON r.menu_item_id = mi.id
       LEFT JOIN categories cat ON mi.category_id = cat.id
       ${where}`, params
    );

    const [rows] = await pool.query(
      `SELECT r.*,
        mi.name as menu_item_name, mi.base_price as menu_item_price, mi.sku as menu_item_sku,
        mi.item_type, mi.category_id as item_category_id,
        cat.name as category_name,
        v.name as variant_name, v.price as variant_price,
        u.name as created_by_name,
        (SELECT COUNT(*) FROM recipe_ingredients ri WHERE ri.recipe_id = r.id) as ingredient_count
       FROM recipes r
       LEFT JOIN items mi ON r.menu_item_id = mi.id
       LEFT JOIN categories cat ON mi.category_id = cat.id
       LEFT JOIN variants v ON r.variant_id = v.id
       LEFT JOIN users u ON r.created_by = u.id
       ${where}
       ORDER BY r.${safeSortBy} ${safeSortOrder}
       LIMIT ? OFFSET ?`,
      [...params, safeLimit, offset]
    );

    // Get costing method for this outlet
    const costingMethod = await this._getCostingMethod(outletId);

    // Calculate live cost for each recipe
    const recipes = [];
    let totalMakingCost = 0;
    let totalSellingPrice = 0;
    let recipesWithProfit = 0;
    let recipesWithLoss = 0;
    let linkedCount = 0;
    let unlinkedCount = 0;

    for (const row of rows) {
      const recipe = this.formatRecipe(row);
      recipe.costingMethod = costingMethod;

      // Calculate making cost from ingredients
      const [ingredients] = await pool.query(
        `SELECT ri.*, ing.yield_percentage, ing.wastage_percentage,
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
        [row.id]
      );

      let makingCost = 0;
      for (const ing of ingredients) {
        const cost = this._calculateIngredientCost(ing, costingMethod);
        makingCost += cost.totalCost || 0;
      }
      makingCost = parseFloat(makingCost.toFixed(2));

      recipe.makingCost = makingCost;

      const sellingPrice = parseFloat(row.variant_price || row.menu_item_price) || 0;
      recipe.sellingPrice = sellingPrice;

      if (sellingPrice > 0) {
        recipe.profit = parseFloat((sellingPrice - makingCost).toFixed(2));
        recipe.profitPercentage = parseFloat(((recipe.profit / sellingPrice) * 100).toFixed(2));
        recipe.foodCostPercentage = parseFloat(((makingCost / sellingPrice) * 100).toFixed(2));
        if (recipe.profit >= 0) recipesWithProfit++; else recipesWithLoss++;
        totalMakingCost += makingCost;
        totalSellingPrice += sellingPrice;
      } else {
        recipe.profit = null;
        recipe.profitPercentage = null;
        recipe.foodCostPercentage = null;
      }

      if (row.menu_item_id) linkedCount++; else unlinkedCount++;

      // Apply post-query filters
      if (hasProfit === 'true' && (recipe.profit === null || recipe.profit < 0)) continue;
      if (hasProfit === 'false' && (recipe.profit === null || recipe.profit >= 0)) continue;
      if (minCost && makingCost < parseFloat(minCost)) continue;
      if (maxCost && makingCost > parseFloat(maxCost)) continue;

      recipes.push(recipe);
    }

    const totalProfit = parseFloat((totalSellingPrice - totalMakingCost).toFixed(2));

    return {
      costingMethod,
      summary: {
        totalRecipes: total,
        linkedToMenu: linkedCount,
        unlinked: unlinkedCount,
        totalMakingCost: parseFloat(totalMakingCost.toFixed(2)),
        totalSellingPrice: parseFloat(totalSellingPrice.toFixed(2)),
        totalProfit,
        avgFoodCostPercentage: totalSellingPrice > 0
          ? parseFloat(((totalMakingCost / totalSellingPrice) * 100).toFixed(2)) : 0,
        avgProfitPercentage: totalSellingPrice > 0
          ? parseFloat(((totalProfit / totalSellingPrice) * 100).toFixed(2)) : 0,
        recipesWithProfit,
        recipesWithLoss
      },
      recipes,
      pagination: { page: safePage, limit: safeLimit, total, totalPages: Math.ceil(total / safeLimit) }
    };
  },

  // ========================
  // GET BY ID (with full ingredients + cost)
  // ========================

  async getById(id, costingMethod = null) {
    const pool = getPool();

    const [rows] = await pool.query(
      `SELECT r.*,
        mi.name as menu_item_name, mi.base_price as menu_item_price, mi.sku as menu_item_sku,
        mi.item_type, mi.category_id as item_category_id,
        cat.name as category_name,
        v.name as variant_name, v.price as variant_price,
        u.name as created_by_name
       FROM recipes r
       LEFT JOIN items mi ON r.menu_item_id = mi.id
       LEFT JOIN categories cat ON mi.category_id = cat.id
       LEFT JOIN variants v ON r.variant_id = v.id
       LEFT JOIN users u ON r.created_by = u.id
       WHERE r.id = ?`,
      [id]
    );
    if (!rows[0]) return null;

    const recipe = this.formatRecipe(rows[0]);

    // Get ingredients with cost
    const [ingredients] = await pool.query(
      `SELECT ri.*, ing.name as ingredient_name, ing.yield_percentage, ing.wastage_percentage,
        ing.inventory_item_id,
        ii.current_stock, ii.average_price, ii.latest_price,
        ii.base_unit_id,
        bu.name as base_unit_name, bu.abbreviation as base_unit_abbreviation,
        bu.conversion_factor as base_conversion_factor,
        ru.name as recipe_unit_name, ru.abbreviation as recipe_unit_abbreviation,
        ru.conversion_factor as recipe_unit_conversion_factor,
        COALESCE(pu.conversion_factor, 1) as purchase_conversion_factor,
        COALESCE(pu.abbreviation, bu.abbreviation) as purchase_unit_abbreviation
       FROM recipe_ingredients ri
       JOIN ingredients ing ON ri.ingredient_id = ing.id
       JOIN inventory_items ii ON ing.inventory_item_id = ii.id
       LEFT JOIN units bu ON ii.base_unit_id = bu.id
       LEFT JOIN units ru ON ri.unit_id = ru.id
       LEFT JOIN units pu ON ii.purchase_unit_id = pu.id
       WHERE ri.recipe_id = ?
       ORDER BY ri.display_order, ri.id`,
      [id]
    );

    // Determine costing method
    const method = costingMethod || await this._getCostingMethod(rows[0].outlet_id);

    recipe.ingredients = ingredients.map(ing => {
      const cost = this._calculateIngredientCost(ing, method);
      return {
        id: ing.id,
        ingredientId: ing.ingredient_id,
        ingredientName: ing.ingredient_name,
        inventoryItemId: ing.inventory_item_id,
        quantity: parseFloat(ing.quantity),
        unitId: ing.unit_id,
        unitName: ing.recipe_unit_name,
        unitAbbreviation: ing.recipe_unit_abbreviation,
        wastagePercentage: parseFloat(ing.wastage_percentage) || 0,
        yieldPercentage: parseFloat(ing.yield_percentage) || 100,
        notes: ing.notes || null,
        displayOrder: ing.display_order || 0,
        cost: cost
      };
    });

    // Cost summary
    const makingCost = parseFloat(
      recipe.ingredients.reduce((sum, ing) => sum + (ing.cost.totalCost || 0), 0).toFixed(2)
    );
    const sellingPrice = parseFloat(rows[0].variant_price || rows[0].menu_item_price) || 0;
    const profit = sellingPrice > 0 ? parseFloat((sellingPrice - makingCost).toFixed(2)) : null;

    recipe.costSummary = {
      costingMethod: method,
      makingCost,
      sellingPrice: sellingPrice || null,
      profit,
      profitPercentage: sellingPrice > 0 ? parseFloat(((profit / sellingPrice) * 100).toFixed(2)) : null,
      foodCostPercentage: sellingPrice > 0 ? parseFloat(((makingCost / sellingPrice) * 100).toFixed(2)) : null,
      ingredientCount: recipe.ingredients.length,
      status: profit === null ? 'not_linked' : profit >= 0 ? 'profitable' : 'loss'
    };

    return recipe;
  },

  // ========================
  // CREATE RECIPE
  // ========================

  async create(outletId, data, userId = null) {
    const pool = getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const {
        menuItemId, variantId, name, description, portionSize,
        preparationTimeMins = 0, instructions, ingredients = []
      } = data;

      if (!name) throw new Error('Recipe name is required');

      // If linking to menu item, verify it exists
      if (menuItemId) {
        const [[mi]] = await connection.query(
          'SELECT id, outlet_id FROM items WHERE id = ? AND deleted_at IS NULL',
          [menuItemId]
        );
        if (!mi) throw new Error('Menu item not found');
        if (parseInt(mi.outlet_id) !== parseInt(outletId)) throw new Error('Menu item belongs to different outlet');

        // Mark any existing current recipe for this item as not current
        if (variantId) {
          await connection.query(
            'UPDATE recipes SET is_current = 0 WHERE menu_item_id = ? AND variant_id = ? AND is_current = 1',
            [menuItemId, variantId]
          );
        } else {
          await connection.query(
            'UPDATE recipes SET is_current = 0 WHERE menu_item_id = ? AND variant_id IS NULL AND is_current = 1',
            [menuItemId]
          );
        }
      }

      // Get next version number
      let version = 1;
      if (menuItemId) {
        const versionQuery = variantId
          ? 'SELECT MAX(version) as maxV FROM recipes WHERE menu_item_id = ? AND variant_id = ?'
          : 'SELECT MAX(version) as maxV FROM recipes WHERE menu_item_id = ? AND variant_id IS NULL';
        const versionParams = variantId ? [menuItemId, variantId] : [menuItemId];
        const [[{ maxV }]] = await connection.query(versionQuery, versionParams);
        version = (maxV || 0) + 1;
      }

      const [result] = await connection.query(
        `INSERT INTO recipes (outlet_id, menu_item_id, variant_id, name, description, portion_size,
         preparation_time_mins, instructions, version, is_current, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
        [outletId, menuItemId || null, variantId || null, name.trim(),
         description || null, portionSize || null, preparationTimeMins,
         instructions || null, version, userId]
      );
      const recipeId = result.insertId;

      // Add ingredients
      for (let i = 0; i < ingredients.length; i++) {
        const ing = ingredients[i];
        if (!ing.ingredientId || !ing.quantity || !ing.unitId) {
          throw new Error(`Ingredient at index ${i}: ingredientId, quantity, and unitId are required`);
        }

        // Verify ingredient exists and belongs to outlet
        const [[ingRow]] = await connection.query(
          'SELECT id FROM ingredients WHERE id = ? AND outlet_id = ?',
          [ing.ingredientId, outletId]
        );
        if (!ingRow) throw new Error(`Ingredient ${ing.ingredientId} not found in this outlet`);

        // Verify unit exists
        const [[unitRow]] = await connection.query(
          'SELECT id FROM units WHERE id = ? AND outlet_id = ?',
          [ing.unitId, outletId]
        );
        if (!unitRow) throw new Error(`Unit ${ing.unitId} not found in this outlet`);

        await connection.query(
          `INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit_id, wastage_percentage, notes, display_order)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [recipeId, ing.ingredientId, ing.quantity, ing.unitId,
           ing.wastagePercentage || 0, ing.notes || null, ing.displayOrder || i]
        );
      }

      await connection.commit();
      return this.getById(recipeId);

    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

  // ========================
  // UPDATE RECIPE
  // ========================

  async update(id, data, userId = null) {
    const pool = getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const [[recipe]] = await connection.query('SELECT * FROM recipes WHERE id = ?', [id]);
      if (!recipe) throw new Error('Recipe not found');

      const fields = [];
      const params = [];

      if (data.name !== undefined) { fields.push('name = ?'); params.push(data.name.trim()); }
      if (data.description !== undefined) { fields.push('description = ?'); params.push(data.description || null); }
      if (data.portionSize !== undefined) { fields.push('portion_size = ?'); params.push(data.portionSize || null); }
      if (data.preparationTimeMins !== undefined) { fields.push('preparation_time_mins = ?'); params.push(data.preparationTimeMins); }
      if (data.instructions !== undefined) { fields.push('instructions = ?'); params.push(data.instructions || null); }
      if (data.isActive !== undefined) { fields.push('is_active = ?'); params.push(data.isActive ? 1 : 0); }

      if (fields.length > 0) {
        params.push(id);
        await connection.query(`UPDATE recipes SET ${fields.join(', ')} WHERE id = ?`, params);
      }

      // Update ingredients if provided
      if (data.ingredients) {
        // Remove existing ingredients
        await connection.query('DELETE FROM recipe_ingredients WHERE recipe_id = ?', [id]);

        // Re-add
        for (let i = 0; i < data.ingredients.length; i++) {
          const ing = data.ingredients[i];
          if (!ing.ingredientId || !ing.quantity || !ing.unitId) {
            throw new Error(`Ingredient at index ${i}: ingredientId, quantity, and unitId are required`);
          }

          await connection.query(
            `INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit_id, wastage_percentage, notes, display_order)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [id, ing.ingredientId, ing.quantity, ing.unitId,
             ing.wastagePercentage || 0, ing.notes || null, ing.displayOrder || i]
          );
        }
      }

      await connection.commit();
      return this.getById(id);

    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

  // ========================
  // LINK / UNLINK MENU ITEM
  // ========================

  async linkMenuItem(recipeId, menuItemId, variantId = null) {
    const pool = getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const [[recipe]] = await connection.query('SELECT * FROM recipes WHERE id = ?', [recipeId]);
      if (!recipe) throw new Error('Recipe not found');

      const [[mi]] = await connection.query(
        'SELECT id, outlet_id FROM items WHERE id = ? AND deleted_at IS NULL', [menuItemId]
      );
      if (!mi) throw new Error('Menu item not found');
      if (parseInt(mi.outlet_id) !== parseInt(recipe.outlet_id)) {
        throw new Error('Menu item and recipe belong to different outlets');
      }

      // Un-mark current recipe for this item
      if (variantId) {
        await connection.query(
          'UPDATE recipes SET is_current = 0 WHERE menu_item_id = ? AND variant_id = ? AND is_current = 1',
          [menuItemId, variantId]
        );
      } else {
        await connection.query(
          'UPDATE recipes SET is_current = 0 WHERE menu_item_id = ? AND variant_id IS NULL AND is_current = 1',
          [menuItemId]
        );
      }

      await connection.query(
        'UPDATE recipes SET menu_item_id = ?, variant_id = ?, is_current = 1 WHERE id = ?',
        [menuItemId, variantId || null, recipeId]
      );

      await connection.commit();
      return this.getById(recipeId);

    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

  async unlinkMenuItem(recipeId) {
    const pool = getPool();
    const [[recipe]] = await pool.query('SELECT * FROM recipes WHERE id = ?', [recipeId]);
    if (!recipe) throw new Error('Recipe not found');

    await pool.query(
      'UPDATE recipes SET menu_item_id = NULL, variant_id = NULL, is_current = 1 WHERE id = ?',
      [recipeId]
    );

    return this.getById(recipeId);
  },

  // ========================
  // CREATE NEW VERSION
  // ========================

  async createVersion(recipeId, data, userId = null) {
    const pool = getPool();
    const [[existing]] = await pool.query('SELECT * FROM recipes WHERE id = ?', [recipeId]);
    if (!existing) throw new Error('Recipe not found');

    // Get current ingredients
    const [currentIngredients] = await pool.query(
      'SELECT * FROM recipe_ingredients WHERE recipe_id = ?', [recipeId]
    );

    // Create new recipe as next version
    return this.create(existing.outlet_id, {
      menuItemId: existing.menu_item_id,
      variantId: existing.variant_id,
      name: data.name || existing.name,
      description: data.description !== undefined ? data.description : existing.description,
      portionSize: data.portionSize !== undefined ? data.portionSize : existing.portion_size,
      preparationTimeMins: data.preparationTimeMins !== undefined ? data.preparationTimeMins : existing.preparation_time_mins,
      instructions: data.instructions !== undefined ? data.instructions : existing.instructions,
      ingredients: data.ingredients || currentIngredients.map(i => ({
        ingredientId: i.ingredient_id,
        quantity: parseFloat(i.quantity),
        unitId: i.unit_id,
        wastagePercentage: parseFloat(i.wastage_percentage) || 0,
        notes: i.notes,
        displayOrder: i.display_order
      }))
    }, userId);
  },

  // ========================
  // GET RECIPE VERSIONS
  // ========================

  async getVersions(menuItemId, variantId = null) {
    const pool = getPool();
    let query = `SELECT r.*, u.name as created_by_name,
      (SELECT COUNT(*) FROM recipe_ingredients ri WHERE ri.recipe_id = r.id) as ingredient_count
      FROM recipes r
      LEFT JOIN users u ON r.created_by = u.id
      WHERE r.menu_item_id = ?`;
    const params = [menuItemId];

    if (variantId) {
      query += ' AND r.variant_id = ?';
      params.push(variantId);
    } else {
      query += ' AND r.variant_id IS NULL';
    }
    query += ' ORDER BY r.version DESC';

    const [rows] = await pool.query(query, params);
    return rows.map(r => this.formatRecipe(r));
  },

  // ========================
  // COST CALCULATION HELPERS
  // ========================

  _calculateIngredientCost(ing, method = 'average') {
    // Convert recipe quantity to system base unit (gram / ml / pcs)
    // Purchase service stores stock and prices in system base units:
    //   toBaseUnit(qty, unitId) = qty * conversion_factor
    //   pricePerBaseUnit = pricePerUnit / conversion_factor
    // So average_price and latest_price are per system base unit (per gram, per ml, etc.)
    const recipeQty = parseFloat(ing.quantity) || 0;
    const recipeUnitCf = parseFloat(ing.recipe_unit_conversion_factor) || 1;
    const purchaseCf = parseFloat(ing.purchase_conversion_factor) || 1;

    // Unit labels
    const recipeUnitAbbr = ing.recipe_unit_abbreviation || 'unit';
    const baseUnitAbbr = ing.base_unit_abbreviation || 'unit';
    const purchaseUnitAbbr = ing.purchase_unit_abbreviation || baseUnitAbbr;

    // Convert recipe quantity to system base units
    // e.g. 150g (cf=1) → 150 grams | 0.5kg (cf=1000) → 500 grams
    const qtyInBase = recipeQty * recipeUnitCf;

    // Account for wastage and yield
    const wastage = parseFloat(ing.wastage_percentage) || 0;
    const yieldPct = parseFloat(ing.yield_percentage) || 100;
    const effectiveQtyInBase = qtyInBase * (1 + wastage / 100) * (100 / yieldPct);

    // Get price per system base unit based on costing method
    let pricePerBase = 0;
    if (method === 'average') {
      pricePerBase = parseFloat(ing.average_price) || 0;
    } else if (method === 'latest') {
      pricePerBase = parseFloat(ing.latest_price) || 0;
    } else if (method === 'fifo') {
      // FIFO approximation using average for list/detail views
      // For exact multi-batch FIFO, use GET /recipes/:id/calculate-cost endpoint
      pricePerBase = parseFloat(ing.average_price) || 0;
    } else if (method === 'manual') {
      pricePerBase = parseFloat(ing.average_price) || 0;
    }

    const totalCost = parseFloat((effectiveQtyInBase * pricePerBase).toFixed(4));

    // Display-friendly: price per purchase unit (e.g. ₹48.3/KG instead of ₹0.0483/g)
    const pricePerPurchaseUnit = parseFloat((pricePerBase * purchaseCf).toFixed(4));

    // Build human-readable calculation string
    let calcSteps = `${recipeQty} ${recipeUnitAbbr}`;
    if (recipeUnitCf !== 1) {
      calcSteps += ` = ${parseFloat(qtyInBase.toFixed(2))} ${baseUnitAbbr}`;
    }
    if (wastage > 0) {
      calcSteps += ` + ${wastage}% wastage`;
    }
    if (yieldPct < 100) {
      calcSteps += ` ÷ ${yieldPct}% yield`;
    }
    if (wastage > 0 || yieldPct < 100) {
      calcSteps += ` = ${parseFloat(effectiveQtyInBase.toFixed(2))} ${baseUnitAbbr} effective`;
    }
    calcSteps += ` × ₹${pricePerPurchaseUnit}/${purchaseUnitAbbr}`;
    calcSteps += ` = ₹${parseFloat(totalCost.toFixed(2))}`;

    return {
      recipeQty,
      recipeUnit: recipeUnitAbbr,
      qtyInBase: parseFloat(qtyInBase.toFixed(4)),
      baseUnit: baseUnitAbbr,
      effectiveQty: parseFloat(effectiveQtyInBase.toFixed(4)),
      wastagePercent: wastage,
      yieldPercent: yieldPct,
      pricePerBase: parseFloat(pricePerBase.toFixed(6)),
      pricePerPurchaseUnit,
      purchaseUnit: purchaseUnitAbbr,
      totalCost: parseFloat(totalCost.toFixed(2)),
      method,
      calculation: calcSteps
    };
  },

  async _getCostingMethod(outletId) {
    const pool = getPool();
    const [[settings]] = await pool.query(
      'SELECT costing_method FROM cost_settings WHERE outlet_id = ?', [outletId]
    );
    return settings?.costing_method || 'average';
  },

  // ========================
  // FORMAT
  // ========================

  formatRecipe(row) {
    if (!row) return null;
    return {
      id: row.id,
      outletId: row.outlet_id,
      menuItemId: row.menu_item_id || null,
      menuItemName: row.menu_item_name || null,
      menuItemSku: row.menu_item_sku || null,
      menuItemPrice: row.menu_item_price ? parseFloat(row.menu_item_price) : null,
      variantId: row.variant_id || null,
      variantName: row.variant_name || null,
      variantPrice: row.variant_price ? parseFloat(row.variant_price) : null,
      itemType: row.item_type || null,
      categoryId: row.item_category_id || null,
      categoryName: row.category_name || null,
      name: row.name,
      description: row.description || null,
      portionSize: row.portion_size || null,
      preparationTimeMins: row.preparation_time_mins || 0,
      instructions: row.instructions || null,
      version: row.version || 1,
      isCurrent: !!row.is_current,
      ingredientCount: row.ingredient_count || 0,
      isActive: !!row.is_active,
      createdBy: row.created_by || null,
      createdByName: row.created_by_name || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
};

module.exports = recipeService;
