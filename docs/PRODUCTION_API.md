# Module 8 — Pre-Made Food Production API

Base URL: `/api/v1/production`

Production handles semi-finished goods like **gravy, sauce, dough, marinades**.

---

## How Production Works

```
Raw Materials (Onion, Tomato, Oil, Spices)
        ↓
   Production Run
        ↓
   Output Batch Created (Gravy → 5L @ ₹51/L)
        ↓
   Used in Recipes (Paneer Sabji, Dal Makhani)
        ↓
   Cost flows automatically into final dish
```

### Golden Rules

1. **Cost is ALWAYS derived from ingredients** — never manually set
2. **Never change stock directly** — always via movements (`production_in`, `production_out`)
3. **Output becomes a normal inventory item** — has batches, cost, used in recipes, deducted on order

---

## Flow Example: Gravy Production

### Step 1 — Deduct Raw Materials

| Ingredient | Qty   | Avg Price | Cost |
|-----------|-------|-----------|------|
| Onion     | 2 kg  | ₹20/kg    | ₹40  |
| Tomato    | 3 kg  | ₹30/kg    | ₹90  |
| Oil       | 0.5 L | ₹150/L    | ₹75  |
| Spices    | 0.1 kg| ₹500/kg   | ₹50  |
| **Total** |       |           | **₹255** |

Each deduction:
- Batches reduced via **FIFO**
- Movement recorded: `production_out`
- `inventory_items.current_stock` updated

### Step 2 — Create Output Batch

```
Output: 5 liters of gravy
Cost per liter: ₹255 / 5 = ₹51/L
```

- New `inventory_batches` row: `PROD-PRD-20260318-001`, qty=5L, price=₹51/L
- Movement recorded: `production_in`
- `inventory_items.current_stock` and `average_price` updated (weighted average)

### Step 3 — Use Gravy in Recipe

Paneer Sabji recipe uses 200ml gravy:

```
Gravy cost = ₹51/L = ₹0.051/ml
200ml × ₹0.051 = ₹10.20
```

Gravy behaves **exactly like cheese or chicken** — normal inventory item with batches.

---

## Tables

### production_recipes (Templates)

| Column | Type | Description |
|--------|------|-------------|
| id | BIGINT | Primary key |
| outlet_id | BIGINT | FK → outlets |
| name | VARCHAR(255) | e.g. "Tomato Gravy" |
| description | TEXT | Optional |
| output_inventory_item_id | BIGINT | FK → inventory_items (what is produced) |
| output_quantity | DECIMAL(15,4) | Expected output qty |
| output_unit_id | BIGINT | FK → units |
| preparation_time_mins | INT | Optional |
| instructions | TEXT | Optional |
| is_active | BOOLEAN | Default true |

### production_recipe_ingredients (Template inputs)

| Column | Type | Description |
|--------|------|-------------|
| id | BIGINT | Primary key |
| production_recipe_id | BIGINT | FK → production_recipes |
| inventory_item_id | BIGINT | FK → inventory_items (raw material) |
| quantity | DECIMAL(15,4) | Amount needed |
| unit_id | BIGINT | FK → units |

### productions (Run log)

| Column | Type | Description |
|--------|------|-------------|
| id | BIGINT | Primary key |
| outlet_id | BIGINT | FK → outlets |
| production_recipe_id | BIGINT | FK → production_recipes (nullable for ad-hoc) |
| production_number | VARCHAR(50) | e.g. "PRD-20260318-001" |
| name | VARCHAR(255) | Production name |
| status | ENUM | `completed` or `cancelled` |
| output_inventory_item_id | BIGINT | What was produced |
| output_quantity | DECIMAL(15,4) | How much (base unit) |
| output_batch_id | BIGINT | FK → inventory_batches |
| total_input_cost | DECIMAL(12,2) | Sum of all input costs |
| cost_per_output_unit | DECIMAL(12,4) | total_input_cost / output_quantity |

### production_inputs (What was consumed)

