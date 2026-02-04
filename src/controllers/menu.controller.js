/**
 * Menu Controller
 * Handles categories, items, variants, addons, and menu engine
 */

const categoryService = require('../services/category.service');
const itemService = require('../services/item.service');
const addonService = require('../services/addon.service');
const menuEngineService = require('../services/menuEngine.service');
const logger = require('../utils/logger');

const menuController = {
  // ========================
  // CATEGORIES
  // ========================

  async createCategory(req, res) {
    try {
      const category = await categoryService.create(req.body);
      res.status(201).json({ success: true, message: 'Category created', data: category });
    } catch (error) {
      logger.error('Create category error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async getCategories(req, res) {
    try {
      const { outletId } = req.params;
      const { includeInactive } = req.query;
      const categories = await categoryService.getByOutlet(outletId, includeInactive === 'true');
      res.json({ success: true, data: categories });
    } catch (error) {
      logger.error('Get categories error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async getCategoryById(req, res) {
    try {
      const category = await categoryService.getWithVisibility(req.params.id);
      if (!category) {
        return res.status(404).json({ success: false, message: 'Category not found' });
      }
      res.json({ success: true, data: category });
    } catch (error) {
      logger.error('Get category error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async getCategoryTree(req, res) {
    try {
      const { outletId } = req.params;
      const tree = await categoryService.getTree(outletId);
      res.json({ success: true, data: tree });
    } catch (error) {
      logger.error('Get category tree error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async updateCategory(req, res) {
    try {
      const category = await categoryService.update(req.params.id, req.body);
      if (!category) {
        return res.status(404).json({ success: false, message: 'Category not found' });
      }
      res.json({ success: true, message: 'Category updated', data: category });
    } catch (error) {
      logger.error('Update category error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async deleteCategory(req, res) {
    try {
      const deleted = await categoryService.delete(req.params.id);
      if (!deleted) {
        return res.status(404).json({ success: false, message: 'Category not found' });
      }
      res.json({ success: true, message: 'Category deleted' });
    } catch (error) {
      logger.error('Delete category error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // ========================
  // ITEMS
  // ========================

  async createItem(req, res) {
    try {
      const item = await itemService.create(req.body);
      res.status(201).json({ success: true, message: 'Item created', data: item });
    } catch (error) {
      logger.error('Create item error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async getItems(req, res) {
    try {
      const { outletId } = req.params;
      const filters = {
        categoryId: req.query.categoryId,
        itemType: req.query.itemType,
        search: req.query.search,
        isBestseller: req.query.isBestseller === 'true',
        isRecommended: req.query.isRecommended === 'true',
        includeInactive: req.query.includeInactive === 'true',
        limit: req.query.limit
      };
      const items = await itemService.getByOutlet(outletId, filters);
      res.json({ success: true, data: items });
    } catch (error) {
      logger.error('Get items error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async getItemsByCategory(req, res) {
    try {
      const { categoryId } = req.params;
      const { includeInactive } = req.query;
      const items = await itemService.getByCategory(categoryId, includeInactive === 'true');
      res.json({ success: true, data: items });
    } catch (error) {
      logger.error('Get items by category error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async getItemById(req, res) {
    try {
      const item = await itemService.getById(req.params.id);
      if (!item) {
        return res.status(404).json({ success: false, message: 'Item not found' });
      }
      res.json({ success: true, data: item });
    } catch (error) {
      logger.error('Get item error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async getItemFullDetails(req, res) {
    try {
      const item = await itemService.getFullDetails(req.params.id);
      if (!item) {
        return res.status(404).json({ success: false, message: 'Item not found' });
      }
      res.json({ success: true, data: item });
    } catch (error) {
      logger.error('Get item details error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async updateItem(req, res) {
    try {
      const item = await itemService.update(req.params.id, req.body);
      if (!item) {
        return res.status(404).json({ success: false, message: 'Item not found' });
      }
      res.json({ success: true, message: 'Item updated', data: item });
    } catch (error) {
      logger.error('Update item error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async deleteItem(req, res) {
    try {
      const deleted = await itemService.delete(req.params.id);
      if (!deleted) {
        return res.status(404).json({ success: false, message: 'Item not found' });
      }
      res.json({ success: true, message: 'Item deleted' });
    } catch (error) {
      logger.error('Delete item error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // ========================
  // VARIANTS
  // ========================

  async addVariant(req, res) {
    try {
      const { itemId } = req.params;
      const variant = await itemService.addVariant(itemId, req.body);
      res.status(201).json({ success: true, message: 'Variant added', data: variant });
    } catch (error) {
      logger.error('Add variant error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async getVariants(req, res) {
    try {
      const { itemId } = req.params;
      const variants = await itemService.getVariants(itemId);
      res.json({ success: true, data: variants });
    } catch (error) {
      logger.error('Get variants error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async updateVariant(req, res) {
    try {
      const variant = await itemService.updateVariant(req.params.variantId, req.body);
      if (!variant) {
        return res.status(404).json({ success: false, message: 'Variant not found' });
      }
      res.json({ success: true, message: 'Variant updated', data: variant });
    } catch (error) {
      logger.error('Update variant error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async deleteVariant(req, res) {
    try {
      const deleted = await itemService.deleteVariant(req.params.variantId);
      if (!deleted) {
        return res.status(404).json({ success: false, message: 'Variant not found' });
      }
      res.json({ success: true, message: 'Variant deleted' });
    } catch (error) {
      logger.error('Delete variant error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // ========================
  // ADDON GROUPS
  // ========================

  async createAddonGroup(req, res) {
    try {
      const group = await addonService.createGroup(req.body);
      res.status(201).json({ success: true, message: 'Addon group created', data: group });
    } catch (error) {
      logger.error('Create addon group error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async getAddonGroups(req, res) {
    try {
      const { outletId } = req.params;
      const groups = await addonService.getGroups(outletId);
      res.json({ success: true, data: groups });
    } catch (error) {
      logger.error('Get addon groups error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async getAddonGroupById(req, res) {
    try {
      const group = await addonService.getGroupWithAddons(req.params.id);
      if (!group) {
        return res.status(404).json({ success: false, message: 'Addon group not found' });
      }
      res.json({ success: true, data: group });
    } catch (error) {
      logger.error('Get addon group error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async updateAddonGroup(req, res) {
    try {
      const group = await addonService.updateGroup(req.params.id, req.body);
      if (!group) {
        return res.status(404).json({ success: false, message: 'Addon group not found' });
      }
      res.json({ success: true, message: 'Addon group updated', data: group });
    } catch (error) {
      logger.error('Update addon group error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async deleteAddonGroup(req, res) {
    try {
      const deleted = await addonService.deleteGroup(req.params.id);
      if (!deleted) {
        return res.status(404).json({ success: false, message: 'Addon group not found' });
      }
      res.json({ success: true, message: 'Addon group deleted' });
    } catch (error) {
      logger.error('Delete addon group error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // ========================
  // ADDONS
  // ========================

  async createAddon(req, res) {
    try {
      const addon = await addonService.createAddon(req.body);
      res.status(201).json({ success: true, message: 'Addon created', data: addon });
    } catch (error) {
      logger.error('Create addon error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async getAddons(req, res) {
    try {
      const { groupId } = req.params;
      const addons = await addonService.getAddons(groupId);
      res.json({ success: true, data: addons });
    } catch (error) {
      logger.error('Get addons error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async updateAddon(req, res) {
    try {
      const addon = await addonService.updateAddon(req.params.id, req.body);
      if (!addon) {
        return res.status(404).json({ success: false, message: 'Addon not found' });
      }
      res.json({ success: true, message: 'Addon updated', data: addon });
    } catch (error) {
      logger.error('Update addon error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async deleteAddon(req, res) {
    try {
      const deleted = await addonService.deleteAddon(req.params.id);
      if (!deleted) {
        return res.status(404).json({ success: false, message: 'Addon not found' });
      }
      res.json({ success: true, message: 'Addon deleted' });
    } catch (error) {
      logger.error('Delete addon error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async mapAddonToItem(req, res) {
    try {
      const { itemId, groupId } = req.params;
      const { isRequired, displayOrder } = req.body;
      await addonService.mapToItem(itemId, groupId, isRequired, displayOrder);
      res.json({ success: true, message: 'Addon group mapped to item' });
    } catch (error) {
      logger.error('Map addon to item error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async unmapAddonFromItem(req, res) {
    try {
      const { itemId, groupId } = req.params;
      await addonService.unmapFromItem(itemId, groupId);
      res.json({ success: true, message: 'Addon group unmapped from item' });
    } catch (error) {
      logger.error('Unmap addon from item error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // ========================
  // MENU ENGINE
  // ========================

  async getMenu(req, res) {
    try {
      const { outletId } = req.params;
      const context = {
        floorId: req.query.floorId ? parseInt(req.query.floorId) : null,
        sectionId: req.query.sectionId ? parseInt(req.query.sectionId) : null,
        timeSlotId: req.query.timeSlotId ? parseInt(req.query.timeSlotId) : null,
        tableId: req.query.tableId ? parseInt(req.query.tableId) : null
      };
      const menu = await menuEngineService.buildMenu(outletId, context);
      res.json({ success: true, data: menu });
    } catch (error) {
      logger.error('Get menu error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async getCaptainMenu(req, res) {
    try {
      const { outletId } = req.params;
      const context = {
        floorId: req.query.floorId ? parseInt(req.query.floorId) : null,
        sectionId: req.query.sectionId ? parseInt(req.query.sectionId) : null,
        timeSlotId: req.query.timeSlotId ? parseInt(req.query.timeSlotId) : null,
        tableId: req.query.tableId ? parseInt(req.query.tableId) : null
      };
      const menu = await menuEngineService.getCaptainMenu(outletId, context);
      res.json({ success: true, data: menu });
    } catch (error) {
      logger.error('Get captain menu error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async previewMenu(req, res) {
    try {
      const { outletId } = req.params;
      const { floorId, sectionId, timeSlotId } = req.query;
      const menu = await menuEngineService.previewMenu(
        outletId,
        floorId ? parseInt(floorId) : null,
        sectionId ? parseInt(sectionId) : null,
        timeSlotId ? parseInt(timeSlotId) : null
      );
      res.json({ success: true, data: menu });
    } catch (error) {
      logger.error('Preview menu error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async getItemForOrder(req, res) {
    try {
      const { itemId } = req.params;
      const context = {
        floorId: req.query.floorId ? parseInt(req.query.floorId) : null,
        sectionId: req.query.sectionId ? parseInt(req.query.sectionId) : null,
        timeSlotId: req.query.timeSlotId ? parseInt(req.query.timeSlotId) : null
      };
      const item = await menuEngineService.getItemForOrder(itemId, context);
      if (!item) {
        return res.status(404).json({ success: false, message: 'Item not found' });
      }
      res.json({ success: true, data: item });
    } catch (error) {
      logger.error('Get item for order error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async calculateItemTotal(req, res) {
    try {
      const { itemId, variantId, quantity, addons, floorId, sectionId, timeSlotId } = req.body;
      const result = await menuEngineService.calculateItemTotal(
        itemId, variantId, quantity, addons,
        { floorId, sectionId, timeSlotId }
      );
      res.json({ success: true, data: result });
    } catch (error) {
      logger.error('Calculate item total error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async getMenuRulesSummary(req, res) {
    try {
      const { outletId } = req.params;
      const summary = await menuEngineService.getMenuRulesSummary(outletId);
      res.json({ success: true, data: summary });
    } catch (error) {
      logger.error('Get menu rules summary error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async searchItems(req, res) {
    try {
      const { outletId } = req.params;
      const { query, floorId, sectionId, timeSlotId, limit } = req.query;
      const items = await menuEngineService.searchItems(outletId, query, {
        floorId: floorId ? parseInt(floorId) : null,
        sectionId: sectionId ? parseInt(sectionId) : null,
        timeSlotId: timeSlotId ? parseInt(timeSlotId) : null,
        limit: limit ? parseInt(limit) : 20
      });
      res.json({ success: true, data: items });
    } catch (error) {
      logger.error('Search items error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async getFeaturedItems(req, res) {
    try {
      const { outletId } = req.params;
      const featured = await menuEngineService.getFeaturedItems(outletId, req.query);
      res.json({ success: true, data: featured });
    } catch (error) {
      logger.error('Get featured items error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }
};

module.exports = menuController;
