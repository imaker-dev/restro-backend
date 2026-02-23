# RestroPOS - Complete Testing Strategy

## Overview
This document outlines the complete testing strategy for RestroPOS application, including what data needs to be cleared for fresh testing, and safe approaches for production deployment.

---

## Option 1: NEW TEST DATABASE (RECOMMENDED)

### Why This is Best
- **Zero risk** to production data
- Complete isolation
- Can test destructive scenarios freely
- Easy to reset and re-test

### Setup Steps

```bash
# 1. Create new test database
mysql -u root -p
CREATE DATABASE restro_pos_test;

# 2. Create .env.test file
cp .env .env.test

# 3. Edit .env.test - change database name
DB_NAME=restro_pos_test

# 4. Run migrations on test database
NODE_ENV=test npm run migrate

# 5. Seed initial data (roles, permissions, admin)
NODE_ENV=test npm run seed
```

### Test Environment Variables
```env
NODE_ENV=test
DB_NAME=restro_pos_test
PORT=3001  # Different port for test server
```

---

## Option 2: NEW OUTLET IN EXISTING DATABASE

### Why This Works
- Each outlet is isolated
- Users, orders, tables, menus are outlet-specific
- Can test fresh flow without affecting other outlets

### Steps
1. Create new admin user
2. Create new outlet
3. Setup outlet from scratch (floors, tables, menu, staff)
4. Test complete flow

### Data That IS Outlet-Specific (Safe to Create Fresh)
| Entity | Isolated per Outlet |
|--------|---------------------|
| Floors | ✅ Yes |
| Sections | ✅ Yes |
| Tables | ✅ Yes |
| Kitchen Stations | ✅ Yes |
| Menu Categories | ✅ Yes |
| Menu Items | ✅ Yes |
| Orders | ✅ Yes |
| KOTs | ✅ Yes |
| Bills | ✅ Yes |
| Printers | ✅ Yes |
| User Assignments | ✅ Yes |

### Data That IS Shared (Be Careful)
| Entity | Shared |
|--------|--------|
| Users | ⚠️ Can be multi-outlet |
| Roles | ⚠️ System-wide |
| Permissions | ⚠️ System-wide |
| System Settings | ⚠️ Some are global |
| Tax Groups | ⚠️ Can be shared |

---

## Option 3: RESET SPECIFIC OUTLET DATA

### Tables to Clear for Fresh Testing (Per Outlet)

```sql
-- ⚠️ DANGER: Only run on TEST database or with WHERE outlet_id = X

-- 1. TRANSACTIONAL DATA (Clear First - Has Dependencies)
DELETE FROM order_item_addons WHERE order_item_id IN (SELECT id FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE outlet_id = ?));
DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE outlet_id = ?);
DELETE FROM kot_items WHERE kot_id IN (SELECT id FROM kot_tickets WHERE outlet_id = ?);
DELETE FROM kot_tickets WHERE outlet_id = ?;
DELETE FROM bills WHERE outlet_id = ?;
DELETE FROM payments WHERE outlet_id = ?;
DELETE FROM orders WHERE outlet_id = ?;

-- 2. USER ASSIGNMENTS (Per Outlet)
DELETE FROM user_floors WHERE outlet_id = ?;
DELETE FROM user_sections WHERE outlet_id = ?;
DELETE FROM user_stations WHERE outlet_id = ?;
DELETE FROM user_roles WHERE outlet_id = ?;

-- 3. LAYOUT DATA
DELETE FROM floor_sections WHERE floor_id IN (SELECT id FROM floors WHERE outlet_id = ?);
DELETE FROM tables WHERE floor_id IN (SELECT id FROM floors WHERE outlet_id = ?);
DELETE FROM floors WHERE outlet_id = ?;
DELETE FROM sections WHERE outlet_id = ?;
DELETE FROM kitchen_stations WHERE outlet_id = ?;

-- 4. MENU DATA
DELETE FROM menu_item_variants WHERE menu_item_id IN (SELECT id FROM menu_items WHERE outlet_id = ?);
DELETE FROM menu_item_addons WHERE menu_item_id IN (SELECT id FROM menu_items WHERE outlet_id = ?);
DELETE FROM menu_items WHERE outlet_id = ?;
DELETE FROM categories WHERE outlet_id = ?;

-- 5. PRINTERS
DELETE FROM print_jobs WHERE outlet_id = ?;
DELETE FROM printers WHERE outlet_id = ?;

-- 6. SETTINGS (Per Outlet)
DELETE FROM system_settings WHERE outlet_id = ?;

-- 7. REPORTS (Aggregated Data)
DELETE FROM daily_reports WHERE outlet_id = ?;

-- 8. RESET SEQUENCES
UPDATE outlets SET 
  invoice_sequence = 1, 
  kot_sequence = 1 
WHERE id = ?;
```

