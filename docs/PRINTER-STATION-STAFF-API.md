# Printer, Station & Staff API Documentation

## Overview
This document covers the complete workflow for:
1. **Printer Management** - Create and configure printers
2. **Station Assignment** - Assign printers to stations (kitchen, bar, bill)
3. **Staff Management** - Create users with roles, floors, and sections

---

## Part 1: Printer Management

### Key Concepts

| Term | Description |
|------|-------------|
| **Printer Type** | `kot` (Kitchen Order Ticket), `bot` (Bar Order Ticket), `bill` (Invoice), `report`, `label` |
| **Station** | Physical location: `kitchen`, `bar`, `mocktail`, `dessert`, `cashier`, etc. |
| **Connection Type** | `network` (IP:Port), `usb`, `bluetooth`, `cloud` |
| **Paper Width** | `58mm` or `80mm` |

### Station Values
```
kitchen    - Kitchen KOT printer
bar        - Bar Order Ticket printer
mocktail   - Mocktail station
dessert    - Dessert station
cashier    - Bill printer at cashier counter
bill       - Same as cashier (bill printing)
report     - Report printer
```

---

### 1.1 Create Printer
**POST** `/api/v1/printers`

Creates a new printer and assigns it to a station.

#### Request:
```json
{
  "outletId": 4,
  "name": "Kitchen Main Printer",
  "code": "KIT-01",
  "printerType": "kot",
  "station": "kitchen",
  "ipAddress": "192.168.1.100",
  "port": 9100,
  "connectionType": "network",
  "paperWidth": "80mm",
  "charactersPerLine": 48,
  "supportsCashDrawer": false,
  "supportsCutter": true,
  "supportsLogo": false
}
```

#### Response (201):
```json
{
  "success": true,
  "message": "Printer created",
  "data": {
    "id": 5,
    "uuid": "prn-abc123",
    "code": "KIT-01"
  }
}
```

---

### 1.2 Get All Printers for Outlet
**GET** `/api/v1/printers/outlet/:outletId`

#### Query Parameters (optional):
- `station` - Filter by station (e.g., `kitchen`, `bar`)
- `printerType` - Filter by type (e.g., `kot`, `bill`)
- `isActive` - Filter by active status

