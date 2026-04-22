/**
 * License & Activation Service
 * 
 * Handles:
 * - Token validation (offline, using embedded public key)
 * - System activation (create admin user, mark as activated)
 * - Activation status checks
 * 
 * Flow:
 * 1. Restaurant installs free version → system is NOT activated
 * 2. Flutter app calls GET /api/v1/activation/status → { activated: false }
 * 3. Restaurant enters activation token in Flutter
 * 4. Flutter calls POST /api/v1/activation/activate { token }
 * 5. Backend validates token signature, creates admin user, seeds data
 * 6. Returns { activated: true, adminEmail } 
 * 7. Restaurant logs in with admin email + password (given by imaker)
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const { getPool } = require('../../src/database');
const logger = require('../../src/utils/logger');

const SALT_ROUNDS = 12;

// Public key — embedded in the binary for offline verification
// This is loaded at startup from the public.key file
let PUBLIC_KEY = null;

const loadPublicKey = () => {
  if (PUBLIC_KEY) return PUBLIC_KEY;
  
  // Try multiple paths (development vs packaged binary)
  const keyPaths = [
    path.join(__dirname, 'public.key'),
    path.join(process.cwd(), 'license', 'public.key'),
    path.join(process.cwd(), 'public.key'),
  ];
  
  for (const keyPath of keyPaths) {
    if (fs.existsSync(keyPath)) {
      PUBLIC_KEY = fs.readFileSync(keyPath, 'utf8');
      return PUBLIC_KEY;
    }
  }
  
  throw new Error('Public key not found. Installation may be corrupted.');
};

/**
 * Verify an activation token's signature
 * @param {string} token - The activation token (base64url payload + signature)
 * @returns {{ valid: boolean, payload: object|null, error: string|null }}
 */
const verifyToken = (token) => {
  try {
    const publicKey = loadPublicKey();
    
    // Token format: <base64url_payload>.<base64url_signature>
    const parts = token.trim().split('.');
    if (parts.length !== 2) {
      return { valid: false, payload: null, error: 'Invalid token format' };
    }
    
    const [payloadB64, signatureB64] = parts;
    
    // Decode payload
    const payloadStr = Buffer.from(payloadB64, 'base64url').toString('utf8');
    let payload;
    try {
      payload = JSON.parse(payloadStr);
    } catch {
      return { valid: false, payload: null, error: 'Invalid token data' };
    }
    
    // Verify signature
    const verify = crypto.createVerify('SHA256');
    verify.update(payloadStr);
    verify.end();
    
    const isValid = verify.verify(publicKey, signatureB64, 'base64url');
    if (!isValid) {
      return { valid: false, payload: null, error: 'Invalid token signature. Token may be tampered.' };
    }
    
    // Check version
    if (payload.v !== 1) {
      return { valid: false, payload: null, error: 'Unsupported token version' };
    }
    
    // Check expiry (null = lifetime)
    if (payload.expiresAt && new Date(payload.expiresAt) < new Date()) {
      return { valid: false, payload: null, error: 'Token has expired' };
    }
    
    // Validate required fields — activation tokens need email/password/restaurant,
    // upgrade tokens need upgradeOf instead
    if (!payload.lid) {
      return { valid: false, payload: null, error: 'Token is missing license ID' };
    }
    const isUpgradeToken = !!payload.upgradeOf;
    if (!isUpgradeToken && (!payload.email || !payload.password || !payload.restaurant)) {
      return { valid: false, payload: null, error: 'Token is missing required fields' };
    }
    
    return { valid: true, payload, error: null };
  } catch (err) {
    logger.error('Token verification failed:', err);
    return { valid: false, payload: null, error: 'Token verification failed: ' + err.message };
  }
};

/**
 * Check if the system is activated
 * @returns {{ activated: boolean, restaurant: string|null, adminEmail: string|null, licenseId: string|null }}
 */
const getActivationStatus = async () => {
  try {
    const pool = getPool();
    
    // Check if activation_info table exists and has a record
    const [tables] = await pool.query(
      `SELECT TABLE_NAME FROM information_schema.TABLES 
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'activation_info'`
    );
    
    if (tables.length === 0) {
      return { activated: false, restaurant: null, adminEmail: null, licenseId: null };
    }
    
    const [rows] = await pool.query('SELECT * FROM activation_info LIMIT 1');
    if (rows.length === 0) {
      return { activated: false, restaurant: null, adminEmail: null, licenseId: null };
    }
    
    const info = rows[0];
    return {
      activated: info.is_activated === 1,
      restaurant: info.restaurant_name,
      adminEmail: info.admin_email,
      licenseId: info.license_id,
      activatedAt: info.activated_at,
      plan: info.plan || 'free',
      maxOutlets: info.max_outlets || 1,
    };
  } catch (err) {
    // If DB not ready or table doesn't exist
    logger.warn('Activation status check failed:', err.message);
    return { activated: false, restaurant: null, adminEmail: null, licenseId: null };
  }
};

/**
 * Activate the system with a token
 * - Validates token
 * - Creates activation_info table
 * - Runs seed (roles, permissions, etc.)
 * - Creates admin user with email/password from token
 * 
 * @param {string} token - Activation token
 * @returns {{ success: boolean, adminEmail: string|null, error: string|null }}
 */
