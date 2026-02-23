# RestroPOS API Testing Guide

## Base URL
```
Development: http://localhost:3000/api/v1
Production: https://your-domain.com/api/v1
```

---

# Phase 1: Initial Setup & Configuration

## 1.1 Admin Setup

### Step 1: Run Database Migrations & Seed
```bash
# Run migrations
npm run migrate

# Seed initial data (roles, permissions, admin, taxes)
npm run seed
```

**Seed Creates:**
- 8 Roles: `super_admin`, `admin`, `manager`, `captain`, `cashier`, `kitchen`, `bartender`, `inventory`
- 60+ Permissions (organized by category)
- Tax Types: GST, VAT, Service Tax
- Tax Components: CGST, SGST, IGST at various rates
- Default Admin User
- System Settings
- Default Outlet

### Step 2: Login as Super Admin

**Endpoint:** `POST /api/v1/auth/login`

**Request:**
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
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 2592000
  }
}
```

### Step 3: Verify Current User (GET /auth/me)

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
    "roles": [
      {
        "id": 1,
        "name": "Super Admin",
        "slug": "super_admin"
      }
    ],
    "permissions": ["*"],
    "outlets": []
  }
}
```

### Step 4: Refresh Token

**Endpoint:** `POST /api/v1/auth/refresh`

**Request:**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 2592000
  }
}
```

---

## 1.2 Outlet Setup

### Step 1: Create New Outlet

**Endpoint:** `POST /api/v1/outlets`

**Headers:**
```
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request:**
```json
{
  "name": "Downtown Restaurant",
  "code": "DTR001",
  "legalName": "Downtown Restaurant Pvt Ltd",
  "outletType": "restaurant",
  "addressLine1": "123 Main Street",
  "addressLine2": "Ground Floor",
  "city": "Mumbai",
  "state": "Maharashtra",
  "country": "India",
  "postalCode": "400001",
  "phone": "+91-9876543210",
  "email": "downtown@restro.com",
  "gstin": "27AABCU9603R1ZM",
  "fssaiNumber": "12345678901234",
  "panNumber": "AABCU9603R",
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
    "id": 1,
    "uuid": "b2c3d4e5-f6a7-8901-bcde-f23456789012",
    "code": "DTR001",
    "name": "Downtown Restaurant",
    "legalName": "Downtown Restaurant Pvt Ltd",
    "outletType": "restaurant",
    "addressLine1": "123 Main Street",
    "addressLine2": "Ground Floor",
    "city": "Mumbai",
    "state": "Maharashtra",
    "country": "India",
    "postalCode": "400001",
    "phone": "+91-9876543210",
    "email": "downtown@restro.com",
    "gstin": "27AABCU9603R1ZM",
    "fssaiNumber": "12345678901234",
    "panNumber": "AABCU9603R",
    "currencyCode": "INR",
    "timezone": "Asia/Kolkata",
    "openingTime": "10:00:00",
    "closingTime": "23:00:00",
    "is24Hours": false,
    "invoicePrefix": "INV",
    "invoiceSequence": 1,
    "kotPrefix": "KOT",
    "kotSequence": 1,
    "isActive": true,
    "createdAt": "2026-02-22T07:30:00.000Z"
  }
}
```

### Step 2: Get Outlet Details

