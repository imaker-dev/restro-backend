# Cashier Module — Production POS Design

> **Role**: Operational Control + Financial Authority + Realtime Observer  
> **Superset of**: Captain  
> **Created by**: Admin or Manager  
> **Scope**: Outlet-wide (floor/section optional, future-extensible)

---

## 1. Role Definition

| Attribute | Value |
|-----------|-------|
| Role slug | `cashier` |
| Inherits from | `captain` (all captain permissions) |
| Additional powers | Full billing, all payments, cash drawer, full discounts, all reports, bill cancel |
| Cannot do | Modify tax config, modify menu/items/pricing, manage inventory, manage system settings, approve refunds, manage staff |
| Created by | `admin` or `manager` (manager can only assign permissions they themselves have) |
| Scope | Outlet-bound via `user_outlets` table. Floor/section scope is optional and extensible. |

---

## 2. Permissions

### Captain Permissions (inherited)

| Slug | Description |
|------|-------------|
| `TABLE_VIEW` | View all tables and their status |
| `TABLE_MERGE` | Merge tables for large parties |
| `TABLE_TRANSFER` | Transfer table session to another table |
| `ORDER_VIEW` | View any order |
| `ORDER_CREATE` | Create new orders |
| `ORDER_MODIFY` | Add/modify items in order |
| `KOT_SEND` | Send KOT to kitchen/bar |
| `KOT_MODIFY` | Modify pending KOT |
| `KOT_REPRINT` | Reprint KOT |
| `BILL_VIEW` | View bills/invoices |
| `BILL_GENERATE` | Generate bill for order |
| `BILL_REPRINT` | Reprint/duplicate bill |
| `PAYMENT_COLLECT` | Collect payment (cash/card/UPI) |
| `PAYMENT_SPLIT` | Process split payments |
| `DISCOUNT_APPLY` | Apply predefined discounts |
| `TIP_ADD` | Add tip to payment |
| `ITEM_VIEW` | View menu items |
| `ITEM_CANCEL` | Cancel order items |
| `CATEGORY_VIEW` | View menu categories |
| `REPORT_VIEW` | View live dashboard |
| `FLOOR_VIEW` | View floor layout |
| `SECTION_VIEW` | View section layout |

### Additional Cashier Permissions

| Slug | Description |
|------|-------------|
| `ORDER_CANCEL` | Cancel entire order |
| `BILL_CANCEL` | Cancel/void invoice |
| `DISCOUNT_REMOVE` | Remove applied discount |
| `DISCOUNT_CUSTOM` | Apply custom discount (%, fixed, coupon) |
| `ITEM_AVAILABILITY` | Toggle item availability on/off |
| `REPORT_SALES` | View daily/weekly/monthly sales reports |
| `REPORT_STAFF` | View staff performance reports |

### What Cashier Cannot Do

| Slug | Reason |
|------|--------|
| `TABLE_CREATE/EDIT/DELETE` | Layout is admin/manager responsibility |
| `ORDER_VOID`, `ORDER_REOPEN` | Requires manager authority |
| `KOT_CANCEL` | KOT cancellation is manager-only |
| `PAYMENT_REFUND` | Refund initiation/approval is manager-only |
| `TAX_MODIFY`, `SERVICE_CHARGE_MODIFY` | Tax config is admin/manager |
| `ITEM_CREATE/EDIT/DELETE/PRICING` | Menu management is admin/manager |
| `INVENTORY_*` | Inventory is separate role |
| `STAFF_*` | Staff management is admin/manager |
| `OUTLET_*`, `SETTINGS_*` | System config is admin-only |
| `REPORT_INVENTORY`, `REPORT_EXPORT` | Inventory reports and export are manager-only |

---

## 3. API Reference

All endpoints require `Authorization: Bearer <token>` header.  
Base URL: `/api/v1`