const activate = async (token) => {
  // 1. Verify token
  const { valid, payload, error } = verifyToken(token);
  if (!valid) {
    return { success: false, adminEmail: null, error };
  }
  
  const pool = getPool();
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    // 2. Check if already activated
    const [existingTables] = await connection.query(
      `SELECT TABLE_NAME FROM information_schema.TABLES 
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'activation_info'`
    );
    
    if (existingTables.length > 0) {
      const [existing] = await connection.query('SELECT * FROM activation_info WHERE is_activated = 1 LIMIT 1');
      if (existing.length > 0) {
        await connection.rollback();
        return { success: false, adminEmail: existing[0].admin_email, error: 'System is already activated' };
      }
    }
    
    // 3a. Check used_token_hashes (strongest replay guard — survives DB wipe of activation_info)
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    try {
      const [usedHash] = await connection.query(
        'SELECT id FROM used_token_hashes WHERE token_hash = ?', [tokenHash]
      );
      if (usedHash.length > 0) {
        await connection.rollback();
        return { success: false, adminEmail: null, error: 'This activation token has already been used' };
      }
    } catch (_) {
      // used_token_hashes may not exist yet on very first boot — safe to continue
    }

    // 3b. Check if this license ID was already used (prevent token reuse on different installs)
    if (existingTables.length > 0) {
      const [usedLicense] = await connection.query(
        'SELECT license_id FROM activation_info WHERE license_id = ?', [payload.lid]
      );
      if (usedLicense.length > 0) {
        await connection.rollback();
        return { success: false, adminEmail: null, error: 'This activation token has already been used' };
      }
    }
    
    // 4. Create activation_info table (migration 060 already creates it on startup,
    //    but keep this as a safety net for edge cases)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS activation_info (
        id INT AUTO_INCREMENT PRIMARY KEY,
        license_id VARCHAR(36) NOT NULL UNIQUE,
        plan VARCHAR(20) NOT NULL DEFAULT 'free',
        module_captain TINYINT(1) NOT NULL DEFAULT 0,
        module_inventory TINYINT(1) NOT NULL DEFAULT 0,
        module_advanced_reports TINYINT(1) NOT NULL DEFAULT 0,
        restaurant_name VARCHAR(255) NOT NULL,
        admin_email VARCHAR(255) NOT NULL,
        contact_phone VARCHAR(20),
        max_outlets INT DEFAULT 1,
        max_users INT NOT NULL DEFAULT 10,
        is_activated TINYINT(1) DEFAULT 1,
        activated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        token_hash VARCHAR(64) NOT NULL,
        upgraded_from VARCHAR(36) DEFAULT NULL,
        upgraded_at DATETIME DEFAULT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    
    // 5. Store activation record (hash the token, don't store it raw)
    await connection.query(
      `INSERT INTO activation_info (license_id, plan, restaurant_name, admin_email, contact_phone, max_outlets, is_activated, token_hash)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
      [payload.lid, payload.plan || 'free', payload.restaurant, payload.email, payload.phone, payload.maxOutlets || 1, tokenHash]
    );

    // 5a. Record token hash in used_token_hashes to prevent replay on any future install
    try {
      await connection.query(
        `CREATE TABLE IF NOT EXISTS used_token_hashes (
          id INT AUTO_INCREMENT PRIMARY KEY,
          token_hash VARCHAR(64) NOT NULL UNIQUE,
          token_type ENUM('activation', 'upgrade') NOT NULL DEFAULT 'activation',
          license_id VARCHAR(36) NOT NULL,
          applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_token_hash (token_hash)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
      );
      await connection.query(
        `INSERT IGNORE INTO used_token_hashes (token_hash, token_type, license_id) VALUES (?, 'activation', ?)`,
        [tokenHash, payload.lid]
      );
    } catch (hashErr) {
      // Non-fatal — activation_info already stores the hash; log and continue
      logger.warn('[License] Could not record token hash in used_token_hashes:', hashErr.message);
    }
    
    // 6. Seed all mandatory base data
    await seedAllBaseData(connection);
    
    // 7. Create admin user
    const passwordHash = await bcrypt.hash(payload.password, SALT_ROUNDS);
    const pinHash = await bcrypt.hash('1234', SALT_ROUNDS); // default PIN
    const uuid = crypto.randomUUID();
    
    // Check if admin email already exists
    const [existingUser] = await connection.query(
      'SELECT id FROM users WHERE email = ? AND deleted_at IS NULL', [payload.email]
    );
    
    let adminUserId;
    if (existingUser.length > 0) {
      adminUserId = existingUser[0].id;
      await connection.query(
        'UPDATE users SET password_hash = ?, name = ?, is_active = 1, is_verified = 1 WHERE id = ?',
        [passwordHash, 'Admin', adminUserId]
      );
    } else {
      const [result] = await connection.query(
        `INSERT INTO users (uuid, employee_code, name, email, phone, password_hash, pin_hash, is_active, is_verified)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1)`,
        [uuid, 'ADMIN001', 'Admin', payload.email, payload.phone, passwordHash, pinHash]
      );
      adminUserId = result.insertId;
    }
    
    // 8. Create default outlet from restaurant info in token
    const outletUuid = crypto.randomUUID();
    const outletCode = payload.restaurant
      .replace(/[^a-zA-Z0-9]/g, '')
      .substring(0, 8)
      .toUpperCase() || 'OUTLET1';
    
    const [outletResult] = await connection.query(
      `INSERT INTO outlets (uuid, code, name, legal_name, phone, email, outlet_type,
        currency_code, timezone, is_active, created_by)
       VALUES (?, ?, ?, ?, ?, ?, 'restaurant', 'INR', 'Asia/Kolkata', 1, ?)`,
      [outletUuid, outletCode, payload.restaurant, payload.restaurant,
       payload.phone, payload.email, adminUserId]
    );
    const outletId = outletResult.insertId;
    logger.info(`  Default outlet created: id=${outletId}, name=${payload.restaurant}`);

    // 9. Create a default floor + table for the outlet
    const [floorResult] = await connection.query(
      `INSERT INTO floors (outlet_id, name, floor_number, display_order, is_active)
       VALUES (?, 'Ground Floor', 0, 1, 1)`,
      [outletId]
    );
    const floorId = floorResult.insertId;

    await connection.query(
      `INSERT INTO tables (outlet_id, floor_id, table_number, capacity, status, is_active)
       VALUES (?, ?, 'T1', 4, 'available', 1)`,
      [outletId, floorId]
    );
    logger.info(`  Default floor and table created for outlet ${outletId}`);

    // 10. Assign admin role WITH outlet_id (required for login)
    const [adminRole] = await connection.query("SELECT id FROM roles WHERE slug = 'admin'");
    
    if (adminRole.length > 0) {
      await connection.query(
        `INSERT IGNORE INTO user_roles (user_id, role_id, outlet_id, is_active, assigned_by) VALUES (?, ?, ?, 1, ?)`,
        [adminUserId, adminRole[0].id, outletId, adminUserId]
      );
    }
    
    await connection.commit();
    
    logger.info(`System activated: license=${payload.lid}, restaurant=${payload.restaurant}, admin=${payload.email}`);
    
    return {
      success: true,
      adminEmail: payload.email,
      restaurant: payload.restaurant,
      licenseId: payload.lid,
      error: null,
    };
    
  } catch (err) {
    await connection.rollback();
    logger.error('Activation failed:', err);
    return { success: false, adminEmail: null, error: 'Activation failed: ' + err.message };
  } finally {
    connection.release();
  }
};

