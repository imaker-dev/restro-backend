/**
 * Seed Outlets, Floors, Sections, and Tables for Development/Testing
 * Run: node src/database/seed-outlet-tables.js
 */

require('dotenv').config();
const { v4: uuidv4 } = require('uuid');
const { initializeDatabase, getPool } = require('./index');

const testData = {
  outlets: [
    {
      name: 'Downtown Restaurant',
      code: 'DTR001',
      outletType: 'restaurant',
      city: 'Mumbai',
      state: 'Maharashtra',
      phone: '9876543210',
      gstin: '27AABCU9603R1ZM',
      openingTime: '10:00:00',
      closingTime: '23:00:00'
    }
  ],
  floors: [
    { name: 'Ground Floor', code: 'GF', floorNumber: 0, displayOrder: 1 },
    { name: 'First Floor', code: 'FF', floorNumber: 1, displayOrder: 2 },
    { name: 'Rooftop', code: 'RT', floorNumber: 2, displayOrder: 3 }
  ],
  sections: [
    { name: 'Restaurant', code: 'REST', sectionType: 'dine_in', colorCode: '#4CAF50' },
    { name: 'Bar', code: 'BAR', sectionType: 'bar', colorCode: '#9C27B0' },
    { name: 'AC Section', code: 'AC', sectionType: 'ac', colorCode: '#2196F3' },
    { name: 'Outdoor', code: 'OUT', sectionType: 'outdoor', colorCode: '#FF9800' },
    { name: 'Private Dining', code: 'PVT', sectionType: 'private', colorCode: '#E91E63' }
  ],
  tables: {
    'Ground Floor': [
      { tableNumber: 'T1', capacity: 4, shape: 'square', section: 'Restaurant' },
      { tableNumber: 'T2', capacity: 4, shape: 'square', section: 'Restaurant' },
      { tableNumber: 'T3', capacity: 6, shape: 'rectangle', section: 'Restaurant' },
      { tableNumber: 'T4', capacity: 6, shape: 'rectangle', section: 'Restaurant' },
      { tableNumber: 'T5', capacity: 2, shape: 'round', section: 'Restaurant' },
      { tableNumber: 'T6', capacity: 2, shape: 'round', section: 'Restaurant' },
      { tableNumber: 'B1', capacity: 4, shape: 'round', section: 'Bar' },
      { tableNumber: 'B2', capacity: 4, shape: 'round', section: 'Bar' },
      { tableNumber: 'B3', capacity: 6, shape: 'rectangle', section: 'Bar' }
    ],
    'First Floor': [
      { tableNumber: 'A1', capacity: 4, shape: 'square', section: 'AC Section' },
      { tableNumber: 'A2', capacity: 4, shape: 'square', section: 'AC Section' },
      { tableNumber: 'A3', capacity: 6, shape: 'rectangle', section: 'AC Section' },
      { tableNumber: 'A4', capacity: 8, shape: 'rectangle', section: 'AC Section' },
      { tableNumber: 'P1', capacity: 10, shape: 'rectangle', section: 'Private Dining' },
      { tableNumber: 'P2', capacity: 12, shape: 'rectangle', section: 'Private Dining' }
    ],
    'Rooftop': [
      { tableNumber: 'R1', capacity: 4, shape: 'round', section: 'Outdoor' },
      { tableNumber: 'R2', capacity: 4, shape: 'round', section: 'Outdoor' },
      { tableNumber: 'R3', capacity: 6, shape: 'round', section: 'Outdoor' },
      { tableNumber: 'R4', capacity: 8, shape: 'rectangle', section: 'Outdoor' },
      { tableNumber: 'RB1', capacity: 4, shape: 'round', section: 'Bar' },
      { tableNumber: 'RB2', capacity: 6, shape: 'rectangle', section: 'Bar' }
    ]
  }
};