### 3.1 Authentication

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/auth/login` | Login with email + password |
| `POST` | `/auth/pin-login` | Quick PIN login at outlet |
| `POST` | `/auth/refresh` | Refresh access token |
| `GET` | `/auth/me` | Get current user + permissions |

### 3.2 Tables

| Method | Endpoint | Purpose | Permission |
|--------|----------|---------|------------|
| `GET` | `/tables/outlet/:outletId` | List all tables | `TABLE_VIEW` |
| `GET` | `/tables/floor/:floorId` | Tables by floor (realtime) | `TABLE_VIEW` |
| `GET` | `/tables/realtime/:outletId` | Realtime table status | `TABLE_VIEW` |
| `GET` | `/tables/:id` | Full table detail (order, items, charges, KOTs) | `TABLE_VIEW` |
| `PATCH` | `/tables/:id/status` | Update table status | `TABLE_VIEW` |
| `POST` | `/tables/:id/session` | Start table session | `TABLE_VIEW` |
| `DELETE` | `/tables/:id/session` | End table session | `TABLE_VIEW` |
| `POST` | `/tables/:id/merge` | Merge tables | `TABLE_MERGE` |
| `DELETE` | `/tables/:id/merge` | Unmerge tables | `TABLE_MERGE` |
| `GET` | `/tables/:id/kots` | Running KOTs for table | `TABLE_VIEW` |

### 3.3 Orders

| Method | Endpoint | Purpose | Permission |
|--------|----------|---------|------------|
| `POST` | `/orders` | Create order | `ORDER_CREATE` |
| `GET` | `/orders/:id` | Get order with items | `ORDER_VIEW` |
| `GET` | `/orders/active/:outletId` | Active orders | `ORDER_VIEW` |
| `POST` | `/orders/:id/items` | Add items to order | `ORDER_MODIFY` |
| `PUT` | `/orders/items/:itemId/quantity` | Update item quantity (pre-KOT) | `ORDER_MODIFY` |
| `POST` | `/orders/items/:itemId/cancel` | Cancel single item | `ITEM_CANCEL` |
| `POST` | `/orders/:id/cancel` | Cancel entire order | `ORDER_CANCEL` |
| `PUT` | `/orders/:id/status` | Update order status | `ORDER_MODIFY` |
| `POST` | `/orders/:id/transfer` | Transfer order to another table | `TABLE_TRANSFER` |
| `GET` | `/orders/cancel-reasons/:outletId` | Get cancel reasons | `ORDER_VIEW` |

### 3.4 KOT

| Method | Endpoint | Purpose | Permission |
|--------|----------|---------|------------|
| `POST` | `/orders/:id/kot` | Send KOT | `KOT_SEND` |
| `GET` | `/orders/kot/active` | Active KOTs (auto outlet) | `ORDER_VIEW` |
| `GET` | `/orders/:orderId/kots` | KOTs for order | `ORDER_VIEW` |
| `GET` | `/orders/kot/:id` | Get KOT detail | `ORDER_VIEW` |
| `POST` | `/orders/kot/:id/served` | Mark KOT served | `KOT_MODIFY` |
| `POST` | `/orders/kot/:id/reprint` | Reprint KOT | `KOT_REPRINT` |

### 3.5 Billing

| Method | Endpoint | Purpose | Permission |
|--------|----------|---------|------------|
| `POST` | `/orders/:id/bill` | Generate bill/invoice | `BILL_GENERATE` |
| `GET` | `/orders/:orderId/invoice` | Get invoice by order | `BILL_VIEW` |
| `GET` | `/orders/invoice/:id` | Get invoice by ID | `BILL_VIEW` |
| `POST` | `/orders/invoice/:id/duplicate` | Print duplicate bill | `BILL_REPRINT` |
| `POST` | `/orders/:id/split-bill` | Split bill | `BILL_GENERATE` |
| `POST` | `/orders/invoice/:id/cancel` | Cancel invoice | `BILL_CANCEL` |
| `POST` | `/orders/:id/discount` | Apply discount | `DISCOUNT_APPLY` |

### 3.6 Payments

| Method | Endpoint | Purpose | Permission |
|--------|----------|---------|------------|
| `POST` | `/orders/payment` | Process payment (cash/card/UPI) | `PAYMENT_COLLECT` |
| `POST` | `/orders/payment/split` | Process split payment | `PAYMENT_SPLIT` |
| `GET` | `/orders/:orderId/payments` | Get payments for order | `ORDER_VIEW` |

### 3.7 Cash Drawer

| Method | Endpoint | Purpose | Permission |
|--------|----------|---------|------------|
| `POST` | `/orders/cash-drawer/:outletId/open` | Open day (set opening cash) | `PAYMENT_COLLECT` |
| `POST` | `/orders/cash-drawer/:outletId/close` | Close day (reconcile cash) | `PAYMENT_COLLECT` |
| `GET` | `/orders/cash-drawer/:outletId/status` | Get cash drawer status + transactions | `PAYMENT_COLLECT` |

### 3.8 Reports

All report endpoints accept `?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD` query params.

| Method | Endpoint | Purpose | Permission |
|--------|----------|---------|------------|
| `GET` | `/orders/reports/:outletId/dashboard` | Live dashboard (today) | `REPORT_VIEW` |
| `GET` | `/orders/reports/:outletId/daily-sales` | Daily sales summary | `REPORT_SALES` |
| `GET` | `/orders/reports/:outletId/item-sales` | Item-wise sales | `REPORT_SALES` |
| `GET` | `/orders/reports/:outletId/category-sales` | Category-wise sales | `REPORT_SALES` |
| `GET` | `/orders/reports/:outletId/payment-modes` | Payment mode breakdown | `REPORT_SALES` |
| `GET` | `/orders/reports/:outletId/tax` | GST/VAT tax summary | `REPORT_SALES` |
| `GET` | `/orders/reports/:outletId/hourly` | Hourly sales (`?date=YYYY-MM-DD`) | `REPORT_SALES` |
| `GET` | `/orders/reports/:outletId/floor-section` | Floor/section performance | `REPORT_SALES` |
| `GET` | `/orders/reports/:outletId/counter` | Kitchen vs Bar counter report | `REPORT_SALES` |
| `GET` | `/orders/reports/:outletId/cancellations` | Cancellation report | `REPORT_SALES` |
| `GET` | `/orders/reports/:outletId/staff` | Staff performance | `REPORT_STAFF` |

---

## 4. Realtime Events

Cashier joins the `cashier:{outletId}` socket room on connect.  
Protocol: **WebSocket** (primary) with **HTTP polling** fallback.  
Backend: **Redis pub/sub** for multi-instance sync.

### Socket Rooms Cashier Joins

```javascript
socket.emit('join:outlet', outletId);    // General outlet updates
socket.emit('join:cashier', outletId);   // Cashier-specific events
socket.emit('join:captain', outletId);   // Captain events (cashier inherits)
```

### Events Cashier Receives

| Event | Channel | Payload | When |
|-------|---------|---------|------|
| `order:updated` | `outlet`, `cashier` | Full order object | Order created/modified/cancelled |
| `table:updated` | `outlet`, `floor` | Table ID + status | Table status changes |
| `kot:updated` | `captain` | KOT with items | KOT sent/accepted/ready/cancelled |
| `item:ready` | `captain` | KOT + ready items | Kitchen marks item ready |
| `bill:status` | `cashier`, `captain` | Invoice + payment status | Bill generated, payment received |
| `payment:updated` | `cashier`, `outlet` | Payment details | Payment completed/split |
| `notification` | `outlet` | Alert message | System notifications |
| `permissions.updated` | `user:{userId}` | Timestamp | Permission changed by admin |

### Event Flow: Order → Bill → Payment

```
Captain creates order  →  order:updated (type: order:items_added)
Captain sends KOT      →  kot:updated (type: kot:new)
Kitchen marks ready     →  item:ready (type: kot:ready)
Cashier generates bill  →  order:updated (type: order:billed)
                        →  bill:status (billStatus: pending)
