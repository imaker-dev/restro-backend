/**
 * Recipe Controller — Modules 5, 6, 7
 * Handles Ingredients, Recipes, and Cost Calculator endpoints
 */

const ingredientService = require('../services/ingredient.service');
const recipeService = require('../services/recipe.service');
const costCalculatorService = require('../services/costCalculator.service');
const logger = require('../utils/logger');

const parseBool = (val) => {
  if (val === 'true' || val === '1') return true;
  if (val === 'false' || val === '0') return false;
  return undefined;
};

const recipeController = {

  // ======================== MODULE 5: INGREDIENTS ========================

  async listIngredients(req, res) {
    try {
      const { page, limit, search, isActive, categoryId, hasRecipes, sortBy, sortOrder } = req.query;
      const result = await ingredientService.list(parseInt(req.params.outletId), {
        page, limit, search,
        isActive: parseBool(isActive),
        categoryId: categoryId ? parseInt(categoryId) : undefined,
        hasRecipes: parseBool(hasRecipes),
        sortBy, sortOrder
      });
      res.json({ success: true, ...result });
    } catch (error) {
      logger.error('List ingredients error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async getIngredient(req, res) {
    try {
      const ingredient = await ingredientService.getById(parseInt(req.params.id));
      if (!ingredient) {
        return res.status(404).json({ success: false, message: 'Ingredient not found' });
      }
      res.json({ success: true, data: ingredient });
    } catch (error) {
      logger.error('Get ingredient error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async createIngredient(req, res) {
    try {
      const ingredient = await ingredientService.create(parseInt(req.params.outletId), req.body);
      res.status(201).json({ success: true, data: ingredient });
    } catch (error) {
      logger.error('Create ingredient error:', error);
      const status = error.message.includes('already exists') ? 409 : 400;
      res.status(status).json({ success: false, message: error.message });
    }
  },

  async updateIngredient(req, res) {
    try {
      const ingredient = await ingredientService.update(parseInt(req.params.id), req.body);
      if (!ingredient) {
        return res.status(404).json({ success: false, message: 'Ingredient not found' });
      }
      res.json({ success: true, data: ingredient });
    } catch (error) {
      logger.error('Update ingredient error:', error);
      res.status(400).json({ success: false, message: error.message });
    }
  },

  async bulkCreateIngredients(req, res) {
    try {
      const { items, inventoryItemIds } = req.body;
      const payload = items || inventoryItemIds;
      if (!Array.isArray(payload) || payload.length === 0) {
        return res.status(400).json({ success: false, message: 'items array is required' });
      }
      const result = await ingredientService.bulkCreateFromInventory(
        parseInt(req.params.outletId), payload
      );
      res.status(201).json({ success: true, data: result });
    } catch (error) {
      logger.error('Bulk create ingredients error:', error);
      res.status(400).json({ success: false, message: error.message });
    }
  },

  // ======================== MODULE 6: RECIPES ========================

  async listRecipes(req, res) {
    try {
      const {
        page, limit, search, isActive, menuItemId, hasMenuItem, currentOnly,
        sortBy, sortOrder, itemType, categoryId, hasProfit, minCost, maxCost
      } = req.query;
      const result = await recipeService.list(parseInt(req.params.outletId), {
        page, limit, search,
        isActive: parseBool(isActive),
        menuItemId: menuItemId ? parseInt(menuItemId) : undefined,
        hasMenuItem: parseBool(hasMenuItem),
        currentOnly: parseBool(currentOnly) !== false,
        sortBy, sortOrder,
        itemType, categoryId: categoryId ? parseInt(categoryId) : undefined,
        hasProfit, minCost, maxCost
      });
      res.json({ success: true, ...result });
    } catch (error) {
      logger.error('List recipes error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async getRecipe(req, res) {
    try {
      const { costingMethod } = req.query;
      const recipe = await recipeService.getById(parseInt(req.params.id), costingMethod || null);
      if (!recipe) {
        return res.status(404).json({ success: false, message: 'Recipe not found' });
      }
      res.json({ success: true, data: recipe });
    } catch (error) {
      logger.error('Get recipe error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async createRecipe(req, res) {
    try {
      const recipe = await recipeService.create(
        parseInt(req.params.outletId), req.body, req.user?.userId
      );
      res.status(201).json({ success: true, data: recipe });
    } catch (error) {
      logger.error('Create recipe error:', error);
      res.status(400).json({ success: false, message: error.message });
    }
  },

  async updateRecipe(req, res) {
    try {
      const recipe = await recipeService.update(
        parseInt(req.params.id), req.body, req.user?.userId
      );
      if (!recipe) {
        return res.status(404).json({ success: false, message: 'Recipe not found' });
      }
      res.json({ success: true, data: recipe });
    } catch (error) {
      logger.error('Update recipe error:', error);
      res.status(400).json({ success: false, message: error.message });
    }
  },

  async linkMenuItem(req, res) {
    try {
      const { menuItemId, variantId } = req.body;
      if (!menuItemId) {
        return res.status(400).json({ success: false, message: 'menuItemId is required' });
      }
      const recipe = await recipeService.linkMenuItem(
        parseInt(req.params.id), parseInt(menuItemId), variantId ? parseInt(variantId) : null
      );
      res.json({ success: true, data: recipe });
    } catch (error) {
      logger.error('Link menu item error:', error);
      res.status(400).json({ success: false, message: error.message });
    }
  },

  async unlinkMenuItem(req, res) {
    try {
      const recipe = await recipeService.unlinkMenuItem(parseInt(req.params.id));
      res.json({ success: true, data: recipe });
    } catch (error) {
      logger.error('Unlink menu item error:', error);
      res.status(400).json({ success: false, message: error.message });
    }
  },

  async createVersion(req, res) {
    try {
      const recipe = await recipeService.createVersion(
        parseInt(req.params.id), req.body, req.user?.userId
      );
      res.status(201).json({ success: true, data: recipe });
    } catch (error) {
      logger.error('Create recipe version error:', error);
      res.status(400).json({ success: false, message: error.message });
    }
  },

  async getVersions(req, res) {
    try {
      const { variantId } = req.query;
      const versions = await recipeService.getVersions(
        parseInt(req.params.menuItemId), variantId ? parseInt(variantId) : null
      );
      res.json({ success: true, data: versions });
    } catch (error) {
      logger.error('Get recipe versions error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // ======================== MODULE 7: COST CALCULATOR ========================

  async getCostSettings(req, res) {
    try {
      const settings = await costCalculatorService.getSettings(parseInt(req.params.outletId));
      res.json({ success: true, data: settings });
    } catch (error) {
      logger.error('Get cost settings error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async updateCostSettings(req, res) {
    try {
      const settings = await costCalculatorService.updateSettings(
        parseInt(req.params.outletId), req.body, req.user?.userId
      );
      res.json({ success: true, data: settings });
    } catch (error) {
      logger.error('Update cost settings error:', error);
      res.status(400).json({ success: false, message: error.message });
    }
  },

  async calculateRecipeCost(req, res) {
    try {
      const { costingMethod } = req.query;
      const result = await costCalculatorService.calculateRecipeCost(
        parseInt(req.params.id), costingMethod || null
      );
      res.json({ success: true, data: result });
    } catch (error) {
      logger.error('Calculate recipe cost error:', error);
      res.status(400).json({ success: false, message: error.message });
    }
  },

  async calculateAllCosts(req, res) {
    try {
      const { costingMethod } = req.query;
      const result = await costCalculatorService.calculateAllCosts(
        parseInt(req.params.outletId), costingMethod || null
      );
      res.json({ success: true, data: result });
    } catch (error) {
      logger.error('Calculate all costs error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async compareAllMethods(req, res) {
    try {
      const result = await costCalculatorService.compareAllMethods(
        parseInt(req.params.outletId)
      );
      res.json({ success: true, data: result });
    } catch (error) {
      logger.error('Compare all methods error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }
};

module.exports = recipeController;
