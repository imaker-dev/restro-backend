# KOT/BOT Flow - Complete Guide

## Overview

KOT (Kitchen Order Ticket) and BOT (Bar Order Ticket) system handles routing of order items to respective stations (Kitchen, Bar, Dessert, Mocktail) with real-time updates and thermal printer integration.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CAPTAIN APP                                     │
│  [Create Order] → [Add Items] → [Send KOT] → [View Status] → [Mark Served]  │
└─────────────────────────────────┬───────────────────────────────────────────┘
                                  │
                          ┌───────▼───────┐
                          │   API SERVER  │
                          │  POST /kot    │
                          └───────┬───────┘
                                  │
            ┌─────────────────────┼─────────────────────┐
            │                     │                     │
     ┌──────▼──────┐      ┌───────▼───────┐     ┌──────▼──────┐
     │   KITCHEN   │      │     BAR       │     │   DESSERT   │
     │   Station   │      │   Station     │     │   Station   │
     │  (KOT Print)│      │  (BOT Print)  │     │  (KOT Print)│
     └──────┬──────┘      └───────┬───────┘     └──────┬──────┘
            │                     │                     │
     ┌──────▼──────┐      ┌───────▼───────┐     ┌──────▼──────┐
     │   THERMAL   │      │    THERMAL    │     │   THERMAL   │
     │   PRINTER   │      │    PRINTER    │     │   PRINTER   │
     │192.168.1.13 │      │ 192.168.1.13  │     │192.168.1.13 │
     └─────────────┘      └───────────────┘     └─────────────┘
```

---

## Stations & Routing

| Station   | Prefix | Item Types                    | Printer Station |
|-----------|--------|-------------------------------|-----------------|
| Kitchen   | KOT    | Food items, Starters, Main    | kot_kitchen     |
| Bar       | BOT    | Alcoholic drinks, Cocktails   | kot_bar         |
| Dessert   | KOT    | Desserts, Ice creams          | kot_dessert     |
| Mocktail  | KOT    | Non-alcoholic beverages       | kot_kitchen     |

**Routing Logic:**
- Items with `counter_id` (bar counter) → Bar Station
- Items with `kitchen_station_id` → Respective kitchen station
- Default → Kitchen Station

---

## Status Flow

### KOT Status Flow
```
pending → accepted → preparing → ready → served
                                    ↓
                               cancelled
```

### Order Item Status Flow
```
pending → sent_to_kitchen → preparing → ready → served
                                           ↓
                                      cancelled
```

### Order Status Flow
```
pending → confirmed → preparing → ready → served → billed → paid
                                                       ↓
                                                  cancelled
```

---

## API Endpoints

### 1. Send KOT

**Endpoint:** `POST /api/v1/orders/:orderId/kot`

**Description:** Creates KOT tickets for all pending items in order, groups by station, prints to thermal printer.

**Headers:**
```json
{
  "Authorization": "Bearer {{accessToken}}",
  "Content-Type": "application/json"
}
```

**Request Body:** *(none required)*

**Response (200):**
```json
{
  "success": true,
  "message": "KOT sent successfully",
  "data": {
    "orderId": 52,
    "orderNumber": "ORD2602060002",
    "tableNumber": "P1",
    "tickets": [
      {
        "id": 15,
        "kotNumber": "KOT0206007",
        "station": "kitchen",
        "itemCount": 2,
        "items": [
          {
            "id": 25,
            "name": "Butter Naan",
            "quantity": 2,
            "variant": null,
            "instructions": "Extra butter"
          },
          {
            "id": 26,
            "name": "Paneer Tikka",
            "quantity": 1,
            "variant": "Half",
            "instructions": null
          }
        ]
      },
      {
        "id": 16,
        "kotNumber": "BOT0206001",
        "station": "bar",
        "itemCount": 1,
        "items": [
          {
            "id": 27,
            "name": "Long Island Iced Tea",
            "quantity": 2,
            "variant": null,
            "instructions": "Less ice"
          }
        ]
      }
    ]
  }
}
```

**Error Responses:**
- `400`: No pending items to send
- `404`: Order not found
- `403`: Not authorized (not captain/manager)

---

### 2. Get Active KOTs for Outlet

**Endpoint:** `GET /api/v1/orders/kot/active/:outletId`

**Query Parameters:**
| Param   | Type   | Description                    |
|---------|--------|--------------------------------|
| station | string | Filter by station (kitchen/bar)|

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": 15,
      "kot_number": "KOT0206007",
      "station": "kitchen",
      "status": "pending",
      "order_id": 52,
      "order_number": "ORD2602060002",
      "table_number": "P1",
      "item_count": 2,
      "ready_count": 0,
      "created_at": "2026-02-06T10:30:00.000Z",
      "items": [
        {
          "id": 25,
          "name": "Butter Naan",
          "quantity": 2,
          "status": "pending"
        }
      ]
    }
  ]
}
```

