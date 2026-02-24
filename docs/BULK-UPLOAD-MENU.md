# Bulk Menu Upload Feature

## Overview

Upload menu items in bulk via CSV file - simple and clean format like Petpooja.

**Supports:**
- Categories & Subcategories
- Menu Items with pricing
- Variants (Half/Full, sizes)
- Addon Groups & Addons
- GST Tax (5%, 12%, 18%, 28%)
- Kitchen Station mapping
- Multi-outlet support
- Validation & Rollback

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/bulk-upload/menu/template` | Download CSV template |
| GET | `/api/v1/bulk-upload/menu/template/json` | Get column structure |
| POST | `/api/v1/bulk-upload/menu/validate` | Validate CSV (dry run) |
| POST | `/api/v1/bulk-upload/menu/preview` | Preview what will be created |
| POST | `/api/v1/bulk-upload/menu` | Execute upload |
| GET | `/api/v1/bulk-upload/history` | Upload history |

All endpoints require `Authorization: Bearer <token>` header.

---

## CSV Format (Simplified)

### Columns

| Column | Description | Used By |
|--------|-------------|---------|
| **Type** | CATEGORY, ITEM, VARIANT, ADDON_GROUP, ADDON | All |
| **Name** | Name of item/category/addon | All |
| **Category** | Category name | ITEM |
| **Price** | Price in rupees | ITEM, VARIANT, ADDON |
| **FoodType** | veg, nonveg, egg | ITEM, ADDON |
| **GST** | Tax rate: 0, 5, 12, 18, 28 | ITEM |
| **Station** | Kitchen station name | ITEM |
| **Description** | Description text | CATEGORY, ITEM |
| **Parent** | Parent category name | CATEGORY |
| **ShortName** | Short name for KOT | ITEM |
| **SKU** | Item/variant code | ITEM, VARIANT |
| **Default** | Is default variant (yes/no) | VARIANT |
| **SelectionType** | single/multiple | ADDON_GROUP |
| **Min** | Min selections | ADDON_GROUP |
| **Max** | Max selections | ADDON_GROUP |
| **Required** | Is required (yes/no) | ADDON_GROUP |
| **Group** | Addon group name | ADDON |
| **Item** | Item name (for variants) | VARIANT |

### Row Types

| Type | Required Fields | Optional Fields |
|------|-----------------|-----------------|
| **CATEGORY** | Name | Description, Parent |
| **ITEM** | Name, Price | Category, FoodType, GST, Station, Description, ShortName, SKU |
| **VARIANT** | Name, Price | Item, SKU, Default |
| **ADDON_GROUP** | Name | SelectionType, Min, Max, Required |
| **ADDON** | Name | Group, Price, FoodType |

---

## Example CSV

```csv
Type,Name,Category,Price,FoodType,GST,Station,Description,Parent,ShortName,SKU,Default,SelectionType,Min,Max,Required,Group,Item
# CATEGORIES
CATEGORY,Starters,,,,,Appetizers and snacks,,,,,,,,,,
CATEGORY,Veg Starters,,,,,Vegetarian starters,Starters,,,,,,,,,
CATEGORY,Non-Veg Starters,,,,,Non-veg starters,Starters,,,,,,,,,

# ITEMS (Category optional if placed after CATEGORY row)
ITEM,Paneer Tikka,Veg Starters,250,veg,5,Main Kitchen,Grilled cottage cheese,,P.Tikka,PTK001,,,,,,
ITEM,Veg Spring Roll,Veg Starters,180,veg,5,Main Kitchen,Crispy rolls,,Spr.Roll,VSR001,,,,,,
ITEM,Chicken Tikka,Non-Veg Starters,320,nonveg,5,Main Kitchen,Grilled chicken,,C.Tikka,CTK001,,,,,,

# VARIANTS (Place after ITEM row, or specify Item column)
VARIANT,Half,,150,,,,,,,PTK001-H,no,,,,,Paneer Tikka
VARIANT,Full,,250,,,,,,,PTK001-F,yes,,,,,Paneer Tikka

# ADDON GROUPS
ADDON_GROUP,Extra Toppings,,,,,,,,,,,multiple,0,3,no,,
ADDON_GROUP,Cooking Style,,,,,,,,,,,single,1,1,yes,,

# ADDONS (Place after ADDON_GROUP row, or specify Group column)
ADDON,Extra Cheese,,30,veg,,,,,,,,,,,,Extra Toppings,
ADDON,Jalapenos,,20,veg,,,,,,,,,,,,Extra Toppings,
ADDON,Mild,,0,veg,,,,,,,,,,,,Cooking Style,
ADDON,Spicy,,0,veg,,,,,,,,,,,,Cooking Style,
```

---

## GST Tax Rates

Just put the rate number in GST column:

| GST | Rate | CGST | SGST |
|-----|------|------|------|
| 0 | 0% | 0% | 0% |
| 5 | 5% | 2.5% | 2.5% |
| 12 | 12% | 6% | 6% |
| 18 | 18% | 9% | 9% |
| 28 | 28% | 14% | 14% |

---

## Context-Aware Rules

1. **ITEM** after **CATEGORY** → inherits that category
2. **VARIANT** after **ITEM** → belongs to that item
3. **ADDON** after **ADDON_GROUP** → belongs to that group

Or specify explicitly using Category/Item/Group columns.

---

## Validation

- Category names must be unique
- Item names must be unique  
- Valid FoodType: `veg`, `nonveg`, `egg`
- Prices must be ≥ 0
- Parent category must exist before subcategory

---

## Duplicate Handling

- **Existing categories** → Skipped
- **Existing items** → Skipped
- **Existing addon groups** → Skipped
- **Kitchen stations** → Created if not exists

---

## Response Example

```json
{
  "success": true,
  "message": "Bulk upload completed successfully",
  "data": {
    "created": {
      "categories": 3,
      "items": 10,
      "variants": 5,
      "addonGroups": 2,
      "addons": 6
    },
    "skipped": {
      "categories": 1,
      "items": 0,
      "variants": 0,
      "addonGroups": 0,
      "addons": 0
    },
    "errors": []
  }
}
```
