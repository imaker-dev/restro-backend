/**
 * Production Controller — Module 8
 * Handles production recipes (templates) and production runs
 */

const productionService = require('../services/production.service');
const logger = require('../utils/logger');

const productionController = {

  // ============================================================
  // PRODUCTION RECIPES
  // ============================================================

  async listRecipes(req, res) {
    try {
      const { outletId } = req.params;
      const result = await productionService.listRecipes(outletId, req.query);
      res.json({ success: true, data: result });
    } catch (error) {
      logger.error('Error listing production recipes:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async getRecipe(req, res) {
    try {
      const recipe = await productionService.getRecipeById(req.params.id);
      if (!recipe) return res.status(404).json({ success: false, message: 'Production recipe not found' });
      res.json({ success: true, data: recipe });
    } catch (error) {
      logger.error('Error getting production recipe:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async createRecipe(req, res) {
    try {
      const { outletId } = req.params;
      const userId = req.user?.id || null;
      const recipe = await productionService.createRecipe(outletId, req.body, userId);
      res.status(201).json({ success: true, data: recipe });
    } catch (error) {
      logger.error('Error creating production recipe:', error);
      const status = error.message.includes('required') || error.message.includes('not found') ? 400 : 500;
      res.status(status).json({ success: false, message: error.message });
    }
  },

  async updateRecipe(req, res) {
    try {
      const userId = req.user?.id || null;
      const recipe = await productionService.updateRecipe(req.params.id, req.body, userId);
      res.json({ success: true, data: recipe });
    } catch (error) {
      logger.error('Error updating production recipe:', error);
      const status = error.message.includes('not found') ? 404 : 500;
      res.status(status).json({ success: false, message: error.message });
    }
  },

  // ============================================================
  // PRODUCTION RUNS
  // ============================================================

  async produce(req, res) {
    try {
      const { outletId } = req.params;
      const userId = req.user?.id || null;
      const production = await productionService.produce(outletId, req.body, userId);
      res.status(201).json({ success: true, data: production });
    } catch (error) {
      logger.error('Error executing production:', error);
      const status = error.message.includes('Insufficient') || error.message.includes('required') || error.message.includes('not found')
        ? 400 : 500;
      res.status(status).json({ success: false, message: error.message });
    }
  },

  async listProductions(req, res) {
    try {
      const { outletId } = req.params;
      const result = await productionService.listProductions(outletId, req.query);
      res.json({ success: true, data: result });
    } catch (error) {
      logger.error('Error listing productions:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async getProduction(req, res) {
    try {
      const production = await productionService.getProductionById(req.params.id);
      if (!production) return res.status(404).json({ success: false, message: 'Production not found' });
      res.json({ success: true, data: production });
    } catch (error) {
      logger.error('Error getting production:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async reverseProduction(req, res) {
    try {
      const userId = req.user?.id || null;
      const { reason } = req.body;
      const result = await productionService.reverseProduction(
        parseInt(req.params.id),
        { reason, userId }
      );
      res.json({ success: true, data: result, message: 'Production reversed successfully' });
    } catch (error) {
      logger.error('Error reversing production:', error);
      const status = error.message.includes('not found') ? 404
        : error.message.includes('already') ? 409 : 500;
      res.status(status).json({ success: false, message: error.message });
    }
  }
};

module.exports = productionController;