| Column | Type | Description |
|--------|------|-------------|
| production_id | BIGINT | FK → productions |
| inventory_item_id | BIGINT | What was consumed |
| quantity_in_base | DECIMAL(15,4) | Amount consumed (base unit) |
| unit_cost | DECIMAL(12,4) | Price per base unit at time of production |
| total_cost | DECIMAL(12,2) | quantity × unit_cost |

### Inventory Movements

Two new movement types added:

| Type | Direction | Meaning |
|------|-----------|---------|
| `production_out` | Negative | Raw material consumed |
| `production_in` | Positive | Output batch created |

---

## API Endpoints

### 1. List Production Recipes

```
GET /:outletId/recipes
```

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| page | number | 1 | Page number |
| limit | number | 50 | Items per page |
| search | string | | Search by name |
| isActive | boolean | | Filter by active status |
| sortBy | string | name | `name`, `created_at`, `updated_at` |
| sortOrder | string | ASC | `ASC` or `DESC` |

**Response:**

```json
{
  "success": true,
  "data": {
    "recipes": [
      {
        "id": 1,
        "outletId": 4,
        "name": "Tomato Gravy",
        "description": "Base gravy for curries",
        "outputInventoryItemId": 15,
        "outputItemName": "Gravy",
        "outputQuantity": 5,
        "outputUnitId": 3,
        "outputUnitAbbreviation": "L",
        "ingredientCount": 4,
        "productionCount": 12,
        "isActive": true
      }
    ],
    "pagination": { "page": 1, "limit": 50, "total": 3, "totalPages": 1 }
  }
}
```

---

### 2. Get Production Recipe Detail

```
GET /recipes/:id
```

Returns recipe with **all ingredients + live cost calculation**.

**Response:**

```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Tomato Gravy",
    "outputInventoryItemId": 15,
    "outputItemName": "Gravy",
    "outputQuantity": 5,
    "outputUnitAbbreviation": "L",
    "ingredients": [
      {
        "inventoryItemId": 5,
        "itemName": "Onion",
        "quantity": 2,
        "unitAbbreviation": "KG",
        "currentStock": 25,
        "stockUnitAbbreviation": "KG",
        "liveCost": 40,
        "notes": null
      },
      {
        "inventoryItemId": 6,
        "itemName": "Tomato",
        "quantity": 3,
        "unitAbbreviation": "KG",
        "currentStock": 18,
        "stockUnitAbbreviation": "KG",
        "liveCost": 90,
        "notes": null
      },
      {
        "inventoryItemId": 8,
        "itemName": "Oil",
        "quantity": 0.5,
        "unitAbbreviation": "L",
        "currentStock": 10,
        "stockUnitAbbreviation": "L",
        "liveCost": 75,
        "notes": null
      },
      {
        "inventoryItemId": 9,
        "itemName": "Spices",
        "quantity": 0.1,
        "unitAbbreviation": "KG",
        "currentStock": 5,
        "stockUnitAbbreviation": "KG",
        "liveCost": 50,
        "notes": null
      }
    ],
    "totalInputCost": 255,
    "costPerOutputUnit": 51
  }
}
```

---

### 3. Create Production Recipe

```
POST /:outletId/recipes
```

**Payload:**

```json
{
  "name": "Tomato Gravy",
  "description": "Base gravy for curries",
  "outputInventoryItemId": 15,
  "outputQuantity": 5,
  "outputUnitId": 3,
  "preparationTimeMins": 45,
  "instructions": "Saute onions, add tomatoes, blend...",
  "ingredients": [
    { "inventoryItemId": 5, "quantity": 2, "unitId": 2 },
    { "inventoryItemId": 6, "quantity": 3, "unitId": 2 },
    { "inventoryItemId": 8, "quantity": 0.5, "unitId": 3 },
    { "inventoryItemId": 9, "quantity": 0.1, "unitId": 2 }
  ]
}
```

