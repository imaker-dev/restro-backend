# Realtime Events - Cashier & Captain Module

## Overview

This document details all Socket.IO realtime events for the billing workflow between **Cashier** and **Captain** roles.

---

## Socket Rooms (Join Events)

| Role | Join Event | Room Format | Description |
|------|------------|-------------|-------------|
| **Cashier** | `join:cashier` | `cashier:{outletId}` | Receives billing, payment, order updates |
| **Captain** | `join:captain` | `captain:{outletId}` | Receives order status, KOT ready, bill status |
| **Kitchen** | `join:kitchen` | `kitchen:{outletId}` | Receives KOT tickets |
| **Station** | `join:station` | `station:{outletId}:{station}` | Station-specific KOT |
| **Outlet** | `join:outlet` | `outlet:{outletId}` | All outlet-wide events |
| **Floor** | `join:floor` | `floor:{outletId}:{floorId}` | Table updates for floor |

### Client Connection Example
```javascript
// Connect to socket server
const socket = io('ws://localhost:3000', { transports: ['websocket'] });

// Cashier joins
socket.emit('join:cashier', outletId);

// Captain joins
socket.emit('join:captain', outletId);

// Leave room when done
socket.emit('leave:outlet', outletId);
```

---

## Event Channels & Types

### 1. `order:updated` - Order Lifecycle Events

**Emitted by:** Order Service, KOT Service, Billing Service, Payment Service  
**Listened by:** `cashier`, `captain`, `outlet` rooms

| Event Type | Trigger | Payload |
|------------|---------|---------|
| `order:created` | New order created | `{ type, outletId, order, timestamp }` |
| `order:updated` | Order modified | `{ type, outletId, order, timestamp }` |
| `order:kot_sent` | KOT sent to kitchen | `{ type, outletId, orderId, tickets, timestamp }` |
| `order:item_ready` | Single item ready | `{ type, outletId, orderId, itemId, kotId, timestamp }` |
| `order:all_ready` | All items ready | `{ type, outletId, orderId, timestamp }` |
| `order:all_served` | All items served | `{ type, outletId, orderId, timestamp }` |
| `order:billed` | Bill generated | `{ type, outletId, orderId, invoice, timestamp }` |
| `order:payment_received` | Payment processed | `{ type, outletId, orderId, payment, orderStatus, timestamp }` |
| `order:cancelled` | Order cancelled | `{ type, outletId, orderId, reason, timestamp }` |

#### Payload Examples

**order:kot_sent**
```json
{
  "type": "order:kot_sent",
  "outletId": 4,
  "orderId": 123,
  "tickets": [
    { "id": 45, "token_number": "K001", "station": "kitchen", "items": [...] }
  ],
  "timestamp": "2026-02-10T10:30:00.000Z"
}
```

**order:billed**
```json
{
  "type": "order:billed",
  "outletId": 4,
  "orderId": 123,
  "invoice": {
    "id": 78,
    "invoice_number": "INV-2026-0001",
    "grand_total": "1250.00",
    "status": "pending"
  },
  "timestamp": "2026-02-10T10:45:00.000Z"
}
```

**order:payment_received**
```json
{
  "type": "order:payment_received",
  "outletId": 4,
  "orderId": 123,
  "payment": {
    "id": 56,
    "payment_mode": "cash",
    "amount": "1250.00",
    "tip_amount": "50.00"
  },
  "orderStatus": "paid",
  "timestamp": "2026-02-10T10:50:00.000Z"
}
```

---

### 2. `bill:status` - Billing Status Events

**Emitted by:** Billing Service, Payment Service  
**Listened by:** `cashier`, `captain`, `outlet` rooms

**Purpose:** Real-time tracking of bill/payment status for Captain to know when payment is complete.

| Bill Status | Meaning |
|-------------|---------|
| `pending` | Bill generated, awaiting payment |
| `partial` | Partial payment received (split payment in progress) |
| `paid` | Full payment received, order complete |