---

## Complete Testing Checklist

### Phase 1: Setup & Configuration

#### 1.1 Admin Setup
- [ ] Create super admin user
- [ ] Login as admin
- [ ] Verify JWT token generation
- [ ] Verify refresh token

#### 1.2 Outlet Setup
- [ ] Create new outlet with all details
- [ ] Set outlet logo
- [ ] Configure GSTIN, FSSAI
- [ ] Set opening/closing hours
- [ ] Configure timezone

#### 1.3 Tax Configuration
- [ ] Create tax groups (GST 5%, 12%, 18%)
- [ ] Create tax types (CGST, SGST, IGST)
- [ ] Link taxes to outlet

### Phase 2: Layout Setup

#### 2.1 Floors
- [ ] Create Ground Floor
- [ ] Create First Floor (if needed)
- [ ] Create Terrace/Rooftop (if needed)

#### 2.2 Sections
- [ ] Create AC Section
- [ ] Create Non-AC Section
- [ ] Create Bar Section
- [ ] Create Outdoor Section
- [ ] Link sections to floors

#### 2.3 Tables
- [ ] Create tables for each floor/section
- [ ] Set table capacity
- [ ] Verify table numbering
- [ ] Test table status (available → occupied → running → billing)

#### 2.4 Kitchen Stations
- [ ] Create Main Kitchen station
- [ ] Create Bar station
- [ ] Create Dessert station (if needed)
- [ ] Link stations to printers

### Phase 3: Menu Setup

#### 3.1 Categories
- [ ] Create food categories (Starters, Main Course, etc.)
- [ ] Create beverage categories
- [ ] Set display order
- [ ] Set service types (dine_in, takeaway, delivery)

#### 3.2 Menu Items
- [ ] Create menu items with images
- [ ] Set variants (sizes, options)
- [ ] Set addons (extra cheese, etc.)
- [ ] Set prices
- [ ] Link to kitchen stations
- [ ] Set item type (veg/non-veg/egg)
- [ ] Set availability

### Phase 4: Staff Setup

#### 4.1 Users
- [ ] Create Manager user
- [ ] Create Captain users (3-5)
- [ ] Create Cashier user
- [ ] Create Kitchen staff users
- [ ] Create Bar staff users

#### 4.2 Role Assignments
- [ ] Assign roles to users
- [ ] Verify role permissions
- [ ] Test role-based access

#### 4.3 Floor/Station Assignments
- [ ] Assign captains to floors
- [ ] Assign kitchen staff to stations
- [ ] Verify assignment restrictions

### Phase 5: Printer Setup

#### 5.1 Printers
- [ ] Add KOT printer (Kitchen)
- [ ] Add KOT printer (Bar)
- [ ] Add Bill printer (Cashier)
- [ ] Test printer connectivity
- [ ] Link printers to stations

### Phase 6: Order Flow Testing

#### 6.1 Dine-in Order
- [ ] Captain selects table
- [ ] Add items to order
- [ ] Send KOT to kitchen
- [ ] Kitchen accepts KOT
- [ ] Kitchen marks items preparing
- [ ] Kitchen marks items ready
- [ ] Captain marks served
- [ ] Cashier generates bill
- [ ] Payment processing
- [ ] Table released

#### 6.2 Takeaway Order
- [ ] Create takeaway order
- [ ] Add customer details
- [ ] Send KOT
- [ ] Process and bill
- [ ] Payment

#### 6.3 Delivery Order
- [ ] Create delivery order
- [ ] Add delivery address
- [ ] Process order
- [ ] Mark dispatched
- [ ] Mark delivered

#### 6.4 Multiple KOT Scenarios
- [ ] Single order, multiple KOTs (kitchen + bar)
- [ ] Add items after initial KOT
- [ ] Modify quantity
- [ ] Cancel items before KOT
- [ ] Cancel items after KOT

### Phase 7: Special Scenarios

#### 7.1 Table Operations
- [ ] Table merge
- [ ] Table transfer
- [ ] Table split bill

#### 7.2 Order Modifications
- [ ] Add discount (percentage)
- [ ] Add discount (fixed amount)
- [ ] Add service charge
- [ ] Modify item quantity
- [ ] Remove item

#### 7.3 Payment Scenarios
- [ ] Cash payment
- [ ] Card payment
- [ ] UPI payment
- [ ] Split payment
- [ ] Partial payment

