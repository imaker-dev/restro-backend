# Reports API Documentation

## Overview
Role-based reports API that filters data based on user role and floor/section assignments.

### Role-Based Data Scoping

| Role | Data Access | Floor Filter | Own Data Only |
|------|-------------|--------------|---------------|
| `super_admin` | All data | No | No |
| `admin` | All data | No | No |
| `manager` | Assigned floors only | Yes | No |
| `captain` | Assigned floors only | Yes | No |
| `cashier` | Own billed orders | Yes | Yes |

---

## API Endpoints

| Method | Endpoint | Description | Access |
|--------|----------|-------------|--------|
| GET | `/reports/dashboard` | Live dashboard stats | admin, manager, cashier, captain |
| GET | `/reports/running-orders` | Running orders by type | admin, manager, cashier, captain |
| GET | `/reports/running-tables` | Occupied tables | admin, manager, cashier, captain |
| GET | `/reports/day-end-summary` | Day End Summary | admin, manager, cashier |
| GET | `/reports/daily-sales` | Daily sales aggregated | admin, manager, cashier |
| GET | `/reports/daily-sales-detail` | Detailed order breakdown | admin, manager |
| GET | `/reports/item-sales` | Item-wise sales | admin, manager |
| GET | `/reports/category-sales` | Category-wise sales | admin, manager |
| GET | `/reports/biller-wise` | Biller/Pax sales | admin, manager, cashier |
| GET | `/reports/staff` | Staff performance | admin, manager |
| GET | `/reports/tax` | Tax breakdown | admin, manager |
| GET | `/reports/payment-modes` | Payment mode breakdown | admin, manager, cashier |
| GET | `/reports/cancellations` | Cancellation report | admin, manager |
| GET | `/reports/floor-section` | Floor/Section sales | admin, manager |
| GET | `/reports/hourly` | Hourly breakdown | admin, manager |
| GET | `/reports/counter-sales` | KOT/Station report | admin, manager |

---

## 1. Day End Summary

**GET** `/api/v1/reports/day-end-summary`

Daily summary with orders count and total sales for date range.

### Query Parameters:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `outletId` | number | Yes | Outlet ID |
| `startDate` | string | No | Start date (YYYY-MM-DD) |
| `endDate` | string | No | End date (YYYY-MM-DD) |

### Response:
```json
{
  "success": true,
  "data": {
    "dateRange": { "start": "2026-01-21", "end": "2026-02-20" },
    "days": [
      {
        "date": "2026-02-19",
        "totalOrders": 51,
        "completedOrders": 48,
        "cancelledOrders": 3,
        "totalSales": 78230,
        "grossSales": 82500,
        "totalDiscount": 2100,
        "totalTax": 6250,
        "totalServiceCharge": 780,
        "totalGuests": 125,
        "avgOrderValue": 1629.79,
        "payments": {
          "cash": 35000,
          "upi": 28000,
          "card": 15230
        }
      }
    ],
    "grandTotal": {
      "totalOrders": 491,
      "completedOrders": 465,
      "cancelledOrders": 26,
      "totalSales": 58468,
      "totalDiscount": 3500,
      "totalTax": 8750,
      "totalGuests": 980
    },
    "dayCount": 13
  },
  "meta": {
    "role": "admin",
    "isFiltered": false,
    "floorRestricted": false
  }
}
```

### Role-based Filtering:
- **Admin**: Sees all orders for the outlet
- **Manager**: Sees orders only for assigned floors
- **Cashier**: Sees only orders they billed (`billed_by = userId`)

---

## 2. Running Orders Dashboard

**GET** `/api/v1/reports/running-orders`

Active orders breakdown by order type and status.

### Query Parameters:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `outletId` | number | Yes | Outlet ID |

### Response:
```json
{
  "success": true,
  "data": {
    "summary": {
      "totalOrders": 5,
      "totalAmount": 4962.00
    },
    "byOrderType": {
      "dine_in": { "orders": 5, "amount": 4962.00 },
      "takeaway": { "orders": 0, "amount": 0 },
      "delivery": { "orders": 0, "amount": 0 }
    },
    "byStatus": {
      "pending": { "orders": 1, "amount": 520 },
      "preparing": { "orders": 3, "amount": 2800 },
      "ready": { "orders": 1, "amount": 1642 }
    },
    "delivery": {
      "yetToBeReady": { "orders": 0, "amount": 0 },
      "readyForPickup": { "orders": 0, "amount": 0 }
    }
  },
  "meta": { "role": "cashier", "isFiltered": true }
}
```

---

## 3. Running Tables

**GET** `/api/v1/reports/running-tables`

Occupied tables with active order info.

### Response:
```json
{
  "success": true,
  "data": {
    "totalOccupied": 8,
    "totalAmount": 12500,
    "totalGuests": 24,
    "byFloor": {
      "Ground Floor": {
        "floorId": 1,
        "tables": [
          {
            "tableId": 5,
            "tableNumber": "T5",
            "tableName": "Window Table",
            "capacity": 4,
            "guestCount": 3,
            "orderId": 1234,
            "orderNumber": "ORD-001234",
            "orderStatus": "preparing",
            "totalAmount": 1850,
            "captainName": "John",
            "orderStarted": "2026-02-20T14:30:00",
            "duration": 45
          }
        ]
      }
    }
  }
}
```

