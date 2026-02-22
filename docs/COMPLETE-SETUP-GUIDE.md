# RestroPOS Complete Setup Guide
## Step-by-Step API Testing with Payloads & Responses

**Base URL:** `http://localhost:3000/api/v1`

---

# PHASE 1: INITIAL LOGIN & ADMIN CREATION

## Step 1.1: Login as Super Admin

First, login with the seeded super admin account.

**Endpoint:** `POST /api/v1/auth/login`

**Headers:**
```
Content-Type: application/json
```

**Request Body:**
```json
{
  "email": "admin@restropos.com",
  "password": "admin123"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": 1,
      "uuid": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "employeeCode": "ADMIN001",
      "name": "System Admin",
      "email": "admin@restropos.com",
      "phone": null,
      "avatarUrl": null,
      "isActive": true,
      "isVerified": true
    },
    "roles": ["super_admin"],
    "permissions": ["*"],
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEsImVtYWlsIjoiYWRtaW5AcmVzdHJvcG9zLmNvbSIsImlhdCI6MTcwODYwMDAwMCwiZXhwIjoxNzExMTkyMDAwfQ.xxxxx",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xxxxx",
    "expiresIn": 2592000
  }
}
```

**✅ Verification:**
- Status code is 200
- `accessToken` is returned
- `roles` includes `super_admin`

**⚠️ SAVE THIS:** Copy the `accessToken` - you'll need it for all subsequent requests.

---

## Step 1.2: Verify Login (Get Current User)

**Endpoint:** `GET /api/v1/auth/me`

**Headers:**
```
Authorization: Bearer <accessToken>
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "uuid": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "employeeCode": "ADMIN001",
    "name": "System Admin",
    "email": "admin@restropos.com",
    "phone": null,
    "isActive": true,
    "roles": [
      {
        "id": 1,
        "name": "Super Admin",
        "slug": "super_admin",
        "outletId": null
      }
    ],
    "permissions": ["*"]
  }
}
```

**✅ Verification:**
- User details match
- `permissions` is `["*"]` for super admin

---

## Step 1.3: Get All Available Roles

**Endpoint:** `GET /api/v1/users/roles`

**Headers:**
```
Authorization: Bearer <accessToken>
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    { "id": 1, "name": "Super Admin", "slug": "super_admin", "description": "Full system access", "isSystemRole": true },
    { "id": 2, "name": "Admin", "slug": "admin", "description": "Outlet admin access", "isSystemRole": true },
    { "id": 3, "name": "Manager", "slug": "manager", "description": "Manager level access", "isSystemRole": true },
    { "id": 4, "name": "Captain", "slug": "captain", "description": "Captain/Waiter access", "isSystemRole": true },
    { "id": 5, "name": "Cashier", "slug": "cashier", "description": "Cashier access", "isSystemRole": true },
    { "id": 6, "name": "Kitchen", "slug": "kitchen", "description": "Kitchen display access", "isSystemRole": true },
    { "id": 7, "name": "Bartender", "slug": "bartender", "description": "Bar access", "isSystemRole": true },
    { "id": 8, "name": "Inventory", "slug": "inventory", "description": "Inventory management", "isSystemRole": true }
  ]
}
```

**📝 Note Role IDs:**
| Role | ID |
|------|-----|
| super_admin | 1 |
| admin | 2 |
| manager | 3 |
| captain | 4 |
| cashier | 5 |
| kitchen | 6 |
| bartender | 7 |
| inventory | 8 |

---

## Step 1.4: Create New Admin User

**Endpoint:** `POST /api/v1/users`

**Headers:**
```
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "New Test Admin",
  "email": "newadmin@testrestro.com",
  "phone": "+91-9876543210",
  "employeeCode": "NADMIN01",
  "password": "NewAdmin@123",
  "pin": "9876",
  "isVerified": true,
  "roles": [
    {
      "roleId": 2,
      "outletId": null
    }
  ]
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "message": "User created successfully",
  "data": {
    "id": 2,
    "uuid": "b2c3d4e5-f6a7-8901-bcde-234567890123",
    "employeeCode": "NADMIN01",
    "name": "New Test Admin",
    "email": "newadmin@testrestro.com",
    "phone": "+91-9876543210",
    "isActive": true,
    "isVerified": true,
    "roles": [
      {
        "id": 2,
        "name": "Admin",
        "slug": "admin",
        "outletId": null
      }
    ],
    "createdAt": "2026-02-22T09:48:00.000Z"
  }
}
```

