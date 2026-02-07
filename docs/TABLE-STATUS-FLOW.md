# Table Status Flow & Real-time Updates

## Table Statuses

| Status | Description | Can Seat? | Has Order? |
|--------|-------------|-----------|------------|
| `available` | Table is free and ready | ✅ Yes | No |
| `reserved` | Reserved for guest | ❌ No | No |
| `occupied` | Guest seated, order in progress | ❌ No | Yes |
| `running` | Items being served | ❌ No | Yes |
| `billing` | Bill generated, awaiting payment | ❌ No | Yes |
| `blocked` | Table unavailable (maintenance, etc.) | ❌ No | No |

## Status Flow Diagram

```
┌─────────────┐
│  available  │◄────────────────────────────────┐
└──────┬──────┘                                 │
       │                                        │
       ▼ seat guest                             │
┌─────────────┐        ┌─────────────┐          │
│  reserved   │───────►│  occupied   │          │
└─────────────┘        └──────┬──────┘          │
                              │                 │
                              ▼ items served    │
                       ┌─────────────┐          │
                       │   running   │          │
                       └──────┬──────┘          │
                              │                 │
                              ▼ generate bill   │
                       ┌─────────────┐          │
                       │   billing   │          │
                       └──────┬──────┘          │
                              │                 │
                              ▼ payment done    │
                              └─────────────────┘

┌─────────────┐
│   blocked   │  (can be set manually anytime)
└─────────────┘
```

## How Table Status Updates

### 1. Available → Occupied
**Trigger**: Captain starts a table session
```javascript
POST /tables/:tableId/session
{ guestCount: 4, guestName: "John", notes: "Birthday" }
```

### 2. Occupied → Running
**Trigger**: First KOT item is marked as served
```javascript
PUT /kot/:kotId/items/:itemId/status
{ status: "served" }
```

### 3. Running → Billing
**Trigger**: Bill is generated
```javascript
POST /billing/generate
{ orderId: 123 }
```

### 4. Billing → Available
**Trigger**: Payment completed and session ended
```javascript
POST /tables/:tableId/end-session
```

---

## Real-time Updates (WebSocket)

### Captain App WebSocket Setup

```javascript
// Connect to WebSocket
const socket = io('http://localhost:3000');

// Join captain room for outlet-wide updates
socket.emit('join:captain', outletId);

// Join specific floor room for table updates
socket.emit('join:floor', { outletId, floorId });
```

### Events Captain Receives

| Event | Description | When Triggered |
|-------|-------------|----------------|
| `table:updated` | Table status changed | Session start/end, status change |
| `order:updated` | Order modified | Items added, order status change |
| `item:ready` | KOT item ready to serve | Kitchen marks item ready |

### Event Payloads

**table:updated**
```json
{
  "tableId": 6,
  "tableNumber": "T6",
  "oldStatus": "available",
  "newStatus": "occupied",
  "changedBy": 1,
  "timestamp": "2026-02-05T10:30:00Z"
}
```

**item:ready**
```json
{
  "type": "kot:item_ready",
  "outletId": 4,
  "orderId": 24,
  "kotId": 56,
  "itemName": "Butter Chicken",
  "station": "kitchen",
  "tableNumber": "T6"
}
```

---

## Captain App API Integration (Minimal)

### Only 2 APIs Needed

#### 1. Floor Tables (with KOT Summary)
```
GET /tables/floor/:floorId
```

**Response includes:**
- All tables on floor with status
- Active session info (guest count, duration, captain)
- Order info (order number, total amount)
- KOT summary (pending, preparing, ready counts)
- Item count

**Use case**: Dashboard view showing all tables

#### 2. Table Details (Full Info)
```
GET /tables/:tableId
```

**Response includes:**
- Complete table info
- Session details
- Captain assignment
- Order with all items (variants, addons, prices)
- All KOTs with status
- Billing info (if applicable)
- Status summary

**Use case**: When captain taps on a table to see details

---

## Optimized Captain Workflow

### Initial Load
1. Connect WebSocket
2. Join `captain` and `floor` rooms
3. Call `GET /tables/floor/:floorId` once

### Real-time Updates
- Listen for `table:updated` → Update specific table in UI
- Listen for `item:ready` → Show notification
- Listen for `order:updated` → Refresh order details if viewing

### On Table Tap
- Call `GET /tables/:tableId` for full details

### No Polling Required!
WebSocket events handle all real-time updates automatically.

---

## Example: Captain App State Management

```javascript
// Initial load
const tables = await api.get(`/tables/floor/${floorId}`);
setTables(tables.data.data);

// WebSocket handlers
socket.on('table:updated', (data) => {
  setTables(prev => prev.map(t => 
    t.id === data.tableId 
      ? { ...t, status: data.newStatus }
      : t
  ));
});

socket.on('item:ready', (data) => {
  showNotification(`${data.itemName} ready at ${data.tableNumber}`);
});
```
