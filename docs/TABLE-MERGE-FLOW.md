# Table Merge — Full API Flow Guide

Complete reference for table merge/unmerge with every perspective: listing, ordering, KOT, billing, payment, and auto-unmerge.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Merge Tables](#2-merge-tables)
3. [Floor Listing (Post-Merge)](#3-floor-listing-post-merge)
4. [Get Merged Tables](#4-get-merged-tables)
5. [Start Session on Merged Primary](#5-start-session-on-merged-primary)
6. [Create Order on Merged Table](#6-create-order-on-merged-table)
7. [Floor Listing with Active Order](#7-floor-listing-with-active-order)
8. [KOT (Auto-Sent on Order)](#8-kot-auto-sent-on-order)
9. [Generate Bill](#9-generate-bill)
10. [Process Payment (Auto-Unmerge)](#10-process-payment-auto-unmerge)
11. [Post-Payment State (Auto-Restored)](#11-post-payment-state-auto-restored)
12. [Explicit Unmerge (Without Payment)](#12-explicit-unmerge-without-payment)
13. [End Session (Auto-Unmerge)](#13-end-session-auto-unmerge)
14. [Split Payment on Merged Table](#14-split-payment-on-merged-table)
15. [Error Scenarios](#15-error-scenarios)
16. [Behavior Rules](#16-behavior-rules)

---

## 1. Prerequisites

- Tables must be on the **same floor**
- Both primary and secondary tables must have `is_mergeable: true`
- Secondary tables must be `status: "available"`
- Primary table can be `available` or `occupied` (with active session)

**Pre-merge table state:**

```
GET /api/v1/tables/floor/:floorId
```

```json
{
  "success": true,
  "data": [
    { "id": 27, "table_number": "FF1", "name": "TEST TABLE", "capacity": 4, "status": "available", "is_mergeable": 1 },
    { "id": 28, "table_number": "FF2", "name": "TEST TABLE 2", "capacity": 2, "status": "available", "is_mergeable": 0 },
    { "id": 29, "table_number": "FF3", "name": "TEST TABLE 3", "capacity": 6, "status": "available", "is_mergeable": 1 }
  ]
}
```

---

## 2. Merge Tables

```
POST /api/v1/tables/:primaryTableId/merge
```

**Access:** `super_admin`, `admin`, `manager`, `captain`, `cashier`

### Payload

```json
{
  "tableIds": [29]
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `tableIds` | `number[]` | Yes | Array of table IDs to merge into the primary table |

### Response

```json
{
  "success": true,
  "message": "Tables merged successfully",
  "data": [
    {
      "id": 13,
      "primary_table_id": 27,
      "merged_table_id": 29,
      "table_session_id": null,
      "merged_by": 1,
      "merged_at": "2026-02-14 11:50:53",
      "unmerged_at": null,
      "unmerged_by": null,
      "table_number": "FF3",
      "capacity": 6
    }
  ]
}
```

### What happens on merge

| Table | Before | After |
|---|---|---|
| FF1 (primary) | capacity: 4, status: available | **capacity: 10** (4+6), status: available |
| FF3 (secondary) | capacity: 6, status: available | capacity: 6, **status: merged** |

---

## 3. Floor Listing (Post-Merge)

```
GET /api/v1/tables/floor/:floorId
```

### Response

```json
{
  "success": true,
  "data": [
    {
      "id": 27,
      "table_number": "FF1",
      "capacity": 10,
      "status": "available",
      "isMergedPrimary": true,
      "mergedTables": [
        {
          "merge_id": 13,
          "merged_table_id": 29,
          "merged_table_number": "FF3",
          "merged_table_name": "TEST TABLE 3",
          "merged_table_capacity": 6
        }
      ],
      "session_id": null,
      "current_order_id": null
    },
    {
      "id": 29,
      "table_number": "FF3",
      "capacity": 6,
      "status": "merged",
      "mergedInto": {
        "primary_table_id": 27,
        "primary_table_number": "FF1",
        "primary_table_name": "TEST TABLE"
      },
      "session_id": null,
      "current_order_id": null
    },
    {
      "id": 28,
      "table_number": "FF2",
      "capacity": 2,
      "status": "available"
    }
  ]
}
```

### Key fields

| Field | On | Description |
|---|---|---|
| `isMergedPrimary` | Primary table | `true` when this table has active merges |
| `mergedTables[]` | Primary table | Array of secondary tables merged into this one |
| `mergedInto` | Secondary table | Points to the primary table this one is merged into |
| `status: "merged"` | Secondary table | Indicates this table is disabled (merged into another) |

---

## 4. Get Merged Tables

```
GET /api/v1/tables/:primaryTableId/merged
```

### Response

```json
{
  "success": true,
  "data": [
    {
      "id": 13,
      "primary_table_id": 27,
      "merged_table_id": 29,
      "table_session_id": null,
      "merged_by": 1,
      "merged_at": "2026-02-14 11:50:53",
      "unmerged_at": null,
      "unmerged_by": null,
      "table_number": "FF3",
      "capacity": 6
    }
  ]
}
```

---

## 5. Start Session on Merged Primary

```
POST /api/v1/tables/:primaryTableId/session
```

**Access:** `super_admin`, `admin`, `manager`, `captain`, `cashier`, `waiter`

### Payload

```json
{
  "guestCount": 8,
  "guestName": "VIP Guest"
}
```

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `guestCount` | `number` | No | 1 | Number of guests (can use combined capacity) |
| `guestName` | `string` | No | null | Guest name |
| `guestPhone` | `string` | No | null | Guest phone |
| `notes` | `string` | No | null | Session notes |

### Response

```json
{
  "success": true,
  "message": "Table session started",
  "data": {
    "sessionId": 376,
    "table": {
      "id": 27,
      "table_number": "FF1",
      "name": "TEST TABLE",
      "capacity": 10,
      "status": "occupied",
      "floor_name": "Fourth Floor",
      "section_name": "Non-AC Section"
    }
  }
}
```

> Note: Session is started on the **primary table only**. The merged capacity (10) is available for guest seating.

---

## 6. Create Order on Merged Table

```
POST /api/v1/orders
```

### Payload

```json
{
  "outletId": 4,
  "tableId": 27,
  "orderType": "dine_in",
  "items": [
    { "itemId": 7, "quantity": 2 }
  ]
}
```

### Response

```json
{
  "success": true,
  "data": {
    "id": 498,
    "orderNumber": "ORD2602140008",
    "tableId": 27,
    "outletId": 4,
    "orderType": "dine_in",
    "status": "confirmed"
  }
}
```

> Order is placed on the **primary table ID** only. All items, KOTs, bills, and payments reference this table.

---

## 7. Floor Listing with Active Order

```
GET /api/v1/tables/floor/:floorId
```

### Response (primary table with order)

```json
{
  "id": 27,
  "table_number": "FF1",
  "status": "occupied",
  "capacity": 10,
  "order_number": "ORD2602140008",
  "current_order_id": 498,
  "isMergedPrimary": true,
  "mergedTables": [
    {
      "merge_id": 13,
      "merged_table_id": 29,
      "merged_table_number": "FF3",
      "merged_table_name": "TEST TABLE 3",
      "merged_table_capacity": 6
    }
  ],
  "kotSummary": {
    "total_kots": 1,
    "pending_kots": 0,
    "preparing_kots": 0,
    "ready_kots": 0,
    "served_kots": 0
  },
  "item_count": 2,
  "session_id": 376,
  "guest_count": 8,
  "guest_name": "VIP Guest"
}
```

---

## 8. KOT (Auto-Sent on Order)

KOTs are automatically created when an order is placed. To manually send:

```
POST /api/v1/orders/:orderId/kot
```

If items were already auto-sent:

```json
{
  "success": false,
  "message": "No pending items to send"
}
```

### Get KOTs for order

```
GET /api/v1/orders/:orderId/kots
```

```json
{
  "success": true,
  "data": [
    {
      "id": 501,
      "orderId": 498,
      "kotNumber": "KOT0214001",
      "orderNumber": "ORD2602140008",
      "tableId": 27,
      "tableNumber": "FF1",
      "station": "kitchen",
      "status": "pending",
      "items": [
        { "name": "Butter Chicken", "quantity": 2, "status": "pending" }
      ]
    }
  ]
}
```

---

## 9. Generate Bill

```
POST /api/v1/orders/:orderId/bill
```

### Response

```json
{
  "success": true,
  "message": "Bill generated",
  "data": {
    "id": 289,
    "invoiceNumber": "INV/2526/000289",
    "orderNumber": "ORD2602140008",
    "tableNumber": "FF1",
    "subtotal": 760.00,
    "taxableAmount": 760.00,
    "cgstAmount": 19.00,
    "sgstAmount": 19.00,
    "totalTax": 38.00,
    "grandTotal": 798,
    "paymentStatus": "pending",
    "items": [
      { "name": "Butter Chicken", "quantity": 2, "unitPrice": 380.00, "totalPrice": 760.00 }
    ]
  }
}
```

---

## 10. Process Payment (Auto-Unmerge)

```
POST /api/v1/orders/payment
```

### Payload

```json
{
  "orderId": 498,
  "paymentMode": "cash",
  "amount": 798
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `orderId` | `number` | Yes | Order ID |
| `paymentMode` | `string` | Yes | `cash`, `card`, `upi`, `wallet`, `credit`, `complimentary` |
| `amount` | `number` | Yes | Payment amount |
| `tipAmount` | `number` | No | Tip amount (default: 0) |
| `transactionId` | `string` | No | External transaction ID |
| `referenceNumber` | `string` | No | Reference number |
| `invoiceId` | `number` | No | Invoice ID (auto-detected if not provided) |

### Response

```json
{
  "success": true,
  "message": "Payment successful — order fully paid. Table released, KOTs served."
}
```

### What happens automatically on full payment

1. Order status → `completed`
2. Invoice payment_status → `paid`
3. All KOTs → `served`
4. All order items → `served`
5. **Merged tables auto-unmerged:**
   - Secondary tables → `status: "available"`
   - Primary table capacity **restored** to original
6. Table session → `completed`
7. Primary table → `status: "available"`

---

## 11. Post-Payment State (Auto-Restored)

```
GET /api/v1/tables/floor/:floorId
```

```json
{
  "success": true,
  "data": [
    { "id": 27, "table_number": "FF1", "capacity": 4, "status": "available" },
    { "id": 28, "table_number": "FF2", "capacity": 2, "status": "available" },
    { "id": 29, "table_number": "FF3", "capacity": 6, "status": "available" }
  ]
}
```

> All tables fully restored to their original state — capacity, status, no merge references.

---

## 12. Explicit Unmerge (Without Payment)

If you need to unmerge without going through the payment flow:

```
DELETE /api/v1/tables/:primaryTableId/merge
```

**Access:** `super_admin`, `admin`, `manager`, `captain`, `cashier`

### Response

```json
{
  "success": true,
  "message": "Tables unmerged successfully"
}
```

### What happens

| Table | Before | After |
|---|---|---|
| FF1 (primary) | capacity: 10, status: available | **capacity: 4** (restored), status: available |
| FF3 (secondary) | capacity: 6, status: merged | capacity: 6, **status: available** |

---

## 13. End Session (Auto-Unmerge)

Ending a session on a merged primary table also auto-unmerges:

```
DELETE /api/v1/tables/:primaryTableId/session
```

### Response

```json
{
  "success": true,
  "message": "Table session ended"
}
```

### What happens

Same as explicit unmerge — secondary tables restored to `available`, primary capacity restored.

---

## 14. Split Payment on Merged Table

```
POST /api/v1/orders/payment/split
```

### Payload

```json
{
  "orderId": 498,
  "outletId": 4,
  "splits": [
    { "paymentMode": "cash", "amount": 400 },
    { "paymentMode": "upi", "amount": 398, "upiId": "user@paytm" }
  ]
}
```

### Response

```json
{
  "success": true,
  "message": "Split payment processed successfully"
}
```

> Split payment also triggers auto-unmerge + capacity restore, same as single payment.

---

## 15. Error Scenarios

### Merge a non-mergeable table

```
POST /api/v1/tables/28/merge   (FF2 has is_mergeable: false)
Body: { "tableIds": [29] }
```

```json
{ "success": false, "message": "Primary table is not mergeable" }
```

### Merge an already-merged table

```
POST /api/v1/tables/27/merge
Body: { "tableIds": [29] }   (FF3 is already status: "merged")
```

```json
{ "success": false, "message": "Table FF3 is not available" }
```

### Merge a table that is already merged as primary

```
POST /api/v1/tables/29/merge   (FF3 is status: "merged")
Body: { "tableIds": [28] }
```

```json
{ "success": false, "message": "This table is already merged into another table" }
```

### Merge tables from different floors

```json
{ "success": false, "message": "Cannot merge tables from different floors" }
```

### Unmerge when no merges exist

```
DELETE /api/v1/tables/27/merge
```

```json
{ "success": false, "message": "No merged tables found" }
```

---

## 16. Behavior Rules

| Rule | Description |
|---|---|
| **Capacity** | Primary table capacity = original + sum of all merged table capacities |
| **Status** | Secondary tables get `status: "merged"` (cannot be used for ordering) |
| **Floor restriction** | Only tables on the **same floor** can be merged |
| **Ordering** | Orders are placed on the **primary table only** |
| **KOT** | KOTs reference the primary table |
| **Billing** | Bills are generated for the primary table's order |
| **Payment** | Payment triggers auto-unmerge + capacity restore |
| **Session end** | Ending session triggers auto-unmerge + capacity restore |
| **Explicit unmerge** | `DELETE /tables/:id/merge` also restores capacity |
| **Multiple merges** | A primary can merge multiple secondary tables (e.g., FF1 + FF2 + FF3) |
| **Cancel order** | Cancelling a dine-in order calls `endSession` which auto-unmerges |
| **WebSocket** | `tables_merged` and `tables_unmerged` events broadcast to floor subscribers |

### Auto-Unmerge Triggers

| Trigger | Restores Capacity | Restores Secondary Status |
|---|---|---|
| `DELETE /tables/:id/merge` (explicit) | Yes | Yes → `available` |
| `DELETE /tables/:id/session` (session end) | Yes | Yes → `available` |
| `POST /orders/payment` (full payment) | Yes | Yes → `available` |
| `POST /orders/payment/split` (split payment) | Yes | Yes → `available` |
| Order cancellation | Yes | Yes → `available` |