async function seedOutletTables() {
  console.log('\n🏪 Seeding outlets, floors, sections, and tables...\n');

  try {
    await initializeDatabase();
    const pool = getPool();

    // Check if outlet already exists
    const [existingOutlets] = await pool.query('SELECT id FROM outlets WHERE code = ?', [testData.outlets[0].code]);
    
    let outletId;
    if (existingOutlets.length > 0) {
      outletId = existingOutlets[0].id;
      console.log(`  ⏭ Outlet ${testData.outlets[0].name} already exists (ID: ${outletId})`);
    } else {
      // Create outlet
      const outlet = testData.outlets[0];
      const [result] = await pool.query(
        `INSERT INTO outlets (uuid, code, name, outlet_type, city, state, phone, gstin, opening_time, closing_time, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [uuidv4(), outlet.code, outlet.name, outlet.outletType, outlet.city, outlet.state, outlet.phone, outlet.gstin, outlet.openingTime, outlet.closingTime]
      );
      outletId = result.insertId;
      console.log(`  ✓ Created outlet: ${outlet.name} (ID: ${outletId})`);
    }

    // Create sections
    const sectionMap = {};
    for (const section of testData.sections) {
      const [existing] = await pool.query(
        'SELECT id FROM sections WHERE outlet_id = ? AND code = ?',
        [outletId, section.code]
      );

      if (existing.length > 0) {
        sectionMap[section.name] = existing[0].id;
        console.log(`  ⏭ Section ${section.name} already exists`);
      } else {
        const [result] = await pool.query(
          `INSERT INTO sections (outlet_id, name, code, section_type, color_code, is_active)
           VALUES (?, ?, ?, ?, ?, 1)`,
          [outletId, section.name, section.code, section.sectionType, section.colorCode]
        );
        sectionMap[section.name] = result.insertId;
        console.log(`  ✓ Created section: ${section.name}`);
      }
    }

    // Create floors and tables
    const floorMap = {};
    for (const floor of testData.floors) {
      const [existing] = await pool.query(
        'SELECT id FROM floors WHERE outlet_id = ? AND name = ?',
        [outletId, floor.name]
      );

      let floorId;
      if (existing.length > 0) {
        floorId = existing[0].id;
        floorMap[floor.name] = floorId;
        console.log(`  ⏭ Floor ${floor.name} already exists`);
      } else {
        const [result] = await pool.query(
          `INSERT INTO floors (outlet_id, name, code, floor_number, display_order, is_active)
           VALUES (?, ?, ?, ?, ?, 1)`,
          [outletId, floor.name, floor.code, floor.floorNumber, floor.displayOrder]
        );
        floorId = result.insertId;
        floorMap[floor.name] = floorId;
        console.log(`  ✓ Created floor: ${floor.name}`);
      }

      // Create tables for this floor
      const tables = testData.tables[floor.name] || [];
      for (const table of tables) {
        const [existingTable] = await pool.query(
          'SELECT id FROM tables WHERE outlet_id = ? AND table_number = ?',
          [outletId, table.tableNumber]
        );

        if (existingTable.length > 0) {
          console.log(`    ⏭ Table ${table.tableNumber} already exists`);
        } else {
          const sectionId = sectionMap[table.section] || null;
          const [result] = await pool.query(
            `INSERT INTO tables (outlet_id, floor_id, section_id, table_number, capacity, shape, status, is_mergeable, is_active)
             VALUES (?, ?, ?, ?, ?, ?, 'available', 1, 1)`,
            [outletId, floorId, sectionId, table.tableNumber, table.capacity, table.shape]
          );

          // Add layout position
          const posX = (tables.indexOf(table) % 4) * 120 + 50;
          const posY = Math.floor(tables.indexOf(table) / 4) * 120 + 50;
          await pool.query(
            `INSERT INTO table_layouts (table_id, position_x, position_y, width, height)
             VALUES (?, ?, ?, 100, 100)`,
            [result.insertId, posX, posY]
          );

          console.log(`    ✓ Created table: ${table.tableNumber} (${table.section}, cap: ${table.capacity})`);
        }
      }
    }

    // Link sections to floors
    console.log('\n  Linking sections to floors...');
    const floorSectionLinks = [
      { floor: 'Ground Floor', sections: ['Restaurant', 'Bar'] },
      { floor: 'First Floor', sections: ['AC Section', 'Private Dining'] },
      { floor: 'Rooftop', sections: ['Outdoor', 'Bar'] }
    ];

    for (const link of floorSectionLinks) {
      const floorId = floorMap[link.floor];
      for (const sectionName of link.sections) {
        const sectionId = sectionMap[sectionName];
        if (floorId && sectionId) {
          await pool.query(
            `INSERT INTO floor_sections (floor_id, section_id, is_active)
             VALUES (?, ?, 1)
             ON DUPLICATE KEY UPDATE is_active = 1`,
            [floorId, sectionId]
          );
        }
      }
    }

    console.log('\n✅ Outlets, floors, sections, and tables seeded successfully!\n');

    // Print summary
    console.log('='.repeat(70));
    console.log('OUTLET LAYOUT SUMMARY');
    console.log('='.repeat(70));
    console.log(`\n📍 Outlet: ${testData.outlets[0].name} (ID: ${outletId})`);
    console.log(`   City: ${testData.outlets[0].city}, ${testData.outlets[0].state}`);
    console.log(`   Hours: ${testData.outlets[0].openingTime} - ${testData.outlets[0].closingTime}`);
    
    console.log('\n🏢 Floors:');
    for (const floor of testData.floors) {
      const tables = testData.tables[floor.name] || [];
      const totalCapacity = tables.reduce((sum, t) => sum + t.capacity, 0);
      console.log(`   - ${floor.name}: ${tables.length} tables, capacity ${totalCapacity}`);
    }

    console.log('\n🪑 Sections:');
    for (const section of testData.sections) {
      console.log(`   - ${section.name} (${section.sectionType})`);
    }

    console.log('\n📊 Table Overview:');
    let totalTables = 0;
    let totalCapacity = 0;
    for (const floorName in testData.tables) {
      for (const table of testData.tables[floorName]) {
        totalTables++;
        totalCapacity += table.capacity;
      }
    }
    console.log(`   Total Tables: ${totalTables}`);
    console.log(`   Total Capacity: ${totalCapacity} guests`);
    console.log('');

  } catch (error) {
    console.error('❌ Failed to seed outlet tables:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

seedOutletTables();