**Endpoint:** `GET /api/v1/outlets/{outletId}`

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "uuid": "b2c3d4e5-f6a7-8901-bcde-f23456789012",
    "code": "DTR001",
    "name": "Downtown Restaurant",
    "outletType": "restaurant",
    "city": "Mumbai",
    "state": "Maharashtra",
    "isActive": true,
    "floors": [],
    "sections": [],
    "settings": {}
  }
}
```

### Step 3: Update Outlet (Set Logo, Settings)

**Endpoint:** `PUT /api/v1/outlets/{outletId}`

**Request:**
```json
{
  "logoUrl": "https://storage.example.com/logos/downtown.png",
  "settings": {
    "allowNegativeStock": false,
    "autoAcceptKot": false,
    "kotAutoConfirm": false
  }
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Outlet updated successfully",
  "data": {
    "id": 1,
    "name": "Downtown Restaurant",
    "logoUrl": "https://storage.example.com/logos/downtown.png",
    "settings": {
      "allowNegativeStock": false,
      "autoAcceptKot": false,
      "kotAutoConfirm": false
    }
  }
}
```

---

## 1.3 Tax Configuration

### Step 1: View Existing Tax Types

**Endpoint:** `GET /api/v1/tax/types`

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

### Step 2: View Tax Components

**Endpoint:** `GET /api/v1/tax/components`

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "taxTypeId": 1,
      "taxTypeName": "GST",
      "name": "CGST 2.5%",
      "code": "CGST_2.5",
      "rate": 2.5,
      "isActive": true
    },
    {
      "id": 2,
      "taxTypeId": 1,
      "taxTypeName": "GST",
      "name": "SGST 2.5%",
      "code": "SGST_2.5",
      "rate": 2.5,
      "isActive": true
    },
    {
      "id": 3,
      "taxTypeId": 1,
      "taxTypeName": "GST",
      "name": "CGST 6%",
      "code": "CGST_6",
      "rate": 6,
      "isActive": true
    },
    {
      "id": 4,
      "taxTypeId": 1,
      "taxTypeName": "GST",
      "name": "SGST 6%",
      "code": "SGST_6",
      "rate": 6,
      "isActive": true
    },
    {
      "id": 5,
      "taxTypeId": 1,
      "taxTypeName": "GST",
      "name": "CGST 9%",
      "code": "CGST_9",
      "rate": 9,
      "isActive": true
    },
    {
      "id": 6,
      "taxTypeId": 1,
      "taxTypeName": "GST",
      "name": "SGST 9%",
      "code": "SGST_9",
      "rate": 9,
      "isActive": true
    },
    {
      "id": 7,
      "taxTypeId": 1,
      "taxTypeName": "GST",
      "name": "IGST 5%",
      "code": "IGST_5",
      "rate": 5,
      "isActive": true
    },
    {
      "id": 8,
      "taxTypeId": 1,
      "taxTypeName": "GST",
      "name": "IGST 12%",
      "code": "IGST_12",
      "rate": 12,
      "isActive": true
    },
    {
      "id": 9,
      "taxTypeId": 1,
      "taxTypeName": "GST",
      "name": "IGST 18%",
      "code": "IGST_18",
      "rate": 18,
      "isActive": true
    }
  ]
}
```

### Step 3: Create Tax Group (GST 5%)

**Endpoint:** `POST /api/v1/tax/groups`

**Request:**
```json
{
  "name": "GST 5%",
  "code": "GST_5",
  "description": "GST 5% (CGST 2.5% + SGST 2.5%)",
  "outletId": 1,
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
    "outletId": 1,
    "totalRate": 5,
    "isActive": true,
    "components": [
      {
        "id": 1,
        "name": "CGST 2.5%",
        "code": "CGST_2.5",
        "rate": 2.5
      },
      {
        "id": 2,
        "name": "SGST 2.5%",
        "code": "SGST_2.5",
        "rate": 2.5
      }
    ]
  }
}
```

### Step 4: Create Tax Group (GST 12%)

**Endpoint:** `POST /api/v1/tax/groups`

**Request:**
```json
{
  "name": "GST 12%",
  "code": "GST_12",
  "description": "GST 12% (CGST 6% + SGST 6%)",
  "outletId": 1,
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
    "totalRate": 12,
    "components": [
      { "name": "CGST 6%", "rate": 6 },
      { "name": "SGST 6%", "rate": 6 }
    ]
  }
}
```

### Step 5: Create Tax Group (GST 18%)

**Endpoint:** `POST /api/v1/tax/groups`

**Request:**
```json
{
  "name": "GST 18%",
  "code": "GST_18",
  "description": "GST 18% (CGST 9% + SGST 9%)",
  "outletId": 1,
  "componentIds": [5, 6]
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
    "totalRate": 18,
    "components": [
      { "name": "CGST 9%", "rate": 9 },
      { "name": "SGST 9%", "rate": 9 }
    ]
  }
}
```

### Step 6: View All Tax Groups

**Endpoint:** `GET /api/v1/tax/groups?outletId=1`

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "GST 5%",
      "code": "GST_5",
      "totalRate": 5,
      "isActive": true,
      "components": [
        { "name": "CGST 2.5%", "rate": 2.5 },
        { "name": "SGST 2.5%", "rate": 2.5 }
      ]
    },
    {
      "id": 2,
      "name": "GST 12%",
      "code": "GST_12",
      "totalRate": 12,
      "isActive": true,
      "components": [
        { "name": "CGST 6%", "rate": 6 },
        { "name": "SGST 6%", "rate": 6 }
      ]
    },
    {
      "id": 3,
      "name": "GST 18%",
      "code": "GST_18",
      "totalRate": 18,
      "isActive": true,
      "components": [
        { "name": "CGST 9%", "rate": 9 },
        { "name": "SGST 9%", "rate": 9 }
      ]
    }
  ]
}
```

---

# Phase 2: Layout Setup

## 2.1 Create Floors

**Endpoint:** `POST /api/v1/outlets/{outletId}/floors`

**Request:**
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
    "outletId": 1,
    "name": "Ground Floor",
    "code": "GF",
    "floorNumber": 0,
    "displayOrder": 1,
    "isActive": true
  }
}
```

