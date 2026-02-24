/**
 * Bulk Upload Service
 * Simplified CSV format for menu upload (Petpooja-style)
 * 
 * CSV FORMAT:
 * Type | Name | Category | Price | FoodType | GST | Station | Description
 * 
 * Types: CATEGORY, ITEM, VARIANT, ADDON_GROUP, ADDON
 */

const { getPool } = require('../database');
const { cache } = require('../config/redis');
const logger = require('../utils/logger');
const csv = require('csv-parse/sync');

const VALID_FOOD_TYPES = ['veg', 'nonveg', 'egg'];
const GST_RATES = { '0': 0, '5': 5, '12': 12, '18': 18, '28': 28 };

const bulkUploadService = {
  /**
   * Parse CSV content
   */
  parseCSV(csvContent) {
    try {
      const records = csv.parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
        cast: (value) => (value === '' ? null : value)
      });
      return { success: true, records };
    } catch (error) {
      return { success: false, error: `CSV Error: ${error.message}` };
    }
  },

  /**
   * Validate records before processing
   */
  async validateRecords(records, outletId) {
    const errors = [];
    const warnings = [];
    const pool = getPool();

    // Load existing data
    const [categories] = await pool.query(
      'SELECT id, name FROM categories WHERE outlet_id = ? AND deleted_at IS NULL',
      [outletId]
    );
    const [items] = await pool.query(
      'SELECT id, name, sku FROM items WHERE outlet_id = ? AND deleted_at IS NULL',
      [outletId]
    );
    const [addonGroups] = await pool.query(
      'SELECT id, name FROM addon_groups WHERE outlet_id = ? AND is_active = 1',
      [outletId]
    );

    const catMap = new Map(categories.map(c => [c.name.toLowerCase(), c]));
    const itemMap = new Map(items.map(i => [i.name.toLowerCase(), i]));
    const groupMap = new Map(addonGroups.map(a => [a.name.toLowerCase(), a]));

    const newCats = new Set();
    const newItems = new Set();
    const newGroups = new Set();

    let currentCat = null;
    let currentItem = null;
    let currentGroup = null;

    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      const rowNum = i + 2;
      const type = (row.Type || row.type || '').toUpperCase().trim();

      if (!type) {
        errors.push({ row: rowNum, message: 'Type is required' });
        continue;
      }

      const validTypes = ['CATEGORY', 'ITEM', 'VARIANT', 'ADDON_GROUP', 'ADDON'];
      if (!validTypes.includes(type)) {
        errors.push({ row: rowNum, message: `Invalid Type: ${type}. Use: ${validTypes.join(', ')}` });
        continue;
      }

      const name = row.Name || row.name;

      switch (type) {
        case 'CATEGORY':
          if (!name) {
            errors.push({ row: rowNum, message: 'Category Name is required' });
          } else if (catMap.has(name.toLowerCase())) {
            warnings.push({ row: rowNum, message: `Category "${name}" exists - will skip` });
          } else {
            currentCat = name;
            newCats.add(name.toLowerCase());
          }
          break;

        case 'ITEM':
          if (!name) {
            errors.push({ row: rowNum, message: 'Item Name is required' });
            break;
          }
          const itemCat = row.Category || row.category || currentCat;
          if (!itemCat) {
            errors.push({ row: rowNum, message: 'Category required for item' });
          } else if (!catMap.has(itemCat.toLowerCase()) && !newCats.has(itemCat.toLowerCase())) {
            errors.push({ row: rowNum, message: `Category "${itemCat}" not found` });
          }
          const price = parseFloat(row.Price || row.price);
          if (isNaN(price) || price < 0) {
            errors.push({ row: rowNum, message: 'Valid Price required' });
          }
          const foodType = (row.FoodType || row.foodtype || 'veg').toLowerCase();
          if (!VALID_FOOD_TYPES.includes(foodType)) {
            errors.push({ row: rowNum, message: `Invalid FoodType: ${foodType}. Use: veg, nonveg, egg` });
          }
          if (itemMap.has(name.toLowerCase())) {
            warnings.push({ row: rowNum, message: `Item "${name}" exists - will skip` });
          } else if (newItems.has(name.toLowerCase())) {
            errors.push({ row: rowNum, message: `Duplicate item "${name}" in CSV` });
          } else {
            currentItem = name;
            newItems.add(name.toLowerCase());
          }
          break;

        case 'VARIANT':
          if (!name) {
            errors.push({ row: rowNum, message: 'Variant Name required' });
            break;
          }
          if (!currentItem && !row.Item && !row.item) {
            errors.push({ row: rowNum, message: 'Variant needs an item (place after ITEM row)' });
          }
          const varPrice = parseFloat(row.Price || row.price);
          if (isNaN(varPrice) || varPrice < 0) {
            errors.push({ row: rowNum, message: 'Valid Price required for variant' });
          }
          break;

        case 'ADDON_GROUP':
          if (!name) {
            errors.push({ row: rowNum, message: 'Addon Group Name required' });
          } else if (groupMap.has(name.toLowerCase())) {
            warnings.push({ row: rowNum, message: `Addon group "${name}" exists - will skip` });
          } else {
            currentGroup = name;
            newGroups.add(name.toLowerCase());
          }
          break;

        case 'ADDON':
          if (!name) {
            errors.push({ row: rowNum, message: 'Addon Name required' });
            break;
          }
          if (!currentGroup && !row.Group && !row.group) {
            errors.push({ row: rowNum, message: 'Addon needs a group (place after ADDON_GROUP row)' });
          }
          break;
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      summary: {
        total: records.length,
        categories: records.filter(r => (r.Type || r.type || '').toUpperCase() === 'CATEGORY').length,
        items: records.filter(r => (r.Type || r.type || '').toUpperCase() === 'ITEM').length,
        variants: records.filter(r => (r.Type || r.type || '').toUpperCase() === 'VARIANT').length,
        addonGroups: records.filter(r => (r.Type || r.type || '').toUpperCase() === 'ADDON_GROUP').length,
        addons: records.filter(r => (r.Type || r.type || '').toUpperCase() === 'ADDON').length,
        errors: errors.length,
        warnings: warnings.length
      }
    };
  },

  /**
   * Process records and insert into database
   */
  async processRecords(records, outletId, userId) {
    const pool = getPool();
    const conn = await pool.getConnection();
    
    const result = {
      success: true,
      created: { categories: 0, items: 0, variants: 0, addonGroups: 0, addons: 0 },
      skipped: { categories: 0, items: 0, variants: 0, addonGroups: 0, addons: 0 },
      errors: []
    };

    try {
      await conn.beginTransaction();

      // Load existing data
      const [cats] = await conn.query('SELECT id, name FROM categories WHERE outlet_id = ? AND deleted_at IS NULL', [outletId]);
      const [items] = await conn.query('SELECT id, name, sku FROM items WHERE outlet_id = ? AND deleted_at IS NULL', [outletId]);
      const [groups] = await conn.query('SELECT id, name FROM addon_groups WHERE outlet_id = ? AND is_active = 1', [outletId]);
      const [stations] = await conn.query('SELECT id, name FROM kitchen_stations WHERE outlet_id = ? AND is_active = 1', [outletId]);
      const [taxGroups] = await conn.query('SELECT id, total_rate FROM tax_groups WHERE (outlet_id = ? OR outlet_id IS NULL) AND is_active = 1', [outletId]);

      const catMap = new Map(cats.map(c => [c.name.toLowerCase(), c.id]));
      const itemMap = new Map(items.map(i => [i.name.toLowerCase(), i.id]));
      const groupMap = new Map(groups.map(a => [a.name.toLowerCase(), a.id]));
      const stationMap = new Map(stations.map(s => [s.name.toLowerCase(), s.id]));
      const taxMap = new Map(taxGroups.map(t => [String(t.total_rate), t.id]));

      let currentCatId = null;
      let currentItemId = null;
      let currentGroupId = null;
      let order = 0;

      for (let i = 0; i < records.length; i++) {
        const row = records[i];
        const rowNum = i + 2;
        const type = (row.Type || row.type || '').toUpperCase().trim();
        const name = row.Name || row.name;

        try {
          switch (type) {
            case 'CATEGORY': {
              const nameLower = name.trim().toLowerCase();
              if (catMap.has(nameLower)) {
                result.skipped.categories++;
                currentCatId = catMap.get(nameLower);
              } else {
                let parentId = null;
                const parent = row.Parent || row.parent;
                if (parent) {
                  parentId = catMap.get(parent.toLowerCase()) || null;
                }
                const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
                const [r] = await conn.query(
                  `INSERT INTO categories (outlet_id, parent_id, name, slug, description, display_order, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)`,
                  [outletId, parentId, name.trim(), slug, row.Description || row.description || null, order++]
                );
                catMap.set(nameLower, r.insertId);
                currentCatId = r.insertId;
                result.created.categories++;
              }
              break;
            }

            case 'ITEM': {
              const nameLower = name.trim().toLowerCase();
              if (itemMap.has(nameLower)) {
                result.skipped.items++;
                currentItemId = itemMap.get(nameLower);
              } else {
                const catName = row.Category || row.category;
                const catId = catName ? catMap.get(catName.toLowerCase()) : currentCatId;
                if (!catId) throw new Error(`Category not found for item "${name}"`);

                const price = parseFloat(row.Price || row.price) || 0;
                const foodType = (row.FoodType || row.foodtype || 'veg').toLowerCase();
                const gst = row.GST || row.gst;
                let taxGroupId = null;
                if (gst && GST_RATES[gst] !== undefined) {
                  taxGroupId = taxMap.get(gst) || await this._getOrCreateTaxGroup(conn, outletId, gst);
                  if (taxGroupId) taxMap.set(gst, taxGroupId);
                }

                const stationName = row.Station || row.station;
                let stationId = null;
                if (stationName) {
                  stationId = stationMap.get(stationName.toLowerCase());
                  if (!stationId) {
                    const [sr] = await conn.query(
                      `INSERT INTO kitchen_stations (outlet_id, name, code, station_type, is_active) VALUES (?, ?, ?, 'main_kitchen', 1)`,
                      [outletId, stationName, stationName.toUpperCase().replace(/\s+/g, '_')]
                    );
                    stationId = sr.insertId;
                    stationMap.set(stationName.toLowerCase(), stationId);
                  }
                }

                const sku = row.SKU || row.sku || `ITM${Date.now()}${Math.random().toString(36).substr(2, 4)}`;
                const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

                const [r] = await conn.query(
                  `INSERT INTO items (outlet_id, category_id, sku, name, short_name, slug, description, item_type, base_price, tax_group_id, kitchen_station_id, display_order, is_active, is_available)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1)`,
                  [outletId, catId, sku, name.trim(), row.ShortName || row.shortname || null, slug, row.Description || row.description || null, foodType, price, taxGroupId, stationId, order++]
                );
                itemMap.set(nameLower, r.insertId);
                currentItemId = r.insertId;
                result.created.items++;
              }
              break;
            }

            case 'VARIANT': {
              const itemName = row.Item || row.item;
              const itemId = itemName ? itemMap.get(itemName.toLowerCase()) : currentItemId;
              if (!itemId) throw new Error(`Item not found for variant "${name}"`);

              const price = parseFloat(row.Price || row.price) || 0;
              const sku = row.SKU || row.sku || `VAR${Date.now()}${Math.random().toString(36).substr(2, 4)}`;
              const isDefault = (row.Default || row.default || '').toLowerCase() === 'yes';

              await conn.query(
                `INSERT INTO variants (item_id, name, sku, price, is_default, display_order, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)`,
                [itemId, name.trim(), sku, price, isDefault, order++]
              );
              await conn.query('UPDATE items SET has_variants = 1 WHERE id = ?', [itemId]);
              result.created.variants++;
              break;
            }

            case 'ADDON_GROUP': {
              const nameLower = name.trim().toLowerCase();
              if (groupMap.has(nameLower)) {
                result.skipped.addonGroups++;
                currentGroupId = groupMap.get(nameLower);
              } else {
                const selType = (row.SelectionType || row.selectiontype || 'multiple').toLowerCase();
                const minSel = parseInt(row.Min || row.min) || 0;
                const maxSel = parseInt(row.Max || row.max) || 10;
                const required = (row.Required || row.required || '').toLowerCase() === 'yes';

                const [r] = await conn.query(
                  `INSERT INTO addon_groups (outlet_id, name, selection_type, min_selection, max_selection, is_required, display_order, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
                  [outletId, name.trim(), selType, minSel, maxSel, required, order++]
                );
                groupMap.set(nameLower, r.insertId);
                currentGroupId = r.insertId;
                result.created.addonGroups++;
              }
              break;
            }

            case 'ADDON': {
              const groupName = row.Group || row.group;
              const groupId = groupName ? groupMap.get(groupName.toLowerCase()) : currentGroupId;
              if (!groupId) throw new Error(`Addon group not found for addon "${name}"`);

              const price = parseFloat(row.Price || row.price) || 0;
              const foodType = (row.FoodType || row.foodtype || 'veg').toLowerCase();

              await conn.query(
                `INSERT INTO addons (addon_group_id, name, price, item_type, display_order, is_active) VALUES (?, ?, ?, ?, ?, 1)`,
                [groupId, name.trim(), price, foodType, order++]
              );
              result.created.addons++;
              break;
            }
          }
        } catch (rowErr) {
          result.errors.push({ row: rowNum, message: rowErr.message });
        }
      }

      await conn.commit();
      await this._invalidateCaches(outletId);
      logger.info(`Bulk upload completed for outlet ${outletId}:`, result);

    } catch (error) {
      await conn.rollback();
      result.success = false;
      result.errors.push({ row: 0, message: `Transaction failed: ${error.message}` });
      logger.error('Bulk upload failed:', error);
    } finally {
      conn.release();
    }

    return result;
  },

  async _getOrCreateTaxGroup(conn, outletId, rate) {
    const [existing] = await conn.query(
      'SELECT id FROM tax_groups WHERE total_rate = ? AND (outlet_id = ? OR outlet_id IS NULL) AND is_active = 1 LIMIT 1',
      [rate, outletId]
    );
    if (existing.length > 0) return existing[0].id;

    const [r] = await conn.query(
      `INSERT INTO tax_groups (outlet_id, name, code, total_rate, is_active) VALUES (?, ?, ?, ?, 1)`,
      [outletId, `GST ${rate}%`, `GST_${rate}`, rate]
    );
    return r.insertId;
  },

  async _invalidateCaches(outletId) {
    try {
      await cache.del(`categories:${outletId}:false`);
      await cache.del(`categories:${outletId}:true`);
      await cache.del(`items:${outletId}`);
      await cache.del(`addon_groups:${outletId}`);
      await cache.del(`kitchen_stations:${outletId}`);
    } catch (e) {
      logger.warn('Cache invalidation error:', e);
    }
  },

  /**
   * Generate simple CSV template
   */
  generateTemplate() {
    const header = 'Type,Name,Category,Price,FoodType,GST,Station,Description,Parent,ShortName,SKU,Default,SelectionType,Min,Max,Required,Group,Item';
    const examples = [
      '# MENU CATEGORIES',
      'CATEGORY,Starters,,,,,,Appetizers and snacks,,,,,,,,,',
      'CATEGORY,Veg Starters,,,,,,Vegetarian starters,Starters,,,,,,,,',
      'CATEGORY,Non-Veg Starters,,,,,,Non-vegetarian starters,Starters,,,,,,,,',
      '',
      '# MENU ITEMS (Category can be omitted if placed after CATEGORY row)',
      'ITEM,Paneer Tikka,Veg Starters,250,veg,5,Main Kitchen,Grilled cottage cheese,,P.Tikka,PTK001,,,,,',
      'ITEM,Veg Spring Roll,Veg Starters,180,veg,5,Main Kitchen,Crispy vegetable rolls,,Spr.Roll,VSR001,,,,,',
      'ITEM,Chicken Tikka,Non-Veg Starters,320,nonveg,5,Main Kitchen,Grilled chicken pieces,,C.Tikka,CTK001,,,,,',
      '',
      '# VARIANTS (Place after ITEM row, or specify Item column)',
      'VARIANT,Half,,150,,,,,,,PTK001-H,no,,,,,Paneer Tikka',
      'VARIANT,Full,,250,,,,,,,PTK001-F,yes,,,,,Paneer Tikka',
      '',
      '# ADDON GROUPS',
      'ADDON_GROUP,Extra Toppings,,,,,,,,,,,multiple,0,3,no,,',
      'ADDON_GROUP,Cooking Style,,,,,,,,,,,single,1,1,yes,,',
      '',
      '# ADDONS (Place after ADDON_GROUP row, or specify Group column)',
      'ADDON,Extra Cheese,,30,veg,,,,,,,,,,,,Extra Toppings,',
      'ADDON,Jalapenos,,20,veg,,,,,,,,,,,,Extra Toppings,',
      'ADDON,Mild,,0,veg,,,,,,,,,,,,Cooking Style,',
      'ADDON,Medium,,0,veg,,,,,,,,,,,,Cooking Style,',
      'ADDON,Spicy,,0,veg,,,,,,,,,,,,Cooking Style,'
    ];

    return header + '\n' + examples.join('\n');
  },

  /**
   * Get template structure for frontend
   */
  getTemplateStructure() {
    return {
      columns: [
        { name: 'Type', required: true, description: 'CATEGORY, ITEM, VARIANT, ADDON_GROUP, ADDON' },
        { name: 'Name', required: true, description: 'Name of the item/category/addon' },
        { name: 'Category', required: false, description: 'Category name (for items)' },
        { name: 'Price', required: false, description: 'Price (required for ITEM, VARIANT, ADDON)' },
        { name: 'FoodType', required: false, description: 'veg, nonveg, egg (default: veg)' },
        { name: 'GST', required: false, description: 'Tax rate: 0, 5, 12, 18, 28' },
        { name: 'Station', required: false, description: 'Kitchen station name' },
        { name: 'Description', required: false, description: 'Description text' },
        { name: 'Parent', required: false, description: 'Parent category (for subcategories)' },
        { name: 'ShortName', required: false, description: 'Short name for KOT' },
        { name: 'SKU', required: false, description: 'Item/variant code' },
        { name: 'Default', required: false, description: 'Is default variant (yes/no)' },
        { name: 'SelectionType', required: false, description: 'single/multiple (for addon groups)' },
        { name: 'Min', required: false, description: 'Min selection (for addon groups)' },
        { name: 'Max', required: false, description: 'Max selection (for addon groups)' },
        { name: 'Required', required: false, description: 'Is required (yes/no)' },
        { name: 'Group', required: false, description: 'Addon group name (for addons)' },
        { name: 'Item', required: false, description: 'Item name (for variants)' }
      ],
      types: {
        CATEGORY: { required: ['Name'], optional: ['Description', 'Parent'] },
        ITEM: { required: ['Name', 'Price'], optional: ['Category', 'FoodType', 'GST', 'Station', 'Description', 'ShortName', 'SKU'] },
        VARIANT: { required: ['Name', 'Price'], optional: ['Item', 'SKU', 'Default'] },
        ADDON_GROUP: { required: ['Name'], optional: ['SelectionType', 'Min', 'Max', 'Required'] },
        ADDON: { required: ['Name'], optional: ['Group', 'Price', 'FoodType'] }
      },
      foodTypes: ['veg', 'nonveg', 'egg'],
      gstRates: ['0', '5', '12', '18', '28']
    };
  },

  /**
   * Get upload history
   */
  async getUploadHistory(outletId, limit = 20) {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT * FROM bulk_upload_logs WHERE outlet_id = ? ORDER BY created_at DESC LIMIT ?`,
      [outletId, limit]
    );
    return rows.map(h => ({
      id: h.id,
      filename: h.filename,
      status: h.status,
      summary: h.summary ? JSON.parse(h.summary) : null,
      errors: h.errors ? JSON.parse(h.errors) : null,
      createdAt: h.created_at
    }));
  },

  /**
   * Log upload attempt
   */
  async logUpload(outletId, userId, filename, result) {
    const pool = getPool();
    await pool.query(
      `INSERT INTO bulk_upload_logs (outlet_id, user_id, filename, status, summary, errors, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [outletId, userId, filename, result.success ? 'success' : 'failed', JSON.stringify(result.created), JSON.stringify(result.errors)]
    );
  }
};

module.exports = bulkUploadService;