**✅ Verification:**
- Status code is 201
- User ID is returned (save this: `userId = 2`)
- Role is `admin`

---

## Step 1.5: Login as New Admin

**Endpoint:** `POST /api/v1/auth/login`

**Request Body:**
```json
{
  "email": "newadmin@testrestro.com",
  "password": "NewAdmin@123"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": 2,
      "uuid": "b2c3d4e5-f6a7-8901-bcde-234567890123",
      "employeeCode": "NADMIN01",
      "name": "New Test Admin",
      "email": "newadmin@testrestro.com",
      "isActive": true
    },
    "roles": ["admin"],
    "permissions": ["*"],
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.NEW_ADMIN_TOKEN.xxxxx",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xxxxx",
    "expiresIn": 2592000
  }
}
```

**⚠️ SAVE THIS:** Use this new `accessToken` for all outlet setup steps.

---

# PHASE 2: CREATE NEW OUTLET

## Step 2.1: Create Outlet

**Endpoint:** `POST /api/v1/outlets`

**Headers:**
```
Authorization: Bearer <new_admin_accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "Test Restaurant",
  "code": "TESTREST01",
  "legalName": "Test Restaurant Private Limited",
  "outletType": "restaurant",
  "addressLine1": "123 Test Street",
  "addressLine2": "Test Area",
  "city": "Mumbai",
  "state": "Maharashtra",
  "country": "India",
  "postalCode": "400001",
  "phone": "+91-22-12345678",
  "email": "contact@testrestaurant.com",
  "gstin": "27AABCT1234R1ZP",
  "fssaiNumber": "12345678901234",
  "panNumber": "AABCT1234R",
  "currencyCode": "INR",
  "timezone": "Asia/Kolkata",
  "openingTime": "10:00",
  "closingTime": "23:00",
  "is24Hours": false
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "message": "Outlet created successfully",
  "data": {
    "id": 2,
    "uuid": "c3d4e5f6-a7b8-9012-cdef-345678901234",
    "code": "TESTREST01",
    "name": "Test Restaurant",
    "legalName": "Test Restaurant Private Limited",
    "outletType": "restaurant",
    "addressLine1": "123 Test Street",
    "addressLine2": "Test Area",
    "city": "Mumbai",
    "state": "Maharashtra",
    "country": "India",
    "postalCode": "400001",
    "phone": "+91-22-12345678",
    "email": "contact@testrestaurant.com",
    "gstin": "27AABCT1234R1ZP",
    "fssaiNumber": "12345678901234",
    "panNumber": "AABCT1234R",
    "currencyCode": "INR",
    "timezone": "Asia/Kolkata",
    "openingTime": "10:00:00",
    "closingTime": "23:00:00",
    "is24Hours": false,
    "invoicePrefix": null,
    "invoiceSequence": 1,
    "kotPrefix": null,
    "kotSequence": 1,
    "isActive": true,
    "createdAt": "2026-02-22T09:50:00.000Z"
  }
}
```

**✅ Verification:**
- Status code is 201
- Outlet ID returned (save this: `outletId = 2`)
- `invoiceSequence` and `kotSequence` start at 1

**📝 IMPORTANT:** Save `outletId = 2` - used in all subsequent steps.

---

## Step 2.2: Get Outlet Details

**Endpoint:** `GET /api/v1/outlets/2`

**Headers:**
```
Authorization: Bearer <accessToken>
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": 2,
    "uuid": "c3d4e5f6-a7b8-9012-cdef-345678901234",
    "code": "TESTREST01",
    "name": "Test Restaurant",
    "outletType": "restaurant",
    "city": "Mumbai",
    "state": "Maharashtra",
    "gstin": "27AABCT1234R1ZP",
    "fssaiNumber": "12345678901234",
    "isActive": true,
    "floors": [],
    "sections": [],
    "kitchenStations": []
  }
}
```