Cashier collects payment→  order:updated (type: order:payment_received)
                        →  payment:updated
                        →  bill:status (billStatus: paid)
                        →  table:updated (status: available)
```

---

## 5. Workflows

### 5.1 Day Opening

```
1. Cashier logs in (POST /auth/login or /auth/pin-login)
2. Open cash drawer (POST /orders/cash-drawer/:outletId/open)
   Body: { "openingCash": 5000 }
3. Creates day_sessions record + initial cash_drawer entry
4. Cashier is now ready to operate
```

### 5.2 Order Lifecycle (Cashier can do everything Captain does)

```
1. View tables          (GET /tables/realtime/:outletId)
2. Start session        (POST /tables/:id/session)
3. Create order         (POST /orders)
4. Add items            (POST /orders/:id/items)
5. Send KOT             (POST /orders/:id/kot)
6. [Optional] Cancel item  (POST /orders/items/:itemId/cancel)
7. [Optional] Add more items + send KOT again
```

### 5.3 Billing Flow

```
1. Generate bill        (POST /orders/:id/bill)
   Body: { "customerName": "...", "customerPhone": "...", "applyServiceCharge": true }
   → Creates invoice, updates order status to 'billed'
   → Emits bill:status + order:updated events
   → Auto-prints bill to cashier printer

