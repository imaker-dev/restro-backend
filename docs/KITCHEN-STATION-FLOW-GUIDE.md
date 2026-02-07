# Kitchen/Station KOT Flow Guide

Complete documentation for Kitchen Display System (KDS), station management, chef workflow, and printer integration from the **kitchen/bar staff perspective**.

---

## Table of Contents

1. [Station Overview](#station-overview)
2. [Authentication & Access](#authentication--access)
3. [KOT Reception Flow](#kot-reception-flow)
4. [Printer Integration](#printer-integration)
5. [Real-time Socket Events](#real-time-socket-events)
6. [Station Dashboard API](#station-dashboard-api)
7. [KOT Status Update Flow](#kot-status-update-flow)
8. [Complete Scenarios](#complete-scenarios)
9. [Testing Checklist](#testing-checklist)

---

## Station Overview

### Station Types

| Station | Code | Description | Handles |
|---------|------|-------------|---------|
| Kitchen | `kitchen` | Main food preparation | All food items |
| Bar | `bar` | Alcoholic beverages | Liquor, cocktails, beer, wine |
| Mocktail | `mocktail` | Non-alcoholic drinks | Mocktails, juices |
| Dessert | `dessert` | Desserts & sweets | Desserts, ice cream |

### Roles for Station Staff

| Role | Slug | Access Level |
|------|------|--------------|
| Kitchen Staff | `kitchen` | View & update KOTs for kitchen station |
| Bartender | `bartender` | View & update KOTs for bar station |
| Admin/Manager | `admin`, `manager` | Full access to all stations |

---

## Authentication & Access

### Kitchen Staff Login

**Endpoint:** `POST /api/v1/auth/login`

**Request:**
```json
{
  "email": "kitchen@restropos.com",
  "password": "Kitchen@123"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "id": 5,
      "name": "Kitchen Chef",
      "email": "kitchen@restropos.com",
      "roles": ["kitchen"],
      "outlets": [{ "id": 4, "name": "Main Outlet" }]
    }
  }
}
```

### PIN-based Quick Login (for KDS tablets)

**Endpoint:** `POST /api/v1/auth/pin-login`

**Request:**
```json
{
  "outletId": 4,
  "pin": "5555"
}
```

### Test Credentials

| User | Email | Password | PIN | Role |
|------|-------|----------|-----|------|
| Kitchen Chef | kitchen@restropos.com | Kitchen@123 | 5555 | kitchen |
| Bartender | bartender@restropos.com | Bartender@123 | 6666 | bartender |
| Admin | admin@restropos.com | admin123 | 1234 | admin |

---

## KOT Reception Flow

### How Kitchen Receives KOT

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        KOT RECEPTION FLOW                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Captain App                    Server                     Kitchen      │
│      │                            │                           │         │
│      │ POST /orders/:id/kot       │                           │         │
│      │──────────────────────────>│                           │         │
│      │                            │                           │         │
│      │                   ┌────────┴────────┐                  │         │
│      │                   │ 1. Group items  │                  │         │
│      │                   │    by station   │                  │         │
│      │                   │ 2. Create KOT   │                  │         │
│      │                   │    tickets      │                  │         │
│      │                   │ 3. Send to      │                  │         │
│      │                   │    printer      │                  │         │
│      │                   └────────┬────────┘                  │         │
│      │                            │                           │         │
│      │                            │──── TCP Print ──────────>│ PRINTER │
│      │                            │                           │         │
│      │                            │ Socket: kot:created       │         │
│      │                            │─────────────────────────>│ KDS     │
│      │                            │                           │         │
│      │<── Response ───────────────│                           │         │
│      │                            │                           │         │
│      │                            │                           │ BEEP!   │
│      │                            │                           │ + Print │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### KOT Reception Methods

1. **Thermal Printer** - Automatic print when KOT created
2. **Kitchen Display (KDS)** - Real-time WebSocket notification
3. **API Polling** - Fallback for offline scenarios

---

## Printer Integration

### Printer Configuration

Each station can have its own thermal printer configured:

| Printer Station | Type | Typical IP:Port |
|-----------------|------|-----------------|
| kot_kitchen | ESC/POS | 192.168.1.13:9100 |
| kot_bar | ESC/POS | 192.168.1.14:9100 |
| kot_dessert | ESC/POS | 192.168.1.15:9100 |

### KOT Print Format

```
================================
        KITCHEN ORDER TICKET
================================
KOT#: KOT0206010    Table: P1
Time: 06-Feb-2026 15:30
Station: KITCHEN
--------------------------------
QTY  ITEM
--------------------------------
 2   Butter Chicken (Half)
     >> Extra spicy
 1   Paneer Tikka
 2   Garlic Naan
--------------------------------
Order#: ORD2602060052
Captain: Ram Kumar
================================
```

### Print Flow

```
┌──────────────────────────────────────────────────────────────┐
│                    PRINT FLOW                                │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  KOT Service                                                 │
│      │                                                       │
│      ├── Get printer config for station                      │
│      │   SELECT * FROM printers                              │
│      │   WHERE outlet_id=4 AND station='kot_kitchen'         │
│      │                                                       │
│      ├── Format KOT content                                  │
│      │   - Header with KOT#, Table, Time                     │
│      │   - Items with qty, name, instructions                │
│      │   - Footer with order#, captain name                  │
│      │                                                       │
│      ├── Try Direct Print (TCP)                              │
│      │   └── Connect to 192.168.1.13:9100                    │
│      │       └── Send ESC/POS commands                       │
│      │           └── Success → Done                          │
│      │           └── Fail → Queue for retry                  │
│      │                                                       │
│      └── Fallback: Add to print_queue table                  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Printer Status Check

**Endpoint:** `GET /api/v1/printers/:outletId/status`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Kitchen Printer",
      "station": "kot_kitchen",
      "ip_address": "192.168.1.13",
      "port": 9100,
      "status": "online",
      "last_print": "2026-02-06T15:28:00.000Z"
    }
  ]
}
```

---

## Real-time Socket Events

### Socket Connection (Kitchen Display)

```javascript
// Kitchen Display System (KDS) connection
const socket = io('http://localhost:3000', {
  auth: { token: 'Bearer eyJhbGciOiJIUzI1NiIs...' }
});

// Join outlet and station rooms
socket.emit('join:outlet', { outletId: 4 });
socket.emit('join:station', { outletId: 4, station: 'kitchen' });
```

### Events Kitchen Receives

| Event | When | Payload |
|-------|------|---------|
| `kot:created` | New KOT sent | Full KOT object with items |
| `kot:updated` | KOT modified | Updated KOT object |
| `order:item_added` | Items added to existing order | New items info |
| `order:cancelled` | Order cancelled | Order ID |

### New KOT Event Payload

```json
{
  "type": "kot:created",
  "outletId": 4,
  "station": "kitchen",
  "kot": {
    "id": 25,
    "kot_number": "KOT0206010",
    "station": "kitchen",
    "status": "pending",
    "priority": 0,
    "order_id": 52,
    "order_number": "ORD2602060052",
    "table_number": "P1",
    "table_name": "Patio 1",
    "created_at": "2026-02-06T15:30:00.000Z",
    "items": [
      {
        "id": 101,
        "item_name": "Butter Chicken",
        "variant_name": "Half",
        "quantity": 2,
        "special_instructions": "Extra spicy",
        "status": "pending"
      },
      {
        "id": 102,
        "item_name": "Paneer Tikka",
        "quantity": 1,
        "status": "pending"
      }
    ]
  },
  "timestamp": "2026-02-06T15:30:00.000Z"
}
```

### Socket Event Listeners (KDS Implementation)

```javascript
// New KOT received
socket.on('kot:update', (data) => {
  if (data.type === 'kot:created' && data.station === 'kitchen') {
    playBeepSound();
    addKotToDisplay(data.kot);
    showNotification(`New KOT: ${data.kot.kot_number}`);
  }
  
  if (data.type === 'kot:accepted') {
    updateKotStatus(data.kot.id, 'accepted');
  }
  
  if (data.type === 'kot:ready') {
    updateKotStatus(data.kot.id, 'ready');
    highlightAsReady(data.kot.id);
  }
});

// Order updates
socket.on('order:update', (data) => {
  if (data.type === 'order:cancelled') {
    removeOrderKots(data.orderId);
    showAlert(`Order ${data.orderId} cancelled!`);
  }
});
```

---

## Station Dashboard API

### Get Station Dashboard

**Endpoint:** `GET /api/v1/orders/station/:outletId/:station`

**Example:** `GET /api/v1/orders/station/4/kitchen`

**Headers:**
```
Authorization: Bearer <kitchen_user_token>
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "station": "kitchen",
    "kots": [
      {
        "id": 25,
        "kot_number": "KOT0206010",
        "station": "kitchen",
        "status": "pending",
        "priority": 0,
        "order_number": "ORD2602060052",
        "table_number": "P1",
        "table_name": "Patio 1",
        "item_count": 3,
        "ready_count": 0,
        "created_at": "2026-02-06T15:30:00.000Z",
        "items": [
          {
            "id": 101,
            "item_name": "Butter Chicken",
            "variant_name": "Half",
            "quantity": 2,
            "special_instructions": "Extra spicy",
            "status": "pending"
          }
        ]
      },
      {
        "id": 24,
        "kot_number": "KOT0206009",
        "status": "preparing",
        "order_number": "ORD2602060051",
        "table_number": "T5",
        "item_count": 2,
        "ready_count": 1,
        "items": [...]
      }
    ],
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

### Get Active KOTs (Kitchen Only)

**Endpoint:** `GET /api/v1/orders/kot/active/:outletId?station=kitchen`

**Response:** Array of KOTs for the specified station

---

## KOT Status Update Flow

### Status Lifecycle

```
┌────────────────────────────────────────────────────────────────────────┐
│                      KOT STATUS LIFECYCLE                              │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  ┌─────────┐    ┌──────────┐    ┌───────────┐    ┌───────┐    ┌──────┐│
│  │ PENDING │───>│ ACCEPTED │───>│ PREPARING │───>│ READY │───>│SERVED││
│  └─────────┘    └──────────┘    └───────────┘    └───────┘    └──────┘│
│       │                                              │                 │
│       │              Kitchen Chef Actions            │   Captain       │
│       │                                              │   Action        │
│       ▼                                              ▼                 │
│  [New KOT]     [Accept]        [Start Cooking]   [All Items    [Pickup]│
│  arrives       KOT             /Mark Ready       Ready]                │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

### Kitchen Chef Actions

#### 1. Accept KOT (Acknowledge Receipt)

**Endpoint:** `POST /api/v1/orders/kot/:id/accept`

**When:** Chef sees the KOT and acknowledges they'll start preparing

**Request Headers:**
```
Authorization: Bearer <kitchen_user_token>
```

**Response (200):**
```json
{
  "success": true,
  "message": "KOT accepted",
  "data": {
    "id": 25,
    "kot_number": "KOT0206010",
    "status": "accepted",
    "accepted_at": "2026-02-06T15:31:00.000Z",
    "accepted_by": 5
  }
}
```

**Side Effects:**
- Updates `kot_tickets.status` to `accepted`
- Sets `kot_tickets.accepted_at` timestamp
- Emits `kot:accepted` socket event
- Captain app receives notification

---

#### 2. Start Preparing

**Endpoint:** `POST /api/v1/orders/kot/:id/preparing`

**When:** Chef starts cooking the items

**Response (200):**
```json
{
  "success": true,
  "message": "Started preparing",
  "data": {
    "id": 25,
    "status": "preparing",
    "preparing_at": "2026-02-06T15:32:00.000Z"
  }
}
```

**Side Effects:**
- Updates `kot_tickets.status` to `preparing`
- Emits `kot:preparing` socket event

---

#### 3. Mark Single Item Ready

**Endpoint:** `POST /api/v1/orders/kot/items/:itemId/ready`

**When:** One item from the KOT is ready (e.g., appetizer ready before main course)

**Response (200):**
```json
{
  "success": true,
  "message": "Item ready",
  "data": {
    "id": 25,
    "items": [
      { "id": 101, "item_name": "Paneer Tikka", "status": "ready" },
      { "id": 102, "item_name": "Butter Chicken", "status": "preparing" }
    ]
  }
}
```

**Side Effects:**
- Updates `kot_items.status` to `ready`
- Updates `order_items.status` to `ready`
- Emits `kot:item_ready` socket event
- Captain sees individual item as ready for pickup

---

#### 4. Mark Entire KOT Ready

**Endpoint:** `POST /api/v1/orders/kot/:id/ready`

**When:** All items in the KOT are cooked and ready for pickup

**Response (200):**
```json
{
  "success": true,
  "message": "KOT ready",
  "data": {
    "id": 25,
    "status": "ready",
    "ready_at": "2026-02-06T15:45:00.000Z"
  }
}
```

**Side Effects:**
- Updates `kot_tickets.status` to `ready`
- Updates all `kot_items.status` to `ready`
- Updates all `order_items.status` to `ready`
- Emits `kot:ready` socket event
- If ALL KOTs for order are ready, emits `order:all_ready`
- Captain gets notification to pickup food

---

### Captain Actions (Handover)

#### Mark KOT as Served (Captain picks up food)

**Endpoint:** `POST /api/v1/orders/kot/:id/served`

**When:** Captain picks up food from kitchen and delivers to table

**Response (200):**
```json
{
  "success": true,
  "message": "KOT served",
  "data": {
    "id": 25,
    "status": "served",
    "served_at": "2026-02-06T15:47:00.000Z",
    "served_by": 3
  }
}
```

**Side Effects:**
- Updates `kot_tickets.status` to `served`
- Sets `served_by` to captain's user ID
- Updates all `order_items.status` to `served`
- Emits `kot:served` socket event
- If ALL KOTs served, emits `order:all_served`
- Order status changes to `served`

---

## Complete Scenarios

### Scenario 1: Normal KOT Flow (Single Station)

```
Timeline: Table P1, 4 Guests, Kitchen Items Only
═══════════════════════════════════════════════════════════════

15:30:00 │ CAPTAIN: Creates order, adds 3 food items
         │ POST /orders { tableId: 14, items: [...] }
         │
15:30:30 │ CAPTAIN: Sends KOT
         │ POST /orders/52/kot
         │
15:30:31 │ SERVER: Creates KOT ticket (KOT0206010)
         │ SERVER: Groups items → Kitchen station
         │ SERVER: Sends to printer 192.168.1.13:9100
         │ SERVER: Emits socket 'kot:created'
         │
15:30:32 │ KITCHEN PRINTER: Prints KOT ticket
         │ ================================
         │ KOT#: KOT0206010    Table: P1
         │ 2x Butter Chicken >> Extra spicy
         │ 1x Paneer Tikka
         │ ================================
         │
15:30:32 │ KITCHEN KDS: Receives socket event
         │ 🔔 BEEP! New order notification
         │ Displays new KOT in pending queue
         │
15:31:00 │ KITCHEN CHEF: Accepts KOT
         │ POST /orders/kot/25/accept
         │ KDS: Moves to "Accepted" column
         │
15:32:00 │ KITCHEN CHEF: Starts preparing
         │ POST /orders/kot/25/preparing
         │ KDS: Shows cooking timer
         │
15:32:00 │ CAPTAIN APP: Receives 'kot:preparing'
         │ Shows "Kitchen preparing your order"
         │
15:44:00 │ KITCHEN CHEF: Paneer Tikka ready
         │ POST /orders/kot/items/101/ready
         │ KDS: Item highlighted green
         │
15:45:00 │ KITCHEN CHEF: All items ready
         │ POST /orders/kot/25/ready
         │ KDS: KOT moves to "Ready" column
         │ KDS: 🔔 BELL for pickup
         │
15:45:01 │ CAPTAIN APP: Receives 'kot:ready'
         │ 📱 Push notification: "Order ready for Table P1"
         │ Shows pickup alert
         │
15:46:00 │ CAPTAIN: Picks up food from kitchen
         │
15:47:00 │ CAPTAIN: Marks as served (at kitchen window)
         │ POST /orders/kot/25/served
         │ KDS: KOT disappears from display
         │
15:47:00 │ ORDER: Status → 'served'
         │ Ready for billing

═══════════════════════════════════════════════════════════════
```

---

### Scenario 2: Multi-Station KOT (Kitchen + Bar)

```
Timeline: Table T5, Order with Food + Drinks
═══════════════════════════════════════════════════════════════

16:00:00 │ CAPTAIN: Creates order
         │ Items: Biryani (kitchen), Whisky Sour (bar), Lassi (mocktail)
         │
16:00:30 │ CAPTAIN: Sends KOT
         │ POST /orders/53/kot
         │
16:00:31 │ SERVER: Creates 2 KOT tickets
         │ ├── KOT0206011 (kitchen): Biryani
         │ └── BOT0206001 (bar): Whisky Sour, Lassi
         │
16:00:32 │ KITCHEN PRINTER (192.168.1.13): Prints KOT
         │ BAR PRINTER (192.168.1.14): Prints BOT
         │
16:00:32 │ KITCHEN KDS: Receives KOT0206011
         │ BAR KDS: Receives BOT0206001
         │
         │ === PARALLEL PROCESSING ===
         │
16:01:00 │ BAR: Accepts BOT
16:02:00 │ KITCHEN: Accepts KOT
         │
16:05:00 │ BAR: BOT Ready (drinks are faster)
         │ POST /orders/kot/26/ready
         │
16:05:01 │ CAPTAIN: Picks up drinks
         │ POST /orders/kot/26/served
         │
16:20:00 │ KITCHEN: KOT Ready (food takes longer)
         │ POST /orders/kot/25/ready
         │
16:20:01 │ CAPTAIN: Picks up food
         │ POST /orders/kot/25/served
         │
16:20:02 │ ORDER: All KOTs served → Status 'served'

═══════════════════════════════════════════════════════════════
```

---

### Scenario 3: Additional Items After Initial KOT

```
Timeline: Guest orders more items after first KOT
═══════════════════════════════════════════════════════════════

16:30:00 │ INITIAL: Order created with 2 items
         │ KOT#1 sent to kitchen
         │
16:35:00 │ KITCHEN: KOT#1 preparing
         │
16:40:00 │ CAPTAIN: Guest orders 2 more items
         │ POST /orders/53/items { items: [newItem1, newItem2] }
         │
16:40:30 │ CAPTAIN: Sends second KOT
         │ POST /orders/53/kot
         │
16:40:31 │ SERVER: Creates KOT#2 (only new pending items)
         │ KOT#2 prints at kitchen
         │
16:40:32 │ KITCHEN KDS: Shows KOT#2 as separate ticket
         │ KOT#1 still in "Preparing"
         │ KOT#2 in "Pending"
         │
16:45:00 │ KITCHEN: KOT#1 Ready
16:50:00 │ CAPTAIN: KOT#1 Served
         │
16:55:00 │ KITCHEN: KOT#2 Ready
17:00:00 │ CAPTAIN: KOT#2 Served
         │
17:00:01 │ ORDER: All served

═══════════════════════════════════════════════════════════════
```

---

### Scenario 4: Item Cancellation During Preparation

```
Timeline: Item cancelled while kitchen is preparing
═══════════════════════════════════════════════════════════════

17:00:00 │ ORDER: 3 items sent to kitchen (KOT0206015)
         │
17:05:00 │ KITCHEN: Accepts, starts preparing
         │
17:08:00 │ CAPTAIN: Guest cancels 1 item (not yet cooked)
         │ POST /orders/items/105/cancel
         │ { reason: "Customer changed mind" }
         │
17:08:01 │ SERVER: 
         │ ├── Updates order_items.status = 'cancelled'
         │ ├── Updates kot_items.status = 'cancelled'
         │ └── Emits 'order:item_cancelled'
         │
17:08:02 │ KITCHEN KDS: 
         │ 🔔 Alert: "Item cancelled!"
         │ Item shows strikethrough on display
         │ Chef stops preparing that item
         │
17:15:00 │ KITCHEN: Remaining 2 items ready
         │ POST /orders/kot/30/ready
         │
17:16:00 │ CAPTAIN: Picks up 2 items
         │ KOT shows 2 served, 1 cancelled

═══════════════════════════════════════════════════════════════
```

---

### Scenario 5: Priority/Rush Order

```
Timeline: VIP table needs rush order
═══════════════════════════════════════════════════════════════

18:00:00 │ CAPTAIN: Creates priority order
         │ POST /orders { ..., isPriority: true }
         │
18:00:30 │ CAPTAIN: Sends KOT
         │
18:00:31 │ SERVER: Creates KOT with priority = 1
         │ KOT prints with "*** RUSH ***" header
         │
18:00:32 │ KITCHEN KDS:
         │ 🚨 KOT appears at TOP of queue
         │ Highlighted in RED
         │ Extra loud notification
         │
18:01:00 │ KITCHEN: Immediately accepts
         │ Prioritizes over other orders

═══════════════════════════════════════════════════════════════
```

---

### Scenario 6: Printer Offline Fallback

```
Timeline: Kitchen printer is offline
═══════════════════════════════════════════════════════════════

18:30:00 │ CAPTAIN: Sends KOT
         │
18:30:01 │ SERVER: Tries direct print to 192.168.1.13:9100
         │ Connection timeout (printer offline)
         │
18:30:02 │ SERVER: 
         │ ├── Logs printer error
         │ ├── Adds to print_queue table
         │ └── Still emits socket 'kot:created'
         │
18:30:02 │ KITCHEN KDS: Still receives KOT via socket
         │ Shows on display (no print)
         │
18:30:03 │ RESPONSE to captain: 
         │ { success: true, printStatus: "queued" }
         │
18:35:00 │ KITCHEN: Printer back online
         │ Background job retries queued prints
         │ KOT finally prints

═══════════════════════════════════════════════════════════════
```

---

## Kitchen Display System (KDS) UI Flow

### Display Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│  KITCHEN DISPLAY                                     Chef: Kumar  🔔 3  │
├──────────────────┬──────────────────┬──────────────────┬────────────────┤
│     PENDING      │     ACCEPTED     │    PREPARING     │     READY      │
│   (New Orders)   │  (Acknowledged)  │    (Cooking)     │   (Pickup)     │
├──────────────────┼──────────────────┼──────────────────┼────────────────┤
│ ┌──────────────┐ │ ┌──────────────┐ │ ┌──────────────┐ │ ┌────────────┐ │
│ │ KOT0206015   │ │ │ KOT0206014   │ │ │ KOT0206012   │ │ │ KOT0206010 │ │
│ │ Table: P3    │ │ │ Table: T2    │ │ │ Table: T5    │ │ │ Table: P1  │ │
│ │ 5 min ago    │ │ │ 8 min ago    │ │ │ 15 min ago   │ │ │ ⏱ 0:45    │ │
│ │ ──────────── │ │ │ ──────────── │ │ │ ──────────── │ │ │ ────────── │ │
│ │ 2x Biryani   │ │ │ 1x Paneer    │ │ │ 3x Naan      │ │ │ ✓ 2x Dal   │ │
│ │ 1x Raita     │ │ │ 2x Dal       │ │ │ 2x Chicken   │ │ │ ✓ 1x Rice  │ │
│ │              │ │ │ >> No onion  │ │ │ ▶ 1x Paneer  │ │ │            │ │
│ │ [ACCEPT]     │ │ │ [START]      │ │ │ [READY]      │ │ │ [SERVED]   │ │
│ └──────────────┘ │ └──────────────┘ │ └──────────────┘ │ └────────────┘ │
│                  │                  │                  │                │
│ ┌──────────────┐ │                  │ ┌──────────────┐ │                │
│ │ 🚨 RUSH      │ │                  │ │ KOT0206011   │ │                │
│ │ KOT0206016   │ │                  │ │ Table: T8    │ │                │
│ │ Table: VIP   │ │                  │ │ 18 min ago   │ │                │
│ │ ──────────── │ │                  │ │ ──────────── │ │                │
│ │ 1x Lobster   │ │                  │ │ 1x Soup      │ │                │
│ │              │ │                  │ │ ✓            │ │                │
│ │ [ACCEPT]     │ │                  │ │ [READY]      │ │                │
│ └──────────────┘ │                  │ └──────────────┘ │                │
├──────────────────┴──────────────────┴──────────────────┴────────────────┤
│  Stats: Pending: 3 | Preparing: 2 | Ready: 1 | Avg Time: 12 min         │
└─────────────────────────────────────────────────────────────────────────┘
```

### KDS Actions

| Action | API Call | Result |
|--------|----------|--------|
| Tap "ACCEPT" | `POST /kot/:id/accept` | Move to Accepted column |
| Tap "START" | `POST /kot/:id/preparing` | Move to Preparing column |
| Tap item | `POST /kot/items/:id/ready` | Mark single item ready |
| Tap "READY" | `POST /kot/:id/ready` | Move to Ready column, notify captain |
| Tap "SERVED" | `POST /kot/:id/served` | Remove from display |

---

## Testing Checklist

### Authentication Tests

| # | Test | Expected | API |
|---|------|----------|-----|
| 1 | Kitchen login | Token with kitchen role | POST /auth/login |
| 2 | PIN login | Token for KDS tablet | POST /auth/pin-login |
| 3 | Access station dashboard | 200 OK | GET /station/4/kitchen |
| 4 | Bartender access bar | 200 OK | GET /station/4/bar |

### KOT Reception Tests

| # | Test | Expected |
|---|------|----------|
| 5 | Captain sends KOT | KOT created, printer prints |
| 6 | Kitchen receives socket | `kot:created` event received |
| 7 | Station dashboard shows KOT | New KOT in pending list |
| 8 | Multi-station routing | Kitchen gets food, bar gets drinks |

### Status Update Tests

| # | Test | API | Expected |
|---|------|-----|----------|
| 9 | Accept KOT | POST /kot/25/accept | status=accepted |
| 10 | Start preparing | POST /kot/25/preparing | status=preparing |
| 11 | Single item ready | POST /kot/items/101/ready | item status=ready |
| 12 | All items ready | POST /kot/25/ready | status=ready |
| 13 | Mark served | POST /kot/25/served | status=served |

### Real-time Event Tests

| # | Test | Socket Event | Receiver |
|---|------|--------------|----------|
| 14 | KOT created | kot:created | Kitchen KDS |
| 15 | KOT accepted | kot:accepted | Captain app |
| 16 | KOT preparing | kot:preparing | Captain app |
| 17 | Item ready | kot:item_ready | Captain app |
| 18 | KOT ready | kot:ready | Captain app |
| 19 | All ready | order:all_ready | Captain app |
| 20 | KOT served | kot:served | Kitchen KDS |

### Printer Tests

| # | Test | Expected |
|---|------|----------|
| 21 | Direct print | TCP connection to printer IP |
| 22 | Print format | Correct ESC/POS commands |
| 23 | Printer offline | Falls back to queue |
| 24 | Reprint KOT | POST /kot/25/reprint works |

### Edge Case Tests

| # | Test | Expected |
|---|------|----------|
| 25 | Cancel item during prep | KDS shows cancelled |
| 26 | Priority order | Shows at top of queue |
| 27 | Multiple KOTs same order | Each handled separately |
| 28 | All KOTs served | Order status = served |

---

## API Reference Summary

| Action | Method | Endpoint | Access |
|--------|--------|----------|--------|
| Station Dashboard | GET | /orders/station/:outletId/:station | kitchen, bartender |
| Active KOTs | GET | /orders/kot/active/:outletId | all authenticated |
| Get KOT | GET | /orders/kot/:id | all authenticated |
| Accept KOT | POST | /orders/kot/:id/accept | kitchen, bartender |
| Start Preparing | POST | /orders/kot/:id/preparing | kitchen, bartender |
| Item Ready | POST | /orders/kot/items/:itemId/ready | kitchen, bartender |
| KOT Ready | POST | /orders/kot/:id/ready | kitchen, bartender |
| KOT Served | POST | /orders/kot/:id/served | captain, kitchen |
| Reprint KOT | POST | /orders/kot/:id/reprint | all authenticated |

---

## Socket Channels

| Channel | Purpose | Subscribers |
|---------|---------|-------------|
| `outlet:{outletId}` | All outlet events | All staff |
| `station:{outletId}:{station}` | Station-specific KOTs | Kitchen/Bar KDS |
| `kot:update` | KOT status changes | KDS, Captain apps |
| `order:update` | Order-level changes | All staff |