**✅ Verification:**
- Outlet details match
- `floors`, `sections`, `kitchenStations` are empty (we'll create them next)

---

# PHASE 3: TAX CONFIGURATION

## Step 3.1: Get Tax Types (Pre-seeded)

**Endpoint:** `GET /api/v1/tax/types`

**Headers:**
```
Authorization: Bearer <accessToken>
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "GST",
      "code": "GST",
      "description": "Goods and Services Tax",
      "isActive": true
    },
    {
      "id": 2,
      "name": "VAT",
      "code": "VAT",
      "description": "Value Added Tax",
      "isActive": true
    },
    {
      "id": 3,
      "name": "Service Tax",
      "code": "SERVICE",
      "description": "Service Tax",
      "isActive": true
    }
  ]
}
```

---

## Step 3.2: Get Tax Components (Pre-seeded)

**Endpoint:** `GET /api/v1/tax/components`

**Headers:**
```
Authorization: Bearer <accessToken>
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    { "id": 1, "taxTypeId": 1, "taxTypeName": "GST", "name": "CGST 2.5%", "code": "CGST_2.5", "rate": 2.5, "isActive": true },
    { "id": 2, "taxTypeId": 1, "taxTypeName": "GST", "name": "SGST 2.5%", "code": "SGST_2.5", "rate": 2.5, "isActive": true },
    { "id": 3, "taxTypeId": 1, "taxTypeName": "GST", "name": "CGST 6%", "code": "CGST_6", "rate": 6.0, "isActive": true },
    { "id": 4, "taxTypeId": 1, "taxTypeName": "GST", "name": "SGST 6%", "code": "SGST_6", "rate": 6.0, "isActive": true },
    { "id": 5, "taxTypeId": 1, "taxTypeName": "GST", "name": "CGST 9%", "code": "CGST_9", "rate": 9.0, "isActive": true },
    { "id": 6, "taxTypeId": 1, "taxTypeName": "GST", "name": "SGST 9%", "code": "SGST_9", "rate": 9.0, "isActive": true },
    { "id": 7, "taxTypeId": 1, "taxTypeName": "GST", "name": "IGST 5%", "code": "IGST_5", "rate": 5.0, "isActive": true },
    { "id": 8, "taxTypeId": 1, "taxTypeName": "GST", "name": "IGST 12%", "code": "IGST_12", "rate": 12.0, "isActive": true },
    { "id": 9, "taxTypeId": 1, "taxTypeName": "GST", "name": "IGST 18%", "code": "IGST_18", "rate": 18.0, "isActive": true }
  ]
}
```

**📝 Component IDs for Tax Groups:**
| Tax Group | Component IDs |
|-----------|---------------|
| GST 5% | 1, 2 (CGST 2.5% + SGST 2.5%) |
| GST 12% | 3, 4 (CGST 6% + SGST 6%) |
| GST 18% | 5, 6 (CGST 9% + SGST 9%) |

---

## Step 3.3: Create Tax Group - GST 5%

**Endpoint:** `POST /api/v1/tax/groups`

**Headers:**
```
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "GST 5%",
  "code": "GST_5",
  "description": "GST 5% (CGST 2.5% + SGST 2.5%)",
  "outletId": 2,
  "componentIds": [1, 2]
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "message": "Tax group created successfully",
  "data": {
    "id": 1,
    "name": "GST 5%",
    "code": "GST_5",
    "description": "GST 5% (CGST 2.5% + SGST 2.5%)",
    "outletId": 2,
    "totalRate": 5.0,
    "isActive": true,
    "isDefault": false,
    "components": [
      { "id": 1, "name": "CGST 2.5%", "code": "CGST_2.5", "rate": 2.5 },
      { "id": 2, "name": "SGST 2.5%", "code": "SGST_2.5", "rate": 2.5 }
    ],
    "createdAt": "2026-02-22T09:52:00.000Z"
  }
}
```

**✅ Verification:** `totalRate` = 5.0 (2.5 + 2.5)

---

## Step 3.4: Create Tax Group - GST 12%

**Endpoint:** `POST /api/v1/tax/groups`

**Request Body:**
```json
{
  "name": "GST 12%",
  "code": "GST_12",
  "description": "GST 12% (CGST 6% + SGST 6%)",
  "outletId": 2,
  "componentIds": [3, 4]
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "message": "Tax group created successfully",
  "data": {
    "id": 2,
    "name": "GST 12%",
    "code": "GST_12",
    "totalRate": 12.0,
    "outletId": 2,
    "components": [
      { "id": 3, "name": "CGST 6%", "code": "CGST_6", "rate": 6.0 },
      { "id": 4, "name": "SGST 6%", "code": "SGST_6", "rate": 6.0 }
    ]
  }
}
```

---

## Step 3.5: Create Tax Group - GST 18%

**Endpoint:** `POST /api/v1/tax/groups`

**Request Body:**
```json
{
  "name": "GST 18%",
  "code": "GST_18",
  "description": "GST 18% (CGST 9% + SGST 9%)",
  "outletId": 2,
  "componentIds": [5, 6],
  "isDefault": true
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "message": "Tax group created successfully",
  "data": {
    "id": 3,
    "name": "GST 18%",
    "code": "GST_18",
    "totalRate": 18.0,
    "outletId": 2,
    "isDefault": true,
    "components": [
      { "id": 5, "name": "CGST 9%", "code": "CGST_9", "rate": 9.0 },
      { "id": 6, "name": "SGST 9%", "code": "SGST_9", "rate": 9.0 }
    ]
  }
}
```

---

## Step 3.6: Get All Tax Groups for Outlet

**Endpoint:** `GET /api/v1/tax/groups?outletId=2`

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    { "id": 1, "name": "GST 5%", "code": "GST_5", "totalRate": 5.0, "isDefault": false },
    { "id": 2, "name": "GST 12%", "code": "GST_12", "totalRate": 12.0, "isDefault": false },
    { "id": 3, "name": "GST 18%", "code": "GST_18", "totalRate": 18.0, "isDefault": true }
  ]
}
```

**✅ Verification:** 3 tax groups created for outlet 2

---

# PHASE 4: LAYOUT SETUP (FLOORS & SECTIONS)

## Step 4.1: Create Ground Floor

**Endpoint:** `POST /api/v1/outlets/2/floors`

**Headers:**
```
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "Ground Floor",
  "code": "GF",
  "floorNumber": 0,
  "displayOrder": 1
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "message": "Floor created successfully",
  "data": {
    "id": 1,
    "outletId": 2,
    "name": "Ground Floor",
    "code": "GF",
    "floorNumber": 0,
    "displayOrder": 1,
    "isActive": true,
    "createdAt": "2026-02-22T09:55:00.000Z"
  }
}
```

**📝 Save:** `groundFloorId = 1`

---

## Step 4.2: Create First Floor

**Endpoint:** `POST /api/v1/outlets/2/floors`

**Request Body:**
```json
{
  "name": "First Floor",
  "code": "FF",
  "floorNumber": 1,
  "displayOrder": 2
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "message": "Floor created successfully",
  "data": {
    "id": 2,
    "outletId": 2,
    "name": "First Floor",
    "code": "FF",
    "floorNumber": 1,
    "displayOrder": 2,
    "isActive": true
  }
}
```

**📝 Save:** `firstFloorId = 2`

---

## Step 4.3: Create AC Section

**Endpoint:** `POST /api/v1/outlets/2/sections`

**Request Body:**
```json
{
  "name": "AC Section",
  "code": "AC",
  "sectionType": "ac",
  "colorCode": "#2196F3",
  "displayOrder": 1
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "message": "Section created successfully",
  "data": {
    "id": 1,
    "outletId": 2,
    "name": "AC Section",
    "code": "AC",
    "sectionType": "ac",
    "colorCode": "#2196F3",
    "displayOrder": 1,
    "isActive": true
  }
}
```

**📝 Save:** `acSectionId = 1`

---

## Step 4.4: Create Non-AC Section

**Endpoint:** `POST /api/v1/outlets/2/sections`

**Request Body:**
```json
{
  "name": "Non-AC Section",
  "code": "NAC",
  "sectionType": "non_ac",
  "colorCode": "#4CAF50",
  "displayOrder": 2
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "message": "Section created successfully",
  "data": {
    "id": 2,
    "outletId": 2,
    "name": "Non-AC Section",
    "code": "NAC",
    "sectionType": "non_ac",
    "colorCode": "#4CAF50",
    "displayOrder": 2,
    "isActive": true
  }
}
```

**📝 Save:** `nonAcSectionId = 2`

---

## Step 4.5: Create Bar Section

**Endpoint:** `POST /api/v1/outlets/2/sections`

**Request Body:**
```json
{
  "name": "Bar Area",
  "code": "BAR",
  "sectionType": "bar",
  "colorCode": "#9C27B0",
  "displayOrder": 3
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "message": "Section created successfully",
  "data": {
    "id": 3,
    "outletId": 2,
    "name": "Bar Area",
    "code": "BAR",
    "sectionType": "bar",
    "colorCode": "#9C27B0",
    "displayOrder": 3,
    "isActive": true
  }
}
```

**📝 Save:** `barSectionId = 3`

---

## Step 4.6: Get All Floors

**Endpoint:** `GET /api/v1/outlets/2/floors`

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    { "id": 1, "name": "Ground Floor", "code": "GF", "floorNumber": 0, "displayOrder": 1, "isActive": true },
    { "id": 2, "name": "First Floor", "code": "FF", "floorNumber": 1, "displayOrder": 2, "isActive": true }
  ]
}
```

