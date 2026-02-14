# Cashier Billing Module — Complete API Guide

> Full documentation for cashier billing operations: pending bills, service charge, GST, discounts, payments, and real-time events.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Authentication](#2-authentication)
3. [Pending Bills (Real-time)](#3-pending-bills)
4. [Generate Bill](#4-generate-bill)
5. [Invoice Retrieval](#5-invoice-retrieval)
6. [Service Charge — Remove / Restore](#6-service-charge)
7. [GST — Remove / Restore (Non-GST Bill)](#7-gst-removal)
8. [Combined Charge Removal](#8-combined-charge-removal)
9. [Discounts — Manual](#9-manual-discounts)
10. [Discounts — By Code](#10-discount-by-code)
11. [Payment — Cash](#11-cash-payment)
12. [Payment — UPI](#12-upi-payment)
13. [Payment — Card](#13-card-payment)
14. [Payment — Split](#14-split-payment)
15. [Duplicate Bill](#15-duplicate-bill)
16. [Cancel Invoice](#16-cancel-invoice)
17. [Cash Drawer](#17-cash-drawer)
18. [Real-time Socket Events](#18-real-time-events)
19. [Calculation Rules](#19-calculation-rules)
20. [Error Scenarios](#20-error-scenarios)
21. [Postman Collection](#21-postman-collection)

---

## 1. Overview

The cashier module handles the complete billing lifecycle:

```
Order Created → Items Added → KOT Sent → Kitchen Ready → Served
    → Bill Generated → [Modify Charges] → [Apply Discount] → Payment → Table Released
```

### Key Capabilities

| Feature | Description |
|---------|-------------|
| **Pending Bills** | Real-time view of all unpaid invoices |
| **Service Charge Toggle** | Remove/restore 10% service charge |
| **GST Toggle** | Remove/restore all taxes (non-GST bill) |
| **Manual Discount** | Flat amount or percentage off |
| **Discount Code** | Validate from master `discounts` table |
| **Payments** | Cash, UPI, Card, Split |
| **Duplicate Bill** | Reprint with duplicate mark |
| **Cancel Invoice** | Void unpaid invoice, revert order to served |

### Base URL

```
http://localhost:3000/api/v1
```

### Authentication

All requests require Bearer token:
```
Authorization: Bearer <accessToken>
```

---

## 2. Authentication

### POST `/auth/login`

```json
{
  "email": "admin@restropos.com",
  "password": "admin123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbG...",
    "user": { "id": 1, "name": "Admin", "roles": [...] }
  }
}
```

---

## 3. Pending Bills

### GET `/orders/bills/pending/:outletId`

Returns invoices for the cashier dashboard. Supports filtering by payment status.

#### Query Parameters

| Param | Type | Description | Example |
|-------|------|-------------|---------|
| `floorId` | number | Filter by floor ID | `?floorId=1` |
| `search` | string | Search by table number, customer name, order number, or invoice number | `?search=T1` |
| `sortBy` | string | Sort field: `created_at`, `grand_total`, `table_number`, `invoice_number`, `order_number` | `?sortBy=grand_total` |
| `sortOrder` | string | `asc` or `desc` (default: `desc`) | `?sortOrder=asc` |
| `page` | number | Page number (default: `1`) | `?page=2` |
| `limit` | number | Items per page (default: `20`, max: `100`) | `?limit=10` |
| `status` | string | `pending` (default), `completed`, or `all` | `?status=completed` |

All parameters are **combinable**:
```
GET /orders/bills/pending/4?floorId=1&search=John&sortBy=grand_total&sortOrder=asc&page=1&limit=10
```

**Examples:**
```
GET /orders/bills/pending/4                                    → All pending (page 1, limit 20)
GET /orders/bills/pending/4?status=completed                   → Paid/completed bills only
GET /orders/bills/pending/4?status=all                         → Both pending + completed
GET /orders/bills/pending/4?floorId=1                          → Ground Floor only
GET /orders/bills/pending/4?search=T5                          → Table T5
GET /orders/bills/pending/4?search=John                        → Customer "John"
GET /orders/bills/pending/4?sortBy=grand_total&sortOrder=desc  → Highest first
GET /orders/bills/pending/4?page=2&limit=5                     → Page 2, 5 per page
GET /orders/bills/pending/4?search=NONEXIST                    → Empty array []
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 42,
      "invoiceNumber": "INV/2526/000042",
      "orderId": 100,
      "orderNumber": "ORD2602100001",
      "orderType": "dine_in",
      "tableNumber": "T1",
      "tableName": "Table 1",
      "floorId": 1,
      "floorName": "Ground Floor",
      "subtotal": 500,
      "discountAmount": 0,
      "taxableAmount": 500,
      "cgstAmount": 12.5,
      "sgstAmount": 12.5,
      "totalTax": 25,
      "serviceCharge": 50,
      "grandTotal": 575,
      "paymentStatus": "pending",
      "items": [...],
      "discounts": [],
      "payments": []
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 42,
    "totalPages": 3
  }
}
```

**Key Points:**
- All fields are **camelCase**
- Response includes `pagination` object with `page`, `limit`, `total`, `totalPages`
- Includes nested `items`, `discounts`, `payments` arrays
- **Cancelled items are excluded** from `items[]` — cashier never sees them
- **Cancelled orders' bills are excluded** — auto-removed when order is cancelled
- Only shows `paymentStatus = 'pending'` or `'partial'`
- Sorted by `created_at DESC` (newest first)

### Real-time Update

Cashier also receives `bill:status` socket events when bills are generated/updated/paid/cancelled. See [Section 18](#18-real-time-events).

---

## 4. Generate Bill

### POST `/orders/:orderId/bill`

Generates an invoice for a served order.

**Request:**
```json
{
  "customerName": "John Doe",
  "customerPhone": "9876543210",
  "applyServiceCharge": true
}
```

**Response:**
```json
{
  "success": true,
  "message": "Bill generated",
  "data": {
    "id": 42,
    "invoiceNumber": "INV/2526/000042",
    "subtotal": 500,
    "discountAmount": 0,
    "taxableAmount": 500,
    "cgstAmount": 12.5,
    "sgstAmount": 12.5,
    "igstAmount": 0,
    "vatAmount": 0,
    "cessAmount": 0,
    "totalTax": 25,
    "serviceCharge": 50,
    "packagingCharge": 0,
    "deliveryCharge": 0,
    "roundOff": 0,
    "grandTotal": 575,
    "amountInWords": "Five Hundred Seventy Five Rupees Only",
    "paymentStatus": "pending",
    "items": [...],
    "discounts": [],
    "payments": []
  }
}
```

**Emits Events:**
- `bill:status` → `{ billStatus: 'pending', grandTotal, invoiceNumber, ... }`
- `order:update` → `{ type: 'order:billed', invoice }`

**Idempotent:** Calling again returns the same invoice (no duplicate created).

---

## 5. Invoice Retrieval

### GET `/orders/invoice/:invoiceId`

Get invoice by ID.

### GET `/orders/:orderId/invoice`

Get invoice by order ID.

Both return the same camelCase formatted invoice object with items, discounts, and payments.



Recalculates taxes from order items' tax details. `customerGstin` is not required when restoring.

---

## 8. Combined Charge Removal

### PUT `/orders/invoice/:invoiceId/charges`

#### Remove BOTH (Bare Bill)

```json
{
  "removeServiceCharge": true,
  "removeGst": true,
  "customerGstin": "27AABCU9603R1ZM"
}
```

**Result:**
```
serviceCharge: 0
totalTax: 0
grandTotal: Math.round(taxableAmount)
         = Math.round(subtotal - discountAmount)
```

This is the simplest possible bill — just items minus any discounts.

---

## 9. Manual Discounts

### POST `/orders/:orderId/discount`

Apply a manual discount (must be done before generating bill, or cancel invoice first).

#### Flat Discount

```json
{
  "discountName": "Manager Special",
  "discountType": "flat",
  "discountValue": 100,
  "appliedOn": "subtotal"
}
```

**Effect:** `discountAmount += 100`

#### Percentage Discount

```json
{
  "discountName": "Festival Offer",
  "discountType": "percentage",
  "discountValue": 15,
  "appliedOn": "subtotal"
}
```

**Effect:** `discountAmount += subtotal × 15%`

#### Item-Level Discount

```json
{
  "discountName": "Item Promo",
  "discountType": "flat",
  "discountValue": 30,
  "appliedOn": "item",
  "orderItemId": 42
}
```

**After discount, re-generate bill to see updated totals.**

---

## 10. Discount by Code

### POST `/orders/:orderId/discount/code`

Validates a discount code from the `discounts` master table and applies it.

```json
{
  "discountCode": "WELCOME10"
}
```

**Available Codes:**

| Code | Type | Value | Max Disc | Min Order |
|------|------|-------|----------|-----------|
| `WELCOME10` | percentage | 10% | ₹200 | ₹500 |
| `FLAT100` | flat | ₹100 | — | ₹1000 |
| `HAPPY20` | percentage | 20% | — | ₹500 |

**Validation Checks:**
1. Code exists and is active
2. `valid_from` / `valid_until` date range
3. `usage_limit` not exceeded
4. `min_order_amount` met
5. Not already applied on this order

**Success Response:**
```json
{
  "success": true,
  "message": "Discount code applied",
  "data": { /* order with discounts array */ }
}
```

**Error Responses:**

| Error | Status | When |
|-------|--------|------|
| `Invalid discount code` | 400 | Code doesn't exist or inactive |
| `Discount code has expired` | 400 | Past `valid_until` date |
| `Discount code usage limit reached` | 400 | `usage_count >= usage_limit` |
| `Minimum order amount of ₹X required` | 400 | Subtotal below `min_order_amount` |
| `Discount code already applied on this order` | 400 | Duplicate application |

---

## 11. Cash Payment

### POST `/orders/payment`

```json
{
  "orderId": 100,
  "invoiceId": 42,
  "outletId": 4,
  "paymentMode": "cash",
  "amount": 575,
  "tipAmount": 50
}
```

**Response:**
```json
{
  "success": true,
  "message": "Payment processed",
  "data": {
    "id": 1,
    "paymentNumber": "PAY2602100001",
    "paymentMode": "cash",
    "totalAmount": 575,
    "tipAmount": 50,
    "status": "completed"
  }
}
```

**Emits:**
- `bill:status` → `{ billStatus: 'paid' }`
- `order:update` → `{ type: 'order:payment_received' }`
- `table:updated` → `{ status: 'available' }` (dine-in)

---

## 12. UPI Payment

### POST `/orders/payment`

```json
{
  "orderId": 100,
  "invoiceId": 42,
  "outletId": 4,
  "paymentMode": "upi",
  "amount": 575,
  "transactionId": "UPI-TXN-12345",
  "upiId": "customer@paytm"
}
```

---

## 13. Card Payment

### POST `/orders/payment`

```json
{
  "orderId": 100,
  "invoiceId": 42,
  "outletId": 4,
  "paymentMode": "card",
  "amount": 575,
  "referenceNumber": "CARD-REF-789",
  "cardLastFour": "4242",
  "cardType": "visa"
}
```

---

## 14. Split Payment

### POST `/orders/payment/split`

Pay one invoice with multiple payment methods.

```json
{
  "orderId": 100,
  "invoiceId": 42,
  "outletId": 4,
  "splits": [
    { "paymentMode": "cash", "amount": 300 },
    { "paymentMode": "upi", "amount": 275, "transactionId": "UPI-SPLIT-001" }
  ]
}
```

**Validation:** Sum of split amounts must equal `grandTotal`.

**Response:**
```json
{
  "success": true,
  "data": {
    "paymentMode": "split",
    "totalAmount": 575,
    "splits": [
      { "paymentMode": "cash", "amount": 300 },
      { "paymentMode": "upi", "amount": 275 }
    ]
  }
}
```

---

## 15. Duplicate Bill

### POST `/orders/invoice/:invoiceId/duplicate`

```json
{
  "reason": "Customer requested copy"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "isDuplicate": true,
    "duplicateNumber": 1,
    "invoiceNumber": "INV/2526/000042",
    ...
  }
}
```

---

## 16. Cancel Invoice

### POST `/orders/invoice/:invoiceId/cancel`

Voids an unpaid invoice and reverts order status to `served`.

```json
{
  "reason": "Customer changed mind"
}
```

**Cannot cancel paid invoices** — returns error.

**Emits:** `bill:status` → `{ billStatus: 'cancelled', reason }`


## 18. Real-time Events

### Socket Connection

```javascript
const socket = io('http://localhost:3000');
socket.emit('join:cashier', outletId);
```

### Event: `bill:status`

Received by cashier on **every** bill state change.

| `billStatus` | Trigger | Data |
|--------------|---------|------|
| `pending` | Bill generated | `invoiceId, invoiceNumber, grandTotal, orderId, tableId` |
| `updated` | Charges modified | `invoiceId, grandTotal, removeServiceCharge, removeGst` |
| `partial` | Partial payment | `invoiceId, paidAmount, remainingAmount` |
| `paid` | Full payment | `invoiceId, paymentMode, totalAmount` |
| `cancelled` | Invoice cancelled | `invoiceId, reason` |
| `cancelled` | Order cancelled (auto) | `invoiceId, reason: 'Order cancelled'` |

### Event: `order:updated`

```javascript
socket.on('order:updated', (data) => {
  switch (data.type) {
    case 'order:created':        // New order placed by captain
    case 'order:items_added':    // Items added to existing order
    case 'order:kot_sent':       // KOT sent to kitchen
    case 'order:item_ready':     // Item ready from kitchen
    case 'order:all_served':     // All items served to table
    case 'order:billed':         // Bill generated (contains invoice)
    case 'order:item_cancelled': // Single item cancelled
    case 'order:cancelled':      // Entire order cancelled
    case 'order:status_changed': // Status transition
    case 'order:payment_received': // Payment collected
  }
});
```

### Event: `kot:updated`

```javascript
socket.on('kot:updated', (data) => {
  // data.status = 'sent' | 'accepted' | 'preparing' | 'ready' | 'served' | 'cancelled'
  // data.type = 'kot:created' | 'kot:accepted' | 'kot:preparing' | 'kot:ready'
  //           | 'kot:served' | 'kot:cancelled' | 'kot:item_cancelled'
});
```

### Event: `table:updated`

```javascript
socket.on('table:updated', (data) => {
  // data.status = 'available' | 'occupied' | 'reserved'
  // Fires on: session start, payment completion, order cancel
});
```

### Who Listens to What

| Event | Cashier | Captain | Kitchen | Bar |
|-------|---------|---------|---------|-----|
| `order:updated` | ✅ | ✅ | ❌ | ❌ |
| `bill:status` | ✅ | ✅ | ❌ | ❌ |
| `kot:updated` | ✅ | ✅ | ✅ | ✅ (bar only) |
| `table:updated` | ✅ | ✅ | ❌ | ❌ |

---

## 18b. Complete Order & Bill Lifecycle

Step-by-step flow from order creation to payment, with all real-time events:

```
┌────────────────────────────────────────────────────────────────┐
│  STEP 1: CAPTAIN — Create Order                              │
│  POST /orders { tableId, outletId, orderType, guestCount }   │
│  → order:updated { type: 'order:created' }                   │
│  → table:updated  { status: 'occupied' }                     │
├────────────────────────────────────────────────────────────────┤
│  STEP 2: CAPTAIN — Add Items                                 │
│  POST /orders/:id/items { items: [...] }                     │
│  → order:updated { type: 'order:items_added' }               │
├────────────────────────────────────────────────────────────────┤
│  STEP 3: CAPTAIN — Send KOT                                  │
│  POST /orders/:id/kot                                        │
│  → kot:updated   { type: 'kot:created', station }            │
│  → order:updated { type: 'order:kot_sent' }                  │
│  Kitchen/Bar display shows new KOT                           │
├────────────────────────────────────────────────────────────────┤
│  STEP 4: KITCHEN — Accept & Prepare                          │
│  POST /orders/kot/:kotId/accept                              │
│  POST /orders/kot/:kotId/preparing                           │
│  → kot:updated { status: 'accepted' / 'preparing' }          │
├────────────────────────────────────────────────────────────────┤
│  STEP 5: KITCHEN — Mark Ready                                │
│  POST /orders/kot/:kotId/ready                               │
│  → kot:updated   { status: 'ready' }                         │
│  → order:updated { type: 'order:item_ready' }                │
│  Captain sees items ready for pickup                         │
├────────────────────────────────────────────────────────────────┤
│  STEP 6: CAPTAIN — Mark Served                               │
│  POST /orders/kot/:kotId/served                              │
│  → kot:updated   { status: 'served' }                        │
│  → order:updated { type: 'order:all_served' }  (if all done) │
│  Order status → 'served'                                     │
├────────────────────────────────────────────────────────────────┤
│  STEP 7: CASHIER — Generate Bill                             │
│  POST /orders/:id/bill { customerName, applyServiceCharge }  │
│  → bill:status   { billStatus: 'pending', grandTotal }       │
│  → order:updated { type: 'order:billed', invoice }           │
│  Bill appears in GET /orders/bills/pending/:outletId         │
│  Auto-prints bill to receipt printer                         │
├────────────────────────────────────────────────────────────────┤
│  STEP 7b (optional): CASHIER — Modify Charges                │
│  PUT /orders/invoice/:id/charges                             │
│    { removeServiceCharge, removeGst, customerGstin }         │
│  → bill:status { billStatus: 'updated', grandTotal }         │
├────────────────────────────────────────────────────────────────┤
│  STEP 8: CASHIER — Process Payment                           │
│  POST /orders/payment { invoiceId, paymentMode, amount }     │
│  → order.status = 'completed', payment_status = 'completed'  │
│  → bill:status   { billStatus: 'paid', paymentMode }         │
│  → order:updated { type: 'order:payment_received' }          │
│  → table:updated { status: 'available' }  (dine-in)          │
│  Bill moves to ?status=completed, table released              │
│  Captain history shows order under ?status=completed          │
└────────────────────────────────────────────────────────────────┘
```

### Cancellation Flows

```
┌────────────────────────────────────────────────────────────────┐
│  ITEM CANCEL (single item)                                   │
│  POST /orders/items/:itemId/cancel { reason, quantity }      │
│  → Item status → 'cancelled'                                 │
│  → order:updated { type: 'order:item_cancelled' }            │
│  → kot:updated   { type: 'kot:item_cancelled' }              │
│  → Order totals recalculated (cancelled items excluded)      │
│  → Cancelled item will NOT appear on any bill/invoice        │
│  → Cancel slip printed to kitchen printer                    │
├────────────────────────────────────────────────────────────────┤
│  ORDER CANCEL (entire order)                                 │
│  POST /orders/:id/cancel { reason }                          │
│  → All items → 'cancelled'                                   │
│  → All KOTs  → 'cancelled'                                   │
│  → Order     → 'cancelled'                                   │
│  → Pending invoices auto-cancelled (is_cancelled = 1)        │
│  → order:updated { type: 'order:cancelled' }                 │
│  → bill:status   { billStatus: 'cancelled', reason }         │
│  → kot:updated   { type: 'kot:cancelled' }  (per KOT)        │
│  → table:updated { status: 'available' }                     │
│  → Cancelled bill disappears from pending bills API          │
│  → Cancel slips printed to kitchen for each active KOT       │
├────────────────────────────────────────────────────────────────┤
│  INVOICE CANCEL (cashier manual)                             │
│  POST /orders/invoice/:id/cancel { reason }                  │
│  → Invoice → is_cancelled = 1                                │
│  → Order reverts to 'served' (can re-bill)                   │
│  → bill:status { billStatus: 'cancelled', reason }           │
└────────────────────────────────────────────────────────────────┘
```

### Order Status Flow

```
pending → confirmed → preparing → ready → served → billed → completed
   │         │           │          │        │         │
   └─────────┴───────────┴──────────┴────────┴─────────┴───→ cancelled

After full payment: order.status = 'completed', order.payment_status = 'completed'
Captain history: ?status=completed includes billed + completed orders
Captain history: ?status=running excludes completed orders
```

### Bill Status Flow

```
pending → updated (charges modified) → partial (partial pay) → paid
   │            │                          │
   └────────────┴──────────────────────────┴───────────────→ cancelled
```

### Item Status Flow

```
pending → sent_to_kitchen → preparing → ready → served
   │          │               │          │
   └──────────┴───────────────┴──────────┴─────────────→ cancelled
```

---

## 18c. Bill & Invoice Lifecycle — Step by Step

Understanding when the bill/invoice is generated, when discounts apply, and what happens at each stage:

### Before Payment (Bill Generation)

```
1. ORDER CREATED → Captain creates order with items
   - order.status = 'pending'
   - order.total_amount = SUM(items) + tax (raw item-level total)
   - No invoice exists yet

2. ORDER SERVED → Kitchen prepares, captain marks served
   - order.status = 'served'
   - Still no invoice — just an order with items

3. CASHIER GENERATES BILL → POST /orders/:id/bill
   - Creates an INVOICE record in the invoices table
   - Invoice contains: subtotal, taxableAmount, taxes, serviceCharge, grandTotal
   - order.total_amount is UPDATED to match invoice.grand_total
   - order.status = 'billed'
   - Invoice = Bill (same thing, used interchangeably)
   - Bill is auto-printed to receipt printer (if configured)
   - The invoice number (e.g., INV/2526/000042) is generated

4. CASHIER MODIFIES CHARGES (optional) → PUT /orders/invoice/:id/charges
   - Can remove service charge, remove GST (requires customer GSTIN)
   - Invoice recalculates: grandTotal changes
   - order.total_amount is ALSO updated to match new grandTotal
   - Updated bill can be reprinted
```

### Discount Application

```
Discounts are applied BEFORE bill generation:
   POST /orders/:id/discount        → Manual flat/percentage discount
   POST /orders/:id/discount/code   → Discount code (e.g., WELCOME10)

These create order_discounts records. When the bill is generated,
discounts are factored into the calculation:
   taxableAmount = subtotal - discountAmount
   grandTotal = taxableAmount + tax + serviceCharge

You can also apply discounts AFTER bill generation — the invoice
will be recalculated automatically on the next charge update.
```

### After Payment

```
5. CASHIER COLLECTS PAYMENT → POST /orders/payment
   - Payment record created in payments table
   - If fully paid: order.status = 'completed', order.payment_status = 'completed'
   - invoice.payment_status = 'paid'
   - Table released (dine-in), session ended
   - Bill moves from ?status=pending to ?status=completed
   - Captain history shows order under ?status=completed
   - Cannot modify invoice after payment (400 error)
```

### What Gets Printed

```
BILL PRINT (receipt printer — local/network):
   - Invoice number, date, time
   - Table number, customer name
   - Items list (name, qty, price) — cancelled items EXCLUDED
   - Subtotal, discount, taxable amount
   - Tax breakdown (CGST, SGST)
   - Service charge (if applied)
   - Grand total, round-off
   - Payment status

KITCHEN PRINT (KOT slip — kitchen printer):
   - KOT number, table number
   - Items for that station only
   - Special instructions
   - This is separate from the bill — prints when KOT is sent
```

### Key Points

- **Bill = Invoice** — same record in the `invoices` table
- **Bill is generated ONCE** per order (idempotent — calling again returns existing)
- **Discounts** can be applied before or after bill generation
- **Charge modifications** (remove GST/service charge) recalculate the invoice
- **Payment** marks both order and invoice as completed/paid
- **After payment**, no modifications allowed (400 error)
- **Cancelled invoice** → order reverts to 'served', can be re-billed

---

## 19. Calculation Rules

### Bill Calculation Formula

```
subtotal       = SUM(item.totalPrice)  where item.status ≠ 'cancelled'
discountAmount = SUM(order_discounts.discount_amount)
taxableAmount  = subtotal - discountAmount
serviceCharge  = taxableAmount × 10%   (dine-in only, from service_charges table)
totalTax       = CGST + SGST + IGST + VAT + Cess
preRoundTotal  = taxableAmount + totalTax + serviceCharge + packagingCharge + deliveryCharge
grandTotal     = Math.round(preRoundTotal)
roundOff       = grandTotal - preRoundTotal
```

### Charge Removal Effects

| Scenario | serviceCharge | totalTax | grandTotal |
|----------|--------------|----------|------------|
| Normal bill | 10% of taxable | Calculated | Full amount |
| Remove service charge | **0** | Unchanged | Lower |
| Remove GST (+ GSTIN) | Unchanged | **0** | Lower |
| Remove both (+ GSTIN) | **0** | **0** | `= taxableAmount` |
| Restore both | 10% of taxable | Recalculated | Original |

### Cancelled Item Handling

| Context | Cancelled Items |
|---------|-----------------|
| `generateBill()` | Excluded from printed bill, but included in order totals recalc |
| `getInvoiceById()` | **Filtered out** — not in response `items[]` |
| `getPendingBills()` | **Filtered out** — not in response `items[]` |
| `recalculateTotals()` | `WHERE status != 'cancelled'` — excluded from subtotal |
| `order:updated` event | Full order data (includes cancelled for audit) |

### Discount Calculation

| Type | Formula |
|------|---------|
| Flat | `discountAmount = discountValue` |
| Percentage | `discountAmount = subtotal × discountValue / 100` |
| Code (percentage) | `discountAmount = min(subtotal × value%, max_discount_amount)` |
| Code (flat) | `discountAmount = value` |

**Cap:** `discountAmount` can never exceed `subtotal`.

### Service Charge Config (Outlet 4)

| Field | Value |
|-------|-------|
| Rate | 10% |
| Type | Percentage |
| Apply on | Subtotal (after discount) |
| Taxable | No |
| Optional | Yes (cashier can remove) |

---

## 20. Error Scenarios

| Scenario | Status | Error Message |
|----------|--------|--------------|
| Bill non-existent order | 500 | `Order not found` |
| Bill already-paid order | 500 | `Order already paid` |
| Modify paid invoice | 400 | `Cannot modify paid invoice` |
| Modify cancelled invoice | 400 | `Cannot modify cancelled invoice` |
| Cancel paid invoice | 500 | `Cannot cancel paid invoice` |
| Cancel paid/cancelled order | 500 | `Order cannot be cancelled` |
| Remove GST without GSTIN | 422 | `Validation failed` |
| Invalid discount code | 400 | `Invalid discount code` |
| Expired discount code | 400 | `Discount code has expired` |
| Code usage limit reached | 400 | `Discount code usage limit reached` |
| Min order not met | 400 | `Minimum order amount of ₹X required` |
| Duplicate discount code | 400 | `Discount code already applied on this order` |
| Payment exceeds amount | 500 | Payment validation error |
| Double payment on paid | 500 | Already paid error |

---

## 21. Postman Collection

Import `postman/Cashier-Billing-Complete.postman_collection.json` into Postman.

### Setup

1. Import the collection
2. Variables are pre-configured (`baseUrl`, `outletId`)
3. Run **1. Authentication** first to set `accessToken`
4. Run **2. Setup** to create a served order
5. Run remaining folders in order

### Module-by-Module Testing

| # | Module | Requests | Tests |
|---|--------|----------|-------|
| 1 | Authentication | 1 | Token saved |
| 2 | Setup (Order → Serve) | 6 | Order + KOT lifecycle |
| 3 | Generate Bill | 2 | Bill created + idempotent |
| 4 | Pending Bills | 4 | Pending + completed + all filters |
| 5 | Invoice Retrieval | 2 | By ID + by Order |
| 6 | Service Charge | 2 | Remove + restore |
| 7 | GST Removal | 3 | GST only + both + restore |
| 8 | Discounts | 7 | Flat + pct + code + errors |
| 9 | Cash Payment | 5 | Pay + verify + table + modify-reject |
| 10 | UPI Payment | 4 | Full flow |
| 11 | Card Payment | 1 | Card pay |
| 12 | Split Payment | 1 | Cash+UPI split |
| 13 | Payments by Order | 1 | List payments |
| 14 | Duplicate Bill | 1 | Reprint |
| 15 | Cancel Invoice | 2 | Cancel + paid-reject |
| 16 | Cash Drawer | 3 | Open + status + close |
| 17 | Error Scenarios | 3 | Invalid requests |

### Automated Testing

Run the Node.js test suite for full calculation verification:

```bash
node src/tests/test-cashier-billing-ops.js
```

This runs 124+ automated tests covering:
- Pagination, filtering, searching, sorting
- Service charge / GST removal with GSTIN validation
- Discounts (flat, percentage, code)
- Order cancel → bill auto-cancelled
- Item cancel → excluded from bill
- All calculation scenarios with precise number verification

---

## API Endpoint Summary

| Method | Route | Purpose |
|--------|-------|---------|
| `GET` | `/orders/bills/pending/:outletId` | Pending bills (paginated, filterable) |
| `POST` | `/orders/:id/bill` | Generate bill |
| `GET` | `/orders/invoice/:id` | Get invoice by ID |
| `GET` | `/orders/:orderId/invoice` | Get invoice by order |
| `PUT` | `/orders/invoice/:id/charges` | Toggle service charge / GST |
| `POST` | `/orders/invoice/:id/duplicate` | Print duplicate bill |
| `POST` | `/orders/invoice/:id/cancel` | Cancel invoice |
| `POST` | `/orders/:id/discount` | Manual discount |
| `POST` | `/orders/:id/discount/code` | Discount by code |
| `POST` | `/orders/payment` | Process payment |
| `POST` | `/orders/payment/split` | Split payment |
| `GET` | `/orders/:orderId/payments` | Payments by order |
| `POST` | `/orders/cash-drawer/:outletId/open` | Open cash drawer |
| `GET` | `/orders/cash-drawer/:outletId/status` | Cash drawer status |
| `POST` | `/orders/cash-drawer/:outletId/close` | Close cash drawer |