/**
 * Seed ALL mandatory base data on activation (idempotent).
 * After this, the restaurant just creates outlet + menu and starts using.
 * 
 * Seeds: roles, permissions, role-permission assignments, tax types,
 *        tax components, cancel reasons, system settings.
 * 
 * NOTE: No super_admin role in free version — admin is the highest role.
 */
const seedAllBaseData = async (connection) => {
  logger.info('Seeding base data...');

  // ── 1. ROLES (no super_admin, no owner) ──
  const roles = [
    { name: 'Admin', slug: 'admin', description: 'Full admin access', is_system_role: true, priority: 100 },
    { name: 'Manager', slug: 'manager', description: 'Manager level access', is_system_role: true, priority: 90 },
    { name: 'Captain', slug: 'captain', description: 'Captain/Waiter access', is_system_role: true, priority: 70 },
    { name: 'Cashier', slug: 'cashier', description: 'Cashier access', is_system_role: true, priority: 70 },
    { name: 'Kitchen', slug: 'kitchen', description: 'Kitchen display access', is_system_role: true, priority: 50 },
    { name: 'Bartender', slug: 'bartender', description: 'Bar access', is_system_role: true, priority: 50 },
    { name: 'Waiter', slug: 'waiter', description: 'Waiter access', is_system_role: true, priority: 40 },
    { name: 'Inventory', slug: 'inventory', description: 'Inventory management', is_system_role: true, priority: 60 },
  ];
  for (const role of roles) {
    await connection.query(
      `INSERT IGNORE INTO roles (name, slug, description, is_system_role, priority, is_active) VALUES (?, ?, ?, ?, ?, 1)`,
      [role.name, role.slug, role.description, role.is_system_role, role.priority]
    );
  }
  logger.info('  Roles seeded');

  // ── 2. PERMISSIONS ──
  const PERMISSIONS = [
    // Table Management
    { slug: 'TABLE_VIEW', name: 'View Tables', module: 'table', category: 'tables', order: 1 },
    { slug: 'TABLE_CREATE', name: 'Create Tables', module: 'table', category: 'tables', order: 2 },
    { slug: 'TABLE_EDIT', name: 'Edit Tables', module: 'table', category: 'tables', order: 3 },
    { slug: 'TABLE_DELETE', name: 'Delete Tables', module: 'table', category: 'tables', order: 4 },
    { slug: 'TABLE_MERGE', name: 'Merge Tables', module: 'table', category: 'tables', order: 5 },
    { slug: 'TABLE_TRANSFER', name: 'Transfer Tables', module: 'table', category: 'tables', order: 6 },
    // Order Management
    { slug: 'ORDER_VIEW', name: 'View Orders', module: 'order', category: 'orders', order: 1 },
    { slug: 'ORDER_CREATE', name: 'Create Orders', module: 'order', category: 'orders', order: 2 },
    { slug: 'ORDER_MODIFY', name: 'Modify Orders', module: 'order', category: 'orders', order: 3 },
    { slug: 'ORDER_CANCEL', name: 'Cancel Orders', module: 'order', category: 'orders', order: 4 },
    { slug: 'ORDER_VOID', name: 'Void Orders', module: 'order', category: 'orders', order: 5 },
    { slug: 'ORDER_REOPEN', name: 'Reopen Closed Orders', module: 'order', category: 'orders', order: 6 },
    // KOT
    { slug: 'KOT_SEND', name: 'Send KOT', module: 'kot', category: 'kitchen', order: 1 },
    { slug: 'KOT_MODIFY', name: 'Modify KOT', module: 'kot', category: 'kitchen', order: 2 },
    { slug: 'KOT_CANCEL', name: 'Cancel KOT', module: 'kot', category: 'kitchen', order: 3 },
    { slug: 'KOT_REPRINT', name: 'Reprint KOT', module: 'kot', category: 'kitchen', order: 4 },
    // Billing
    { slug: 'BILL_VIEW', name: 'View Bills', module: 'billing', category: 'billing', order: 1 },
    { slug: 'BILL_GENERATE', name: 'Generate Bill', module: 'billing', category: 'billing', order: 2 },
    { slug: 'BILL_REPRINT', name: 'Reprint Bill', module: 'billing', category: 'billing', order: 3 },
    { slug: 'BILL_CANCEL', name: 'Cancel Bill', module: 'billing', category: 'billing', order: 4 },
    // Payment
    { slug: 'PAYMENT_COLLECT', name: 'Collect Payment', module: 'payment', category: 'billing', order: 5 },
    { slug: 'PAYMENT_REFUND', name: 'Process Refund', module: 'payment', category: 'billing', order: 6 },
    { slug: 'PAYMENT_SPLIT', name: 'Split Payment', module: 'payment', category: 'billing', order: 7 },
    // Discounts & Charges
    { slug: 'DISCOUNT_APPLY', name: 'Apply Discount', module: 'discount', category: 'pricing', order: 1 },
    { slug: 'DISCOUNT_REMOVE', name: 'Remove Discount', module: 'discount', category: 'pricing', order: 2 },
    { slug: 'DISCOUNT_CUSTOM', name: 'Apply Custom Discount', module: 'discount', category: 'pricing', order: 3 },
    { slug: 'TAX_MODIFY', name: 'Modify Tax', module: 'tax', category: 'pricing', order: 4 },
    { slug: 'SERVICE_CHARGE_MODIFY', name: 'Modify Service Charge', module: 'charge', category: 'pricing', order: 5 },
    { slug: 'TIP_ADD', name: 'Add Tips', module: 'tip', category: 'pricing', order: 6 },
    // Item Management
    { slug: 'ITEM_VIEW', name: 'View Menu Items', module: 'item', category: 'menu', order: 1 },
    { slug: 'ITEM_CREATE', name: 'Create Menu Items', module: 'item', category: 'menu', order: 2 },
    { slug: 'ITEM_EDIT', name: 'Edit Menu Items', module: 'item', category: 'menu', order: 3 },
    { slug: 'ITEM_DELETE', name: 'Delete Menu Items', module: 'item', category: 'menu', order: 4 },
    { slug: 'ITEM_CANCEL', name: 'Cancel Order Items', module: 'item', category: 'menu', order: 5 },
    { slug: 'ITEM_PRICING', name: 'Modify Item Pricing', module: 'item', category: 'menu', order: 6 },
    { slug: 'ITEM_AVAILABILITY', name: 'Toggle Item Availability', module: 'item', category: 'menu', order: 7 },
    // Category
    { slug: 'CATEGORY_VIEW', name: 'View Categories', module: 'category', category: 'menu', order: 10 },
    { slug: 'CATEGORY_CREATE', name: 'Create Categories', module: 'category', category: 'menu', order: 11 },
    { slug: 'CATEGORY_EDIT', name: 'Edit Categories', module: 'category', category: 'menu', order: 12 },
    { slug: 'CATEGORY_DELETE', name: 'Delete Categories', module: 'category', category: 'menu', order: 13 },
    // Inventory
    { slug: 'INVENTORY_VIEW', name: 'View Inventory', module: 'inventory', category: 'inventory', order: 1 },
    { slug: 'INVENTORY_EDIT', name: 'Edit Inventory', module: 'inventory', category: 'inventory', order: 2 },
    { slug: 'INVENTORY_ADJUST', name: 'Adjust Stock', module: 'inventory', category: 'inventory', order: 3 },
    { slug: 'INVENTORY_TRANSFER', name: 'Transfer Stock', module: 'inventory', category: 'inventory', order: 4 },
    { slug: 'PURCHASE_ORDER', name: 'Create Purchase Orders', module: 'inventory', category: 'inventory', order: 5 },
    // Staff
    { slug: 'STAFF_VIEW', name: 'View Staff', module: 'staff', category: 'staff', order: 1 },
    { slug: 'STAFF_CREATE', name: 'Create Staff', module: 'staff', category: 'staff', order: 2 },
    { slug: 'STAFF_EDIT', name: 'Edit Staff', module: 'staff', category: 'staff', order: 3 },
    { slug: 'STAFF_DELETE', name: 'Delete Staff', module: 'staff', category: 'staff', order: 4 },
    { slug: 'STAFF_PERMISSIONS', name: 'Manage Staff Permissions', module: 'staff', category: 'staff', order: 5 },
    // Reports
    { slug: 'REPORT_VIEW', name: 'View Reports', module: 'report', category: 'reports', order: 1 },
    { slug: 'REPORT_SALES', name: 'View Sales Reports', module: 'report', category: 'reports', order: 2 },
    { slug: 'REPORT_INVENTORY', name: 'View Inventory Reports', module: 'report', category: 'reports', order: 3 },
    { slug: 'REPORT_STAFF', name: 'View Staff Reports', module: 'report', category: 'reports', order: 4 },
    { slug: 'REPORT_EXPORT', name: 'Export Reports', module: 'report', category: 'reports', order: 5 },
    // Outlet Management
    { slug: 'OUTLET_VIEW', name: 'View Outlets', module: 'outlet', category: 'admin', order: 1 },
    { slug: 'OUTLET_CREATE', name: 'Create Outlets', module: 'outlet', category: 'admin', order: 2 },
    { slug: 'OUTLET_EDIT', name: 'Edit Outlets', module: 'outlet', category: 'admin', order: 3 },
    { slug: 'OUTLET_DELETE', name: 'Delete Outlets', module: 'outlet', category: 'admin', order: 4 },
    { slug: 'OUTLET_SETTINGS', name: 'Manage Outlet Settings', module: 'outlet', category: 'admin', order: 5 },
    // Floor/Section
    { slug: 'FLOOR_VIEW', name: 'View Floors', module: 'floor', category: 'layout', order: 1 },
    { slug: 'FLOOR_CREATE', name: 'Create Floors', module: 'floor', category: 'layout', order: 2 },
    { slug: 'FLOOR_EDIT', name: 'Edit Floors', module: 'floor', category: 'layout', order: 3 },
    { slug: 'FLOOR_DELETE', name: 'Delete Floors', module: 'floor', category: 'layout', order: 4 },
    { slug: 'SECTION_VIEW', name: 'View Sections', module: 'section', category: 'layout', order: 5 },
    { slug: 'SECTION_MANAGE', name: 'Manage Sections', module: 'section', category: 'layout', order: 6 },
    // Printer
    { slug: 'PRINTER_VIEW', name: 'View Printers', module: 'printer', category: 'settings', order: 1 },
    { slug: 'PRINTER_MANAGE', name: 'Manage Printers', module: 'printer', category: 'settings', order: 2 },
    // Settings
    { slug: 'SETTINGS_VIEW', name: 'View Settings', module: 'settings', category: 'settings', order: 10 },
    { slug: 'SETTINGS_EDIT', name: 'Edit Settings', module: 'settings', category: 'settings', order: 11 },
  ];

  const permMap = {};
  for (const p of PERMISSIONS) {
    const [ex] = await connection.query('SELECT id FROM permissions WHERE slug = ?', [p.slug]);
    if (ex.length > 0) {
      permMap[p.slug] = ex[0].id;
    } else {
      const [r] = await connection.query(
        `INSERT INTO permissions (name, slug, module, category, display_order, description, is_active)
         VALUES (?, ?, ?, ?, ?, ?, 1)`,
        [p.name, p.slug, p.module, p.category, p.order, `Permission to ${p.name.toLowerCase()}`]
      );
      permMap[p.slug] = r.insertId;
    }
  }

  // Also seed the old-style module.action permissions (some services check these)
  const oldModules = {
    outlet: ['view', 'create', 'update', 'delete', 'manage_settings'],
    floor: ['view', 'create', 'update', 'delete'],
    section: ['view', 'create', 'update', 'delete'],
    table: ['view', 'create', 'update', 'delete', 'manage_layout'],
    category: ['view', 'create', 'update', 'delete'],
    item: ['view', 'create', 'update', 'delete', 'manage_pricing'],
    variant: ['view', 'create', 'update', 'delete'],
    addon: ['view', 'create', 'update', 'delete'],
    order: ['view', 'create', 'update', 'cancel', 'void', 'transfer', 'merge'],
    kot: ['view', 'create', 'update', 'cancel', 'reprint'],
    billing: ['view', 'create', 'print', 'reprint', 'cancel'],
    payment: ['view', 'collect', 'refund', 'split'],
    discount: ['view', 'create', 'update', 'delete', 'apply', 'approve'],
    tax: ['view', 'create', 'update', 'delete'],
    inventory: ['view', 'create', 'update', 'delete', 'stock_in', 'stock_out', 'wastage'],
    report: ['view', 'export', 'daily', 'sales', 'inventory', 'tax', 'staff'],
    user: ['view', 'create', 'update', 'delete', 'manage_roles'],
    role: ['view', 'create', 'update', 'delete', 'assign'],
    settings: ['view', 'update'],
    printer: ['view', 'create', 'update', 'delete', 'test'],
  };
  for (const [mod, actions] of Object.entries(oldModules)) {
    for (const action of actions) {
      const slug = `${mod}.${action}`;
      const name = `${action.charAt(0).toUpperCase() + action.slice(1).replace('_', ' ')} ${mod}`;
      await connection.query(
        `INSERT IGNORE INTO permissions (name, slug, module, is_active) VALUES (?, ?, ?, 1)`,
        [name, slug, mod]
      );
    }
  }
  logger.info('  Permissions seeded');

  // ── 3. ROLE → PERMISSION ASSIGNMENTS ──
  const ROLE_PERMS = {
    // admin: superuser — has all permissions implicitly (empty = skip assignment)
    manager: [
      'TABLE_VIEW', 'TABLE_CREATE', 'TABLE_EDIT', 'TABLE_DELETE', 'TABLE_MERGE', 'TABLE_TRANSFER',
      'ORDER_VIEW', 'ORDER_CREATE', 'ORDER_MODIFY', 'ORDER_CANCEL', 'ORDER_VOID', 'ORDER_REOPEN',
      'KOT_SEND', 'KOT_MODIFY', 'KOT_CANCEL', 'KOT_REPRINT',
      'BILL_VIEW', 'BILL_GENERATE', 'BILL_REPRINT', 'BILL_CANCEL',
      'PAYMENT_COLLECT', 'PAYMENT_REFUND', 'PAYMENT_SPLIT',
      'DISCOUNT_APPLY', 'DISCOUNT_REMOVE', 'DISCOUNT_CUSTOM', 'TAX_MODIFY', 'SERVICE_CHARGE_MODIFY', 'TIP_ADD',
      'ITEM_VIEW', 'ITEM_CREATE', 'ITEM_EDIT', 'ITEM_DELETE', 'ITEM_CANCEL', 'ITEM_PRICING', 'ITEM_AVAILABILITY',
      'CATEGORY_VIEW', 'CATEGORY_CREATE', 'CATEGORY_EDIT', 'CATEGORY_DELETE',
      'INVENTORY_VIEW', 'INVENTORY_EDIT', 'INVENTORY_ADJUST', 'INVENTORY_TRANSFER',
      'STAFF_VIEW', 'STAFF_CREATE', 'STAFF_EDIT', 'STAFF_DELETE', 'STAFF_PERMISSIONS',
      'REPORT_VIEW', 'REPORT_SALES', 'REPORT_INVENTORY', 'REPORT_STAFF', 'REPORT_EXPORT',
      'FLOOR_VIEW', 'SECTION_VIEW', 'PRINTER_VIEW', 'SETTINGS_VIEW',
    ],
    captain: [
      'TABLE_VIEW', 'TABLE_MERGE', 'TABLE_TRANSFER',
      'ORDER_VIEW', 'ORDER_CREATE', 'ORDER_MODIFY',
      'KOT_SEND', 'KOT_MODIFY', 'KOT_REPRINT',
      'BILL_VIEW', 'BILL_GENERATE', 'BILL_REPRINT',
      'PAYMENT_COLLECT', 'PAYMENT_SPLIT',
      'DISCOUNT_APPLY', 'TIP_ADD',
      'ITEM_VIEW', 'ITEM_CANCEL', 'CATEGORY_VIEW',
      'REPORT_VIEW', 'FLOOR_VIEW', 'SECTION_VIEW',
    ],
    waiter: [
      'TABLE_VIEW', 'ORDER_VIEW', 'ORDER_CREATE', 'ORDER_MODIFY',
      'KOT_SEND', 'BILL_VIEW', 'ITEM_VIEW', 'CATEGORY_VIEW',
      'FLOOR_VIEW', 'SECTION_VIEW',
    ],
    cashier: [
      'TABLE_VIEW', 'TABLE_MERGE', 'TABLE_TRANSFER',
      'ORDER_VIEW', 'ORDER_CREATE', 'ORDER_MODIFY', 'ORDER_CANCEL',
      'KOT_SEND', 'KOT_MODIFY', 'KOT_REPRINT',
      'BILL_VIEW', 'BILL_GENERATE', 'BILL_REPRINT', 'BILL_CANCEL',
      'PAYMENT_COLLECT', 'PAYMENT_SPLIT',
      'DISCOUNT_APPLY', 'DISCOUNT_REMOVE', 'DISCOUNT_CUSTOM', 'TIP_ADD',
      'ITEM_VIEW', 'ITEM_CANCEL', 'ITEM_AVAILABILITY', 'CATEGORY_VIEW',
      'REPORT_VIEW', 'REPORT_SALES', 'REPORT_STAFF',
      'FLOOR_VIEW', 'SECTION_VIEW',
    ],
    kitchen: [
      'ORDER_VIEW', 'KOT_SEND', 'KOT_MODIFY',
      'ITEM_VIEW', 'ITEM_AVAILABILITY', 'CATEGORY_VIEW', 'INVENTORY_VIEW',
    ],
    bartender: [
      'TABLE_VIEW', 'ORDER_VIEW', 'ORDER_CREATE',
      'KOT_SEND', 'ITEM_VIEW', 'ITEM_AVAILABILITY', 'CATEGORY_VIEW', 'INVENTORY_VIEW',
    ],
    inventory: [
      'ITEM_VIEW', 'CATEGORY_VIEW',
      'INVENTORY_VIEW', 'INVENTORY_EDIT', 'INVENTORY_ADJUST', 'INVENTORY_TRANSFER', 'PURCHASE_ORDER',
      'REPORT_VIEW', 'REPORT_INVENTORY',
    ],
  };

  for (const [roleSlug, permSlugs] of Object.entries(ROLE_PERMS)) {
    const [roleRows] = await connection.query('SELECT id FROM roles WHERE slug = ?', [roleSlug]);
    if (roleRows.length === 0) continue;
    const roleId = roleRows[0].id;
    for (const ps of permSlugs) {
      const pid = permMap[ps];
      if (!pid) continue;
      await connection.query(
        'INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)',
        [roleId, pid]
      );
    }
  }
  logger.info('  Role-permission assignments seeded');

  // ── 4. TAX TYPES ──
  const taxTypes = [
    { name: 'GST', code: 'GST', description: 'Goods and Services Tax' },
    { name: 'VAT', code: 'VAT', description: 'Value Added Tax' },
    { name: 'Service Tax', code: 'SERVICE', description: 'Service Tax' },
  ];
  for (const t of taxTypes) {
    await connection.query(
      `INSERT IGNORE INTO tax_types (name, code, description) VALUES (?, ?, ?)`,
      [t.name, t.code, t.description]
    );
  }
  logger.info('  Tax types seeded');

  // ── 5. TAX COMPONENTS ──
  const [gstType] = await connection.query("SELECT id FROM tax_types WHERE code = 'GST'");
  const [vatType] = await connection.query("SELECT id FROM tax_types WHERE code = 'VAT'");

  if (gstType.length > 0) {
    const gstId = gstType[0].id;
    const gstComps = [
      { name: 'CGST 2.5%', code: 'CGST_2.5', rate: 2.5 },
      { name: 'SGST 2.5%', code: 'SGST_2.5', rate: 2.5 },
      { name: 'CGST 6%', code: 'CGST_6', rate: 6 },
      { name: 'SGST 6%', code: 'SGST_6', rate: 6 },
      { name: 'CGST 9%', code: 'CGST_9', rate: 9 },
      { name: 'SGST 9%', code: 'SGST_9', rate: 9 },
      { name: 'IGST 5%', code: 'IGST_5', rate: 5 },
      { name: 'IGST 12%', code: 'IGST_12', rate: 12 },
      { name: 'IGST 18%', code: 'IGST_18', rate: 18 },
    ];
    for (const c of gstComps) {
      await connection.query(
        `INSERT IGNORE INTO tax_components (tax_type_id, name, code, rate) VALUES (?, ?, ?, ?)`,
        [gstId, c.name, c.code, c.rate]
      );
    }
  }

  if (vatType.length > 0) {
    const vatId = vatType[0].id;
    const vatComps = [
      { name: 'VAT 5%', code: 'VAT_5', rate: 5 },
      { name: 'VAT 12.5%', code: 'VAT_12.5', rate: 12.5 },
      { name: 'VAT 14.5%', code: 'VAT_14.5', rate: 14.5 },
      { name: 'VAT 20%', code: 'VAT_20', rate: 20 },
    ];
    for (const c of vatComps) {
      await connection.query(
        `INSERT IGNORE INTO tax_components (tax_type_id, name, code, rate) VALUES (?, ?, ?, ?)`,
        [vatId, c.name, c.code, c.rate]
      );
    }
  }
  logger.info('  Tax components seeded');

  // ── 6. CANCEL REASONS ──
  const cancelReasons = [
    { type: 'order_cancel', reason: 'Customer cancelled', approval: false },
    { type: 'order_cancel', reason: 'Customer left', approval: false },
    { type: 'order_cancel', reason: 'Duplicate order', approval: false },
    { type: 'order_cancel', reason: 'Item not available', approval: false },
    { type: 'order_cancel', reason: 'Kitchen closed', approval: false },
    { type: 'order_cancel', reason: 'Other', approval: true },
    { type: 'item_cancel', reason: 'Customer changed mind', approval: false },
    { type: 'item_cancel', reason: 'Wrong item ordered', approval: false },
    { type: 'item_cancel', reason: 'Item out of stock', approval: false },
    { type: 'item_cancel', reason: 'Quality issue', approval: true },
    { type: 'item_cancel', reason: 'Preparation delay', approval: false },
    { type: 'void', reason: 'Billing error', approval: true },
    { type: 'void', reason: 'Price correction', approval: true },
    { type: 'void', reason: 'Duplicate billing', approval: true },
    { type: 'return', reason: 'Customer complaint', approval: true },
    { type: 'return', reason: 'Wrong item served', approval: false },
  ];
  for (let i = 0; i < cancelReasons.length; i++) {
    const cr = cancelReasons[i];
    await connection.query(
      `INSERT IGNORE INTO cancel_reasons (reason_type, reason, requires_approval, display_order) VALUES (?, ?, ?, ?)`,
      [cr.type, cr.reason, cr.approval, i]
    );
  }
  logger.info('  Cancel reasons seeded');

  // ── 7. SYSTEM SETTINGS (global defaults) ──
  const settings = [
    { key: 'currency_symbol', value: '₹', type: 'string', desc: 'Currency symbol' },
    { key: 'currency_code', value: 'INR', type: 'string', desc: 'Currency code' },
    { key: 'decimal_places', value: '2', type: 'number', desc: 'Decimal places for amounts' },
    { key: 'date_format', value: 'DD/MM/YYYY', type: 'string', desc: 'Date format' },
    { key: 'time_format', value: 'HH:mm', type: 'string', desc: 'Time format' },
    { key: 'timezone', value: 'Asia/Kolkata', type: 'string', desc: 'Default timezone' },
    { key: 'round_off_enabled', value: 'true', type: 'boolean', desc: 'Enable bill round off' },
    { key: 'round_off_to', value: '1', type: 'number', desc: 'Round off to nearest value' },
    { key: 'kot_auto_print', value: 'true', type: 'boolean', desc: 'Auto print KOT' },
    { key: 'bill_auto_print', value: 'false', type: 'boolean', desc: 'Auto print bill' },
    { key: 'service_charge_enabled', value: 'false', type: 'boolean', desc: 'Enable service charge' },
    { key: 'service_charge_percent', value: '10', type: 'number', desc: 'Service charge percentage' },
    { key: 'gst_enabled', value: 'true', type: 'boolean', desc: 'Enable GST' },
    { key: 'vat_enabled', value: 'false', type: 'boolean', desc: 'Enable VAT' },
    { key: 'allow_negative_stock', value: 'false', type: 'boolean', desc: 'Allow negative stock' },
    { key: 'low_stock_alert_enabled', value: 'true', type: 'boolean', desc: 'Enable low stock alerts' },
  ];
  for (const s of settings) {
    await connection.query(
      `INSERT IGNORE INTO system_settings (setting_key, setting_value, setting_type, description) VALUES (?, ?, ?, ?)`,
      [s.key, s.value, s.type, s.desc]
    );
  }
  logger.info('  System settings seeded');

  logger.info('All base data seeded successfully');
};

