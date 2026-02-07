# Captain Events & Status Reference

This document contains the **exact** event names and table statuses used in the backend code.

---

## WebSocket Events (Frontend Receives)

### 1. `table:updated`
Emitted when table status changes.

```javascript
// Frontend listens:
socket.on('table:updated', (data) => { ... });
```

**Payload:**
```javascript
{
  "outletId": 4,
  "floorId": 1,
  "tableId": 1,
  "tableNumber": "T1",
  "status": "occupied",       // Table status
  "event": "session_started", // Event type (see below)
  "sessionId": 30,
  "timestamp": "2026-02-05T12:30:00.000Z"
}
```

**Event Types (in `event` field):**
| Event | Description | Table Status |
|-------|-------------|--------------|
| `session_started` | New session started | `occupied` |
| `session_ended` | Session completed | `available` |
| `status_changed` | Manual status change | Any |
| `tables_merged` | Tables merged together | `occupied` |
| `tables_unmerged` | Tables unmerged | `available` |

---

### 2. `order:updated`
Emitted when order changes.

```javascript
// Frontend listens:
socket.on('order:updated', (data) => { ... });
```

**Payload:**
```javascript
{
  "type": "order:created",  // Event type (see below)
  "outletId": 4,
  "orderId": 35,
  "order": { ... },         // Full order object
  "timestamp": "2026-02-05T12:30:00.000Z"
}
```

**Event Types (in `type` field):**
| Type | Description | When Emitted |
|------|-------------|--------------|
| `order:created` | New order created | Order creation |
| `order:items_added` | Items added to order | Adding items |
| `order:item_modified` | Item quantity changed | Modifying item |
| `order:item_cancelled` | Item cancelled | Cancelling item |
| `order:status_changed` | Order status updated | Status update |
| `order:kot_sent` | KOT sent to kitchen/bar | Sending KOT |
| `order:item_ready` | Single item ready | Kitchen marks ready |
| `order:all_ready` | All items ready | All KOTs ready |
| `order:all_served` | All items served | All KOTs served |
| `order:billed` | Bill generated | Billing |
| `order:payment_received` | Payment processed | Payment |
| `order:cancelled` | Order cancelled | Cancellation |
| `order:transferred` | Order moved to another table | Transfer |

---

### 3. `bill:status`
Emitted when bill status changes (for Captain tracking).

```javascript
// Frontend listens:
socket.on('bill:status', (data) => { ... });
```

**Payload:**
```javascript
{
  "outletId": 4,
  "orderId": 35,
  "tableId": 1,
  "invoiceId": 50,
  "status": "pending",      // Bill status (see below)
  "grandTotal": 1794.37,
  "timestamp": "2026-02-05T12:30:00.000Z"
}
```

**Status Values:**
| Status | Description |
|--------|-------------|
| `pending` | Bill generated, awaiting payment |
| `paid` | Payment completed |

---

### 4. `item:ready`
Emitted when KOT items are ready (for Captain/Waiter).

```javascript
// Frontend listens:
socket.on('item:ready', (data) => { ... });
```

**Payload:**
```javascript
{
  "type": "kot:item_ready",
  "outletId": 4,
  "kotId": 25,
  "kotNumber": "KOT0205001",
  "station": "kitchen",
  "orderId": 35,
  "tableId": 1,
  "tableName": "T1",
  "items": [
    { "id": 1, "name": "Paneer Tikka", "quantity": 2 }
  ]
}
```

---

### 5. `kot:updated`
Emitted when KOT status changes (for Kitchen/Bar Display).

```javascript
// Frontend listens:
socket.on('kot:updated', (data) => { ... });
```

**Payload:**
```javascript
{
  "type": "kot:created",    // Event type (see below)
  "outletId": 4,
  "kotId": 25,
  "station": "kitchen",
  "kot": { ... }
}
```

**Event Types:**
| Type | Description |
|------|-------------|
| `kot:created` | New KOT created |
| `kot:accepted` | KOT accepted by kitchen |
| `kot:preparing` | Preparation started |
| `kot:ready` | KOT ready |
| `kot:item_ready` | Single item ready |
| `kot:served` | KOT served |

---

### 6. `payment:updated`
Emitted when payment is processed (for Cashier).

```javascript
// Frontend listens:
socket.on('payment:updated', (data) => { ... });
```

---

### 7. `notification`
General notifications.

```javascript
// Frontend listens:
socket.on('notification', (data) => { ... });
```

---

## Table Statuses

**Database ENUM Values:**
```sql
ENUM('available', 'occupied', 'running', 'reserved', 'billing', 'cleaning', 'blocked')
```