| Field | Required | Description |
|-------|----------|-------------|
| name | Yes | Recipe name |
| outputInventoryItemId | Yes | FK → inventory_items (output item must exist) |
| outputQuantity | Yes | Expected output quantity (> 0) |
| outputUnitId | Yes | Unit for output quantity |
| ingredients | Yes | Array of input items |
| ingredients[].inventoryItemId | Yes | Raw material item ID |
| ingredients[].quantity | Yes | Amount needed |
| ingredients[].unitId | Yes | Unit for this amount |

---

### 4. Update Production Recipe

```
PUT /recipes/:id
```

**Payload:** (all fields optional)

```json
{
  "name": "Tomato Gravy v2",
  "outputQuantity": 4.5,
  "ingredients": [
    { "inventoryItemId": 5, "quantity": 2.5, "unitId": 2 },
    { "inventoryItemId": 6, "quantity": 3, "unitId": 2 }
  ]
}
```

If `ingredients` is provided, it **replaces** all existing ingredients.

---

### 5. Execute Production (THE MAIN ACTION)

```
POST /:outletId/produce
```

This is the core endpoint. It:
1. **Deducts** raw materials from inventory (FIFO batch deduction)
2. **Calculates** total input cost from avg prices
3. **Creates** output batch with derived cost
4. **Records** all movements (`production_out` for inputs, `production_in` for output)
5. **Updates** output item stock + weighted average price

#### Option A: From Template

```json
{
  "productionRecipeId": 1,
  "notes": "Morning batch"
}
```

#### Option B: From Template with Custom Output Quantity

Ingredients auto-scale proportionally:

```json
{
  "productionRecipeId": 1,
  "outputQuantity": 10,
  "notes": "Double batch"
}
```

If template says 5L from (2kg onion, 3kg tomato), doubling to 10L auto-scales to (4kg onion, 6kg tomato).

#### Option C: Ad-hoc Production (No Template)

```json
{
  "name": "Special Sauce",
  "outputInventoryItemId": 20,
  "outputQuantity": 2,
  "outputUnitId": 3,
  "ingredients": [
    { "inventoryItemId": 6, "quantity": 3, "unitId": 2 },
    { "inventoryItemId": 8, "quantity": 0.2, "unitId": 3 }
  ],
  "notes": "One-off batch"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": 45,
    "productionNumber": "PRD-20260318-001",
    "name": "Tomato Gravy",
    "status": "completed",
    "outputInventoryItemId": 15,
    "outputItemName": "Gravy",
    "outputQuantity": 5,
    "outputUnitAbbreviation": "L",
    "outputBatchId": 102,
    "outputBatchCode": "PROD-PRD-20260318-001",
    "totalInputCost": 255,
    "costPerOutputUnit": 51,
    "inputs": [
      {
        "inventoryItemId": 5,
        "itemName": "Onion",
        "quantity": 2,
        "unitAbbreviation": "KG",
        "unitCost": 20,
        "totalCost": 40
      },
      {
        "inventoryItemId": 6,
        "itemName": "Tomato",
        "quantity": 3,
        "unitAbbreviation": "KG",
        "unitCost": 30,
        "totalCost": 90
      },
      {
        "inventoryItemId": 8,
        "itemName": "Oil",
        "quantity": 0.5,
        "unitAbbreviation": "L",
        "unitCost": 150,
        "totalCost": 75
      },
      {
        "inventoryItemId": 9,
        "itemName": "Spices",
        "quantity": 0.1,
        "unitAbbreviation": "KG",
        "unitCost": 500,
        "totalCost": 50
      }
    ],
    "producedAt": "2026-03-18T10:30:00.000Z",
    "createdByName": "Chef Ravi"
  }
}
```

**Error Cases:**

| Error | HTTP | When |
|-------|------|------|
| `Insufficient stock for item X` | 400 | Not enough raw material |
| `Production recipe not found` | 400 | Invalid recipe ID |
| `Production recipe is inactive` | 400 | Deactivated template |

---

### 6. List Production History

```
GET /:outletId/history
```

