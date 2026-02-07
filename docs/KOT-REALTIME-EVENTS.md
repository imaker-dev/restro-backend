# KOT & Order Management - Real-time Events Documentation

## Overview

This document describes how **Captain** and **Kitchen Staff** interact with the order and KOT (Kitchen Order Ticket) system, including all real-time WebSocket events that enable instant updates across devices.

---

## Roles & Responsibilities

### Captain (Waiter/Server)
- Takes orders from customers
- Creates/modifies orders
- Sends KOTs to kitchen
- Cancels items or orders (with manager approval if items are prepared)
- Reprints KOTs when needed
- Receives notifications when items are ready

### Kitchen Staff
- Views incoming KOTs in real-time
- Accepts and starts preparing orders
- Marks items/KOTs as ready
- Sees cancelled items immediately
- Uses polling API as fallback if socket fails

---

## Socket Rooms

| Room Pattern | Who Joins | Purpose |
|--------------|-----------|---------|
| `kitchen:{outletId}` | All kitchen staff | All KOT updates |
| `station:{outletId}:{station}` | Station-specific staff | Filtered KOT updates |
| `captain:{outletId}` | Captains/Waiters | Ready notifications |
| `bar:{outletId}` | Bar staff | Bar-specific orders |
| `floor:{outletId}:{floorId}` | Floor managers | Table status updates |

---

## Captain Workflows

### 1. Create Order & Send KOT

```
Captain                          Kitchen
   │                                │
   ├─ POST /orders ────────────────>│
   │  (create order)                │
   │                                │
   ├─ POST /orders/:id/items ──────>│
   │  (add items)                   │
   │                                │
   ├─ POST /orders/:id/kot ────────>│ ──── kot:created ────> Kitchen Display
   │  (send to kitchen)             │
   │                                │
```

**API Endpoints:**
```
POST /api/v1/orders
POST /api/v1/orders/:orderId/items
POST /api/v1/orders/:orderId/kot
```

**Event Emitted:** `kot:created`
- **To Rooms:** `kitchen:{outletId}`, `station:{outletId}:{station}`
- **Payload:** Full KOT object with items

---

### 2. Cancel Item

```
Captain                          Kitchen
   │                                │
   ├─ POST /orders/items/:id/cancel>│ ──── kot:item_cancelled ────> Kitchen Display
   │                                │      (item removed from prep)
   │                                │
```

**API Endpoint:**
```
POST /api/v1/orders/items/:itemId/cancel
Body: { "reason": "Customer changed mind" }
```

**Event Emitted:** `kot:item_cancelled`
- **To Rooms:** `kitchen:{outletId}`, `station:{outletId}:{station}`
- **Payload:** KOT with updated item status

**Note:** No manager approval needed if item is still pending in kitchen.

---

### 3. Cancel Full Order

```
Captain                          Kitchen                    Floor Plan
   │                                │                           │
   ├─ POST /orders/:id/cancel ─────>│ ──── kot:cancelled ──────>│
   │                                │      (per each KOT)       │
   │                                │                           │
   │<───── order:cancelled ─────────│                           │
   │                                │                           │
   │                                │ ──── table:update ───────>│
   │                                │      (table available)    │
```

**API Endpoint:**
```
POST /api/v1/orders/:orderId/cancel
Body: { 
  "reason": "Customer left without ordering",
  "reasonId": 2
}
```

**Captain can cancel their own orders** - no manager approval required.

**Events Emitted:**
| Event | To Rooms | Description |
|-------|----------|-------------|
| `kot:cancelled` | kitchen, station | For each active KOT |
| `order:cancelled` | captain, cashier | Order status update |
| `table:update` | floor | Table becomes available |

**Side Effects:**
- All order items → `cancelled`
- All KOT items → `cancelled`  
- All KOTs → `cancelled`
- Table session → ended
- Table status → `available`

---

### 4. Reprint KOT

```
Captain                          Kitchen
   │                                │
   ├─ POST /orders/kot/:id/reprint >│ ──── kot:reprinted ────> Kitchen Display
   │                                │      (prints with REPRINT label)
   │                                │
```

**API Endpoint:**
```
POST /api/v1/orders/kot/:kotId/reprint
```

**Event Emitted:** `kot:reprinted`
- **To Rooms:** `kitchen:{outletId}`, `station:{outletId}:{station}`
- **Action:** Prints physical KOT with "*** REPRINT ***" label

---

## Kitchen Workflows

### 1. View Active KOTs (Polling Fallback)

```
GET /api/v1/orders/kot/active?station=kitchen
```

**Response:**
```json
{
  "success": true,
  "data": {
    "kots": [
      {
        "id": 123,
        "order_number": "ORD-001",
        "status": "pending",
        "station": "kitchen",
        "items": [...]
      }
    ],
    "stats": {
      "pending_count": 5,
      "preparing_count": 2,
      "ready_count": 1,
      "active_count": 8
    }
  }
}
```

**Note:** Use this API for polling when WebSocket connection fails.

---

### 2. Accept KOT

```
Kitchen                          Captain
   │                                │
   ├─ POST /orders/kot/:id/accept ─>│ ──── kot:accepted ────> Kitchen Display
   │                                │
```

**API Endpoint:**
```
POST /api/v1/orders/kot/:kotId/accept
```

**Event Emitted:** `kot:accepted`

