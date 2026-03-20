# Recipe & Ingredient Management API

**Base URL:** `/api/v1/recipes`

> **System Flow (Read-Only Cost — never auto-updates menu item price):**
> ```
> Inventory Item → Ingredient (with yield%) → Recipe (ingredient + qty) → Menu Item
>                                                                          ↓
>                                              Cost Calculator → shows Profit / Loss
>                                              (Selling Price - Making Cost = Profit)
> ```

---

## Table of Contents

1. [How Yield Works](#how-yield-works)
2. [How Making Cost is Calculated](#how-making-cost-is-calculated)
3. [Module 5: Ingredients](#module-5-ingredient-management)
4. [Module 6: Recipes](#module-6-recipe-management)
5. [Module 7: Cost Calculator](#module-7-cost-calculator)
6. [Cost Snapshot (Order Time)](#cost-snapshot-order-time)
7. [Complete Flow Example](#complete-flow-example)
8. [Database Schema](#database-schema)

---

## How Yield Works

**Yield = How much usable material you get from the raw material you purchased.**

When you buy 1 kg of Tomato, not all of it is usable — you cut the stem, remove seeds, peel etc.
If you get 800g usable from 1 kg raw, the **yield = 80%**.

### Impact on Recipe Cost

If a recipe needs **200g of prepared tomato**, how much raw tomato do you actually need to buy?

```
Raw needed = Recipe quantity ÷ (Yield% / 100)
Raw needed = 200g ÷ (80 / 100)
Raw needed = 200g ÷ 0.8
Raw needed = 250g
```

So the system costs **250g worth of tomato**, not 200g. This gives the TRUE making cost.

### Wastage (Additional)

Wastage is extra loss DURING cooking (burning, spillage, etc.), applied ON TOP of yield.

```
Effective quantity = recipe_qty × (1 + wastage% / 100) × (100 / yield%)
```

**Full example:**
```
Ingredient: Onion
  Yield: 85% (15% lost during peeling/cutting)
  Wastage: 5% (5% lost during cooking — burning etc.)
  Recipe needs: 100g prepared onion

  Effective qty = 100 × (1 + 5/100) × (100/85)
               = 100 × 1.05 × 1.1765
               = 123.53g raw onion needed

  If onion price = ₹30/kg = ₹0.03/g
  Ingredient cost = 123.53 × 0.03 = ₹3.71
```

---

## How Making Cost is Calculated

The system calculates making cost using **4 methods**. You choose which method to use per outlet.

| Method      | Price Source                                | When to Use                                    |
|-------------|---------------------------------------------|------------------------------------------------|
| **average** | Weighted average price from all purchases   | Most stable — smooths out price fluctuations   |
| **latest**  | Price from the most recent purchase         | When you want current market-rate costs        |
| **fifo**    | Weighted cost across batches (oldest first) | For perishables — splits across multiple batches |
| **manual**  | Uses average price as base                  | When you want manual control                   |

### Cost Formula (per ingredient in recipe)

```
Step 1: Convert recipe quantity to base unit
   qty_in_base = recipe_qty × (recipe_unit_conversion / base_unit_conversion)
   Example: 0.5 kg → base unit is g → 0.5 × (1000/1) = 500g

Step 2: Apply yield and wastage
   effective_qty = qty_in_base × (1 + wastage%/100) × (100 / yield%)

Step 3: Get price per base unit (based on costing method)
   average → inventory_items.average_price (price per base unit)
   latest  → inventory_items.latest_price
   fifo    → split across multiple batches (oldest first), weighted cost
            Example: Need 150g cheese
              Batch1: 100g remaining @ ₹0.40/g → cost = ₹40
              Batch2: 50g  remaining @ ₹0.50/g → cost = ₹25
              Total FIFO cost = ₹65 (not just ₹0.40 × 150 = ₹60)
   manual  → inventory_items.average_price

Step 4: Calculate ingredient cost
   ingredient_cost = effective_qty × price_per_base_unit

Total Making Cost  = SUM of all ingredient costs
Profit             = Selling Price − Making Cost
Profit %           = (Profit / Selling Price) × 100
Food Cost %        = (Making Cost / Selling Price) × 100
```

### Real Example — Margherita Pizza (sells at ₹300)

| Ingredient       | Qty   | Unit | Yield% | Wastage% | Effective Qty | Price/unit | Cost    |
|------------------|-------|------|--------|----------|---------------|------------|---------|
| Mozzarella       | 120g  | g    | 100%   | 0%       | 120g          | ₹0.50/g    | ₹60.00  |
| Tomato Sauce     | 80g   | g    | 80%    | 0%       | 100g          | ₹0.08/g    | ₹8.00   |
| Pizza Dough      | 1     | pcs  | 100%   | 5%       | 1.05 pcs      | ₹15/pcs    | ₹15.75  |
| Basil            | 5g    | g    | 70%    | 0%       | 7.14g         | ₹0.20/g    | ₹1.43   |
| **Total**        |       |      |        |          |               |            | **₹85.18** |

```
Selling Price  = ₹300.00
Making Cost    = ₹85.18
Profit         = ₹214.82
Profit %       = 71.61%
Food Cost %    = 28.39%
```

---

## Module 5: Ingredient Management

Ingredients bridge **inventory items** to **recipes**. Each ingredient maps 1:1 to an inventory item with yield/wastage info.

---

### 5.1 List Ingredients

```
GET /:outletId/ingredients
```

**Query Parameters:**

| Param      | Type   | Description                                        |
|------------|--------|----------------------------------------------------|
| page       | int    | Page number (default: 1)                           |
| limit      | int    | Items per page (default: 50, max: 100)             |
| search     | string | Search by ingredient name, inventory item name/SKU |
| isActive   | bool   | Filter by active status                            |
| categoryId | int    | Filter by inventory category                       |
| hasRecipes | bool   | `true` = only ingredients used in recipes          |
| sortBy     | string | `name`, `created_at`, `updated_at`, `yield_percentage` |
| sortOrder  | string | `ASC` or `DESC` (default: ASC)                     |

**Response:**
```json
{
  "success": true,
  "ingredients": [
    {
      "id": 1,
      "outletId": 4,
      "sku": "ING-001",
      "inventoryItemId": 1,
      "inventoryItemName": "Tomato",
      "inventoryItemSku": "INV-001",
      "categoryId": 1,
      "categoryName": "Vegetables",
      "name": "Tomato",
      "description": null,
      "yieldPercentage": 80,
      "wastagePercentage": 0,
      "preparationNotes": "Wash and dice before use",
      "unitName": "kg",
      "unitAbbreviation": "kg",
      "baseUnitAbbreviation": "g",
      "recipeCount": 3,
      "isActive": true,
      "createdAt": "2025-03-15T10:00:00.000Z",
      "updatedAt": "2025-03-15T10:00:00.000Z"
    }
  ],
  "pagination": { "page": 1, "limit": 50, "total": 1, "totalPages": 1 }
}
```

---

### 5.2 Get Ingredient Detail

```
GET /ingredients/:id
```

**Response:** Same structure as single item from list.

---

### 5.3 Create Ingredient

```
POST /:outletId/ingredients
```

**Payload:**
```json
{
  "inventoryItemId": 1,
  "name": "Tomato",
  "description": "Fresh tomato for cooking",
  "yieldPercentage": 80,
  "wastagePercentage": 5,
  "preparationNotes": "Wash, remove stem, dice"
}
```

| Field              | Type   | Required | Description                                |
|--------------------|--------|----------|--------------------------------------------|
| inventoryItemId    | int    | Yes      | Linked inventory item                      |
| name               | string | No       | Defaults to inventory item name            |
| description        | string | No       | Description                                |
| yieldPercentage    | number | No       | Usable % after prep (default: 100)         |
| wastagePercentage  | number | No       | Extra loss % during cooking (default: 0)   |
| preparationNotes   | string | No       | Prep instructions                          |

**Response:** `201 Created` — Full ingredient object.

---

### 5.4 Update Ingredient

```
PUT /ingredients/:id
```

**Payload:** Any fields from create (except `inventoryItemId` — cannot change mapping).

```json
{
  "yieldPercentage": 85,
  "isActive": false
}
```

**Response:** Updated ingredient object.

---

### 5.5 Bulk Create Ingredients

Creates ingredients from multiple inventory items at once with **per-item details**.
Skips items that already have an ingredient mapping or don't exist.

```
POST /:outletId/ingredients/bulk
```

**Payload (with details):**
```json
{
  "items": [
    {
      "inventoryItemId": 1,
      "name": "Mozzarella Cheese",
      "yieldPercentage": 100,
      "wastagePercentage": 0,
      "description": "Fresh mozzarella",
      "preparationNotes": "Shred before use"
    },
    {
      "inventoryItemId": 5,
      "name": "Tomato Sauce",
      "yieldPercentage": 80,
      "wastagePercentage": 0,
      "description": "Made from fresh tomatoes",
      "preparationNotes": "Blend and strain"
    },
    {
      "inventoryItemId": 7,
      "yieldPercentage": 100,
      "preparationNotes": "Pre-made dough balls"
    },
    {
      "inventoryItemId": 12,
      "name": "Fresh Basil",
      "yieldPercentage": 70,
      "wastagePercentage": 0,
      "preparationNotes": "Remove stems, use only leaves"
    }
  ]
}
```

| Field (per item)   | Type   | Required | Description                             |
|--------------------|--------|----------|-----------------------------------------|
| inventoryItemId    | int    | Yes      | Linked inventory item                   |
| name               | string | No       | Defaults to inventory item name         |
| yieldPercentage    | number | No       | Usable % after prep (default: 100)      |
| wastagePercentage  | number | No       | Extra loss during cooking (default: 0)  |
| description        | string | No       | Description                             |
| preparationNotes   | string | No       | Prep instructions                       |

**Response:**
```json
{
  "success": true,
  "data": {
    "created": 3,
    "skipped": 1,
    "ingredients": [
      { "id": 1, "inventoryItemId": 1, "name": "Mozzarella Cheese" },
      { "id": 2, "inventoryItemId": 5, "name": "Tomato Sauce" },
      { "id": 3, "inventoryItemId": 7, "name": "Pizza Dough" }
    ],
    "skippedDetails": [
      { "inventoryItemId": 12, "reason": "Inventory item not found or inactive" }
    ]
  }
}
```

**Skip reasons:**
- `Already mapped` — an ingredient already exists for this inventory item
- `Inventory item not found or inactive` — item doesn't exist or is deactivated
- `Missing inventoryItemId` — entry has no inventoryItemId

---

## Module 6: Recipe Management

Recipes define how to make a menu item. Each recipe contains ingredients with quantities.

**Key concepts:**
- A recipe links to a **menu item** (or **variant**)
- Each recipe has **versioning** — creating a new version for the same menu item automatically marks the old one as `is_current = false`
- **Cost is calculated LIVE on every read** — never auto-writes to menu item's cost_price
- Shows **profit = selling price − making cost**, food cost %, profit %
- Recipes can exist without a menu item link (standalone recipes)
- Supports **veg/non_veg/egg/vegan** filtering via linked menu item
- Supports **category** filtering via linked menu item's category

---

### 6.1 List Recipes (with Live Cost + Profit + Summary)

Returns all recipes with **live making cost**, **profit analysis**, and an **aggregate summary** across all results.

```
GET /:outletId/recipes
```

**Query Parameters:**

| Param       | Type   | Default | Description                                     |
|-------------|--------|---------|-------------------------------------------------|
| page        | int    | 1       | Page number                                     |
| limit       | int    | 50      | Items per page (max: 100)                       |
| search      | string |         | Search by recipe name, menu item name, or category name |
| isActive    | bool   |         | Filter by active status                         |
| menuItemId  | int    |         | Filter by specific menu item                    |
| hasMenuItem | bool   |         | `true` = linked recipes only, `false` = unlinked only |
| currentOnly | bool   | true    | Only current versions                           |
| itemType    | string |         | `veg`, `non_veg`, `egg`, `vegan`                |
| categoryId  | int    |         | Filter by menu item category                    |
| hasProfit   | string |         | `true` = profitable only, `false` = loss only   |
| minCost     | number |         | Minimum making cost filter                      |
| maxCost     | number |         | Maximum making cost filter                      |
| sortBy      | string | name    | `name`, `created_at`, `updated_at`, `version`   |
| sortOrder   | string | ASC     | `ASC` or `DESC`                                 |

**Example Requests:**
```
GET /43/recipes                                    — All recipes
GET /43/recipes?itemType=veg                       — Only veg recipes
GET /43/recipes?itemType=non_veg&categoryId=5      — Non-veg in category 5
GET /43/recipes?hasProfit=false                     — Recipes running at a loss
GET /43/recipes?search=pizza&sortBy=name            — Search "pizza"
GET /43/recipes?minCost=50&maxCost=200              — Making cost between ₹50–₹200
GET /43/recipes?hasMenuItem=false                   — Unlinked standalone recipes
```

**Response:**
```json
{
  "success": true,
  "costingMethod": "average",
  "summary": {
    "totalRecipes": 12,
    "linkedToMenu": 10,
    "unlinked": 2,
    "totalMakingCost": 945.30,
    "totalSellingPrice": 3200.00,
    "totalProfit": 2254.70,
    "avgFoodCostPercentage": 29.54,
    "avgProfitPercentage": 70.46,
    "recipesWithProfit": 9,
    "recipesWithLoss": 1
  },
  "recipes": [
    {
      "id": 1,
      "outletId": 43,
      "menuItemId": 1595,
      "menuItemName": "Margherita Pizza",
      "menuItemSku": "ITM-001",
      "menuItemPrice": 300,
      "variantId": null,
      "variantName": null,
      "variantPrice": null,
      "itemType": "veg",
      "categoryId": 5,
      "categoryName": "Pizza",
      "name": "Margherita Pizza Recipe",
      "description": "Classic margherita with fresh mozzarella",
      "portionSize": "1 pizza",
      "preparationTimeMins": 20,
      "instructions": null,
      "version": 2,
      "isCurrent": true,
      "ingredientCount": 4,
      "isActive": true,
      "createdBy": 1,
      "createdByName": "Admin",
      "createdAt": "2026-03-15T10:00:00.000Z",
      "updatedAt": "2026-03-18T09:30:00.000Z",
      "costingMethod": "average",
      "makingCost": 85.18,
      "sellingPrice": 300,
      "profit": 214.82,
      "profitPercentage": 71.61,
      "foodCostPercentage": 28.39
    },
    {
      "id": 2,
      "outletId": 43,
      "menuItemId": 1600,
      "menuItemName": "Butter Chicken",
      "menuItemSku": "ITM-010",
      "menuItemPrice": 350,
      "variantId": null,
      "variantName": null,
      "variantPrice": null,
      "itemType": "non_veg",
      "categoryId": 8,
      "categoryName": "Main Course",
      "name": "Butter Chicken Recipe",
      "description": null,
      "portionSize": "1 plate",
      "preparationTimeMins": 30,
      "instructions": null,
      "version": 1,
      "isCurrent": true,
      "ingredientCount": 6,
      "isActive": true,
      "createdBy": 1,
      "createdByName": "Admin",
      "createdAt": "2026-03-16T11:00:00.000Z",
      "updatedAt": "2026-03-16T11:00:00.000Z",
      "costingMethod": "average",
      "makingCost": 120.50,
      "sellingPrice": 350,
      "profit": 229.50,
      "profitPercentage": 65.57,
      "foodCostPercentage": 34.43
    },
    {
      "id": 5,
      "outletId": 43,
      "menuItemId": null,
      "menuItemName": null,
      "menuItemSku": null,
      "menuItemPrice": null,
      "variantId": null,
      "variantName": null,
      "variantPrice": null,
      "itemType": null,
      "categoryId": null,
      "categoryName": null,
      "name": "Standalone Gravy Base",
      "description": "Not linked to any menu item",
      "portionSize": null,
      "preparationTimeMins": 0,
      "instructions": null,
      "version": 1,
      "isCurrent": true,
      "ingredientCount": 3,
      "isActive": true,
      "createdBy": 1,
      "createdByName": "Admin",
      "createdAt": "2026-03-17T09:00:00.000Z",
      "updatedAt": "2026-03-17T09:00:00.000Z",
      "costingMethod": "average",
      "makingCost": 45.00,
      "sellingPrice": 0,
      "profit": null,
      "profitPercentage": null,
      "foodCostPercentage": null
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 12,
    "totalPages": 1
  }
}
```

**Key fields per recipe:**

| Field | Description |
|-------|-------------|
| `costingMethod` | Which method was used (`average`, `latest`, `fifo`, `manual`) |
| `makingCost` | Live calculated total ingredient cost |
| `sellingPrice` | Menu item selling price (0 if not linked) |
| `profit` | `sellingPrice - makingCost` (null if not linked to menu item) |
| `profitPercentage` | `(profit / sellingPrice) × 100` |
| `foodCostPercentage` | `(makingCost / sellingPrice) × 100` |
| `itemType` | `veg`, `non_veg`, `egg`, `vegan` (null if not linked) |
| `categoryId` / `categoryName` | Menu item category (null if not linked) |

**Summary fields:**

| Field | Description |
|-------|-------------|
| `totalRecipes` | Total recipe count matching filters |
| `linkedToMenu` | How many are linked to a menu item |
| `unlinked` | Standalone recipes without menu link |
| `totalMakingCost` | Sum of all making costs (linked only) |
| `totalSellingPrice` | Sum of all selling prices (linked only) |
| `totalProfit` | `totalSellingPrice - totalMakingCost` |
| `avgFoodCostPercentage` | Average food cost % across all linked recipes |
| `avgProfitPercentage` | Average profit % across all linked recipes |
| `recipesWithProfit` | Count of profitable recipes |
| `recipesWithLoss` | Count of recipes running at a loss |

---

### 6.2 Get Recipe Detail (Full Ingredient Breakdown + Cost Analysis)

Returns the full recipe with **per-ingredient cost breakdown** and **cost summary** with profit analysis.
Cost is calculated **live** from current inventory prices — **never stored on menu items**.

```
GET /recipes/:id
```

**Query Parameters:**

| Param         | Type   | Description                                      |
|---------------|--------|--------------------------------------------------|
| costingMethod | string | Override: `average`, `latest`, `fifo`, `manual`  |

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "outletId": 43,
    "menuItemId": 1595,
    "menuItemName": "Margherita Pizza",
    "menuItemSku": "ITM-001",
    "menuItemPrice": 300,
    "variantId": null,
    "variantName": null,
    "variantPrice": null,
    "itemType": "veg",
    "categoryId": 5,
    "categoryName": "Pizza",
    "name": "Margherita Pizza Recipe",
    "description": "Classic margherita with fresh mozzarella",
    "portionSize": "1 pizza",
    "preparationTimeMins": 20,
    "instructions": "1. Roll dough\n2. Spread sauce\n3. Add cheese\n4. Bake 250°C 12 min",
    "version": 2,
    "isCurrent": true,
    "ingredientCount": 4,
    "isActive": true,
    "createdBy": 1,
    "createdByName": "Admin",
    "createdAt": "2026-03-15T10:00:00.000Z",
    "updatedAt": "2026-03-18T09:30:00.000Z",
    "ingredients": [
      {
        "id": 1,
        "ingredientId": 1,
        "ingredientName": "Mozzarella Cheese",
        "inventoryItemId": 3,
        "quantity": 120,
        "unitId": 5,
        "unitName": "Gram",
        "unitAbbreviation": "g",
        "wastagePercentage": 0,
        "yieldPercentage": 100,
        "notes": "Shredded",
        "displayOrder": 0,
        "cost": {
          "qtyInBase": 120,
          "pricePerBase": 0.5,
          "totalCost": 60.00,
          "method": "average"
        }
      },
      {
        "id": 2,
        "ingredientId": 2,
        "ingredientName": "Tomato Sauce",
        "inventoryItemId": 5,
        "quantity": 80,
        "unitId": 5,
        "unitName": "Gram",
        "unitAbbreviation": "g",
        "wastagePercentage": 0,
        "yieldPercentage": 80,
        "notes": null,
        "displayOrder": 1,
        "cost": {
          "qtyInBase": 100,
          "pricePerBase": 0.08,
          "totalCost": 8.00,
          "method": "average"
        }
      },
      {
        "id": 3,
        "ingredientId": 3,
        "ingredientName": "Pizza Dough",
        "inventoryItemId": 7,
        "quantity": 1,
        "unitId": 9,
        "unitName": "Piece",
        "unitAbbreviation": "pcs",
        "wastagePercentage": 5,
        "yieldPercentage": 100,
        "notes": null,
        "displayOrder": 2,
        "cost": {
          "qtyInBase": 1.05,
          "pricePerBase": 15,
          "totalCost": 15.75,
          "method": "average"
        }
      },
      {
        "id": 4,
        "ingredientId": 4,
        "ingredientName": "Fresh Basil",
        "inventoryItemId": 12,
        "quantity": 5,
        "unitId": 5,
        "unitName": "Gram",
        "unitAbbreviation": "g",
        "wastagePercentage": 0,
        "yieldPercentage": 70,
        "notes": "Leaves only",
        "displayOrder": 3,
        "cost": {
          "qtyInBase": 7.1429,
          "pricePerBase": 0.2,
          "totalCost": 1.43,
          "method": "average"
        }
      }
    ],
    "costSummary": {
      "costingMethod": "average",
      "makingCost": 85.18,
      "sellingPrice": 300,
      "profit": 214.82,
      "profitPercentage": 71.61,
      "foodCostPercentage": 28.39,
      "ingredientCount": 4,
      "status": "profitable"
    }
  }
}
```

**`costSummary` fields:**

| Field | Description |
|-------|-------------|
| `costingMethod` | Method used for this calculation |
| `makingCost` | Total ingredient cost (sum of all ingredient costs) |
| `sellingPrice` | Menu item selling price (null if not linked) |
| `profit` | `sellingPrice - makingCost` (null if not linked) |
| `profitPercentage` | `(profit / sellingPrice) × 100` |
| `foodCostPercentage` | `(makingCost / sellingPrice) × 100` |
| `ingredientCount` | Number of ingredients in this recipe |
| `status` | `profitable`, `loss`, or `not_linked` |

**Per-ingredient `cost` fields:**

| Field | Description |
|-------|-------------|
| `qtyInBase` | Effective quantity in base units (after yield + wastage) |
| `pricePerBase` | Price per base unit from the costing method |
| `totalCost` | `qtyInBase × pricePerBase` |
| `method` | Costing method used |

> **Tip:** Use `?costingMethod=latest` to see how cost changes with latest purchase prices without changing outlet settings.

---

### 6.3 Create Recipe

```
POST /:outletId/recipes
```

**Payload:**
```json
{
  "menuItemId": 10,
  "variantId": null,
  "name": "Margherita Pizza Recipe",
  "description": "Classic margherita with fresh mozzarella",
  "portionSize": "1 pizza",
  "preparationTimeMins": 20,
  "instructions": "1. Roll dough\n2. Spread sauce\n3. Add cheese\n4. Bake 250°C 12 min",
  "ingredients": [
    { "ingredientId": 1, "quantity": 120, "unitId": 5, "wastagePercentage": 0, "notes": "Shredded" },
    { "ingredientId": 2, "quantity": 80, "unitId": 5, "wastagePercentage": 0 },
    { "ingredientId": 3, "quantity": 1, "unitId": 9, "wastagePercentage": 5 }
  ]
}
```

| Field               | Type   | Required | Description                            |
|---------------------|--------|----------|----------------------------------------|
| menuItemId          | int    | No       | Link to menu item (null = standalone)  |
| variantId           | int    | No       | Link to specific variant               |
| name                | string | Yes      | Recipe name                            |
| description         | string | No       | Description                            |
| portionSize         | string | No       | e.g. "1 pizza", "1 plate"             |
| preparationTimeMins | int    | No       | Prep time in minutes                   |
| instructions        | string | No       | Step-by-step instructions              |
| ingredients         | array  | No       | List of ingredients                    |

**Ingredient object:**

| Field              | Type   | Required | Description                      |
|--------------------|--------|----------|----------------------------------|
| ingredientId       | int    | Yes      | Ingredient ID                    |
| quantity           | number | Yes      | Quantity needed (in the unit)    |
| unitId             | int    | Yes      | Unit of measurement              |
| wastagePercentage  | number | No       | Extra cooking loss % (default: 0)|
| notes              | string | No       | Prep notes for this ingredient   |
| displayOrder       | int    | No       | Display order                    |

**Response:** `201 Created` — Full recipe object with ingredients and cost + profit.

> **Auto-version:** If `menuItemId` is provided and a current recipe already exists, the old recipe becomes `is_current = false` and the new one gets `version = previous + 1`.

---

### 6.4 Update Recipe

```
PUT /recipes/:id
```

**Payload:** Any fields from create. If `ingredients` array is provided, it **replaces** all existing ingredients.

**Response:** Updated recipe with recalculated cost + profit.

---

### 6.5 Link Recipe to Menu Item

```
PUT /recipes/:id/link
```

**Payload:**
```json
{ "menuItemId": 10, "variantId": null }
```

---

### 6.6 Unlink Recipe from Menu Item

```
PUT /recipes/:id/unlink
```

---

### 6.7 Create New Version

Creates a new version of a recipe, copying all ingredients by default. Old version becomes `is_current = false`.

```
POST /recipes/:id/version
```

**Payload:** (optional — override any fields)
```json
{
  "name": "Margherita Pizza v3",
  "ingredients": [
    { "ingredientId": 1, "quantity": 130, "unitId": 5 },
    { "ingredientId": 2, "quantity": 90, "unitId": 5 },
    { "ingredientId": 3, "quantity": 1, "unitId": 9, "wastagePercentage": 5 },
    { "ingredientId": 4, "quantity": 5, "unitId": 5, "notes": "Fresh basil" }
  ]
}
```

If no `ingredients` provided, copies from the previous version.

---

### 6.8 Get Recipe Versions

```
GET /menu-items/:menuItemId/recipe-versions?variantId=
```

**Response:**
```json
{
  "success": true,
  "data": [
    { "id": 3, "name": "Margherita v3", "version": 3, "isCurrent": true, "ingredientCount": 4 },
    { "id": 2, "name": "Margherita v2", "version": 2, "isCurrent": false, "ingredientCount": 3 },
    { "id": 1, "name": "Margherita v1", "version": 1, "isCurrent": false, "ingredientCount": 3 }
  ]
}
```

---

## Module 7: Cost Calculator

**Read-only** — calculates making cost and profit. **Never writes to menu items table.**

---

### 7.1 Get Cost Settings

```
GET /:outletId/cost-settings
```

**Response:**
```json
{
  "success": true,
  "data": {
    "outletId": 4,
    "costingMethod": "average"
  }
}
```

> Auto-creates default settings (`average`) on first access.

---

### 7.2 Update Cost Settings

```
PUT /:outletId/cost-settings
```

**Payload:**
```json
{
  "costingMethod": "latest"
}
```

| Field          | Type   | Description                           |
|----------------|--------|---------------------------------------|
| costingMethod  | string | `average`, `latest`, `fifo`, `manual` |

---

### 7.3 Calculate Single Recipe Cost

Shows making cost breakdown for one recipe. Does NOT save anything.

```
GET /recipes/:id/calculate-cost
```

**Query:** `?costingMethod=average` (optional override)

**Response:**
```json
{
  "success": true,
  "data": {
    "recipeId": 1,
    "recipeName": "Margherita Pizza Recipe",
    "costingMethod": "average",
    "totalCost": 85.18,
    "ingredientCount": 4,
    "breakdown": [
      {
        "ingredientId": 1,
        "ingredientName": "Mozzarella Cheese",
        "quantity": 120,
        "qtyInBase": 120,
        "pricePerBase": 0.5,
        "cost": 60.00
      },
      {
        "ingredientId": 2,
        "ingredientName": "Tomato Sauce",
        "quantity": 80,
        "qtyInBase": 100,
        "pricePerBase": 0.08,
        "cost": 8.00
      },
      {
        "ingredientId": 3,
        "ingredientName": "Pizza Dough",
        "quantity": 1,
        "qtyInBase": 1.05,
        "pricePerBase": 15.0,
        "cost": 15.75
      },
      {
        "ingredientId": 4,
        "ingredientName": "Basil",
        "quantity": 5,
        "qtyInBase": 7.14,
        "pricePerBase": 0.20,
        "cost": 1.43
      }
    ]
  }
}
```

---

### 7.4 Calculate All Costs — Profit Analysis

Shows **selling price vs making cost = profit** for ALL recipes. Does NOT save anything.

```
GET /:outletId/calculate-all-costs
```

**Query:** `?costingMethod=average` (optional override)

**Response:**
```json
{
  "success": true,
  "data": {
    "outletId": 4,
    "costingMethod": "average",
    "totalRecipes": 3,
    "summary": {
      "totalSellingAmount": 850.00,
      "totalMakingCost": 245.30,
      "totalProfit": 604.70,
      "avgFoodCostPercentage": 28.86,
      "avgProfitPercentage": 71.14
    },
    "results": [
      {
        "recipeId": 1,
        "recipeName": "Margherita Pizza Recipe",
        "menuItemId": 10,
        "menuItemName": "Margherita Pizza",
        "variantId": null,
        "variantName": null,
        "sellingPrice": 300,
        "makingCost": 85.18,
        "profit": 214.82,
        "profitPercentage": 71.61,
        "foodCostPercentage": 28.39
      },
      {
        "recipeId": 2,
        "recipeName": "Pasta Alfredo Recipe",
        "menuItemId": 15,
        "menuItemName": "Pasta Alfredo",
        "variantId": null,
        "variantName": null,
        "sellingPrice": 250,
        "makingCost": 72.50,
        "profit": 177.50,
        "profitPercentage": 71.00,
        "foodCostPercentage": 29.00
      },
      {
        "recipeId": 3,
        "recipeName": "Caesar Salad Recipe",
        "menuItemId": 20,
        "menuItemName": "Caesar Salad",
        "variantId": null,
        "variantName": null,
        "sellingPrice": 300,
        "makingCost": 87.62,
        "profit": 212.38,
        "profitPercentage": 70.79,
        "foodCostPercentage": 29.21
      }
    ]
  }
}
```

---

### 7.5 Compare All 4 Methods

See profit using **average**, **latest**, **fifo**, and **manual** side-by-side. Helps you pick the right method.

```
GET /:outletId/compare-methods
```

**Response:**
```json
{
  "success": true,
  "data": {
    "outletId": 4,
    "comparison": {
      "average": {
        "costingMethod": "average",
        "totalRecipes": 3,
        "summary": {
          "totalSellingAmount": 850,
          "totalMakingCost": 245.30,
          "totalProfit": 604.70,
          "avgFoodCostPercentage": 28.86,
          "avgProfitPercentage": 71.14
        },
        "results": [ "..." ]
      },
      "latest": {
        "costingMethod": "latest",
        "totalRecipes": 3,
        "summary": {
          "totalSellingAmount": 850,
          "totalMakingCost": 260.15,
          "totalProfit": 589.85,
          "avgFoodCostPercentage": 30.61,
          "avgProfitPercentage": 69.39
        },
        "results": [ "..." ]
      },
      "fifo": { "..." },
      "manual": { "..." }
    }
  }
}
```

> Use this to compare: "If I switch from average to latest pricing, how does my profit change?"

---

## Cost Snapshot (Order Time)

When a customer orders a dish, the **making cost is frozen** at that moment in the `order_item_costs` table. This ensures historical profit reports stay accurate even when ingredient prices change later.

### How It Works

```
Customer orders Margherita Pizza
  → System finds recipe for this menu item
  → Calculates making cost using current costing method
  → Stores snapshot in order_item_costs table
  → Price changes tomorrow don't affect yesterday's reports
```

### Get Order Cost Snapshot

```
GET /api/v1/orders/:orderId/costs
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "orderItemId": 501,
      "itemId": 1595,
      "variantId": null,
      "recipeId": 1,
      "quantity": 2,
      "unitMakingCost": 85.18,
      "totalMakingCost": 170.36,
      "costingMethod": "average",
      "snapshotAt": "2026-03-18T10:47:58.000Z"
    },
    {
      "orderItemId": 502,
      "itemId": 1600,
      "variantId": null,
      "recipeId": 2,
      "quantity": 1,
      "unitMakingCost": 120.50,
      "totalMakingCost": 120.50,
      "costingMethod": "average",
      "snapshotAt": "2026-03-18T10:47:58.000Z"
    }
  ]
}
```

### FIFO Multi-Batch Splitting

When costing method is `fifo`, the system splits ingredient consumption across multiple batches:

```
Need 150g cheese:
  Batch 1: 100g remaining @ ₹0.40/g → cost = ₹40
  Batch 2:  50g remaining @ ₹0.50/g → cost = ₹25
  Total FIFO cost = ₹65

Not just: oldest price × quantity = ₹0.40 × 150 = ₹60 (wrong)
```

This applies to both live recipe cost and cost snapshots.

---

## Complete Flow Example

### Step 1: Create Ingredients

```bash
POST /api/v1/recipes/43/ingredients/bulk
{
  "items": [
    { "inventoryItemId": 1, "name": "Mozzarella", "yieldPercentage": 100 },
    { "inventoryItemId": 5, "name": "Tomato Sauce", "yieldPercentage": 80 },
    { "inventoryItemId": 7, "name": "Pizza Dough", "yieldPercentage": 100 },
    { "inventoryItemId": 12, "name": "Fresh Basil", "yieldPercentage": 70 }
  ]
}
```

### Step 2: Create Recipe Linked to Menu Item

```bash
POST /api/v1/recipes/43/recipes
{
  "menuItemId": 1595,
  "name": "Margherita Pizza Recipe",
  "portionSize": "1 pizza",
  "ingredients": [
    { "ingredientId": 1, "quantity": 120, "unitId": 5 },
    { "ingredientId": 2, "quantity": 80,  "unitId": 5 },
    { "ingredientId": 3, "quantity": 1,   "unitId": 9, "wastagePercentage": 5 },
    { "ingredientId": 4, "quantity": 5,   "unitId": 5 }
  ]
}
```

**Response includes `costSummary`:**
```json
{
  "costSummary": {
    "costingMethod": "average",
    "makingCost": 85.18,
    "sellingPrice": 300,
    "profit": 214.82,
    "profitPercentage": 71.61,
    "foodCostPercentage": 28.39,
    "ingredientCount": 4,
    "status": "profitable"
  }
}
```

### Step 3: List All Recipes with Filters

```bash
# All veg recipes with summary
GET /api/v1/recipes/43/recipes?itemType=veg

# Loss-making non-veg recipes in "Main Course" category
GET /api/v1/recipes/43/recipes?itemType=non_veg&categoryId=8&hasProfit=false

# Search by name, sorted by making cost
GET /api/v1/recipes/43/recipes?search=chicken&sortBy=name&sortOrder=ASC
```

### Step 4: Check Cost with Different Method

```bash
GET /api/v1/recipes/recipes/1?costingMethod=latest
# Same recipe but shows cost using latest purchase prices
```

### Step 5: See All Items Profit

```bash
GET /api/v1/recipes/43/calculate-all-costs
# Every menu item: selling price, making cost, profit, profit%
```

### Step 6: Compare All 4 Methods

```bash
GET /api/v1/recipes/43/compare-methods
# Side-by-side: average vs latest vs fifo vs manual
```

### Step 7: Change Default Method

```bash
PUT /api/v1/recipes/43/cost-settings
{ "costingMethod": "fifo" }
# All cost calculations now use FIFO by default
```

### Step 8: Order Creates Cost Snapshot

```bash
POST /api/v1/orders/123/items
{ "items": [{ "itemId": 1595, "quantity": 2 }] }
# Making cost frozen at ₹85.18 per pizza → stored in order_item_costs

# Later, retrieve the snapshot
GET /api/v1/orders/123/costs
# Returns frozen cost even if ingredient prices changed
```

---

## Database Schema

### ingredients
```sql
id, outlet_id, inventory_item_id, name, description,
yield_percentage, wastage_percentage, preparation_notes,
is_active, created_at, updated_at
```

### recipes
```sql
id, outlet_id, menu_item_id (FK items), variant_id (FK variants),
name, description, portion_size, preparation_time_mins,
instructions, version, is_current, is_active,
created_by, created_at, updated_at
```

### recipe_ingredients
```sql
id, recipe_id, ingredient_id (UNIQUE per recipe),
quantity, unit_id, wastage_percentage,
notes, display_order, created_at, updated_at
```

### cost_settings
```sql
id, outlet_id (UNIQUE), costing_method (average/latest/fifo/manual),
updated_by, created_at, updated_at
```

### order_item_costs (Cost Snapshot)
```sql
id, order_id, order_item_id, item_id, variant_id,
recipe_id, quantity, unit_making_cost, total_making_cost,
costing_method, cost_breakdown (JSON),
snapshot_at, created_at
```

---

## API Route Summary

| #  | Method | Endpoint                                  | Description                                            |
|----|--------|-------------------------------------------|--------------------------------------------------------|
| 1  | GET    | `/:outletId/ingredients`                  | List ingredients                                       |
| 2  | GET    | `/ingredients/:id`                        | Get ingredient detail                                  |
| 3  | POST   | `/:outletId/ingredients`                  | Create ingredient                                      |
| 4  | PUT    | `/ingredients/:id`                        | Update ingredient                                      |
| 5  | POST   | `/:outletId/ingredients/bulk`             | Bulk create with per-item details                      |
| 6  | GET    | `/:outletId/recipes`                      | List recipes with live cost + profit + summary         |
| 7  | GET    | `/recipes/:id`                            | Recipe detail + ingredients + costSummary              |
| 8  | POST   | `/:outletId/recipes`                      | Create recipe                                          |
| 9  | PUT    | `/recipes/:id`                            | Update recipe                                          |
| 10 | PUT    | `/recipes/:id/link`                       | Link recipe to menu item                               |
| 11 | PUT    | `/recipes/:id/unlink`                     | Unlink recipe from menu item                           |
| 12 | POST   | `/recipes/:id/version`                    | Create new recipe version                              |
| 13 | GET    | `/menu-items/:menuItemId/recipe-versions` | Get all versions for a menu item                       |
| 14 | GET    | `/:outletId/cost-settings`                | Get cost calculator settings                           |
| 15 | PUT    | `/:outletId/cost-settings`                | Update costing method                                  |
| 16 | GET    | `/recipes/:id/calculate-cost`             | Calculate single recipe cost (read-only)               |
| 17 | GET    | `/:outletId/calculate-all-costs`          | All recipes: selling − making = profit                 |
| 18 | GET    | `/:outletId/compare-methods`              | Compare profit across all 4 methods                    |

**Order Cost Snapshot (in Orders API):**

| Method | Endpoint                       | Description                          |
|--------|--------------------------------|--------------------------------------|
| GET    | `/api/v1/orders/:orderId/costs`| Get frozen making cost for an order  |