#### Response:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "uuid": "prn-001",
      "outlet_id": 4,
      "name": "Kitchen Main",
      "code": "KIT-01",
      "printer_type": "kot",
      "station": "kitchen",
      "ip_address": "192.168.1.100",
      "port": 9100,
      "connection_type": "network",
      "paper_width": "80mm",
      "is_active": true,
      "is_online": true,
      "last_seen_at": "2026-02-19T17:00:00.000Z"
    },
    {
      "id": 2,
      "uuid": "prn-002",
      "name": "Bar Printer",
      "code": "BAR-01",
      "printer_type": "bot",
      "station": "bar",
      "ip_address": "192.168.1.101",
      "port": 9100,
      "is_active": true
    },
    {
      "id": 3,
      "uuid": "prn-003",
      "name": "Cashier Bill Printer",
      "code": "BILL-01",
      "printer_type": "bill",
      "station": "bill",
      "ip_address": "192.168.1.13",
      "port": 9100,
      "supports_cash_drawer": true,
      "is_active": true
    }
  ]
}
```

---

### 1.3 Get Single Printer
**GET** `/api/v1/printers/:id`

#### Response:
```json
{
  "success": true,
  "data": {
    "id": 1,
    "uuid": "prn-001",
    "outlet_id": 4,
    "name": "Kitchen Main",
    "code": "KIT-01",
    "printer_type": "kot",
    "station": "kitchen",
    "ip_address": "192.168.1.100",
    "port": 9100,
    "connection_type": "network",
    "paper_width": "80mm",
    "characters_per_line": 48,
    "supports_cash_drawer": false,
    "supports_cutter": true,
    "supports_logo": false,
    "is_active": true,
    "is_online": true,
    "last_seen_at": "2026-02-19T17:00:00.000Z"
  }
}
```

---

### 1.4 Update Printer
**PUT** `/api/v1/printers/:id`

#### Request:
```json
{
  "name": "Kitchen Main Printer Updated",
  "station": "kitchen",
  "ipAddress": "192.168.1.105",
  "port": 9100,
  "isActive": true
}
```

#### Response:
```json
{
  "success": true,
  "message": "Printer updated"
}
```

---

### 1.5 Test Printer
**POST** `/api/v1/printers/test/:outletId/:station`

Prints a test page to verify printer connectivity.

#### Response:
```json
{
  "success": true,
  "message": "Test page sent to kitchen printer"
}
```

---

### 1.6 Open Cash Drawer
**POST** `/api/v1/printers/drawer/:outletId/open`

Opens cash drawer connected to bill printer.

#### Response:
```json
{
  "success": true,
  "message": "Cash drawer opened"
}
```

---

## Part 2: Print Job Management

### 2.1 Get Pending Print Jobs
**GET** `/api/v1/printers/jobs/:outletId/:station/pending`

#### Response:
```json
{
  "success": true,
  "data": [
    {
      "id": 101,
      "uuid": "job-abc",
      "job_type": "kot",
      "station": "kitchen",
      "reference_number": "KOT-0045",
      "table_number": "T5",
      "status": "pending",
      "content": "...",
      "created_at": "2026-02-19T17:00:00.000Z"
    }
  ]
}
```

---

### 2.2 Mark Job Printed
**POST** `/api/v1/printers/jobs/:id/printed`

#### Response:
```json
{
  "success": true,
  "message": "Job marked as printed"
}
```

---

### 2.3 Mark Job Failed
**POST** `/api/v1/printers/jobs/:id/failed`

#### Request:
```json
{
  "error": "Printer offline"
}
```

---

### 2.4 Retry Failed Job
**POST** `/api/v1/printers/jobs/:id/retry`

---

### 2.5 Cancel Job
**POST** `/api/v1/printers/jobs/:id/cancel`

---

## Part 3: Bridge Agent (Local Printer Bridge)

### 3.1 Create Bridge Agent
**POST** `/api/v1/printers/bridges`

Creates a bridge agent that polls for print jobs.

#### Request:
```json
{
  "outletId": 4,
  "name": "Kitchen Bridge",
  "bridgeCode": "KITCHEN-BRIDGE-01",
  "assignedStations": ["kitchen", "bar"]
}
```

#### Response:
```json
{
  "success": true,
  "data": {
    "id": 1,
    "bridgeCode": "KITCHEN-BRIDGE-01",
    "apiKey": "brg_xxxxxxxxxx"
  }
}
```

---

### 3.2 Bridge Poll (No Auth - Uses API Key)
**GET** `/api/v1/printers/bridge/:outletId/:bridgeCode/poll`

#### Headers:
```
X-Bridge-API-Key: brg_xxxxxxxxxx
```

#### Response:
```json
{
  "job": {
    "id": 101,
    "jobType": "kot",
    "station": "kitchen",
    "content": "...",
    "printer": {
      "ipAddress": "192.168.1.100",
      "port": 9100
    }
  }
}
```

---

### 3.3 Bridge Acknowledge
**POST** `/api/v1/printers/bridge/:outletId/:bridgeCode/jobs/:jobId/ack`

#### Request:
```json
{
  "status": "printed"
}
```

---

## Part 4: Staff/User Management

### Key Concepts

| Term | Description |
|------|-------------|
| **Role** | `super_admin`, `admin`, `manager`, `captain`, `waiter`, `bartender`, `kitchen`, `cashier`, `inventory` |
| **Floor** | Physical floor assignment for captains (Ground Floor, First Floor) |
| **Section** | Service section (Restaurant, Bar, Outdoor) - determines menu access |

### Role Hierarchy
- **Admin Roles** (only admin can manage): `super_admin`, `admin`, `manager`
- **Staff Roles** (manager can manage): `captain`, `waiter`, `bartender`, `kitchen`, `cashier`, `inventory`

---

### 4.1 Get Available Roles
**GET** `/api/v1/users/roles`

#### Response:
```json
{
  "success": true,
  "data": [
    { "id": 1, "name": "Super Admin", "slug": "super_admin" },
    { "id": 2, "name": "Admin", "slug": "admin" },
    { "id": 3, "name": "Manager", "slug": "manager" },
    { "id": 4, "name": "Captain", "slug": "captain" },
    { "id": 5, "name": "Waiter", "slug": "waiter" },
    { "id": 6, "name": "Bartender", "slug": "bartender" },
    { "id": 7, "name": "Kitchen Staff", "slug": "kitchen" },
    { "id": 8, "name": "Cashier", "slug": "cashier" },
    { "id": 9, "name": "Inventory", "slug": "inventory" }
  ]
}
```

---

### 4.2 Create User/Staff
**POST** `/api/v1/users`

Creates a new user with roles, floor assignments, and section access.

#### Request - Simple Staff (Waiter):
```json
{
  "name": "Ramesh Kumar",
  "phone": "9876543210",
  "pin": "1234",
  "roles": [
    { "roleId": 5, "outletId": 4 }
  ]
}
```

#### Request - Captain with Floor & Section:
```json
{
  "name": "Suresh Singh",
  "phone": "9876543211",
  "email": "suresh@restaurant.com",
  "employeeCode": "EMP-101",
  "pin": "5678",
  "password": "Captain@123",
  "roles": [
    { "roleId": 4, "outletId": 4 }
  ],
  "floors": [
    { "floorId": 1, "outletId": 4, "isPrimary": true },
    { "floorId": 2, "outletId": 4, "isPrimary": false }
  ],
  "sections": [
    { "sectionId": 1, "outletId": 4, "canViewMenu": true, "canTakeOrders": true, "isPrimary": true },
    { "sectionId": 2, "outletId": 4, "canViewMenu": true, "canTakeOrders": true }
  ]
}
```

#### Request - Cashier:
```json
{
  "name": "Priya Sharma",
  "phone": "9876543212",
  "pin": "9999",
  "roles": [
    { "roleId": 8, "outletId": 4 }
  ]
}
```

#### Request - Kitchen Staff:
```json
{
  "name": "Mohan Das",
  "phone": "9876543213",
  "pin": "4444",
  "roles": [
    { "roleId": 7, "outletId": 4 }
  ]
}
```

#### Response (201):
```json
{
  "success": true,
  "message": "User created successfully",
  "data": {
    "id": 15,
    "uuid": "usr-abc123",
    "employeeCode": "EMP-101",
    "name": "Suresh Singh",
    "phone": "9876543211",
    "email": "suresh@restaurant.com",
    "isActive": true,
    "roles": [
      { "id": 4, "name": "Captain", "slug": "captain", "outletId": 4 }
    ],
    "assignedFloors": [
      { "floorId": 1, "floorName": "Ground Floor", "isPrimary": true },
      { "floorId": 2, "floorName": "First Floor", "isPrimary": false }
    ],
    "assignedSections": [
      { "sectionId": 1, "sectionName": "Restaurant", "canTakeOrders": true, "isPrimary": true },
      { "sectionId": 2, "sectionName": "Bar", "canTakeOrders": true }
    ]
  }
}
```

---

### 4.3 Get All Users
**GET** `/api/v1/users`

#### Query Parameters:
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 20)
- `search` - Search by name, email, phone, employee code
- `roleId` - Filter by role ID
- `outletId` - Filter by outlet
- `isActive` - Filter by active status
- `sortBy` - `name`, `email`, `created_at`, `last_login_at`
- `sortOrder` - `ASC` or `DESC`

#### Response:
```json
{
  "success": true,
  "data": [
    {
      "id": 15,
      "uuid": "usr-abc123",
      "employeeCode": "EMP-101",
      "name": "Suresh Singh",
      "phone": "9876543211",
      "roles": ["Captain"],
      "isActive": true,
      "lastLoginAt": "2026-02-19T10:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 15,
    "totalPages": 1
  }
}
```

---

### 4.4 Get User by ID
**GET** `/api/v1/users/:id`

#### Response:
```json
{
  "success": true,
  "data": {
    "id": 15,
    "uuid": "usr-abc123",
    "employeeCode": "EMP-101",
    "name": "Suresh Singh",
    "phone": "9876543211",
    "email": "suresh@restaurant.com",
    "isActive": true,
    "isVerified": true,
    "roles": [
      { "id": 4, "name": "Captain", "slug": "captain", "outletId": 4, "outletName": "Main Branch" }
    ],
    "permissions": ["orders.create", "orders.view", "tables.view", "kot.create"],
    "assignedFloors": [
      { "floorId": 1, "floorName": "Ground Floor", "outletId": 4, "isPrimary": true }
    ],
    "assignedSections": [
      { "sectionId": 1, "sectionName": "Restaurant", "canViewMenu": true, "canTakeOrders": true }
    ],
    "lastLoginAt": "2026-02-19T10:00:00.000Z",
    "createdAt": "2026-01-15T08:00:00.000Z"
  }
}
```

---

### 4.5 Update User
**PUT** `/api/v1/users/:id`

#### Request:
```json
{
  "name": "Suresh Singh Updated",
  "phone": "9876543220",
  "pin": "1111",
  "isActive": true,
  "floors": [
    { "floorId": 1, "outletId": 4, "isPrimary": true }
  ],
  "sections": [
    { "sectionId": 1, "outletId": 4, "canViewMenu": true, "canTakeOrders": true }
  ]
}
```

---

### 4.6 Delete User (Soft Delete)
**DELETE** `/api/v1/users/:id`

---

### 4.7 Assign Role to User
**POST** `/api/v1/users/:id/roles`

#### Request:
```json
{
  "roleId": 8,
  "outletId": 4
}
```

---

### 4.8 Remove Role from User
**DELETE** `/api/v1/users/:id/roles`

#### Request:
```json
{
  "roleId": 8,
  "outletId": 4
}
```

---

### 4.9 Get User Permissions
**GET** `/api/v1/users/:id/permissions`

#### Response:
```json
{
  "success": true,
  "data": {
    "permissions": [
      "orders.create",
      "orders.view",
      "orders.update",
      "tables.view",
      "kot.create",
      "kot.view"
    ]
  }
}
```

---

### 4.10 Grant Permissions
**POST** `/api/v1/users/:id/permissions/grant`

#### Request:
```json
{
  "permissions": ["reports.view", "discounts.apply"]
}
```

---

### 4.11 Revoke Permissions
**POST** `/api/v1/users/:id/permissions/revoke`

#### Request:
```json
{
  "permissions": ["discounts.apply"]
}
```

---

## Testing Scenarios

### Scenario 1: Setup Kitchen Printer
```
1. POST /api/v1/printers
   {
     "outletId": 4,
     "name": "Kitchen Printer",
     "code": "KIT-01",
     "printerType": "kot",
     "station": "kitchen",
     "ipAddress": "192.168.1.100",
     "port": 9100
   }

2. POST /api/v1/printers/test/4/kitchen
   → Verify test page prints

3. Create an order with food items
   → KOT should auto-print to kitchen printer
```

### Scenario 2: Setup Bar Printer
```
1. POST /api/v1/printers
   {
     "outletId": 4,
     "name": "Bar Printer",
     "code": "BAR-01",
     "printerType": "bot",
     "station": "bar",
     "ipAddress": "192.168.1.101",
     "port": 9100
   }

2. Create order with bar items
   → BOT prints to bar printer
```

### Scenario 3: Setup Bill Printer with Cash Drawer
```
1. POST /api/v1/printers
   {
     "outletId": 4,
     "name": "Cashier Printer",
     "code": "BILL-01",
     "printerType": "bill",
     "station": "bill",
     "ipAddress": "192.168.1.13",
     "port": 9100,
     "supportsCashDrawer": true
   }

2. Generate bill for order
   → Bill prints and cash drawer opens

3. POST /api/v1/printers/drawer/4/open
   → Cash drawer opens manually
```

### Scenario 4: Create Captain with Floor Assignment
```
1. GET /api/v1/users/roles
   → Find captain roleId (e.g., 4)

2. POST /api/v1/users
   {
     "name": "Captain Raj",
     "phone": "9876543210",
     "pin": "1234",
     "roles": [{ "roleId": 4, "outletId": 4 }],
     "floors": [{ "floorId": 1, "outletId": 4, "isPrimary": true }],
     "sections": [{ "sectionId": 1, "outletId": 4, "canTakeOrders": true }]
   }

3. Login as Captain
   → Should only see tables on assigned floor
   → Should only see menu items from assigned section
```

### Scenario 5: Create Cashier
```
1. POST /api/v1/users
   {
     "name": "Cashier Priya",
     "phone": "9876543211",
     "pin": "5678",
     "roles": [{ "roleId": 8, "outletId": 4 }]
   }

2. Login as Cashier
   → Can generate bills
   → Can process payments
   → Can open cash drawer
```

### Scenario 6: Create Kitchen Staff
```
1. POST /api/v1/users
   {
     "name": "Chef Mohan",
     "phone": "9876543212",
     "pin": "9999",
     "roles": [{ "roleId": 7, "outletId": 4 }]
   }

2. Login as Kitchen Staff
   → Can view KOT screen
   → Can mark items as prepared
```

---

## Role-Based Access Summary

| Role | Capabilities |
|------|-------------|
| **super_admin** | Full system access |
| **admin** | Manage outlet, staff, menu, reports |
| **manager** | Manage staff (not admins), view reports, apply discounts |
| **captain** | Take orders, manage tables on assigned floors |
| **waiter** | Take orders, serve tables |
| **bartender** | View bar orders, mark drinks ready |
| **kitchen** | View KOT, mark items prepared |
| **cashier** | Generate bills, process payments, open drawer |
| **inventory** | Manage stock, purchase orders |

---

## Station Assignment Summary

| Station | Printer Type | Purpose |
|---------|-------------|---------|
| `kitchen` | kot | Kitchen Order Tickets for food items |
| `bar` | bot | Bar Order Tickets for drinks |
| `mocktail` | kot | Mocktail station orders |
| `dessert` | kot | Dessert station orders |
| `bill` / `cashier` | bill | Customer invoices/bills |
| `report` | report | Daily reports |
  
---

## Quick Reference

### Printer Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/printers` | Create printer |
| GET | `/printers/outlet/:outletId` | List printers |
| GET | `/printers/:id` | Get printer |
| PUT | `/printers/:id` | Update printer |
| POST | `/printers/test/:outletId/:station` | Test print |
| POST | `/printers/drawer/:outletId/open` | Open cash drawer |

### User Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/users/roles` | List available roles (filtered by requester) |
| POST | `/users` | Create user |
| GET | `/users` | List users |
| GET | `/users/:id` | Get user |
| PUT | `/users/:id` | Update user |
| DELETE | `/users/:id` | Delete user |
| POST | `/users/:id/roles` | Assign role |
| DELETE | `/users/:id/roles` | Remove role |
| GET | `/users/:id/permissions` | Get permissions |
| POST | `/users/:id/permissions/grant` | Grant permissions |
| POST | `/users/:id/permissions/revoke` | Revoke permissions |
| GET | `/users/:id/stations` | Get user's assigned stations |
| POST | `/users/:id/stations` | Assign station to user |
| DELETE | `/users/:id/stations/:stationId` | Remove station from user |
| GET | `/users/:id/station-printer` | Get printer for user's station |

---

## Part 4: Role Hierarchy & Permissions

### Role Hierarchy

| Category | Roles | Description |
|----------|-------|-------------|
| **Admin Roles** | `super_admin`, `admin`, `manager` | Management and administrative roles |
| **Staff Roles** | `captain`, `waiter`, `bartender`, `kitchen`, `cashier`, `inventory` | Operational staff roles |

### Who Can Manage Which Roles

| Requester Role | Can See | Can Manage |
|----------------|---------|------------|
| `super_admin` | All roles | All roles including admin |
| `admin` | All roles | `manager` + all staff roles |
| `manager` | Staff roles only | Staff roles only |

### Get Roles API (Role-Filtered)
**GET** `/api/v1/users/roles`

Response varies based on authenticated user's role.

#### Response for Admin:
```json
{
  "success": true,
  "data": {
    "roles": [
      { "id": 1, "name": "Super Admin", "slug": "super_admin", "category": "admin", "canManage": false },
      { "id": 2, "name": "Admin", "slug": "admin", "category": "admin", "canManage": false },
      { "id": 3, "name": "Manager", "slug": "manager", "category": "admin", "canManage": true },
      { "id": 4, "name": "Captain", "slug": "captain", "category": "staff", "canManage": true },
      { "id": 5, "name": "Cashier", "slug": "cashier", "category": "staff", "canManage": true },
      { "id": 6, "name": "Kitchen", "slug": "kitchen", "category": "staff", "canManage": true },
      { "id": 7, "name": "Bartender", "slug": "bartender", "category": "staff", "canManage": true },
      { "id": 8, "name": "Inventory", "slug": "inventory", "category": "staff", "canManage": true }
    ],
    "hierarchy": {
      "adminRoles": ["super_admin", "admin", "manager"],
      "staffRoles": ["captain", "waiter", "bartender", "kitchen", "cashier", "inventory"],
      "requesterRole": "admin",
      "canManageAdminRoles": false,
      "canManageManagerRole": true,
      "canManageStaffRoles": true
    }
  }
}
```

#### Response for Manager:
```json
{
  "success": true,
  "data": {
    "roles": [
      { "id": 4, "name": "Captain", "slug": "captain", "category": "staff", "canManage": true },
      { "id": 5, "name": "Cashier", "slug": "cashier", "category": "staff", "canManage": true },
      { "id": 6, "name": "Kitchen", "slug": "kitchen", "category": "staff", "canManage": true },
      { "id": 7, "name": "Bartender", "slug": "bartender", "category": "staff", "canManage": true },
      { "id": 8, "name": "Inventory", "slug": "inventory", "category": "staff", "canManage": true }
    ],
    "hierarchy": {
      "adminRoles": ["super_admin", "admin", "manager"],
      "staffRoles": ["captain", "waiter", "bartender", "kitchen", "cashier", "inventory"],
      "requesterRole": "manager",
      "canManageAdminRoles": false,
      "canManageManagerRole": false,
      "canManageStaffRoles": true
    }
  }
}
```

> **Note:** Manager cannot see or manage admin-level roles. This prevents managers from creating other managers or admins.

---

## Part 5: User Station Assignment (Kitchen/Bar Staff)

### Overview
Kitchen and bartender users can be assigned to specific stations. This determines which printer they use for KOTs.

### Flow
1. Create kitchen stations with printers assigned
2. Create user with `kitchen` or `bartender` role
3. Assign station(s) to user
4. User's KOTs print to their station's printer

### 5.1 Get User's Stations
**GET** `/api/v1/users/:id/stations?outletId=4`

#### Response:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "stationId": 7,
      "stationName": "Main Kitchen",
      "stationCode": "MAIN",
      "stationType": "main_kitchen",
      "outletId": 4,
      "outletName": "Main Restaurant",
      "isPrimary": true,
      "printer": {
        "id": 1,
        "name": "Kitchen Printer",
        "ip": "192.168.1.13",
        "port": 9100,
        "station": "kot_kitchen"
      }
    }
  ]
}
```

### 5.2 Assign Station to User
**POST** `/api/v1/users/:id/stations`

#### Request:
```json
{
  "stationId": 7,
  "outletId": 4,
  "isPrimary": true
}
```

#### Response:
```json
{
  "success": true,
  "message": "Station assigned successfully",
  "data": [
    {
      "stationId": 7,
      "stationName": "Main Kitchen",
      "isPrimary": true,
      "printer": { "id": 1, "name": "Kitchen Printer", "ip": "192.168.1.13" }
    }
  ]
}
```

### 5.3 Remove Station from User
**DELETE** `/api/v1/users/:id/stations/:stationId`

#### Response:
```json
{
  "success": true,
  "message": "Station removed successfully"
}
```

### 5.4 Get User's Station Printer
**GET** `/api/v1/users/:id/station-printer?outletId=4`

Used by kitchen/bar staff to get their printer for KOT printing.

#### Response:
```json
{
  "success": true,
  "data": {
    "printerId": 1,
    "printerName": "Kitchen Printer",
    "printerIp": "192.168.1.13",
    "printerPort": 9100,
    "printerStation": "kot_kitchen",
    "printerType": "thermal"
  }
}
```

> **Fallback Logic:** If no station assigned, system falls back to printer matching user's role:
> - `kitchen` → `kot_kitchen` printer
> - `bartender` → `kot_bar` printer
> - `cashier` → `bill` printer

---

## Role-Station-Printer Mapping

| Role | Default Station Type | Default Printer Station |
|------|---------------------|------------------------|
| `kitchen` | `main_kitchen`, `tandoor`, `wok` | `kot_kitchen` |
| `bartender` | `bar`, `mocktail` | `kot_bar` |
| `cashier` | - | `bill` |

### Setup Flow
1. **Create Printer:** `POST /printers` with `station: "kot_kitchen"`
2. **Create Kitchen Station:** `POST /kitchen-stations` with `printer_id`
3. **Create Kitchen User:** `POST /users` with `roleId: 6` (kitchen)
4. **Assign Station:** `POST /users/:id/stations`

Now when kitchen user needs to print KOT, call `GET /users/:id/station-printer` to get printer info.
