# Modules 9, 10, 11 — Stock Deduction, Wastage Management, Inventory Reports

> **Base URL**: `/api/v1`

---

## Table of Contents

1. [Module 9 — Stock Deduction System](#module-9--stock-deduction-system)
2. [Module 10 — Wastage Management](#module-10--wastage-management)
3. [Module 11 — Inventory Reports](#module-11--inventory-reports)
4. [Complete End-to-End Flow](#complete-end-to-end-flow)
5. [API Route Summary](#api-route-summary)

---

# Module 9 — Stock Deduction System

## How It Works

Stock is deducted **when order items are added** (not at payment time).

### Flow

```
Order Item Added
  → Load recipe for menu item
  → For each ingredient:
      → Calculate: recipe_qty × recipe_unit_cf × order_qty
      → Apply wastage: × (1 + wastage% / 100)
      → Apply yield:   × (100 / yield%)
      → FIFO batch deduction (oldest batch first)
      → Record inventory_movement (type: 'sale')
      → Update inventory_items.current_stock
  → Mark order_item.stock_deducted = 1
```

### Cancel Reversal Flow

```
Order Item / Order Cancelled
  → For each sale movement linked to the order item:
      → Create restoration batch (code: REV-ORD-{orderItemId})
      → Restore inventory_items.current_stock
      → Recalculate weighted average price
      → Record inventory_movement (type: 'sale_reversal')
  → Mark order_item.stock_deducted = 0
  → Mark orders.stock_reversed = 1
```

### Scenarios

| Scenario | Stock Deducted? | Revenue? | Notes |
|----------|----------------|----------|-------|
| Normal order | ✅ Yes | ✅ Yes | Standard flow |
| NC order (complimentary) | ✅ Yes | ❌ No | `is_nc = 1`, stock still deducted |
| Due order | ✅ Yes | ✅ Yes | Deducted immediately, payment tracked separately |
| Order cancelled | ⏪ Reversed | ❌ No | All movements reversed via `sale_reversal` |
| Item cancelled | ⏪ Reversed | ❌ No | Only that item's movements reversed |
| Recipe updated after order | ❌ No effect | — | Cost snapshot already saved at order time |

### Settings

Stock deduction can be disabled per outlet:

```
outlet_settings: key = 'auto_deduct_stock', value = 'false'
```

### No Separate API

Stock deduction happens **automatically** inside:
- `POST /api/v1/orders/:orderId/items` (addItems)
- `DELETE /api/v1/orders/items/:itemId` (cancelItem)
- `POST /api/v1/orders/:orderId/cancel` (cancelOrder)

### Example: What Happens Internally

**Order: 2 × Paneer Butter Masala**

Recipe ingredients:
| Ingredient | Recipe Qty | Unit CF | Wastage | Yield | Effective/Portion |
|-----------|-----------|---------|---------|-------|-------------------|
| Paneer | 200g | 1 | 0% | 100% | 200g |
| Tomato Puree | 150g | 1 | 0% | 90% | 166.67g |
| Butter | 20g | 1 | 0% | 100% | 20g |

For order qty = 2:
| Ingredient | Total Deducted | FIFO Batches Used |
|-----------|---------------|-------------------|
| Paneer | 400g | B#11: 400g @ ₹0.32/g = ₹128.00 |
| Tomato Puree | 333.33g | B#6: 333.33g @ ₹0.05/g = ₹16.67 |
| Butter | 40g | B#12: 40g @ ₹0.55/g = ₹22.00 |

**Movements created:**
```
inventory_movements:
  Paneer     → -400g    (sale, ref: order_item #X)
  Tomato     → -333.33g (sale, ref: order_item #X)
  Butter     → -40g     (sale, ref: order_item #X)
```

**On cancel:**
```
inventory_movements:
  Paneer     → +400g    (sale_reversal, ref: order_item #X)
  Tomato     → +333.33g (sale_reversal, ref: order_item #X)
  Butter     → +40g     (sale_reversal, ref: order_item #X)
```

---

# Module 10 — Wastage Management

## API Endpoints

### 1. Record Wastage

```
POST /api/v1/wastage/:outletId
```

**Request Body:**
```json
{
  "inventoryItemId": 5,
  "batchId": 12,
  "quantity": 500,
  "unitId": 1,
  "wastageType": "spoilage",
  "reason": "Onions spoiled due to humidity",
  "wastageDate": "2026-03-19"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `inventoryItemId` | number | ✅ | Inventory item ID |
| `batchId` | number | ❌ | Specific batch to deduct from (FIFO if omitted) |
| `quantity` | number | ✅ | Quantity to waste |
| `unitId` | number | ❌ | Unit of the quantity (base unit if omitted) |
| `wastageType` | string | ❌ | `spoilage` \| `expired` \| `damaged` \| `cooking_loss` \| `other` |
| `reason` | string | ❌ | Reason text |
| `approvedBy` | number | ❌ | Manager who approved |
| `wastageDate` | date | ❌ | Date of wastage (defaults to today) |

**Response (201):**
```json
{
  "success": true,
  "message": "Wastage recorded successfully",
  "data": {
    "id": 1,
    "inventoryItemId": 5,
    "itemName": "Onion",
    "quantity": 500,
    "qtyInBase": 500,
    "displayQty": 0.5,
    "displayUnit": "kg",
    "wastageType": "spoilage",
    "reason": "Onions spoiled due to humidity",
    "unitCost": 0.04,
    "totalCost": 20.00,
    "stockBefore": 15.0,
    "stockAfter": 14.5,
    "wastageDate": "2026-03-19",
    "reportedBy": 1
  }
}
```

**What happens internally:**
1. Deducts from batch (specific or FIFO)
2. Updates `inventory_items.current_stock`
3. Creates `inventory_movements` record (type: `wastage`)
4. Creates `wastage_logs` record

---

### 2. List Wastage Logs

```
GET /api/v1/wastage/:outletId
```

**Query Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | number | 1 | Page number |
| `limit` | number | 50 | Items per page (max 100) |
| `inventoryItemId` | number | — | Filter by item |
| `wastageType` | string | — | Filter by type |
| `startDate` | date | — | Start date filter |
| `endDate` | date | — | End date filter |
| `sortBy` | string | `wastage_date` | Sort field |
| `sortOrder` | string | `DESC` | ASC or DESC |

**Response:**
```json
{
  "success": true,
  "data": {
    "wastage": [
      {
        "id": 1,
        "inventoryItemId": 5,
        "itemName": "Onion",
        "batchId": null,
        "batchCode": null,
        "quantity": 0.5,
        "unit": "kg",
        "unitCost": 40.0,
        "totalCost": 20.00,
        "wastageType": "spoilage",
        "reason": "Onions spoiled due to humidity",
        "wastageDate": "2026-03-19",
        "reportedBy": "Admin",
        "approvedBy": null,
        "createdAt": "2026-03-19T06:00:00.000Z"
      }
    ],
    "summary": {
      "totalEntries": 1,
      "totalCostLost": 20.00,
      "totalQtyWasted": 500
    },
    "pagination": { "page": 1, "limit": 50, "total": 1, "totalPages": 1 }
  }
}
```

---

### 3. Near-Expiry Batches (Flag Only)

```
GET /api/v1/wastage/:outletId/near-expiry?days=7
```

> **Important:** This only **flags** batches. No auto-deduction. Admin must manually record wastage.

**Response:**
```json
{
  "success": true,
  "data": {
    "batches": [
      {
        "batchId": 12,
        "batchCode": "PUR-001",
        "inventoryItemId": 5,
        "itemName": "Onion",
        "remainingQty": 2.5,
        "unit": "kg",
        "expiryDate": "2026-03-22",
        "daysUntilExpiry": 3,
        "isExpired": false,
        "purchasePrice": 40.0,
        "estimatedLoss": 100.00
      }
    ],
    "totalCount": 1,
    "expiredCount": 0,
    "estimatedTotalLoss": 100.00
  }
}
```

---

### Wastage Types

| Type | When to Use |
|------|------------|
| `spoilage` | Raw material went bad (default) |
| `expired` | Past expiry date |
| `damaged` | Physical damage |
| `cooking_loss` | Loss during cooking (process loss) |
| `other` | Any other reason |

### Production Loss vs Wastage

| Type | Where Tracked | Example |
|------|--------------|---------|
| **Production loss** | `productions` table (`loss_quantity`) | Input 6kg → Output 5L = 1kg loss |
| **Inventory wastage** | `wastage_logs` + `inventory_movements` | 1L gravy spoiled |
| **Recipe wastage** | `ingredients.wastage_percentage` | 10% onion peeling loss (auto-applied) |

---

# Module 11 — Inventory Reports

## API Endpoints

### 1. Stock Summary Report

```
GET /api/v1/inventory-reports/:outletId/stock-summary
```

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `categoryId` | number | Filter by category |
| `search` | string | Search by item name |
| `lowStockOnly` | boolean | Only items at/below reorder level |
| `sortBy` | string | `name` \| `current_stock` \| `average_price` \| `stock_value` |
| `sortOrder` | string | `ASC` \| `DESC` |

**Response:**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": 1,
        "name": "Tomato",
        "sku": "TOM-001",
        "category": "Vegetables",
        "stock": 10.0,
        "unit": "kg",
        "avgPrice": 48.30,
        "latestPrice": 50.00,
        "stockValue": 483.00,
        "activeBatches": 2,
        "reorderLevel": 5.0,
        "isLowStock": false,
        "isZeroStock": false
      }
    ],
    "summary": {
      "totalItems": 8,
      "totalStockValue": 12500.00,
      "lowStockCount": 1,
      "zeroStockCount": 0
    }
  }
}
```

---

### 2. Batch Report

```
GET /api/v1/inventory-reports/:outletId/batches
```

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `inventoryItemId` | number | Filter by item |
| `activeOnly` | boolean | Only active batches with stock (default: true) |

**Response:**
```json
{
  "success": true,
  "data": {
    "batches": [
      {
        "batchId": 6,
        "batchCode": "PUR-002",
        "inventoryItemId": 1,
        "itemName": "Tomato",
        "originalQty": 5.0,
        "remainingQty": 3.5,
        "unit": "kg",
        "purchasePrice": 50.00,
        "batchValue": 175.00,
        "purchaseDate": "2026-03-18",
        "expiryDate": null,
        "isActive": true,
        "usedPercentage": 30.0
      }
    ],
    "summary": {
      "totalBatches": 12,
      "totalBatchValue": 12500.00
    }
  }
}
```

---

### 3. Stock Ledger (MOST IMPORTANT)

```
GET /api/v1/inventory-reports/:outletId/stock-ledger
```

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `inventoryItemId` | number | Filter by item |
| `movementType` | string | `purchase` \| `sale` \| `wastage` \| `production_in` \| `production_out` \| `adjustment` \| `sale_reversal` \| `production_reversal` |
| `startDate` | date | Start date |
| `endDate` | date | End date |
| `page` | number | Page (default: 1) |
| `limit` | number | Limit (default: 100, max: 500) |
| `sortOrder` | string | `ASC` \| `DESC` (default: DESC) |

**Response:**
```json
{
  "success": true,
  "data": {
    "movements": [
      {
        "id": 1,
        "date": "2026-03-19T04:30:00.000Z",
        "itemName": "Tomato",
        "itemSku": "TOM-001",
        "movementType": "purchase",
        "quantity": 10.0,
        "unit": "kg",
        "direction": "IN",
        "unitCost": 30.00,
        "totalCost": 300.00,
        "balanceBefore": 0.0,
        "balanceAfter": 10.0,
        "batchCode": "PUR-001",
        "referenceType": "purchase",
        "referenceId": 1,
        "notes": null,
        "createdBy": "Admin"
      },
      {
        "id": 2,
        "date": "2026-03-19T06:00:00.000Z",
        "itemName": "Tomato",
        "movementType": "production_out",
        "quantity": -5.0,
        "unit": "kg",
        "direction": "OUT",
        "unitCost": 30.00,
        "totalCost": 150.00,
        "balanceBefore": 10.0,
        "balanceAfter": 5.0,
        "referenceType": "production",
        "referenceId": 1,
        "notes": "Production: Tomato Gravy",
        "createdBy": "Admin"
      },
      {
        "id": 3,
        "date": "2026-03-19T10:00:00.000Z",
        "itemName": "Gravy",
        "movementType": "sale",
        "quantity": -0.4,
        "unit": "L",
        "direction": "OUT",
        "unitCost": 37.50,
        "totalCost": 15.00,
        "balanceBefore": 4.0,
        "balanceAfter": 3.6,
        "referenceType": "order_item",
        "referenceId": 42,
        "notes": "Order #101, Gravy: 400 base units",
        "createdBy": "Waiter"
      }
    ],
    "summary": [
      { "type": "purchase", "count": 5, "totalQty": 50.0, "totalValue": 2500.00 },
      { "type": "sale", "count": 12, "totalQty": -8.5, "totalValue": 425.00 },
      { "type": "wastage", "count": 1, "totalQty": -0.5, "totalValue": 20.00 }
    ],
    "pagination": { "page": 1, "limit": 100, "total": 18, "totalPages": 1 }
  }
}
```

---

### 4. Recipe Consumption Report

```
GET /api/v1/inventory-reports/:outletId/recipe-consumption
```

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `startDate` | date | Start date |
| `endDate` | date | End date |
| `recipeId` | number | Filter by recipe |
| `menuItemId` | number | Filter by menu item |

**Response:**
```json
{
  "success": true,
  "data": {
    "consumption": [
      {
        "ingredientId": 1,
        "ingredientName": "Paneer Cubes",
        "inventoryItemId": 3,
        "inventoryItemName": "Paneer",
        "recipeQtyPerPortion": 0.2,
        "unit": "kg",
        "totalOrderQty": 100,
        "orderCount": 50,
        "totalConsumed": 20.0,
        "estimatedCost": 6400.00
      },
      {
        "ingredientId": 2,
        "ingredientName": "Tomato Puree",
        "inventoryItemId": 1,
        "inventoryItemName": "Tomato",
        "recipeQtyPerPortion": 0.167,
        "unit": "kg",
        "totalOrderQty": 100,
        "orderCount": 50,
        "totalConsumed": 16.67,
        "estimatedCost": 805.00
      }
    ],
    "summary": {
      "totalIngredients": 5,
      "totalEstimatedCost": 9565.00
    }
  }
}
```

---

### 5. Production Report

```
GET /api/v1/inventory-reports/:outletId/production
```

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `startDate` | date | Start date |
| `endDate` | date | End date |
| `status` | string | `completed` \| `cancelled` |
| `outputItemId` | number | Filter by output item |

**Response:**
```json
{
  "success": true,
  "data": {
    "productions": [
      {
        "id": 1,
        "productionNumber": "PRD-20260319-001",
        "name": "Tomato Gravy",
        "status": "completed",
        "outputItem": "Gravy",
        "outputQty": 5.0,
        "unit": "L",
        "totalInputCost": 255.00,
        "costPerUnit": 51.00,
        "producedAt": "2026-03-19T06:00:00.000Z",
        "reversedAt": null,
        "reversalNotes": null
      }
    ],
    "summary": {
      "totalProductions": 1,
      "completedCount": 1,
      "cancelledCount": 0,
      "totalInputCost": 255.00,
      "totalOutputQty": 5.0
    }
  }
}
```

---

### 6. Wastage Report

```
GET /api/v1/inventory-reports/:outletId/wastage
```

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `startDate` | date | Start date |
| `endDate` | date | End date |
| `wastageType` | string | Filter by type |
| `inventoryItemId` | number | Filter by item |
| `groupBy` | string | `item` (default) \| `type` \| `date` |

**Response (groupBy=item):**
```json
{
  "success": true,
  "data": {
    "groups": [
      {
        "key": 5,
        "label": "Onion",
        "incidentCount": 3,
        "totalQty": 2.5,
        "unit": "kg",
        "totalCostLost": 100.00
      },
      {
        "key": 8,
        "label": "Gravy",
        "incidentCount": 1,
        "totalQty": 1.0,
        "unit": "L",
        "totalCostLost": 51.00
      }
    ],
    "summary": {
      "totalIncidents": 4,
      "totalCostLost": 151.00,
      "groupBy": "item"
    }
  }
}
```

---

### 7. Profit Report

```
GET /api/v1/inventory-reports/:outletId/profit
```

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `startDate` | date | Start date |
| `endDate` | date | End date |
| `menuItemId` | number | Filter by menu item |
| `sortBy` | string | `profit` \| `revenue` \| `cost` \| `qty` |
| `sortOrder` | string | `ASC` \| `DESC` |

**Profit Formula:** `profit = selling_price - actual_cost`

**Response:**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "itemId": 1,
        "itemName": "Paneer Butter Masala",
        "variantId": null,
        "variantName": null,
        "orderCount": 50,
        "qtySold": 100,
        "revenue": 32900.00,
        "ncAmount": 329.00,
        "netRevenue": 32571.00,
        "makingCost": 9565.00,
        "profit": 23006.00,
        "profitMargin": 70.63,
        "foodCostPct": 29.37
      }
    ],
    "summary": {
      "totalItems": 1,
      "grandRevenue": 32900.00,
      "grandNc": 329.00,
      "grandNetRevenue": 32571.00,
      "grandMakingCost": 9565.00,
      "grandProfit": 23006.00,
      "overallMargin": 70.63,
      "overallFoodCostPct": 29.37
    }
  }
}
```

---

### 8. Daily Business Summary

```
GET /api/v1/inventory-reports/:outletId/daily-summary
```

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `date` | date | Single date (defaults to today) |
| `startDate` | date | Start of range |
| `endDate` | date | End of range |

**Response:**
```json
{
  "success": true,
  "data": {
    "date": "2026-03-19",
    "sales": {
      "totalOrders": 45,
      "completedOrders": 40,
      "cancelledOrders": 2,
      "grossSale": 50000.00,
      "discount": 2500.00,
      "tax": 4250.00,
      "netSale": 51750.00,
      "roundOff": -12.00,
      "ncAmount": 1200.00,
      "dueAmount": 3500.00,
      "collectedAmount": 48250.00
    },
    "cost": {
      "makingCost": 15000.00,
      "wastageCost": 500.00,
      "wastageCount": 3,
      "totalExpense": 15500.00
    },
    "profit": {
      "grossProfit": 36750.00,
      "netProfit": 36250.00,
      "profitMargin": 70.05,
      "foodCostPct": 28.99
    }
  }
}
```

---

# Complete End-to-End Flow

```
1. PURCHASE: Tomato 10kg @ ₹30/kg
   → inventory_batches: +10kg @ ₹0.03/g
   → inventory_items.current_stock: +10000g
   → inventory_movements: +10000g (purchase)

2. PRODUCTION: Use 5kg Tomato → Make 4L Gravy
   → Tomato: -5000g (production_out)
   → Gravy:  +4000ml (production_in), cost = ₹150, ₹37.5/L
   → inventory_movements: 2 records

3. ORDER: 2 × Paneer Sabji (uses 400ml gravy per portion)
   → Gravy: -800ml (sale, FIFO from oldest batch)
   → Cost snapshot: ₹30 (800ml × ₹37.5/L)
   → inventory_movements: -800ml (sale)

4. WASTAGE: 1L gravy spoiled
   → Gravy: -1000ml (wastage)
   → wastage_logs: 1L, spoilage, ₹37.50 lost
   → inventory_movements: -1000ml (wastage)

5. REPORTS:
   → Stock:  Gravy = 2.2L remaining
   → Ledger: 4 movements tracked
   → Profit: Revenue ₹658 - Cost ₹30 = ₹628 profit
   → Wastage: 1L lost = ₹37.50
   → Daily:  Net profit = ₹628 - ₹37.50 wastage = ₹590.50

GOLDEN RULE: Every stock change → inventory_movements
  ✔ purchase
  ✔ sale (order)
  ✔ sale_reversal (order cancel)
  ✔ production_in / production_out
  ✔ production_reversal
  ✔ wastage
  ✔ adjustment
```

---

# API Route Summary

| Method | Endpoint | Description |
|--------|----------|-------------|
| **Module 9 — Stock Deduction** | | |
| — | (automatic) | Deducts on `addItems`, reverses on cancel |
| **Module 10 — Wastage** | | |
| POST | `/wastage/:outletId` | Record wastage |
| GET | `/wastage/:outletId` | List wastage logs |
| GET | `/wastage/:outletId/near-expiry` | Near-expiry batches |
| **Module 11 — Reports** | | |
| GET | `/inventory-reports/:outletId/stock-summary` | Current stock + value |
| GET | `/inventory-reports/:outletId/batches` | All batches detail |
| GET | `/inventory-reports/:outletId/stock-ledger` | Full movement history |
| GET | `/inventory-reports/:outletId/recipe-consumption` | Ingredient usage from orders |
| GET | `/inventory-reports/:outletId/production` | Production history |
| GET | `/inventory-reports/:outletId/wastage` | Wastage summary |
| GET | `/inventory-reports/:outletId/profit` | Item-level profit |
| GET | `/inventory-reports/:outletId/daily-summary` | Daily business overview |

---

## Database Tables

### New Tables (Migration 043)

| Table | Purpose |
|-------|---------|
| `wastage_logs` | All wastage events with type, reason, cost |

### Modified Tables

| Table | Change |
|-------|--------|
| `order_items` | Added `stock_deducted` (TINYINT) |
| `orders` | Added `stock_reversed` (TINYINT) |
| `inventory_movements` | Added `sale_reversal` to ENUM |

### Movement Types (Complete)

| Type | Direction | When |
|------|-----------|------|
| `purchase` | IN (+) | Purchase stock |
| `sale` | OUT (-) | Order placed |
| `sale_reversal` | IN (+) | Order cancelled |
| `production_in` | IN (+) | Production output |
| `production_out` | OUT (-) | Production input consumed |
| `production_reversal` | IN (+) | Production reversed |
| `wastage` | OUT (-) | Stock wasted |
| `adjustment` | IN/OUT | Manual adjustment |

---

## Files Created / Modified

### New Files
| File | Purpose |
|------|---------|
| `src/services/stockDeduction.service.js` | Stock deduction + reversal logic |
| `src/services/wastage.service.js` | Wastage recording + listing |
| `src/services/inventoryReports.service.js` | All 8 report queries |
| `src/controllers/wastage.controller.js` | Wastage API handlers |
| `src/controllers/inventoryReports.controller.js` | Report API handlers |
| `src/routes/wastage.routes.js` | Wastage endpoints |
| `src/routes/inventoryReports.routes.js` | Report endpoints |
| `src/database/migrations/043_stock_deduction_wastage_reporting.sql` | Schema changes |

### Modified Files
| File | Change |
|------|--------|
| `src/services/order.service.js` | Added stock deduction on addItems, reversal on cancelItem/cancelOrder |
| `src/routes/index.js` | Registered wastage + inventory-reports routes |