/**
 * Get full license status (plan, modules, limits).
 * Used by Flutter LicenseProvider and admin panel.
 * 
 * @returns {{ plan, modules, maxOutlets, maxUsers, licenseId, restaurant }}
 */
const getLicenseStatus = async () => {
  try {
    const pool = getPool();

    const [tables] = await pool.query(
      `SELECT TABLE_NAME FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'activation_info'`
    );
    if (tables.length === 0) {
      return _defaultLicenseStatus();
    }

    const [rows] = await pool.query('SELECT * FROM activation_info WHERE is_activated = 1 LIMIT 1');
    if (rows.length === 0) {
      return _defaultLicenseStatus();
    }

    const info = rows[0];
    return {
      plan: info.plan || 'free',
      modules: {
        captain: info.module_captain === 1,
        inventory: info.module_inventory === 1,
        advancedReports: info.module_advanced_reports === 1,
      },
      maxOutlets: info.max_outlets || 1,
      maxUsers: info.max_users != null ? info.max_users : 10,
      licenseId: info.license_id,
      restaurant: info.restaurant_name,
      activated: true,
    };
  } catch (err) {
    logger.warn('getLicenseStatus failed:', err.message);
    return _defaultLicenseStatus();
  }
};

const _defaultLicenseStatus = () => ({
  plan: 'free',
  modules: { captain: false, inventory: false, advancedReports: false },
  maxOutlets: 1,
  maxUsers: 10,
  licenseId: null,
  restaurant: null,
  activated: false,
});