#### Payload Structure
```json
{
  "outletId": 4,
  "orderId": 123,
  "tableId": 5,
  "tableNumber": "T5",
  "invoiceId": 78,
  "invoiceNumber": "INV-2026-0001",
  "billStatus": "pending|partial|paid",
  "grandTotal": "1250.00",
  "amountPaid": "500.00",
  "timestamp": "2026-02-10T10:45:00.000Z"
}
```

#### Flow Diagram
```
┌─────────────┐    bill:status     ┌─────────────┐
│   CASHIER   │ ─────────────────► │   CAPTAIN   │
│             │   (pending)        │             │
│ Generate    │                    │ Sees bill   │
│ Bill        │                    │ is ready    │
└─────────────┘                    └─────────────┘
       │                                  │
       ▼                                  ▼
┌─────────────┐    bill:status     ┌─────────────┐
│   CASHIER   │ ─────────────────► │   CAPTAIN   │
│             │   (paid)           │             │
│ Collect     │                    │ Table can   │
│ Payment     │                    │ be cleared  │
└─────────────┘                    └─────────────┘
```

---

### 3. `kot:updated` - Kitchen Order Ticket Events

**Emitted by:** KOT Service  
**Listened by:** `kitchen`, `captain`, `cashier`, `station` rooms

| Event Type | Trigger | Who Listens |
|------------|---------|-------------|
| `kot:sent` | New KOT created | Kitchen, Captain, Cashier |
| `kot:ready` | KOT fully ready | Captain, Cashier |
| `kot:item_ready` | Single item ready | Captain (for serving) |
| `kot:served` | KOT served | Captain, Cashier |
| `kot:cancelled` | KOT cancelled | Kitchen, Captain, Cashier |

#### Payload Structure
```json
{
  "type": "kot:ready",
  "outletId": 4,
  "station": "kitchen",
  "kot": {
    "id": 45,
    "order_id": 123,
    "token_number": "K001",
    "status": "ready",
    "items": [...]
  },
  "timestamp": "2026-02-10T10:35:00.000Z"
}
```

---

### 4. `table:updated` - Table Status Events

**Emitted by:** Order Service, Payment Service  
**Listened by:** `floor`, `outlet` rooms

| Event Type | Trigger |
|------------|---------|
| `session_started` | Order created, table occupied |
| `session_ended` | Payment complete, table released |
| `merged` | Tables merged |
| `unmerged` | Tables unmerged |

#### Payload Structure
```json
{
  "outletId": 4,
  "tableId": 5,
  "floorId": 1,
  "status": "available|occupied",
  "event": "session_ended",
  "timestamp": "2026-02-10T10:55:00.000Z"
}
```

---

### 5. `payment:updated` - Payment Events

**Emitted by:** Payment Service  
**Listened by:** `cashier`, `outlet` rooms

```json
{
  "outletId": 4,
  "orderId": 123,
  "invoiceId": 78,
  "payment": {
    "id": 56,
    "payment_mode": "upi",
    "amount": "1250.00",
    "transaction_id": "UPI-123456"
  },
  "timestamp": "2026-02-10T10:50:00.000Z"
}
```

---

### 6. `item:ready` - Legacy Event (Backward Compatible)

**Emitted by:** KOT Service (when items are ready)  
**Listened by:** `captain` room only

```json
{
  "type": "kot:item_ready",
  "outletId": 4,
  "orderId": 123,
  "kotId": 45,
  "itemId": 67,
  "itemName": "Butter Chicken",
  "tableNumber": "T5",
  "timestamp": "2026-02-10T10:35:00.000Z"
}
```

---

