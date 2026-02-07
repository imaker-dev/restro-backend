# Captain App - Complete Workflow Guide

## Overview

This document provides a step-by-step guide for the Captain App workflow in the RestroPOS system. The workflow is designed to be minimal with only **essential APIs** while leveraging **real-time WebSocket** for live updates.

---

## 🎯 Captain App APIs (Minimal Set)

| # | Purpose | Method | Endpoint |
|---|---------|--------|----------|
| 1 | View Floor Tables | GET | `/tables/floor/:floorId` |
| 2 | View Table Details | GET | `/tables/:tableId` |
| 3 | Start Table Session | POST | `/tables/:tableId/session` |
| 4 | Get Menu | GET | `/menu/captain/:outletId` |
| 5 | Create Order | POST | `/orders` |
| 6 | Add Items to Order | POST | `/orders/:orderId/items` |
| 7 | Send KOT | POST | `/orders/:orderId/kot` |
| 8 | Mark KOT Served | POST | `/orders/kot/:kotId/served` |
| 9 | Generate Bill | POST | `/orders/:orderId/bill` |
| 10 | End Session | DELETE | `/tables/:tableId/session` |

---

## 📋 Complete Workflow Steps

### Step 1: View Floor Tables
Captain sees all tables on their assigned floor with real-time status.

```
GET /api/v1/tables/floor/:floorId
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "tableNumber": "T1",
      "status": "available",
      "capacity": 4,
      "shape": "square",
      "sectionName": "Restaurant",
      "session": null,
      "kotSummary": null
    },
    {
      "id": 3,
      "tableNumber": "T3",
      "status": "occupied",
      "capacity": 4,
      "session": {
        "id": 25,
        "guestCount": 2,
        "guestName": "Walk-in",
        "duration": 45,
        "captainName": "Captain John"
      },
      "kotSummary": {
        "pending": 1,
        "preparing": 0,
        "ready": 2,
        "served": 1
      }
    }
  ]
}
```

---

### Step 2: Start Table Session (Seat Guests)
When guests arrive, captain starts a session with guest details.

```
POST /api/v1/tables/:tableId/session
```

**Request:**
```json
{
  "guestCount": 4,
  "guestName": "Mr. Sharma",
  "guestPhone": "9876543210",
  "notes": "Birthday celebration - need cake at 8 PM"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "sessionId": 30,
    "tableId": 1,
    "tableNumber": "T1",
    "status": "occupied",
    "guestCount": 4,
    "guestName": "Mr. Sharma",
    "startedAt": "2026-02-05T12:30:00.000Z"
  }
}
```

**WebSocket Event Emitted:**
```json
{
  "event": "table:update",
  "data": {
    "tableId": 1,
    "status": "occupied",
    "session": { ... }
  }
}
```

---

### Step 3: Get Menu for Ordering
Captain fetches menu with categories, items, variants, and addons.