---

## Step 4.7: Get All Sections

**Endpoint:** `GET /api/v1/outlets/2/sections`

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    { "id": 1, "name": "AC Section", "code": "AC", "sectionType": "ac", "colorCode": "#2196F3", "isActive": true },
    { "id": 2, "name": "Non-AC Section", "code": "NAC", "sectionType": "non_ac", "colorCode": "#4CAF50", "isActive": true },
    { "id": 3, "name": "Bar Area", "code": "BAR", "sectionType": "bar", "colorCode": "#9C27B0", "isActive": true }
  ]
}
```

---

# PHASE 5: CREATE TABLES

## Step 5.1: Create Table T1 (Ground Floor, AC)

**Endpoint:** `POST /api/v1/tables`

**Headers:**
```
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "outletId": 2,
  "floorId": 1,
  "sectionId": 1,
  "tableNumber": "T1",
  "capacity": 2,
  "shape": "round",
  "positionX": 100,
  "positionY": 100
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "message": "Table created successfully",
  "data": {
    "id": 1,
    "uuid": "d4e5f6a7-b8c9-0123-def0-456789012345",
    "outletId": 2,
    "floorId": 1,
    "sectionId": 1,
    "tableNumber": "T1",
    "capacity": 2,
    "shape": "round",
    "status": "available",
    "positionX": 100,
    "positionY": 100,
    "isActive": true
  }
}
```

---

## Step 5.2: Create Table T2 (Ground Floor, AC)

**Endpoint:** `POST /api/v1/tables`

**Request Body:**
```json
{
  "outletId": 2,
  "floorId": 1,
  "sectionId": 1,
  "tableNumber": "T2",
  "capacity": 4,
  "shape": "square",
  "positionX": 200,
  "positionY": 100
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "message": "Table created successfully",
  "data": {
    "id": 2,
    "tableNumber": "T2",
    "capacity": 4,
    "shape": "square",
    "status": "available"
  }
}
```

---

## Step 5.3: Create Table T3 (Ground Floor, Non-AC)

**Endpoint:** `POST /api/v1/tables`

**Request Body:**
```json
{
  "outletId": 2,
  "floorId": 1,
  "sectionId": 2,
  "tableNumber": "T3",
  "capacity": 4,
  "shape": "rectangle",
  "positionX": 100,
  "positionY": 200
}
```

---

## Step 5.4: Create Table T4 (Ground Floor, Non-AC)

**Endpoint:** `POST /api/v1/tables`

**Request Body:**
```json
{
  "outletId": 2,
  "floorId": 1,
  "sectionId": 2,
  "tableNumber": "T4",
  "capacity": 6,
  "shape": "rectangle",
  "positionX": 200,
  "positionY": 200
}
```

---

## Step 5.5: Create Bar Counter B1

**Endpoint:** `POST /api/v1/tables`

**Request Body:**
```json
{
  "outletId": 2,
  "floorId": 1,
  "sectionId": 3,
  "tableNumber": "B1",
  "capacity": 4,
  "shape": "rectangle",
  "positionX": 300,
  "positionY": 100
}
```

---

## Step 5.6: Get All Tables for Outlet

**Endpoint:** `GET /api/v1/tables?outletId=2`

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    { "id": 1, "tableNumber": "T1", "capacity": 2, "floorId": 1, "sectionId": 1, "status": "available" },
    { "id": 2, "tableNumber": "T2", "capacity": 4, "floorId": 1, "sectionId": 1, "status": "available" },
    { "id": 3, "tableNumber": "T3", "capacity": 4, "floorId": 1, "sectionId": 2, "status": "available" },
    { "id": 4, "tableNumber": "T4", "capacity": 6, "floorId": 1, "sectionId": 2, "status": "available" },
    { "id": 5, "tableNumber": "B1", "capacity": 4, "floorId": 1, "sectionId": 3, "status": "available" }
  ]
}
```