---

## 4. Biller-wise Report (Pax Sales)

**GET** `/api/v1/reports/biller-wise`

Sales report by cashier/biller.

### Query Parameters:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `outletId` | number | Yes | Outlet ID |
| `startDate` | string | No | Start date |
| `endDate` | string | No | End date |

### Response:
```json
{
  "success": true,
  "data": {
    "dateRange": { "start": "2026-01-21", "end": "2026-02-20" },
    "billers": [
      {
        "userId": 7,
        "billerName": "Cashier Mary",
        "totalBills": 125,
        "totalPax": 280,
        "totalSales": 27026,
        "totalDiscount": 1200,
        "totalTax": 4050,
        "totalServiceCharge": 540,
        "cancelledBills": 2,
        "avgBillValue": 216.21,
        "paxPerBill": 2.2,
        "payments": {
          "cash": 12000,
          "upi": 10000,
          "card": 5026
        }
      }
    ],
    "grandTotal": {
      "totalBills": 275,
      "totalPax": 506,
      "totalSales": 58468,
      "totalDiscount": 3500
    },
    "billerCount": 13
  }
}
```

### Cashier View:
When accessed by cashier role, only their own data is returned.

---

## 5. Daily Sales Report

**GET** `/api/v1/reports/daily-sales`

Aggregated daily sales with overall summary.

### Response:
```json
{
  "success": true,
  "data": {
    "dateRange": { "start": "2026-02-15", "end": "2026-02-20" },
    "daily": [
      {
        "report_date": "2026-02-19",
        "total_orders": 51,
        "dine_in_orders": 42,
        "takeaway_orders": 7,
        "delivery_orders": 2,
        "cancelled_orders": 3,
        "total_guests": 125,
        "gross_sales": 82500,
        "net_sales": 78230,
        "discount_amount": 2100,
        "tax_amount": 6250,
        "service_charge": 780,
        "total_collection": 78230,
        "cash_collection": 35000,
        "card_collection": 15230,
        "upi_collection": 28000,
        "average_order_value": "1629.79",
        "average_guest_spend": "625.84"
      }
    ],
    "summary": {
      "total_days": 5,
      "total_orders": 245,
      "dine_in_orders": 200,
      "takeaway_orders": 35,
      "delivery_orders": 10,
      "cancelled_orders": 8,
      "total_guests": 580,
      "gross_sales": "385000.00",
      "net_sales": "365000.00",
      "discount_amount": "12500.00",
      "tax_amount": "28500.00",
      "total_collection": "365000.00",
      "cash_collection": "165000.00",
      "card_collection": "85000.00",
      "upi_collection": "115000.00",
      "average_order_value": "1489.80",
      "average_guest_spend": "629.31",
      "average_daily_sales": "73000.00"
    }
  }
}
```

---

## 6. Staff Performance Report

**GET** `/api/v1/reports/staff`

Staff-wise order and sales performance with overall summary.

### Response:
```json
{
  "success": true,
  "data": {
    "dateRange": { "start": "2026-02-15", "end": "2026-02-20" },
    "staff": [
      {
        "user_id": 5,
        "user_name": "Captain John",
        "total_orders": 85,
        "total_guests": 210,
        "total_sales": 22489,
        "total_discounts": 850,
        "cancelled_orders": 2,
        "cancelled_amount": 450,
        "total_tips": 1200,
        "avg_order_value": "264.58",
        "avg_guest_spend": "107.09"
      }
    ],
    "summary": {
      "total_staff": 8,
      "total_orders": 245,
      "total_guests": 580,
      "total_sales": "365000.00",
      "total_discounts": "12500.00",
      "cancelled_orders": 8,
      "cancelled_amount": "3500.00",
      "total_tips": "5200.00",
      "average_per_staff": "45625.00",
      "top_performer": "Captain John",
      "top_performer_sales": "22489.00"
    }
  }
}
```

---

## 7. Live Dashboard

**GET** `/api/v1/reports/dashboard`

Real-time dashboard stats.

### Response:
```json
{
  "success": true,
  "data": {
    "date": "2026-02-20",
    "sales": {
      "total_orders": 45,
      "total_guests": 112,
      "net_sales": 52300,
      "active_orders": 5
    },
    "activeTables": 8,
    "pendingKots": {
      "kitchen": 3,
      "bar": 2
    },
    "paymentBreakdown": {
      "cash": 25000,
      "upi": 18000,
      "card": 9300
    }
  }
}
```

---

## 8. Item Sales Report

**GET** `/api/v1/reports/item-sales`

Item-wise sales breakdown with overall summary.

### Query Parameters:
| Parameter | Type | Description |
|-----------|------|-------------|
| `outletId` | number | Required |
| `startDate` | string | Start date |
| `endDate` | string | End date |
| `limit` | number | Max items (default 50) |
| `serviceType` | string | `restaurant` or `bar` |