/**
 * Validate an upgrade token (dry run — no DB changes).
 * 
 * @param {string} token
 * @returns {{ valid: boolean, preview: object|null, error: string|null }}
 */
const validateUpgrade = async (token) => {
  // 1. Verify signature
  const { valid, payload, error } = verifyToken(token);
  if (!valid) {
    return { valid: false, preview: null, error };
  }

  // 2. Must be an upgrade token (has upgradeOf field)
  if (!payload.upgradeOf) {
    return { valid: false, preview: null, error: 'This is not an upgrade token. It appears to be an initial activation token.' };
  }

  // 3. Must target 'pro' plan
  if (payload.plan !== 'pro') {
    return { valid: false, preview: null, error: `Unexpected plan tier: ${payload.plan}` };
  }

  const pool = getPool();

  // 4. Check current license
  const [rows] = await pool.query('SELECT * FROM activation_info WHERE is_activated = 1 LIMIT 1');
  if (rows.length === 0) {
    return { valid: false, preview: null, error: 'System is not activated. Cannot upgrade.' };
  }
  const current = rows[0];

  // 5. upgradeOf must match current license ID
  if (payload.upgradeOf !== current.license_id) {
    return {
      valid: false,
      preview: null,
      error: 'This upgrade token was generated for a different installation. License ID mismatch.',
    };
  }

  // 6. Already pro?
  if (current.plan === 'pro') {
    return { valid: false, preview: null, error: 'System is already on Pro plan.' };
  }

  // 7. Check token replay
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const [usedRows] = await pool.query('SELECT id FROM used_token_hashes WHERE token_hash = ?', [tokenHash]);
  if (usedRows.length > 0) {
    return { valid: false, preview: null, error: 'This token has already been applied. Please contact support for a new token.' };
  }

  return {
    valid: true,
    preview: {
      currentPlan: current.plan,
      newPlan: payload.plan,
      modules: {
        captain: payload.modules?.captain !== false,
        inventory: payload.modules?.inventory !== false,
        advancedReports: payload.modules?.advancedReports !== false,
      },
      maxOutlets: payload.maxOutlets || 3,
      maxUsers: payload.maxUsers != null ? payload.maxUsers : -1,
      restaurant: current.restaurant_name,
      upgradeFrom: current.license_id,
    },
    error: null,
  };
};

