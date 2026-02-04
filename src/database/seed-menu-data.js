/**
 * Seed Menu Data for Development/Testing
 * Covers all scenarios: Bar, Restaurant, Time-based, Variants, Addons, GST/VAT, Discounts
 * Run: npm run seed:menu
 */

require('dotenv').config();
const { initializeDatabase, getPool } = require('./index');

async function seedMenuData() {
  console.log('\n🍽️  Seeding menu data for all scenarios...\n');

  try {
    await initializeDatabase();
    const pool = getPool();

    // Get outlet ID
    const [outlets] = await pool.query('SELECT id FROM outlets WHERE code = ? LIMIT 1', ['DTR001']);
    if (outlets.length === 0) {
      console.error('❌ Please run seed:outlets first');
      process.exit(1);
    }
    const outletId = outlets[0].id;

    // Get floor and section IDs
    const [floors] = await pool.query('SELECT id, name FROM floors WHERE outlet_id = ?', [outletId]);
    const [sections] = await pool.query('SELECT id, name, section_type FROM sections WHERE outlet_id = ?', [outletId]);

    const floorMap = {};
    floors.forEach(f => floorMap[f.name] = f.id);

    const sectionMap = {};
    sections.forEach(s => sectionMap[s.name] = s.id);

    console.log('  Found floors:', Object.keys(floorMap).join(', '));
    console.log('  Found sections:', Object.keys(sectionMap).join(', '));

    // ========================
    // 1. TAX SETUP
    // ========================
    console.log('\n📊 Setting up taxes...');

    // Tax Types
    const taxTypes = [
      { name: 'GST', code: 'GST', description: 'Goods and Services Tax' },
      { name: 'VAT', code: 'VAT', description: 'Value Added Tax for Liquor' }
    ];

    const taxTypeMap = {};
    for (const type of taxTypes) {
      const [existing] = await pool.query('SELECT id FROM tax_types WHERE code = ?', [type.code]);
      if (existing.length > 0) {
        taxTypeMap[type.code] = existing[0].id;
      } else {
        const [result] = await pool.query(
          'INSERT INTO tax_types (name, code, description, is_active) VALUES (?, ?, ?, 1)',
          [type.name, type.code, type.description]
        );
        taxTypeMap[type.code] = result.insertId;
        console.log(`  ✓ Created tax type: ${type.name}`);
      }
    }

    // Tax Components
    const taxComponents = [
      { taxType: 'GST', name: 'CGST 2.5%', code: 'CGST_2.5', rate: 2.5 },
      { taxType: 'GST', name: 'SGST 2.5%', code: 'SGST_2.5', rate: 2.5 },
      { taxType: 'GST', name: 'CGST 9%', code: 'CGST_9', rate: 9 },
      { taxType: 'GST', name: 'SGST 9%', code: 'SGST_9', rate: 9 },
      { taxType: 'VAT', name: 'Liquor VAT', code: 'VAT_LIQ', rate: 18 }
    ];

    const componentMap = {};
    for (const comp of taxComponents) {
      const [existing] = await pool.query('SELECT id FROM tax_components WHERE code = ?', [comp.code]);
      if (existing.length > 0) {
        componentMap[comp.code] = existing[0].id;
      } else {
        const [result] = await pool.query(
          'INSERT INTO tax_components (tax_type_id, name, code, rate, is_active) VALUES (?, ?, ?, ?, 1)',
          [taxTypeMap[comp.taxType], comp.name, comp.code, comp.rate]
        );
        componentMap[comp.code] = result.insertId;
        console.log(`  ✓ Created tax component: ${comp.name}`);
      }
    }

    // Tax Groups
    const taxGroups = [
      { name: 'Restaurant GST 5%', code: 'REST_GST_5', isInclusive: true, components: ['CGST_2.5', 'SGST_2.5'] },
      { name: 'Restaurant GST 18%', code: 'REST_GST_18', isInclusive: false, components: ['CGST_9', 'SGST_9'] },
      { name: 'Liquor VAT 18%', code: 'LIQ_VAT_18', isInclusive: false, components: ['VAT_LIQ'] }
    ];

    const taxGroupMap = {};
    for (const group of taxGroups) {
      const [existing] = await pool.query('SELECT id FROM tax_groups WHERE code = ?', [group.code]);
      if (existing.length > 0) {
        taxGroupMap[group.code] = existing[0].id;
      } else {
        const totalRate = group.components.reduce((sum, code) => {
          const comp = taxComponents.find(c => c.code === code);
          return sum + (comp?.rate || 0);
        }, 0);

        const [result] = await pool.query(
          'INSERT INTO tax_groups (outlet_id, name, code, total_rate, is_inclusive, is_active) VALUES (?, ?, ?, ?, ?, 1)',
          [outletId, group.name, group.code, totalRate, group.isInclusive]
        );
        taxGroupMap[group.code] = result.insertId;

        // Add components
        for (const compCode of group.components) {
          await pool.query(
            'INSERT INTO tax_group_components (tax_group_id, tax_component_id, is_active) VALUES (?, ?, 1)',
            [result.insertId, componentMap[compCode]]
          );
        }
        console.log(`  ✓ Created tax group: ${group.name} (${totalRate}%)`);
      }
    }

    // ========================
    // 2. TIME SLOTS
    // ========================
    console.log('\n⏰ Setting up time slots...');

    const timeSlots = [
      { name: 'Breakfast', code: 'BFAST', startTime: '07:00:00', endTime: '11:00:00' },
      { name: 'Lunch', code: 'LUNCH', startTime: '11:00:00', endTime: '16:00:00' },
      { name: 'Tea Time', code: 'TEA', startTime: '16:00:00', endTime: '18:00:00' },
      { name: 'Dinner', code: 'DINNER', startTime: '18:00:00', endTime: '23:00:00' },
      { name: 'Happy Hour', code: 'HAPPY', startTime: '17:00:00', endTime: '20:00:00', days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] },
      { name: 'Late Night', code: 'LATE', startTime: '23:00:00', endTime: '02:00:00', days: ['friday', 'saturday'] }
    ];

    const timeSlotMap = {};
    for (const slot of timeSlots) {
      const [existing] = await pool.query('SELECT id FROM time_slots WHERE outlet_id = ? AND code = ?', [outletId, slot.code]);
      if (existing.length > 0) {
        timeSlotMap[slot.code] = existing[0].id;
      } else {
        const [result] = await pool.query(
          'INSERT INTO time_slots (outlet_id, name, code, start_time, end_time, active_days, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)',
          [outletId, slot.name, slot.code, slot.startTime, slot.endTime, JSON.stringify(slot.days || ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'])]
        );
        timeSlotMap[slot.code] = result.insertId;
        console.log(`  ✓ Created time slot: ${slot.name} (${slot.startTime} - ${slot.endTime})`);
      }
    }

    // ========================
    // 3. KITCHEN STATIONS
    // ========================
    console.log('\n👨‍🍳 Setting up kitchen stations...');

    const kitchenStations = [
      { name: 'Main Kitchen', code: 'MAIN', stationType: 'main_kitchen' },
      { name: 'Tandoor Station', code: 'TANDOOR', stationType: 'tandoor' },
      { name: 'Chinese Wok', code: 'WOK', stationType: 'wok' },
      { name: 'Dessert Station', code: 'DESSERT', stationType: 'dessert' }
    ];

    const stationMap = {};
    for (const station of kitchenStations) {
      const [existing] = await pool.query('SELECT id FROM kitchen_stations WHERE outlet_id = ? AND code = ?', [outletId, station.code]);
      if (existing.length > 0) {
        stationMap[station.code] = existing[0].id;
      } else {
        const [result] = await pool.query(
          'INSERT INTO kitchen_stations (outlet_id, name, code, station_type, is_active) VALUES (?, ?, ?, ?, 1)',
          [outletId, station.name, station.code, station.stationType]
        );
        stationMap[station.code] = result.insertId;
        console.log(`  ✓ Created kitchen station: ${station.name}`);
      }
    }

    // ========================
    // 4. COUNTERS (BAR)
    // ========================
    console.log('\n🍸 Setting up counters...');

    const counters = [
      { name: 'Main Bar', code: 'MAINBAR', counterType: 'main_bar', floorId: floorMap['Ground Floor'] },
      { name: 'Rooftop Bar', code: 'ROOFBAR', counterType: 'rooftop_bar', floorId: floorMap['Rooftop'] }
    ];

    const counterMap = {};
    for (const counter of counters) {
      const [existing] = await pool.query('SELECT id FROM counters WHERE outlet_id = ? AND code = ?', [outletId, counter.code]);
      if (existing.length > 0) {
        counterMap[counter.code] = existing[0].id;
      } else {
        const [result] = await pool.query(
          'INSERT INTO counters (outlet_id, floor_id, name, code, counter_type, is_active) VALUES (?, ?, ?, ?, ?, 1)',
          [outletId, counter.floorId, counter.name, counter.code, counter.counterType]
        );
        counterMap[counter.code] = result.insertId;
        console.log(`  ✓ Created counter: ${counter.name}`);
      }
    }

    // ========================
    // 5. ADDON GROUPS
    // ========================
    console.log('\n➕ Setting up addon groups...');

    const addonGroups = [
      { name: 'Extra Toppings', selectionType: 'multiple', minSelection: 0, maxSelection: 5, isRequired: false },
      { name: 'Spice Level', selectionType: 'single', minSelection: 1, maxSelection: 1, isRequired: true },
      { name: 'Side Options', selectionType: 'single', minSelection: 0, maxSelection: 1, isRequired: false },
      { name: 'Drink Add-ons', selectionType: 'multiple', minSelection: 0, maxSelection: 3, isRequired: false }
    ];

    const addonGroupMap = {};
    for (const group of addonGroups) {
      const [existing] = await pool.query('SELECT id FROM addon_groups WHERE outlet_id = ? AND name = ?', [outletId, group.name]);
      if (existing.length > 0) {
        addonGroupMap[group.name] = existing[0].id;
      } else {
        const [result] = await pool.query(
          'INSERT INTO addon_groups (outlet_id, name, selection_type, min_selection, max_selection, is_required, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)',
          [outletId, group.name, group.selectionType, group.minSelection, group.maxSelection, group.isRequired]
        );
        addonGroupMap[group.name] = result.insertId;
        console.log(`  ✓ Created addon group: ${group.name}`);
      }
    }

    // Addons
    const addons = [
      { group: 'Extra Toppings', name: 'Extra Cheese', price: 30, itemType: 'veg' },
      { group: 'Extra Toppings', name: 'Mushrooms', price: 40, itemType: 'veg' },
      { group: 'Extra Toppings', name: 'Jalapenos', price: 25, itemType: 'veg' },
      { group: 'Extra Toppings', name: 'Chicken Topping', price: 60, itemType: 'non_veg' },
      { group: 'Spice Level', name: 'Mild', price: 0, itemType: 'veg' },
      { group: 'Spice Level', name: 'Medium', price: 0, itemType: 'veg' },
      { group: 'Spice Level', name: 'Hot', price: 0, itemType: 'veg' },
      { group: 'Spice Level', name: 'Extra Hot', price: 0, itemType: 'veg' },
      { group: 'Side Options', name: 'French Fries', price: 80, itemType: 'veg' },
      { group: 'Side Options', name: 'Coleslaw', price: 50, itemType: 'veg' },
      { group: 'Side Options', name: 'Garlic Bread', price: 70, itemType: 'veg' },
      { group: 'Drink Add-ons', name: 'Lemon Slice', price: 10, itemType: 'veg' },
      { group: 'Drink Add-ons', name: 'Extra Ice', price: 0, itemType: 'veg' },
      { group: 'Drink Add-ons', name: 'Salt Rim', price: 0, itemType: 'veg' }
    ];

    for (const addon of addons) {
      const groupId = addonGroupMap[addon.group];
      const [existing] = await pool.query('SELECT id FROM addons WHERE addon_group_id = ? AND name = ?', [groupId, addon.name]);
      if (existing.length === 0) {
        await pool.query(
          'INSERT INTO addons (addon_group_id, name, price, item_type, is_active) VALUES (?, ?, ?, ?, 1)',
          [groupId, addon.name, addon.price, addon.itemType]
        );
      }
    }
    console.log(`  ✓ Created ${addons.length} addons`);

    // ========================
    // 6. CATEGORIES
    // ========================
    console.log('\n📁 Setting up categories...');

    const categories = [
      // Restaurant categories
      { name: 'Starters', icon: '🥗', colorCode: '#4CAF50', sections: ['Restaurant'], timeSlots: ['LUNCH', 'DINNER'] },
      { name: 'Main Course', icon: '🍛', colorCode: '#FF9800', sections: ['Restaurant'], timeSlots: ['LUNCH', 'DINNER'] },
      { name: 'Breads', icon: '🍞', colorCode: '#795548', sections: ['Restaurant'], timeSlots: ['LUNCH', 'DINNER'] },
      { name: 'Rice & Biryani', icon: '🍚', colorCode: '#FFC107', sections: ['Restaurant'], timeSlots: ['LUNCH', 'DINNER'] },
      { name: 'Desserts', icon: '🍨', colorCode: '#E91E63', sections: ['Restaurant'], timeSlots: ['LUNCH', 'DINNER', 'TEA'] },
      { name: 'Beverages', icon: '🥤', colorCode: '#03A9F4', sections: ['Restaurant', 'Bar'], timeSlots: [] },
      // Breakfast category
      { name: 'Breakfast', icon: '🍳', colorCode: '#8BC34A', sections: ['Restaurant'], timeSlots: ['BFAST'] },
      // Bar categories
      { name: 'Whiskey', icon: '🥃', colorCode: '#8D6E63', sections: ['Bar'], timeSlots: ['DINNER', 'HAPPY', 'LATE'] },
      { name: 'Vodka', icon: '🍸', colorCode: '#9C27B0', sections: ['Bar'], timeSlots: ['DINNER', 'HAPPY', 'LATE'] },
      { name: 'Beer', icon: '🍺', colorCode: '#FFEB3B', sections: ['Bar'], timeSlots: ['LUNCH', 'DINNER', 'HAPPY', 'LATE'] },
      { name: 'Wine', icon: '🍷', colorCode: '#9C27B0', sections: ['Bar', 'Private Dining'], timeSlots: ['DINNER', 'LATE'] },
      { name: 'Cocktails', icon: '🍹', colorCode: '#FF5722', sections: ['Bar'], timeSlots: ['DINNER', 'HAPPY', 'LATE'] }
    ];

    const categoryMap = {};
    for (const cat of categories) {
      const [existing] = await pool.query('SELECT id FROM categories WHERE outlet_id = ? AND name = ?', [outletId, cat.name]);
      if (existing.length > 0) {
        categoryMap[cat.name] = existing[0].id;
      } else {
        const [result] = await pool.query(
          'INSERT INTO categories (outlet_id, name, icon, color_code, is_active) VALUES (?, ?, ?, ?, 1)',
          [outletId, cat.name, cat.icon, cat.colorCode]
        );
        categoryMap[cat.name] = result.insertId;

        // Add section visibility
        for (const secName of cat.sections) {
          if (sectionMap[secName]) {
            await pool.query(
              'INSERT INTO category_sections (category_id, section_id, is_available) VALUES (?, ?, 1) ON DUPLICATE KEY UPDATE is_available = 1',
              [result.insertId, sectionMap[secName]]
            );
          }
        }

        // Add time slot visibility
        for (const slotCode of cat.timeSlots) {
          if (timeSlotMap[slotCode]) {
            await pool.query(
              'INSERT INTO category_time_slots (category_id, time_slot_id, is_available) VALUES (?, ?, 1) ON DUPLICATE KEY UPDATE is_available = 1',
              [result.insertId, timeSlotMap[slotCode]]
            );
          }
        }

        console.log(`  ✓ Created category: ${cat.name}`);
      }
    }

    // ========================
    // 7. ITEMS
    // ========================
    console.log('\n🍽️  Setting up menu items...');

    const items = [
      // STARTERS
      { category: 'Starters', name: 'Paneer Tikka', shortName: 'P.Tikka', basePrice: 280, itemType: 'veg', taxGroup: 'REST_GST_5', station: 'TANDOOR', hasAddons: true, addonGroups: ['Spice Level'] },
      { category: 'Starters', name: 'Chicken Tikka', shortName: 'C.Tikka', basePrice: 320, itemType: 'non_veg', taxGroup: 'REST_GST_5', station: 'TANDOOR', hasAddons: true, addonGroups: ['Spice Level'] },
      { category: 'Starters', name: 'Veg Spring Roll', shortName: 'V.Roll', basePrice: 180, itemType: 'veg', taxGroup: 'REST_GST_5', station: 'WOK' },
      { category: 'Starters', name: 'Chicken 65', shortName: 'C.65', basePrice: 280, itemType: 'non_veg', taxGroup: 'REST_GST_5', station: 'MAIN', isBestseller: true },

      // MAIN COURSE
      { category: 'Main Course', name: 'Paneer Butter Masala', shortName: 'PBM', basePrice: 320, itemType: 'veg', taxGroup: 'REST_GST_5', station: 'MAIN', isBestseller: true, hasAddons: true, addonGroups: ['Spice Level'] },
      { category: 'Main Course', name: 'Dal Makhani', shortName: 'DM', basePrice: 260, itemType: 'veg', taxGroup: 'REST_GST_5', station: 'MAIN', isRecommended: true },
      { category: 'Main Course', name: 'Butter Chicken', shortName: 'BC', basePrice: 380, itemType: 'non_veg', taxGroup: 'REST_GST_5', station: 'MAIN', isBestseller: true, hasAddons: true, addonGroups: ['Spice Level'] },
      { category: 'Main Course', name: 'Mutton Rogan Josh', shortName: 'MRJ', basePrice: 450, itemType: 'non_veg', taxGroup: 'REST_GST_5', station: 'MAIN' },

      // BREADS
      { category: 'Breads', name: 'Butter Naan', shortName: 'B.Naan', basePrice: 60, itemType: 'veg', taxGroup: 'REST_GST_5', station: 'TANDOOR' },
      { category: 'Breads', name: 'Garlic Naan', shortName: 'G.Naan', basePrice: 70, itemType: 'veg', taxGroup: 'REST_GST_5', station: 'TANDOOR', isRecommended: true },
      { category: 'Breads', name: 'Tandoori Roti', shortName: 'T.Roti', basePrice: 40, itemType: 'veg', taxGroup: 'REST_GST_5', station: 'TANDOOR' },
      { category: 'Breads', name: 'Cheese Naan', shortName: 'Ch.Naan', basePrice: 90, itemType: 'veg', taxGroup: 'REST_GST_5', station: 'TANDOOR', hasAddons: true, addonGroups: ['Extra Toppings'] },

      // RICE & BIRYANI
      { category: 'Rice & Biryani', name: 'Veg Biryani', shortName: 'V.Biry', basePrice: 280, itemType: 'veg', taxGroup: 'REST_GST_5', station: 'MAIN', hasAddons: true, addonGroups: ['Spice Level', 'Side Options'] },
      { category: 'Rice & Biryani', name: 'Chicken Biryani', shortName: 'C.Biry', basePrice: 350, itemType: 'non_veg', taxGroup: 'REST_GST_5', station: 'MAIN', isBestseller: true, hasAddons: true, addonGroups: ['Spice Level', 'Side Options'] },
      { category: 'Rice & Biryani', name: 'Mutton Biryani', shortName: 'M.Biry', basePrice: 420, itemType: 'non_veg', taxGroup: 'REST_GST_5', station: 'MAIN', hasAddons: true, addonGroups: ['Spice Level', 'Side Options'] },
      { category: 'Rice & Biryani', name: 'Jeera Rice', shortName: 'J.Rice', basePrice: 150, itemType: 'veg', taxGroup: 'REST_GST_5', station: 'MAIN' },

      // DESSERTS
      { category: 'Desserts', name: 'Gulab Jamun', shortName: 'GJ', basePrice: 120, itemType: 'veg', taxGroup: 'REST_GST_5', station: 'DESSERT' },
      { category: 'Desserts', name: 'Rasmalai', shortName: 'RM', basePrice: 140, itemType: 'veg', taxGroup: 'REST_GST_5', station: 'DESSERT', isRecommended: true },
      { category: 'Desserts', name: 'Ice Cream', shortName: 'IC', basePrice: 100, itemType: 'veg', taxGroup: 'REST_GST_5', station: 'DESSERT', hasVariants: true },

      // BEVERAGES
      { category: 'Beverages', name: 'Fresh Lime Soda', shortName: 'FLS', basePrice: 80, itemType: 'veg', taxGroup: 'REST_GST_5' },
      { category: 'Beverages', name: 'Cold Coffee', shortName: 'CC', basePrice: 120, itemType: 'veg', taxGroup: 'REST_GST_5' },
      { category: 'Beverages', name: 'Masala Chai', shortName: 'M.Chai', basePrice: 50, itemType: 'veg', taxGroup: 'REST_GST_5' },

      // BREAKFAST
      { category: 'Breakfast', name: 'Masala Omelette', shortName: 'M.Oml', basePrice: 100, itemType: 'egg', taxGroup: 'REST_GST_5', station: 'MAIN' },
      { category: 'Breakfast', name: 'Poha', shortName: 'Poha', basePrice: 80, itemType: 'veg', taxGroup: 'REST_GST_5', station: 'MAIN' },
      { category: 'Breakfast', name: 'Idli Sambar', shortName: 'Idli', basePrice: 100, itemType: 'veg', taxGroup: 'REST_GST_5', station: 'MAIN' },
      { category: 'Breakfast', name: 'Paratha Combo', shortName: 'P.Combo', basePrice: 150, itemType: 'veg', taxGroup: 'REST_GST_5', station: 'TANDOOR', hasVariants: true },

      // WHISKEY
      { category: 'Whiskey', name: 'Johnnie Walker Black', shortName: 'JW Black', basePrice: 350, itemType: 'veg', taxGroup: 'LIQ_VAT_18', counter: 'MAINBAR', hasVariants: true },
      { category: 'Whiskey', name: 'Jack Daniels', shortName: 'JD', basePrice: 380, itemType: 'veg', taxGroup: 'LIQ_VAT_18', counter: 'MAINBAR', hasVariants: true, isBestseller: true },
      { category: 'Whiskey', name: 'Chivas Regal', shortName: 'Chivas', basePrice: 420, itemType: 'veg', taxGroup: 'LIQ_VAT_18', counter: 'MAINBAR', hasVariants: true },

      // VODKA
      { category: 'Vodka', name: 'Absolut Vodka', shortName: 'Absolut', basePrice: 280, itemType: 'veg', taxGroup: 'LIQ_VAT_18', counter: 'MAINBAR', hasVariants: true },
      { category: 'Vodka', name: 'Grey Goose', shortName: 'Grey G', basePrice: 450, itemType: 'veg', taxGroup: 'LIQ_VAT_18', counter: 'MAINBAR', hasVariants: true, isRecommended: true },

      // BEER
      { category: 'Beer', name: 'Kingfisher Premium', shortName: 'KF Prem', basePrice: 180, itemType: 'veg', taxGroup: 'LIQ_VAT_18', counter: 'MAINBAR', hasVariants: true, isBestseller: true },
      { category: 'Beer', name: 'Budweiser', shortName: 'Bud', basePrice: 220, itemType: 'veg', taxGroup: 'LIQ_VAT_18', counter: 'MAINBAR', hasVariants: true },
      { category: 'Beer', name: 'Corona Extra', shortName: 'Corona', basePrice: 350, itemType: 'veg', taxGroup: 'LIQ_VAT_18', counter: 'MAINBAR' },

      // WINE
      { category: 'Wine', name: 'Sula Red Wine', shortName: 'Sula Red', basePrice: 280, itemType: 'veg', taxGroup: 'LIQ_VAT_18', counter: 'MAINBAR', hasVariants: true },
      { category: 'Wine', name: 'Sula White Wine', shortName: 'Sula Wht', basePrice: 280, itemType: 'veg', taxGroup: 'LIQ_VAT_18', counter: 'MAINBAR', hasVariants: true },

      // COCKTAILS
      { category: 'Cocktails', name: 'Mojito', shortName: 'Mojito', basePrice: 350, itemType: 'veg', taxGroup: 'LIQ_VAT_18', counter: 'MAINBAR', hasAddons: true, addonGroups: ['Drink Add-ons'], isBestseller: true },
      { category: 'Cocktails', name: 'Long Island Iced Tea', shortName: 'LIIT', basePrice: 450, itemType: 'veg', taxGroup: 'LIQ_VAT_18', counter: 'MAINBAR', hasAddons: true, addonGroups: ['Drink Add-ons'] },
      { category: 'Cocktails', name: 'Pina Colada', shortName: 'P.Colada', basePrice: 380, itemType: 'veg', taxGroup: 'LIQ_VAT_18', counter: 'MAINBAR', hasAddons: true, addonGroups: ['Drink Add-ons'] },
      { category: 'Cocktails', name: 'Margarita', shortName: 'Marg', basePrice: 380, itemType: 'veg', taxGroup: 'LIQ_VAT_18', counter: 'MAINBAR', hasAddons: true, addonGroups: ['Drink Add-ons'], isRecommended: true }
    ];

    const itemMap = {};
    for (const item of items) {
      const [existing] = await pool.query('SELECT id FROM items WHERE outlet_id = ? AND name = ?', [outletId, item.name]);
      if (existing.length > 0) {
        itemMap[item.name] = existing[0].id;
        continue;
      }

      const [result] = await pool.query(
        `INSERT INTO items (outlet_id, category_id, name, short_name, base_price, item_type, tax_group_id, 
         kitchen_station_id, counter_id, has_variants, has_addons, is_bestseller, is_recommended, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [
          outletId, categoryMap[item.category], item.name, item.shortName, item.basePrice, item.itemType,
          taxGroupMap[item.taxGroup], item.station ? stationMap[item.station] : null,
          item.counter ? counterMap[item.counter] : null, item.hasVariants || false, item.hasAddons || false,
          item.isBestseller || false, item.isRecommended || false
        ]
      );
      itemMap[item.name] = result.insertId;

      // Add addon group mappings
      if (item.addonGroups) {
        for (let i = 0; i < item.addonGroups.length; i++) {
          await pool.query(
            'INSERT INTO item_addon_groups (item_id, addon_group_id, display_order, is_active) VALUES (?, ?, ?, 1)',
            [result.insertId, addonGroupMap[item.addonGroups[i]], i]
          );
        }
      }
    }
    console.log(`  ✓ Created ${Object.keys(itemMap).length} items`);

    // ========================
    // 8. VARIANTS
    // ========================
    console.log('\n📏 Setting up variants...');

    const variants = [
      // Ice Cream variants
      { item: 'Ice Cream', variants: [
        { name: 'Single Scoop', price: 100, isDefault: true },
        { name: 'Double Scoop', price: 160 },
        { name: 'Triple Scoop', price: 220 }
      ]},
      // Paratha Combo variants
      { item: 'Paratha Combo', variants: [
        { name: 'Aloo Paratha', price: 150, isDefault: true },
        { name: 'Paneer Paratha', price: 180 },
        { name: 'Gobi Paratha', price: 160 }
      ]},
      // Whiskey variants (30ml, 60ml, 90ml)
      { item: 'Johnnie Walker Black', variants: [
        { name: '30 ML', price: 350, isDefault: true },
        { name: '60 ML', price: 650 },
        { name: '90 ML', price: 950 }
      ]},
      { item: 'Jack Daniels', variants: [
        { name: '30 ML', price: 380, isDefault: true },
        { name: '60 ML', price: 700 },
        { name: '90 ML', price: 1000 }
      ]},
      { item: 'Chivas Regal', variants: [
        { name: '30 ML', price: 420, isDefault: true },
        { name: '60 ML', price: 780 },
        { name: '90 ML', price: 1100 }
      ]},
      // Vodka variants
      { item: 'Absolut Vodka', variants: [
        { name: '30 ML', price: 280, isDefault: true },
        { name: '60 ML', price: 520 }
      ]},
      { item: 'Grey Goose', variants: [
        { name: '30 ML', price: 450, isDefault: true },
        { name: '60 ML', price: 850 }
      ]},
      // Beer variants
      { item: 'Kingfisher Premium', variants: [
        { name: '330 ML', price: 180, isDefault: true },
        { name: '650 ML', price: 280 }
      ]},
      { item: 'Budweiser', variants: [
        { name: '330 ML', price: 220, isDefault: true },
        { name: '650 ML', price: 350 }
      ]},
      // Wine variants
      { item: 'Sula Red Wine', variants: [
        { name: 'Glass', price: 280, isDefault: true },
        { name: 'Bottle', price: 1200 }
      ]},
      { item: 'Sula White Wine', variants: [
        { name: 'Glass', price: 280, isDefault: true },
        { name: 'Bottle', price: 1200 }
      ]}
    ];

    let variantCount = 0;
    for (const itemVariants of variants) {
      const itemId = itemMap[itemVariants.item];
      if (!itemId) continue;

      for (const v of itemVariants.variants) {
        const [existing] = await pool.query('SELECT id FROM variants WHERE item_id = ? AND name = ?', [itemId, v.name]);
        if (existing.length === 0) {
          await pool.query(
            'INSERT INTO variants (item_id, name, price, is_default, is_active) VALUES (?, ?, ?, ?, 1)',
            [itemId, v.name, v.price, v.isDefault || false]
          );
          variantCount++;
        }
      }
    }
    console.log(`  ✓ Created ${variantCount} variants`);

    // ========================
    // 9. PRICE RULES (Happy Hour)
    // ========================
    console.log('\n🎉 Setting up price rules...');

    // Happy Hour - 20% off on cocktails
    const [existingHappyHour] = await pool.query(
      "SELECT id FROM price_rules WHERE outlet_id = ? AND name = 'Happy Hour Cocktails'",
      [outletId]
    );

    if (existingHappyHour.length === 0) {
      await pool.query(
        `INSERT INTO price_rules (outlet_id, name, description, rule_type, category_id, 
         time_start, time_end, days_of_week, adjustment_type, adjustment_value, priority, is_active)
         VALUES (?, 'Happy Hour Cocktails', '20% off on all cocktails', 'happy_hour', ?, 
         '17:00:00', '20:00:00', 'monday,tuesday,wednesday,thursday,friday', 'percentage', -20, 10, 1)`,
        [outletId, categoryMap['Cocktails']]
      );
      console.log('  ✓ Created Happy Hour rule: 20% off cocktails (5-8 PM weekdays)');
    }

    // Bar floor premium - 10% extra on bar floor
    const [existingBarPremium] = await pool.query(
      "SELECT id FROM price_rules WHERE outlet_id = ? AND name = 'Rooftop Premium'",
      [outletId]
    );

    if (existingBarPremium.length === 0 && floorMap['Rooftop']) {
      await pool.query(
        `INSERT INTO price_rules (outlet_id, name, description, rule_type, floor_id, 
         adjustment_type, adjustment_value, priority, is_active)
         VALUES (?, 'Rooftop Premium', '10% premium on rooftop', 'floor', ?, 
         'percentage', 10, 5, 1)`,
        [outletId, floorMap['Rooftop']]
      );
      console.log('  ✓ Created Rooftop Premium rule: 10% extra on rooftop floor');
    }

    // ========================
    // 10. DISCOUNTS
    // ========================
    console.log('\n🏷️  Setting up discounts...');

    const discounts = [
      { code: 'WELCOME10', name: 'Welcome Discount', discountType: 'percentage', value: 10, minOrderAmount: 500, maxDiscountAmount: 200 },
      { code: 'FLAT100', name: 'Flat ₹100 Off', discountType: 'flat', value: 100, minOrderAmount: 1000 },
      { code: 'HAPPY20', name: 'Happy Hour 20%', discountType: 'percentage', value: 20, minOrderAmount: 500, isAutoApply: false }
    ];

    for (const discount of discounts) {
      const [existing] = await pool.query('SELECT id FROM discounts WHERE outlet_id = ? AND code = ?', [outletId, discount.code]);
      if (existing.length === 0) {
        await pool.query(
          `INSERT INTO discounts (outlet_id, code, name, discount_type, value, min_order_amount, max_discount_amount, is_auto_apply, is_active)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
          [outletId, discount.code, discount.name, discount.discountType, discount.value, discount.minOrderAmount || 0, discount.maxDiscountAmount || null, discount.isAutoApply || false]
        );
        console.log(`  ✓ Created discount: ${discount.code} - ${discount.name}`);
      }
    }

    // ========================
    // 11. SERVICE CHARGE
    // ========================
    console.log('\n💰 Setting up service charges...');

    const [existingServiceCharge] = await pool.query(
      'SELECT id FROM service_charges WHERE outlet_id = ? AND name = ?',
      [outletId, 'Service Charge']
    );

    if (existingServiceCharge.length === 0) {
      await pool.query(
        `INSERT INTO service_charges (outlet_id, name, rate, is_percentage, apply_on, is_optional, is_active)
         VALUES (?, 'Service Charge', 10, 1, 'subtotal', 1, 1)`,
        [outletId]
      );
      console.log('  ✓ Created service charge: 10%');
    }

    // ========================
    // SUMMARY
    // ========================
    console.log('\n' + '='.repeat(70));
    console.log('MENU DATA SUMMARY');
    console.log('='.repeat(70));
    console.log(`\n📊 Tax Setup:`);
    console.log(`   - Tax Types: ${Object.keys(taxTypeMap).length}`);
    console.log(`   - Tax Components: ${Object.keys(componentMap).length}`);
    console.log(`   - Tax Groups: ${Object.keys(taxGroupMap).length}`);
    console.log(`\n⏰ Time Slots: ${Object.keys(timeSlotMap).length}`);
    console.log(`👨‍🍳 Kitchen Stations: ${Object.keys(stationMap).length}`);
    console.log(`🍸 Counters: ${Object.keys(counterMap).length}`);
    console.log(`➕ Addon Groups: ${Object.keys(addonGroupMap).length}`);
    console.log(`📁 Categories: ${Object.keys(categoryMap).length}`);
    console.log(`🍽️  Items: ${Object.keys(itemMap).length}`);
    console.log(`📏 Variants: ${variantCount}`);
    console.log(`\n✅ Menu data seeded successfully!\n`);

  } catch (error) {
    console.error('❌ Failed to seed menu data:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

seedMenuData();