**✅ Verification:** 5 tables created, all with status `available`

---

# PHASE 6: KITCHEN STATIONS

## Step 6.1: Create Main Kitchen Station

**Endpoint:** `POST /api/v1/outlets/2/kitchen-stations`

**Headers:**
```
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "Main Kitchen",
  "code": "MAIN",
  "stationType": "main_kitchen",
  "displayOrder": 1
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "message": "Kitchen station created successfully",
  "data": {
    "id": 1,
    "outletId": 2,
    "name": "Main Kitchen",
    "code": "MAIN",
    "stationType": "main_kitchen",
    "displayOrder": 1,
    "isActive": true
  }
}
```

**📝 Save:** `mainKitchenId = 1`

---

## Step 6.2: Create Bar Station

**Endpoint:** `POST /api/v1/outlets/2/kitchen-stations`

**Request Body:**
```json
{
  "name": "Bar",
  "code": "BAR",
  "stationType": "bar",
  "displayOrder": 2
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "message": "Kitchen station created successfully",
  "data": {
    "id": 2,
    "outletId": 2,
    "name": "Bar",
    "code": "BAR",
    "stationType": "bar",
    "displayOrder": 2,
    "isActive": true
  }
}
```

**📝 Save:** `barStationId = 2`

---

## Step 6.3: Get All Kitchen Stations

