# KOT Socket Events - Kitchen Perspective

Complete reference for all socket events related to KOT from the **Kitchen/Station staff perspective**.

---

## Socket Channel & Event Reference

### Channel: `kot:update` (Internal PubSub)

This is the internal Redis PubSub channel. It broadcasts to multiple socket rooms.

### Emitted Socket Event: `kot:updated`

**All KOT events are emitted to the socket event `kot:updated`** with different `type` values.

---

## Event Types & KOT Status Mapping

| Event Type | KOT Status | Triggered By | Kitchen Receives | Captain Receives |
|------------|------------|--------------|------------------|------------------|
| `kot:created` | `pending` | Captain sends KOT | ✅ Yes | ✅ Yes |
| `kot:accepted` | `accepted` | Kitchen accepts | ✅ Yes | ✅ Yes |
| `kot:preparing` | `preparing` | Kitchen starts cooking | ✅ Yes | ✅ Yes |
| `kot:item_ready` | (item level) | Kitchen marks single item | ✅ Yes | ✅ Yes + `item:ready` |
| `kot:ready` | `ready` | Kitchen marks KOT complete | ✅ Yes | ✅ Yes + `item:ready` |
| `kot:served` | `served` | Captain picks up food | ✅ Yes | ✅ Yes |

---

## Socket Rooms for Kitchen

| Room Format | Purpose | Who Joins |
|-------------|---------|-----------|
| `kitchen:{outletId}` | All kitchen KOTs | All kitchen staff |
| `station:{outletId}:{station}` | Station-specific KOTs | Specific station display |
| `bar:{outletId}` | Bar KOTs only | Bartenders |

### Join Room Examples

```javascript
// Kitchen Display System connects
socket.emit('join', { room: `kitchen:4` });
socket.emit('join', { room: `station:4:kitchen` });

// Bar Display System connects
socket.emit('join', { room: `bar:4` });
socket.emit('join', { room: `station:4:bar` });
```

---

## Detailed Event Payloads

### 1. `kot:created` - New KOT Arrives

**When:** Captain sends KOT to kitchen

**KOT Status:** `pending`

```json
{
  "type": "kot:created",
  "outletId": 4,
  "station": "kitchen",
  "kot": {
    "id": 106,
    "kotNumber": "KOT0206012",
    "station": "kitchen",
    "status": "pending",
    "priority": 0,
    "order_id": 57,
    "order_number": "ORD2602060057",
    "table_number": "P1",
    "created_at": "2026-02-06T16:00:00.000Z",
    "items": [
      {
        "id": 139,
        "item_name": "Butter Chicken",
        "variant_name": "Half",
        "quantity": 2,
        "special_instructions": "Extra spicy",
        "status": "pending"
      },
      {
        "id": 140,
        "item_name": "Paneer Tikka",
        "quantity": 1,
        "status": "pending"
      }
    ]
  },
  "timestamp": "2026-02-06T16:00:00.000Z"
}
```

**Kitchen Action:** Display new KOT, play notification sound

---

### 2. `kot:accepted` - Kitchen Acknowledges KOT

**When:** Kitchen staff accepts/acknowledges the KOT

**KOT Status:** `accepted`

**API:** `POST /api/v1/orders/kot/:id/accept`

```json
{
  "type": "kot:accepted",
  "outletId": 4,
  "station": "kitchen",
  "kot": {
    "id": 106,
    "kotNumber": "KOT0206012",
    "status": "accepted",
    "accepted_at": "2026-02-06T16:01:00.000Z",
    "accepted_by": 5
  },
  "timestamp": "2026-02-06T16:01:00.000Z"
}
```

**Kitchen Action:** Move KOT to "Accepted" column  
**Captain sees:** "Kitchen has acknowledged your order"

---

### 3. `kot:preparing` - Kitchen Starts Cooking

**When:** Kitchen staff starts preparing the items

