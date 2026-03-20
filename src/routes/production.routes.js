/**
 * Production Routes — Module 8
 * Production recipes (templates) + production runs (execute)
 * Flow: Raw Materials → Production → Semi-Finished Batch
 */

const express = require('express');
const router = express.Router();
const productionController = require('../controllers/production.controller');

// ========================
// PRODUCTION RECIPES (Templates)
// ========================

// List all production recipes for an outlet
router.get('/:outletId/recipes', productionController.listRecipes);

// Get single production recipe with ingredients + live cost
router.get('/recipes/:id', productionController.getRecipe);

// Create a production recipe
router.post('/:outletId/recipes', productionController.createRecipe);

// Update a production recipe
router.put('/recipes/:id', productionController.updateRecipe);

// ========================
// PRODUCTION RUNS
// ========================

// Execute a production (deduct inputs, create output batch)
router.post('/:outletId/produce', productionController.produce);

// List production history
router.get('/:outletId/history', productionController.listProductions);

// Get single production detail
router.get('/detail/:id', productionController.getProduction);

// Reverse a completed production (restore raw materials, remove output)
router.post('/reverse/:id', productionController.reverseProduction);

module.exports = router;