```
GET /api/v1/menu/captain/:outletId
```

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
            "id": 5,
            "name": "Paneer Tikka",
            "basePrice": 350,
            "station": "kitchen",
            "variants": [
              { "id": 1, "name": "Half", "price": 200 },
              { "id": 2, "name": "Full", "price": 350 }
            ],
            "addons": [
              { "id": 1, "name": "Extra Cheese", "price": 50 }
            ]
          }
        ]
      },
      {
        "id": 10,
        "name": "Beverages",
        "items": [
          {
            "id": 20,
            "name": "Whiskey",
            "basePrice": 450,
            "station": "bar",
            "variants": [
              { "id": 10, "name": "30 ML", "price": 250 },
              { "id": 11, "name": "60 ML", "price": 450 }
            ]
          }
        ]
      }
    ]
  }
}
```

---

### Step 4: Create Order with Items
Captain creates order with selected items, variants, and addons.

```
POST /api/v1/orders
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
  "specialInstructions": "Birthday celebration",
  "items": [
    {
      "itemId": 5,
      "quantity": 2,
      "variantId": 2,
      "addons": [1],
      "specialInstructions": "Less spicy"
    },
    {
      "itemId": 20,
      "quantity": 1,
      "variantId": 11
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 35,
    "orderNumber": "ORD2602050012",
    "tableId": 1,
    "tableNumber": "T1",
    "status": "pending",
    "guestCount": 4,
    "items": [
      {
        "id": 101,
        "itemName": "Paneer Tikka",
        "variantName": "Full",
        "quantity": 2,
        "unitPrice": 350,
        "addons": [{ "name": "Extra Cheese", "price": 50 }],
        "totalPrice": 800,
        "status": "pending",
        "station": "kitchen"
      },
      {
        "id": 102,
        "itemName": "Whiskey",
        "variantName": "60 ML",
        "quantity": 1,
        "unitPrice": 450,
        "totalPrice": 450,
        "status": "pending",
        "station": "bar"
      }
    ],
    "subtotal": 1250,
    "taxAmount": 62.50,
    "totalAmount": 1312.50
  }
}
```

---

### Step 5: Send KOT (Kitchen/Bar Order Tickets)
This is the **key step** - sends items to their respective stations:
- **Kitchen items** → KOT (Kitchen Order Ticket)
- **Bar items** → BOT (Bar Order Ticket)

Each station receives its own ticket with only their items.

```
POST /api/v1/orders/:orderId/kot
```

**Request:** (No body needed - sends all pending items)
```json
{}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "orderId": 35,
    "orderNumber": "ORD2602050012",
    "tableNumber": "T1",
    "tickets": [
      {
        "id": 15,
        "kotNumber": "KOT0205001",
        "station": "kitchen",
        "itemCount": 1,
        "items": [
          {
            "id": 101,
            "name": "Paneer Tikka",
            "variant": "Full",
            "quantity": 2,
            "addons": "Extra Cheese",
            "instructions": "Less spicy"
          }
        ]
      },
      {
        "id": 16,
        "kotNumber": "BOT0205001",
        "station": "bar",
        "itemCount": 1,
        "items": [
          {
            "id": 102,
            "name": "Whiskey",
            "variant": "60 ML",
            "quantity": 1
          }
        ]
      }
    ]
  }
}
```

**Automatic Actions:**
1. ✅ Kitchen items → KOT printed at Kitchen Printer
2. ✅ Bar items → BOT printed at Bar Printer
3. ✅ Table status changes to `running`
4. ✅ Order status changes to `confirmed`

**WebSocket Events Emitted:**
```json
// To Kitchen Station
{
  "event": "kot:created",
  "data": {
    "station": "kitchen",
    "kot": { "id": 15, "kotNumber": "KOT0205001", ... }
  }
}

// To Bar Station
{
  "event": "kot:created",
  "data": {
    "station": "bar",
    "kot": { "id": 16, "kotNumber": "BOT0205001", ... }
  }
}