---

### 3. Get Station Dashboard

**Endpoint:** `GET /api/v1/orders/station/:outletId/:station`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "station": "kitchen",
    "kots": [...],
    "stats": {
      "pending_count": 5,
      "preparing_count": 2,
      "ready_count": 1,
      "total_count": 8,
      "avg_prep_time": 12.5
    }
  }
}
```

---

### 4. Accept KOT (Kitchen Acknowledges)

**Endpoint:** `POST /api/v1/orders/kot/:kotId/accept`

**Description:** Kitchen/Bar acknowledges receipt of KOT.

**Response (200):**
```json
{
  "success": true,
  "message": "KOT accepted",
  "data": {
    "id": 15,
    "kot_number": "KOT0206007",
    "status": "accepted",
    "accepted_at": "2026-02-06T10:32:00.000Z",
    "accepted_by": 5
  }
}
```

**Socket Event Emitted:** `kot:accepted`

---

### 5. Start Preparing KOT

**Endpoint:** `POST /api/v1/orders/kot/:kotId/preparing`

**Description:** Mark KOT as being prepared. Updates all items to 'preparing'.

**Response (200):**
```json
{
  "success": true,
  "message": "Started preparing",
  "data": {
    "id": 15,
    "status": "preparing",
    "items": [
      { "id": 25, "status": "preparing" },
      { "id": 26, "status": "preparing" }
    ]
  }
}
```

**Socket Event Emitted:** `kot:preparing`

---

### 6. Mark Single Item Ready

**Endpoint:** `POST /api/v1/orders/kot/items/:itemId/ready`

**Description:** Mark individual KOT item as ready. If all items ready, KOT status changes to 'ready'.

**Response (200):**
```json
{
  "success": true,
  "message": "Item ready",
  "data": {
    "id": 15,
    "status": "preparing",
    "items": [
      { "id": 25, "status": "ready" },
      { "id": 26, "status": "preparing" }
    ]
  }
}
```

**Socket Events Emitted:** 
- `kot:item_ready`
- `order:item_ready`

---

### 7. Mark Entire KOT Ready

**Endpoint:** `POST /api/v1/orders/kot/:kotId/ready`

**Description:** Mark all items in KOT as ready.

**Response (200):**
```json
{
  "success": true,
  "message": "KOT ready",
  "data": {
    "id": 15,
    "status": "ready",
    "ready_at": "2026-02-06T10:45:00.000Z"
  }
}
```

**Socket Events Emitted:**
- `kot:ready`
- `order:all_ready` (if all order items ready)

---

### 8. Mark KOT Served

**Endpoint:** `POST /api/v1/orders/kot/:kotId/served`

**Description:** Mark KOT items as served to guest.

**Response (200):**
```json
{
  "success": true,
  "message": "KOT served",
  "data": {
    "id": 15,
    "status": "served",
    "served_at": "2026-02-06T10:50:00.000Z",
    "served_by": 3
  }
}
```

**Socket Events Emitted:**
- `kot:served`
- `order:all_served` (if all order items served)

---

### 9. Get KOTs for Order

**Endpoint:** `GET /api/v1/orders/:orderId/kots`

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": 15,
      "kot_number": "KOT0206007",
      "station": "kitchen",
      "status": "served",
      "created_at": "2026-02-06T10:30:00.000Z",
      "accepted_at": "2026-02-06T10:32:00.000Z",
      "ready_at": "2026-02-06T10:45:00.000Z",
      "served_at": "2026-02-06T10:50:00.000Z",
      "items": [...]
    },
    {
      "id": 16,
      "kot_number": "BOT0206001",
      "station": "bar",
      "status": "ready",
      "items": [...]
    }
  ]
}
```