**KOT Status:** `preparing`

**API:** `POST /api/v1/orders/kot/:id/preparing`

```json
{
  "type": "kot:preparing",
  "outletId": 4,
  "station": "kitchen",
  "kot": {
    "id": 106,
    "kotNumber": "KOT0206012",
    "status": "preparing",
    "preparing_at": "2026-02-06T16:02:00.000Z"
  },
  "timestamp": "2026-02-06T16:02:00.000Z"
}
```

**Kitchen Action:** Move KOT to "Preparing" column, start timer  
**Captain sees:** "Kitchen is preparing your order"

---

### 4. `kot:item_ready` - Single Item Ready

**When:** One item in the KOT is ready (before others)

**Item Status:** `ready` (KOT may still be `preparing`)

**API:** `POST /api/v1/orders/kot/items/:itemId/ready`

```json
{
  "type": "kot:item_ready",
  "outletId": 4,
  "station": "kitchen",
  "kot": {
    "id": 106,
    "kotNumber": "KOT0206012",
    "status": "preparing",
    "items": [
      { "id": 139, "item_name": "Butter Chicken", "status": "ready" },
      { "id": 140, "item_name": "Paneer Tikka", "status": "preparing" }
    ]
  },
  "timestamp": "2026-02-06T16:10:00.000Z"
}
```

**Kitchen Action:** Highlight item as ready (green)  
**Captain receives:** Additional `item:ready` event for notification

---

### 5. `kot:ready` - Entire KOT Ready for Pickup

**When:** All items in KOT are cooked and ready

**KOT Status:** `ready`

**API:** `POST /api/v1/orders/kot/:id/ready`

```json
{
  "type": "kot:ready",
  "outletId": 4,
  "station": "kitchen",
  "kot": {
    "id": 106,
    "kotNumber": "KOT0206012",
    "status": "ready",
    "ready_at": "2026-02-06T16:15:00.000Z",
    "items": [
      { "id": 139, "item_name": "Butter Chicken", "status": "ready" },
      { "id": 140, "item_name": "Paneer Tikka", "status": "ready" }
    ]
  },
  "timestamp": "2026-02-06T16:15:00.000Z"
}
```

**Kitchen Action:** Move to "Ready" column, ring bell for pickup  
**Captain receives:** `item:ready` event + push notification "Order ready for Table P1"

---

### 6. `kot:served` - Captain Picked Up Food

**When:** Captain takes food from kitchen window

**KOT Status:** `served`

**API:** `POST /api/v1/orders/kot/:id/served`

```json
{
  "type": "kot:served",
  "outletId": 4,
  "station": "kitchen",
  "kot": {
    "id": 106,
    "kotNumber": "KOT0206012",
    "status": "served",
    "served_at": "2026-02-06T16:17:00.000Z",
    "served_by": 3
  },
  "timestamp": "2026-02-06T16:17:00.000Z"
}
```

**Kitchen Action:** Remove KOT from display (archived)  
**Captain sees:** Order delivered, ready for billing

---

## KOT Status Lifecycle

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        KOT STATUS LIFECYCLE                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌─────────┐    ┌──────────┐    ┌───────────┐    ┌───────┐   ┌──────┐ │
│   │ pending │───>│ accepted │───>│ preparing │───>│ ready │──>│served│ │
│   └─────────┘    └──────────┘    └───────────┘    └───────┘   └──────┘ │
│        │              │               │               │           │     │
│   Event:         Event:          Event:          Event:      Event:     │
│   kot:created    kot:accepted    kot:preparing   kot:ready   kot:served │
│        │              │               │               │           │     │
│   Triggered:     Triggered:      Triggered:     Triggered:   Triggered: │
│   Captain        Kitchen         Kitchen        Kitchen      Captain    │
│   sends KOT      accepts         starts cook    marks ready  picks up   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Socket Routing Matrix

