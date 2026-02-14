/**
 * Bridge Setup Script
 * 
 * Run this once to register the bridge in the database and get the API key.
 * Usage: node setup-bridge.js
 */

const crypto = require('crypto');

// Configuration - match these with bridge-agent.js
const OUTLET_ID = process.env.OUTLET_ID || 4;
const BRIDGE_CODE = process.env.BRIDGE_CODE || 'KITCHEN-BRIDGE-1';
const BRIDGE_NAME = process.env.BRIDGE_NAME || 'Kitchen Bridge';
const ASSIGNED_STATIONS = ['kitchen', 'bar', 'bill', 'kot_kitchen', 'kot_bar', 'kot_dessert', 'cashier'];

// Database connection
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mysql = require('mysql2/promise');

async function setupBridge() {
  console.log('\n🔧 Bridge Setup Script\n');
  
  const pool = await mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'restro',
    waitForConnections: true,
    connectionLimit: 1,
  });

  try {
    // Check if bridge already exists
    const [existing] = await pool.query(
      `SELECT id, bridge_code, is_active FROM printer_bridges 
       WHERE outlet_id = ? AND bridge_code = ?`,
      [OUTLET_ID, BRIDGE_CODE]
    );

    if (existing.length > 0) {
      console.log(`⚠️  Bridge "${BRIDGE_CODE}" already exists for outlet ${OUTLET_ID}`);
      console.log('   Generating new API key...\n');
      
      // Generate new API key
      const apiKey = crypto.randomBytes(32).toString('hex');
      const hashedKey = crypto.createHash('sha256').update(apiKey).digest('hex');
      
      // Update existing bridge
      await pool.query(
        `UPDATE printer_bridges 
         SET api_key = ?, is_active = 1, assigned_stations = ?
         WHERE id = ?`,
        [hashedKey, JSON.stringify(ASSIGNED_STATIONS), existing[0].id]
      );
      
      console.log('✅ Bridge updated successfully!\n');
      console.log('═══════════════════════════════════════════════════════════');
      console.log('   SAVE THIS API KEY - IT WILL NOT BE SHOWN AGAIN!');
      console.log('═══════════════════════════════════════════════════════════');
      console.log(`   API_KEY=${apiKey}`);
      console.log('═══════════════════════════════════════════════════════════\n');
      console.log('Now run the bridge agent with:');
      console.log(`   set API_KEY=${apiKey}`);
      console.log('   node bridge-agent.js\n');
      
    } else {
      console.log(`Creating new bridge "${BRIDGE_CODE}" for outlet ${OUTLET_ID}...\n`);
      
      // Generate API key
      const uuid = crypto.randomUUID();
      const apiKey = crypto.randomBytes(32).toString('hex');
      const hashedKey = crypto.createHash('sha256').update(apiKey).digest('hex');
      
      // Create bridge
      await pool.query(
        `INSERT INTO printer_bridges (
          uuid, outlet_id, name, bridge_code, api_key, assigned_stations, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, 1)`,
        [uuid, OUTLET_ID, BRIDGE_NAME, BRIDGE_CODE, hashedKey, JSON.stringify(ASSIGNED_STATIONS)]
      );
      
      console.log('✅ Bridge created successfully!\n');
      console.log('═══════════════════════════════════════════════════════════');
      console.log('   SAVE THIS API KEY - IT WILL NOT BE SHOWN AGAIN!');
      console.log('═══════════════════════════════════════════════════════════');
      console.log(`   API_KEY=${apiKey}`);
      console.log('═══════════════════════════════════════════════════════════\n');
      console.log('Now run the bridge agent with:');
      console.log(`   set API_KEY=${apiKey}`);
      console.log('   node bridge-agent.js\n');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    
    if (error.code === 'ER_NO_SUCH_TABLE') {
      console.log('\n   The printer_bridges table does not exist.');
      console.log('   Please run the database migrations first.\n');
    }
  } finally {
    await pool.end();
  }
}

setupBridge();