// To Captain
{
  "event": "order:kot_sent",
  "data": {
    "orderId": 35,
    "tickets": [...]
  }
}
```

---

### Step 6: Kitchen/Bar Processes KOT

#### 6a. Accept KOT (Station acknowledges)
```
POST /api/v1/orders/kot/:kotId/accept
```

#### 6b. Start Preparing
```
POST /api/v1/orders/kot/:kotId/preparing
```

#### 6c. Mark Item Ready
```
POST /api/v1/orders/kot/items/:itemId/ready
```

#### 6d. Mark Entire KOT Ready
```
POST /api/v1/orders/kot/:kotId/ready
```

**WebSocket Event to Captain:**
```json
{
  "event": "kot:ready",
  "data": {
    "kotId": 15,
    "kotNumber": "KOT0205001",
    "station": "kitchen",
    "tableNumber": "T1"
  }
}
```

---

### Step 7: Mark KOT as Served
When captain serves the items to the table.

```
POST /api/v1/orders/kot/:kotId/served
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 15,
    "kotNumber": "KOT0205001",
    "status": "served",
    "servedAt": "2026-02-05T13:00:00.000Z"
  }
}
```

**Automatic Actions:**
- All items in KOT marked as `served`
- If all items served → Order status = `served`

---

### Step 8: Add More Items (Same Table)
Guest orders more items during the meal.

```
POST /api/v1/orders/:orderId/items
```

**Request:**
```json
{
  "items": [
    {
      "itemId": 8,
      "quantity": 1,
      "specialInstructions": "Extra crispy"
    },
    {
      "itemId": 25,
      "quantity": 2
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "addedItems": [
      {
        "id": 103,
        "itemName": "French Fries",
        "quantity": 1,
        "status": "pending",
        "station": "kitchen"
      },
      {
        "id": 104,
        "itemName": "Mojito",
        "quantity": 2,
        "status": "pending",
        "station": "bar"
      }
    ],
    "orderTotal": 1812.50
  }
}
```

**Then Send KOT Again:**
```
POST /api/v1/orders/:orderId/kot
```

This will **ONLY** send the newly added items to their respective stations!

---

### Step 9: Captain Generates Bill Request
When guests are ready to pay, Captain generates a bill request (NO discount/payment handling).

```
POST /api/v1/orders/:orderId/bill
```

**Request (Captain sends empty or minimal):**
```json
{}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "invoiceId": 50,
    "invoiceNumber": "INV/2026/000050",
    "orderId": 35,
    "tableNumber": "T1",
    "floorId": 1,
    "subtotal": 1812.50,
    "taxableAmount": 1812.50,
    "cgst": 90.63,
    "sgst": 90.63,
    "grandTotal": 1993.76,
    "billStatus": "pending",
    "paymentStatus": "pending"
  }
}
```

**Automatic Actions:**
- Table status → `billing`
- Order status → `billed`
- Bill request sent to **Floor/Section Cashier**
- Captain receives real-time bill status updates

**Captain Bill Status (Real-time):**
| Status | Description |
|--------|-------------|
| `pending` | Bill generated, waiting for cashier |
| `processing` | Cashier is handling the bill |
| `paid` | Payment completed, table available |

**WebSocket Event (Captain receives):**
```json
{
  "event": "bill:status",
  "data": {
    "orderId": 35,
    "tableId": 1,
    "tableNumber": "T1",
    "invoiceId": 50,
    "billStatus": "pending",
    "grandTotal": 1993.76
  }
}
```

---

### Step 10: Cashier Processes Payment (Floor/Section Cashier)
Cashier at floor/section receives bill request, applies discounts, and processes payment.

**10a. Get Pending Bills for Floor/Section:**
```
GET /api/v1/orders/bills/pending?floorId=1
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "invoiceId": 50,
      "orderId": 35,
      "tableNumber": "T1",
      "floorId": 1,
      "grandTotal": 1993.76,
      "billStatus": "pending",
      "createdAt": "2026-02-05T12:30:00Z"
    }
  ]
}
```

**10b. Cashier Applies Discount (Optional):**
```
PATCH /api/v1/orders/:orderId/invoice/discount
```

**Request:**
```json
{
  "discountType": "percentage",
  "discountValue": 10,
  "discountReason": "Birthday discount"
}
```

**10c. Cashier Processes Payment:**
```
POST /api/v1/orders/payment
```

**Request:**
```json
{
  "orderId": 35,
  "invoiceId": 50,
  "paymentMode": "cash",
  "amount": 1894.37,
  "tipAmount": 100
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "paymentId": 80,
    "orderId": 35,
    "invoiceId": 50,
    "grandTotal": 1794.37,
    "amountReceived": 1894.37,
    "changeAmount": 0,
    "tipAmount": 100,
    "paymentStatus": "paid"
  }
}
```

**Automatic Actions After Payment:**
- ✅ Order status → `paid`
- ✅ Invoice status → `paid`
- ✅ **Table session auto-ended**
- ✅ **Table status → `available`**
- ✅ Receipt printed

---

### Step 11: Automatic Session End (No Manual Action Required!)
After payment is completed, the system **automatically**:
1. Ends the table session
2. Sets table status to `available`
3. Broadcasts real-time update to Captain

**WebSocket Events (Captain receives):**
```json
{
  "event": "bill:status",
  "data": {
    "orderId": 35,
    "tableId": 1,
    "billStatus": "paid"
  }
}
```

```json
{
  "event": "table:update",
  "data": {
    "tableId": 1,
    "tableNumber": "T1",
    "status": "available",
    "event": "session_ended"
  }
}
```

> **Note:** Captain does NOT need to call `DELETE /tables/:tableId/session` manually. 
> Session ends automatically after payment completion.

---

## 🔄 Real-Time WebSocket Events

### Connection
```javascript
const socket = io('http://localhost:3000', {
  auth: { token: 'Bearer <JWT_TOKEN>' }
});