---

### 10. Get Running KOTs for Table

**Endpoint:** `GET /api/v1/tables/:tableId/kots`

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": 15,
      "kot_number": "KOT0206007",
      "station": "kitchen",
      "status": "preparing",
      "order_number": "ORD2602060002",
      "items": [...]
    }
  ]
}
```

---

### 11. Reprint KOT

**Endpoint:** `POST /api/v1/orders/kot/:kotId/reprint`

**Response (200):**
```json
{
  "success": true,
  "message": "KOT reprinted",
  "data": {
    "id": 15,
    "kot_number": "KOT0206007",
    "printed_count": 2,
    "last_printed_at": "2026-02-06T11:00:00.000Z"
  }
}
```

---

## Real-time Socket Events

### Channel: `kot:update`

Kitchen/Bar displays subscribe to this channel to receive real-time KOT updates.

#### Event Types:

| Event Type      | Description                           | Payload                    |
|-----------------|---------------------------------------|----------------------------|
| `kot:created`   | New KOT received                      | Full KOT with items        |
| `kot:accepted`  | Kitchen acknowledged                  | KOT with accepted_at       |
| `kot:preparing` | Preparation started                   | KOT with item statuses     |
| `kot:item_ready`| Single item ready                     | KOT with updated items     |
| `kot:ready`     | All items ready                       | KOT with ready_at          |
| `kot:served`    | Items served                          | KOT with served_at         |

**Event Payload Structure:**
```json
{
  "type": "kot:created",
  "outletId": 4,
  "station": "kitchen",
  "kot": {
    "id": 15,
    "kot_number": "KOT0206007",
    "station": "kitchen",
    "status": "pending",
    "order_id": 52,
    "table_number": "P1",
    "items": [
      {
        "id": 25,
        "name": "Butter Naan",
        "quantity": 2,
        "status": "pending",
        "instructions": "Extra butter"
      }
    ]
  },
  "timestamp": "2026-02-06T10:30:00.000Z"
}
```

### Channel: `order:update`

Captain/Waiter apps subscribe to receive order status updates.

| Event Type        | Description                    | When Emitted              |
|-------------------|--------------------------------|---------------------------|
| `order:kot_sent`  | KOT sent successfully          | After sendKot()           |
| `order:item_ready`| Item ready for pickup          | After markItemReady()     |
| `order:all_ready` | All order items ready          | After all items ready     |
| `order:all_served`| All order items served         | After all items served    |

---

## Printer Configuration

### Database: `printers` table

| Column          | Type                                          | Description              |
|-----------------|-----------------------------------------------|--------------------------|
| id              | bigint                                        | Primary key              |
| outlet_id       | bigint                                        | Outlet reference         |
| name            | varchar(100)                                  | Printer name             |
| printer_type    | enum(thermal,dot_matrix,laser,inkjet)         | Printer type             |
| connection_type | enum(usb,network,bluetooth,serial)            | Connection method        |
| ip_address      | varchar(45)                                   | IP for network printers  |
| port            | int                                           | Port (default: 9100)     |
| station         | enum(kot_kitchen,kot_bar,kot_dessert,bill,report,all) | Assigned station  |
| is_default      | tinyint(1)                                    | Default for station      |
| is_active       | tinyint(1)                                    | Active status            |

### Setup Printer

```sql
INSERT INTO printers (outlet_id, name, printer_type, connection_type, ip_address, port, station, is_default, is_active)
VALUES (4, 'Kitchen Printer', 'thermal', 'network', '192.168.1.13', 9100, 'kot_kitchen', 1, 1);