**Endpoint:** `GET /api/v1/outlets/2/kitchen-stations`

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    { "id": 1, "name": "Main Kitchen", "code": "MAIN", "stationType": "main_kitchen", "isActive": true },
    { "id": 2, "name": "Bar", "code": "BAR", "stationType": "bar", "isActive": true }
  ]
}
```

---

# PHASE 7: CREATE STAFF USERS

## Step 7.1: Create Manager

**Endpoint:** `POST /api/v1/users`

**Headers:**
```
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "Test Manager",
  "email": "manager@testrestro.com",
  "phone": "+91-9876500001",
  "employeeCode": "MGR001",
  "password": "Manager@123",
  "pin": "1111",
  "isVerified": true,
  "roles": [
    {
      "roleId": 3,
      "outletId": 2
    }
  ]
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "message": "User created successfully",
  "data": {
    "id": 3,
    "uuid": "e5f6a7b8-c9d0-1234-ef01-567890123456",
    "employeeCode": "MGR001",
    "name": "Test Manager",
    "email": "manager@testrestro.com",
    "roles": [
      { "id": 3, "name": "Manager", "slug": "manager", "outletId": 2 }
    ]
  }
}
```

**📝 Save:** `managerId = 3`

---

## Step 7.2: Create Captain

**Endpoint:** `POST /api/v1/users`

**Request Body:**
```json
{
  "name": "Test Captain",
  "phone": "+91-9876500002",
  "employeeCode": "CAP001",
  "pin": "2222",
  "isVerified": true,
  "roles": [
    {
      "roleId": 4,
      "outletId": 2
    }
  ],
  "floors": [
    {
      "floorId": 1,
      "outletId": 2,
      "isPrimary": true
    }
  ]
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "message": "User created successfully",
  "data": {
    "id": 4,
    "employeeCode": "CAP001",
    "name": "Test Captain",
    "roles": [
      { "id": 4, "name": "Captain", "slug": "captain", "outletId": 2 }
    ],
    "assignedFloors": [
      { "id": 1, "name": "Ground Floor" }
    ]
  }
}
```

**📝 Save:** `captainId = 4`

---

## Step 7.3: Create Cashier

**Endpoint:** `POST /api/v1/users`

**Request Body:**
```json
{
  "name": "Test Cashier",
  "phone": "+91-9876500003",
  "employeeCode": "CSH001",
  "pin": "3333",
  "isVerified": true,
  "roles": [
    {
      "roleId": 5,
      "outletId": 2
    }
  ]
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "message": "User created successfully",
  "data": {
    "id": 5,
    "employeeCode": "CSH001",
    "name": "Test Cashier",
    "roles": [
      { "id": 5, "name": "Cashier", "slug": "cashier", "outletId": 2 }
    ]
  }
}
```

**📝 Save:** `cashierId = 5`

---

## Step 7.4: Create Kitchen Staff

**Endpoint:** `POST /api/v1/users`

**Request Body:**
```json
{
  "name": "Test Chef",
  "employeeCode": "KIT001",
  "pin": "4444",
  "isVerified": true,
  "roles": [
    {
      "roleId": 6,
      "outletId": 2
    }
  ]
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "message": "User created successfully",
  "data": {
    "id": 6,
    "employeeCode": "KIT001",
    "name": "Test Chef",
    "roles": [
      { "id": 6, "name": "Kitchen", "slug": "kitchen", "outletId": 2 }
    ]
  }
}
```

**📝 Save:** `kitchenStaffId = 6`

---

## Step 7.5: Create Bartender

**Endpoint:** `POST /api/v1/users`

**Request Body:**
```json
{
  "name": "Test Bartender",
  "employeeCode": "BAR001",
  "pin": "5555",
  "isVerified": true,
  "roles": [
    {
      "roleId": 7,
      "outletId": 2
    }
  ]
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "message": "User created successfully",
  "data": {
    "id": 7,
    "employeeCode": "BAR001",
    "name": "Test Bartender",
    "roles": [
      { "id": 7, "name": "Bartender", "slug": "bartender", "outletId": 2 }
    ]
  }
}
```

---

## Step 7.6: Assign Station to Kitchen Staff

**Endpoint:** `POST /api/v1/users/6/stations`

**Request Body:**
```json
{
  "stationId": 1,
  "outletId": 2,
  "isPrimary": true
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Station assigned successfully",
  "data": {
    "userId": 6,
    "stations": [
      {
        "stationId": 1,
        "stationName": "Main Kitchen",
        "stationCode": "MAIN",
        "isPrimary": true
      }
    ]
  }
}
```

---

## Step 7.7: Assign Station to Bartender

**Endpoint:** `POST /api/v1/users/7/stations`

**Request Body:**
```json
{
  "stationId": 2,
  "outletId": 2,
  "isPrimary": true
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Station assigned successfully",
  "data": {
    "userId": 7,
    "stations": [
      {
        "stationId": 2,
        "stationName": "Bar",
        "stationCode": "BAR",
        "isPrimary": true
      }
    ]
  }
}
```

---

## Step 7.8: Get All Users for Outlet

**Endpoint:** `GET /api/v1/users?outletId=2`

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    { "id": 3, "employeeCode": "MGR001", "name": "Test Manager", "roles": ["manager"], "station": null },
    { "id": 4, "employeeCode": "CAP001", "name": "Test Captain", "roles": ["captain"], "station": null },
    { "id": 5, "employeeCode": "CSH001", "name": "Test Cashier", "roles": ["cashier"], "station": null },
    { "id": 6, "employeeCode": "KIT001", "name": "Test Chef", "roles": ["kitchen"], "station": { "id": 1, "name": "Main Kitchen" } },
    { "id": 7, "employeeCode": "BAR001", "name": "Test Bartender", "roles": ["bartender"], "station": { "id": 2, "name": "Bar" } }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 5,
    "totalPages": 1
  }
}
```