| Event Type | `kitchen:{outletId}` | `station:{outletId}:{station}` | `captain:{outletId}` |
|------------|---------------------|-------------------------------|---------------------|
| `kot:created` | ✅ `kot:updated` | ✅ `kot:updated` | ❌ |
| `kot:accepted` | ✅ `kot:updated` | ✅ `kot:updated` | ❌ |
| `kot:preparing` | ✅ `kot:updated` | ✅ `kot:updated` | ❌ |
| `kot:item_ready` | ✅ `kot:updated` | ✅ `kot:updated` | ✅ `item:ready` |
| `kot:ready` | ✅ `kot:updated` | ✅ `kot:updated` | ✅ `item:ready` |
| `kot:served` | ✅ `kot:updated` | ✅ `kot:updated` | ❌ |

---

## Kitchen Display System (KDS) Implementation

### Socket Connection

```javascript
const io = require('socket.io-client');

// Connect with auth token
const socket = io('http://localhost:3000', {
  auth: { token: kitchenUserToken }
});

// Join kitchen room
socket.on('connect', () => {
  socket.emit('join', { room: `kitchen:${outletId}` });
  socket.emit('join', { room: `station:${outletId}:kitchen` });
});

// Listen for KOT updates
socket.on('kot:updated', (data) => {
  console.log('KOT Event:', data.type);
  
  switch (data.type) {
    case 'kot:created':
      playBeepSound();
      addKotToDisplay(data.kot);
      showNotification(`New KOT: ${data.kot.kotNumber}`);
      break;
      
    case 'kot:accepted':
      moveKotToColumn(data.kot.id, 'accepted');
      break;
      
    case 'kot:preparing':
      moveKotToColumn(data.kot.id, 'preparing');
      startTimer(data.kot.id);
      break;
      
    case 'kot:item_ready':
      highlightItemAsReady(data.kot.id, data.itemId);
      break;
      
    case 'kot:ready':
      moveKotToColumn(data.kot.id, 'ready');
      ringBell();
      break;
      
    case 'kot:served':
      removeKotFromDisplay(data.kot.id);
      break;
  }
});
```

---

## API to Event Mapping

| API Endpoint | Method | Triggers Event | New Status |
|--------------|--------|----------------|------------|
| `/orders/:id/kot` | POST | `kot:created` | `pending` |
| `/orders/kot/:id/accept` | POST | `kot:accepted` | `accepted` |
| `/orders/kot/:id/preparing` | POST | `kot:preparing` | `preparing` |
| `/orders/kot/items/:itemId/ready` | POST | `kot:item_ready` | item: `ready` |
| `/orders/kot/:id/ready` | POST | `kot:ready` | `ready` |
| `/orders/kot/:id/served` | POST | `kot:served` | `served` |

---

## Testing Verification

### Event Verification Tests

| # | Test | API Call | Expected Event | Expected Status |
|---|------|----------|----------------|-----------------|
| 1 | New KOT | `POST /orders/:id/kot` | `kot:created` | `pending` |
| 2 | Accept KOT | `POST /kot/:id/accept` | `kot:accepted` | `accepted` |
| 3 | Start Preparing | `POST /kot/:id/preparing` | `kot:preparing` | `preparing` |
| 4 | Item Ready | `POST /kot/items/:id/ready` | `kot:item_ready` | item: `ready` |
| 5 | KOT Ready | `POST /kot/:id/ready` | `kot:ready` | `ready` |
| 6 | KOT Served | `POST /kot/:id/served` | `kot:served` | `served` |

### Socket Room Tests

| # | Test | Room | Should Receive |
|---|------|------|----------------|
| 1 | Kitchen gets all KOTs | `kitchen:4` | All `kot:updated` events |
| 2 | Kitchen station only | `station:4:kitchen` | Only kitchen KOTs |
| 3 | Bar station only | `station:4:bar` | Only bar KOTs |
| 4 | Captain ready notification | `captain:4` | `item:ready` on ready events |