## Complete Billing Workflow Events

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        BILLING WORKFLOW EVENTS                           │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  1. ORDER CREATED                                                        │
│     ├─► order:updated { type: 'order:created' }                         │
│     └─► table:updated { event: 'session_started' }                      │
│                                                                          │
│  2. ITEMS ADDED                                                          │
│     └─► order:updated { type: 'order:updated' }                         │
│                                                                          │
│  3. KOT SENT TO KITCHEN                                                  │
│     ├─► order:updated { type: 'order:kot_sent' }                        │
│     └─► kot:updated { type: 'kot:sent' }                                │
│                                                                          │
│  4. ITEMS READY (Kitchen marks ready)                                    │
│     ├─► kot:updated { type: 'kot:item_ready' }                          │
│     ├─► item:ready (legacy for captain)                                 │
│     └─► order:updated { type: 'order:item_ready' }                      │
│                                                                          │
│  5. ALL ITEMS READY                                                      │
│     └─► order:updated { type: 'order:all_ready' }                       │
│                                                                          │
│  6. ITEMS SERVED (Captain marks served)                                  │
│     ├─► kot:updated { type: 'kot:served' }                              │
│     └─► order:updated { type: 'order:all_served' }                      │
│                                                                          │
│  7. BILL GENERATED (Cashier generates bill)                              │
│     ├─► order:updated { type: 'order:billed' }                          │
│     └─► bill:status { billStatus: 'pending' }  ◄── Captain sees this    │
│                                                                          │
│  8. PAYMENT RECEIVED                                                     │
│     ├─► order:updated { type: 'order:payment_received' }                │
│     ├─► bill:status { billStatus: 'paid' }     ◄── Captain sees this    │
│     ├─► payment:updated                                                 │
│     └─► table:updated { event: 'session_ended' }                        │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Client Implementation Examples

### Cashier Client
```javascript
const socket = io('ws://localhost:3000');
socket.emit('join:cashier', outletId);

// Listen for order updates
socket.on('order:updated', (data) => {
  console.log('Order event:', data.type);
  
  switch (data.type) {
    case 'order:kot_sent':
      // Update order status in UI
      break;
    case 'order:all_ready':
      // Highlight order as ready for billing
      break;
    case 'order:payment_received':
      // Mark order as paid, update cash drawer
      break;
  }
});

// Listen for KOT updates
socket.on('kot:updated', (data) => {
  if (data.type === 'kot:ready') {
    // Show notification that items are ready
  }
});

// Listen for bill status
socket.on('bill:status', (data) => {
  console.log(`Bill ${data.invoiceNumber}: ${data.billStatus}`);
});
```

### Captain Client
```javascript
const socket = io('ws://localhost:3000');
socket.emit('join:captain', outletId);

// Listen for item ready notifications
socket.on('item:ready', (data) => {
  // Alert captain to pick up food from kitchen
  showNotification(`${data.itemName} ready at Table ${data.tableNumber}`);
});

// Listen for KOT updates
socket.on('kot:updated', (data) => {
  if (data.type === 'kot:ready') {
    // Full KOT ready - all items for this ticket
    highlightTable(data.kot.table_id);
  }
});

// Listen for bill status
socket.on('bill:status', (data) => {
  switch (data.billStatus) {
    case 'pending':
      // Show "Bill Requested" on table
      markTableBillPending(data.tableId);
      break;
    case 'paid':
      // Show "Payment Complete" - can clear table
      markTablePaid(data.tableId);
      break;
  }
});

// Listen for order completion
socket.on('order:updated', (data) => {
  if (data.type === 'order:payment_received') {
    // Table is now free
    if (data.orderStatus === 'paid') {
      releaseTable(data.order.table_id);
    }
  }
});
```

---

## Event Summary Table

| Channel | Event Name | Emitter | Cashier Listens | Captain Listens | Kitchen Listens |
|---------|------------|---------|-----------------|-----------------|-----------------|
| `order:update` | `order:updated` | Order/Billing/Payment | ✅ | ✅ | ❌ |
| `bill:status` | `bill:status` | Billing/Payment | ✅ | ✅ | ❌ |
| `kot:update` | `kot:updated` | KOT Service | ✅ | ✅ | ✅ |
| `table:update` | `table:updated` | Order/Payment | ✅ | ❌ | ❌ |
| `payment:update` | `payment:updated` | Payment Service | ✅ | ❌ | ❌ |
| - | `item:ready` | KOT Service | ❌ | ✅ | ❌ |

---

## Redis Pub/Sub Channels

These channels are used internally for cross-worker communication:

| Channel | Description |
|---------|-------------|
| `order:update` | All order lifecycle events |
| `kot:update` | Kitchen ticket events |
| `bill:status` | Billing status changes |
| `table:update` | Table availability changes |
| `payment:update` | Payment transaction events |
| `notification` | General notifications |