---

### 3. Start Preparing

```
Kitchen                          Captain
   │                                │
   ├─ POST /orders/kot/:id/preparing>│ ──── kot:preparing ────> Kitchen Display
   │                                 │
```

**API Endpoint:**
```
POST /api/v1/orders/kot/:kotId/preparing
```

**Event Emitted:** `kot:preparing`

---

### 4. Mark Item Ready

```
Kitchen                          Captain
   │                                │
   ├─ POST /orders/kot/items/:id/ready>│
   │                                   │
   │ ──── kot:item_ready ─────────────>│
   │ ──── item:ready ─────────────────>│ (captain notification)
   │                                   │
```

**API Endpoint:**
```
POST /api/v1/orders/kot/items/:itemId/ready
```

**Events Emitted:**
- `kot:item_ready` → kitchen, station
- `item:ready` → captain (notification for pickup)

---

### 5. Mark KOT Ready

```
Kitchen                          Captain
   │                                │
   ├─ POST /orders/kot/:id/ready ──>│
   │                                │
   │ ──── kot:ready ───────────────>│
   │ ──── item:ready ──────────────>│ (captain notification)
   │                                │
```

**API Endpoint:**
```
POST /api/v1/orders/kot/:kotId/ready
```

**Events Emitted:**
- `kot:ready` → kitchen, station
- `item:ready` → captain

---

### 6. Mark KOT Served

```
Kitchen                          System
   │                                │
   ├─ POST /orders/kot/:id/served ─>│ ──── kot:served ────> Kitchen Display
   │                                │      (removed from active list)
```

**API Endpoint:**
```
POST /api/v1/orders/kot/:kotId/served
```

**Event Emitted:** `kot:served`

---

## Real-time Events Summary

### Captain → Kitchen Events

| Action | Event | Description |
|--------|-------|-------------|
| Send KOT | `kot:created` | New KOT appears on kitchen display |
| Cancel Item | `kot:item_cancelled` | Item marked cancelled, removed from prep |
| Cancel Order | `kot:cancelled` | All KOTs for order cancelled |
| Reprint KOT | `kot:reprinted` | KOT reprinted with label |

### Kitchen → Captain Events

| Action | Event | Description |
|--------|-------|-------------|
| Accept KOT | `kot:accepted` | KOT acknowledged |
| Start Preparing | `kot:preparing` | Cooking started |
| Item Ready | `kot:item_ready` + `item:ready` | Item ready for pickup |
| KOT Ready | `kot:ready` + `item:ready` | All items ready |
| Served | `kot:served` | KOT completed |

### Order Cancel → Multiple Events

| Event | Target | Purpose |
|-------|--------|---------|
| `kot:cancelled` | kitchen, station | Remove from kitchen display |
| `order:cancelled` | captain, cashier | Update order status |
| `table:update` | floor | Free up table |

---

## Event Payload Structure

### KOT Events Payload
```json
{
  "type": "kot:created",
  "outletId": 4,
  "station": "kitchen",
  "kot": {
    "id": 123,
    "order_id": 456,
    "order_number": "ORD-001",
    "status": "pending",
    "station": "kitchen",
    "items": [
      {
        "id": 1,
        "item_name": "Butter Chicken",
        "quantity": 2,
        "status": "pending",
        "special_instructions": "Extra spicy"
      }
    ]
  },
  "timestamp": "2026-02-07T12:00:00.000Z"
}
```

### Table Update Payload
```json
{
  "outletId": 4,
  "tableId": 14,
  "timestamp": "2026-02-07T12:00:00.000Z"
}
```

---

## Testing

Run the comprehensive test:
```bash
node src/tests/test-cancel-reprint-events.js
```

This tests:
- ✓ Order creation and KOT sending
- ✓ Active KOTs with stats
- ✓ Item cancellation with kitchen notification
- ✓ KOT reprint with printing
- ✓ Kitchen accept and prepare workflow
- ✓ Order cancel requiring manager approval
- ✓ Order cancel for pending items (no approval)

---

## Error Handling

### Order Cancel Errors

| Error | Cause | Solution |
|-------|-------|----------|
| "Order not found" | Invalid order ID | Verify order exists |
| "Order cannot be cancelled" | Already paid/cancelled | N/A |
| "Manager approval required..." | Items are prepared | Add `approvedBy` with manager ID |

### Fallback Polling

If WebSocket connection fails, kitchen display should poll:
```
GET /api/v1/orders/kot/active?station=kitchen
```

Recommended polling interval: 5-10 seconds

---

## Socket Connection Example

### Kitchen Client
```javascript
const socket = io('wss://api.restropos.com', {
  auth: { token: 'kitchen_user_jwt_token' }
});

// Join rooms
socket.emit('join', { room: `kitchen:${outletId}` });
socket.emit('join', { room: `station:${outletId}:kitchen` });

// Listen for events
socket.on('kot:created', (data) => {
  // Add new KOT to display
});

socket.on('kot:item_cancelled', (data) => {
  // Update KOT, mark item cancelled
});

socket.on('kot:cancelled', (data) => {
  // Remove KOT from display
});
```

### Captain Client
```javascript
socket.emit('join', { room: `captain:${outletId}` });

socket.on('item:ready', (data) => {
  // Show notification: "Item ready for pickup!"
});
```