2. [Optional] Apply discount before payment
   (POST /orders/:id/discount)
   Body: { "discountType": "percentage", "discountValue": 10, "reason": "Regular customer" }

3. [Optional] Split bill
   (POST /orders/:id/split-bill)
   Body: { "splits": [{ "itemIds": [1,2] }, { "itemIds": [3,4] }] }
```

### 5.4 Payment Collection

**Single Payment:**
```
POST /orders/payment
{
  "orderId": 123,
  "invoiceId": 45,
  "paymentMode": "cash",   // cash | card | upi | wallet
  "amount": 1750,
  "tipAmount": 50,
  "transactionId": null,    // for card/UPI
  "referenceNumber": null
}
→ Updates order to 'paid', releases table
→ Emits payment:updated + bill:status + table:updated
→ Records cash transaction in cash_drawer if cash payment
```

**Split Payment:**
```
POST /orders/payment/split
{
  "orderId": 123,
  "invoiceId": 45,
  "splits": [
    { "paymentMode": "cash", "amount": 1000 },
    { "paymentMode": "upi", "amount": 750, "upiId": "user@upi" }
  ]
}
→ Creates main payment + split_payments records
→ Cash portion recorded in cash_drawer
```

### 5.5 Day Closing

```
1. Close cash drawer (POST /orders/cash-drawer/:outletId/close)
   Body: { "actualCash": 28500, "notes": "₹200 short - petty cash used" }

   Returns:
   {
     "expectedCash": 28700,    // Calculated from all transactions
     "actualCash": 28500,      // Physical count
     "variance": -200,         // Difference
     "totalSales": 45000,
     "totalOrders": 38
   }

2. Review reports (GET /orders/reports/:outletId/daily-sales)
```

---

## 6. Calculations

All calculations are **server-side, deterministic, and stored in DB**. Never recalculated from raw data.

### Bill Total Formula

```
subtotal       = SUM(active_items.total_price)         -- includes price rule adjustments
discountAmount = applied discount (flat or %)
taxableAmount  = subtotal - discountAmount
serviceCharge  = taxableAmount × rate% (dine-in only)
totalTax       = SUM(item_tax_amounts)                 -- CGST + SGST + VAT per item
preRoundTotal  = taxableAmount + totalTax + serviceCharge + packagingCharge + deliveryCharge
grandTotal     = ROUND(preRoundTotal)                  -- nearest rupee
roundOff       = grandTotal - preRoundTotal
```

### Cash Drawer Balance

```
balance = opening_cash
        + SUM(cash_sales)
        - SUM(cash_refunds)
        - SUM(cash_expenses)