### Response:
```json
{
  "success": true,
  "data": {
    "dateRange": { "start": "2026-02-15", "end": "2026-02-20" },
    "items": [
      {
        "item_id": 15,
        "item_name": "Butter Chicken",
        "variant_name": "Full",
        "category_name": "Main Course",
        "total_quantity": 245,
        "cancelled_quantity": 5,
        "gross_revenue": 61250,
        "discount_amount": 1500,
        "tax_amount": 4500,
        "net_revenue": 59750,
        "order_count": 180,
        "avg_price": "243.88"
      }
    ],
    "summary": {
      "total_items": 45,
      "total_quantity": 1250,
      "cancelled_quantity": 28,
      "gross_revenue": "385000.00",
      "discount_amount": "12500.00",
      "tax_amount": "28500.00",
      "net_revenue": "365000.00",
      "average_item_revenue": "8111.11",
      "top_seller": "Butter Chicken",
      "top_seller_quantity": 245
    }
  }
}
```

---

## 9. Tax Report

**GET** `/api/v1/reports/tax`

Tax component breakdown with daily records and overall summary.

### Response:
```json
{
  "success": true,
  "data": {
    "dateRange": { "start": "2026-02-15", "end": "2026-02-20" },
    "daily": [
      {
        "report_date": "2026-02-19",
        "subtotal": 75000,
        "discount_amount": 2100,
        "taxable_amount": 72900,
        "cgst_amount": 1822.50,
        "sgst_amount": 1822.50,
        "igst_amount": 0,
        "total_tax": 3645,
        "service_charge": 780,
        "grand_total": 77325,
        "invoice_count": 48
      }
    ],
    "taxComponents": [
      { "code": "CGST_2.5", "name": "CGST @ 2.5%", "rate": 2.5, "taxableAmount": 72900, "taxAmount": 1822.50 },
      { "code": "SGST_2.5", "name": "SGST @ 2.5%", "rate": 2.5, "taxableAmount": 72900, "taxAmount": 1822.50 }
    ],
    "summary": {
      "total_subtotal": "385000.00",
      "total_discount": "12500.00",
      "total_taxable": "365000.00",
      "total_cgst": "9125.00",
      "total_sgst": "9125.00",
      "total_igst": "0.00",
      "total_vat": "0.00",
      "total_cess": "0.00",
      "total_tax": "18250.00",
      "total_service_charge": "3850.00",
      "total_grand": "387100.00",
      "total_invoices": 245
    }
  }
}
```

---

## 10. Payment Modes Report

**GET** `/api/v1/reports/payment-modes`

Payment method breakdown with overall summary.

### Response:
```json
{
  "success": true,
  "data": {
    "dateRange": { "start": "2026-02-15", "end": "2026-02-20" },
    "modes": [
      { "payment_mode": "cash", "transaction_count": 125, "total_amount": 35000, "base_amount": 34500, "tip_amount": 500, "percentage_share": "44.74" },
      { "payment_mode": "upi", "transaction_count": 98, "total_amount": 28000, "base_amount": 27800, "tip_amount": 200, "percentage_share": "35.79" },
      { "payment_mode": "card", "transaction_count": 52, "total_amount": 15230, "base_amount": 14930, "tip_amount": 300, "percentage_share": "19.47" }
    ],
    "summary": {
      "total_transactions": 275,
      "total_collected": "78230.00",
      "total_base_amount": "77230.00",
      "total_tips": "1000.00",
      "average_transaction": "284.47"
    }
  }
}
```

---

## Role-Based Access Examples

### Admin Request:
```bash
GET /api/v1/reports/day-end-summary?outletId=4&startDate=2026-01-01&endDate=2026-02-20
Authorization: Bearer <admin_token>

# Response includes ALL orders for outlet
```

### Manager Request (Floor-filtered):
```bash
GET /api/v1/reports/day-end-summary?outletId=4&startDate=2026-01-01&endDate=2026-02-20
Authorization: Bearer <manager_token>

# Response filtered to manager's assigned floors only
# meta.isFiltered = true, meta.floorRestricted = true
```

### Cashier Request (Own Data):
```bash
GET /api/v1/reports/biller-wise?outletId=4&startDate=2026-01-01&endDate=2026-02-20
Authorization: Bearer <cashier_token>

# Response contains only cashier's own billed orders
# meta.isFiltered = true
```

---

## Error Responses

### Missing Required Parameter:
```json
{
  "success": false,
  "message": "outletId is required"
}
```

### Unauthorized:
```json
{
  "success": false,
  "message": "Access denied. Insufficient permissions."
}
```

---

## Floor/Section Assignment

Users are assigned floors via `user_floors` table:
```sql
SELECT floor_id FROM user_floors 
WHERE user_id = ? AND outlet_id = ? AND is_active = 1
```

If a user has **no floor assignments**, they see **all data** (unrestricted).
If a user has **floor assignments**, reports are filtered to those floors only.

### Example Floor Assignment:
```json
{
  "userId": 5,
  "floors": [
    { "floorId": 1, "floorName": "Ground Floor", "isPrimary": true },
    { "floorId": 2, "floorName": "First Floor", "isPrimary": false }
  ]
}
```