## 2.2 Create Sections

**Endpoint:** `POST /api/v1/outlets/{outletId}/sections`

**Request:**
```json
{
  "name": "AC Section",
  "code": "AC",
  "sectionType": "ac",
  "colorCode": "#4A90D9",
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
    "outletId": 1,
    "name": "AC Section",
    "code": "AC",
    "sectionType": "ac",
    "colorCode": "#4A90D9",
    "displayOrder": 1,
    "isActive": true
  }
}
```

## 2.3 Create Tables

**Endpoint:** `POST /api/v1/tables`

**Request:**
```json
{
  "outletId": 1,
  "floorId": 1,
  "sectionId": 1,
  "tableNumber": "T1",
  "capacity": 4,
  "shape": "square",
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
    "uuid": "c3d4e5f6-a7b8-9012-cdef-345678901234",
    "outletId": 1,
    "floorId": 1,
    "sectionId": 1,
    "tableNumber": "T1",
    "capacity": 4,
    "shape": "square",
    "status": "available",
    "positionX": 100,
    "positionY": 100,
    "isActive": true
  }
}
```

## 2.4 Create Kitchen Stations

**Endpoint:** `POST /api/v1/outlets/{outletId}/kitchen-stations`

**Request:**
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
    "outletId": 1,
    "name": "Main Kitchen",
    "code": "MAIN",
    "stationType": "main_kitchen",
    "displayOrder": 1,
    "isActive": true
  }
}
```

---

# Phase 3: Staff Setup

## 3.1 View Available Roles

**Endpoint:** `GET /api/v1/users/roles`

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    { "id": 1, "name": "Super Admin", "slug": "super_admin", "isSystemRole": true },
    { "id": 2, "name": "Admin", "slug": "admin", "isSystemRole": true },
    { "id": 3, "name": "Manager", "slug": "manager", "isSystemRole": true },
    { "id": 4, "name": "Captain", "slug": "captain", "isSystemRole": true },
    { "id": 5, "name": "Cashier", "slug": "cashier", "isSystemRole": true },
    { "id": 6, "name": "Kitchen", "slug": "kitchen", "isSystemRole": true },
    { "id": 7, "name": "Bartender", "slug": "bartender", "isSystemRole": true },
    { "id": 8, "name": "Inventory", "slug": "inventory", "isSystemRole": true }
  ]
}
```

## 3.2 Create Manager User

**Endpoint:** `POST /api/v1/users`

**Request:**
```json
{
  "name": "Restaurant Manager",
  "email": "manager@downtown.com",
  "phone": "+91-9876543211",
  "employeeCode": "MGR001",
  "password": "manager123",
  "pin": "1111",
  "roleIds": [3],
  "outletId": 1
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "message": "User created successfully",
  "data": {
    "id": 2,
    "uuid": "d4e5f6a7-b8c9-0123-def0-456789012345",
    "employeeCode": "MGR001",
    "name": "Restaurant Manager",
    "email": "manager@downtown.com",
    "phone": "+91-9876543211",
    "isActive": true,
    "isVerified": true,
    "roles": [
      { "id": 3, "name": "Manager", "slug": "manager", "outletId": 1 }
    ]
  }
}
```

## 3.3 Create Captain User

**Endpoint:** `POST /api/v1/users`

**Request:**
```json
{
  "name": "John Captain",
  "employeeCode": "CAP001",
  "phone": "+91-9876543212",
  "password": "captain123",
  "pin": "2222",
  "roleIds": [4],
  "outletId": 1,
  "floorIds": [1]
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "message": "User created successfully",
  "data": {
    "id": 3,
    "employeeCode": "CAP001",
    "name": "John Captain",
    "roles": [{ "id": 4, "name": "Captain", "slug": "captain" }],
    "assignedFloors": [{ "id": 1, "name": "Ground Floor" }]
  }
}
```

## 3.4 Create Cashier User

**Endpoint:** `POST /api/v1/users`

**Request:**
```json
{
  "name": "Cash Handler",
  "employeeCode": "CSH001",
  "phone": "+91-9876543213",
  "password": "cashier123",
  "pin": "3333",
  "roleIds": [5],
  "outletId": 1
}
```

## 3.5 Create Kitchen Staff

**Endpoint:** `POST /api/v1/users`

**Request:**
```json
{
  "name": "Chef Kumar",
  "employeeCode": "KIT001",
  "pin": "4444",
  "roleIds": [6],
  "outletId": 1
}
```

## 3.6 Assign Station to Kitchen Staff

**Endpoint:** `POST /api/v1/users/{userId}/stations`