**✅ Verification:** 5 staff users created for outlet 2

---

# PHASE 8: TEST STAFF LOGIN

## Step 8.1: Login as Manager (Email + Password)

**Endpoint:** `POST /api/v1/auth/login`

**Request Body:**
```json
{
  "email": "manager@testrestro.com",
  "password": "Manager@123"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": 3,
      "name": "Test Manager",
      "roles": ["manager"]
    },
    "accessToken": "...",
    "permissions": ["TABLE_VIEW", "TABLE_CREATE", "ORDER_VIEW", "ORDER_CREATE", ...]
  }
}
```

---

## Step 8.2: Login as Captain (PIN)

**Endpoint:** `POST /api/v1/auth/login/pin`

**Request Body:**
```json
{
  "employeeCode": "CAP001",
  "pin": "2222"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": 4,
      "employeeCode": "CAP001",
      "name": "Test Captain",
      "roles": ["captain"]
    },
    "accessToken": "...",
    "permissions": ["TABLE_VIEW", "ORDER_VIEW", "ORDER_CREATE", "KOT_SEND", ...]
  }
}
```

---

## Step 8.3: Login as Cashier (PIN)

**Endpoint:** `POST /api/v1/auth/login/pin`

**Request Body:**
```json
{
  "employeeCode": "CSH001",
  "pin": "3333"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": 5,
      "name": "Test Cashier",
      "roles": ["cashier"]
    },
    "accessToken": "...",
    "permissions": ["TABLE_VIEW", "ORDER_VIEW", "BILL_VIEW", "BILL_GENERATE", "PAYMENT_COLLECT", ...]
  }
}
```