// Join captain room for floor
socket.emit('join:captain', { floorId: 1 });
```

### Events Captain Receives

| Event | Description | When |
|-------|-------------|------|
| `table:update` | Table status changed | Session start/end, status change |
| `order:created` | New order created | Order creation |
| `order:kot_sent` | KOT sent to kitchen | KOT sent |
| `kot:ready` | KOT is ready | Kitchen marks ready |
| `order:item_ready` | Single item ready | Item marked ready |
| `order:all_ready` | All items ready | Last item ready |
| `order:all_served` | All items served | Last item served |

---

## 📊 Table Status Flow

```
┌──────────────┐
│  AVAILABLE   │ ◄─────────────────────────────────────┐
└──────┬───────┘                                       │
       │ Start Session                                 │
       ▼                                               │
┌──────────────┐                                       │
│   RESERVED   │ (Optional - if reservation)          │
└──────┬───────┘                                       │
       │ Guests Arrive                                 │
       ▼                                               │
┌──────────────┐                                       │
│   OCCUPIED   │ ◄─── Order Created                   │
└──────┬───────┘                                       │
       │ Send KOT                                      │
       ▼                                               │
┌──────────────┐                                       │
│   RUNNING    │ ◄─── Items being prepared/served     │
└──────┬───────┘                                       │
       │ All Served + Generate Bill                    │
       ▼                                               │
┌──────────────┐                                       │
│   BILLING    │ ◄─── Awaiting payment                │
└──────┬───────┘                                       │
       │ Payment Complete + End Session                │
       └───────────────────────────────────────────────┘
```

---

## 🖨️ Printer Routing

| Station | Ticket Type | Printer |
|---------|-------------|---------|
| Kitchen | KOT | Kitchen Printer |
| Bar | BOT | Bar Printer |
| Dessert | KOT | Dessert Printer |
| Mocktail | KOT | Mocktail Printer |
| Billing | Invoice | Bill Printer |

Each KOT/BOT includes:
- Table Number + Floor
- KOT/BOT Number
- Time
- Items with variants, addons, instructions
- Captain Name

---

## 🔐 Authentication

All APIs require JWT token in header:
```
Authorization: Bearer <JWT_TOKEN>
```

Login:
```
POST /api/v1/auth/login
{
  "email": "captain@restropos.com",
  "password": "captain123"
}
```

---

## 📝 Error Handling

All errors follow format:
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message"
  }
}
```

Common errors:
- `401` - Unauthorized (invalid/expired token)
- `403` - Forbidden (insufficient permissions)
- `404` - Resource not found
- `422` - Validation error
- `500` - Server error

---

## ✅ Complete Workflow Summary

```
1. GET /tables/floor/:floorId      → View tables
2. POST /tables/:id/session        → Seat guests
3. GET /menu/captain/:outletId     → Get menu
4. POST /orders                    → Create order with items
5. POST /orders/:id/kot            → Send to Kitchen/Bar
   └── Auto: KOT → Kitchen Printer
   └── Auto: BOT → Bar Printer
6. [Kitchen/Bar processes]
   └── WebSocket: kot:ready → Captain notified
7. POST /orders/kot/:id/served     → Mark served
8. POST /orders/:id/items          → Add more items (if needed)
9. POST /orders/:id/kot            → Send new items only
10. POST /orders/:id/bill          → Generate bill
    └── Auto: Invoice → Bill Printer
11. POST /orders/payment           → Process payment
12. DELETE /tables/:id/session     → End session
    └── Table → AVAILABLE
```

**Total APIs for Captain: 10** (minimal and efficient)