#### 7.4 Cancellation
- [ ] Cancel item before KOT
- [ ] Cancel item after KOT (with reason)
- [ ] Cancel entire order
- [ ] Cancel bill
- [ ] Void transaction

### Phase 8: Reports Testing

#### 8.1 Sales Reports
- [ ] Daily sales report
- [ ] Item-wise sales
- [ ] Category-wise sales
- [ ] Hourly breakdown
- [ ] Payment method breakdown

#### 8.2 KOT Reports
- [ ] Pending KOTs
- [ ] KOT timing report
- [ ] Station-wise KOT count

#### 8.3 Staff Reports
- [ ] Captain sales report
- [ ] Cashier collection report
- [ ] Staff attendance

### Phase 9: Real-time Testing

#### 9.1 Socket Events
- [ ] KOT created → Kitchen receives
- [ ] KOT accepted → Captain notified
- [ ] Item ready → Captain notified
- [ ] KOT ready → Captain notified
- [ ] Order update → All roles notified
- [ ] Table status change → All notified

#### 9.2 Multi-device Testing
- [ ] Multiple captains on same floor
- [ ] Kitchen and captain coordination
- [ ] Cashier and captain coordination

---

## Production Deployment Strategy

### Pre-Production Checklist
1. **Backup existing database** (if any)
2. Create production database
3. Run all migrations
4. Seed roles and permissions
5. Create super admin
6. Configure production environment variables

### Environment Variables for Production
```env
NODE_ENV=production
DB_NAME=restro_pos_prod
JWT_SECRET=<strong-random-secret>
# ... other production configs
```

### Deployment Steps
1. Deploy backend to production server
2. Run migrations: `npm run migrate`
3. Seed initial data: `npm run seed`
4. Create admin user via API or seed
5. Configure outlet via admin panel
6. Test all critical flows
7. Go live

---

## Quick Reset Script (For Test Database Only)

Create file: `scripts/reset-outlet.js`

```javascript
// ⚠️ DANGER: Only use on TEST database
// Usage: node scripts/reset-outlet.js <outletId>

require('dotenv').config();
const { initializeDatabase, getPool } = require('../src/database');

async function resetOutlet(outletId) {
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ Cannot reset in production!');
    process.exit(1);
  }
  
  await initializeDatabase();
  const pool = getPool();
  
  console.log(`Resetting outlet ${outletId}...`);
  
  // Delete in correct order (foreign key dependencies)
  const queries = [
    'DELETE FROM order_item_addons WHERE order_item_id IN (SELECT id FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE outlet_id = ?))',
    'DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE outlet_id = ?)',
    'DELETE FROM kot_items WHERE kot_id IN (SELECT id FROM kot_tickets WHERE outlet_id = ?)',
    'DELETE FROM kot_tickets WHERE outlet_id = ?',
    'DELETE FROM payments WHERE outlet_id = ?',
    'DELETE FROM bills WHERE outlet_id = ?',
    'DELETE FROM orders WHERE outlet_id = ?',
    'DELETE FROM print_jobs WHERE outlet_id = ?',
    'UPDATE outlets SET invoice_sequence = 1, kot_sequence = 1 WHERE id = ?'
  ];
  
  for (const q of queries) {
    await pool.query(q, [outletId]);
  }
  
  console.log('✅ Outlet reset complete!');
  await pool.end();
}

const outletId = process.argv[2];
if (!outletId) {
  console.error('Usage: node scripts/reset-outlet.js <outletId>');
  process.exit(1);
}

resetOutlet(outletId).catch(console.error);
```

---

## Recommended Approach

### For Your Case (Fresh Testing from Scratch)

**BEST OPTION: Create New Test Database**

```bash
# 1. Create test database
mysql -u root -p -e "CREATE DATABASE restro_pos_test;"

# 2. Copy and modify .env
cp .env .env.test
# Edit DB_NAME=restro_pos_test

# 3. Run migrations
cross-env NODE_ENV=test npm run migrate

# 4. Seed data
cross-env NODE_ENV=test npm run seed

# 5. Start test server
cross-env NODE_ENV=test npm run dev
```

This way:
- ✅ Production data is 100% safe
- ✅ Can test everything from scratch
- ✅ Can reset anytime
- ✅ Multiple test cycles possible

---

## Summary

| Approach | Risk | Effort | Recommended |
|----------|------|--------|-------------|
| New Test DB | None | Low | ✅ **Best** |
| New Outlet | Low | Medium | ✅ Good |
| Reset Outlet | Medium | Low | ⚠️ Careful |
| Reset Prod DB | **HIGH** | Low | ❌ Never |