---

# VERIFICATION SUMMARY

## IDs Reference Table

| Entity | ID | Name |
|--------|----|------|
| Super Admin | 1 | System Admin |
| New Admin | 2 | New Test Admin |
| New Outlet | 2 | Test Restaurant |
| Ground Floor | 1 | Ground Floor |
| First Floor | 2 | First Floor |
| AC Section | 1 | AC Section |
| Non-AC Section | 2 | Non-AC Section |
| Bar Section | 3 | Bar Area |
| Main Kitchen | 1 | Main Kitchen |
| Bar Station | 2 | Bar |
| Manager | 3 | Test Manager |
| Captain | 4 | Test Captain |
| Cashier | 5 | Test Cashier |
| Kitchen Staff | 6 | Test Chef |
| Bartender | 7 | Test Bartender |

---

## Login Credentials Summary

| Role | Login Method | Credentials |
|------|--------------|-------------|
| Super Admin | Email + Password | admin@restropos.com / admin123 |
| New Admin | Email + Password | newadmin@testrestro.com / NewAdmin@123 |
| Manager | Email + Password | manager@testrestro.com / Manager@123 |
| Captain | Employee Code + PIN | CAP001 / 2222 |
| Cashier | Employee Code + PIN | CSH001 / 3333 |
| Kitchen | Employee Code + PIN | KIT001 / 4444 |
| Bartender | Employee Code + PIN | BAR001 / 5555 |

---

## Verification SQL Queries

```sql
-- Verify new outlet created
SELECT id, code, name, city FROM outlets WHERE code = 'TESTREST01';

-- Verify tax groups for outlet 2
SELECT id, name, code, outlet_id FROM tax_groups WHERE outlet_id = 2;

-- Verify floors for outlet 2
SELECT id, name, code, floor_number FROM floors WHERE outlet_id = 2;

-- Verify sections for outlet 2
SELECT id, name, code, section_type FROM sections WHERE outlet_id = 2;

-- Verify tables for outlet 2
SELECT t.id, t.table_number, f.name as floor, s.name as section 
FROM tables t 
JOIN floors f ON t.floor_id = f.id 
JOIN sections s ON t.section_id = s.id 
WHERE f.outlet_id = 2;

-- Verify kitchen stations for outlet 2
SELECT id, name, code, station_type FROM kitchen_stations WHERE outlet_id = 2;

-- Verify staff for outlet 2
SELECT u.id, u.employee_code, u.name, r.name as role 
FROM users u 
JOIN user_roles ur ON u.id = ur.user_id 
JOIN roles r ON ur.role_id = r.id 
WHERE ur.outlet_id = 2;

-- Verify existing outlet 1 is unaffected
SELECT id, code, name FROM outlets WHERE id = 1;
```

---

## Next Steps

After completing this setup, you can proceed to:

1. **Create Menu Categories** - `POST /api/v1/menu/categories`
2. **Create Menu Items** - `POST /api/v1/menu/items`
3. **Setup Printers** - `POST /api/v1/printers`
4. **Test Order Flow** - Create order → Send KOT → Accept → Ready → Serve → Bill → Payment