INSERT INTO printers (outlet_id, name, printer_type, connection_type, ip_address, port, station, is_default, is_active)
VALUES (4, 'Bar Printer', 'thermal', 'network', '192.168.1.13', 9100, 'kot_bar', 0, 1);
```

### Direct Print Flow

```
sendKot() 
    → getPrinterForStation(outletId, station)
    → printerService.printKotDirect(kotData, ip, port)
    → TCP Socket → Thermal Printer
```

---

## Complete Flow Scenarios

### Scenario 1: Normal Order Flow

```
1. Captain creates order for Table P1
   POST /api/v1/orders
   → Order #52 created (status: pending)

2. Captain adds items
   POST /api/v1/orders/52/items
   → 3 items added (2 kitchen, 1 bar)

3. Captain sends KOT
   POST /api/v1/orders/52/kot
   → KOT0206007 (kitchen) printed
   → BOT0206001 (bar) printed
   → Socket: kot:created (×2)
   → Order status: confirmed

4. Kitchen accepts KOT
   POST /api/v1/orders/kot/15/accept
   → Socket: kot:accepted

5. Kitchen starts preparing
   POST /api/v1/orders/kot/15/preparing
   → Socket: kot:preparing

6. Kitchen marks first item ready
   POST /api/v1/orders/kot/items/25/ready
   → Socket: kot:item_ready
   → Socket: order:item_ready

7. Kitchen marks KOT ready
   POST /api/v1/orders/kot/15/ready
   → Socket: kot:ready

8. Captain sees ready notification
   → Picks up food

9. Captain marks served
   POST /api/v1/orders/kot/15/served
   → Socket: kot:served
   → Socket: order:all_served (if all KOTs served)
```

### Scenario 2: Multiple KOTs for Same Order

```
1. Order has 5 items (3 kitchen, 2 bar)
2. Send KOT creates:
   - KOT0206007 (kitchen): 3 items
   - BOT0206001 (bar): 2 items
3. Each station works independently
4. Order ready when BOTH KOTs are ready
```

### Scenario 3: Add More Items After KOT

```
1. KOT sent for initial items
2. Guest adds more items
   POST /api/v1/orders/52/items
   → New items added (status: pending)

3. Captain sends another KOT
   POST /api/v1/orders/52/kot
   → KOT0206008 created for new items only
```

### Scenario 4: Cancel Item After KOT

```
1. KOT sent (status: pending/preparing)
2. Guest cancels item
   POST /api/v1/orders/items/25/cancel
   → Order item status: cancelled
   → KOT item status: cancelled
   → If all items cancelled, KOT status: cancelled
