# Isolated Testing Guide - New Admin & Outlet from Scratch

## ✅ CAN YOU TEST LIKE THIS? YES!

This guide walks through creating a **completely new admin** with their **own outlet** and full setup, **without affecting existing data**.

---

## Why This Works (No Impact on Existing Data)

| Entity | Isolation Level | Impact |
|--------|-----------------|--------|
| New Admin User | ✅ Separate user record | No impact |
| New Outlet | ✅ Completely isolated | No impact |
| Tax Groups | ✅ Per-outlet | No impact |
| Floors/Sections | ✅ Per-outlet | No impact |
| Tables | ✅ Per-outlet | No impact |
| Staff Users | ✅ Can be outlet-specific | No impact |
| Orders/KOTs/Bills | ✅ Per-outlet | No impact |

**All data is outlet-scoped. Creating a new outlet creates a completely isolated environment.**

---

## Prerequisites

1. Database is running (MySQL)
2. Migrations have been run (`npm run migrate`)
3. Initial seed has been run (`npm run seed`) - this creates `super_admin`
4. Server is running (`npm run dev`)

---

## Step-by-Step Testing Flow

### STEP 1: Login as Super Admin (Existing)

**POST** `/api/v1/auth/login`

```json
{
  "email": "admin@restropos.com",
  "password": "admin123"
}
```

**Save the `accessToken` from response for next steps.**

---

### STEP 2: Create New Admin User

**POST** `/api/v1/users`

**Headers:**
```
Authorization: Bearer <super_admin_token>
Content-Type: application/json
```

**Request:**
```json
{
  "name": "Test Admin",
  "email": "testadmin@newoutlet.com",
  "phone": "+91-9999888877",
  "employeeCode": "TADMIN01",
  "password": "TestAdmin@123",
  "pin": "9999",
  "isVerified": true,
  "roles": [
    {
      "roleId": 2,
      "outletId": null
    }
  ]
}
```

> **Note:** `roleId: 2` is for "admin" role. Use `roleId: 1` for "super_admin".

**Expected Response (201):**
```json
{
  "success": true,
  "message": "User created successfully",
  "data": {
    "id": 2,
    "uuid": "xxx-xxx-xxx",
    "employeeCode": "TADMIN01",
    "name": "Test Admin",
    "email": "testadmin@newoutlet.com",
    "roles": [
      { "id": 2, "name": "Admin", "slug": "admin" }
    ]
  }
}
```

**✅ Verification:** New admin created without affecting existing admin.

---

### STEP 3: Login as New Admin

**POST** `/api/v1/auth/login`

```json
{
  "email": "testadmin@newoutlet.com",
  "password": "TestAdmin@123"
}
```

**Save the new `accessToken` - use this for all subsequent steps.**

---

### STEP 4: Create New Outlet

**POST** `/api/v1/outlets`

**Headers:**
```
Authorization: Bearer <new_admin_token>
```

**Request:**
```json
{
  "name": "Test Outlet",
  "code": "TEST01",
  "legalName": "Test Outlet Pvt Ltd",
  "outletType": "restaurant",
  "addressLine1": "456 Test Street",
  "city": "Bangalore",
  "state": "Karnataka",
  "country": "India",
  "postalCode": "560001",
  "phone": "+91-8888777766",
  "email": "contact@testoutlet.com",
  "gstin": "29AABCT1234R1ZP",
  "fssaiNumber": "98765432109876",
  "currencyCode": "INR",
  "timezone": "Asia/Kolkata",
  "openingTime": "09:00",
  "closingTime": "22:00"
}
```

**Expected Response (201):**
```json
{
  "success": true,
  "message": "Outlet created successfully",
  "data": {
    "id": 2,
    "uuid": "yyy-yyy-yyy",
    "code": "TEST01",
    "name": "Test Outlet",
    "invoiceSequence": 1,
    "kotSequence": 1
  }
}
```

**Save `outletId` (e.g., 2) for next steps.**

**✅ Verification:** New outlet created. Existing outlet (id: 1) unaffected.

---

### STEP 5: Get Tax Components (Pre-seeded)

**GET** `/api/v1/tax/components`

**Expected Response (200):**
```json
{
  "success": true,
  "data": [
    { "id": 1, "name": "CGST 2.5%", "code": "CGST_2.5", "rate": 2.5 },
    { "id": 2, "name": "SGST 2.5%", "code": "SGST_2.5", "rate": 2.5 },
    { "id": 3, "name": "CGST 6%", "code": "CGST_6", "rate": 6 },
    { "id": 4, "name": "SGST 6%", "code": "SGST_6", "rate": 6 },
    { "id": 5, "name": "CGST 9%", "code": "CGST_9", "rate": 9 },
    { "id": 6, "name": "SGST 9%", "code": "SGST_9", "rate": 9 }
  ]
}
```