**Request:**
```json
{
  "stationId": 1,
  "outletId": 1,
  "isPrimary": true
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Station assigned successfully",
  "data": {
    "userId": 5,
    "stations": [
      {
        "stationId": 1,
        "stationName": "Main Kitchen",
        "stationCode": "MAIN",
        "stationType": "main_kitchen",
        "isPrimary": true
      }
    ]
  }
}
```

---

# Verification Checklist

## Phase 1 Verification

| Step | API | Expected | Status |
|------|-----|----------|--------|
| 1.1.1 | Run migrations | Tables created | ⬜ |
| 1.1.2 | Run seed | Roles, permissions, admin created | ⬜ |
| 1.1.3 | POST /auth/login | Token received | ⬜ |
| 1.1.4 | GET /auth/me | User data with permissions | ⬜ |
| 1.1.5 | POST /auth/refresh | New tokens | ⬜ |
| 1.2.1 | POST /outlets | Outlet created | ⬜ |
| 1.2.2 | GET /outlets/{id} | Outlet details | ⬜ |
| 1.2.3 | PUT /outlets/{id} | Outlet updated | ⬜ |
| 1.3.1 | GET /tax/types | Tax types listed | ⬜ |
| 1.3.2 | GET /tax/components | Tax components listed | ⬜ |
| 1.3.3 | POST /tax/groups | GST 5% created | ⬜ |
| 1.3.4 | POST /tax/groups | GST 12% created | ⬜ |
| 1.3.5 | POST /tax/groups | GST 18% created | ⬜ |
| 1.3.6 | GET /tax/groups | All groups listed | ⬜ |

## Phase 2 Verification

| Step | API | Expected | Status |
|------|-----|----------|--------|
| 2.1.1 | POST /outlets/{id}/floors | Ground Floor created | ⬜ |
| 2.1.2 | POST /outlets/{id}/floors | First Floor created | ⬜ |
| 2.2.1 | POST /outlets/{id}/sections | AC Section created | ⬜ |
| 2.2.2 | POST /outlets/{id}/sections | Non-AC Section created | ⬜ |
| 2.3.1 | POST /tables | Tables created | ⬜ |
| 2.4.1 | POST /outlets/{id}/kitchen-stations | Main Kitchen created | ⬜ |
| 2.4.2 | POST /outlets/{id}/kitchen-stations | Bar Station created | ⬜ |

## Phase 3 Verification

| Step | API | Expected | Status |
|------|-----|----------|--------|
| 3.1.1 | GET /users/roles | 8 roles listed | ⬜ |
| 3.1.2 | GET /users/permissions | Permissions grouped | ⬜ |
| 3.2.1 | POST /users | Manager created | ⬜ |
| 3.3.1 | POST /users | Captain created | ⬜ |
| 3.4.1 | POST /users | Cashier created | ⬜ |
| 3.5.1 | POST /users | Kitchen staff created | ⬜ |
| 3.6.1 | POST /users/{id}/stations | Station assigned | ⬜ |

---

# Error Responses

## 400 Bad Request
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    { "field": "email", "message": "Email is required" }
  ]
}
```

## 401 Unauthorized
```json
{
  "success": false,
  "message": "Invalid credentials"
}
```

## 403 Forbidden
```json
{
  "success": false,
  "message": "Access denied. Required role: admin"
}
```

## 404 Not Found
```json
{
  "success": false,
  "message": "Resource not found"
}
```

## 409 Conflict
```json
{
  "success": false,
  "message": "Email already exists"
}
```

## 500 Internal Server Error
```json
{
  "success": false,
  "message": "Internal server error"
}
```

---

# Quick Reference: Role Permissions

| Role | Key Permissions |
|------|-----------------|
| **super_admin** | All permissions (*) |
| **admin** | All permissions (*) |
| **manager** | Tables, Orders, KOT, Billing, Payment, Discounts, Menu, Staff, Reports, Settings (view) |
| **captain** | Tables (view, merge, transfer), Orders (view, create, modify), KOT (send, modify, reprint), Bills (view, generate, reprint), Payment (collect, split), Discounts (apply), Reports (view) |
| **cashier** | Same as Captain + Order Cancel, Bill Cancel, Full Discounts, Sales Reports |
| **kitchen** | Orders (view), KOT (send, modify), Items (view, availability), Inventory (view) |
| **bartender** | Tables (view), Orders (view, create), KOT (send), Items (view, availability), Inventory (view) |
| **inventory** | Items (view), Categories (view), Inventory (full), Reports (inventory) |

---

# Next Steps After Phase 1-3

1. **Phase 4:** Create Menu Categories and Items
2. **Phase 5:** Setup Printers
3. **Phase 6:** Test Order Flow (Dine-in, Takeaway)
4. **Phase 7:** Test Billing and Payments
5. **Phase 8:** Test Reports