**Query Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| page | number | Page number |
| limit | number | Items per page |
| search | string | Search by name, production number |
| status | string | `completed` or `cancelled` |
| productionRecipeId | number | Filter by template |
| outputItemId | number | Filter by output item |
| startDate | string | YYYY-MM-DD |
| endDate | string | YYYY-MM-DD |
| sortBy | string | `produced_at`, `total_input_cost`, `output_quantity`, `name` |
| sortOrder | string | `ASC` or `DESC` |

**Response:**

```json
{
  "success": true,
  "data": {
    "productions": [
      {
        "id": 45,
        "productionNumber": "PRD-20260318-001",
        "name": "Tomato Gravy",
        "status": "completed",
        "outputItemName": "Gravy",
        "outputQuantity": 5,
        "totalInputCost": 255,
        "costPerOutputUnit": 51,
        "producedAt": "2026-03-18T10:30:00.000Z",
        "createdByName": "Chef Ravi"
      }
    ],
    "pagination": { "page": 1, "limit": 50, "total": 12, "totalPages": 1 }
  }
}
```

---

### 7. Get Production Detail

```
GET /detail/:id
```

Returns full production with all inputs and output batch info.

---

## Edge Cases

### Gravy Waste

Spoiled gravy → use inventory wastage API on the gravy item:

```
POST /api/v1/inventory/:outletId/wastage
{ "inventoryItemId": 15, "quantity": 0.5, "reason": "Spoiled overnight" }
```

### Multiple Batches

Old gravy + new gravy — each production creates a separate batch. Recipe usage follows configured costing method (FIFO/Average/Latest).

### Daily Reproduction

Making gravy every day creates different cost batches:

| Day | Batch | Qty | Cost/L |
|-----|-------|-----|--------|
| Mon | PROD-001 | 5L | ₹51 |
| Tue | PROD-002 | 5L | ₹55 |
| Wed | PROD-003 | 5L | ₹48 |

Average price updates automatically with weighted average.

### Stock Check Before Production

The `produce` endpoint **checks stock before deducting**. If any ingredient has insufficient stock, the entire production is rolled back (atomic transaction).

---

## Cost Snapshot (Order Time)

When a dish using gravy is ordered, the **making cost is frozen** in `order_item_costs`:

```
GET /api/v1/orders/:orderId/costs
```

This means even if gravy price changes tomorrow, yesterday's profit report stays accurate.

---

## Inventory Impact Summary

| Event | inventory_batches | inventory_movements | inventory_items |
|-------|------------------|--------------------:|-----------------|
| Production (inputs) | `remaining_quantity` ↓ | `production_out` | `current_stock` ↓ |
| Production (output) | New batch created | `production_in` | `current_stock` ↑, `average_price` updated |
| Order (using gravy) | `remaining_quantity` ↓ | `sale` | `current_stock` ↓ |
| Wastage | `remaining_quantity` ↓ | `wastage` | `current_stock` ↓ |

---

## Complete Flow Example

```
1. Purchase: Buy 10kg Tomato @ ₹30/kg
   → Batch T001: 10kg, ₹30/kg
   → Movement: purchase +10kg

2. Production: Make 4L Tomato Sauce (uses 5kg tomato + salt + oil)
   → Deduct 5kg from T001 (remaining: 5kg)
   → Movement: production_out -5kg
   → Calculate: 5×30 + 0.05×200 + 0.2×150 = 150+10+30 = ₹190
   → Create batch PROD-001: 4L sauce @ ₹47.50/L
   → Movement: production_in +4L
   → Sauce avg_price = ₹47.50/L

3. Recipe: Pizza uses 80ml sauce
   → Cost: 80 × 0.0475 = ₹3.80

4. Order: 2 pizzas ordered
   → Cost snapshot: 2 × ₹3.80 = ₹7.60 (frozen in order_item_costs)
   → Sauce deducted: 160ml from PROD-001

5. Report: Tomorrow, even if tomato price changes, order profit stays correct
```