---

### STEP 6: Create Tax Groups for New Outlet

#### 6.1 Create GST 5%

**POST** `/api/v1/tax/groups`

```json
{
  "name": "GST 5%",
  "code": "GST_5",
  "description": "GST 5% (CGST 2.5% + SGST 2.5%)",
  "outletId": 2,
  "componentIds": [1, 2]
}
```

#### 6.2 Create GST 12%

**POST** `/api/v1/tax/groups`

```json
{
  "name": "GST 12%",
  "code": "GST_12",
  "description": "GST 12% (CGST 6% + SGST 6%)",
  "outletId": 2,
  "componentIds": [3, 4]
}
```

#### 6.3 Create GST 18%

**POST** `/api/v1/tax/groups`

```json
{
  "name": "GST 18%",
  "code": "GST_18",
  "description": "GST 18% (CGST 9% + SGST 9%)",
  "outletId": 2,
  "componentIds": [5, 6]
}
```

**✅ Verification:** Tax groups created for outlet 2 only. Outlet 1 tax groups unaffected.

---

### STEP 7: Create Floors

#### 7.1 Ground Floor

**POST** `/api/v1/outlets/2/floors`

```json
{
  "name": "Ground Floor",
  "code": "GF",
  "floorNumber": 0,
  "displayOrder": 1
}
```

**Response:** `{ "id": X, "name": "Ground Floor" }`

#### 7.2 First Floor

**POST** `/api/v1/outlets/2/floors`

```json
{
  "name": "First Floor",
  "code": "FF",
  "floorNumber": 1,
  "displayOrder": 2
}
```

**Save floor IDs for table creation.**

---

### STEP 8: Create Sections

#### 8.1 AC Section

**POST** `/api/v1/outlets/2/sections`

```json
{
  "name": "AC Section",
  "code": "AC",
  "sectionType": "ac",
  "colorCode": "#2196F3",
  "displayOrder": 1
}
```

#### 8.2 Non-AC Section

**POST** `/api/v1/outlets/2/sections`

```json
{
  "name": "Non-AC Section",
  "code": "NAC",
  "sectionType": "non_ac",
  "colorCode": "#4CAF50",
  "displayOrder": 2
}
```

#### 8.3 Bar Section

**POST** `/api/v1/outlets/2/sections`

```json
{
  "name": "Bar",
  "code": "BAR",
  "sectionType": "bar",
  "colorCode": "#9C27B0",
  "displayOrder": 3
}
```

**Save section IDs for table creation.**

---

### STEP 9: Create Tables

**POST** `/api/v1/tables`

```json
{
  "outletId": 2,
  "floorId": <ground_floor_id>,
  "sectionId": <ac_section_id>,
  "tableNumber": "T1",
  "capacity": 4,
  "shape": "square"
}
```

**Repeat for T2, T3, etc.**

**Bulk creation (if supported):**
```json
{
  "outletId": 2,
  "floorId": <ground_floor_id>,
  "sectionId": <ac_section_id>,
  "tables": [
    { "tableNumber": "T1", "capacity": 2 },
    { "tableNumber": "T2", "capacity": 4 },
    { "tableNumber": "T3", "capacity": 4 },
    { "tableNumber": "T4", "capacity": 6 }
  ]
}
```

---

### STEP 10: Create Kitchen Stations

#### 10.1 Main Kitchen

**POST** `/api/v1/outlets/2/kitchen-stations`

```json
{
  "name": "Main Kitchen",
  "code": "MAIN",
  "stationType": "main_kitchen",
  "displayOrder": 1
}
```

#### 10.2 Bar Station

**POST** `/api/v1/outlets/2/kitchen-stations`

```json
{
  "name": "Bar",
  "code": "BAR",
  "stationType": "bar",
  "displayOrder": 2
}
```

---

### STEP 11: Create Staff Users

#### 11.1 Get Role IDs

**GET** `/api/v1/users/roles`

```json
{
  "data": [
    { "id": 1, "slug": "super_admin" },
    { "id": 2, "slug": "admin" },
    { "id": 3, "slug": "manager" },
    { "id": 4, "slug": "captain" },
    { "id": 5, "slug": "cashier" },
    { "id": 6, "slug": "kitchen" },
    { "id": 7, "slug": "bartender" },
    { "id": 8, "slug": "inventory" }
  ]
}
```

#### 11.2 Create Manager

**POST** `/api/v1/users`