---

## Polling Fallback APIs (When Socket Not Working)

When the socket connection fails or is unavailable, use these polling APIs to get KOT status updates.

### Recommended Polling Interval

| Scenario | Interval | Description |
|----------|----------|-------------|
| Active kitchen display | 3-5 seconds | Real-time feel during service |
| Background sync | 30 seconds | Periodic sync when idle |
| Socket reconnection fallback | 5 seconds | While attempting to reconnect |

---

### API 1: Get All Active KOTs (Kitchen Dashboard)

**Endpoint:** `GET /api/v1/orders/kot/active`

> **Note:** Outlet ID is automatically taken from the logged-in user's token. No need to pass it.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `station` | string | Filter by station: `kitchen`, `bar`, `mocktail`, `dessert` |
| `status` | string | Filter by status: `pending`, `accepted`, `preparing`, `ready` |

**Examples:**

```bash
# Get ALL active KOTs (pending, accepted, preparing, ready)
GET /api/v1/orders/kot/active

# Get only PENDING KOTs (new orders to accept)
GET /api/v1/orders/kot/active?status=pending

# Get only PENDING KOTs for kitchen station
GET /api/v1/orders/kot/active?station=kitchen&status=pending

# Get only PREPARING KOTs (currently cooking)
GET /api/v1/orders/kot/active?status=preparing

# Get only READY KOTs (waiting for pickup)
GET /api/v1/orders/kot/active?status=ready

# Get all active KOTs for bar station
GET /api/v1/orders/kot/active?station=bar
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 106,
      "kotNumber": "KOT0206012",
      "station": "kitchen",
      "status": "pending",
      "priority": 0,
      "order_id": 57,
      "order_number": "ORD2602060057",
      "table_id": 14,
      "table_number": "P1",
      "table_name": "Patio 1",
      "item_count": 2,
      "ready_count": 0,
      "created_at": "2026-02-06T16:00:00.000Z",
      "items": [
        {
          "id": 139,
          "kot_id": 106,
          "item_name": "Butter Chicken",
          "variant_name": "Half",
          "quantity": 2,
          "special_instructions": "Extra spicy",
          "status": "pending"
        }
      ]
    }
  ]
}
```

---

### API 2: Get Station Dashboard

**Endpoint:** `GET /api/v1/orders/station/:station`

> **Note:** Outlet ID is automatically taken from the logged-in user's token.

Returns active KOTs plus statistics for a specific station.

**Examples:**

```bash
# Kitchen station dashboard
GET /api/v1/orders/station/kitchen

# Bar station dashboard
GET /api/v1/orders/station/bar

# Mocktail station dashboard
GET /api/v1/orders/station/mocktail
```

**Response:**
```json
{
  "success": true,
  "data": {
    "station": "kitchen",
    "kots": [...],
    "stats": {
      "pending_count": 3,
      "preparing_count": 2,
      "ready_count": 1,
      "total_count": 6,
      "avg_prep_time": 12.5
    }
  }
}
```

---

### API 3: Get Single KOT Details

**Endpoint:** `GET /api/v1/orders/kot/:id`

Use this to get updated status of a specific KOT.

**Example:**
```bash
GET /api/v1/orders/kot/106
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 106,
    "kotNumber": "KOT0206012",
    "station": "kitchen",
    "status": "preparing",
    "priority": 0,
    "order_id": 57,
    "order_number": "ORD2602060057",
    "created_at": "2026-02-06T16:00:00.000Z",
    "accepted_at": "2026-02-06T16:01:00.000Z",
    "items": [...]
  }
}
```

---

## Polling Implementation Example

### Kitchen Display with Polling Fallback

