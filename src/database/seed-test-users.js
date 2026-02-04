/**
 * Seed Test Users for Development/Testing
 * Run: node src/database/seed-test-users.js
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { initializeDatabase, getPool } = require('./index');

const SALT_ROUNDS = 12;

const testUsers = [
  {
    name: 'Manager User',
    email: 'manager@restropos.com',
    phone: '9876543211',
    employeeCode: 'MGR001',
    password: 'Manager@123',
    pin: '1111',
    role: 'manager',
  },
  {
    name: 'Captain John',
    email: 'captain@restropos.com',
    phone: '9876543212',
    employeeCode: 'CAP001',
    password: 'Captain@123',
    pin: '2222',
    role: 'captain',
  },
  {
    name: 'Waiter Sam',
    email: 'waiter@restropos.com',
    phone: '9876543213',
    employeeCode: 'WTR001',
    password: 'Waiter@123',
    pin: '3333',
    role: 'waiter',
  },
  {
    name: 'Cashier Mary',
    email: 'cashier@restropos.com',
    phone: '9876543214',
    employeeCode: 'CSH001',
    password: 'Cashier@123',
    pin: '4444',
    role: 'cashier',
  },
  {
    name: 'Kitchen Chef',
    email: 'kitchen@restropos.com',
    phone: '9876543215',
    employeeCode: 'KIT001',
    password: 'Kitchen@123',
    pin: '5555',
    role: 'kitchen',
  },
  {
    name: 'Bartender Mike',
    email: 'bartender@restropos.com',
    phone: '9876543216',
    employeeCode: 'BAR001',
    password: 'Bartender@123',
    pin: '6666',
    role: 'bartender',
  },
];

async function seedTestUsers() {
  console.log('\n🧪 Seeding test users...\n');

  try {
    await initializeDatabase();
    const pool = getPool();

    // Get default outlet
    const [outlets] = await pool.query('SELECT id FROM outlets LIMIT 1');
    const outletId = outlets.length > 0 ? outlets[0].id : null;

    // Get roles
    const [roles] = await pool.query('SELECT id, slug FROM roles WHERE is_active = 1');
    const roleMap = roles.reduce((acc, r) => {
      acc[r.slug] = r.id;
      return acc;
    }, {});

    for (const userData of testUsers) {
      // Check if user already exists
      const [existing] = await pool.query(
        'SELECT id FROM users WHERE email = ? OR employee_code = ?',
        [userData.email, userData.employeeCode]
      );

      if (existing.length > 0) {
        console.log(`  ⏭ User ${userData.email} already exists, skipping`);
        continue;
      }

      // Hash password and PIN
      const passwordHash = await bcrypt.hash(userData.password, SALT_ROUNDS);
      const pinHash = await bcrypt.hash(userData.pin, SALT_ROUNDS);

      // Insert user
      const [result] = await pool.query(
        `INSERT INTO users 
         (uuid, employee_code, name, email, phone, password_hash, pin_hash, is_active, is_verified)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1)`,
        [
          uuidv4(),
          userData.employeeCode,
          userData.name,
          userData.email,
          userData.phone,
          passwordHash,
          pinHash,
        ]
      );

      const userId = result.insertId;

      // Assign role
      const roleId = roleMap[userData.role];
      if (roleId) {
        await pool.query(
          'INSERT INTO user_roles (user_id, role_id, outlet_id) VALUES (?, ?, ?)',
          [userId, roleId, outletId]
        );
      }

      console.log(`  ✓ Created: ${userData.name} (${userData.email})`);
      console.log(`    - Role: ${userData.role}`);
      console.log(`    - Employee Code: ${userData.employeeCode}`);
      console.log(`    - Password: ${userData.password}`);
      console.log(`    - PIN: ${userData.pin}`);
      console.log('');
    }

    console.log('✅ Test users seeded successfully!\n');

    // Print summary
    console.log('='.repeat(60));
    console.log('TEST USER CREDENTIALS SUMMARY');
    console.log('='.repeat(60));
    console.log('\n📧 Email Login (use email + password):');
    console.log('-'.repeat(60));
    console.log('| Role       | Email                    | Password      |');
    console.log('-'.repeat(60));
    console.log('| Admin      | admin@restropos.com      | admin123      |');
    testUsers.forEach(u => {
      const role = u.role.padEnd(10);
      const email = u.email.padEnd(24);
      const pass = u.password.padEnd(13);
      console.log(`| ${role} | ${email} | ${pass} |`);
    });
    console.log('-'.repeat(60));

    console.log('\n🔢 PIN Login (use employee code + PIN + outlet ID):');
    console.log('-'.repeat(60));
    console.log('| Role       | Emp Code | PIN  |');
    console.log('-'.repeat(60));
    console.log('| Admin      | EMP0001  | 1234 |');
    testUsers.forEach(u => {
      const role = u.role.padEnd(10);
      const code = u.employeeCode.padEnd(8);
      console.log(`| ${role} | ${code} | ${u.pin} |`);
    });
    console.log('-'.repeat(60));
    console.log(`\nOutlet ID for PIN login: ${outletId || 1}\n`);

  } catch (error) {
    console.error('❌ Failed to seed test users:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

seedTestUsers();
