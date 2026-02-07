# Captain API Guide - Complete Order & Table Lifecycle

## Table of Contents
1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Table Lifecycle](#table-lifecycle)
4. [Order Lifecycle](#order-lifecycle)
5. [Complete Flow Examples](#complete-flow-examples)
6. [Error Handling](#error-handling)
7. [WebSocket Events](#websocket-events)

---

## Overview

This guide covers the complete API flow for a Captain/Waiter in the RestroPOS system, including:
- Table session management
- Order creation and management
- KOT (Kitchen Order Ticket) workflow
- Billing (Captain generates bill only)
- Payment is handled by Cashier (separate role)

### Base URL
```
http://localhost:3000/api/v1
```

### Role Permissions
| Role | Can Start Session | Can Create Order | Can Add Items | Can Generate Bill | Can Process Payment | Can Transfer Table |
|------|-------------------|------------------|---------------|-------------------|---------------------|-------------------|
| Captain | ✅ | ✅ (own session) | ✅ (own order) | ✅ | ❌ | ❌ |
| Waiter | ✅ | ✅ (own session) | ✅ (own order) | ✅ | ❌ | ❌ |
| Manager | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Cashier | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Admin | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## Authentication

### 1. Login with Email/Password

```http
POST /auth/login
Content-Type: application/json
```

**Request:**
```json
{
  "email": "captain@restaurant.com",
  "password": "Captain@123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 86400,
    "user": {
      "id": 98,
      "name": "Captain All Access",
      "email": "captain@restaurant.com",
      "employeeCode": "CAP001",
      "roles": [
        {
          "roleId": 5,
          "roleName": "Captain",
          "outletId": 4,
          "outletName": "Main Restaurant"
        }
      ]
    }
  }
}
```

### 2. Login with PIN (Quick Access)

```http
POST /auth/login/pin
Content-Type: application/json
```

**Request:**
```json
{
  "employeeCode": "CAP001",
  "pin": "1234",
  "outletId": 4
}
```

**Response:** Same as email login

### 3. Get Current User

```http
GET /auth/me
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 98,
    "name": "Captain All Access",
    "email": "captain@restaurant.com",
    "permissions": ["order.create", "order.view", "kot.send", "bill.generate"]
  }
}
```

---

## Table Lifecycle

### Table Statuses
| Status | Description | Color |
|--------|-------------|-------|
| `available` | Table is free | 🟢 Green |
| `occupied` | Table has active session/order | 🔴 Red |
| `reserved` | Table is reserved | 🟡 Yellow |
| `billing` | Bill generated, awaiting payment | 🟠 Orange |
| `blocked` | Table is blocked (maintenance) | ⚫ Gray |

### 1. Get Floor Tables (Dashboard View)

```http
GET /tables/floor/:floorId
Authorization: Bearer <token>
```

**Example:** `GET /tables/floor/1`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "table_number": "T1",
      "name": "Window Table",
      "capacity": 4,
      "status": "available",
      "floor_id": 1,
      "floor_name": "Ground Floor",
      "section_id": 1,
      "section_name": "Restaurant",
      "current_session": null,
      "current_order": null
    },
    {
      "id": 2,
      "table_number": "T2",
      "name": "Corner Table",
      "capacity": 6,
      "status": "occupied",
      "current_session": {
        "id": 45,
        "guest_count": 4,
        "started_by": 98,
        "captain_name": "Captain All Access",
        "started_at": "2026-02-05T10:30:00.000Z"
      },
      "current_order": {
        "id": 43,
        "order_number": "ORD2602050014",
        "status": "served",
        "total_amount": "1386.00",
        "item_count": 3
      }
    }
  ]
}
```

### 2. Get Real-Time Table Status

```http
GET /tables/realtime/:outletId
Authorization: Bearer <token>
```

**Example:** `GET /tables/realtime/4`

**Response:**
```json
{
  "success": true,
  "data": {
    "floors": [
      {
        "id": 1,
        "name": "Ground Floor",
        "tables": [
          {
            "id": 1,
            "table_number": "T1",
            "status": "available",
            "session": null
          }
        ]
      }
    ],
    "summary": {
      "total": 10,
      "available": 6,
      "occupied": 3,
      "reserved": 1,
      "billing": 0
    }
  }
}
```

### 3. Start Table Session

**When:** Guest arrives and wants to sit at a table

```http
POST /tables/:tableId/session
Authorization: Bearer <token>
Content-Type: application/json
```

**Example:** `POST /tables/1/session`

**Request:**
```json
{
  "guestCount": 4,
  "guestName": "Mr. Sharma",
  "guestPhone": "9876543210",
  "notes": "VIP guest - priority service"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Session started",
  "data": {
    "sessionId": 63,
    "tableId": 1,
    "tableNumber": "T1",
    "guestCount": 4,
    "startedBy": 98,
    "startedAt": "2026-02-05T11:00:00.000Z",
    "status": "active"
  }
}
```

**Table status changes:** `available` → `occupied`

### 4. Get Current Session

```http
GET /tables/:tableId/session
Authorization: Bearer <token>
```

**Example:** `GET /tables/1/session`

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 63,
    "table_id": 1,
    "guest_count": 4,
    "guest_name": "Mr. Sharma",
    "guest_phone": "9876543210",
    "started_by": 98,
    "captain_name": "Captain All Access",
    "started_at": "2026-02-05T11:00:00.000Z",
    "order_id": 45,
    "order_number": "ORD2602050015",
    "order_status": "pending",
    "total_amount": "0.00",
    "item_count": 0,
    "pending_kots": 0
  }
}
```

### 5. End Table Session (Manual)

**Note:** Session auto-ends after payment. Manual end is for cancellation.

```http
DELETE /tables/:tableId/session
Authorization: Bearer <token>
```

**Example:** `DELETE /tables/1/session`

**Response:**
```json
{
  "success": true,
  "message": "Session ended",
  "data": {
    "sessionId": 63,
    "duration": "01:30:00",
    "endedAt": "2026-02-05T12:30:00.000Z"
  }
}
```

**Table status changes:** `occupied` → `available`

### 6. Transfer Table Session (Manager Only)

**When:** Manager needs to assign table to different captain

```http
POST /tables/:tableId/session/transfer
Authorization: Bearer <manager_token>
Content-Type: application/json
```

**Example:** `POST /tables/1/session/transfer`

**Request:**
```json
{
  "newCaptainId": 99
}
```

**Response:**
```json
{
  "success": true,
  "message": "Table session transferred successfully",
  "data": {
    "sessionId": 63,
    "newCaptainId": 99,
    "newCaptainName": "Captain John"
  }
}
```

---

## Order Lifecycle

### Order Statuses
| Status | Description |
|--------|-------------|
| `pending` | Order created, no items sent to kitchen |
| `confirmed` | Order confirmed |
| `preparing` | Items being prepared |
| `ready` | Items ready for serving |
| `served` | All items served to guest |
| `billed` | Bill generated |
| `paid` | Payment received |
| `cancelled` | Order cancelled |

### Item Statuses
| Status | Description |
|--------|-------------|
| `pending` | Item added, not sent to kitchen |
| `sent_to_kitchen` | KOT sent |
| `preparing` | Kitchen acknowledged, preparing |
| `ready` | Item ready for pickup |
| `served` | Item served to guest |
| `cancelled` | Item cancelled |

---

## Step 1: Get Menu

### Get Captain Menu (Simplified)

```http
GET /menu/:outletId/captain?filter=<veg|non_veg|liquor>
Authorization: Bearer <token>
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `filter` | string | Optional. Filter items by type: `veg`, `non_veg`, or `liquor` |
| `floorId` | number | Optional. Filter by floor visibility |
| `sectionId` | number | Optional. Filter by section visibility |

**Filter Behavior:**
- **`veg`** - Returns only vegetarian items (veg, vegan). Excludes liquor categories.
- **`non_veg`** - Returns only non-vegetarian items (non_veg, egg).
- **`liquor`** - Returns only liquor categories (Whiskey, Vodka, Wine, Beer, Cocktails, etc.)

**Examples:**
- `GET /menu/4/captain` - All items
- `GET /menu/4/captain?filter=veg` - Only veg items
- `GET /menu/4/captain?filter=non_veg` - Only non-veg items  
- `GET /menu/4/captain?filter=liquor` - Only liquor items

**Response:**
```json
{
  "success": true,
  "data": {
    "categories": [
      {
        "id": 1,
        "name": "Starters",
        "items": [
          {
            "id": 1,
            "name": "Paneer Tikka",
            "shortName": "P.Tikka",
            "price": "275.00",
            "station": "kitchen",
            "isVeg": true,
            "isAvailable": true,
            "preparationTime": 15,
            "variants": [],
            "addonGroups": []
          },
          {
            "id": 7,
            "name": "Butter Chicken",
            "shortName": "B.Chkn",
            "price": "435.00",
            "station": "kitchen",
            "isVeg": false,
            "isAvailable": true,
            "preparationTime": 20,
            "variants": [
              {
                "id": 1,
                "name": "Half",
                "price": "250.00"
              },
              {
                "id": 2,
                "name": "Full",
                "price": "435.00"
              }
            ],
            "addonGroups": [
              {
                "id": 1,
                "name": "Extra",
                "minSelection": 0,
                "maxSelection": 3,
                "addons": [
                  {"id": 1, "name": "Extra Gravy", "price": "50.00"},
                  {"id": 2, "name": "Extra Butter", "price": "30.00"}
                ]
              }
            ]
          }
        ]
      },
      {
        "id": 2,
        "name": "Beverages",
        "items": [
          {
            "id": 10,
            "name": "Mojito",
            "price": "180.00",
            "station": "bar",
            "isVeg": true
          }
        ]
      }
    ]
  }
}
```

### Search Menu Items

**Global search across:** category name, item name, short name, variant name

```http
GET /menu/:outletId/search?q=<search_term>&filter=<veg|non_veg|liquor>
Authorization: Bearer <token>
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `q` or `query` | string | **Required**. Search term |
| `filter` | string | Optional. Filter results: `veg`, `non_veg`, or `liquor` |
| `floorId` | number | Optional. Filter by floor visibility |
| `sectionId` | number | Optional. Filter by section visibility |
| `limit` | number | Optional. Max results (default: 50) |

**Filter Behavior:**
- **`veg`** - Returns only veg items and non-liquor categories
- **`non_veg`** - Returns only non-veg items
- **`liquor`** - Returns only liquor items and categories

**Examples:**
- `GET /menu/4/search?q=butter` - Search all items
- `GET /menu/4/search?q=butter&filter=veg` - Search only veg items
- `GET /menu/4/search?q=chicken&filter=non_veg` - Search only non-veg items
- `GET /menu/4/search?q=johnnie&filter=liquor` - Search only liquor items

**Response:**
```json
{
  "success": true,
  "data": {
    "query": "bread",
    "matchingCategories": [
      {
        "id": 5,
        "name": "Breads",
        "description": "Indian Breads",
        "icon": "bread",
        "color": "#F5A623",
        "img": null,
        "matchType": "category",
        "itemCount": 4,
        "items": [
          {
            "id": 20,
            "name": "Butter Naan",
            "short": "B.Naan",
            "price": 60,
            "type": "veg",
            "variants": [
              {"id": 1, "name": "Regular", "price": 60, "isDefault": true},
              {"id": 2, "name": "Family Pack (4)", "price": 200}
            ]
          },
          {
            "id": 21,
            "name": "Garlic Naan",
            "short": "G.Naan",
            "price": 70,
            "type": "veg"
          }
        ]
      }
    ],
    "matchingItems": [
      {
        "id": 20,
        "name": "Butter Naan",
        "short": "B.Naan",
        "description": "Soft butter naan",
        "price": 60,
        "type": "veg",
        "categoryId": 5,
        "categoryName": "Breads",
        "variants": [
          {"id": 1, "name": "Regular", "price": 60, "isDefault": true},
          {"id": 2, "name": "Family Pack (4)", "price": 200}
        ],
        "addons": [
          {
            "id": 1,
            "name": "Extra Toppings",
            "required": false,
            "min": 0,
            "max": 3,
            "options": [
              {"id": 1, "name": "Extra Butter", "price": 20},
              {"id": 2, "name": "Cheese", "price": 40}
            ]
          }
        ]
      }
    ],
    "totalCategories": 1,
    "totalItems": 1
  }
}
```

**Search Features:**
- **Partial match:** Searches with LIKE `%term%`
- **Category match:** Returns full category with all items, variants, addons
- **Item match:** Returns item with full details (variants, addons)
- **Variant match:** If variant name matches, returns parent item with all variants

---

## Step 2: Create Order

**Important:** Creating an order automatically uses existing session if captain owns it, or creates new session if none exists.

```http
POST /orders
Authorization: Bearer <token>
Content-Type: application/json
```

**Request:**
```json
{
  "outletId": 4,
  "tableId": 1,
  "floorId": 1,
  "sectionId": 1,
  "orderType": "dine_in",
  "guestCount": 4,
  "customerName": "Mr. Sharma",
  "customerPhone": "9876543210",
  "specialInstructions": "VIP guest - priority service"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Order created",
  "data": {
    "id": 45,
    "uuid": "27783c7a-0dc6-4926-8aaf-3acda65b3c7a",
    "outlet_id": 4,
    "order_number": "ORD2602050016",
    "order_type": "dine_in",
    "table_id": 1,
    "table_session_id": 63,
    "floor_id": 1,
    "section_id": 1,
    "customer_name": "Mr. Sharma",
    "customer_phone": "9876543210",
    "guest_count": 4,
    "status": "pending",
    "subtotal": "0.00",
    "tax_amount": "0.00",
    "total_amount": "0.00",
    "payment_status": "pending",
    "special_instructions": "VIP guest - priority service",
    "created_by": 98,
    "created_at": "2026-02-05T11:05:00.000Z",
    "table_number": "T1",
    "floor_name": "Ground Floor",
    "section_name": "Restaurant",
    "created_by_name": "Captain All Access"
  }
}
```

### Order Types
| Type | Description |
|------|-------------|
| `dine_in` | Table service (requires tableId) |
| `takeaway` | Takeaway order (no table) |
| `delivery` | Delivery order (no table) |
| `online` | Online order (no table) |

---

## Step 3: Add Items to Order

```http
POST /orders/:orderId/items
Authorization: Bearer <token>
Content-Type: application/json
```

**Example:** `POST /orders/45/items`

**Request:**
```json
{
  "items": [
    {
      "itemId": 1,
      "quantity": 2,
      "specialInstructions": "Extra spicy"
    },
    {
      "itemId": 7,
      "variantId": 2,
      "quantity": 1,
      "addons": [1, 2],
      "specialInstructions": "Less oil"
    },
    {
      "itemId": 10,
      "quantity": 2,
      "specialInstructions": "No ice"
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Items added",
  "data": {
    "order": {
      "id": 45,
      "order_number": "ORD2602050016",
      "status": "pending",
      "subtotal": "1195.00",
      "tax_amount": "59.75",
      "total_amount": "1254.75"
    },
    "addedItems": [
      {
        "id": 101,
        "item_id": 1,
        "item_name": "Paneer Tikka",
        "quantity": 2,
        "unit_price": "275.00",
        "total_price": "550.00",
        "status": "pending",
        "station": "kitchen"
      },
      {
        "id": 102,
        "item_id": 7,
        "item_name": "Butter Chicken (Full)",
        "quantity": 1,
        "unit_price": "435.00",
        "addons_total": "80.00",
        "total_price": "515.00",
        "status": "pending",
        "station": "kitchen",
        "addons": [
          {"name": "Extra Gravy", "price": "50.00"},
          {"name": "Extra Butter", "price": "30.00"}
        ]
      },
      {
        "id": 103,
        "item_id": 10,
        "item_name": "Mojito",
        "quantity": 2,
        "unit_price": "180.00",
        "total_price": "360.00",
        "status": "pending",
        "station": "bar"
      }
    ]
  }
}
```

### Add Items - Field Reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `itemId` | number | ✅ | Menu item ID |
| `variantId` | number | ❌ | Variant ID if item has variants |
| `quantity` | number | ✅ | Quantity (min: 0.5) |
| `addons` | number[] | ❌ | Array of addon IDs |
| `specialInstructions` | string | ❌ | Special cooking instructions |
| `isComplimentary` | boolean | ❌ | Mark as complimentary (free) |
| `complimentaryReason` | string | ❌ | Reason if complimentary |

---

## Step 4: Send KOT (Kitchen Order Ticket)

**Important:** This sends all `pending` items to kitchen/bar

```http
POST /orders/:orderId/kot
Authorization: Bearer <token>
```

**Example:** `POST /orders/45/kot`

**Request:** Empty body `{}`

**Response:**
```json
{
  "success": true,
  "message": "KOT sent",
  "data": {
    "order": {
      "id": 45,
      "order_number": "ORD2602050016",
      "status": "preparing",
      "table_number": "T1"
    },
    "tickets": [
      {
        "id": 84,
        "kot_number": "KOT0205020",
        "station": "kitchen",
        "status": "pending",
        "items": [
          {
            "id": 101,
            "name": "Paneer Tikka",
            "quantity": 2,
            "instructions": "Extra spicy"
          },
          {
            "id": 102,
            "name": "Butter Chicken (Full)",
            "quantity": 1,
            "instructions": "Less oil",
            "addons": ["Extra Gravy", "Extra Butter"]
          }
        ]
      },
      {
        "id": 85,
        "kot_number": "KOT0205021",
        "station": "bar",
        "status": "pending",
        "items": [
          {
            "id": 103,
            "name": "Mojito",
            "quantity": 2,
            "instructions": "No ice"
          }
        ]
      }
    ],
    "tableStatus": "occupied"
  }
}
```

---

## Step 5: Kitchen/Bar Processes KOT

### KOT Status Flow
```
pending → accepted → preparing → ready → served
```

### 5.1 Accept KOT (Kitchen Acknowledges)

```http
POST /orders/kot/:kotId/accept
Authorization: Bearer <kitchen_token>
```

**Example:** `POST /orders/kot/84/accept`

**Response:**
```json
{
  "success": true,
  "message": "KOT accepted",
  "data": {
    "id": 84,
    "kot_number": "KOT0205020",
    "status": "accepted",
    "accepted_by": 50,
    "accepted_at": "2026-02-05T11:10:00.000Z"
  }
}
```

### 5.2 Start Preparing

```http
POST /orders/kot/:kotId/preparing
Authorization: Bearer <kitchen_token>
```

**Example:** `POST /orders/kot/84/preparing`

**Response:**
```json
{
  "success": true,
  "message": "Started preparing",
  "data": {
    "id": 84,
    "status": "preparing",
    "started_at": "2026-02-05T11:12:00.000Z"
  }
}
```

### 5.3 Mark KOT Ready

```http
POST /orders/kot/:kotId/ready
Authorization: Bearer <kitchen_token>
```

**Example:** `POST /orders/kot/84/ready`

**Response:**
```json
{
  "success": true,
  "message": "KOT ready",
  "data": {
    "id": 84,
    "status": "ready",
    "ready_at": "2026-02-05T11:25:00.000Z",
    "preparation_time": "15 mins"
  }
}
```

### 5.4 Mark Individual Item Ready

```http
POST /orders/kot/items/:itemId/ready
Authorization: Bearer <kitchen_token>
```

**Example:** `POST /orders/kot/items/101/ready`

---

## Step 6: Mark KOT as Served

**Captain marks KOT as served after delivering to table**

```http
POST /orders/kot/:kotId/served
Authorization: Bearer <token>
```

**Example:** `POST /orders/kot/84/served`

**Response:**
```json
{
  "success": true,
  "message": "KOT served",
  "data": {
    "id": 84,
    "status": "served",
    "served_by": 98,
    "served_at": "2026-02-05T11:30:00.000Z"
  }
}
```

**Order status changes:** `preparing` → `served` (when all KOTs served)

---

## Step 7: Add More Items (Optional)

Repeat Steps 3-6 for additional items.

```http
POST /orders/45/items
```

```json
{
  "items": [
    {
      "itemId": 15,
      "quantity": 1,
      "specialInstructions": "Extra sweet"
    }
  ]
}
```

Then send KOT again:
```http
POST /orders/45/kot
```

---

## Step 8: Update Item Quantity (Before KOT)

**Only for items with status `pending`**

```http
PUT /orders/items/:itemId/quantity
Authorization: Bearer <token>
Content-Type: application/json
```

**Example:** `PUT /orders/items/101/quantity`

**Request:**
```json
{
  "quantity": 3
}
```

**Response:**
```json
{
  "success": true,
  "message": "Quantity updated",
  "data": {
    "id": 101,
    "item_name": "Paneer Tikka",
    "old_quantity": 2,
    "new_quantity": 3,
    "new_total": "825.00"
  }
}
```

---

## Step 9: Cancel Item

**Note:** The `itemId` is the order item ID (from order items list). When an item is cancelled:
- Item status changes to `cancelled`
- If item was sent to kitchen (has KOT), the KOT item status is also updated to `cancelled`
- If all items in a KOT are cancelled, the entire KOT is marked as `cancelled`
- Order totals are automatically recalculated

```http
POST /orders/items/:itemId/cancel
Authorization: Bearer <token>
Content-Type: application/json
```

**Example:** `POST /orders/items/103/cancel`

**How to get itemId:** From the order details response (`GET /orders/:orderId`), each item has an `id` field.

**Request:**
```json
{
  "reason": "Guest changed mind",
  "reasonId": 1,
  "quantity": 1,
  "approvedBy": null
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `reason` | string | ✅ | Reason for cancellation |
| `reasonId` | number | ❌ | Predefined reason ID (from `/orders/cancel-reasons/:outletId`) |
| `quantity` | number | ❌ | Quantity to cancel (default: full quantity) |
| `approvedBy` | number | ❌ | Manager ID if item is preparing/ready (requires approval) |

**Response:**
```json
{
  "success": true,
  "message": "Item cancelled",
  "data": {
    "id": 45,
    "order_number": "ORD2602050016",
    "status": "pending",
    "items": [
      {
        "id": 101,
        "item_name": "Paneer Tikka",
        "quantity": 2,
        "status": "pending"
      },
      {
        "id": 103,
        "item_name": "Mojito",
        "quantity": 1,
        "status": "cancelled",
        "cancel_reason": "Guest changed mind",
        "cancelled_at": "2026-02-05T11:45:00.000Z"
      }
    ],
    "subtotal": "550.00",
    "total_amount": "577.50"
  }
}
```

**Error Cases:**
- Items with status `preparing` or `ready` require manager approval (`approvedBy` field)
- Cannot cancel items after order is billed/paid

---

## Step 10: Generate Bill (Captain)

**Captain generates bill, Cashier processes payment**

```http
POST /orders/:orderId/bill
Authorization: Bearer <token>
Content-Type: application/json
```

**Example:** `POST /orders/45/bill`

**Request:**
```json
{
  "customerName": "Mr. Sharma",
  "customerPhone": "9876543210",
  "customerEmail": "sharma@email.com",
  "customerGstin": "27AABCU9603R1ZM",
  "applyServiceCharge": true,
  "notes": "Thank you for dining with us!"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Bill generated",
  "data": {
    "invoice": {
      "id": 25,
      "invoice_number": "INV/2526/000025",
      "order_id": 45,
      "order_number": "ORD2602050016",
      "subtotal": "1195.00",
      "discount_amount": "0.00",
      "taxable_amount": "1195.00",
      "cgst_amount": "29.88",
      "sgst_amount": "29.88",
      "service_charge": "59.75",
      "round_off": "0.49",
      "grand_total": "1315.00",
      "payment_status": "pending",
      "generated_by": 98,
      "generated_at": "2026-02-05T12:00:00.000Z"
    },
    "items": [
      {
        "name": "Paneer Tikka",
        "quantity": 2,
        "unit_price": "275.00",
        "total": "550.00"
      },
      {
        "name": "Butter Chicken (Full)",
        "quantity": 1,
        "unit_price": "515.00",
        "total": "515.00"
      },
      {
        "name": "Mojito",
        "quantity": 1,
        "unit_price": "180.00",
        "total": "180.00"
      }
    ],
    "taxes": [
      {"name": "CGST", "rate": "2.5%", "amount": "29.88"},
      {"name": "SGST", "rate": "2.5%", "amount": "29.88"}
    ]
  }
}
```

**Table status changes:** `occupied` → `billing`

---

## Step 11: Process Payment (Cashier)

**Note:** This is done by Cashier, not Captain

```http
POST /orders/payment
Authorization: Bearer <cashier_token>
Content-Type: application/json
```

**Request:**
```json
{
  "orderId": 45,
  "invoiceId": 25,
  "paymentMode": "cash",
  "amount": 1500,
  "tipAmount": 100
}
```

**Response:**
```json
{
  "success": true,
  "message": "Payment processed",
  "data": {
    "paymentId": 15,
    "orderId": 45,
    "invoiceId": 25,
    "grandTotal": "1315.00",
    "amountReceived": "1500.00",
    "tipAmount": "100.00",
    "changeAmount": "85.00",
    "paymentMode": "cash",
    "status": "completed",
    "receivedBy": 60,
    "receivedAt": "2026-02-05T12:10:00.000Z"
  }
}
```

**After payment:**
- Order status: `billed` → `paid`
- Table status: `billing` → `available`
- Session auto-ends

### Payment Modes
| Mode | Description |
|------|-------------|
| `cash` | Cash payment |
| `card` | Card payment |
| `upi` | UPI payment |
| `wallet` | Digital wallet |
| `credit` | Credit (for regulars) |
| `split` | Split payment |

### Split Payment

```http
POST /orders/payment/split
Authorization: Bearer <cashier_token>
Content-Type: application/json
```

**Request:**
```json
{
  "orderId": 45,
  "invoiceId": 25,
  "splits": [
    {
      "paymentMode": "cash",
      "amount": 700
    },
    {
      "paymentMode": "upi",
      "amount": 615,
      "upiId": "payment@upi",
      "transactionId": "UPI123456"
    }
  ]
}
```

---

## Complete Flow Examples

### Scenario 1: Simple Dine-In Order

```
1. GET  /tables/floor/1                    → View available tables
2. POST /tables/1/session                  → Start session (optional - auto on order create)
3. GET  /menu/4/captain                    → Get menu
4. POST /orders                            → Create order
5. POST /orders/45/items                   → Add items
6. POST /orders/45/kot                     → Send to kitchen
7. [Kitchen processes: accept → preparing → ready]
8. POST /orders/kot/84/served              → Mark served
9. POST /orders/45/bill                    → Generate bill
10. [Cashier] POST /orders/payment         → Process payment
11. Session auto-ends, table available
```

### Scenario 2: Order with Multiple KOTs

```
1. POST /orders                            → Create order
2. POST /orders/45/items                   → Add initial items
3. POST /orders/45/kot                     → First KOT
4. [Kitchen processes first KOT]
5. POST /orders/45/items                   → Add more items
6. POST /orders/45/kot                     → Second KOT
7. [Kitchen processes second KOT]
8. POST /orders/45/bill                    → Generate bill
9. [Cashier] POST /orders/payment          → Process payment
```

### Scenario 3: Table Transfer

```
1. Captain A: POST /tables/1/session       → Start session
2. Captain A: POST /orders                 → Create order
3. [Manager] POST /tables/1/session/transfer {"newCaptainId": 99}
4. Captain B: POST /orders/45/items        → Can now add items
5. Continue normal flow...
```

---

## Error Handling

### Common Errors

| Error | HTTP Code | Cause | Solution |
|-------|-----------|-------|----------|
| `Table is currently occupied` | 400 | Table has active session from startSession | Use different table or end session first |
| `This table session was started by [Captain Name]...` | 403 | Different captain trying to create order on table with existing session | Get manager to transfer table using `/tables/:id/session/transfer` |
| `Only the assigned captain can modify this order` | 403 | Different captain trying to add items | Get manager to transfer table |
| `Table already has an active order (Order ID: X)` | 400 | Session already has an order linked | Use existing order instead of creating new one |
| `Cannot add items to this order` | 400 | Order is billed/paid/cancelled | Create new order |
| `Item is not available` | 400 | Menu item unavailable | Choose different item |
| `Order not found` | 404 | Invalid order ID | Check order ID |
| `Manager approval required to cancel prepared items` | 403 | Trying to cancel item that is preparing/ready | Include `approvedBy` field with manager ID |

### Error Response Format

```json
{
  "success": false,
  "message": "Only the captain who started this session can create orders. Contact manager to transfer table."
}
```

---

## WebSocket Events

### Subscribe to Events

```javascript
// Connect
const socket = io('http://localhost:3000', {
  auth: { token: 'your_jwt_token' }
});

// Subscribe to table updates
socket.emit('subscribe:tables', { floorId: 1 });

// Subscribe to order updates
socket.emit('subscribe:orders', { outletId: 4 });

// Subscribe to KOT updates
socket.emit('subscribe:kot', { outletId: 4 });
```

### Listen for Events

```javascript
// Table status changed
socket.on('table:status', (data) => {
  // { tableId, tableNumber, status, session }
});

// Order created/updated
socket.on('order:created', (data) => {
  // { order }
});

socket.on('order:updated', (data) => {
  // { order }
});

// KOT updates
socket.on('kot:created', (data) => {
  // { kot, items }
});

socket.on('kot:status', (data) => {
  // { kotId, status }
});

socket.on('kot:ready', (data) => {
  // { kotId, kotNumber, tableNumber }
});
```

---

## Quick Reference

### Captain APIs Summary

| Action | Method | Endpoint |
|--------|--------|----------|
| Login | POST | `/auth/login` |
| Get Tables | GET | `/tables/floor/:floorId` |
| Start Session | POST | `/tables/:id/session` |
| Get Menu | GET | `/menu/:outletId/captain` |
| Create Order | POST | `/orders` |
| Add Items | POST | `/orders/:id/items` |
| Send KOT | POST | `/orders/:id/kot` |
| Mark Served | POST | `/orders/kot/:id/served` |
| Generate Bill | POST | `/orders/:id/bill` |
| Get Order | GET | `/orders/:id` |
| Update Quantity | PUT | `/orders/items/:id/quantity` |
| Cancel Item | POST | `/orders/items/:id/cancel` |
| End Session | DELETE | `/tables/:id/session` |

---

*Last Updated: February 2026*