variance = actual_count - expected_balance
```

### Tax Separation (GST vs VAT)

- Items have `tax_group_id` → tax group has components (CGST, SGST, VAT, etc.)
- Each component calculated separately per item
- Aggregated at order level in `charges.taxSummary`
- Invoice stores: `cgst_amount`, `sgst_amount`, `vat_amount`, `cess_amount` separately

### Discount Rules

- **Percentage**: `discountAmount = subtotal × discountValue / 100`
- **Fixed**: `discountAmount = discountValue`
- Applied BEFORE tax calculation
- Stored in `orders.discount_amount` + `orders.discount_details` JSON

---

## 7. Edge Cases & Failure Handling

| Scenario | Behavior |
|----------|----------|
| Double bill generation | Returns existing invoice (idempotent) |
| Payment on unbilled order | Must generate bill first |
| Payment exceeds due | Rejected with error |
| Cash drawer not opened | Payment still works (no cash tracking) |
| Day session already open | Error: "Day session already open" |
| No open session on close | Error: "No open session found" |
| Item cancelled after KOT | KOT auto-cancels if all items cancelled |
| Concurrent payment attempts | DB transaction + row locks prevent double-pay |
| Socket disconnect | Polling fallback via REST APIs |
| Redis unavailable | App works, pub/sub disabled, single-instance only |
| Permission revoked mid-session | Next API call returns 403, socket emits `permissions.updated` |

---

## 8. Security & Audit

- **All actions are authenticated** — JWT token required
- **Role + permission checked server-side** — Never trust frontend
- **Every payment** records `received_by` user ID
- **Every bill** records `generated_by` user ID
- **Every cancellation** records `cancelled_by` + reason + timestamp
- **Cash drawer** records every transaction with user, type, amount, balance
- **Day sessions** record `opened_by`, `closed_by`, variance, notes
- **Permission changes** emit realtime event + clear permission cache
- **Manager can only assign permissions they have** — `getGrantablePermissions(granterId)`

---

## 9. DB Tables Used by Cashier

| Table | Purpose |
|-------|---------|
| `orders` | Order records with financial totals |
| `order_items` | Individual item pricing + tax |
| `order_item_addons` | Addon details per item |
| `invoices` | Generated bills with full tax breakup |
| `payments` | Payment records (all modes) |
| `split_payments` | Split payment details |
| `refunds` | Refund requests + approvals |
| `cash_drawer` | Cash transaction log |
| `day_sessions` | Day open/close records |
| `tables` | Table status |
| `table_sessions` | Table occupancy sessions |
| `kot_tickets` | KOT tickets |
| `kot_items` | KOT item details |
| `daily_sales` | Aggregated daily reports |
| `item_sales` | Aggregated item reports |
| `staff_sales` | Aggregated staff reports |
| `cancel_reasons` | Predefined cancel reasons |
| `order_cancel_logs` | Cancel audit trail |
| `service_charges` | Service charge config |
| `tax_groups` / `tax_components` | Tax configuration |

---

## 10. Future Extensibility

| Feature | How to extend |
|---------|---------------|
| Floor/section scope for cashier | Add `floor_id`/`section_id` to `user_outlets` table, filter queries accordingly |
| Shift-based cash drawer | Add `shift_id` to `day_sessions`, support multiple open/close per day |
| Cashier-specific printer | Already supported via `printer.service.js` station routing |
| Cashier performance reports | Extend `staff_sales` aggregation to track billing metrics |
| Multi-currency | Add `currency` column to `payments` table |
| Offline mode | Queue transactions locally, sync on reconnect |