/**
 * Apply an upgrade token. Updates license record, logs history.
 * 
 * @param {string} token
 * @param {number} userId - ID of admin who triggered the upgrade
 * @returns {{ success: boolean, data: object|null, error: string|null }}
 */
const applyUpgrade = async (token, userId) => {
  // 1. Full validation first (same checks as dry run)
  const validation = await validateUpgrade(token);
  if (!validation.valid) {
    return { success: false, data: null, error: validation.error };
  }

  const { valid, payload } = verifyToken(token);
  if (!valid) {
    return { success: false, data: null, error: 'Token verification failed on second pass.' };
  }

  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const preview = validation.preview;
    const newLicenseId = payload.lid;

    // 2. Update activation_info
    await connection.query(
      `UPDATE activation_info SET
        plan = ?,
        module_captain = ?,
        module_inventory = ?,
        module_advanced_reports = ?,
        max_outlets = ?,
        max_users = ?,
        upgraded_from = ?,
        upgraded_at = NOW()
      WHERE is_activated = 1`,
      [
        payload.plan,
        preview.modules.captain ? 1 : 0,
        preview.modules.inventory ? 1 : 0,
        preview.modules.advancedReports ? 1 : 0,
        preview.maxOutlets,
        preview.maxUsers,
        preview.upgradeFrom,
      ]
    );

    // 3. Record token hash to prevent replay
    await connection.query(
      `INSERT INTO used_token_hashes (token_hash, token_type, license_id) VALUES (?, 'upgrade', ?)`,
      [tokenHash, newLicenseId]
    );

    // 4. Log upgrade history
    // Create table if it doesn't exist (migration may not have run yet)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS upgrade_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        old_license_id VARCHAR(36) NOT NULL,
        new_license_id VARCHAR(36) NOT NULL,
        old_plan VARCHAR(20) NOT NULL,
        new_plan VARCHAR(20) NOT NULL,
        token_hash VARCHAR(64) NOT NULL,
        upgraded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        upgraded_by_user_id INT DEFAULT NULL,
        payment_reference VARCHAR(100) DEFAULT NULL,
        notes TEXT DEFAULT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_old_license (old_license_id),
        INDEX idx_new_license (new_license_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await connection.query(
      `INSERT INTO upgrade_history (old_license_id, new_license_id, old_plan, new_plan, token_hash, upgraded_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [preview.upgradeFrom, newLicenseId, preview.currentPlan, payload.plan, tokenHash, userId]
    );

    await connection.commit();

    logger.info(`[License] Upgrade applied: ${preview.currentPlan} → ${payload.plan}, by user ${userId}`);

    return {
      success: true,
      data: {
        plan: payload.plan,
        modules: preview.modules,
        maxOutlets: preview.maxOutlets,
        maxUsers: preview.maxUsers,
        licenseId: newLicenseId,
        restaurant: preview.restaurant,
      },
      error: null,
    };
  } catch (err) {
    await connection.rollback();
    logger.error('Upgrade application failed:', err);
    return { success: false, data: null, error: 'Upgrade failed: ' + err.message };
  } finally {
    connection.release();
  }
};

module.exports = {
  verifyToken,
  getActivationStatus,
  activate,
  loadPublicKey,
  getLicenseStatus,
  validateUpgrade,
  applyUpgrade,
};