```json
{
  "name": "Test Manager",
  "email": "manager@testoutlet.com",
  "employeeCode": "TMGR01",
  "password": "Manager@123",
  "pin": "1111",
  "roles": [
    { "roleId": 3, "outletId": 2 }
  ]
}
```

#### 11.3 Create Captain

**POST** `/api/v1/users`

```json
{
  "name": "Test Captain",
  "employeeCode": "TCAP01",
  "phone": "+91-7777666655",
  "pin": "2222",
  "roles": [
    { "roleId": 4, "outletId": 2 }
  ],
  "floors": [
    { "floorId": <ground_floor_id>, "outletId": 2, "isPrimary": true }
  ]
}
```

#### 11.4 Create Cashier

**POST** `/api/v1/users`

```json
{
  "name": "Test Cashier",
  "employeeCode": "TCSH01",
  "phone": "+91-6666555544",
  "pin": "3333",
  "roles": [
    { "roleId": 5, "outletId": 2 }
  ]
}
```

#### 11.5 Create Kitchen Staff

**POST** `/api/v1/users`

```json
{
  "name": "Test Chef",
  "employeeCode": "TKIT01",
  "pin": "4444",
  "roles": [
    { "roleId": 6, "outletId": 2 }
  ]
}
```

---

### STEP 12: Assign Station to Kitchen Staff

**POST** `/api/v1/users/<kitchen_user_id>/stations`

```json
{
  "stationId": <main_kitchen_id>,
  "outletId": 2,
  "isPrimary": true
}
```

---

## Verification Checklist

| Step | What to Verify | SQL Query (Optional) |
|------|----------------|---------------------|
| 2 | New admin created | `SELECT * FROM users WHERE email = 'testadmin@newoutlet.com'` |
| 4 | New outlet created | `SELECT * FROM outlets WHERE code = 'TEST01'` |
| 6 | Tax groups for outlet 2 | `SELECT * FROM tax_groups WHERE outlet_id = 2` |
| 7 | Floors for outlet 2 | `SELECT * FROM floors WHERE outlet_id = 2` |
| 8 | Sections for outlet 2 | `SELECT * FROM sections WHERE outlet_id = 2` |
| 9 | Tables for outlet 2 | `SELECT * FROM tables t JOIN floors f ON t.floor_id = f.id WHERE f.outlet_id = 2` |
| 10 | Stations for outlet 2 | `SELECT * FROM kitchen_stations WHERE outlet_id = 2` |
| 11 | Staff for outlet 2 | `SELECT u.*, ur.outlet_id FROM users u JOIN user_roles ur ON u.id = ur.user_id WHERE ur.outlet_id = 2` |

---

## Verify Existing Data Unaffected

```sql
-- Existing outlet should be unchanged
SELECT * FROM outlets WHERE id = 1;

-- Existing users should be unchanged
SELECT * FROM users WHERE id = 1;

-- Existing tax groups for outlet 1 should be unchanged
SELECT * FROM tax_groups WHERE outlet_id = 1;
```

---

## Test Credentials Summary

| Role | Email/Code | Password/PIN |
|------|------------|--------------|
| Super Admin | admin@restropos.com | admin123 / 1234 |
| Test Admin | testadmin@newoutlet.com | TestAdmin@123 / 9999 |
| Test Manager | manager@testoutlet.com | Manager@123 / 1111 |
| Test Captain | TCAP01 | PIN: 2222 |
| Test Cashier | TCSH01 | PIN: 3333 |
| Test Chef | TKIT01 | PIN: 4444 |

---

## Next Steps After Setup

1. **Create Categories** - POST `/api/v1/menu/categories`
2. **Create Menu Items** - POST `/api/v1/menu/items`
3. **Setup Printers** - POST `/api/v1/printers`
4. **Test Order Flow** - Create order, send KOT, mark ready, bill, payment

---

## Rollback (If Needed)

To delete the test outlet and all related data:

```sql
-- ⚠️ ONLY USE IF YOU WANT TO DELETE TEST DATA

-- Delete outlet (cascades to floors, sections, tables, etc.)
DELETE FROM outlets WHERE code = 'TEST01';

-- Delete test users
DELETE FROM users WHERE email IN ('testadmin@newoutlet.com', 'manager@testoutlet.com');
DELETE FROM users WHERE employee_code IN ('TCAP01', 'TCSH01', 'TKIT01');
```

---

## Summary

✅ **Yes, you can test this way!**
- Create new admin via API
- Create new outlet for that admin
- Setup everything (tax, floors, sections, tables, staff)
- **Zero impact on existing data**
- Each outlet is completely isolated