```

### Scenario 5: Printer Offline

```
1. Send KOT
2. Direct print fails (printer offline)
3. Fallback: Create print job in queue
4. Print bridge agent polls and prints when available
```

---

## Database Tables

### `kot_tickets`

```sql
CREATE TABLE kot_tickets (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  outlet_id BIGINT UNSIGNED NOT NULL,
  order_id BIGINT UNSIGNED NOT NULL,
  kot_number VARCHAR(20) NOT NULL,
  station ENUM('kitchen','bar','dessert','mocktail') DEFAULT 'kitchen',
  status ENUM('pending','accepted','preparing','ready','served','cancelled') DEFAULT 'pending',
  priority TINYINT DEFAULT 0,
  accepted_by BIGINT UNSIGNED,
  accepted_at DATETIME,
  ready_at DATETIME,
  served_by BIGINT UNSIGNED,
  served_at DATETIME,
  printed_count INT DEFAULT 1,
  last_printed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### `kot_items`

```sql
CREATE TABLE kot_items (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  kot_id BIGINT UNSIGNED NOT NULL,
  order_item_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(100) NOT NULL,
  variant VARCHAR(100),
  quantity INT NOT NULL,
  instructions TEXT,
  status ENUM('pending','preparing','ready','served','cancelled') DEFAULT 'pending',
  cancelled_at DATETIME
);
```

---

## Testing Checklist

### Basic Flow
- [ ] Create order with kitchen items → KOT prints
- [ ] Create order with bar items → BOT prints
- [ ] Create order with mixed items → KOT + BOT print separately
- [ ] Accept KOT → status updates, socket emits
- [ ] Start preparing → all items update
- [ ] Mark single item ready → item status updates
- [ ] Mark KOT ready → all items ready
- [ ] Mark served → order status updates

### Edge Cases
- [ ] Send KOT with no pending items → Error
- [ ] Add items after KOT → New KOT for new items only
- [ ] Cancel item before KOT → Item removed
- [ ] Cancel item after KOT → Item and KOT item cancelled
- [ ] Printer offline → Fallback to queue
- [ ] Multiple KOTs for same order → Each works independently

### Real-time
- [ ] Kitchen display receives `kot:created`
- [ ] Captain receives `order:item_ready`
- [ ] Captain receives `order:all_ready`
- [ ] All events have correct payload structure

---

## Sample Postman Tests

```javascript
// After Send KOT
pm.test("KOT sent successfully", function () {
    pm.response.to.have.status(200);
    var jsonData = pm.response.json();
    pm.expect(jsonData.success).to.be.true;
    pm.expect(jsonData.data.tickets).to.be.an('array');
    pm.expect(jsonData.data.tickets.length).to.be.greaterThan(0);
    
    // Save first KOT ID for further tests
    if (jsonData.data.tickets.length > 0) {
        pm.environment.set("kotId", jsonData.data.tickets[0].id);
    }
});

// After Accept KOT
pm.test("KOT accepted", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.data.status).to.eql("accepted");
    pm.expect(jsonData.data.accepted_at).to.not.be.null;
});

// After Mark Ready
pm.test("KOT ready", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.data.status).to.eql("ready");
    pm.expect(jsonData.data.ready_at).to.not.be.null;
});
```

---

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| No pending items | All items already sent | Add more items first |
| Order not found | Invalid order ID | Verify order exists |
| KOT not found | Invalid KOT ID | Verify KOT exists |
| Printer connection failed | Printer offline | Check network/power |
| Not authorized | Wrong role | Use captain/kitchen role |

---

# Captain Order History

Captain can view their own orders with filters, search, and detailed time logs.

## API Endpoints

### 1. Get Order History

**Endpoint:** `GET /api/v1/orders/captain/history/:outletId`

**Query Parameters:**

| Parameter  | Type   | Default | Description                                |
|------------|--------|---------|-------------------------------------------|
| status     | string | all     | `running`, `completed`, `cancelled`, `all`|
| search     | string | -       | Search order number, table, customer      |
| startDate  | string | -       | Filter from date (YYYY-MM-DD)             |
| endDate    | string | -       | Filter to date (YYYY-MM-DD)               |
| page       | number | 1       | Page number                               |
| limit      | number | 20      | Items per page                            |
| sortBy     | string | created_at | `created_at`, `order_number`, `total_amount` |
| sortOrder  | string | DESC    | `ASC` or `DESC`                           |

**Response (200):**
```json
{
  "success": true,
  "data": {
    "orders": [
      {
        "id": 52,
        "order_number": "ORD2602060002",
        "order_type": "dine_in",
        "status": "served",
        "subtotal": 850.00,
        "tax_amount": 42.50,
        "discount_amount": 0,
        "total_amount": 892.50,
        "guest_count": 4,
        "customer_name": "John Doe",
        "table_number": "P1",
        "floor_name": "First Floor",
        "item_count": 5,
        "kot_count": 2,
        "created_at": "2026-02-06T10:30:00.000Z",
        "created_by_name": "Captain Ram"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 45,
      "totalPages": 3
    }
  }
}
```

**Status Filter Values:**
- `running`: Orders with status `pending`, `confirmed`, `preparing`, `ready`, `served`
- `completed`: Orders with status `billed`, `paid`
- `cancelled`: Orders with status `cancelled`
- `all`: All orders

---

### 2. Get Order Detail with Time Logs

**Endpoint:** `GET /api/v1/orders/captain/detail/:orderId`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": 52,
    "order_number": "ORD2602060002",
    "order_type": "dine_in",
    "status": "served",
    "table_number": "P1",
    "floor_name": "First Floor",
    "guest_count": 4,
    "subtotal": 850.00,
    "tax_amount": 42.50,
    "total_amount": 892.50,
    "items": [
      {
        "id": 101,
        "item_name": "Butter Chicken",
        "variant_name": "Half",
        "quantity": 1,
        "unit_price": 250.00,
        "total_price": 250.00,
        "status": "served",
        "special_instructions": "Less spicy",
        "created_at": "2026-02-06T10:32:00.000Z"
      }
    ],
    "kots": [
      {
        "id": 15,
        "kot_number": "KOT0206007",
        "station": "kitchen",
        "status": "served",
        "created_at": "2026-02-06T10:35:00.000Z",
        "accepted_at": "2026-02-06T10:36:00.000Z",
        "ready_at": "2026-02-06T10:50:00.000Z",
        "served_at": "2026-02-06T10:52:00.000Z",
        "accepted_by_name": "Chef Kumar",
        "served_by_name": "Captain Ram",
        "items": [...]
      }
    ],
    "timeLogs": {
      "orderCreated": "2026-02-06T10:30:00.000Z",
      "sessionStarted": "2026-02-06T10:28:00.000Z",
      "firstKotSent": "2026-02-06T10:35:00.000Z",
      "lastKotSent": "2026-02-06T10:40:00.000Z",
      "orderCompleted": "2026-02-06T11:30:00.000Z",
      "orderCancelled": null,
      "sessionEnded": "2026-02-06T11:35:00.000Z"
    },
    "invoice": {
      "id": 25,
      "invoice_number": "INV2602060015",
      "created_at": "2026-02-06T11:25:00.000Z"
    },
    "payments": [
      {
        "id": 18,
        "payment_method": "card",
        "amount": 892.50,
        "status": "completed",
        "created_at": "2026-02-06T11:30:00.000Z"
      }
    ]
  }
}
```

---

### 3. Get Captain Order Stats

**Endpoint:** `GET /api/v1/orders/captain/stats/:outletId`

**Query Parameters:**

| Parameter  | Type   | Description                    |
|------------|--------|--------------------------------|
| startDate  | string | Filter from date (YYYY-MM-DD)  |
| endDate    | string | Filter to date (YYYY-MM-DD)    |

*If no date range provided, returns today's stats.*

**Response (200):**
```json
{
  "success": true,
  "data": {
    "total_orders": 15,
    "running_orders": 3,
    "completed_orders": 10,
    "cancelled_orders": 2,
    "total_sales": 12500.00,
    "avg_order_value": 1250.00
  }
}
```

---

## Captain History Use Cases

### View Running Orders
```
GET /api/v1/orders/captain/history/4?status=running
```

### Search by Table Number
```
GET /api/v1/orders/captain/history/4?search=P1
```

### View Today's Completed Orders
```
GET /api/v1/orders/captain/history/4?status=completed&startDate=2026-02-06&endDate=2026-02-06
```

### View This Week's Cancelled Orders
```
GET /api/v1/orders/captain/history/4?status=cancelled&startDate=2026-02-01&endDate=2026-02-07
```

### Paginated History with Sorting
```
GET /api/v1/orders/captain/history/4?page=2&limit=10&sortBy=total_amount&sortOrder=DESC
```

---

## Security Notes

- Captain can only view their **own orders** (orders they created)
- Admin/Manager can view all orders
- Order detail endpoint verifies ownership before returning data
- Returns `403 Forbidden` if trying to access another captain's order

