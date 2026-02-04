/**
 * Menu Engine Service
 * Core service that builds dynamic menus based on context
 * (outlet, floor, section, time slot, captain view)
 */

const { getPool } = require('../database');
const { cache } = require('../config/redis');
const logger = require('../utils/logger');
const categoryService = require('./category.service');
const itemService = require('./item.service');
const addonService = require('./addon.service');
const priceRuleService = require('./priceRule.service');
const timeSlotService = require('./timeSlot.service');
const taxService = require('./tax.service');

const CACHE_TTL = 900; // 15 minutes

const menuEngineService = {
  /**
   * Build complete menu for captain view
   * Returns categories with items, variants, addons, and calculated prices
   */
  async buildMenu(outletId, context = {}) {
    const { floorId, sectionId, tableId, time, includeDetails = true } = context;
    const pool = getPool();

    // Get current time slot
    let timeSlotId = context.timeSlotId;
    if (!timeSlotId) {
      const currentSlot = await timeSlotService.getCurrentSlot(outletId);
      timeSlotId = currentSlot?.id;
    }

    const menuContext = { floorId, sectionId, timeSlotId, time };

    // Get visible categories
    const categories = await categoryService.getVisibleCategories(outletId, menuContext);

    // Build menu structure
    const menu = [];

    for (const category of categories) {
      // Get visible items for this category
      const items = await itemService.getVisibleItems(outletId, {
        ...menuContext,
        categoryId: category.id
      });

      if (items.length === 0) continue;

      const categoryItems = [];

      for (const item of items) {
        // Get effective price
        const effectivePrice = await itemService.getEffectivePrice(
          item.id, null, menuContext
        );

        // Apply price rules
        const priceResult = await priceRuleService.calculatePrice(
          effectivePrice || item.base_price,
          outletId, item.id, null, menuContext
        );

        const menuItem = {
          id: item.id,
          name: item.name,
          shortName: item.short_name,
          description: item.description,
          imageUrl: item.image_url,
          itemType: item.item_type,
          basePrice: priceResult.basePrice,
          price: priceResult.finalPrice,
          hasDiscount: priceResult.hasDiscount,
          appliedRules: priceResult.appliedRules,
          hasVariants: item.has_variants,
          hasAddons: item.has_addons,
          isRecommended: item.is_recommended,
          isBestseller: item.is_bestseller,
          isNew: item.is_new,
          spiceLevel: item.spice_level,
          preparationTime: item.preparation_time_mins,
          minQuantity: item.min_quantity,
          maxQuantity: item.max_quantity,
          stepQuantity: item.step_quantity,
          allowSpecialNotes: item.allow_special_notes,
          taxGroupId: item.tax_group_id,
          taxRate: item.tax_rate,
          taxInclusive: item.tax_inclusive
        };

        // Include variants if item has variants
        if (includeDetails && item.has_variants) {
          const variants = await itemService.getVariants(item.id);
          menuItem.variants = await Promise.all(variants.map(async (v) => {
            const variantPrice = await priceRuleService.calculatePrice(
              v.price, outletId, item.id, v.id, menuContext
            );
            return {
              id: v.id,
              name: v.name,
              basePrice: variantPrice.basePrice,
              price: variantPrice.finalPrice,
              hasDiscount: variantPrice.hasDiscount,
              isDefault: v.is_default,
              taxGroupId: v.tax_group_id || item.tax_group_id,
              taxRate: v.tax_rate || item.tax_rate
            };
          }));
        }

        // Include addon groups if item has addons
        if (includeDetails && item.has_addons) {
          menuItem.addonGroups = await addonService.getItemAddonGroups(item.id);
        }

        categoryItems.push(menuItem);
      }

      if (categoryItems.length > 0) {
        menu.push({
          id: category.id,
          name: category.name,
          description: category.description,
          imageUrl: category.image_url,
          icon: category.icon,
          colorCode: category.color_code,
          itemCount: categoryItems.length,
          items: categoryItems
        });
      }
    }

    return {
      outletId,
      context: menuContext,
      timeSlot: timeSlotId ? await timeSlotService.getById(timeSlotId) : null,
      generatedAt: new Date().toISOString(),
      categories: menu,
      totalCategories: menu.length,
      totalItems: menu.reduce((sum, c) => sum + c.items.length, 0)
    };
  },

  /**
   * Get simplified menu for captain (no complexity, just essentials)
   */
  async getCaptainMenu(outletId, context = {}) {
    const menu = await this.buildMenu(outletId, { ...context, includeDetails: true });

    // Simplify for captain view - hide pricing rules, tax details
    return {
      ...menu,
      categories: menu.categories.map(cat => ({
        id: cat.id,
        name: cat.name,
        icon: cat.icon,
        colorCode: cat.colorCode,
        items: cat.items.map(item => ({
          id: item.id,
          name: item.name,
          shortName: item.shortName,
          price: item.price,
          itemType: item.itemType,
          hasVariants: item.hasVariants,
          hasAddons: item.hasAddons,
          isRecommended: item.isRecommended,
          isBestseller: item.isBestseller,
          variants: item.variants?.map(v => ({
            id: v.id,
            name: v.name,
            price: v.price,
            isDefault: v.isDefault
          })),
          addonGroups: item.addonGroups?.map(g => ({
            id: g.id,
            name: g.name,
            isRequired: g.is_required || g.item_required,
            minSelection: g.min_selection,
            maxSelection: g.max_selection,
            addons: g.addons?.map(a => ({
              id: a.id,
              name: a.name,
              price: a.price,
              itemType: a.item_type
            }))
          }))
        }))
      }))
    };
  },

  /**
   * Preview menu as admin would see it for a specific context
   */
  async previewMenu(outletId, floorId = null, sectionId = null, timeSlotId = null) {
    return this.buildMenu(outletId, { floorId, sectionId, timeSlotId, includeDetails: true });
  },

  /**
   * Get menu item with full details for ordering
   */
  async getItemForOrder(itemId, context = {}) {
    const pool = getPool();
    const item = await itemService.getFullDetails(itemId);
    if (!item) return null;

    const { floorId, sectionId, timeSlotId } = context;
    const menuContext = { floorId, sectionId, timeSlotId };

    // Calculate price with rules
    const priceResult = await priceRuleService.calculatePrice(
      item.base_price, item.outlet_id, item.id, null, menuContext
    );

    // Get tax calculation
    let taxInfo = null;
    if (item.tax_group_id) {
      taxInfo = await taxService.getTaxGroupById(item.tax_group_id);
    }

    return {
      ...item,
      effectivePrice: priceResult.finalPrice,
      priceBreakdown: priceResult,
      taxInfo,
      variants: item.variants ? await Promise.all(item.variants.map(async (v) => {
        const variantPrice = await priceRuleService.calculatePrice(
          v.price, item.outlet_id, item.id, v.id, menuContext
        );
        return {
          ...v,
          effectivePrice: variantPrice.finalPrice,
          priceBreakdown: variantPrice
        };
      })) : []
    };
  },

  /**
   * Calculate order item total with tax
   */
  async calculateItemTotal(itemId, variantId, quantity, addons = [], context = {}) {
    const pool = getPool();
    const { floorId, sectionId, timeSlotId } = context;
    const menuContext = { floorId, sectionId, timeSlotId };

    // Get item
    const item = await itemService.getById(itemId);
    if (!item) throw new Error('Item not found');

    // Get base price (variant or item)
    let basePrice;
    let taxGroupId = item.tax_group_id;

    if (variantId) {
      const [variants] = await pool.query('SELECT * FROM variants WHERE id = ?', [variantId]);
      if (!variants[0]) throw new Error('Variant not found');
      basePrice = variants[0].price;
      if (variants[0].tax_group_id) taxGroupId = variants[0].tax_group_id;
    } else {
      basePrice = item.base_price;
    }

    // Apply price rules
    const priceResult = await priceRuleService.calculatePrice(
      basePrice, item.outlet_id, itemId, variantId, menuContext
    );

    // Calculate addon total
    let addonTotal = 0;
    const addonDetails = [];

    for (const addonId of addons) {
      const addon = await addonService.getAddonById(addonId);
      if (addon) {
        addonTotal += parseFloat(addon.price);
        addonDetails.push({
          id: addon.id,
          name: addon.name,
          price: parseFloat(addon.price)
        });
      }
    }

    const unitPrice = priceResult.finalPrice + addonTotal;
    const subtotal = unitPrice * quantity;

    // Calculate tax
    let taxResult = { taxAmount: 0, breakdown: [] };
    if (taxGroupId) {
      taxResult = await taxService.calculateTax(
        [{ price: unitPrice, quantity }],
        taxGroupId
      );
    }

    return {
      itemId,
      itemName: item.name,
      variantId,
      quantity,
      basePrice: priceResult.basePrice,
      unitPrice,
      addons: addonDetails,
      addonTotal,
      subtotal,
      taxGroupId,
      tax: taxResult,
      total: subtotal + (taxResult.isInclusive ? 0 : taxResult.taxAmount)
    };
  },

  /**
   * Get menu rules/visibility summary for admin
   */
  async getMenuRulesSummary(outletId) {
    const pool = getPool();

    // Get all items with their visibility rules
    const [items] = await pool.query(
      `SELECT i.id, i.name, i.sku, i.base_price,
        c.name as category_name,
        tg.name as tax_group_name, tg.total_rate as tax_rate,
        (SELECT GROUP_CONCAT(f.name) FROM item_floors if_ JOIN floors f ON if_.floor_id = f.id WHERE if_.item_id = i.id AND if_.is_available = 1) as visible_floors,
        (SELECT GROUP_CONCAT(s.name) FROM item_sections is_ JOIN sections s ON is_.section_id = s.id WHERE is_.item_id = i.id AND is_.is_available = 1) as visible_sections,
        (SELECT GROUP_CONCAT(ts.name) FROM item_time_slots its JOIN time_slots ts ON its.time_slot_id = ts.id WHERE its.item_id = i.id AND its.is_available = 1) as visible_time_slots
       FROM items i
       JOIN categories c ON i.category_id = c.id
       LEFT JOIN tax_groups tg ON i.tax_group_id = tg.id
       WHERE i.outlet_id = ? AND i.is_active = 1 AND i.deleted_at IS NULL
       ORDER BY c.display_order, i.display_order`,
      [outletId]
    );

    return items.map(item => ({
      id: item.id,
      name: item.name,
      sku: item.sku,
      category: item.category_name,
      basePrice: item.base_price,
      taxGroup: item.tax_group_name,
      taxRate: item.tax_rate,
      visibility: {
        floors: item.visible_floors ? item.visible_floors.split(',') : ['All'],
        sections: item.visible_sections ? item.visible_sections.split(',') : ['All'],
        timeSlots: item.visible_time_slots ? item.visible_time_slots.split(',') : ['All']
      }
    }));
  },

  /**
   * Search menu items
   */
  async searchItems(outletId, query, context = {}) {
    const pool = getPool();
    const { floorId, sectionId, timeSlotId, limit = 20 } = context;

    let sql = `
      SELECT i.*, c.name as category_name
      FROM items i
      JOIN categories c ON i.category_id = c.id
      WHERE i.outlet_id = ? AND i.is_active = 1 AND i.is_available = 1 AND i.deleted_at IS NULL
      AND (i.name LIKE ? OR i.short_name LIKE ? OR i.sku LIKE ? OR i.tags LIKE ?)
    `;
    const params = [outletId, `%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`];

    // Apply visibility filters
    if (floorId) {
      sql += `
        AND (
          NOT EXISTS (SELECT 1 FROM item_floors if_ WHERE if_.item_id = i.id)
          OR EXISTS (SELECT 1 FROM item_floors if_ WHERE if_.item_id = i.id AND if_.floor_id = ? AND if_.is_available = 1)
        )
      `;
      params.push(floorId);
    }

    if (sectionId) {
      sql += `
        AND (
          NOT EXISTS (SELECT 1 FROM item_sections is_ WHERE is_.item_id = i.id)
          OR EXISTS (SELECT 1 FROM item_sections is_ WHERE is_.item_id = i.id AND is_.section_id = ? AND is_.is_available = 1)
        )
      `;
      params.push(sectionId);
    }

    if (timeSlotId) {
      sql += `
        AND (
          NOT EXISTS (SELECT 1 FROM item_time_slots its WHERE its.item_id = i.id)
          OR EXISTS (SELECT 1 FROM item_time_slots its WHERE its.item_id = i.id AND its.time_slot_id = ? AND its.is_available = 1)
        )
      `;
      params.push(timeSlotId);
    }

    sql += ' ORDER BY i.is_bestseller DESC, i.name LIMIT ?';
    params.push(limit);

    const [items] = await pool.query(sql, params);
    return items;
  },

  /**
   * Get bestsellers and recommended items
   */
  async getFeaturedItems(outletId, context = {}) {
    const items = await itemService.getByOutlet(outletId, {
      ...context,
      limit: 20
    });

    return {
      bestsellers: items.filter(i => i.is_bestseller),
      recommended: items.filter(i => i.is_recommended),
      newItems: items.filter(i => i.is_new)
    };
  },

  /**
   * Invalidate menu cache
   */
  async invalidateCache(outletId) {
    await cache.del(`menu:${outletId}`);
  }
};

module.exports = menuEngineService;