| Status | Description | When Set |
|--------|-------------|----------|
| `available` | Table is free | Session ended, payment completed |
| `occupied` | Table has active session | Session started, order created |
| `running` | Items being served (optional) | During service |
| `billing` | Awaiting payment | Bill generated |
| `reserved` | Reserved for future | Reservation made |
| `blocked` | Not available | Manually blocked |
| `cleaning` | Needs cleaning (deprecated) | No longer used on session end |

---

## Event → Status Mapping

| Scenario | Event Emitted | Table Status |
|----------|---------------|--------------|
| **Session Started** | `table:updated` with `event: 'session_started'` | `occupied` |
| **Order Created** | `order:updated` with `type: 'order:created'` | `occupied` |
| **KOT Sent** | `order:updated` with `type: 'order:kot_sent'` | `occupied` |
| **Items Ready** | `item:ready` | `occupied` |
| **Items Served** | `order:updated` with `type: 'order:all_served'` | `occupied` |
| **Bill Generated** | `order:updated` with `type: 'order:billed'` + `bill:status` with `status: 'pending'` | `occupied` |
| **Payment Received** | `order:updated` with `type: 'order:payment_received'` + `bill:status` with `status: 'paid'` | `available` |
| **Session Ended** | `table:updated` with `event: 'session_ended'` | `available` |
| **Table Reserved** | `table:updated` with `event: 'status_changed'` | `reserved` |
| **Table Blocked** | `table:updated` with `event: 'status_changed'` | `blocked` |

---

## Socket Rooms

| Room | Format | Who Joins | Events Received |
|------|--------|-----------|-----------------|
| **Outlet** | `outlet:{outletId}` | All apps | All events |
| **Floor** | `floor:{outletId}:{floorId}` | Captain viewing floor | `table:updated` |
| **Captain** | `captain:{outletId}` | Captain app | `order:updated`, `item:ready`, `bill:status` |
| **Cashier** | `cashier:{outletId}` | Cashier app | `order:updated`, `bill:status`, `payment:updated` |
| **Kitchen** | `kitchen:{outletId}` | KDS | `kot:updated` |
| **Station** | `station:{outletId}:{station}` | Specific station | `kot:updated` |

---

## Flutter Integration Example

```dart
// Subscribe to events
socketService.socket?.on('table:updated', (data) {
  final event = data['event'];  // 'session_started', 'session_ended', etc.
  final status = data['status']; // 'available', 'occupied', etc.
  final tableId = data['tableId'];
  
  // Update table in state
  updateTableStatus(tableId, status);
});

socketService.socket?.on('order:updated', (data) {
  final type = data['type'];  // 'order:created', 'order:kot_sent', etc.
  final orderId = data['orderId'];
  
  switch (type) {
    case 'order:created':
      // Handle new order
      break;
    case 'order:item_ready':
      // Show notification to captain
      break;
    case 'order:billed':
      // Update order status to billed
      break;
  }
});

socketService.socket?.on('bill:status', (data) {
  final status = data['status'];  // 'pending', 'paid'
  final tableId = data['tableId'];
  
  if (status == 'paid') {
    // Table will become available
  }
});

socketService.socket?.on('item:ready', (data) {
  final tableName = data['tableName'];
  final items = data['items'];
  
  // Show notification: "Items ready for Table T1"
});
```

---

## Summary Table

| Frontend Event | Backend Channel | Event Type Field | Description |
|----------------|-----------------|------------------|-------------|
| `table:updated` | `table:update` | `event` | Table status changes |
| `order:updated` | `order:update` | `type` | Order lifecycle events |
| `bill:status` | `bill:status` | `status` | Bill pending/paid |
| `item:ready` | `kot:update` | `type` | Items ready to serve |
| `kot:updated` | `kot:update` | `type` | KOT status changes |
| `payment:updated` | `payment:update` | - | Payment processed |
| `notification` | `notification` | - | General notifications |

---

## Code References

| Event | Source File | Function |
|-------|-------------|----------|
| `table:updated` | `table.service.js` | `broadcastTableUpdate()` |
| `order:updated` | `order.service.js` | `emitOrderUpdate()` |
| `order:updated` (KOT) | `kot.service.js` | Various functions |
| `order:updated` (billing) | `billing.service.js` | `generateBill()` |
| `order:updated` (payment) | `payment.service.js` | `processPayment()` |
| `bill:status` | `billing.service.js`, `payment.service.js` | `generateBill()`, `processPayment()` |
| `item:ready` | `socket.js` | `setupRedisPubSub()` |
| `kot:updated` | `kot.service.js` | `emitKotUpdate()` |
