/**
 * Recipe Routes — 18 endpoints
 * Module 5: Ingredients (5)  |  Module 6: Recipes (7)  |  Module 7: Cost Calculator (5)
 * Cost calculator is READ-ONLY — never writes cost to menu items
 */

const express = require('express');
const router = express.Router();
const recipeController = require('../controllers/recipe.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

router.use(authenticate);

const admin = authorize('super_admin', 'admin', 'manager');

// ======================== MODULE 5: INGREDIENTS ========================

/** GET  /:outletId/ingredients         — List ingredients */
router.get('/:outletId/ingredients', admin, recipeController.listIngredients);

/** GET  /ingredients/:id               — Ingredient detail */
router.get('/ingredients/:id', admin, recipeController.getIngredient);

/** POST /:outletId/ingredients         — Create ingredient (map inventory item) */
router.post('/:outletId/ingredients', admin, recipeController.createIngredient);

/** PUT  /ingredients/:id               — Update ingredient */
router.put('/ingredients/:id', admin, recipeController.updateIngredient);

/** POST /:outletId/ingredients/bulk    — Bulk create from inventory items */
router.post('/:outletId/ingredients/bulk', admin, recipeController.bulkCreateIngredients);

// ======================== MODULE 6: RECIPES ========================

/** GET  /:outletId/recipes             — List recipes */
router.get('/:outletId/recipes', admin, recipeController.listRecipes);

/** GET  /recipes/:id                   — Recipe detail with ingredients + cost */
router.get('/recipes/:id', admin, recipeController.getRecipe);

/** POST /:outletId/recipes             — Create recipe with ingredients */
router.post('/:outletId/recipes', admin, recipeController.createRecipe);

/** PUT  /recipes/:id                   — Update recipe (ingredients can be replaced) */
router.put('/recipes/:id', admin, recipeController.updateRecipe);

/** PUT  /recipes/:id/link              — Link recipe to menu item */
router.put('/recipes/:id/link', admin, recipeController.linkMenuItem);

/** PUT  /recipes/:id/unlink            — Unlink recipe from menu item */
router.put('/recipes/:id/unlink', admin, recipeController.unlinkMenuItem);

/** POST /recipes/:id/version           — Create new version of recipe */
router.post('/recipes/:id/version', admin, recipeController.createVersion);

/** GET  /menu-items/:menuItemId/recipe-versions — Get all recipe versions for a menu item */
router.get('/menu-items/:menuItemId/recipe-versions', admin, recipeController.getVersions);

// ======================== MODULE 7: COST CALCULATOR ========================

/** GET  /:outletId/cost-settings       — Get costing method settings */
router.get('/:outletId/cost-settings', admin, recipeController.getCostSettings);

/** PUT  /:outletId/cost-settings       — Update costing method (average/latest/fifo/manual) */
router.put('/:outletId/cost-settings', admin, recipeController.updateCostSettings);

/** GET  /recipes/:id/calculate-cost    — Calculate cost for a single recipe */
router.get('/recipes/:id/calculate-cost', admin, recipeController.calculateRecipeCost);

/** GET  /:outletId/calculate-all-costs — Calculate costs for all recipes (preview) */
router.get('/:outletId/calculate-all-costs', admin, recipeController.calculateAllCosts);

/** GET  /:outletId/compare-methods     — Compare profit across all 4 costing methods */
router.get('/:outletId/compare-methods', admin, recipeController.compareAllMethods);

module.exports = router;