```javascript
const STATION = 'kitchen';
let pollInterval = null;
let lastKotState = {};

// Try socket first, fallback to polling
function initKitchenDisplay() {
  connectSocket();
  
  // Start polling as backup
  startPolling();
}

// Polling function - outletId comes from auth token automatically
async function pollKots() {
  try {
    // Get pending KOTs (new orders)
    const pendingRes = await api.get(`/orders/kot/active?station=${STATION}&status=pending`);
    handleNewKots(pendingRes.data.data);
    
    // Get preparing KOTs (cooking)
    const preparingRes = await api.get(`/orders/kot/active?station=${STATION}&status=preparing`);
    handlePreparingKots(preparingRes.data.data);
    
    // Get ready KOTs (waiting pickup)
    const readyRes = await api.get(`/orders/kot/active?station=${STATION}&status=ready`);
    handleReadyKots(readyRes.data.data);
    
  } catch (error) {
    console.error('Polling error:', error);
  }
}

function startPolling() {
  pollInterval = setInterval(pollKots, 5000); // Every 5 seconds
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

// When socket connects, reduce polling frequency
socket.on('connect', () => {
  stopPolling();
  // Optional: Keep slow backup polling
  pollInterval = setInterval(pollKots, 30000); // Every 30 seconds
});

// When socket disconnects, increase polling frequency
socket.on('disconnect', () => {
  stopPolling();
  startPolling(); // Back to 5 seconds
});

// Detect changes and update UI
function handleNewKots(kots) {
  kots.forEach(kot => {
    if (!lastKotState[kot.id]) {
      // New KOT arrived
      playBeepSound();
      addKotToDisplay(kot);
      showNotification(`New KOT: ${kot.kotNumber}`);
    }
    lastKotState[kot.id] = kot;
  });
}

function handlePreparingKots(kots) {
  kots.forEach(kot => {
    const prev = lastKotState[kot.id];
    if (prev && prev.status !== 'preparing') {
      moveKotToColumn(kot.id, 'preparing');
    }
    lastKotState[kot.id] = kot;
  });
}

function handleReadyKots(kots) {
  kots.forEach(kot => {
    const prev = lastKotState[kot.id];
    if (prev && prev.status !== 'ready') {
      moveKotToColumn(kot.id, 'ready');
      ringBell();
    }
    lastKotState[kot.id] = kot;
  });
}
```

---

## Polling vs Socket Comparison

| Feature | Socket | Polling |
|---------|--------|---------|
| Real-time updates | ✅ Instant | ❌ Delayed (poll interval) |
| Server load | ✅ Low | ❌ Higher (repeated requests) |
| Connection required | ✅ Persistent | ✅ Per-request |
| Offline recovery | ❌ Needs reconnect | ✅ Works immediately |
| Battery usage (mobile) | ✅ Lower | ❌ Higher |

**Recommendation:** Use socket as primary with polling as fallback.

---

## API Endpoints for KOT Status Updates

These APIs update KOT status. Call these then poll to verify the change.

| Action | Method | Endpoint | New Status |
|--------|--------|----------|------------|
| Accept KOT | POST | `/orders/kot/:id/accept` | `accepted` |
| Start Preparing | POST | `/orders/kot/:id/preparing` | `preparing` |
| Mark Item Ready | POST | `/orders/kot/items/:itemId/ready` | item: `ready` |
| Mark KOT Ready | POST | `/orders/kot/:id/ready` | `ready` |
| Mark Served | POST | `/orders/kot/:id/served` | `served` |

### Polling After Status Update

```javascript
// After accepting KOT, poll to verify
async function acceptKot(kotId) {
  await api.post(`/orders/kot/${kotId}/accept`);
  
  // Poll to verify status change
  const res = await api.get(`/orders/kot/${kotId}`);
  if (res.data.data.status === 'accepted') {
    console.log('KOT accepted successfully');
    moveKotToColumn(kotId, 'accepted');
  }
}
```

---

## Test Script Location

Run the polling test script:
```bash
node src/tests/test-kot-polling-apis.js
```

